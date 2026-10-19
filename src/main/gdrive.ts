// Folder aplikacji na Dysku Google, obsługiwany bezpośrednio przez interfejs Dysku (po zalogowaniu),
// bez programu „Dysk Google na komputer”. Układ danych jest ten sam co w folderze na dysku i na telefonie:
//   <folder aplikacji>/nabozenstwa/<data> <tytuł> (<id>)/nabozenstwo.json + pliki/
//   <folder aplikacji>/piesni/baza-piesni.json
// Funkcje zwracają to samo co ich odpowiedniki dla folderu na dysku, więc reszta aplikacji się nie zmienia.
import { app, shell, safeStorage } from 'electron'
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import CONFIG from './google-config'

// KNS_DRIVE_BASE: tylko do testów automatycznych (podstawiony serwer zamiast Google).
const TEST_BASE = process.env.KNS_DRIVE_BASE || ''
const API = (TEST_BASE || 'https://www.googleapis.com') + '/drive/v3'
const UPLOAD = (TEST_BASE || 'https://www.googleapis.com') + '/upload/drive/v3'
const TOKEN = TEST_BASE ? TEST_BASE + '/token' : 'https://oauth2.googleapis.com/token'
const FOLDER = 'application/vnd.google-apps.folder'
const SIMPLE_LIMIT = 5 * 1024 * 1024 // większe pliki idą „wznawialnym” wysyłaniem

export default function createGoogleDrive({ serviceFolderName, safeId }) {
  const authFile = () => path.join(app.getPath('userData'), 'google-auth.bin')
  const cacheDir = () => path.join(app.getPath('userData'), 'dysk-google')
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
  const needLogin = () => Object.assign(new Error('Logowanie do Google wygasło — zaloguj się ponownie.'), { needLogin: true })

  /* ---------- logowanie (zapamiętane, zaszyfrowane kontem Windows) ---------- */
  let auth = null // { refresh, access, expires, email, id, idExpires } — id: token tożsamości dla bazy danych
  function loadAuth() {
    try {
      const raw = fs.readFileSync(authFile())
      auth = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString())
    } catch { auth = null }
  }
  function saveAuth() {
    const json = JSON.stringify(auth)
    fs.writeFileSync(authFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : json)
  }
  loadAuth()

  async function tokenRequest(params) {
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CONFIG.clientId, client_secret: CONFIG.clientSecret, ...params }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok && !CONFIG.clientSecret && /client_secret/.test(data.error_description || '')) {
      throw new Error('Brak „Client secret” klienta Google w electron/google-config.cjs.')
    }
    if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || 'Logowanie nie powiodło się.'), { code: data.error })
    return data
  }

  async function accessToken() {
    if (!auth?.refresh) throw needLogin()
    if (auth.access && auth.expires > Date.now() + 60000) return auth.access
    let data
    try { data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh }) } catch (e) {
      // W trybie testowym Google unieważnia logowanie po 7 dniach.
      if (e.code === 'invalid_grant') { auth = { email: auth.email }; saveAuth(); throw needLogin() }
      throw e
    }
    auth.access = data.access_token
    auth.expires = Date.now() + (Number(data.expires_in) || 3600) * 1000
    if (data.id_token) { auth.id = data.id_token; auth.idExpires = auth.expires }
    saveAuth()
    return auth.access
  }
  // Token tożsamości Google — do zalogowania w bazie danych (Supabase) tym samym kontem.
  // Logowanie sprzed bazy nie obejmowało tożsamości — wtedy trzeba zalogować się raz ponownie.
  async function idToken() {
    if (!auth?.refresh) throw needLogin()
    if (auth.id && auth.idExpires > Date.now() + 5 * 60000) return { idToken: auth.id, email: auth.email }
    auth.access = ''
    await accessToken()
    if (!auth.id) throw needLogin()
    return { idToken: auth.id, email: auth.email }
  }

  async function call(url, options: any = {}, retry = true) {
    const token = await accessToken()
    const res = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) } })
    if (res.status === 401 && retry) { auth.access = ''; return call(url, options, false) }
    if (!res.ok) throw new Error(`Dysk Google odpowiedział błędem ${res.status}.`)
    return res
  }

  // Logowanie w zwykłej przeglądarce (Google nie pozwala logować się w oknie aplikacji):
  // przeglądarka po zgodzie wraca na chwilowy adres 127.0.0.1 na tym komputerze.
  async function login() {
    if (!CONFIG.clientId && !TEST_BASE) throw new Error('Brak identyfikatora klienta Google w electron/google-config.cjs.')
    let code, redirect, verifier
    if (TEST_BASE) {
      code = 'test'; redirect = 'http://127.0.0.1'; verifier = 'test'
    } else {
      const b64 = buf => buf.toString('base64url')
      verifier = b64(crypto.randomBytes(32))
      const challenge = b64(crypto.createHash('sha256').update(verifier).digest())
      const state = b64(crypto.randomBytes(16))
      ;({ code, redirect } = await new Promise<any>((resolve, reject) => {
        let port = 0
        let done = false
        const server = http.createServer((req, res) => {
          const url = new URL(req.url, 'http://127.0.0.1')
          if (url.pathname !== '/' || done) { res.writeHead(404).end(); return }
          done = true
          const ok = url.searchParams.get('state') === state && url.searchParams.get('code')
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>Kościół Na Skale</title>
<body style="font:18px system-ui;background:#0f1013;color:#f4eee6;display:grid;place-items:center;height:90vh;text-align:center">
<div>${ok ? '<h2>Zalogowano ✓</h2><p>Możesz zamknąć tę kartę i wrócić do aplikacji.</p>' : '<h2>Logowanie przerwane</h2><p>Wróć do aplikacji i spróbuj ponownie.</p>'}</div>`)
          clearTimeout(timer)
          server.close()
          // Odpowiedź Google bez kodu (np. „Anuluj”) ma pole error.
          ok ? resolve({ code: url.searchParams.get('code'), redirect: `http://127.0.0.1:${port}` })
            : reject(new Error(url.searchParams.get('error') === 'access_denied' ? 'Logowanie anulowane.' : 'Logowanie przerwane.'))
        })
        const timer = setTimeout(() => { server.close(); reject(new Error('Logowanie nie zostało dokończone w ciągu 5 minut.')) }, 5 * 60000)
        server.listen(0, '127.0.0.1', () => {
          port = (server.address() as any).port
          const params = new URLSearchParams({
            client_id: CONFIG.clientId, redirect_uri: `http://127.0.0.1:${port}`, response_type: 'code',
            scope: 'openid email profile https://www.googleapis.com/auth/drive', code_challenge: challenge, code_challenge_method: 'S256',
            access_type: 'offline', prompt: 'consent', state, ...(auth?.email ? { login_hint: auth.email } : {}),
          })
          shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + params)
        })
      }))
    }
    const data = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect })
    auth = { refresh: data.refresh_token, access: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000, email: auth?.email || '',
      id: data.id_token || '', idExpires: Date.now() + (Number(data.expires_in) || 3600) * 1000 }
    try { auth.email = (await (await call(`${API}/about?fields=user(emailAddress)`)).json()).user.emailAddress } catch { /* tylko informacja */ }
    saveAuth()
    ids = null
    return { email: auth.email }
  }

  function logout() {
    auth = null
    ids = null
    fs.rmSync(authFile(), { force: true })
  }
  const status = () => ({ loggedIn: !!auth?.refresh, email: auth?.email || '' })

  /* ---------- pliki na Dysku ---------- */
  async function list(query) {
    const all = []
    let page = ''
    do {
      const res = await (await call(`${API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,parents,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + page : ''}`)).json()
      all.push(...(res.files || []))
      page = res.nextPageToken || ''
    } while (page)
    return all
  }
  const readJson = async id => (await call(`${API}/files/${id}?alt=media&supportsAllDrives=true`)).json()
  const patchMeta = (id, body) => call(`${API}/files/${id}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const createMeta = async meta => (await call(`${API}/files?supportsAllDrives=true&fields=id,modifiedTime`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json()
  const createFolder = async (name, parent) => (await createMeta({ name, mimeType: FOLDER, parents: [parent] })).id

  // Wysyła zawartość pliku; duże pliki (prezentacje, filmy) przez sesję wznawialną.
  async function upload(id, body, type = 'application/octet-stream') {
    if (body.length <= SIMPLE_LIMIT) {
      return (await call(`${UPLOAD}/files/${id}?uploadType=media&supportsAllDrives=true&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': type }, body })).json()
    }
    const session = await call(`${UPLOAD}/files/${id}?uploadType=resumable&supportsAllDrives=true&fields=id,modifiedTime`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(body.length) }, body: '{}',
    })
    const location = session.headers.get('location')
    return (await call(location, { method: 'PUT', headers: { 'Content-Type': type }, body })).json()
  }
  const writeJson = (id, data) => upload(id, Buffer.from(JSON.stringify(data)), 'application/json')

  async function download(id, dest) {
    const res = await call(`${API}/files/${id}?alt=media&supportsAllDrives=true`)
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(dest + '.part'))
    await fs.promises.rename(dest + '.part', dest)
  }

  /* ---------- folder aplikacji ---------- */
  let ids = null // { root, services, songs }
  const subfolder = async (parent, name) => (await list(`${q(parent)} in parents and name=${q(name)} and mimeType='${FOLDER}' and trashed=false`))[0]?.id
  async function folders() {
    if (ids) return ids
    let root = CONFIG.folderId
    if (!root) {
      const found = await list(`name=${q(CONFIG.folderName)} and mimeType='${FOLDER}' and trashed=false`)
      if (!found.length) throw new Error(`Konto ${auth?.email || ''} nie ma dostępu do folderu „${CONFIG.folderName}”. Poproś o jego udostępnienie (jako Edytor).`)
      root = found[0].id
    }
    ids = {
      root,
      services: await subfolder(root, CONFIG.servicesFolder) || await createFolder(CONFIG.servicesFolder, root),
      songs: await subfolder(root, CONFIG.songsFolder) || await createFolder(CONFIG.songsFolder, root),
    }
    return ids
  }

  /* ---------- nabożeństwa ---------- */
  const index = new Map() // id nabożeństwa → { folderId, fileId, name }
  const jsonCache = new Map() // id pliku → { modified, payload }
  const remote = new Map() // ścieżka lokalnej kopii załącznika → { folderId (podfolder „pliki”), name }
  const localCopy = (serviceId, name) => path.join(cacheDir(), serviceId, name)

  // Dwa zapytania na całą listę: foldery nabożeństw i wszystkie pliki „nabozenstwo.json”;
  // pobierane są tylko te, które zmieniły się od ostatniego razu.
  async function readServices() {
    const { services } = await folders()
    const svcFolders = await list(`${q(services)} in parents and mimeType='${FOLDER}' and trashed=false`)
    const byId = new Map(svcFolders.map(f => [f.id, f]))
    const jsons = (await list(`name='nabozenstwo.json' and trashed=false`)).filter(f => f.parents?.some(p => byId.has(p)))
    const result = []
    index.clear()
    await Promise.all(jsons.map(async file => {
      let cached = jsonCache.get(file.id)
      if (!cached || cached.modified !== file.modifiedTime) { cached = { modified: file.modifiedTime, payload: await readJson(file.id) }; jsonCache.set(file.id, cached) }
      const payload = JSON.parse(JSON.stringify(cached.payload))
      const svc = payload.service
      if (!safeId(svc?.id)) return
      const folder = byId.get(file.parents.find(p => byId.has(p)))
      index.set(svc.id, { folderId: folder.id, fileId: file.id, name: folder.name })
      // Załączniki: ścieżka lokalnej kopii; sam plik pobierany jest dopiero, gdy jest potrzebny.
      svc.files = (svc.files || []).filter(f => typeof f.path === 'string' && f.path.startsWith('pliki/')).map(f => {
        const local = localCopy(svc.id, path.basename(f.path))
        remote.set(local, { folderId: folder.id, name: path.basename(f.path) })
        return { ...f, path: local }
      })
      result.push(payload)
    }))
    // Życie kościoła (szablony i wydarzenia z telefonu) — błąd tutaj nie zatrzymuje synchronizacji nabożeństw.
    const church = await readChurch().catch(e => { if (e.needLogin) throw e; return {} })
    return { list: result, ...church }
  }

  // Szablony rodzajów wydarzeń (program nabożeństwa) i wydarzenia z ostatnich 120 dni i przyszłe.
  async function readChurch() {
    const { root } = await folders()
    const cached = async file => {
      let c = jsonCache.get(file.id)
      if (!c || c.modified !== file.modifiedTime) { c = { modified: file.modifiedTime, payload: await readJson(file.id) }; jsonCache.set(file.id, c) }
      return JSON.parse(JSON.stringify(c.payload))
    }
    const [tplDir, evDir, newsDir] = await Promise.all([subfolder(root, 'szablony'), subfolder(root, 'wydarzenia'), subfolder(root, 'ogloszenia')])
    let announcements = []
    if (newsDir) {
      const [file] = await list(`${q(newsDir)} in parents and name='ogloszenia.json' and trashed=false`)
      if (file) announcements = (await cached(file)).items || []
    }
    let templates = null
    if (tplDir) {
      const [file] = await list(`${q(tplDir)} in parents and name='szablony.json' and trashed=false`)
      if (file) templates = (await cached(file)).types || null
    }
    const events = []
    if (evDir) {
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
      const dirs = new Set((await list(`${q(evDir)} in parents and mimeType='${FOLDER}' and trashed=false`))
        .filter(d => !/^\d{4}-\d{2}-\d{2}/.test(d.name) || d.name.slice(0, 10) >= since).map(d => d.id))
      const jsons = dirs.size ? (await list(`name='wydarzenie.json' and trashed=false`)).filter(f => f.parents?.some(p => dirs.has(p))) : []
      await Promise.all(jsons.map(async f => { const ev = (await cached(f)).event; if (ev?.id) events.push(ev) }))
    }
    return { templates, events, announcements }
  }

  // Folder nabożeństwa na Dysku po identyfikatorze w nazwie „<data> <tytuł> (<id>)” (gdy dane są w bazie).
  async function indexFolders() {
    const { services } = await folders()
    for (const f of await list(`${q(services)} in parents and mimeType='${FOLDER}' and trashed=false`)) {
      const id = /\(([^()]+)\)$/.exec(f.name)?.[1]
      if (id && !index.has(id)) index.set(id, { folderId: f.id, fileId: null, name: f.name })
    }
  }
  // Baza danych: załączniki nabożeństw (ścieżki „pliki/…”) → lokalne kopie; pobierane dopiero przy wczytaniu.
  async function mapFiles(list) {
    await indexFolders()
    return { services: (list || []).map(({ id, files }) => {
      const entry = index.get(id)
      return { id, files: (files || []).filter(f => typeof f.path === 'string' && f.path.startsWith('pliki/')).map(f => {
        const local = localCopy(id, path.basename(f.path))
        if (entry) remote.set(local, { folderId: entry.folderId, name: path.basename(f.path) })
        return { ...f, path: local }
      }) }
    }) }
  }
  // Baza danych: wysyła załączniki nabożeństwa na Dysk; zwraca lokalne ścieżki i ścieżki „pliki/…” do bazy.
  async function storeFiles(svc) {
    if (!safeId(svc?.id)) return { error: 'Nieprawidłowe nabożeństwo.' }
    if (!index.has(svc.id)) await indexFolders()
    const { files, kept } = await serviceFiles(svc)
    return { files, kept }
  }
  async function serviceFiles(svc) {
    const { services } = await folders()
    const name = serviceFolderName(svc)
    let entry = index.get(svc.id)
    if (!entry) { entry = { folderId: await createFolder(name, services), fileId: null, name }; index.set(svc.id, entry) }
    else if (entry.name !== name) { await patchMeta(entry.folderId, { name }); entry.name = name }
    const filesDir = await subfolder(entry.folderId, 'pliki') || await createFolder('pliki', entry.folderId)
    const existing = await list(`${q(filesDir)} in parents and trashed=false`)
    const files = [], kept = []
    for (const f of svc.files || []) {
      if (typeof f.path !== 'string') continue
      const fileName = path.basename(f.path)
      const local = localCopy(svc.id, fileName)
      const onDrive = existing.find(e => e.name === fileName)
      const localSize = fs.existsSync(f.path) ? (await fs.promises.stat(f.path)).size : -1
      if (!onDrive && localSize < 0) continue
      if (!onDrive || (localSize >= 0 && Number(onDrive.size) !== localSize)) {
        const fileId = onDrive ? onDrive.id : (await createMeta({ name: fileName, parents: [filesDir] })).id
        if (!onDrive) existing.push({ id: fileId, name: fileName })
        await upload(fileId, await fs.promises.readFile(f.path))
      }
      // Lokalna kopia — żeby rzutnik nie musiał pobierać pliku, który właśnie stąd wysłano.
      if (fs.existsSync(f.path) && path.resolve(f.path) !== path.resolve(local) && !fs.existsSync(local)) {
        await fs.promises.mkdir(path.dirname(local), { recursive: true })
        await fs.promises.copyFile(f.path, local)
      }
      remote.set(local, { folderId: entry.folderId, name: fileName })
      files.push({ key: f.key, path: local })
      kept.push({ ...f, path: 'pliki/' + fileName })
    }
    for (const e of existing) if (!kept.some(k => path.basename(k.path) === e.name)) await patchMeta(e.id, { trashed: true })
    return { entry, files, kept }
  }
  async function writeService(payload) {
    const svc = payload.service
    if (!safeId(svc?.id)) return { error: 'Nieprawidłowe nabożeństwo.' }
    const { entry, files, kept } = await serviceFiles(svc)
    const data = { ...payload, service: { ...svc, files: kept } }
    if (entry.fileId) await writeJson(entry.fileId, data)
    else { entry.fileId = (await createMeta({ name: 'nabozenstwo.json', parents: [entry.folderId] })).id; index.set(svc.id, entry); await writeJson(entry.fileId, data) }
    index.set(svc.id, entry)
    return { files }
  }

  async function removeService(id) {
    const entry = index.get(id)
    if (entry) await patchMeta(entry.folderId, { trashed: true })
    index.delete(id)
  }

  // Pobiera brakujące lokalne kopie załączników (np. zanim rzutnik wczyta nabożeństwo).
  async function ensureFiles(paths) {
    let fetched = 0
    for (const p of paths || []) {
      if (typeof p !== 'string' || fs.existsSync(p)) continue
      const info = remote.get(p)
      if (!info) continue
      const filesDir = await subfolder(info.folderId, 'pliki')
      const file = filesDir && (await list(`${q(filesDir)} in parents and name=${q(info.name)} and trashed=false`))[0]
      if (!file) continue
      await download(file.id, p)
      fetched++
    }
    return { fetched }
  }

  /* ---------- import pieśni z folderu na Dysku (np. pieśni z OpenSong) ---------- */
  // Wszystkie zwykłe pliki z folderu i jego podfolderów: [{ name, data: Buffer }]. Pliki Google (Dokumenty itp.)
  // i duże pliki są pomijane. progress(done, total) — do paska postępu.
  async function folderFiles(folderId, progress: (done: number, total: number) => void = () => {}) {
    const found = []
    const queue = [folderId]
    const seen = new Set()
    while (queue.length) {
      const id = queue.shift()
      if (seen.has(id)) continue
      seen.add(id)
      for (const f of await list(`${q(id)} in parents and trashed=false`)) {
        if (f.mimeType === FOLDER) queue.push(f.id)
        else if (!f.mimeType.startsWith('application/vnd.google-apps') && Number(f.size || 0) <= 3 * 1024 * 1024) found.push(f)
      }
    }
    const out = []
    let done = 0
    // Po kilka naraz — setki małych plików pobierają się szybko, a Dysk nie odrzuca zapytań.
    const worker = async () => {
      while (found.length) {
        const f = found.shift()
        try { out.push({ name: f.name, data: Buffer.from(await (await call(`${API}/files/${f.id}?alt=media&supportsAllDrives=true`)).arrayBuffer()) }) } catch (e) { if (e.needLogin) throw e }
        progress(++done, done + found.length)
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
    return out
  }

  /* ---------- baza pieśni ---------- */
  let songsFileId = ''
  async function readSongs(known) {
    const { songs } = await folders()
    const file = (await list(`${q(songs)} in parents and name='baza-piesni.json' and trashed=false`))[0]
    if (!file) { songsFileId = ''; return { songs: [], deleted: {}, mtime: 0 } }
    songsFileId = file.id
    if (known && known === file.modifiedTime) return { unchanged: true, mtime: file.modifiedTime }
    return { ...(await readJson(file.id)), mtime: file.modifiedTime }
  }
  async function writeSongs(data) {
    const { songs } = await folders()
    if (!songsFileId) songsFileId = (await createMeta({ name: 'baza-piesni.json', parents: [songs] })).id
    const res = await writeJson(songsFileId, data)
    return { mtime: res.modifiedTime }
  }

  return { login, logout, status, readServices, writeService, removeService, ensureFiles, readSongs, writeSongs, folderFiles, idToken, mapFiles, storeFiles }
}
