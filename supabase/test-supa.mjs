// Test mobile/supa.js (dane aplikacji w Supabase) na prawdziwym schemacie i regułach dostępu w PGlite:
//   npm i --no-save @electric-sql/pglite@0.2.17 && node supabase/test-supa.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'
import { createSupa } from '../mobile/supa.js'

const db = new PGlite()
await setupDb(db, ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'zapisy.sql'].map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join(String.fromCharCode(10)), ['admin@kns.pl'])
const admin = await addUser(db, 'admin@kns.pl', 'Admin')
const ania = await addUser(db, 'ania@kns.pl', 'Ania')
const inDays = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const app = user => { const s = createSupa({ noFiles: true }, createFakeClient(db, user)); return s }
const A = app(admin), N = app(ania), G = app(null)
await Promise.all([A.ready, N.ready, G.ready])

// konta
let r = await N.api.call('me')
assert.equal(r.person.status, 'pending')
assert.equal(r.ranks.find(x => x.id === 'admin').manage, true)
r = await A.api.call('me')
assert.deepEqual(r.person.roles, ['czlonek', 'admin'])
assert.equal((await A.api.call('people')).people.length, 2)
await assert.rejects(N.api.call('setPerson', { email: 'ania@kns.pl', status: 'active' }), /administrator/)
await assert.rejects(G.api.call('me'), e => e.auth)

// czekająca osoba: pusto, zapis zabroniony
let d = await N.load()
assert.deepEqual([d.services.length, d.songs.length, d.events.length], [0, 0, 0])

// administrator zapisuje dane
const svc = { id: 's1', date: inDays(6), time: '10:00', sermonTitle: 'Światłość', songs: [], files: [], program: [{ key: 'k', offset: 0, category: 'prowadzenie' }], updated: 10, updatedBy: 'admin' }
await A.save({ service: svc, songs: [] })
await assert.rejects(A.save({ service: { ...svc, updated: 11 } }, 5), e => e.conflict)
await A.save({ service: { ...svc, sermonTitle: 'Światłość świata', updated: 12 } }, 10)
let songs = await A.saveSongs({ song: { id: 'p1', number: '1', title: 'Pieśń', text: 'a\n\nb' } })
assert.equal(songs.length, 1)
const t1 = songs[0].updated
await assert.rejects(A.saveSongs({ song: { id: 'p1', title: 'X' } }, 0), e => e.conflict && e.remote.title === 'Pieśń')
songs = await A.saveSongs({ song: { id: 'p2', title: 'Druga', text: '' } })
songs = await A.saveSongs({ remove: 'p2' })
assert.deepEqual(songs.map(s => s.id), ['p1'])
await A.saveEvent({ id: 'e1', type: 'studenckie', title: 'Studenci', date: inDays(3), program: [], updated: 1 })
await A.saveEvent({ id: 'e2', type: 'czlonkowskie', title: 'Członkowskie', date: inDays(4), program: [], updated: 1 })
const tu = await A.saveTemplates([{ id: 'studenckie', name: 'Studenci' }], 0)
await assert.rejects(A.saveTemplates([], tu - 1), e => e.conflict)
await A.saveAnnouncement({ id: 'a1', title: 'Piknik', text: 'x', audience: 'public', updated: 1 })
await A.saveAnnouncement({ id: 'a2', title: 'Rada', text: 'y', audience: 'council', updated: 1 })
await A.saveProtocol({ id: 'pr1', kind: 'czlonkowskie', title: 'Spotkanie', date: inDays(4), status: 'szkic', items: [], updated: 1 })

d = await A.load()
assert.equal(d.services[0].sermonTitle, 'Światłość świata')
assert.equal(d.services[0].program.length, 1)
assert.equal(d.events.length, 2)
assert.equal(d.templates[0].name, 'Studenci')
assert.equal(d.templatesUpdated, tu)
assert.deepEqual(d.announcements.map(a => a.id + ':' + a.audience).sort(), ['a1:public', 'a2:council'])
assert.equal((await A.loadProtocols()).filter(p => p.kind === 'czlonkowskie').length, 1)

// zatwierdzenie: członek czyta, nie zmienia; nie widzi spraw rady
await A.api.call('setPerson', { email: 'ania@kns.pl', status: 'active', roles: ['czlonek'] })
d = await N.load()
assert.deepEqual([d.services.length, d.songs.length, d.events.length], [1, 1, 2])
assert.deepEqual(d.announcements.map(a => a.id), ['a1'])
// biblioteka: członek widzi protokoły członkowskie, rady — nie
assert.deepEqual((await N.loadProtocols()).map(p => p.kind), ['czlonkowskie'])
await assert.rejects(N.save({ service: { ...svc, updated: 99 } }, 99), /uprawnień/)
await assert.rejects(N.saveProtocol({ id: 'pr2', kind: 'czlonkowskie', updated: 1 }), /uprawnień/)
// protokolant pisze, ale nie zmienia nabożeństw
await A.api.call('setPerson', { email: 'ania@kns.pl', roles: ['czlonek', 'protokolant'] })
await N.saveProtocol({ id: 'pr2', kind: 'czlonkowskie', title: 'Nowy', status: 'szkic', items: [], updated: 1 })
// członek bez prawa edycji może zgłosić wydarzenie — czeka na zatwierdzenie
await N.saveEvent({ id: 'e9', type: 'inne', updated: 1 })
assert.equal((await db.query(`select status from events where id = 'e9'`)).rows[0].status, 'pending')
// newsletter i telefon do powiadomień
assert.equal((await N.api.call('setNewsletter', { on: true })).person.newsletter, true)
await N.savePush('tel1', { subscription: {}, schedule: { day: 5, hour: 19 } })
await N.removePush('tel1')

// kalendarz Google: klucz dla zatwierdzonej osoby, gość nie dostanie
const tok = (await N.api.call('calendarToken')).token
assert.match(tok, /^[0-9a-f-]{36}$/)
assert.notEqual((await N.api.call('calendarToken', { renew: true })).token, tok)
// gość: tylko podgląd publiczny
const pub = await G.api.call('public')
assert.deepEqual(pub.events.map(e => e.title), ['Studenci'])
assert.deepEqual(pub.announcements.map(a => a.title), ['Piknik'])

// usuwanie
await A.removeEvent('e2'); await A.removeAnnouncement({ id: 'a2' }); await A.removeProtocol('pr2'); await A.remove('s1')
d = await A.load()
assert.deepEqual([d.services.length, d.events.length, d.announcements.length], [0, 2, 1]) // + zgłoszenie e9 (administrator je widzi)
assert.deepEqual(d.events.map(e => e.status).sort(), ['pending', 'published'])
console.log('supa.js: wszystkie testy OK')
