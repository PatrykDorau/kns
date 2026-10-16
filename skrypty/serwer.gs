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
//   5. Uruchom raz „ustawNewsletter” — co czwartek o 18:00 zapisani dostaną e-mail z kalendarzem i ogłoszeniami.

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
const view = p => ({ email: p.email, name: p.name || '', status: p.status, roles: p.roles || [], requested: p.requested || 0, newsletter: !!p.newsletter })

// Dalsze polecenia (dopisane do AKCJE poniżej, żeby było je łatwo znaleźć).
// Podgląd publiczny — bez logowania: najbliższe nabożeństwa, wydarzenia otwarte dla gości, ogłoszenia publiczne.
// Wynik jest pamiętany 10 minut, żeby każde otwarcie strony nie czytało Dysku od nowa.
AKCJE.public = function () {
  const cache = CacheService.getScriptCache()
  const hit = cache.get('public')
  if (hit) return JSON.parse(hit)
  const d = churchData(60)
  const result = {
    services: d.services.map(s => ({ date: s.date, time: s.time || '', place: s.place || '', sermonTitle: s.sermonTitle || '', passage: s.passage || '', speaker: s.speaker || '' })),
    events: d.events.filter(isPublic).map(e => ({ type: e.type, title: e.title || '', date: e.date, time: e.time || '', place: e.place || '', description: e.description || '' })),
    announcements: d.announcements.filter(a => a.audience === 'public').map(a => ({ id: a.id, title: a.title, text: a.text, important: !!a.important, date: a.date || 0 })),
    types: d.types.map(t => ({ id: t.id, name: t.name, color: t.color })),
  }
  cache.put('public', JSON.stringify(result), 600)
  return result
}
// Zapis na cotygodniowy newsletter (albo wypis) — każdy zatwierdzony sam za siebie.
AKCJE.setNewsletter = function (req) {
  const who = whoAmI(req.token)
  return withPeople(people => {
    const p = people.find(x => x.email === who.email)
    if (!p || p.status !== 'active') throw new Error('Newsletter jest dla zatwierdzonych członków.')
    p.newsletter = !!req.on
    return { person: view(p) }
  })
}

/* ---------- dane kościoła z Dysku (dla podglądu publicznego i newslettera) ---------- */
const DZIS = () => Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd')
function readJsonFile(file) { try { return JSON.parse(file.getBlob().getDataAsString()) } catch (e) { return null } }
function jsonIn(dir, name) { const it = dir.getFilesByName(name); return it.hasNext() ? readJsonFile(it.next()) : null }
function childFolder(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : null }
// Spotkania członkowskie i rady nie są dla gości (chyba że ktoś wyraźnie zaznaczy inaczej).
const isPublic = e => (e.public === undefined ? ['czlonkowskie', 'rada'].indexOf(e.type) < 0 : !!e.public)
// Foldery „<data> …” z najbliższych dni → zawartość pliku JSON (nazwa folderu zaczyna się od daty).
function upcoming(dir, fileName, key, days) {
  const out = []
  if (!dir) return out
  const from = DZIS()
  const until = Utilities.formatDate(new Date(Date.now() + days * 86400000), 'Europe/Warsaw', 'yyyy-MM-dd')
  const it = dir.getFolders()
  while (it.hasNext()) {
    const f = it.next()
    const date = f.getName().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > until) continue
    const data = jsonIn(f, fileName)
    if (data && data[key]) out.push(data[key])
  }
  return out.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')))
}
function churchData(days) {
  const app = folder('app')
  const ann = jsonIn(childFolder(app, 'ogloszenia') || app, 'ogloszenia.json')
  const tpl = jsonIn(childFolder(app, 'szablony') || app, 'szablony.json')
  const today = DZIS()
  return {
    services: upcoming(childFolder(app, 'nabozenstwa'), 'nabozenstwo.json', 'service', days),
    events: upcoming(childFolder(app, 'wydarzenia'), 'wydarzenie.json', 'event', days),
    announcements: ((ann && ann.items) || []).filter(a => !a.until || a.until >= today).sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || (b.date || 0) - (a.date || 0)),
    types: ((tpl && tpl.types) || []).filter(t => !t.removed && t.name),
  }
}

/* ---------- newsletter: co tydzień e-mail z kalendarzem i ogłoszeniami ---------- */
function ustawNewsletter() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'newsletter').forEach(t => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('newsletter').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(18).inTimezone('Europe/Warsaw').create()
}
function newsletter() {
  const people = loadPeople().filter(p => p.status === 'active' && p.newsletter)
  if (!people.length) return
  const html = newsletterHtml(churchData(14))
  if (!html) return // nic się nie dzieje — nie wysyłamy pustego maila
  for (const p of people) MailApp.sendEmail({ to: p.email, subject: 'Kościół Na Skale — najbliższe dwa tygodnie', htmlBody: html, name: 'Kościół Na Skale' })
  Logger.log('Newsletter wysłany: ' + people.length)
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
function newsletterHtml(d) {
  const day = date => Utilities.formatDate(new Date(date + 'T12:00:00'), 'Europe/Warsaw', 'dd.MM')
  const typeName = id => (d.types.find(t => t.id === id) || { name: '' }).name
  const items = [
    ...d.services.map(s => ({ date: s.date, time: s.time || '', title: 'Nabożeństwo' + (s.sermonTitle ? ': ' + s.sermonTitle : ''), sub: [s.passage, s.speaker, s.place].filter(Boolean).join(' · ') })),
    ...d.events.filter(e => e.type !== 'rada').map(e => ({ date: e.date, time: e.time || '', title: e.title || typeName(e.type), sub: [e.place, e.description].filter(Boolean).join(' · ') })),
  ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const anns = d.announcements.filter(a => a.audience !== 'council')
  if (!items.length && !anns.length) return ''
  const block = (title, body) => '<h2 style="font:600 16px Arial;margin:22px 0 8px;color:#222">' + title + '</h2>' + body
  let html = '<div style="font:14px/1.5 Arial;color:#333;max-width:560px">'
  html += '<h1 style="font:700 20px Arial;margin:0 0 4px">Kościół Na Skale</h1><p style="margin:0;color:#777">Najbliższe dwa tygodnie</p>'
  if (anns.length) html += block('Ogłoszenia', anns.map(a => '<p style="margin:0 0 10px">' + (a.important ? '<b style="color:#c0392b">Komunikat rady zboru: </b>' : '') + '<b>' + esc(a.title) + '</b><br>' + esc(a.text).replace(/\n/g, '<br>') + '</p>').join(''))
  if (items.length) html += block('Kalendarz', '<table style="border-collapse:collapse;width:100%">' + items.map(it => '<tr><td style="padding:6px 10px 6px 0;vertical-align:top;white-space:nowrap;color:#555">' + day(it.date) + (it.time ? ' ' + esc(it.time) : '') + '</td><td style="padding:6px 0"><b>' + esc(it.title) + '</b>' + (it.sub ? '<br><span style="color:#777">' + esc(it.sub) + '</span>' : '') + '</td></tr>').join('') + '</table>')
  html += '<p style="margin-top:26px;color:#999;font-size:12px">Wysłane z aplikacji KNS Nabo. Wypisać się można w aplikacji: Start → Newsletter.</p></div>'
  return html
}

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
  // Protokoły spotkań członkowskich: pisze protokolant, zatwierdzają rada i pastor — oni też muszą móc zapisać.
  setAccess(folder('protokoly'), p.email, active ? (has(p, 'protocols') || has(p, 'council') ? 'writer' : 'reader') : null)
  setAccess(folder('rada'), p.email, active && has(p, 'council') ? 'writer' : null)
}

/* ---------- jednorazowo: osoby, którym folder był już udostępniony ---------- */
function przeniesObecnych() {
  const app = folder('app')
  const owner = app.getOwner() ? app.getOwner().getEmail().toLowerCase() : ''
  const found = []
  let added = 0
  app.getEditors().forEach(u => found.push({ email: u.getEmail().toLowerCase(), name: u.getName(), edit: true }))
  app.getViewers().forEach(u => { const e = u.getEmail().toLowerCase(); if (!found.some(x => x.email === e)) found.push({ email: e, name: u.getName(), edit: false }) })
  withPeople(people => {
    for (const f of found) {
      if (!f.email || f.email === owner || people.some(x => x.email === f.email)) continue
      const p = { email: f.email, name: f.name || '', status: 'active', roles: f.edit ? ['czlonek', 'organizator'] : ['czlonek'], requested: Date.now() }
      people.push(p)
      applyAccess(p)
      added++
    }
  })
  Logger.log('Przeniesiono osoby: ' + added)
}
