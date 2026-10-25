// Test: cele wsparcia po nowemu (cele3.sql) — dziesięcina miesiąca, procent na cele, przydziały, samoczynne zamknięcie miesiąca.
// node supabase/test-cele3.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'posluchaj.sql', 'cele.sql', 'cele2.sql', 'cele3.sql', 'cele3.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, R] = await user('rada@kns.pl', 'Rafał Rada', ['czlonek', 'rada'])
const [ma, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const month = (d = 0) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + d); return x.toISOString().slice(0, 7) + '-01' }
ok(await R.from('goals').upsert({ id: 'dach', title: 'Nowy dach', target: 1000, ends: null }))
ok(await R.from('goals').upsert({ id: 'gimbal', title: 'Gimbal', target: 500, ends: null }))
// dawne potwierdzenie zostaje w zebranych
await db.query(`insert into pledge_confirmations (goal_id, person, month, amount) values ('dach', $1, $2, 30)`, [ma.id, month(-2)])

// procent: domyślnie 10, zmienia tylko rada
assert.equal(ok(await M.rpc('tithe_status')).percent, 10)
err(await M.rpc('goal_share_set', { p: 20 }), /rada/)
// bez podanej dziesięciny nie da się przydzielić
err(await M.rpc('allocation_set', { g: 'dach', amt: 10 }), /Najpierw podaj/)
ok(await M.rpc('tithe_set', { amt: 1000 }))
let st = ok(await M.rpc('tithe_status')); assert.equal(st.tithe, 1000); assert.equal(st.pool, 100)
ok(await M.rpc('allocation_set', { g: 'dach', amt: 60 }))
err(await M.rpc('allocation_set', { g: 'gimbal', amt: 50 }), /zostało 40 zł/)
ok(await M.rpc('allocation_set', { g: 'gimbal', amt: 40 }))
ok(await M.rpc('allocation_set', { g: 'dach', amt: 50 })) // zmiana w trakcie miesiąca
st = ok(await M.rpc('tithe_status')); assert.equal(st.used, 90); assert.deepEqual(st.allocated, { dach: 50, gimbal: 40 })
// zmniejszenie dziesięciny poniżej przydziałów — odmowa
err(await M.rpc('tithe_set', { amt: 500 }), /Najpierw zmniejsz/)
// bieżący miesiąc jeszcze nie w zebranych; dawne potwierdzenie tak
let g = ok(await M.rpc('goals_overview')).find(x => x.id === 'dach'); assert.equal(g.confirmed, 30); assert.equal(g.now, 50); assert.equal(g.mine, 50); assert.equal(g.people, 1)
// koniec miesiąca: przydziały przesuwamy w przeszłość — liczą się do zebranych, nowego miesiąca nie ruszają
await db.query(`update goal_allocations set month = $1`, [month(-1)]); await db.query(`update tithe_months set month = $1`, [month(-1)])
g = ok(await M.rpc('goals_overview')).find(x => x.id === 'dach'); assert.equal(g.confirmed, 80); assert.equal(g.now, 0); assert.equal(g.mine_total, 80)
st = ok(await M.rpc('tithe_status')); assert.equal(st.tithe, null); assert.equal(st.prev.used, 90)
// rada: kto ile
const people = ok(await R.rpc('goal_people', { g: 'dach' })); assert.equal(people[0].given, 80)
err(await M.rpc('goal_people', { g: 'dach' }), /rada/)
// procent 20 → większa pula
ok(await R.rpc('goal_share_set', { p: 20 })); ok(await M.rpc('tithe_set', { amt: 1000 })); assert.equal(ok(await M.rpc('tithe_status')).pool, 200)
// zakończony cel — bez nowych przydziałów
await db.query(`update goals set closed = true where id = 'gimbal'`)
err(await M.rpc('allocation_set', { g: 'gimbal', amt: 10 }), /zakończony/)
// przypomnienie 24–28: kto nie podał dziesięciny w tym miesiącu
await db.query('delete from tithe_months')
await db.query("select set_config('request.jwt.claim.sub', '', false)") // zaplanowana funkcja — bez zalogowanej osoby
const d = new Date(); d.setDate(25); const day = d.toISOString().slice(0, 10)
assert.equal((await db.query(`select pledge_reminders_on($1::date) n`, [day])).rows[0].n, 1)
assert.equal((await db.query(`select pledge_reminders_on($1::date) n`, [day])).rows[0].n, 0) // raz w miesiącu
// dawne funkcje wyłączone
err(await M.rpc('pledge_set', { g: 'dach', amt: 10 }), /.+/)
console.log('cele3: OK')
