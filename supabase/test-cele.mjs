// Test: cele wsparcia (cele.sql) — deklaracje z dziesięciny, potwierdzanie miesięcy, prywatność kwot, przypomnienia.
// node supabase/test-cele.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'cele.sql', 'cele.sql', 'cele2.sql', 'cele2.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, R] = await user('rada@kns.pl', 'Rafał Rada', ['czlonek', 'rada'])
const [ma, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, K] = await user('kasia@kns.pl', 'Kasia', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const month = (d = 0) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + d); return x.toISOString().slice(0, 7) + '-01' }
const ends = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10)

// rada zakłada cel, członek nie może
ok(await R.from('goals').upsert({ id: 'dach', title: 'Nowy dach', target: 12000, ends }))
err(await M.from('goals').upsert({ id: 'x', title: 'X', target: 1, ends }), /row-level security|permission/)
assert.equal(ok(await M.from('goals').select('*')).length, 1)

// deklaracje
ok(await M.rpc('pledge_set', { g: 'dach', amt: 200 }))
ok(await K.rpc('pledge_set', { g: 'dach', amt: 100 }))
err(await M.rpc('pledge_set', { g: 'dach', amt: -5 }), /Kwota/)
let ov = ok(await M.rpc('goals_overview'))
assert.equal(ov[0].monthly, 300); assert.equal(ov[0].people, 2); assert.equal(ov[0].mine, 200); assert.equal(ov[0].confirmed, 0)
// prywatność: członek widzi tylko swoją kwotę, rada wszystkie
assert.equal(ok(await M.from('pledges').select('*')).length, 1)
assert.equal(ok(await R.from('pledges').select('*')).length, 2)
err(await M.rpc('goal_people', { g: 'dach' }), /rada/)
assert.equal(ok(await R.rpc('goal_people', { g: 'dach' })).length, 2)
// cudzej deklaracji nie zmieni (update przez RLS nic nie trafia)
await K.from('pledges').update({ amount: 999 }).eq('person', ma.id)
assert.equal((await db.query(`select amount from pledges where person = $1`, [ma.id])).rows[0].amount, 200)

// potwierdzenie bieżącego miesiąca: pełna kwota
let st = ok(await M.rpc('my_pledge_status'))
assert.equal(st.monthly, 200); assert.equal(st.months.length, 1); assert.equal(st.months[0].confirmed, null)
assert.equal(ok(await M.rpc('confirm_month', { m: month(), amounts: {} })), 200)
st = ok(await M.rpc('my_pledge_status'))
assert.ok(st.months[0].confirmed); assert.equal(st.months[0].items[0].confirmed, 200)
// Kasia: dziesięcina nie wystarczyła — potwierdza mniej, deklaracja maleje
assert.equal(ok(await K.rpc('confirm_month', { m: month(), amounts: { dach: 60 } })), 60)
assert.equal((await db.query(`select amount from pledges where goal_id = 'dach' and person <> $1`, [ma.id])).rows[0].amount, 60)
err(await K.rpc('confirm_month', { m: month(), amounts: { dach: 500 } }), /już potwierdzony/) // ostateczne
// po potwierdzeniu: deklaracja zamknięta do nowego miesiąca
err(await K.rpc('pledge_set', { g: 'dach', amt: 80 }), /zmienisz od/)
err(await M.rpc('confirm_month', { m: month(), amounts: {} }), /już potwierdzony/)
err(await K.rpc('confirm_month', { m: month(1), amounts: {} }), /bieżący albo poprzedni/)
err(await K.rpc('confirm_month', { m: month(-3), amounts: {} }), /bieżący albo poprzedni/)
ov = ok(await K.rpc('goals_overview'))
assert.equal(ov[0].confirmed, 260); assert.equal(ov[0].monthly, 260); assert.equal(ov[0].confirmed_now, 260)

st = ok(await K.rpc('my_pledge_status'))
assert.equal(st.locked, true); assert.equal(st.prevDue, false)
// to samo — bez błędu (nic się nie zmienia)
ok(await K.rpc('pledge_set', { g: 'dach', amt: 60 }))

// przypomnienia: deklaracja z poprzedniego miesiąca bez potwierdzenia → raz w miesiącu
await db.query(`update pledges set since = $1`, [month(-1)])
const day3 = month().slice(0, 8) + '03', day12 = month().slice(0, 8) + '12'
await db.query(`select set_config('request.jwt.claim.sub', '', false)`) // jak zaplanowana funkcja (bez zalogowanej osoby)
const remind = async d => (await db.query(`select pledge_reminders_on($1) as n`, [d])).rows[0].n
assert.equal(await remind(day12), 0) // po 7. dniu — nic
assert.equal(await remind(day3), 2)
assert.equal(await remind(day3), 0) // raz w miesiącu
assert.match((await db.query(`select title from inbox order by id desc limit 1`)).rows[0].title, /Potwierdź cele wsparcia/)
await db.query(`select pledge_reminders()`) // wersja dla zaplanowanej funkcji działa
// poprzedni miesiąc czeka: najpierw potwierdzenie, potem zmiana deklaracji
await db.query(`delete from pledge_months where month = $1`, [month()]) // (jak gdyby ten miesiąc jeszcze nie był potwierdzony)
await db.query(`delete from pledge_months where month = $1 and confirmed is not null`, [month(-1)])
st = ok(await M.rpc('my_pledge_status'))
assert.equal(st.prevDue, true); assert.equal(st.locked, false)
err(await M.rpc('pledge_set', { g: 'dach', amt: 500 }), /Najpierw potwierdź/)
err(await M.rpc('pledge_set', { g: 'dach', amt: 0 }), /Najpierw potwierdź/)
assert.equal(ok(await M.rpc('confirm_month', { m: month(-1), amounts: {} })), 200)
// potwierdzenie POPRZEDNIEGO miesiąca też zamyka deklaracje do 1. dnia następnego (tak mówi ostrzeżenie)
st = ok(await M.rpc('my_pledge_status'))
assert.equal(st.prevDue, false); assert.equal(st.locked, true)
err(await M.rpc('pledge_set', { g: 'dach', amt: 500 }), /zmienisz od/)
err(await M.rpc('pledge_set', { g: 'dach', amt: 0 }), /zmienisz od/)
// a bieżący miesiąc da się potwierdzić później (albo z mniejszą kwotą)
assert.equal(ok(await M.rpc('confirm_month', { m: month(), amounts: { dach: 150 } })), 150)

// nowa deklaracja na inny cel po potwierdzeniu miesiąca — liczy się od następnego miesiąca
ok(await R.from('goals').upsert({ id: 'mlodziez', title: 'Wyjazd młodzieży', target: 3000, ends }))
ok(await M.rpc('pledge_set', { g: 'mlodziez', amt: 50 }))
err(await M.rpc('pledge_set', { g: 'mlodziez', amt: 70 }), /zmienisz od/) // już złożona — do nowego miesiąca bez zmian
assert.equal(String((await db.query(`select since from pledges where goal_id = 'mlodziez'`)).rows[0].since.toISOString?.() ?? (await db.query(`select since::text as s from pledges where goal_id = 'mlodziez'`)).rows[0].s).slice(0, 7), month(1).slice(0, 7))
// zamknięty cel: zwiększyć nie można
ok(await R.from('goals').update({ closed: true }).eq('id', 'dach'))
err(await K.rpc('pledge_set', { g: 'dach', amt: 300 }), /zamknięty|zmienisz od/)
// cel bez terminu: deklaracje jak zwykle, bez liczby miesięcy
ok(await R.from('goals').upsert({ id: 'misja', title: 'Misja', target: 50000, ends: null }))
let ov2 = ok(await M.rpc('goals_overview')).find(g => g.id === 'misja')
assert.equal(ov2.closed, false); assert.equal(ov2.months_left, null); assert.equal(ov2.kind, 'monthly')
// cel jednorazowy: deklaracja, zmiana, potwierdzenie wpłaty (raz), poza miesięcznym potwierdzaniem
ok(await R.from('goals').upsert({ id: 'auto', title: 'Busik', target: 8000, ends, kind: 'once' }))
const [, J] = await user('jan@kns.pl', 'Jan', ['czlonek'])
ok(await J.rpc('pledge_set', { g: 'auto', amt: 500 }))
ok(await J.rpc('pledge_set', { g: 'auto', amt: 400 }))
err(await J.rpc('pledge_once_done', { g: 'auto', amt: 600 }), /do zadeklarowanej/)
assert.equal(ok(await J.rpc('pledge_once_done', { g: 'auto' })), 400)
err(await J.rpc('pledge_once_done', { g: 'auto' }), /już potwierdzona/)
err(await J.rpc('pledge_set', { g: 'auto', amt: 100 }), /już potwierdzona/)
ov2 = ok(await J.rpc('goals_overview')).find(g => g.id === 'auto')
assert.equal(ov2.confirmed, 400); assert.equal(ov2.mine_done, 400); assert.equal(ov2.kind, 'once')
const st2 = ok(await J.rpc('my_pledge_status'))
assert.equal(st2.monthly, 0); assert.equal(st2.months.length, 0) // jednorazowy nie trafia do miesięcznego potwierdzania
err(await J.rpc('pledge_once_done', { g: 'dach' }), /jednorazowy/)
console.log('cele: wszystkie testy OK')
