// Test mobile/drive.js na udawanym API Dysku Google (bez sieci): node skrypty/test-telefonu.mjs
import assert from 'node:assert/strict'

const FOLDER = 'application/vnd.google-apps.folder'
let next = 1
const files = new Map() // id → { id, name, mimeType, parents, trashed, content }
const add = (name, mimeType, parent, content) => { const id = 'f' + next++; files.set(id, { id, name, mimeType, parents: parent ? [parent] : [], trashed: false, content }); return id }
const root = add('Aplikacja KNS Nabo', FOLDER, null)
const svcDir = add('nabozenstwa', FOLDER, root)
const svc1 = add('2026-10-18 Test (s1)', FOLDER, svcDir)
add('nabozenstwo.json', 'application/json', svc1, JSON.stringify({ service: { id: 's1', date: '2026-10-18', songs: [], files: [], updated: 5 } }))

// Bardzo uproszczony interpreter zapytań q z drive.js.
function matches(f, q) {
  return q.split(' and ').every(part => {
    part = part.trim()
    let m
    if ((m = /^'(.+)' in parents$/.exec(part))) return f.parents.includes(m[1])
    if ((m = /^name='(.+)'$/.exec(part))) return f.name === m[1].replace(/\\'/g, "'")
    if ((m = /^mimeType='(.+)'$/.exec(part))) return f.mimeType === m[1]
    if (part === 'trashed=false') return !f.trashed
    throw new Error('Nieobsługiwane zapytanie: ' + part)
  })
}
const json = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, headers: { get: () => null } })
globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url)
  const method = opt.method || 'GET'
  if (u.pathname === '/drive/v3/files' && method === 'GET') {
    return json({ files: [...files.values()].filter(f => matches(f, u.searchParams.get('q'))).map(({ id, name }) => ({ id, name })) })
  }
  let m
  if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) {
    const f = files.get(m[1])
    if (!f) return json({}, 404)
    if (method === 'GET') return u.searchParams.get('alt') === 'media' ? json(JSON.parse(f.content)) : json({ id: f.id })
    if (method === 'PATCH') { Object.assign(f, JSON.parse(opt.body)); return json({ id: f.id }) }
  }
  if (u.pathname === '/drive/v3/files' && method === 'POST') { const meta = JSON.parse(opt.body); return json({ id: add(meta.name, meta.mimeType, meta.parents[0]) }) }
  if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const meta = JSON.parse(await opt.body.get('metadata').text())
    return json({ id: add(meta.name, 'application/json', meta.parents[0], await opt.body.get('file').text()) })
  }
  if ((m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)) && method === 'PATCH') { files.get(m[1]).content = opt.body; return json({ id: m[1] }) }
  throw new Error('Nieobsługiwany adres: ' + method + ' ' + url)
}
const store = {}
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) }, removeItem: k => { delete store[k] } }
store['kns-auth'] = JSON.stringify({ token: 't', expires: Date.now() + 3600e3, email: 'a@b.pl' })
globalThis.window = {}

const { createDrive } = await import('../mobile/drive.js')
const config = { clientId: 'x', folderName: 'Aplikacja KNS Nabo', servicesFolder: 'nabozenstwa', songsFolder: 'piesni' }
const byName = (name, parent) => [...files.values()].find(f => f.name === name && (!parent || f.parents.includes(parent)) && !f.trashed)

// 1. Stary układ (bez wydarzeń i szablonów) — wczytuje się jak dawniej.
let drive = createDrive(config)
let data = await drive.load()
assert.equal(data.services.length, 1)
assert.deepEqual(data.events, [])
assert.equal(data.templates, null)

// 2. Zapis wydarzenia tworzy folder „wydarzenia” i podfolder wydarzenia.
const ev = { id: 'e1', type: 'studenckie', title: 'Spotkanie studenckie', date: '2026-10-21', time: '19:00', program: [], updated: 10 }
await drive.saveEvent(ev)
const evDir = byName('wydarzenia', root)
assert.ok(evDir)
assert.ok(byName('2026-10-21 Spotkanie studenckie (e1)', evDir.id))
// zmiana tytułu zmienia nazwę folderu
await drive.saveEvent({ ...ev, title: 'Studenci', updated: 20 }, 10)
assert.ok(byName('2026-10-21 Studenci (e1)', evDir.id))
// konflikt: ktoś zapisał nowszą wersję
await assert.rejects(drive.saveEvent({ ...ev, updated: 30 }, 10), e => e.conflict)

// 3. Szablony
const when = await drive.saveTemplates([{ id: 'studenckie', name: 'Studenci', program: [] }], 0)
assert.ok(byName('szablony.json', byName('szablony', root).id))
await assert.rejects(drive.saveTemplates([], when - 1), e => e.conflict)

// 4. Ponowne wczytanie (nowa sesja): wydarzenia i szablony są.
drive = createDrive(config)
data = await drive.load()
assert.equal(data.events.length, 1)
assert.equal(data.events[0].title, 'Studenci')
assert.equal(data.templates[0].name, 'Studenci')
assert.equal(data.templatesUpdated, when)
// stare wydarzenia (ponad 120 dni) nie są czytane
const old = add('2020-01-01 Stare (e0)', FOLDER, evDir.id)
add('wydarzenie.json', 'application/json', old, JSON.stringify({ event: { id: 'e0', date: '2020-01-01' } }))
data = await drive.load()
assert.equal(data.events.length, 1)

// 5. Usunięcie wydarzenia — folder do kosza.
await drive.removeEvent('e1')
data = await drive.load()
assert.equal(data.events.length, 0)
// 6. Protokoły: bez folderu — czytelny błąd; z folderem — zapis i odczyt; rada w podfolderze „protokoly”.
await assert.rejects(drive.loadProtocols('czlonkowskie'), e => e.noAccess)
const protoRoot = add('KNS Nabo — Protokoły', FOLDER, null)
const councilRoot = add('KNS Nabo — Rada', FOLDER, null)
drive = createDrive(config)
await drive.load()
const p = { id: 'p1', kind: 'czlonkowskie', title: 'Spotkanie członkowskie', date: '2026-10-26', items: [], status: 'szkic', updated: 1 }
await drive.saveProtocol(p)
assert.ok(byName('2026-10-26 Spotkanie członkowskie (p1)', protoRoot))
await assert.rejects(drive.saveProtocol({ ...p, updated: 3 }, 0), e => e.conflict)
await drive.saveProtocol({ ...p, status: 'zatwierdzony', updated: 2 }, 1)
assert.equal((await drive.loadProtocols('czlonkowskie'))[0].status, 'zatwierdzony')
await drive.saveProtocol({ ...p, id: 'p2', kind: 'rada', title: 'Rada' })
assert.ok(byName('2026-10-26 Rada (p2)', byName('protokoly', councilRoot).id))
assert.equal((await drive.loadProtocols('rada')).length, 1)
assert.equal((await drive.loadProtocols('czlonkowskie')).length, 1)
await drive.removeProtocol('p2')
assert.equal((await drive.loadProtocols('rada')).length, 0)
console.log('drive.js: wszystkie testy OK')
