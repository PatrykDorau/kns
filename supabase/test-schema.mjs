// Test supabase/schema.sql na Postgresie w Node (PGlite) — z podstawionym tym, co Supabase ma gotowe
// (schemat auth, auth.uid(), role anon/authenticated). Uruchomienie:
//   npm i --no-save @electric-sql/pglite@0.2.17 && node supabase/test-schema.mjs
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
const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').replace("'wpisz.adres@gmail.com'", "'admin@kns.pl'")
await db.exec(schema)
await db.exec(schema) // drugi raz — skrypt musi dać się uruchomić ponownie

const ids = { admin: '00000000-0000-0000-0000-000000000001', ania: '00000000-0000-0000-0000-000000000002', rada: '00000000-0000-0000-0000-000000000003', prot: '00000000-0000-0000-0000-000000000004' }
for (const [k, id] of Object.entries(ids)) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, k === 'admin' ? 'Admin@KNS.pl' : k + '@kns.pl', { full_name: k.toUpperCase() }])
}
// Zapytanie jako dana osoba (rola authenticated z jej identyfikatorem) albo jako gość (anon).
async function as(who, sql, params = []) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === 'anon' ? '' : ids[who]])
  await db.exec(`set role ${who === 'anon' ? 'anon' : 'authenticated'}`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const fails = async (p, re) => { await assert.rejects(p, e => (re ? re.test(e.message) : true)) }

// 1. Pierwsze logowanie: administrator od razu aktywny, reszta czeka.
let r = await db.query(`select email, status, roles, name from people order by email`)
assert.deepEqual(r.rows.map(x => x.email + ':' + x.status), ['admin@kns.pl:active', 'ania@kns.pl:pending', 'prot@kns.pl:pending', 'rada@kns.pl:pending'])
assert.equal(r.rows[0].name, 'ADMIN')

// 2. Osoba czekająca nic nie widzi ani nie zapisze; widzi tylko siebie.
await db.query(`insert into services (id, date, data, updated) values ('s1', current_date + 3, '{"time":"10:00","sermonTitle":"Światłość","notes":"tajne"}', 1)`)
assert.equal((await as('ania', `select * from services`)).rows.length, 0)
assert.deepEqual((await as('ania', `select email from people`)).rows.map(x => x.email), ['ania@kns.pl'])
await fails(as('ania', `insert into services (id, data) values ('x', '{}')`), /row-level security/)
await fails(as('ania', `select set_person('ania@kns.pl', 'active', null)`), /administrator/)
await fails(as('ania', `select set_newsletter(true)`), /zatwierdzonych/)

// 3. Administrator zatwierdza i nadaje rangi.
assert.equal((await as('admin', `select email from people`)).rows.length, 4)
await as('admin', `select set_person('ANIA@kns.pl', 'active', null)`)
await as('admin', `select set_person('rada@kns.pl', 'active', array['czlonek','rada'])`)
await as('admin', `select set_person('prot@kns.pl', 'active', array['czlonek','protokolant','nieistnieje'])`)
assert.deepEqual((await db.query(`select roles from people where email = 'ania@kns.pl'`)).rows[0].roles, ['czlonek'])
assert.deepEqual((await db.query(`select roles from people where email = 'prot@kns.pl'`)).rows[0].roles, ['czlonek', 'protokolant'])
await fails(as('admin', `select set_person('admin@kns.pl', null, array['czlonek'])`), /przynajmniej jeden administrator/)

// 4. Członek czyta, ale nie zmienia; rada i administrator zmieniają.
assert.equal((await as('ania', `select * from services`)).rows.length, 1)
await fails(as('ania', `update services set updated = 2 where id = 's1' returning id`).then(x => { if (!x.rows.length) throw new Error('row-level security: brak zmiany') }), /row-level/)
await as('rada', `insert into events (id, type, date, data, updated) values ('e1', 'studenckie', current_date + 2, '{"title":"Studenci"}', 1), ('e2', 'czlonkowskie', current_date + 4, '{"title":"Członkowskie"}', 1), ('e3', 'rada', current_date + 5, '{"title":"Rada"}', 1)`)
await as('admin', `insert into songs (id, title, text, updated) values ('p1', 'Pieśń', 'tekst', 1)`)
assert.equal((await as('ania', `select * from songs`)).rows.length, 1)
await as('ania', `select set_newsletter(true)`)
assert.equal((await db.query(`select newsletter from people where email = 'ania@kns.pl'`)).rows[0].newsletter, true)
// członek nie zmieni sobie rang bezpośrednio
await fails(as('ania', `update people set roles = array['admin'] where id = auth.uid()`), /permission denied/)

// 5. Protokoły: członkowskie — pisze protokolant, zatwierdza rada; rady — tylko rada.
await as('prot', `insert into protocols (id, kind, data, updated) values ('pr1', 'czlonkowskie', '{}', 1)`)
await fails(as('prot', `insert into protocols (id, kind, data) values ('pr2', 'rada', '{}')`), /row-level/)
await fails(as('ania', `insert into protocols (id, kind, data) values ('pr3', 'czlonkowskie', '{}')`), /row-level/)
const upd = await as('rada', `update protocols set status = 'zatwierdzony' where id = 'pr1' returning id`)
assert.equal(upd.rows.length, 1)
await as('rada', `insert into protocols (id, kind, data) values ('pr4', 'rada', '{}')`)
assert.deepEqual((await as('ania', `select id from protocols order by id`)).rows.map(x => x.id), ['pr1'])
assert.deepEqual((await as('rada', `select id from protocols order by id`)).rows.map(x => x.id), ['pr1', 'pr4'])

// 6. Ogłoszenia: zwykłe — prawo edycji; komunikat rady i ogłoszenie dla rady — tylko rada.
await as('admin', `insert into announcements (id, audience, data, updated) values ('a1', 'public', '{"title":"Piknik","text":"Zapraszamy"}', 1)`)
await fails(as('prot', `insert into announcements (id, audience, data) values ('a2', 'members', '{}')`), /row-level/)
await as('rada', `insert into announcements (id, audience, important, data, updated) values ('a3', 'members', true, '{"title":"Komunikat"}', 2), ('a4', 'council', false, '{"title":"Dla rady"}', 3)`)
assert.deepEqual((await as('ania', `select id from announcements order by id`)).rows.map(x => x.id), ['a1', 'a3'])
assert.deepEqual((await as('rada', `select id from announcements order by id`)).rows.map(x => x.id), ['a1', 'a3', 'a4'])

// 7. Telefony do powiadomień: każdy tylko swoje.
await as('ania', `insert into push_devices (id, data) values ('tel1', '{"x":1}')`)
assert.equal((await as('rada', `select * from push_devices`)).rows.length, 0)
assert.equal((await as('ania', `select * from push_devices`)).rows.length, 1)

// 8. Podgląd publiczny dla gościa: bez prywatnych pól, bez spotkań członkowskich i rady.
await db.query(`insert into templates (id, types, updated) values ('main', '[{"id":"studenckie","name":"Studenci","color":"#3ddc97"},{"id":"inne","removed":true}]', 1)`)
await fails(as('anon', `select * from services`), /permission denied/)
const pub = (await as('anon', `select public_preview() as p`)).rows[0].p
assert.equal(pub.services.length, 1)
assert.equal(pub.services[0].notes, undefined)
assert.equal(pub.services[0].sermonTitle, 'Światłość')
assert.deepEqual(pub.events.map(e => e.title), ['Studenci'])
assert.deepEqual(pub.announcements.map(a => a.title), ['Piknik'])
assert.deepEqual(pub.types.map(t => t.id), ['studenckie'])

// 8b. Kalendarz Google: klucz osoby → nabożeństwa i wydarzenia; spotkania rady tylko dla rady; zły klucz → nic.
const tokAnia = (await as('ania', 'select my_calendar_token() as t')).rows[0].t
const tokRada = (await as('rada', 'select my_calendar_token() as t')).rows[0].t
let feed = (await as('anon', 'select calendar_feed($1) as f', [tokAnia])).rows[0].f
assert.equal(feed.services.length, 1)
assert.deepEqual(feed.events.map(e => e.title).sort(), ['Członkowskie', 'Studenci'])
feed = (await as('anon', 'select calendar_feed($1) as f', [tokRada])).rows[0].f
assert.ok(feed.events.some(e => e.title === 'Rada'))
assert.equal((await as('anon', 'select calendar_feed(gen_random_uuid()) as f')).rows[0].f, null)
const renewed = (await as('ania', 'select my_calendar_token(true) as t')).rows[0].t
assert.notEqual(renewed, tokAnia)
assert.equal((await as('anon', 'select calendar_feed($1) as f', [tokAnia])).rows[0].f, null)
await fails(as('anon', 'select my_calendar_token()'), /permission denied/)

// 9. Odebranie dostępu — znowu nic nie widzi.
await as('admin', `select set_person('ania@kns.pl', 'rejected', null)`)
assert.equal((await as('ania', `select * from services`)).rows.length, 0)
console.log('schema.sql: wszystkie testy OK')
