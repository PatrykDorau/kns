// Test: projekty i zadania (zadania.sql). node supabase/test-zadania.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'materialy.sql', 'dyspozycyjnosc.sql', 'widocznosc.sql', 'sluzby2.sql', 'lider-w-sluzbie.sql', 'zadania.sql', 'zadania.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [o, O] = await user('ola@kns.pl', 'Ola', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
await db.query(`insert into ministries (id, name, leader_ids) values ('tech', 'Technika', array[$1::uuid])`, [l.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('tech', $1, 'active')`, [m.id])

// tablice: Ola widzi tylko kościół, Marek — kościół i Technikę; zmieniać może Lena (lider)
assert.deepEqual(ok(await O.rpc('tasks_board')).map(b => b.name), ['Cały kościół'])
const mb = ok(await M.rpc('tasks_board'))
assert.deepEqual(mb.map(b => [b.name, b.edit]), [['Cały kościół', false], ['Technika', false]])
assert.equal(ok(await L.rpc('tasks_board')).find(b => b.id === 'tech').edit, true)

// dodawanie: zwykły członek nie, lider tak; przypisanie → dzwonek
err(await M.rpc('task_save', { t: { board: 'tech', title: 'Kable' } }), /lider/)
err(await L.rpc('task_save', { t: { board: 'tech', title: '  ' } }), /Wpisz/)
const id = ok(await L.rpc('task_save', { t: { board: 'tech', title: 'Kupić kable XLR', assignee: m.id, due: '2026-12-01', priority: 'high' } }))
assert.ok((await db.query(`select title from inbox where person = $1`, [m.id])).rows.some(x => /Kupić kable/.test(x.title)))
const tk = ok(await M.rpc('tasks_board')).find(b => b.id === 'tech').tasks[0]
assert.equal(tk.who, 'Marek'); assert.equal(tk.mine, true); assert.equal(tk.priority, 'high')
// Ola nie widzi zadań Techniki ani nie zmieni statusu
err(await O.rpc('task_status', { tid: id, st: 'done' }), /przypisana/)
// osoba przypisana zmienia status, nie może usunąć
ok(await M.rpc('task_status', { tid: id, st: 'doing' }))
err(await M.rpc('task_delete', { tid: id }), /lider/)
assert.deepEqual(ok(await M.rpc('my_tasks')).map(t => [t.title, t.status, t.board]), [['Kupić kable XLR', 'doing', 'Technika']])
ok(await M.rpc('task_status', { tid: id, st: 'done' }))
assert.deepEqual(ok(await M.rpc('my_tasks')), [])
// tablica kościoła: lider dowolnej służby może dodawać
ok(await L.rpc('task_save', { t: { board: '', title: 'Remont sali' } }))
err(await O.rpc('task_save', { t: { board: '', title: 'x' } }), /lider/)
ok(await L.rpc('task_delete', { tid: id }))
assert.equal((await db.query(`select count(*)::int n from tasks`)).rows[0].n, 1)
console.log('zadania: OK')
