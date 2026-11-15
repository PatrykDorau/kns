// Test: samodzielne zapisy do grafiku (grafik-zapisy.sql). node supabase/test-grafik-zapisy.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'materialy.sql', 'dyspozycyjnosc.sql', 'widocznosc.sql', 'sluzby2.sql', 'lider-w-sluzbie.sql', 'grafik-sluzby.sql', 'grafik-potwierdzenia.sql', 'grafik-zapisy.sql', 'grafik-zapisy.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, X] = await user('inny@kns.pl', 'Inny', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const inbox = async id => (await db.query(`select title from inbox where person = $1 order by id`, [id])).rows.map(r => r.title)
await db.query(`insert into ministries (id, name, leader_ids, roles) values ('uw', 'Uwielbienie', array[$1::uuid], '{Wokal,Bas}')`, [l.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('uw', $1, 'active')`, [m.id])
const days = (await db.query(`select next_sundays(9) d`)).rows[0].d.map(d => new Date(d).toISOString().slice(0, 10))
const board = async C => ok(await C.rpc('availability_board', { weeks: 9 })).find(x => x.id === 'uw')

// domyślnie wyłączone — członek nie może się zapisać
assert.equal((await board(M)).self, false)
err(await M.rpc('schedule_self', { mid: 'uw', d: days[1], joining: true, r: '' }), /układa lider/)
// włącza tylko lider
err(await M.rpc('ministry_set_self', { mid: 'uw', on_: true }), /lider/)
ok(await L.rpc('ministry_set_self', { mid: 'uw', on_: true }))
assert.equal((await board(M)).self, true)
// zapis z rolą: od razu „przyjął”, dyspozycyjność „mogę”, lider dostaje powiadomienie
ok(await M.rpc('schedule_self', { mid: 'uw', d: days[1], joining: true, r: 'Bas' }))
let b = await board(L)
assert.deepEqual(b.detail[days[1]][m.id], { state: 'yes', role: 'Bas' })
assert.equal((await board(M)).mine[days[1]], 'yes')
assert.ok((await inbox(l.id)).some(t => t.startsWith('Grafik: Uwielbienie — Marek zapisał(a) się na')))
// zła rola, zła data, osoba spoza służby
err(await M.rpc('schedule_self', { mid: 'uw', d: days[2], joining: true, r: 'Perkusja' }), /roli/)
err(await M.rpc('schedule_self', { mid: 'uw', d: '2020-01-05', joining: true, r: '' }), /niedziel/)
err(await X.rpc('schedule_self', { mid: 'uw', d: days[1], joining: true, r: '' }), /służą/)
// zmiana roli tym samym zapisem, potem wypisanie — lider wie
ok(await M.rpc('schedule_self', { mid: 'uw', d: days[1], joining: true, r: 'Wokal' }))
assert.equal((await board(L)).detail[days[1]][m.id].role, 'Wokal')
ok(await M.rpc('schedule_self', { mid: 'uw', d: days[1], joining: false }))
assert.equal((await board(L)).detail[days[1]], undefined)
assert.ok((await inbox(l.id)).some(t => t.includes('wypisał(a) się z')))
// wpis od lidera (jeszcze niewysłany) — nie da się go usunąć wypisaniem
ok(await L.rpc('schedule_toggle', { mid: 'uw', d: days[3], who: m.id }))
err(await M.rpc('schedule_self', { mid: 'uw', d: days[3], joining: false }), /Nie mogę/)
assert.equal((await board(L)).detail[days[3]][m.id].state, 'new')
// tytuł pasuje do modułu „grafik” (wyciszanie powiadomień)
console.log('grafik-zapisy: OK')
