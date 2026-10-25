// Test: dyspozycyjność zablokowana na niedzielę z grafiku, gdy osoba potwierdziła „mogę” (grafik-sluzby.sql).
// node supabase/test-grafik-blokada.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'materialy.sql', 'dyspozycyjnosc.sql', 'widocznosc.sql', 'sluzby2.sql', 'lider-w-sluzbie.sql', 'grafik-sluzby.sql', 'grafik-sluzby.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
await db.query(`insert into ministries (id, name, leader_ids) values ('tech', 'Technika', array[$1::uuid])`, [l.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('tech', $1, 'active')`, [m.id])
const days = (await db.query(`select next_sundays(9) d`)).rows[0].d.map(d => new Date(d).toISOString().slice(0, 10))

ok(await M.rpc('availability_set', { mid: 'tech', d: days[0], st: 'yes' }))
ok(await M.rpc('availability_set', { mid: 'tech', d: days[1], st: 'maybe' }))
ok(await L.rpc('schedule_toggle', { mid: 'tech', d: days[0], who: m.id }))
ok(await L.rpc('schedule_toggle', { mid: 'tech', d: days[1], who: m.id }))
// w grafiku i potwierdzone „mogę” — bez zmiany i bez usunięcia
err(await M.rpc('availability_set', { mid: 'tech', d: days[0], st: 'no' }), /w grafiku/)
err(await M.rpc('availability_set', { mid: 'tech', d: days[0], st: null }), /w grafiku/)
ok(await M.rpc('availability_set', { mid: 'tech', d: days[0], st: 'yes' })) // bez zmiany — można
// w grafiku, ale nie potwierdził („nie wiem”) — może zmienić
ok(await M.rpc('availability_set', { mid: 'tech', d: days[1], st: 'no' }))
// lider zdejmuje z grafiku — znów można zmienić
ok(await L.rpc('schedule_toggle', { mid: 'tech', d: days[0], who: m.id }))
ok(await M.rpc('availability_set', { mid: 'tech', d: days[0], st: 'no' }))
console.log('grafik — blokada: OK')
