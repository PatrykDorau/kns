// Test służb (supabase/sluzby.sql): node supabase/test-sluzby.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'sluzby.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const a = await addUser(db, 'admin@kns.pl'), l = await addUser(db, 'lider@kns.pl', 'Lena Lider'), m = await addUser(db, 'marek@kns.pl', 'Marek'), z = await addUser(db, 'zosia@kns.pl', 'Zosia')
await db.query(`update people set status = 'active', roles = array['czlonek'] where email <> 'admin@kns.pl'`)
await db.query(`update people set roles = array['czlonek', 'lider'] where email = 'lider@kns.pl'`)
const A = createFakeClient(db, a), L = createFakeClient(db, l), M = createFakeClient(db, m), Z = createFakeClient(db, z)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

// do wyboru na liderów — tylko osoby z rangą „Lider”
assert.deepEqual(ok(await A.rpc('member_names')).map(p => p.name), ['Lena Lider'])
err(await A.rpc('ministry_save', { mid: 'x', new_name: 'X', new_description: '', new_seeking: true, new_leaders: [m.id] }), /rangą Lider/)
// administrator tworzy służbę z liderem
ok(await A.rpc('ministry_save', { mid: 'uwielbienie', new_name: 'Zespół uwielbienia', new_description: 'Śpiew i instrumenty', new_seeking: true, new_leaders: [l.id] }))
ok(await A.rpc('ministry_save', { mid: 'powitanie', new_name: 'Powitanie', new_description: '', new_seeking: false, new_leaders: [] }))
err(await M.rpc('ministry_save', { mid: 'x', new_name: 'X', new_description: '', new_seeking: true, new_leaders: [] }), /administrator/)
// osoba z rangą Lider zakłada własną służbę — zostaje jej liderem, może ją zmienić w całości i usunąć
ok(await L.rpc('ministry_save', { mid: 'mlodziez', new_name: 'Młodzież', new_description: '', new_seeking: false, new_leaders: [] }))
let own = ok(await L.rpc('ministry_board')).find(x => x.id === 'mlodziez')
assert.equal(own.leader, true); assert.equal(own.full, true)
err(await L.rpc('ministry_save', { mid: 'mlodziez', new_name: 'Młodzież', new_description: '', new_seeking: false, new_leaders: [m.id] }), /rangą Lider/)
ok(await L.rpc('ministry_save', { mid: 'mlodziez', new_name: 'Młodzi', new_description: '', new_seeking: false, new_leaders: [] }))
assert.deepEqual(ok(await L.rpc('ministry_board')).find(x => x.id === 'mlodziez').leaders.map(x => x.name), ['Lena Lider']) // nie usunie siebie
err(await M.rpc('ministry_delete', { mid: 'mlodziez' }), /lider/)
ok(await L.rpc('ministry_delete', { mid: 'mlodziez' }))
assert.equal(ok(await L.rpc('member_names')).length, 1)
err(await M.rpc('member_names'), /lider/)
// lider z rangą zmienia swoją służbę (nazwa wraca do poprzedniej); cudzej — nie
ok(await L.rpc('ministry_save', { mid: 'uwielbienie', new_name: 'Zespół uwielbienia', new_description: 'Gitara i wokal', new_seeking: true, new_leaders: [l.id] }))
err(await L.rpc('ministry_save', { mid: 'powitanie', new_name: 'Moje', new_description: '', new_seeking: true, new_leaders: [] }), /administrator/)
assert.equal(ok(await L.rpc('ministry_board'))[0].leader, true) // lider widzi swoją służbę jako swoją
let b = ok(await M.rpc('ministry_board'))
assert.deepEqual(b.map(x => x.name), ['Zespół uwielbienia', 'Powitanie']) // szukające najpierw
assert.equal(b[0].description, 'Gitara i wokal'); assert.equal(b[0].leaders[0].name, 'Lena Lider'); assert.equal(b[0].lead, false); assert.equal(b[0].leader, false)

// zgłoszenie członka: czeka; widzi je lider (i administrator), nie inni członkowie
err(await M.rpc('ministry_targets', { mid: 'uwielbienie' }), /Brak zgłoszenia/)
await db.query(`insert into push_devices (id, person, data) values ('tel-l', $1, '{"subscription":{"endpoint":"https://push.example/l"}}'), ('tel-a', $2, '{"subscription":{"endpoint":"https://push.example/a"}}')`, [l.id, a.id])
ok(await M.rpc('ministry_join', { mid: 'uwielbienie' }))
let t = ok(await M.rpc('ministry_targets', { mid: 'uwielbienie' }))
assert.deepEqual(t.map(x => x.id), ['tel-l']); assert.equal(t[0].who, 'Marek'); assert.equal(t[0].ministry, 'Zespół uwielbienia')
assert.equal(ok(await M.rpc('ministry_board'))[0].mine, 'pending')
assert.deepEqual(ok(await Z.rpc('ministry_board'))[0].pending, [])
assert.equal(ok(await L.rpc('ministry_board'))[0].pending[0].name, 'Marek')
assert.equal(ok(await A.rpc('ministry_board'))[0].pending.length, 1)
// inny członek nie zaakceptuje; lider — tak
err(await Z.rpc('ministry_decide', { mid: 'uwielbienie', who: m.id, accept: true }), /lider/)
ok(await L.rpc('ministry_decide', { mid: 'uwielbienie', who: m.id, accept: true }))
b = ok(await Z.rpc('ministry_board'))
assert.deepEqual(b[0].members, ['Marek'])
assert.equal(ok(await M.rpc('ministry_board'))[0].mine, 'active')
// odrzucenie i rezygnacja
ok(await Z.rpc('ministry_join', { mid: 'powitanie' }))
assert.deepEqual(ok(await Z.rpc('ministry_targets', { mid: 'powitanie' })).map(x => x.id), ['tel-a']) // służba bez lidera — administrator
ok(await A.rpc('ministry_decide', { mid: 'powitanie', who: z.id, accept: false }))
assert.equal(ok(await Z.rpc('ministry_board'))[1].mine, null)
ok(await M.rpc('ministry_leave', { mid: 'uwielbienie' }))
assert.deepEqual(ok(await Z.rpc('ministry_board'))[0].members, [])
// lider dodaje i usuwa osoby bez zgłoszenia; zwykły członek — nie
err(await M.rpc('ministry_people'), /lider/)
assert.ok(ok(await L.rpc('ministry_people')).some(p => p.name === 'Zosia'))
err(await Z.rpc('ministry_add', { mid: 'uwielbienie', who: z.id }), /lider/)
ok(await L.rpc('ministry_add', { mid: 'uwielbienie', who: z.id }))
b = ok(await L.rpc('ministry_board'))
assert.deepEqual(b[0].members, ['Zosia']); assert.deepEqual(b[0].people.map(p => p.name), ['Zosia'])
assert.deepEqual(ok(await Z.rpc('ministry_board'))[0].people, []) // lista z id tylko dla liderów
assert.equal(ok(await Z.rpc('ministry_board'))[0].mine, 'active')
ok(await L.rpc('ministry_decide', { mid: 'uwielbienie', who: z.id, accept: false }))
assert.deepEqual(ok(await L.rpc('ministry_board'))[0].members, [])
// bezpośredni dostęp do tabel zamknięty; tylko administrator usuwa służby
err(await M.from('ministry_members').select('*'), /permission denied/)
err(await L.rpc('ministry_delete', { mid: 'powitanie' }), /administrator/)
// lider bez rangi (np. rangę odebrano) — tylko opis i „szukamy”
await db.query(`update people set roles = array['czlonek'] where id = $1`, [l.id])
ok(await L.rpc('ministry_save', { mid: 'uwielbienie', new_name: 'Inna', new_description: 'Opis', new_seeking: true, new_leaders: [] }))
assert.equal(ok(await A.rpc('ministry_board'))[0].name, 'Zespół uwielbienia')
await db.query(`update people set roles = array['czlonek', 'lider'] where id = $1`, [l.id])
ok(await A.rpc('ministry_delete', { mid: 'powitanie' }))
assert.equal(ok(await A.rpc('ministry_board')).length, 1)
// osoba czekająca na zatwierdzenie nie widzi służb
await db.query(`update people set status = 'pending' where id = $1`, [z.id])
err(await Z.rpc('ministry_board'), /zatwierdzonych/)
console.log('służby: wszystkie testy OK')
