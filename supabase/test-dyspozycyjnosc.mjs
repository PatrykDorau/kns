// Test: dyspozycyjność w służbach (dyspozycyjnosc.sql) — członek zaznacza niedziele, lider widzi tabelę i przypomina.
// node supabase/test-dyspozycyjnosc.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'dyspozycyjnosc.sql', 'dyspozycyjnosc.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles, status = 'active') => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = $4, name = $2, roles = $3 where email = $1`, [email, name, roles, status])
  return [u, createFakeClient(db, u)]
}
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [k, K] = await user('kasia@kns.pl', 'Kasia', ['czlonek'])
const [, O] = await user('obcy@kns.pl', 'Olek', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
await db.query(`insert into ministries (id, name, leader_ids) values ('tech', 'Technika', array[$1::uuid])`, [l.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('tech', $1, 'active'), ('tech', $2, 'active')`, [m.id, k.id])

// niedziele
const days = (await db.query(`select next_sundays(9) d`)).rows[0].d.map(d => new Date(d).toISOString().slice(0, 10))
assert.equal(days.length, 9)
for (const d of days) assert.equal(new Date(d + 'T12:00:00Z').getUTCDay(), 0)

// członek: tablica i odpowiedzi
let mine = ok(await M.rpc('availability_board'))
assert.equal(mine.length, 1); assert.equal(mine[0].member, true); assert.equal(mine[0].lead, false); assert.deepEqual(mine[0].people, [])
ok(await M.rpc('availability_set', { mid: 'tech', d: days[0], st: 'yes' }))
ok(await M.rpc('availability_set', { mid: 'tech', d: days[1], st: 'no' }))
ok(await M.rpc('availability_set', { mid: 'tech', d: days[1], st: 'maybe' })) // zmiana
ok(await K.rpc('availability_set', { mid: 'tech', d: days[0], st: 'no' }))
mine = ok(await M.rpc('availability_board'))[0].mine
assert.equal(mine[days[0]], 'yes'); assert.equal(mine[days[1]], 'maybe')
ok(await M.rpc('availability_set', { mid: 'tech', d: days[1], st: null })) // usunięcie
assert.equal(ok(await M.rpc('availability_board'))[0].mine[days[1]], undefined)
err(await M.rpc('availability_set', { mid: 'tech', d: '2020-01-05', st: 'yes' }), /niedziel/)
const monday = new Date(new Date(days[1] + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10)
err(await M.rpc('availability_set', { mid: 'tech', d: monday, st: 'yes' }), /niedziel/)
err(await M.rpc('availability_set', { mid: 'tech', d: days[0], st: 'zle' }), /Nieznana/)
err(await O.rpc('availability_set', { mid: 'tech', d: days[0], st: 'yes' }), /służą/)
assert.equal(ok(await O.rpc('availability_board')).length, 0) // spoza służby nic nie widzi

// lider: tabela całej służby
const board = ok(await L.rpc('availability_board'))[0]
assert.equal(board.lead, true)
assert.deepEqual(board.people.map(p => p.name).sort(), ['Kasia', 'Marek'])
assert.equal(board.people.find(p => p.name === 'Marek').states[days[0]], 'yes')
assert.equal(board.people.find(p => p.name === 'Kasia').states[days[0]], 'no')

// przypomnienie: obaj nie podali wszystkich 4 niedziel
err(await M.rpc('availability_remind', { mid: 'tech' }), /lider/)
assert.equal(ok(await L.rpc('availability_remind', { mid: 'tech' })), 2)
for (const d of days.slice(0, 4)) ok(await K.rpc('availability_set', { mid: 'tech', d, st: 'yes' }))
assert.equal(ok(await L.rpc('availability_remind', { mid: 'tech' })), 1)
const n = (await db.query(`select count(*)::int n from inbox where title like 'Dyspozycyjność:%'`)).rows[0].n
assert.equal(n, 3)
// bezpośredni dostęp zamknięty
err(await M.from('ministry_availability').select('*'), /permission|denied|row-level/)
console.log('dyspozycyjność: wszystkie testy OK')
