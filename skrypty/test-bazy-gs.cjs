// Test baza.gs + przypomnienie.gs w trybie bazy (udawane UrlFetchApp/Supabase REST): node skrypty/test-bazy-gs.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path')
const src = ['przypomnienie.gs', 'baza.gs'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n')
const iso = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const sunday = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return iso(d) })()
const calls = [], mails = []
const db = {
  services: [{ date: sunday, data: { id: 's1', date: sunday, sermonTitle: 'Światłość', passage: '', speaker: 'Jan', songs: [] } }],
  push_devices: [{ id: 'tel1', data: { subscription: { endpoint: 'x' }, schedule: { day: 5, hour: 19 } } }, { id: 'tel2', data: { subscription: { endpoint: 'y' } } }],
  people: [{ email: 'a@kns.pl' }],
  allPeople: [{ email: 'Org@kns.pl', status: 'active', roles: ['czlonek', 'organizator'] }, { email: 'stary@kns.pl', status: 'active', roles: ['czlonek'] },
    { email: 'czeka@kns.pl', status: 'pending', roles: [] }, { email: 'kosciol@kns.pl', status: 'active', roles: ['admin'] }],
}
const reply = (code, obj) => ({ getResponseCode: () => code, getContentText: () => (obj === undefined ? '' : JSON.stringify(obj)) })
const UrlFetchApp = { fetch(url, opt) {
  calls.push((opt.method || 'get') + ' ' + url.replace(/^https:\/\/[^/]+/, ''))
  if (url.includes('/api/push')) return reply(200, { sent: 2, gone: ['tel2'] })
  assert.equal(opt.headers.apikey, 'sb_secret_TEST')
  assert.equal(opt.headers.Authorization, undefined)
  const m = /\/rest\/v1\/([a-z_]+)\?(.*)$/.exec(url)
  if (opt.method === 'delete') { db.push_devices = db.push_devices.filter(p => !m[2].includes(p.id)); return reply(204) }
  if (m[1] === 'services') return reply(200, m[2].includes('date=eq.' + sunday) || m[2].includes('date=gte') ? db.services : [])
  if (m[1] === 'events') return reply(200, [{ data: { title: 'Studenci', date: sunday, time: '19:00' } }])
  if (m[1] === 'announcements') return reply(200, [{ data: { title: 'Piknik', text: 'Zapraszamy' }, important: true, until: null }])
  if (m[1] === 'templates') return reply(200, [])
  if (m[1] === 'ranks') return reply(200, [{ id: 'organizator' }, { id: 'technika' }, { id: 'admin' }])
  if (m[1] === 'people' && m[2].startsWith('select=email,status,roles')) return reply(200, db.allPeople)
  return reply(200, db[m[1]])
} }
const ctx = {
  UrlFetchApp, Logger: { log() {} }, MailApp: { sendEmail: m => mails.push(m) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'SUPABASE_SECRET' ? 'sb_secret_TEST' : null) }) },
  Session: { getScriptTimeZone: () => 'Europe/Warsaw' },
  Utilities: { formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? iso(d) : f === 'u' ? String(d.getDay() || 7) : f === 'H' ? String(d.getHours()) : f === 'd.MM.yyyy' ? iso(d).split('-').reverse().join('.') : iso(d).slice(8, 10) + '.' + iso(d).slice(5, 7)) },
  DriveApp: { getFolderById(id) { if (id !== '1pI2FlyMq8XUQHbJlELd1OuxsCIz-RRnG') throw new Error('zły folder'); return folder }, getFoldersByName(name) {
    if (name !== 'Aplikacja KNS Nabo') throw new Error('Dysk nie powinien być używany do danych w trybie bazy: ' + name)
    let used = false
    return { hasNext: () => !used, next: () => { used = true; return folder } }
  } },
}
// folder z załącznikami (udostępnianie według rang)
const editorsSet = new Set(['kosciol@kns.pl', 'stary@kns.pl', 'reczny@kns.pl'])
const shareLog = []
const folder = {
  getOwner: () => ({ getEmail: () => 'kosciol@kns.pl' }),
  getEditors: () => [...editorsSet].map(e => ({ getEmail: () => e })),
  addEditor: e => { shareLog.push('+' + e); editorsSet.add(e) },
  removeEditor: e => { shareLog.push('-' + e); editorsSet.delete(e) },
}
const props = {}
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k === 'SUPABASE_SECRET' ? 'sb_secret_TEST' : props[k] || null), setProperty: (k, v) => { props[k] = v } }) }
vm.createContext(ctx)
vm.runInContext(src + '\nthis.sprawdzTeraz = sprawdzTeraz; this.checkSunday = checkSunday; this.newsletterBazy = newsletterBazy; this.bazaUdostepnij = bazaUdostepnij;', ctx)

const check = ctx.checkSunday(new Date(), 'Europe/Warsaw')
assert.equal(check.service.sermonTitle, 'Światłość')
assert.deepEqual(check.missing, ['fragment', 'pieśni'])
ctx.sprawdzTeraz()
assert.match(mails[0].subject, /brakuje: fragment, pieśni/)
assert.ok(calls.some(c => c.startsWith('post /api/push')))
assert.deepEqual(db.push_devices.map(p => p.id), ['tel1']) // telefon, który się wypisał, usunięty z bazy
ctx.newsletterBazy()
assert.equal(mails.length, 2)
assert.equal(mails[1].to, 'a@kns.pl')
assert.match(mails[1].htmlBody, /Komunikat rady zboru: <\/b><b>Piknik/)
assert.match(mails[1].htmlBody, /Studenci/)
assert.match(mails[1].htmlBody, /Nabożeństwo: Światłość/)
// udostępnianie: organizator dostaje edycję, stary (bez rangi z edycją) traci, ręcznie dodany i właściciel zostają
ctx.bazaUdostepnij()
assert.deepEqual(shareLog, ['+org@kns.pl', '-stary@kns.pl'])
assert.deepEqual([...editorsSet].sort(), ['kosciol@kns.pl', 'org@kns.pl', 'reczny@kns.pl'])
ctx.bazaUdostepnij() // bez zmian w bazie — nic nie robi
assert.equal(shareLog.length, 2)
console.log('baza.gs + przypomnienie.gs: wszystkie testy OK')
