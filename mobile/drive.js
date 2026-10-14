// Dostęp do folderu aplikacji na Dysku Google — te same pliki, z których korzysta aplikacja na komputerze:
//   <folder aplikacji>/nabozenstwa/<data> <tytuł> (<id>)/nabozenstwo.json   — jedno nabożeństwo
//   <folder aplikacji>/piesni/baza-piesni.json                              — wspólna baza pieśni
// Folder aplikacji i nazwy podfolderów są w config.js.
// W trybie pokazowym (?demo) zamiast Dysku jest pamięć przeglądarki — do oglądania strony bez logowania.

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
const SCOPE = 'https://www.googleapis.com/auth/drive'

export const uid = () => Math.random().toString(36).slice(2, 10)
export function folderName(svc) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(svc.date || '') ? svc.date : 'bez-daty'
  const title = String(svc.sermonTitle || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/[. ]+$/, '')
  return date + (title ? ' ' + title : '') + ' (' + svc.id + ')'
}

/* ---------- Dysk Google ---------- */
const quote = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"

export function createDrive(config) {
  const clientId = config.clientId
  let token = ''
  let client = null
  let baseId = '' // podfolder z nabożeństwami
  const folders = new Map() // id nabożeństwa → { folderId, fileId, name }

  async function call(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) } })
    if (res.status === 401) { token = ''; throw Object.assign(new Error('Sesja wygasła — zaloguj się ponownie.'), { auth: true }) }
    if (!res.ok) throw new Error('Dysk Google odpowiedział błędem ' + res.status + '.')
    return res
  }
  const list = async q => (await (await call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json()).files
  const read = async id => (await call(`${API}/files/${id}?alt=media&supportsAllDrives=true`)).json()
  const write = (id, data) => call(`${UPLOAD}/files/${id}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  const patch = (id, body) => call(`${API}/files/${id}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  async function create(meta, data) {
    if (data === undefined) return (await call(`${API}/files?supportsAllDrives=true&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json()
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }))
    return (await call(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, { method: 'POST', body: form })).json()
  }

  return {
    demo: false,
    signedIn: () => !!token,
    signIn: () => new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) return reject(new Error('Nie udało się wczytać logowania Google — sprawdź internet.'))
      client = client || google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, callback: () => {} })
      client.callback = res => (res.error ? reject(new Error('Logowanie nie powiodło się.')) : (token = res.access_token, resolve()))
      client.error_callback = () => reject(new Error('Logowanie przerwane.'))
      client.requestAccessToken({ prompt: '' })
    }),
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
      const songs = songsFile ? (await read(songsFile.id)).songs || [] : []
      const children = await list(`${quote(baseId)} in parents and mimeType='${FOLDER}' and trashed=false`)
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
      return { services, songs }
    },
    async save(payload) {
      const svc = payload.service
      const name = folderName(svc)
      let entry = folders.get(svc.id)
      if (!entry) {
        const folder = await create({ name, mimeType: FOLDER, parents: [baseId] })
        const file = await create({ name: 'nabozenstwo.json', parents: [folder.id] }, payload)
        folders.set(svc.id, { folderId: folder.id, fileId: file.id, name })
        return
      }
      await write(entry.fileId, payload)
      if (entry.name !== name) { await patch(entry.folderId, { name }); entry.name = name }
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
  const sunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
  const start = () => ({
    songs: [
      { id: 'd1', number: '12', title: 'Kiedy ranne wstają zorze', text: 'Kiedy ranne wstają zorze,\nTobie ziemia, Tobie morze\n\nA człowiek, który bez miary' },
      { id: 'd2', number: '45', title: 'Bóg się rodzi', text: 'Bóg się rodzi, moc truchleje,\nPan niebiosów obnażony\n\nA Słowo Ciałem się stało' },
      { id: 'd3', number: '', title: 'Wśród nocnej ciszy', text: 'Wśród nocnej ciszy głos się rozchodzi\nWstańcie, pasterze' },
    ],
    services: [{ id: 'demo0001', date: sunday(), sermonTitle: 'Światłość świata', passage: 'J 8,12', speaker: '', band: '', notes: '', songs: [], files: [], updated: 1 }],
  })
  let data
  try { data = JSON.parse(localStorage.getItem(KEY)) } catch { /* brak zapisu */ }
  data = data || start()
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* tryb prywatny */ } }
  return {
    demo: true,
    signedIn: () => true,
    signIn: async () => {},
    load: async () => JSON.parse(JSON.stringify(data)),
    async save(payload) {
      const i = data.services.findIndex(s => s.id === payload.service.id)
      if (i >= 0) data.services[i] = payload.service
      else data.services.push(payload.service)
      persist()
    },
    async remove(id) { data.services = data.services.filter(s => s.id !== id); persist() },
  }
}
