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
const A = createFakeClient(db, a), L = createFakeClient(db, l), M = createFakeClient(db, m), Z = createFakeClient(db, z)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

// administrator tworzy służbę z liderem
ok(await A.rpc('ministry_save', { mid: 'uwielbienie', new_name: 'Zespół uwielbienia', new_description: 'Śpiew i instrumenty', new_seeking: true, new_leaders: [l.id] }))
ok(await A.rpc('ministry_save', { mid: 'powitanie', new_name: 'Powitanie', new_description: '', new_seeking: false, new_leaders: [] }))
err(await M.rpc('ministry_save', { mid: 'x', new_name: 'X', new_description: '', new_seeking: true, new_leaders: [] }), /administrator/)
// lider zmienia opis i „szukamy”, ale nie nazwę ani liderów
ok(await L.rpc('ministry_save', { mid: 'uwielbienie', new_name: 'Zmieniona', new_description: 'Gitara i wokal', new_seeking: true, new_leaders: [] }))
let b = ok(await M.rpc('ministry_board'))
assert.deepEqual(b.map(x => x.name), ['Zespół uwielbienia', 'Powitanie']) // szukające najpierw
assert.equal(b[0].description, 'Gitara i wokal'); assert.equal(b[0].leaders[0].name, 'Lena Lider'); assert.equal(b[0].lead, false)

// zgłoszenie członka: czeka; widzi je lider (i administrator), nie inni członkowie
ok(await M.rpc('ministry_join', { mid: 'uwielbienie' }))
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
ok(await A.rpc('ministry_decide', { mid: 'powitanie', who: z.id, accept: false }))
assert.equal(ok(await Z.rpc('ministry_board'))[1].mine, null)
ok(await M.rpc('ministry_leave', { mid: 'uwielbienie' }))
assert.deepEqual(ok(await Z.rpc('ministry_board'))[0].members, [])
// bezpośredni dostęp do tabel zamknięty; tylko administrator usuwa służby
err(await M.from('ministry_members').select('*'), /permission denied/)
err(await L.rpc('ministry_delete', { mid: 'powitanie' }), /administrator/)
ok(await A.rpc('ministry_delete', { mid: 'powitanie' }))
assert.equal(ok(await A.rpc('ministry_board')).length, 1)
// osoba czekająca na zatwierdzenie nie widzi służb
await db.query(`update people set status = 'pending' where id = $1`, [z.id])
err(await Z.rpc('ministry_board'), /zatwierdzonych/)
console.log('służby: wszystkie testy OK')
