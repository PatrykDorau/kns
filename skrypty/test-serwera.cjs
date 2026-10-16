// Test skryptu serwera (serwer.gs) na podstawionych usługach Google: node skrypty/test-serwera.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert')
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, 'serwer.gs'), 'utf8').replace("admins: ['wpisz.adres.administratora@gmail.com']", "admins: ['admin@x.pl']")
// --- mock Drive ---
let nextId = 1
const files = {}, folders = {}
function mkFolder(name, owner = 'kosciol@x.pl') {
  const f = { id: 'F' + nextId++, name, editors: new Set(), viewers: new Set(), children: [], files: [],
    getId() { return this.id }, getOwner() { return { getEmail: () => owner } },
    getEditors() { return [...this.editors].map(e => ({ getEmail: () => e, getName: () => e.split('@')[0] })) },
    getViewers() { return [...this.viewers].map(e => ({ getEmail: () => e, getName: () => e.split('@')[0] })) },
    addEditor(e) { this.viewers.delete(e); this.editors.add(e) }, addViewer(e) { this.viewers.add(e) },
    removeEditor(e) { if (this.inheritedFrom && this.inheritedFrom.editors.has(e)) throw new Error('inherited'); this.editors.delete(e) },
    removeViewer(e) { this.viewers.delete(e) },
    getFoldersByName(n) { return it(this.children.filter(c => c.name === n)) },
    getName() { return this.name }, getFolders() { return it(this.children) },
    createFolder(n) { const c = mkFolder(n); c.inheritedFrom = this; this.children.push(c); return c },
    getFilesByName(n) { return it(this.files.filter(c => c.name === n)) },
    createFile(n, content) { const file = { name: n, content, getBlob() { return { getDataAsString: () => file.content } }, setContent(c) { file.content = c } }; this.files.push(file); return file },
  }
  folders[f.id] = f
  return f
}
const it = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] } }
const root = []
const app = mkFolder('Aplikacja KNS Nabo'); root.push(app)
app.editors.add('stary.edytor@x.pl'); app.viewers.add('stary.czytelnik@x.pl')
const DriveApp = {
  getFolderById: id => { if (!folders[id]) throw new Error('nf'); return folders[id] },
  getFoldersByName: n => it(root.filter(f => f.name === n)),
  createFolder: n => { const f = mkFolder(n); root.push(f); return f },
}
const props = {}
const tokens = { tAdmin: 'admin@x.pl', tAnia: 'ania@x.pl', tBad: 'zly@x.pl' }
const UrlFetchApp = { fetch(url, opt) {
  const tok = /access_token=([^&]+)/.exec(url)?.[1] || (opt.headers.Authorization || '').replace('Bearer ', '')
  const email = tokens[tok]
  const ok = (o) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) })
  if (!email) return { getResponseCode: () => 400, getContentText: () => '{}' }
  if (url.includes('tokeninfo')) return ok({ aud: tok === 'tBad' ? 'obcy' : '828184441520-7rkg5bloroj1dnujscio9irspa51c5is.apps.googleusercontent.com', email })
  if (url.includes('userinfo')) return ok({ email, name: email.split('@')[0].toUpperCase() })
  return ok({})
} }
// dane kościoła na „Dysku”: nabożeństwa, wydarzenia, ogłoszenia, szablony
const iso = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const inDays = n => iso(new Date(Date.now() + n * 86400000))
const put = (parent, folderName, fileName, data) => { const f = parent.createFolder(folderName); f.createFile(fileName, JSON.stringify(data)); return f }
const svcDir = app.createFolder('nabozenstwa')
put(svcDir, inDays(3) + ' Światłość (s1)', 'nabozenstwo.json', { service: { id: 's1', date: inDays(3), time: '10:00', sermonTitle: 'Światłość', passage: 'J 8,12', speaker: 'Jan', notes: 'tajne' } })
put(svcDir, inDays(-7) + ' Stare (s0)', 'nabozenstwo.json', { service: { id: 's0', date: inDays(-7) } })
put(svcDir, inDays(100) + ' Daleko (s2)', 'nabozenstwo.json', { service: { id: 's2', date: inDays(100) } })
const evDir = app.createFolder('wydarzenia')
put(evDir, inDays(2) + ' Studenci (e1)', 'wydarzenie.json', { event: { id: 'e1', type: 'studenckie', title: 'Studenci', date: inDays(2), time: '19:00' } })
put(evDir, inDays(4) + ' Członkowskie (e2)', 'wydarzenie.json', { event: { id: 'e2', type: 'czlonkowskie', title: 'Członkowskie', date: inDays(4) } })
put(evDir, inDays(5) + ' Rada (e3)', 'wydarzenie.json', { event: { id: 'e3', type: 'rada', title: 'Rada', date: inDays(5) } })
app.createFolder('ogloszenia').createFile('ogloszenia.json', JSON.stringify({ items: [
  { id: 'a1', title: 'Piknik', text: 'Zapraszamy\nwszystkich', audience: 'public', date: 1 },
  { id: 'a2', title: 'Składki', text: 'Dla członków', audience: 'members', date: 2, important: true },
  { id: 'a3', title: 'Stare', text: 'x', audience: 'public', until: inDays(-1) },
] }))
app.createFolder('szablony').createFile('szablony.json', JSON.stringify({ types: [{ id: 'studenckie', name: 'Spotkanie studenckie', color: '#3ddc97' }, { id: 'inne', removed: true }] }))
const cacheStore = {}, mails = [], triggers = []
const ctx = { DriveApp, UrlFetchApp,
  Utilities: { formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? iso(d) : iso(d).slice(8, 10) + '.' + iso(d).slice(5, 7)) },
  CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v } }) },
  MailApp: { sendEmail: m => mails.push(m) },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, WeekDay: { THURSDAY: 'THU' },
    newTrigger: fn => ({ timeBased: () => ({ onWeekDay: d => ({ atHour: h => ({ inTimezone: () => ({ create: () => triggers.push([fn, d, h]) }) }) }) }) }) }, Logger: { log: m => console.log('  log:', m) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return JSON.parse(s) } }) },
}
vm.createContext(ctx)
vm.runInContext(src + '\nthis.doPost = doPost; this.przeniesObecnych = przeniesObecnych; this.newsletter = newsletter; this.ustawNewsletter = ustawNewsletter;', ctx)
const call = (action, token, extra = {}) => ctx.doPost({ postData: { contents: JSON.stringify({ action, token, ...extra }) } })
const byName = n => root.find(f => f.name === n)

let r = call('me', 'tBad'); assert.match(r.error, /wygasło/)
r = call('me', 'nieznany'); assert.match(r.error, /wygasło/)
r = call('nieznane', 'tAdmin'); assert.match(r.error, /Nieznane/)
r = call('me', 'tAdmin'); assert.equal(r.person.status, 'active'); assert.ok(r.person.roles.includes('admin')); assert.equal(r.ranks.length, 8)
assert.ok(app.editors.has('admin@x.pl'))
r = call('me', 'tAnia'); assert.equal(r.person.status, 'pending'); assert.equal(r.person.name, 'ANIA')
assert.ok(!app.editors.has('ania@x.pl') && !app.viewers.has('ania@x.pl'))
r = call('people', 'tAnia'); assert.match(r.error, /administrator/)
r = call('people', 'tAdmin'); assert.equal(r.people.length, 2)
// zatwierdzenie bez rang -> członek, odczyt aplikacji, zapis powiadomień, odczyt protokołów, bez rady
r = call('setPerson', 'tAdmin', { email: 'ANIA@x.pl', status: 'active' }); assert.deepEqual(r.person.roles, ['czlonek'])
const push = app.children.find(c => c.name === 'powiadomienia')
assert.ok(app.viewers.has('ania@x.pl') && push.editors.has('ania@x.pl'))
assert.ok(byName('KNS Nabo — Protokoły').viewers.has('ania@x.pl'))
assert.ok(!byName('KNS Nabo — Rada').viewers.has('ania@x.pl') && !byName('KNS Nabo — Rada').editors.has('ania@x.pl'))
assert.ok(!byName('KNS Nabo — Administracja').viewers.has('ania@x.pl'))
// protokolant + rada
r = call('setPerson', 'tAdmin', { email: 'ania@x.pl', roles: ['czlonek', 'protokolant', 'rada'] })
assert.ok(app.editors.has('ania@x.pl') && !app.viewers.has('ania@x.pl'))
assert.ok(byName('KNS Nabo — Protokoły').editors.has('ania@x.pl') && byName('KNS Nabo — Rada').editors.has('ania@x.pl'))
// sama rada (bez protokolanta) też pisze w protokołach — zatwierdza je
r = call('setPerson', 'tAdmin', { email: 'ania@x.pl', roles: ['czlonek', 'rada'] })
assert.ok(byName('KNS Nabo — Protokoły').editors.has('ania@x.pl'))
// odebranie rangi — zostaje członkiem
r = call('setPerson', 'tAdmin', { email: 'ania@x.pl', roles: ['czlonek'] })
assert.ok(app.viewers.has('ania@x.pl') && !app.editors.has('ania@x.pl'))
assert.ok(!byName('KNS Nabo — Rada').editors.has('ania@x.pl'))
// odrzucenie — brak dostępu wszędzie
r = call('setPerson', 'tAdmin', { email: 'ania@x.pl', status: 'rejected' })
assert.ok(!app.viewers.has('ania@x.pl') && !push.editors.has('ania@x.pl') && !byName('KNS Nabo — Protokoły').viewers.has('ania@x.pl'))
// ostatni admin
r = call('setPerson', 'tAdmin', { email: 'admin@x.pl', roles: ['czlonek'] }); assert.match(r.error, /administrator/)
// nieistniejąca osoba
r = call('setPerson', 'tAdmin', { email: 'nikt@x.pl', status: 'active' }); assert.match(r.error, /Nie ma/)
// przeniesienie obecnych
ctx.przeniesObecnych()
r = call('people', 'tAdmin')
const ed = r.people.find(p => p.email === 'stary.edytor@x.pl'), rd = r.people.find(p => p.email === 'stary.czytelnik@x.pl')
assert.deepEqual(ed.roles, ['czlonek', 'organizator']); assert.deepEqual(rd.roles, ['czlonek'])
assert.ok(push.editors.has('stary.czytelnik@x.pl'))
assert.equal(r.people.filter(p => p.email === 'admin@x.pl').length, 1)
// podgląd publiczny: bez logowania, bez spotkań członkowskich i rady, bez prywatnych pól, tylko publiczne ogłoszenia
r = call('public')
assert.deepEqual(r.services.map(s => s.date), [inDays(3)])
assert.equal(r.services[0].notes, undefined)
assert.deepEqual(r.events.map(e => e.title), ['Studenci'])
assert.deepEqual(r.announcements.map(a => a.title), ['Piknik'])
assert.deepEqual(r.types.map(t => t.id), ['studenckie'])
assert.ok(cacheStore.public)
// newsletter: zapis tylko dla zatwierdzonych; mail z kalendarzem (bez rady) i ogłoszeniami
r = call('setNewsletter', 'tAnia', { on: true }); assert.match(r.error, /zatwierdzonych/)
r = call('setNewsletter', 'tAdmin', { on: true }); assert.equal(r.person.newsletter, true)
ctx.newsletter()
assert.equal(mails.length, 1)
assert.equal(mails[0].to, 'admin@x.pl')
assert.match(mails[0].htmlBody, /Światłość/)
assert.match(mails[0].htmlBody, /Członkowskie/)
assert.doesNotMatch(mails[0].htmlBody, /Rada</)
assert.match(mails[0].htmlBody, /Komunikat rady zboru: <\/b><b>Składki/)
assert.match(mails[0].htmlBody, /Zapraszamy<br>wszystkich/)
r = call('setNewsletter', 'tAdmin', { on: false }); assert.equal(r.person.newsletter, false)
ctx.newsletter(); assert.equal(mails.length, 1)
ctx.ustawNewsletter(); assert.deepEqual(triggers, [['newsletter', 'THU', 18]])
console.log('serwer.gs: wszystkie testy OK')
