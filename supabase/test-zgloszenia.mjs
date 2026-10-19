// Test: zgłoszenia błędów (zgloszenia.sql) — zgłaszanie, backlog dla administratora i deweloperów, statusy, powiadomienia.
// node supabase/test-zgloszenia.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'zgloszenia.sql', 'zgloszenia.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles, status = 'active') => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = $4, name = $2, roles = $3 where email = $1`, [email, name, roles, status])
  return [u, createFakeClient(db, u)]
}
const [ad, A] = await user('admin@kns.pl', 'Admin', ['czlonek', 'admin'])
const [dv, D] = await user('dev@kns.pl', 'Dominik', ['czlonek', 'dev'])
const [mk, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, P] = await user('nowy@kns.pl', 'Nowy', [], 'pending')
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

const id = ok(await M.rpc('bug_report', { t: 'Nie działa przycisk Zapisz', b: 'W ogłoszeniu', pg: '/ogloszenia', dev: 'Chrome' }))
ok(await P.rpc('bug_report', { t: 'Nie widzę kalendarza' })) // czekający też może zgłosić
err(await M.rpc('bug_report', { t: '  ' }), /Wpisz/)
// powiadomienie dla administratora i dewelopera
assert.equal((await db.query(`select count(*)::int n from inbox where title like 'Zgłoszenie:%' and person in ($1, $2)`, [ad.id, dv.id])).rows[0].n, 4)
// lista: członek — tylko swoje; deweloper — wszystkie
assert.equal(ok(await M.rpc('bugs_list')).length, 1)
const all = ok(await D.rpc('bugs_list')); assert.equal(all.length, 2); assert.equal(all.find(b => b.id === id).reporter, 'Marek')
assert.equal(ok(await D.rpc('backlog_people')).length, 2)
assert.equal((ok(await M.rpc('backlog_people')) || []).length, 0)
// statusy: tylko backlog; zrobione → powiadomienie zgłaszającego
err(await M.rpc('bug_update', { bid: id, st: 'done' }), /prowadzą/)
ok(await D.rpc('bug_update', { bid: id, st: 'doing', who: dv.id }))
assert.equal(ok(await D.rpc('bugs_list')).find(b => b.id === id).assigneeName, 'Dominik')
ok(await A.rpc('bug_update', { bid: id, st: 'done', nt: 'Poprawione w 2.95' }))
const n = (await db.query(`select title, body from inbox where person = $1`, [mk.id])).rows
assert.equal(n.length, 1); assert.match(n[0].title, /^Zrobione/); assert.match(n[0].body, /2\.95/)
assert.equal((await M.from('bug_reports').select('*')).data?.length || 0, 0) // bez bezpośredniego dostępu
console.log('zgłoszenia: wszystkie testy OK')
