// Test zgłoszeń od członków (supabase/zatwierdzanie.sql): node supabase/test-zatwierdzanie.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`)
const file = n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')
await db.exec(file('schema.sql').replace("'wpisz.adres@gmail.com'", "'admin@kns.pl'"))
for (const n of ['kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'zatwierdzanie.sql']) await db.exec(file(n)) // drugi raz — ponowne uruchomienie

const ids = { admin: 1, czlonek: 2, news: 3, lider: 4, rada: 5 }
for (const k in ids) ids[k] = '00000000-0000-0000-0000-00000000000' + ids[k]
for (const [k, id] of Object.entries(ids)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, k + '@kns.pl'])
const roles = { admin: ['czlonek', 'admin'], czlonek: ['czlonek'], news: ['czlonek', 'newsletter'], lider: ['czlonek', 'lider'], rada: ['czlonek', 'rada'] }
for (const [k, r] of Object.entries(roles)) await db.query(`update people set status = 'active', roles = $2 where id = $1`, [ids[k], r])
async function as(who, q, params = []) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === 'anon' ? '' : ids[who]])
  await db.exec(`set role ${who === 'anon' ? 'anon' : 'authenticated'}`)
  try { return await db.query(q, params) } finally { await db.exec('reset role') }
}
const fails = (p, re) => assert.rejects(p, e => re.test(e.message))
const ev = (id, extra = '') => `insert into events (id, type, date, data${extra ? ', status' : ''}) values ('${id}', 'inne', current_date + 2, '{"id":"${id}","title":"${id}"}'${extra ? `, '${extra}'` : ''})`
const status = async (t, id) => (await db.query(`select status, created_by from ${t} where id = $1`, [id])).rows[0]

// 1. Członek bez prawa edycji: zgłoszenie zawsze „czeka” (nawet gdy próbuje opublikować).
await as('czlonek', ev('e-czl', 'published'))
assert.equal((await status('events', 'e-czl')).status, 'pending')
assert.equal((await status('events', 'e-czl')).created_by, ids.czlonek)
// widzi swoje; inny członek bez uprawnień — nie; zatwierdzający — tak
assert.equal((await as('czlonek', `select id from events where id = 'e-czl'`)).rows.length, 1)
assert.equal((await as('lider', `select id from events where id = 'e-czl'`)).rows.length, 0)
assert.equal((await as('news', `select id from events where id = 'e-czl'`)).rows.length, 1)
// może poprawić swoje zgłoszenie (nadal czeka), nie może opublikować
await as('czlonek', `update events set data = data || '{"title":"poprawione"}', status = 'published' where id = 'e-czl'`)
assert.equal((await status('events', 'e-czl')).status, 'pending')
// lider (prawo edycji, bez zatwierdzania) nie widzi cudzych zgłoszeń, więc ich nie opublikuje
await as('lider', `update events set status = 'published' where id = 'e-czl'`)
assert.equal((await status('events', 'e-czl')).status, 'pending')
// lider newslettera zatwierdza
await as('news', `update events set status = 'published' where id = 'e-czl'`)
assert.equal((await status('events', 'e-czl')).status, 'published')
assert.equal((await status('events', 'e-czl')).created_by, ids.czlonek) // autor zostaje
// po publikacji autor bez uprawnień już nie zmieni ani nie usunie
await as('czlonek', `update events set data = '{}' where id = 'e-czl'`)
assert.notDeepEqual((await db.query(`select data from events where id = 'e-czl'`)).rows[0].data, {})
await as('czlonek', `delete from events where id = 'e-czl'`)
assert.ok(await status('events', 'e-czl'))

// 2. Prawo edycji: publikuje od razu (jak dotąd).
await as('lider', ev('e-lid'))
assert.equal((await status('events', 'e-lid')).status, 'published')

// 3. Członek może usunąć swoje czekające zgłoszenie; zatwierdzający — odrzucić (usunąć) cudze.
await as('czlonek', ev('e-del'))
await as('czlonek', `delete from events where id = 'e-del'`)
assert.equal(await status('events', 'e-del'), undefined)
await as('czlonek', ev('e-odrz'))
await as('rada', `delete from events where id = 'e-odrz'`)
assert.equal(await status('events', 'e-odrz'), undefined)

// 4. Ogłoszenia: członek zgłasza zwykłe; komunikatu rady ani ogłoszenia dla rady — nie.
await as('czlonek', `insert into announcements (id, audience, data) values ('a1', 'members', '{"title":"Zbiórka"}')`)
assert.equal((await status('announcements', 'a1')).status, 'pending')
await fails(as('czlonek', `insert into announcements (id, audience, important, data) values ('a2', 'members', true, '{}')`), /row-level security/)
await fails(as('czlonek', `insert into announcements (id, audience, data) values ('a3', 'council', '{}')`), /row-level security/)
assert.equal((await as('admin', `select id from announcements where id = 'a1'`)).rows.length, 1)
await as('admin', `update announcements set status = 'published' where id = 'a1'`)
assert.equal((await status('announcements', 'a1')).status, 'published')

// 5. Na zewnątrz tylko opublikowane: podgląd gości i Kalendarz Google.
await as('czlonek', `insert into events (id, type, date, data) values ('e-pub', 'inne', current_date + 3, '{"title":"czeka"}')`)
const prev = (await as('anon', `select public_preview() p`)).rows[0].p
assert.ok(!prev.events.some(e => e.title === 'czeka'))
const tok = (await db.query(`select calendar_token t from people where id = $1`, [ids.admin])).rows[0].t
const feed = (await as('anon', `select calendar_feed($1) f`, [tok])).rows[0].f
assert.ok(!feed.events.some(e => e.title === 'czeka'))
assert.ok(feed.events.some(e => e.title === 'e-lid'))

// 6. Powiadomienie dla zatwierdzających: tylko gdy autor ma czekające zgłoszenie; trafia do zatwierdzających.
await db.query(`insert into push_devices (id, person, data) values ('tel-news', $1, '{"subscription":{"endpoint":"https://x"}}'), ('tel-lid', $2, '{"subscription":{"endpoint":"https://y"}}')`, [ids.news, ids.lider])
assert.deepEqual((await as('czlonek', `select id from review_targets()`)).rows.map(r => r.id), ['tel-news'])
await fails(as('lider', `select * from review_targets()`), /Brak zgłoszeń/)

// 7. Skrypty Google (klucz serwera, bez auth.uid()) — bez zmian.
await db.query(`insert into events (id, type, date, data) values ('e-gs', 'inne', current_date, '{}')`)
assert.equal((await status('events', 'e-gs')).status, 'published')
console.log('zatwierdzanie: wszystkie testy OK')
