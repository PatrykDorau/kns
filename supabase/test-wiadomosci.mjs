// Test: wiadomości do rang i służb (wiadomosci.sql), terminarz ASB dla gości i przypomnienia dla prowadzących (asb.sql).
// node supabase/test-wiadomosci.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'asb.sql', 'wiadomosci.sql', 'wiadomosci.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [pa, P] = await user('pastor@kns.pl', 'Piotr Pastor', ['czlonek', 'pastor'])
const [la, L] = await user('lider.asb@kns.pl', 'Konrad Nowak', ['czlonek', 'lider', 'asb'])
const [sa, S] = await user('student@kns.pl', 'Szymon Kowal', ['czlonek', 'asb'])
const [ma, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [za, Z] = await user('zosia@kns.pl', 'Zosia', ['czlonek', 'lider'])
const G = createFakeClient(db) // gość
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const box = async email => (await db.query(`select i.* from inbox i join people p on p.id = i.person where p.email = $1 order by i.id`, [email])).rows
const clear = () => db.query('delete from inbox')

await db.query(`insert into ministries (id, name, leader_ids) values ('muz', 'Zespół muzyczny', array[$1::uuid]), ('dzieci', 'Dzieci', '{}')`, [za.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('muz', $1, 'active'), ('dzieci', $2, 'active')`, [ma.id, sa.id])

await clear()
// Pastor: do każdej rangi i służby
let o = ok(await P.rpc('broadcast_options'))
assert.ok(o.ranks.some(r => r.id === 'asb' && r.count === 2)); assert.equal(o.ministries.length, 2)
assert.equal(ok(await P.rpc('broadcast_send', { title: 'Modlitwa', body: 'W czwartek o 19:00', url: '', ranks: ['asb'], ministries: ['muz'] })), 4)
let b = await box('marek@kns.pl')
assert.equal(b[0].title, 'Modlitwa'); assert.equal(b[0].body, 'W czwartek o 19:00 — Piotr Pastor'); assert.equal(b[0].url, './')
assert.equal((await box('zosia@kns.pl')).length, 1) // lider służby też dostaje
assert.equal((await box('pastor@kns.pl')).length, 0) // nadawca nie
// Lider ASB: tylko ranga ASB
o = ok(await L.rpc('broadcast_options'))
assert.deepEqual(o.ranks.map(r => r.id), ['asb']); assert.deepEqual(o.ministries, [])
await clear()
assert.equal(ok(await L.rpc('broadcast_send', { title: 'ASB we wtorek', body: '', url: './?asb=x', ranks: ['asb'], ministries: [] })), 1)
assert.equal((await box('student@kns.pl'))[0].body, 'Konrad Nowak')
err(await L.rpc('broadcast_send', { title: 'x', body: '', url: '', ranks: ['czlonek'], ministries: [] }), /pastor, rada/)
// Lider służby: tylko swoja służba
o = ok(await Z.rpc('broadcast_options'))
assert.deepEqual(o.ranks, []); assert.deepEqual(o.ministries.map(m => m.id), ['muz'])
ok(await Z.rpc('broadcast_send', { title: 'Próba', body: 'sobota', url: '', ranks: [], ministries: ['muz'] }))
err(await Z.rpc('broadcast_send', { title: 'Próba', body: '', url: '', ranks: [], ministries: ['dzieci'] }), /swoich|liderem/)
// Zwykły członek: nic
o = ok(await M.rpc('broadcast_options'))
assert.deepEqual(o, { ranks: [], ministries: [] })
err(await M.rpc('broadcast_send', { title: 'x', body: '', url: '', ranks: ['asb'], ministries: [] }), /pastor, rada/)
err(await G.rpc('broadcast_send', { title: 'x', body: '', url: '', ranks: ['asb'], ministries: [] }), /permission|Brak/)
err(await P.rpc('broadcast_send', { title: ' ', body: '', url: '', ranks: ['asb'], ministries: [] }), /tytuł/)

// Terminarz ASB dla gości: bez wewnętrznych, przerw, prowadzących i notatek
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
await db.query(`insert into asb_meetings (id, season, sort, kind, date, topic, leader, helper, place, note) values
  ('a1', 's', 1, 'cykliczne', $1, 'Kim jest Jezus?', 'Konrad', 'Szymon', 'Studnia', 'tajne'),
  ('a2', 's', 2, 'wewnetrzne', $2, 'Organizacyjne', 'Konrad', '', '', ''),
  ('a3', 's', 3, 'cykliczne', $3, '', 'Przerwa', '', '', ''),
  ('a4', 's', 4, 'ewangelizacyjne', $4, 'Kampus', 'Ktoś', '', 'Aula', ''),
  ('a5', 's', 5, 'cykliczne', $5, 'Za rok', 'Szymon', '', '', '')`, [day(2), day(3), day(9), day(10), day(400)])
const pub = ok(await G.rpc('asb_public'))
assert.deepEqual(pub.map(m => m.id), ['a1', 'a4'])
assert.equal(JSON.stringify(pub).includes('tajne') || JSON.stringify(pub).includes('Konrad'), false)
// Podpowiedzi prowadzących — tylko ASB
assert.deepEqual(ok(await S.rpc('asb_people')).map(p => p.name), ['Konrad Nowak', 'Szymon Kowal'])
err(await M.rpc('asb_people'), /Brak dostępu/)

// Przypomnienia dla prowadzących: 3 dni przed (po imieniu albo imieniu i nazwisku), raz na termin; telefony — inbox_push_due
await clear()
await db.query(`insert into push_devices (id, person, data) values ('tel-k', $1, '{"subscription": {"endpoint": "https://x"}}')`, [la.id])
assert.equal(ok(await G.rpc('asb_leader_reminders')), 3) // a1: Konrad i Szymon, a2 (wewnętrzne): Konrad
const k = await box('lider.asb@kns.pl')
assert.ok(k.some(x => x.title === 'Prowadzisz spotkanie ASB za 2 dni' && x.url === './?asb=a1' && x.body.startsWith('Kim jest Jezus?')))
assert.equal((await box('student@kns.pl'))[0].title, 'Prowadzisz spotkanie ASB za 2 dni')
assert.equal(ok(await G.rpc('asb_leader_reminders')), 0) // drugi raz nic
const due = ok(await G.rpc('inbox_push_due'))
assert.equal(due.length, k.length); assert.equal(due[0].id, 'tel-k')
assert.equal(ok(await G.rpc('inbox_push_due')).length, 0) // raz
// zmiana terminu → nowe przypomnienie
await db.query(`update asb_meetings set date = $1 where id = 'a1'`, [day(1)])
assert.equal(ok(await G.rpc('asb_leader_reminders')), 2)
assert.ok((await box('student@kns.pl')).some(x => x.title === 'Prowadzisz spotkanie ASB jutro'))
// niejednoznaczne imię → bez przypomnienia
await user('konrad2@kns.pl', 'Konrad Inny', ['czlonek', 'asb'])
await db.query(`update asb_meetings set date = $1, helper = '' where id = 'a1'`, [day(0)])
assert.equal(ok(await G.rpc('asb_leader_reminders')), 0)
console.log('wiadomości: wszystkie testy OK')
