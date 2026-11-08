// Test: finanse służb (finanse.sql) i zapisy z wpłatami (zapisy-wplaty.sql). node supabase/test-finanse.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'zapisy.sql', 'zapisy-wplaty.sql', 'zapisy-wplaty.sql', 'finanse.sql', 'finanse.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [a, A] = await user('admin@kns.pl', 'Admin', ['czlonek', 'admin'])
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
await db.query(`insert into ministries (id, name, leader_ids) values ('mlodziez', 'Młodzież', array[$1::uuid]), ('tech', 'Technika', '{}')`, [l.id])

// finanse: Marek nic nie widzi, Lena — swoją służbę, administrator — wszystko i ustala plan
assert.deepEqual(ok(await M.rpc('finance_board', { y: 2026 })).ministries, [])
assert.deepEqual(ok(await L.rpc('finance_board', { y: 2026 })).ministries.map(x => x.name), ['Młodzież'])
err(await L.rpc('finance_plan', { mid: 'mlodziez', y: 2026, amount: 5000, n: '' }), /rada/)
ok(await A.rpc('finance_plan', { mid: 'mlodziez', y: 2026, amount: 5000, n: 'obóz' }))
err(await M.rpc('finance_expense_add', { mid: 'mlodziez', d: '2026-06-01', amount: 100, t: 'Pizza' }), /lider/)
err(await L.rpc('finance_expense_add', { mid: 'tech', d: '2026-06-01', amount: 100, t: 'Kable' }), /lider/)
const e1 = ok(await L.rpc('finance_expense_add', { mid: 'mlodziez', d: '2026-06-01', amount: 1200.5, t: 'Zaliczka za ośrodek' }))
ok(await L.rpc('finance_expense_add', { mid: 'mlodziez', d: '2025-12-01', amount: 99, t: 'stary rok' }))
const mb = ok(await L.rpc('finance_board', { y: 2026 })).ministries[0]
assert.equal(+mb.planned, 5000); assert.equal(+mb.spent, 1200.5); assert.equal(mb.expenses.length, 1)
assert.equal(ok(await A.rpc('finance_board', { y: 2026 })).ministries.length, 2)
ok(await L.rpc('finance_expense_delete', { eid: e1 }))
assert.equal(+ok(await L.rpc('finance_board', { y: 2026 })).ministries[0].spent, 0)

// zapisy z wpłatą: 100 zł dorosły, 50 zł dziecko
const day = (await db.query(`select ((now() at time zone 'Europe/Warsaw')::date + 30)::text d`)).rows[0].d
await db.query(`insert into events (id, date, data, status, created_by) values ('oboz', $1, $2, 'published', $3)`,
  [day, JSON.stringify({ title: 'Obóz', signup: { enabled: true, kids: true, price: '100', priceChild: '50', account: 'PL 00 1234' } }), l.id])
ok(await M.rpc('signup_join', { eid: 'oboz', new_adults: 2, new_children: 1, new_note: '' }))
const mine = ok(await M.rpc('signup_board', { eid: 'oboz' }))
assert.equal(+mine.mine.due, 250); assert.equal(+mine.mine.paid, 0); assert.equal(mine.account, 'PL 00 1234'); assert.equal(mine.money, null)
err(await M.rpc('signup_paid', { eid: 'oboz', who: m.id, amount: 250 }), /twórca/)
ok(await L.rpc('signup_paid', { eid: 'oboz', who: m.id, amount: 250 }))
const lb = ok(await L.rpc('signup_board', { eid: 'oboz' }))
assert.equal(+lb.money.due, 250); assert.equal(+lb.money.paid, 250); assert.equal(+lb.list[0].paid, 250)
assert.ok((await db.query(`select title from inbox where person = $1`, [m.id])).rows.some(x => /Wpłata przyjęta/.test(x.title)))
console.log('finanse i wpłaty: OK')
