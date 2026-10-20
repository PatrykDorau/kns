// Test powiadomień w aplikacji (supabase/skrzynka.sql): node supabase/test-skrzynka.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'skrzynka.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const a = await addUser(db, 'admin@kns.pl', 'Admin'), l = await addUser(db, 'lider@kns.pl', 'Lena Lider'), m = await addUser(db, 'marek@kns.pl', 'Marek'), n = await addUser(db, 'news@kns.pl', 'Nina')
await db.query(`update people set status = 'active', roles = array['czlonek'] where email <> 'admin@kns.pl'`)
await db.query(`update people set roles = array['czlonek', 'lider'] where email = 'lider@kns.pl'`)
await db.query(`update people set roles = array['czlonek', 'newsletter'] where email = 'news@kns.pl'`)
const A = createFakeClient(db, a), L = createFakeClient(db, l), M = createFakeClient(db, m), N = createFakeClient(db, n)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const box = async C => ok(await C.from('inbox').select('*').order('id'))

// wysyłka do wybranych: tylko z prawem edycji; trafia do wybranych (bez nadawcy)
err(await M.rpc('inbox_send', { targets: [l.id], title: 'X', body: '', url: '' }), /prawem edycji/)
assert.equal(ok(await A.rpc('inbox_send', { targets: [l.id, m.id, a.id], title: 'Próba zespołu', body: 'Wtorek 19:00', url: './?wydarzenie=e1' })), 2)
assert.deepEqual((await box(M)).map(x => x.title), ['Próba zespołu'])
assert.equal((await box(A)).length, 0)
// każdy widzi tylko swoje; oznacza jako przeczytane; nie zmieni treści ani nie doda wpisu
const mine = (await box(M))[0]
ok(await M.from('inbox').update({ read: true }).eq('id', mine.id))
assert.equal((await box(M))[0].read, true)
err(await M.from('inbox').update({ title: 'zmiana' }).eq('id', mine.id), /permission denied/)
err(await M.from('inbox').upsert({ person: m.id, title: 'fałszywe' }), /permission denied/)
err(await M.rpc('inbox_add', { targets: [l.id], t: 'x', b: '', u: '' }), /permission denied/)
assert.equal((await box(L)).length, 1)

// zgłoszenie wydarzenia przez członka → zatwierdzający (admin, lider newslettera)
ok(await M.from('events').upsert({ id: 'e2', date: '2026-11-01', data: { id: 'e2', title: 'Wieczór gier', date: '2026-11-01' } }))
assert.equal((await box(N)).at(-1).title, 'Nowe zgłoszenie do zatwierdzenia')
assert.equal((await box(N)).at(-1).url, './?wydarzenie=e2')
assert.equal((await box(A)).at(-1).body, 'Wieczór gier')
assert.equal((await box(L)).length, 1) // zwykły lider nie zatwierdza

// zgłoszenie do służby → lider; akceptacja → zgłaszający
ok(await A.rpc('ministry_save', { mid: 'tech', new_name: 'Technika', new_description: '', new_seeking: true, new_leaders: [l.id] }))
ok(await M.rpc('ministry_join', { mid: 'tech' }))
assert.equal((await box(L)).at(-1).title, 'Zgłoszenie do służby: Technika')
assert.match((await box(L)).at(-1).body, /Marek/)
ok(await L.rpc('ministry_decide', { mid: 'tech', who: m.id, accept: true }))
assert.equal((await box(M)).at(-1).title, 'Przyjęto Cię do służby: Technika')
// służba bez lidera → administrator; odrzucenie → informacja
ok(await A.rpc('ministry_save', { mid: 'pow', new_name: 'Powitanie', new_description: '', new_seeking: true, new_leaders: [] }))
ok(await N.rpc('ministry_join', { mid: 'pow' }))
assert.equal((await box(A)).at(-1).title, 'Zgłoszenie do służby: Powitanie')
ok(await A.rpc('ministry_decide', { mid: 'pow', who: n.id, accept: false }))
assert.match((await box(N)).at(-1).body, /nie przyjął/)
// wycofanie własnego zgłoszenia — bez wpisu
const before = (await box(M)).length
ok(await M.rpc('ministry_join', { mid: 'pow' })); ok(await M.rpc('ministry_leave', { mid: 'pow' }))
assert.equal((await box(M)).length, before)
// dodanie przez lidera i usunięcie ze służby → informacja dla tej osoby
ok(await L.rpc('ministry_add', { mid: 'tech', who: n.id }))
assert.equal((await box(N)).at(-1).title, 'Dodano Cię do służby: Technika')
ok(await L.rpc('ministry_decide', { mid: 'tech', who: n.id, accept: false }))
assert.match((await box(N)).at(-1).body, /usunął/)
// rezygnacja (Marek służy w technice) → lider dostaje informację
ok(await M.rpc('ministry_leave', { mid: 'tech' }))
assert.equal((await box(L)).at(-1).title, 'Rezygnacja ze służby: Technika')
assert.match((await box(L)).at(-1).body, /Marek/)
// usuwanie swoich wpisów
ok(await M.from('inbox').delete().eq('id', mine.id))
assert.equal((await box(M)).length, before - 1)
// telefony do świeżych wpisów: tylko wpisy nadawcy, tylko odbiorcy z telefonem, raz
for (const C of [A, L, M, N]) ok(await C.rpc('inbox_push_batch')) // wcześniejsze wpisy
await db.query(`insert into push_devices (id, person, data) values ('tel-m', $1, '{"subscription":{"endpoint":"https://push.example/m"}}'), ('tel-x', $2, '{"schedule":{}}')`, [m.id, l.id])
ok(await A.rpc('inbox_send', { targets: [m.id, l.id], title: 'Próba push', body: 'treść', url: './?wydarzenie=e9' }))
assert.deepEqual(ok(await L.rpc('inbox_push_batch')), []) // cudze wpisy — nic
let push = ok(await A.rpc('inbox_push_batch'))
assert.ok(push.some(x => x.id === 'tel-m' && x.title === 'Próba push' && x.url === './?wydarzenie=e9'))
assert.ok(!push.some(x => x.id === 'tel-x')) // telefon bez powiadomień
assert.deepEqual(ok(await A.rpc('inbox_push_batch')), []) // drugi raz — nic
// zgłoszenie do służby: nadawcą jest zgłaszający
ok(await A.rpc('ministry_save', { mid: 'mlodzi', new_name: 'Młodzi', new_description: '', new_seeking: true, new_leaders: [] }))
await db.query(`insert into push_devices (id, person, data) values ('tel-a', $1, '{"subscription":{"endpoint":"https://push.example/a"}}')`, [a.id])
ok(await M.rpc('ministry_join', { mid: 'mlodzi' }))
assert.deepEqual(ok(await M.rpc('inbox_push_batch')).map(x => x.title), ['Zgłoszenie do służby: Młodzi'])

// próbny newsletter: kolejka, najwyżej raz na 10 minut; każdy widzi tylko swoje prośby
assert.ok(ok(await M.rpc('request_test_newsletter')) > 0)
err(await M.rpc('request_test_newsletter'), /kilka minut/)
assert.equal((ok(await M.from('mail_requests').select('*'))).length, 1)
assert.equal((ok(await L.from('mail_requests').select('*'))).length, 0)
err(await M.from('mail_requests').upsert({ person: m.id }), /permission denied/)
console.log('skrzynka: wszystkie testy OK')
