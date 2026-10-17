// Test zapisów na wydarzenia (supabase/zapisy.sql): node supabase/test-zapisy.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'zapisy.sql', 'zapisy.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const a = await addUser(db, 'admin@kns.pl', 'Admin'), l = await addUser(db, 'lider@kns.pl', 'Lena'), m = await addUser(db, 'marek@kns.pl', 'Marek'), z = await addUser(db, 'zosia@kns.pl', 'Zosia'), k = await addUser(db, 'kuba@kns.pl', 'Kuba')
await db.query(`update people set status = 'active', roles = array['czlonek'] where email <> 'admin@kns.pl'`)
await db.query(`update people set roles = array['czlonek', 'lider'] where email = 'lider@kns.pl'`) // lider ma prawo edycji
const A = createFakeClient(db, a), L = createFakeClient(db, l), M = createFakeClient(db, m), Z = createFakeClient(db, z), K = createFakeClient(db, k)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const box = async C => ok(await C.from('inbox').select('*').order('id'))
const future = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10)
const past = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)
const ev = (id, signup) => ({ id, date: future, data: { id, title: 'Wyjazd ' + id, date: future, signup } })

// bez zapisów
ok(await L.from('events').upsert(ev('e0', null)))
assert.equal(ok(await M.rpc('signup_board', { eid: 'e0' })), null)
err(await M.rpc('signup_join', { eid: 'e0', new_adults: 1, new_children: 0, new_note: '' }), /nie ma zapisów/)

// bez zatwierdzania, limit 4 (z dziećmi), potem rezerwa
ok(await L.from('events').upsert(ev('e1', { enabled: true, max: 4, kids: true, approval: false })))
assert.equal(ok(await M.rpc('signup_join', { eid: 'e1', new_adults: 2, new_children: 1, new_note: 'wegetariańskie' })), 'confirmed')
assert.equal(ok(await Z.rpc('signup_join', { eid: 'e1', new_adults: 1, new_children: 1, new_note: '' })), 'reserve') // 3 + 2 > 4
assert.equal(ok(await K.rpc('signup_join', { eid: 'e1', new_adults: 1, new_children: 0, new_note: '' })), 'confirmed') // 3 + 1 = 4
let b = ok(await Z.rpc('signup_board', { eid: 'e1' }))
assert.equal(b.taken, 4); assert.equal(b.reserve, 2); assert.equal(b.mine.status, 'reserve'); assert.equal(b.manage, false); assert.deepEqual(b.list, [])
// lista osób — tylko dla zarządzających
b = ok(await L.rpc('signup_board', { eid: 'e1' }))
assert.equal(b.manage, true); assert.deepEqual(b.list.map(x => x.name + ':' + x.status), ['Marek:confirmed', 'Zosia:reserve', 'Kuba:confirmed'])
assert.equal(b.list[0].note, 'wegetariańskie')
// Marek wypisuje się → Zosia z rezerwy wchodzi sama i dostaje powiadomienie
ok(await M.rpc('signup_leave', { eid: 'e1' }))
b = ok(await Z.rpc('signup_board', { eid: 'e1' }))
assert.equal(b.mine.status, 'confirmed'); assert.equal(b.taken, 3)
assert.match((await box(Z)).at(-1).title, /Masz miejsce/)
// dzieci, gdy wydarzenie ich nie przewiduje — liczą się tylko dorośli
ok(await L.from('events').upsert(ev('e2', { enabled: true, max: 10, kids: false })))
ok(await M.rpc('signup_join', { eid: 'e2', new_adults: 1, new_children: 3, new_note: '' }))
assert.equal(ok(await M.rpc('signup_board', { eid: 'e2' })).taken, 1)
// zamknięte zapisy (data minęła)
ok(await L.from('events').upsert(ev('e3', { enabled: true, until: past })))
assert.equal(ok(await M.rpc('signup_board', { eid: 'e3' })).open, false)
err(await M.rpc('signup_join', { eid: 'e3', new_adults: 1, new_children: 0, new_note: '' }), /zamknięte/)

// z zatwierdzaniem: twórca dostaje powiadomienie, potwierdza; brak miejsc → rezerwa
ok(await L.from('events').upsert(ev('e4', { enabled: true, max: 2, kids: true, approval: true })))
assert.equal(ok(await M.rpc('signup_join', { eid: 'e4', new_adults: 1, new_children: 1, new_note: '' })), 'pending')
assert.match((await box(L)).at(-1).title, /Zapis do zatwierdzenia: Wyjazd e4/)
assert.match((await box(L)).at(-1).body, /Marek — 2 osoby/)
err(await Z.rpc('signup_decide', { eid: 'e4', who: m.id, decision: 'confirm' }), /twórca/)
assert.equal(ok(await L.rpc('signup_decide', { eid: 'e4', who: m.id, decision: 'confirm' })), 'confirmed')
assert.match((await box(M)).at(-1).body, /potwierdzony/)
assert.equal(ok(await Z.rpc('signup_join', { eid: 'e4', new_adults: 1, new_children: 0, new_note: '' })), 'pending')
assert.equal(ok(await L.rpc('signup_decide', { eid: 'e4', who: z.id, decision: 'confirm' })), 'reserve') // 2 + 1 > 2
assert.match((await box(Z)).at(-1).body, /rezerwowej/)
// z zatwierdzaniem rezerwa nie wchodzi sama — decyduje twórca
ok(await M.rpc('signup_leave', { eid: 'e4' }))
assert.equal(ok(await Z.rpc('signup_board', { eid: 'e4' })).mine.status, 'reserve')
assert.equal(ok(await L.rpc('signup_decide', { eid: 'e4', who: z.id, decision: 'confirm' })), 'confirmed')
// usunięcie z listy
ok(await A.rpc('signup_decide', { eid: 'e4', who: z.id, decision: 'remove' }))
assert.equal(ok(await Z.rpc('signup_board', { eid: 'e4' })).mine, null)
// twórca-członek (zgłoszone i zatwierdzone wydarzenie) zarządza swoimi zapisami
ok(await M.from('events').upsert(ev('e5', { enabled: true, approval: true })))
ok(await A.from('events').update({ status: 'published' }).eq('id', 'e5'))
ok(await K.rpc('signup_join', { eid: 'e5', new_adults: 1, new_children: 0, new_note: '' }))
assert.equal(ok(await M.rpc('signup_board', { eid: 'e5' })).manage, true)
assert.equal(ok(await M.rpc('signup_decide', { eid: 'e5', who: k.id, decision: 'confirm' })), 'confirmed')
// tabela zamknięta; zgłoszenie czekające na publikację — bez zapisów
err(await M.from('event_signups').select('*'), /permission denied/)
ok(await M.from('events').upsert(ev('e6', { enabled: true })))
err(await K.rpc('signup_join', { eid: 'e6', new_adults: 1, new_children: 0, new_note: '' }), /nie ma zapisów/)
console.log('zapisy: wszystkie testy OK')
