// Test: informacje wewnętrzne służby i materiały tylko dla służb (sluzby2.sql). node supabase/test-sluzby2.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'materialy.sql', 'kalendarz.sql', 'widocznosc.sql', 'sluzby2.sql', 'sluzby2.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [t, T] = await user('tech@kns.pl', 'Tomek', ['czlonek'])
const [, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
// lider bez prawa edycji materiałów (zwykła ranga „lider” ma edycję — tu sprawdzamy członka-lidera bez niej)
await db.query(`update ranks set can_edit = false where id = 'lider'`)
await db.query(`insert into ministries (id, name, leader_ids) values ('tech', 'Technika', array[$1::uuid])`, [l.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('tech', $1, 'active')`, [t.id])

// ASB jest na liście służb
assert.ok(ok(await M.rpc('ministry_board')).some(m => m.id === 'asb'))
// informacje wewnętrzne
err(await T.rpc('ministry_set_internal', { mid: 'tech', txt: 'X' }), /lider/)
ok(await L.rpc('ministry_set_internal', { mid: 'tech', txt: 'Klucz do szafy: u Tomka' }))
assert.equal(ok(await T.rpc('ministry_board')).find(m => m.id === 'tech').internal, 'Klucz do szafy: u Tomka')
assert.equal(ok(await M.rpc('ministry_board')).find(m => m.id === 'tech').internal, null) // spoza służby nie widzi
// materiał tylko dla służby: lider dodaje, członek widzi, inni nie
const mat = (id, ministries) => ({ id, kind: 'material', ministries, data: { id, title: 'Instrukcja ' + id, type: 'instrukcja' }, updated: 1 })
ok(await L.from('protocols').upsert(mat('m-tech', ['tech'])))
err(await L.from('protocols').upsert(mat('m-all', [])), /row-level|permission/) // dla wszystkich — tylko z prawem do materiałów
err(await T.from('protocols').upsert(mat('m-x', ['tech'])), /row-level|permission/) // członek (nie lider) nie dodaje
assert.deepEqual(ok(await T.from('protocols').select('id')).map(r => r.id), ['m-tech'])
assert.deepEqual(ok(await M.from('protocols').select('id')).map(r => r.id), [])
console.log('służby 2: wszystkie testy OK')
