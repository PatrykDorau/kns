// Dostęp do folderu aplikacji na Dysku Google — te same pliki, z których korzysta aplikacja na komputerze:
//   <folder aplikacji>/nabozenstwa/<data> <tytuł> (<id>)/nabozenstwo.json   — jedno nabożeństwo
//   <folder aplikacji>/piesni/baza-piesni.json                              — wspólna baza pieśni
//   <folder aplikacji>/wydarzenia/<data> <tytuł> (<id>)/wydarzenie.json      — inne wydarzenia (spotkania itd.)
//   <folder aplikacji>/szablony/szablony.json                               — typy wydarzeń i ich szablony
//   <folder aplikacji>/ogloszenia/ogloszenia.json                           — ogłoszenia (goście, członkowie)
//   KNS Nabo — Rada/ogloszenia.json                                         — ogłoszenia tylko dla rady
//   KNS Nabo — Protokoły/<data> <tytuł> (<id>)/protokol.json                 — protokoły spotkań członkowskich
//   KNS Nabo — Rada/protokoly/<data> <tytuł> (<id>)/protokol.json            — protokoły rady zboru
// Folder aplikacji i nazwy podfolderów są w config.js.
// W trybie pokazowym (?demo) zamiast Dysku jest pamięć przeglądarki — do oglądania strony bez logowania.

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
const SCOPE = 'https://www.googleapis.com/auth/drive'
// Sama tożsamość (adres e-mail, imię) — wystarcza osobie, która czeka na zatwierdzenie.
const IDENTITY = 'openid email profile'

import { eventFolderName } from './church.ts'

export const uid = () => Math.random().toString(36).slice(2, 10)
const EVENTS = 'wydarzenia', TEMPLATES = 'szablony', NEWS = 'ogloszenia'
// Wydarzenia starsze niż tyle dni nie są wczytywane (nazwa folderu zaczyna się od daty) — lista nie rośnie bez końca.
const EVENTS_BACK = 120

// Załączniki: te same rodzaje co na komputerze (zdjęcie, film, PDF, prezentacja).
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const SLIDES = 'application/vnd.google-apps.presentation'
export const ACCEPT = 'image/*,video/*,application/pdf,.pdf,.ppt,.pptx'
export function fileType(mime = '', name = '') {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (mime === PPTX || mime === SLIDES || mime === 'application/vnd.ms-powerpoint' || /\.pptx?$/i.test(name)) return 'pptx'
  return ''
}
const baseName = name => name.replace(/\.[^.]+$/, '')
const safeName = name => String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'plik'
export function folderName(svc) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(svc.date || '') ? svc.date : 'bez-daty'
  const title = String(svc.sermonTitle || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/[. ]+$/, '')
  return date + (title ? ' ' + title : '') + ' (' + svc.id + ')'
}

/* ---------- Dysk Google ---------- */
const quote = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"

// Logowanie jest pamiętane w telefonie (Google wydaje dostęp na około godzinę), więc przeładowanie
// strony nie wylogowuje. Po wygaśnięciu wystarczy jedno dotknięcie — konto jest już podpowiedziane.
const AUTH_KEY = 'kns-auth'
function readAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {} } catch { return {} } }
function writeAuth(auth) { try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)) } catch { /* tryb prywatny */ } }

export function createDrive(config) {
  const clientId = config.clientId
  const saved = readAuth()
  let token = saved.expires > Date.now() + 60000 ? saved.token : ''
  let email = saved.email || ''
  // Zakresy wydanego dostępu; starsze zapisy (sprzed kont) miały zawsze dostęp do Dysku.
  let scope = saved.scope || SCOPE
  let client = null
  let baseId = '' // podfolder z nabożeństwami
  let rootFolder = '', songsDirId = '', songsFileId = '' // baza pieśni: <folder aplikacji>/piesni/baza-piesni.json
  const folders = new Map() // id nabożeństwa → { folderId, fileId, name }
  const eventFolders = new Map() // id wydarzenia → { folderId, fileId, name }
  let eventsDirId = '', templatesDirId = '', templatesFileId = ''
  const protoDirs = {} // rodzaj ('czlonkowskie' | 'rada') → folder z protokołami
  const protoIndex = new Map() // id protokołu → { folderId, fileId, name }
  let newsDirId = '', councilRootId = null // null — jeszcze nie sprawdzano; '' — brak dostępu do folderu rady

  async function call(url, options: any = {}) {
    const res = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) } })
    if (res.status === 401) { token = ''; writeAuth({ email }); throw Object.assign(new Error('Sesja wygasła — zaloguj się ponownie.'), { auth: true }) }
    if (res.status === 403 && (options.method || 'GET') !== 'GET') throw new Error('Nie masz uprawnień do zmian w folderze aplikacji — poproś administratora o odpowiednią rangę.')
    if (!res.ok) throw new Error('Dysk Google odpowiedział błędem ' + res.status + '.')
    return res
  }
  const list = async q => (await (await call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json()).files

  // Folder nabożeństwa i jego podfolder „pliki” — tworzone od razu przy pierwszym załączniku.
  async function filesFolder(svc) {
    let entry = folders.get(svc.id)
    if (!entry) {
      // Folder tego nabożeństwa mógł już powstać (na komputerze albo wcześniej) — szukamy po identyfikatorze w nazwie.
      const found = (await list(`${quote(baseId)} in parents and name contains ${quote('(' + svc.id + ')')} and mimeType='${FOLDER}' and trashed=false`))[0]
      const name = folderName(svc)
      entry = found ? { folderId: found.id, fileId: null, name: found.name } : { folderId: (await create({ name, mimeType: FOLDER, parents: [baseId] })).id, fileId: null, name }
      folders.set(svc.id, entry)
    }
    if (!entry.filesId) {
      entry.filesId = (await list(`${quote(entry.folderId)} in parents and name='pliki' and mimeType='${FOLDER}' and trashed=false`))[0]?.id ||
        (await create({ name: 'pliki', mimeType: FOLDER, parents: [entry.folderId] })).id
    }
    return entry
  }
  // Nazwa pliku jeszcze niezajęta w „pliki” (np. „slajdy (2).pptx”).
  async function freeName(entry, name) {
    const taken = new Set((await list(`${quote(entry.filesId)} in parents and trashed=false`)).map(f => f.name))
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : ''
    let candidate = name
    for (let n = 2; taken.has(candidate); n++) candidate = `${stem} (${n})${ext}`
    return candidate
  }
  // Wysyłanie „wznawialne” (filmy bywają duże), z postępem.
  async function uploadBlob(entry, name, blob, onProgress) {
    const init = await call(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type || 'application/octet-stream', 'X-Upload-Content-Length': String(blob.size) },
      body: JSON.stringify({ name, parents: [entry.filesId] }),
    })
    const url = init.headers.get('Location')
    if (!url) throw new Error('Dysk Google nie przyjął pliku.')
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('Wysyłanie nie powiodło się (' + xhr.status + ').')))
      xhr.onerror = () => reject(new Error('Wysyłanie przerwane — sprawdź internet.'))
      xhr.send(blob)
    })
  }
  // Pliki w „pliki”, do których nabożeństwo już się nie odwołuje (usunięte załączniki), idą do kosza.
  async function cleanFiles(entry, files) {
    const dir = entry.filesId || (await list(`${quote(entry.folderId)} in parents and name='pliki' and mimeType='${FOLDER}' and trashed=false`))[0]?.id
    if (!dir) return
    entry.filesId = dir
    const keep = new Set((files || []).map(f => String(f.path || '').replace(/^pliki\//, '')))
    for (const f of await list(`${quote(dir)} in parents and trashed=false`)) if (!keep.has(f.name)) await patch(f.id, { trashed: true })
  }
  // Wydarzenia (ostatnie EVENTS_BACK dni i przyszłe) oraz szablony.
  async function loadExtra(subfolder) {
    const [eventsDir, templatesDir, newsDir, councilRoot] = await Promise.all([subfolder(EVENTS), subfolder(TEMPLATES), subfolder(NEWS), councilFolder()])
    eventsDirId = eventsDir || ''; templatesDirId = templatesDir || ''; newsDirId = newsDir || ''
    const newsFile = async (dir, audience?) => {
      const [file] = dir ? await list(`${quote(dir)} in parents and name='ogloszenia.json' and trashed=false`) : []
      const data = file ? await read(file.id).catch(e => { if (e.auth) throw e; return null }) : null
      return (data?.items || []).map(a => (audience ? { ...a, audience } : a))
    }
    const newsPromise = Promise.all([newsFile(newsDir), newsFile(councilRoot, 'council')])
    const since = new Date(Date.now() - EVENTS_BACK * 86400000).toISOString().slice(0, 10)
    const [eventDirs, templateFile] = await Promise.all([
      eventsDir ? list(`${quote(eventsDir)} in parents and mimeType='${FOLDER}' and trashed=false`) : [],
      templatesDir ? list(`${quote(templatesDir)} in parents and name='szablony.json' and trashed=false`).then(f => f[0]) : null,
    ])
    templatesFileId = templateFile?.id || ''
    const templates = templateFile ? await read(templateFile.id).catch(e => { if (e.auth) throw e; return null }) : null
    eventFolders.clear()
    const events = []
    await Promise.all(eventDirs.filter(d => !/^\d{4}-\d{2}-\d{2}/.test(d.name) || d.name.slice(0, 10) >= since).map(async folder => {
      try {
        const [file] = await list(`'${folder.id}' in parents and name='wydarzenie.json' and trashed=false`)
        if (!file) return
        const payload = await read(file.id)
        if (!payload.event?.id) return
        eventFolders.set(payload.event.id, { folderId: folder.id, fileId: file.id, name: folder.name })
        events.push(payload.event)
      } catch (e) { if (e.auth) throw e }
    }))
    const [news, councilNews] = await newsPromise
    return { events, templates: templates?.types || null, templatesUpdated: templates?.updated || 0, announcements: [...news, ...councilNews] }
  }
  // Folder rady (osobny, najwyższego poziomu) — widzą go tylko rada, pastor i administrator.
  async function councilFolder() {
    if (councilRootId !== null) return councilRootId
    const [found] = await list(`name=${quote(config.councilFolder || 'KNS Nabo — Rada')} and mimeType='${FOLDER}' and trashed=false`)
    return (councilRootId = found?.id || '')
  }
  // Plik ogłoszeń, do którego trafia ogłoszenie: rada — w folderze rady, reszta — w folderze aplikacji.
  async function newsTarget(audience) {
    if (audience === 'council') {
      const dir = await councilFolder()
      if (!dir) throw new Error('Nie masz dostępu do folderu rady zboru.')
      return dir
    }
    if (!newsDirId) newsDirId = (await create({ name: NEWS, mimeType: FOLDER, parents: [rootFolder] })).id
    return newsDirId
  }
  // Zmiana jednego ogłoszenia: plik czytany na świeżo, żeby nie skasować ogłoszeń dodanych w międzyczasie.
  async function changeNews(audience, change) {
    const dir = await newsTarget(audience)
    const [file] = await list(`${quote(dir)} in parents and name='ogloszenia.json' and trashed=false`)
    const data = file ? await read(file.id) : { items: [] }
    data.items = change(data.items || [])
    data.updated = Date.now()
    if (file) await write(file.id, data)
    else await create({ name: 'ogloszenia.json', parents: [dir] }, data)
  }
  // Folder protokołów: osobny folder najwyższego poziomu konta kościoła, udostępniony według rang.
  async function protocolsDir(kind) {
    if (protoDirs[kind]) return protoDirs[kind]
    const council = kind === 'rada'
    const name = council ? config.councilFolder || 'KNS Nabo — Rada' : config.protocolsFolder || 'KNS Nabo — Protokoły'
    const [found] = await list(`name=${quote(name)} and mimeType='${FOLDER}' and trashed=false`)
    if (!found) throw Object.assign(new Error(council ? 'Nie masz dostępu do folderu rady zboru.' : `Nie ma jeszcze folderu „${name}” albo nie masz do niego dostępu.`), { noAccess: true })
    let dir = found.id
    if (council) dir = (await list(`${quote(dir)} in parents and name='protokoly' and mimeType='${FOLDER}' and trashed=false`))[0]?.id || (await create({ name: 'protokoly', mimeType: FOLDER, parents: [dir] })).id
    return (protoDirs[kind] = dir)
  }
  const read = async id => (await call(`${API}/files/${id}?alt=media&supportsAllDrives=true`)).json()
  const write = (id, data) => call(`${UPLOAD}/files/${id}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  const patch = (id, body) => call(`${API}/files/${id}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  async function create(meta, data?) {
    if (data === undefined) return (await call(`${API}/files?supportsAllDrives=true&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json()
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }))
    return (await call(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, { method: 'POST', body: form })).json()
  }

  return {
    demo: false,
    signedIn: () => !!token,
    account: () => email,
    accessToken: () => token,
    // Czy wydany dostęp obejmuje Dysk (osoba czekająca na zatwierdzenie loguje się tylko tożsamością).
    hasDrive: () => !!token && scope.split(' ').includes(SCOPE),
    // choose — pokaż wybór konta (pierwsze logowanie, „inne konto”); bez niego Google loguje po cichu
    // ostatnim kontem, co jest wygodne przy odnawianiu sesji.
    // access — 'drive' (Dysk; z serwerem kont także tożsamość), 'identity' (tylko adres i imię).
    signIn: (choose = false, access = 'drive') => new Promise<void>((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) return reject(new Error('Nie udało się wczytać logowania Google — sprawdź internet.'))
      const wanted = access === 'identity' ? IDENTITY : config.apiUrl ? IDENTITY + ' ' + SCOPE : SCOPE
      client = client || window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: wanted, callback: () => {} })
      client.callback = async res => {
        if (res.error) return reject(new Error('Logowanie nie powiodło się.'))
        token = res.access_token
        scope = res.scope || wanted
        const expires = Date.now() + (Number(res.expires_in) || 3600) * 1000
        try {
          email = scope.includes('email')
            ? (await (await call('https://www.googleapis.com/oauth2/v3/userinfo')).json()).email
            : (await (await call(`${API}/about?fields=user(emailAddress)`)).json()).user.emailAddress
        } catch { /* adres to tylko podpowiedź */ }
        writeAuth({ token, expires, email, scope })
        resolve()
      }
      client.error_callback = e => reject(new Error(e?.type === 'popup_closed' ? 'Logowanie przerwane — okno Google zostało zamknięte.' : e?.type === 'popup_failed_to_open' ? 'Przeglądarka zablokowała okno logowania — zezwól na wyskakujące okna dla tej strony.' : 'Logowanie przerwane.'))
      client.requestAccessToken({ scope: wanted, ...(choose || !email ? { prompt: 'select_account' } : { prompt: '', login_hint: email }) })
    }),
    // Zapomina konto — następne logowanie pokaże wybór konta.
    forget() { token = ''; email = ''; writeAuth({}) },
    signOut() {
      if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {})
      token = ''; email = ''
      writeAuth({})
    },
    // Tylko foldery potrzebne do załączników (gdy dane są w bazie, a pliki na Dysku).
    async prepareFiles() {
      if (baseId) return
      let rootId = config.folderId
      if (rootId) {
        try { await call(`${API}/files/${rootId}?fields=id&supportsAllDrives=true`) } catch (e) {
          if (e.auth) throw e
          throw new Error(`To konto Google (${email || 'zalogowane'}) nie ma dostępu do folderu „${config.folderName}” na Dysku — załączniki trafiają właśnie tam. Poproś administratora o dostęp (ranga z prawem edycji).`)
        }
      } else {
        const [found] = await list(`name=${quote(config.folderName)} and mimeType='${FOLDER}' and trashed=false`)
        if (!found) throw new Error(`To konto Google nie ma dostępu do folderu „${config.folderName}” na Dysku — załączniki trafiają właśnie tam.`)
        rootId = found.id
      }
      rootFolder = rootId
      baseId = (await list(`${quote(rootId)} in parents and name=${quote(config.servicesFolder)} and mimeType='${FOLDER}' and trashed=false`))[0]?.id ||
        (await create({ name: config.servicesFolder, mimeType: FOLDER, parents: [rootId] })).id
    },
    async load() {
      // Folder aplikacji: po identyfikatorze z config.js, a gdy go nie ma — po nazwie.
      let rootId = config.folderId
      if (rootId) {
        try { await call(`${API}/files/${rootId}?fields=id&supportsAllDrives=true`) } catch (e) {
          if (e.auth) throw e
          throw new Error('To konto nie ma dostępu do folderu aplikacji z ustawień. Poproś o jego udostępnienie (jako Edytor).')
        }
      } else {
        const roots = await list(`name=${quote(config.folderName)} and mimeType='${FOLDER}' and trashed=false`)
        if (!roots.length) throw new Error(`Na Dysku tego konta nie ma folderu „${config.folderName}”. Musi być w „Mój dysk” albo udostępniony temu kontu.`)
        rootId = roots[0].id
      }
      const subfolder = async name => (await list(`${quote(rootId)} in parents and name=${quote(name)} and mimeType='${FOLDER}' and trashed=false`))[0]?.id
      baseId = await subfolder(config.servicesFolder) || (await create({ name: config.servicesFolder, mimeType: FOLDER, parents: [rootId] })).id
      const songsDir = await subfolder(config.songsFolder)
      const songsFile = songsDir ? (await list(`${quote(songsDir)} in parents and name='baza-piesni.json' and trashed=false`))[0] : null
      rootFolder = rootId; songsDirId = songsDir || ''; songsFileId = songsFile?.id || ''
      const songs = songsFile ? (await read(songsFile.id)).songs || [] : []
      const [children, extra] = await Promise.all([list(`${quote(baseId)} in parents and mimeType='${FOLDER}' and trashed=false`), loadExtra(subfolder)])
      folders.clear()
      const services = []
      await Promise.all(children.map(async folder => {
        try {
          const [file] = await list(`'${folder.id}' in parents and name='nabozenstwo.json' and trashed=false`)
          if (!file) return
          const payload = await read(file.id)
          if (!payload.service?.id) return
          folders.set(payload.service.id, { folderId: folder.id, fileId: file.id, name: folder.name })
          services.push(payload.service)
        } catch (e) { if (e.auth) throw e }
      }))
      return { services, songs, ...extra }
    },
    // Wydarzenie (spotkanie studenckie, członkowskie, rady…): jak nabożeństwo — folder z plikiem JSON.
    async saveEvent(ev, base = 0, force = false) {
      if (!eventsDirId) eventsDirId = (await create({ name: EVENTS, mimeType: FOLDER, parents: [rootFolder] })).id
      const name = eventFolderName(ev)
      let entry = eventFolders.get(ev.id)
      if (entry?.fileId && !force) {
        const remote = await read(entry.fileId)
        if ((remote.event?.updated || 0) > base) throw Object.assign(new Error('Ktoś inny zmienił to wydarzenie w międzyczasie.'), { conflict: true })
      }
      if (!entry) {
        entry = { folderId: (await create({ name, mimeType: FOLDER, parents: [eventsDirId] })).id, fileId: null, name }
        eventFolders.set(ev.id, entry)
      }
      if (entry.fileId) await write(entry.fileId, { event: ev })
      else entry.fileId = (await create({ name: 'wydarzenie.json', parents: [entry.folderId] }, { event: ev })).id
      if (entry.name !== name) { await patch(entry.folderId, { name }); entry.name = name }
    },
    async removeEvent(id) {
      const entry = eventFolders.get(id)
      if (entry) await patch(entry.folderId, { trashed: true })
      eventFolders.delete(id)
    },
    // Protokoły jednego rodzaju (wczytywane dopiero, gdy są potrzebne).
    async loadProtocols(kind) {
      const dir = await protocolsDir(kind)
      const dirs = new Map((await list(`${quote(dir)} in parents and mimeType='${FOLDER}' and trashed=false`)).map((f: any) => [f.id, f]))
      const out = []
      await Promise.all([...dirs.values()].map(async (folder: any) => {
        try {
          const [file] = await list(`'${folder.id}' in parents and name='protokol.json' and trashed=false`)
          if (!file) return
          const payload = await read(file.id)
          if (!payload.protocol?.id) return
          protoIndex.set(payload.protocol.id, { folderId: folder.id, fileId: file.id, name: folder.name })
          out.push(payload.protocol)
        } catch (e) { if (e.auth) throw e }
      }))
      return out
    },
    async saveProtocol(p, base = 0, force = false) {
      const dir = await protocolsDir(p.kind)
      const name = eventFolderName(p)
      let entry = protoIndex.get(p.id)
      if (entry?.fileId && !force) {
        const remote = await read(entry.fileId)
        if ((remote.protocol?.updated || 0) > base) throw Object.assign(new Error('Ktoś inny zmienił ten protokół w międzyczasie.'), { conflict: true })
      }
      if (!entry) {
        entry = { folderId: (await create({ name, mimeType: FOLDER, parents: [dir] })).id, fileId: null, name }
        protoIndex.set(p.id, entry)
      }
      if (entry.fileId) await write(entry.fileId, { protocol: p })
      else entry.fileId = (await create({ name: 'protokol.json', parents: [entry.folderId] }, { protocol: p })).id
      if (entry.name !== name) { await patch(entry.folderId, { name }); entry.name = name }
    },
    async removeProtocol(id) {
      const entry = protoIndex.get(id)
      if (entry) await patch(entry.folderId, { trashed: true })
      protoIndex.delete(id)
    },
    // Ogłoszenie: zapis (base — czas zmiany w chwili otwarcia; nowsza wersja na Dysku wstrzymuje zapis).
    // Zmiana odbiorców między radą a resztą przenosi ogłoszenie do drugiego pliku.
    async saveAnnouncement(item, base = 0, force = false, oldAudience = '') {
      const council = a => a === 'council'
      const { audience, ...rest } = item
      const stored = council(audience) ? rest : item
      await changeNews(audience, items => {
        const remote = items.find(x => x.id === item.id)
        if (remote && !force && (remote.updated || 0) > base) throw Object.assign(new Error('Ktoś inny zmienił to ogłoszenie w międzyczasie.'), { conflict: true })
        return [...items.filter(x => x.id !== item.id), stored]
      })
      if (oldAudience && council(oldAudience) !== council(audience)) await changeNews(oldAudience, items => items.filter(x => x.id !== item.id))
    },
    async removeAnnouncement(item) { await changeNews(item.audience, items => items.filter(x => x.id !== item.id)) },
    // Szablony typów wydarzeń — jeden plik dla wszystkich.
    async saveTemplates(types, base = 0, force = false) {
      if (!templatesDirId) templatesDirId = (await create({ name: TEMPLATES, mimeType: FOLDER, parents: [rootFolder] })).id
      if (templatesFileId && !force) {
        const remote = await read(templatesFileId)
        if ((remote.updated || 0) > base) throw Object.assign(new Error('Ktoś inny zmienił szablony w międzyczasie.'), { conflict: true })
      }
      const data = { types, updated: Date.now(), updatedBy: email }
      if (templatesFileId) await write(templatesFileId, data)
      else templatesFileId = (await create({ name: 'szablony.json', parents: [templatesDirId] }, data)).id
      return data.updated
    },
    // base — znacznik „updated” wersji, od której zaczęła się edycja. Gdy na Dysku jest nowsza
    // (ktoś zapisał w międzyczasie), zapis jest wstrzymywany, chyba że force.
    async save(payload, base = 0, force = false) {
      const svc = payload.service
      const name = folderName(svc)
      let entry = folders.get(svc.id)
      if (entry?.fileId && !force) {
        const remote = await read(entry.fileId)
        if ((remote.service?.updated || 0) > base) throw Object.assign(new Error('Ktoś inny zmienił to nabożeństwo w międzyczasie.'), { conflict: true })
      }
      if (!entry) {
        entry = { folderId: (await create({ name, mimeType: FOLDER, parents: [baseId] })).id, fileId: null, name }
        folders.set(svc.id, entry)
      }
      if (entry.fileId) await write(entry.fileId, payload)
      else entry.fileId = (await create({ name: 'nabozenstwo.json', parents: [entry.folderId] }, payload)).id
      if (entry.name !== name) { await patch(entry.folderId, { name }); entry.name = name }
      await cleanFiles(entry, svc.files)
    },
    // Zmiana w bazie pieśni: plik jest czytany na świeżo tuż przed zapisem, więc zmiany innych osób
    // w innych pieśniach zostają. Ten sam format co na komputerze: każda pieśń ma czas zmiany,
    // a usunięte są zapamiętywane, żeby nie wróciły z komputera, który jeszcze ich nie usunął.
    // base — czas zmiany pieśni w chwili otwarcia; nowsza wersja na Dysku wstrzymuje zapis (chyba że force).
    async saveSongs(change, base = 0, force = false) {
      if (!songsDirId) songsDirId = (await create({ name: config.songsFolder, mimeType: FOLDER, parents: [rootFolder] })).id
      const data = songsFileId ? await read(songsFileId) : { songs: [], deleted: {} }
      data.songs = data.songs || []; data.deleted = data.deleted || {}
      const id = change.song?.id || change.remove
      const remote = data.songs.find(x => x.id === id)
      if (change.song && !force && remote && (remote.updated || 0) > base) throw Object.assign(new Error('Ktoś inny zmienił tę pieśń w międzyczasie.'), { conflict: true, remote })
      if (change.song) {
        const song = { id, number: change.song.number || '', title: change.song.title, text: change.song.text, updated: Math.max(Date.now(), (remote?.updated || 0) + 1) }
        const i = data.songs.findIndex(x => x.id === id)
        if (i >= 0) data.songs[i] = song
        else data.songs.push(song)
        delete data.deleted[id]
      } else {
        data.songs = data.songs.filter(x => x.id !== id)
        data.deleted[id] = Date.now()
      }
      if (songsFileId) await write(songsFileId, data)
      else songsFileId = (await create({ name: 'baza-piesni.json', parents: [songsDirId] }, data)).id
      return data.songs
    },
    // Powiadomienia: każdy telefon ma plik <folder aplikacji>/powiadomienia/<id>.json z adresem powiadomień.
    // Czyta je skrypt przypomnienia w Google i przez funkcję Netlify wysyła powiadomienie.
    async savePush(id, data) {
      const dir = (await list(`${quote(rootFolder)} in parents and name='powiadomienia' and mimeType='${FOLDER}' and trashed=false`))[0]?.id ||
        (await create({ name: 'powiadomienia', mimeType: FOLDER, parents: [rootFolder] })).id
      const name = id + '.json'
      const existing = (await list(`${quote(dir)} in parents and name=${quote(name)} and trashed=false`))[0]
      if (existing) await write(existing.id, data)
      else await create({ name, parents: [dir] }, data)
    },
    async removePush(id) {
      const dir = (await list(`${quote(rootFolder)} in parents and name='powiadomienia' and mimeType='${FOLDER}' and trashed=false`))[0]?.id
      if (!dir) return
      for (const f of await list(`${quote(dir)} in parents and name=${quote(id + '.json')} and trashed=false`)) await patch(f.id, { trashed: true })
    },
    // Wyszukiwanie na Dysku zalogowanego konta (także w udostępnionych) — ostatnio zmienione najpierw.
    async searchFiles(text = '') {
      const kinds = `(mimeType contains 'image/' or mimeType contains 'video/' or mimeType='application/pdf' or mimeType='${PPTX}' or mimeType='application/vnd.ms-powerpoint' or mimeType='${SLIDES}')`
      const q = `trashed=false and ${kinds}` + (text.trim() ? ` and name contains ${quote(text.trim())}` : '')
      const res = await (await call(`${API}/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=40&fields=files(id,name,mimeType,size,thumbnailLink,modifiedTime)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`)).json()
      return res.files || []
    },
    // Kopia pliku z Dysku do folderu nabożeństwa — po stronie Google, bez pobierania na telefon.
    // Prezentacja Google trafia tam jako PowerPoint (komputer umie ją wyświetlić).
    async attachFromDrive(svc, file, onProgress) {
      const entry = await filesFolder(svc)
      if (file.mimeType === SLIDES) {
        const blob = await (await call(`${API}/files/${file.id}/export?mimeType=${encodeURIComponent(PPTX)}`)).blob()
        const name = await freeName(entry, safeName(file.name) + '.pptx')
        await uploadBlob(entry, name, new Blob([blob], { type: PPTX }), onProgress)
        return { key: uid(), path: 'pliki/' + name, name: baseName(name), type: 'pptx' }
      }
      const name = await freeName(entry, safeName(file.name))
      await call(`${API}/files/${file.id}/copy?supportsAllDrives=true&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: [entry.filesId] }) })
      return { key: uid(), path: 'pliki/' + name, name: baseName(name), type: fileType(file.mimeType, file.name) }
    },
    async attachFromPhone(svc, blob, onProgress) {
      const entry = await filesFolder(svc)
      const name = await freeName(entry, safeName(blob.name))
      await uploadBlob(entry, name, blob, onProgress)
      return { key: uid(), path: 'pliki/' + name, name: baseName(name), type: fileType(blob.type, blob.name) }
    },
    async remove(id) {
      const entry = folders.get(id)
      if (entry) await patch(entry.folderId, { trashed: true })
      folders.delete(id)
    },
  }
}

/* ---------- tryb pokazowy ---------- */
export function createDemo() {
  const KEY = 'kns-demo'
  const sunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
  const start = () => ({
    songs: [
      { id: 'd1', number: '12', title: 'Kiedy ranne wstają zorze', text: 'Kiedy ranne wstają zorze,\nTobie ziemia, Tobie morze\n\nA człowiek, który bez miary' },
      { id: 'd2', number: '45', title: 'Bóg się rodzi', text: 'Bóg się rodzi, moc truchleje,\nPan niebiosów obnażony\n\nA Słowo Ciałem się stało' },
      { id: 'd3', number: '', title: 'Wśród nocnej ciszy', text: 'Wśród nocnej ciszy głos się rozchodzi\nWstańcie, pasterze' },
    ],
    services: [{ id: 'demo0001', date: sunday(), sermonTitle: 'Światłość świata', passage: 'J 8,12', speaker: '', band: '', notes: '', songs: [], files: [], updated: 1 }],
    events: [
      { id: 'demoev01', type: 'studenckie', title: 'Spotkanie studenckie', date: inDays(3), time: '19:00', place: 'Salka', description: 'Studium Ewangelii Jana, rozdział 10.', program: [], updated: 1 },
      { id: 'demoev02', type: 'czlonkowskie', title: 'Spotkanie członkowskie', date: inDays(10), time: '18:00', place: 'Hotel Forza', description: '', program: [], updated: 1 },
      { id: 'demoev03', type: 'rada', title: 'Spotkanie rady zboru', date: inDays(6), time: '19:00', place: '', description: '', program: [], updated: 1 },
    ],
    templates: null,
    announcements: [
      { id: 'demoan01', title: 'Zmiana godziny nabożeństwa', text: 'Od listopada nabożeństwa zaczynają się o 10:00. Prosimy o punktualność — odprawa zespołu o 9:45.', audience: 'members', important: true, until: inDays(30), date: Date.now(), updated: 1, author: 'Rada zboru' },
      { id: 'demoan02', title: 'Piknik kościelny', text: 'W sobotę po nabożeństwie wspólny piknik w parku. Każdy przynosi coś do jedzenia.', audience: 'public', date: Date.now() - 86400000, updated: 1, author: 'Ania' },
      { id: 'demoan03', title: 'Rekolekcje rady', text: 'Wyjazd rady zboru 14–15 listopada.', audience: 'council', date: Date.now() - 2 * 86400000, updated: 1, author: 'Pastor' },
    ],
  })
  function inDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
  let data
  try { data = JSON.parse(localStorage.getItem(KEY)) } catch { /* brak zapisu */ }
  data = data || start()
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* tryb prywatny */ } }
  return {
    demo: true,
    signedIn: () => true,
    account: () => 'tryb pokazowy',
    signIn: async () => {},
    signOut() {},
    forget() {},
    hasDrive: () => true,
    accessToken: () => 'demo',
    prepareFiles: async () => {},
    load: async () => JSON.parse(JSON.stringify({ events: [], templates: null, ...data })),
    async saveEvent(ev) {
      data.events = data.events || []
      const i = data.events.findIndex(x => x.id === ev.id)
      if (i >= 0) data.events[i] = ev
      else data.events.push(ev)
      persist()
    },
    async removeEvent(id) { data.events = (data.events || []).filter(x => x.id !== id); persist() },
    async saveTemplates(types) { data.templates = types; persist(); return Date.now() },
    async saveAnnouncement(item) { data.announcements = [...(data.announcements || []).filter(x => x.id !== item.id), item]; persist() },
    async removeAnnouncement(item) { data.announcements = (data.announcements || []).filter(x => x.id !== item.id); persist() },
    loadProtocols: async kind => JSON.parse(JSON.stringify((data.protocols || []).filter(p => p.kind === kind))),
    async saveProtocol(p) {
      data.protocols = data.protocols || []
      const i = data.protocols.findIndex(x => x.id === p.id)
      if (i >= 0) data.protocols[i] = p
      else data.protocols.push(p)
      persist()
    },
    async removeProtocol(id) { data.protocols = (data.protocols || []).filter(x => x.id !== id); persist() },
    async save(payload) {
      const i = data.services.findIndex(s => s.id === payload.service.id)
      if (i >= 0) data.services[i] = payload.service
      else data.services.push(payload.service)
      persist()
    },
    async remove(id) { data.services = data.services.filter(s => s.id !== id); persist() },
    async saveSongs(change) {
      if (change.song) {
        const song = { ...change.song, updated: Date.now() }
        const i = data.songs.findIndex(x => x.id === song.id)
        if (i >= 0) data.songs[i] = song
        else data.songs.push(song)
      } else data.songs = data.songs.filter(x => x.id !== change.remove)
      persist()
      return JSON.parse(JSON.stringify(data.songs))
    },
    savePush: async () => {},
    removePush: async () => {},
    searchFiles: async text => [
      { id: 'x1', name: 'Kazanie — slajdy.pptx', mimeType: PPTX },
      { id: 'x2', name: 'Ogłoszenia.pdf', mimeType: 'application/pdf' },
      { id: 'x3', name: 'Zdjęcie z obozu.jpg', mimeType: 'image/jpeg' },
      { id: 'x4', name: 'Świadectwo.mp4', mimeType: 'video/mp4' },
    ].filter(f => f.name.toLowerCase().includes(text.trim().toLowerCase())),
    attachFromDrive: async (svc, f) => ({ key: uid(), path: 'pliki/' + f.name, name: baseName(f.name), type: fileType(f.mimeType, f.name) }),
    attachFromPhone: async (svc, blob) => ({ key: uid(), path: 'pliki/' + blob.name, name: baseName(blob.name), type: fileType(blob.type, blob.name) }),
  }
}
