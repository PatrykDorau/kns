// Test: materiały (protokoły i pliki pomocnicze) oraz osoby do składu zespołu (materialy.sql).
// node supabase/test-materialy.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'materialy.sql', 'materialy.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, T] = await user('tech@kns.pl', 'Tomek Tech', ['czlonek', 'technika'])
const [, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [ra, R] = await user('rada@kns.pl', 'Rafał Rada', ['czlonek', 'rada'])
const [aa, A] = await user('ania@kns.pl', 'Ania Wokal', ['czlonek'])
const [ka] = await user('kuba@kns.pl', 'Kuba Bas', ['czlonek'])
const [, E] = await user('ed@kns.pl', 'Edek Edytor', ['czlonek', 'organizator'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const row = (id, kind, type) => ({ id, kind, date: '2026-10-18', data: { id, title: id, type, file: id + '.pdf' }, updated: 1 })

// technika dodaje instrukcję dla wszystkich; członek ją widzi, ale nie zmienia
ok(await T.from('protocols').upsert(row('instr', 'material', 'instrukcja')))
assert.equal(ok(await M.from('protocols').select('*')).length, 1)
err(await M.from('protocols').upsert(row('m2', 'material', 'plik')), /row-level security|permission/)
// protokół członkowski — nadal tylko protokolant i rada (technika nie)
err(await T.from('protocols').upsert(row('p1', 'czlonkowskie', 'protokol')), /row-level security|permission/)
ok(await R.from('protocols').upsert(row('p1', 'czlonkowskie', 'protokol')))
// materiał tylko dla rady
ok(await R.from('protocols').upsert(row('r1', 'rada', 'plik')))
assert.equal(ok(await M.from('protocols').select('*')).length, 2)
assert.equal(ok(await R.from('protocols').select('*')).length, 3)
err(await T.from('protocols').upsert(row('x', 'inny', 'plik')), /check|row-level/)

// skład zespołu: osoby ze służby muzycznej (członkowie i liderzy), tylko dla osób z prawem edycji
await db.query(`insert into ministries (id, name, leader_ids) values ('muz', 'Zespół uwielbienia', array[$1::uuid]), ('dzieci', 'Szkółka', '{}')`, [aa.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('muz', $1, 'active'), ('muz', $2, 'pending'), ('dzieci', $3, 'active')`, [ka.id, ra.id, ra.id])
assert.deepEqual(ok(await E.rpc('band_people')).map(p => p.name), ['Ania Wokal', 'Kuba Bas'])
err(await M.rpc('band_people'), /prawem edycji/)
console.log('materiały: wszystkie testy OK')
