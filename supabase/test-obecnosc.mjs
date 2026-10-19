// Test: meldowanie się na spotkaniach (obecnosc.sql) — członkowie w dniu spotkania, liczba obecnych, lista dla rady.
// node supabase/test-obecnosc.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'kalendarz.sql', 'wybory.sql', 'obecnosc.sql', 'obecnosc.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles, status = 'active') => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = $4, name = $2, roles = $3 where email = $1`, [email, name, roles, status])
  return [u, createFakeClient(db, u)]
}
const [, R] = await user('rada@kns.pl', 'Rafał', ['czlonek', 'rada'])
const [, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, K] = await user('kasia@kns.pl', 'Kasia', ['czlonek'])
const [, P] = await user('nowy@kns.pl', 'Nowy', [], 'pending')
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const ev = (id, type, days) => db.query(`insert into events (id, type, date, data) values ($1, $2, current_date + $3::int, '{}')`, [id, type, days])
await ev('c1', 'czlonkowskie', 0); await ev('c2', 'czlonkowskie', 3); await ev('r1', 'rada', 0); await ev('i1', 'inicjatywa', 0)

assert.equal(ok(await M.rpc('event_checkin', { eid: 'c1' })), 1)
assert.equal(ok(await K.rpc('event_checkin', { eid: 'c1' })), 2)
assert.equal(ok(await K.rpc('event_checkin', { eid: 'c1' })), 2) // drugi raz — bez zmian
err(await M.rpc('event_checkin', { eid: 'c2' }), /w dniu/)
err(await M.rpc('event_checkin', { eid: 'i1' }), /nie ma meldowania/)
err(await M.rpc('event_checkin', { eid: 'r1' }), /rada/)
ok(await R.rpc('event_checkin', { eid: 'r1' }))
err(await P.rpc('event_checkin', { eid: 'c1' }), /zatwierdzeni/)

const mine = ok(await M.rpc('event_attendance_info', { eid: 'c1' }))
assert.equal(mine.count, 2); assert.equal(mine.members, 3); assert.equal(mine.me, true); assert.equal(mine.names, null) // członek nie widzi nazwisk
const rada = ok(await R.rpc('event_attendance_info', { eid: 'c1' }))
assert.deepEqual(rada.names, ['Kasia', 'Marek']); assert.equal(rada.me, false)
assert.equal(ok(await K.rpc('event_checkin', { eid: 'c1', on_: false })), 1) // wycofanie
assert.equal((await db.query(`select count(*)::int n from event_attendance`)).rows[0].n, 2)
assert.equal((await M.from('event_attendance').select('*')).data?.length || 0, 0) // bez bezpośredniego dostępu
console.log('obecność: wszystkie testy OK')
