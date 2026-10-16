// Serwer aplikacji KNS Nabo — Google Apps Script na koncie kościoła (w tym samym projekcie co przypomnienie.gs).
// Pilnuje kont i rang: nowa osoba czeka na zatwierdzenie, administrator nadaje rangi, a skrypt sam
// udostępnia jej odpowiednie foldery na Dysku (dostępu pilnuje Dysk Google, nie tylko aplikacja).
//
// Instalacja (raz):
//   1. W projekcie skryptu (script.google.com) dodaj plik: „+” → Skrypt → nazwa „serwer” → wklej ten plik.
//   2. Uzupełnij poniżej „admins” (adres administratora).
//   3. Wdróż → Nowe wdrożenie → typ „Aplikacja internetowa”: Wykonaj jako „Ja”, Dostęp „Każdy” → Wdróż.
//      Skopiuj adres aplikacji internetowej (…/exec) — trafi do mobile/config.js (apiUrl).
//   4. Uruchom raz „przeniesObecnych” — osoby, którym folder był już udostępniony, staną się zatwierdzonymi członkami.

const SERWER = {
  // Aplikacje, które mogą się łączyć (identyfikatory klientów logowania Google: strona na telefon, komputer).
  clientIds: [
    '828184441520-7rkg5bloroj1dnujscio9irspa51c5is.apps.googleusercontent.com',
    '828184441520-8o83kfp8n9617a5fmhk25vbs8lncc7ed.apps.googleusercontent.com',
  ],
  admins: ['wpisz.adres.administratora@gmail.com'], // zawsze administratorzy (choćby lista osób się zepsuła)
  appFolder: 'Aplikacja KNS Nabo',
  pushFolder: 'powiadomienia',
  folders: { protokoly: 'KNS Nabo — Protokoły', rada: 'KNS Nabo — Rada', admin: 'KNS Nabo — Administracja' },
}

// Rangi i to, co dają. Kolejność = kolejność w aplikacji.
const RANGI = [
  { id: 'czlonek', name: 'Członek' },
  { id: 'lider', name: 'Lider', edit: true },
  { id: 'organizator', name: 'Organizator nabożeństw', edit: true },
  { id: 'technika', name: 'Technika (rzutnik, stream)', edit: true },
  { id: 'protokolant', name: 'Protokolant', protocols: true },
  { id: 'rada', name: 'Członek rady zboru', edit: true, council: true },
  { id: 'pastor', name: 'Pastor', edit: true, council: true },
  { id: 'admin', name: 'Administrator', edit: true, council: true, protocols: true, manage: true },
]
const has = (person, key) => (person.roles || []).some(r => RANGI.some(x => x.id === r && x[key]))

/* ---------- wejście ---------- */
function doGet() { return out({ ok: true, app: 'KNS Nabo' }) }
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}')
    const action = AKCJE[req.action]
    if (!action) throw new Error('Nieznane polecenie.')
    return out(action(req))
  } catch (err) {
    return out({ error: err.message })
  }
}
const out = data => ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)

const AKCJE = {
  // Kim jestem — przy pierwszym logowaniu zapisuje prośbę o dostęp.
  me(req) {
    const who = whoAmI(req.token)
    return withPeople(people => {
      let p = people.find(x => x.email === who.email)
      if (!p) {
        const admin = SERWER.admins.map(a => a.toLowerCase()).indexOf(who.email) >= 0
        p = { email: who.email, name: who.name, status: admin ? 'active' : 'pending', roles: admin ? ['czlonek', 'admin'] : [], requested: Date.now() }
        people.push(p)
        if (admin) applyAccess(p)
      } else if (who.name && !p.name) p.name = who.name
      return { person: view(p), ranks: RANGI }
    })
  },
  // Lista osób — dla administratora.
  people(req) {
    requireManager(req.token)
    return { people: loadPeople().map(view), ranks: RANGI }
  },
  // Zatwierdzenie, odrzucenie, zmiana rang — od razu z udostępnieniem albo odebraniem folderów.
  setPerson(req) {
    const me = requireManager(req.token)
    const email = String(req.email || '').toLowerCase()
    return withPeople(people => {
      const p = people.find(x => x.email === email)
      if (!p) throw new Error('Nie ma takiej osoby.')
      if (req.status) p.status = req.status === 'active' ? 'active' : req.status === 'rejected' ? 'rejected' : 'pending'
      if (Array.isArray(req.roles)) p.roles = req.roles.filter(r => RANGI.some(x => x.id === r))
      if (p.status === 'active' && !p.roles.length) p.roles = ['czlonek']
      // Ostatni administrator nie może odebrać sobie uprawnień.
      if (p.email === me.email && !has(p, 'manage') && !people.some(x => x !== p && x.status === 'active' && has(x, 'manage'))) throw new Error('Musi zostać przynajmniej jeden administrator.')
      p.changed = Date.now(); p.changedBy = me.email
      applyAccess(p)
      return { person: view(p) }
    })
  },
}
const view = p => ({ email: p.email, name: p.name || '', status: p.status, roles: p.roles || [], requested: p.requested || 0 })

/* ---------- kto pyta ---------- */
function fetchJson(url, token) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: token ? { Authorization: 'Bearer ' + token } : {} })
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null
}
// Token logowania Google z aplikacji → potwierdzony adres e-mail (i imię, jeśli dostępne).
function whoAmI(token) {
  if (!token) throw new Error('Brak logowania.')
  const info = fetchJson('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token))
  if (!info || SERWER.clientIds.indexOf(info.aud || info.azp) < 0) throw new Error('Logowanie wygasło — zaloguj się ponownie.')
  let email = info.email || '', name = ''
  const user = fetchJson('https://www.googleapis.com/oauth2/v3/userinfo', token)
  if (user) { email = user.email || email; name = user.name || '' }
  if (!email) {
    const about = fetchJson('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', token)
    if (about && about.user) { email = about.user.emailAddress || ''; name = about.user.displayName || name }
  }
  if (!email) throw new Error('Nie udało się ustalić adresu e-mail konta.')
  return { email: email.toLowerCase(), name }
}
function requireManager(token) {
  const who = whoAmI(token)
  const p = loadPeople().find(x => x.email === who.email)
  const admin = SERWER.admins.map(a => a.toLowerCase()).indexOf(who.email) >= 0
  if (!admin && !(p && p.status === 'active' && has(p, 'manage'))) throw new Error('Tylko administrator może zarządzać osobami.')
  return who
}

/* ---------- lista osób (plik w folderze administracji, tylko konto kościoła) ---------- */
function peopleFile() {
  const dir = folder('admin')
  const files = dir.getFilesByName('osoby.json')
  return files.hasNext() ? files.next() : dir.createFile('osoby.json', JSON.stringify({ people: [] }), 'application/json')
}
function loadPeople() {
  try { return JSON.parse(peopleFile().getBlob().getDataAsString()).people || [] } catch (e) { return [] }
}
// Zmiana listy pod blokadą — dwie osoby naraz nie nadpiszą sobie zmian.
function withPeople(change) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const file = peopleFile()
    const people = JSON.parse(file.getBlob().getDataAsString() || '{}').people || []
    const result = change(people)
    file.setContent(JSON.stringify({ people }, null, 1))
    return result
  } finally { lock.releaseLock() }
}

/* ---------- foldery i udostępnianie ---------- */
// Foldery: główny (istniejący, po nazwie) i trzy osobne (tworzone przy pierwszym użyciu).
function folder(key) {
  const props = PropertiesService.getScriptProperties()
  const saved = props.getProperty('folder_' + key)
  if (saved) { try { return DriveApp.getFolderById(saved) } catch (e) { /* usunięty — znajdziemy albo utworzymy */ } }
  const name = key === 'app' ? SERWER.appFolder : SERWER.folders[key]
  const found = DriveApp.getFoldersByName(name)
  const f = found.hasNext() ? found.next() : DriveApp.createFolder(name)
  props.setProperty('folder_' + key, f.getId())
  return f
}
function subfolder(parent, name) {
  const it = parent.getFoldersByName(name)
  return it.hasNext() ? it.next() : parent.createFolder(name)
}
// Ustawia dostęp osoby do folderu: 'writer', 'reader' albo null (brak).
function setAccess(f, email, level) {
  if (f.getOwner() && f.getOwner().getEmail().toLowerCase() === email) return
  const editor = f.getEditors().some(u => u.getEmail().toLowerCase() === email)
  const viewer = f.getViewers().some(u => u.getEmail().toLowerCase() === email)
  // Dostęp odziedziczony po folderze wyżej nie da się zdjąć tutaj — wtedy usuwanie po prostu pomijamy.
  const quiet = fn => { try { fn() } catch (e) { /* dostęp odziedziczony */ } }
  if (level === 'writer') { if (viewer && !editor) quiet(() => f.removeViewer(email)); if (!editor) f.addEditor(email) }
  else if (level === 'reader') { if (editor) quiet(() => f.removeEditor(email)); if (!viewer || editor) f.addViewer(email) }
  else { if (editor) quiet(() => f.removeEditor(email)); if (viewer) quiet(() => f.removeViewer(email)) }
}
// Dostęp według statusu i rang (tabela w PLAN.md).
function applyAccess(p) {
  const active = p.status === 'active'
  const app = folder('app')
  setAccess(app, p.email, active ? (has(p, 'edit') ? 'writer' : 'reader') : null)
  setAccess(subfolder(app, SERWER.pushFolder), p.email, active && !has(p, 'edit') ? 'writer' : null)
  setAccess(folder('protokoly'), p.email, active ? (has(p, 'protocols') ? 'writer' : 'reader') : null)
  setAccess(folder('rada'), p.email, active && has(p, 'council') ? 'writer' : null)
}

/* ---------- jednorazowo: osoby, którym folder był już udostępniony ---------- */
function przeniesObecnych() {
  const app = folder('app')
  const owner = app.getOwner() ? app.getOwner().getEmail().toLowerCase() : ''
  const found = []
  app.getEditors().forEach(u => found.push({ email: u.getEmail().toLowerCase(), name: u.getName(), edit: true }))
  app.getViewers().forEach(u => { const e = u.getEmail().toLowerCase(); if (!found.some(x => x.email === e)) found.push({ email: e, name: u.getName(), edit: false }) })
  withPeople(people => {
    for (const f of found) {
      if (!f.email || f.email === owner || people.some(x => x.email === f.email)) continue
      const p = { email: f.email, name: f.name || '', status: 'active', roles: f.edit ? ['czlonek', 'organizator'] : ['czlonek'], requested: Date.now() }
      people.push(p)
      applyAccess(p)
    }
  })
  Logger.log('Przeniesiono osoby: ' + found.length)
}
