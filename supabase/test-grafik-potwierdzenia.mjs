// Test: role w grafiku, zaproszenia z potwierdzeniem, skład na niedzielę i przypomnienia (grafik-potwierdzenia.sql).
// node supabase/test-grafik-potwierdzenia.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'materialy.sql', 'dyspozycyjnosc.sql', 'widocznosc.sql', 'sluzby2.sql', 'lider-w-sluzbie.sql', 'grafik-sluzby.sql', 'grafik-potwierdzenia.sql', 'grafik-potwierdzenia.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [o, O] = await user('ola@kns.pl', 'Ola', ['czlonek'])
const [, X] = await user('inny@kns.pl', 'Inny', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const inbox = async id => (await db.query(`select title, body from inbox where person = $1 order by created`, [id])).rows
await db.query(`insert into ministries (id, name, leader_ids) values ('uw', 'Uwielbienie', array[$1::uuid])`, [l.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('uw', $1, 'active'), ('uw', $2, 'active')`, [m.id, o.id])
const days = (await db.query(`select next_sundays(9) d`)).rows[0].d.map(d => new Date(d).toISOString().slice(0, 10))

// role: tylko lider, bez pustych i powtórek
err(await M.rpc('ministry_set_roles', { mid: 'uw', r: ['Bas'] }), /lider/)
ok(await L.rpc('ministry_set_roles', { mid: 'uw', r: ['Wokal', ' Bas ', 'bas', '', 'Perkusja'] }))
assert.deepEqual((await db.query(`select roles from ministries where id = 'uw'`)).rows[0].roles, ['Wokal', 'Bas', 'Perkusja'])

// lider wpisuje — nic nie wysłane, osoba nie widzi zaproszenia
ok(await L.rpc('schedule_toggle', { mid: 'uw', d: days[0], who: m.id }))
ok(await L.rpc('schedule_toggle', { mid: 'uw', d: days[0], who: o.id }))
ok(await L.rpc('schedule_role', { mid: 'uw', d: days[0], who: m.id, r: 'Bas' }))
err(await L.rpc('schedule_role', { mid: 'uw', d: days[1], who: m.id, r: 'Bas' }), /nie ma w grafiku/)
err(await M.rpc('schedule_role', { mid: 'uw', d: days[0], who: m.id, r: 'Wokal' }), /lider/)
assert.deepEqual(ok(await M.rpc('my_duties')), [])
err(await M.rpc('schedule_answer', { mid: 'uw', d: days[0], ok: true }), /Nie ma takiego/)

// wysyłka: dwie osoby, zaproszenie w dzwonku z rolą, stan „czeka”
assert.equal(ok(await L.rpc('schedule_publish', { mid: 'uw' })), 2)
assert.ok((await inbox(m.id)).some(x => /Zaproszenie/.test(x.title) && /\(Bas\)/.test(x.body)))
assert.equal(ok(await L.rpc('schedule_publish', { mid: 'uw' })), 0) // drugi raz nic
const duty = ok(await M.rpc('my_duties'))
assert.equal(duty.length, 1); assert.equal(duty[0].state, 'sent'); assert.equal(duty[0].role, 'Bas')

// odpowiedzi: przyjmuję; nie mogę → lider w dzwonku, dyspozycyjność zgodna
ok(await M.rpc('schedule_answer', { mid: 'uw', d: days[0], ok: true }))
ok(await O.rpc('schedule_answer', { mid: 'uw', d: days[0], ok: false }))
assert.ok((await inbox(l.id)).some(x => /Ola nie może/.test(x.title)))
assert.equal((await db.query(`select state from ministry_availability where person = $1 and day = $2`, [o.id, days[0]])).rows[0].state, 'no')
const board = ok(await L.rpc('availability_board'))[0]
assert.deepEqual(board.roles, ['Wokal', 'Bas', 'Perkusja'])
assert.equal(board.detail[days[0]][m.id].state, 'yes')
assert.equal(board.detail[days[0]][o.id].state, 'no')

// skład na niedzielę — każdy zatwierdzony członek, bez wpisów „new”
ok(await L.rpc('schedule_toggle', { mid: 'uw', d: days[0], who: l.id }).catch(() => ({ error: null, data: null })))
const line = ok(await X.rpc('sunday_lineup'))
assert.equal(line.day, days[0])
assert.equal(line.ministries.length, 1)
assert.deepEqual(line.ministries[0].people.map(p => [p.name, p.role, p.state]), [['Marek', 'Bas', 'yes'], ['Ola', '', 'no']])

// przypomnienia: zaproszenie bez odpowiedzi od 3 dni → raz; przyjęta służba za 2 dni → raz
ok(await L.rpc('schedule_toggle', { mid: 'uw', d: days[1], who: o.id }))
ok(await L.rpc('schedule_publish', { mid: 'uw' }))
await db.query(`update ministry_schedule set sent = now() - interval '3 days' where person = $1 and day = $2`, [o.id, days[1]])
const today = (await db.query(`select (now() at time zone 'Europe/Warsaw')::date + 2 as d`)).rows[0].d
await db.query(`update ministry_schedule set day = $1 where person = $2 and day = $3`, [today, m.id, days[0]])
assert.equal(ok(await X.rpc('schedule_reminders')), 2)
assert.equal(ok(await X.rpc('schedule_reminders')), 0)
assert.ok((await inbox(m.id)).some(x => /W niedzielę służysz/.test(x.title)))
assert.ok((await inbox(o.id)).some(x => /Czekamy na odpowiedź/.test(x.title)))
console.log('grafik — potwierdzenia: OK')
