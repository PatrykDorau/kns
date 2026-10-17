// Test powiadomień do wybranych osób: reguły w bazie (supabase/powiadomienia.sql) i funkcja /api/push (tryb notify).
//   node supabase/test-powiadomienia.mjs
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
await db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').replace("'wpisz.adres@gmail.com'", "'admin@kns.pl'"))
const sql = fs.readFileSync(new URL('./powiadomienia.sql', import.meta.url), 'utf8')
await db.exec(sql)
await db.exec(sql) // da się uruchomić ponownie

const ids = { admin: '00000000-0000-0000-0000-000000000001', ania: '00000000-0000-0000-0000-000000000002', ola: '00000000-0000-0000-0000-000000000003', nowy: '00000000-0000-0000-0000-000000000004' }
for (const [k, id] of Object.entries(ids)) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, k + '@kns.pl', { full_name: k === 'ola' ? 'Ola Nowak' : '' }])
await db.exec(`insert into admin_emails values ('admin@kns.pl') on conflict do nothing`)
await db.query(`update people set status = 'active', roles = array['czlonek', 'admin'] where id = $1`, [ids.admin])
await db.query(`update people set status = 'active', roles = array['czlonek'] where id = $1`, [ids.ania]) // bez prawa edycji
await db.query(`update people set status = 'active', roles = array['czlonek', 'technika'] where id = $1`, [ids.ola])
for (const [id, who] of [['tel-ola', 'ola'], ['tel-ola2', 'ola'], ['tel-nowy', 'nowy'], ['tel-ania', 'ania']]) {
  await db.query(`insert into push_devices (id, person, data) values ($1, $2, $3)`, [id, ids[who], { subscription: { endpoint: 'https://push.example/' + id, keys: { p256dh: 'x', auth: 'y' } } }])
}
async function as(who, q, params = []) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === 'anon' ? '' : ids[who]])
  await db.exec(`set role ${who === 'anon' ? 'anon' : 'authenticated'}`)
  try { return await db.query(q, params) } finally { await db.exec('reset role') }
}
const fails = (p, re) => assert.rejects(p, e => re.test(e.message))
const editRank = (await db.query(`select id from ranks where can_edit and not manage order by sort limit 1`)).rows[0]?.id

// 1. Lista osób: tylko z prawem edycji; bez czekających; z liczbą telefonów.
const dir = (await as('admin', `select * from people_directory()`)).rows
assert.deepEqual(dir.map(p => p.name), ['admin', 'ania', 'Ola Nowak'])
assert.equal(dir.find(p => p.name === 'Ola Nowak').devices, 2)
await fails(as('ania', `select * from people_directory()`), /prawem edycji/)
await fails(as('anon', `select * from people_directory()`), /permission denied/)

// 2. Telefony odbiorców: tylko zatwierdzonych; tylko dla osób z prawem edycji.
const t = (await as('admin', `select * from notify_targets($1)`, [[ids.ola, ids.nowy, ids.ania]])).rows
assert.deepEqual(t.map(x => x.id).sort(), ['tel-ania', 'tel-ola', 'tel-ola2']) // „nowy” czeka na zatwierdzenie
assert.equal(t[0].subscription.endpoint.startsWith('https://push.example/'), true)
await fails(as('ania', `select * from notify_targets($1)`, [[ids.ola]]), /prawem edycji/)
if (editRank) {
  await db.query(`update people set roles = array['czlonek', $2] where id = $1`, [ids.ania, editRank])
  assert.equal((await as('ania', `select * from notify_targets($1)`, [[ids.ola]])).rows.length, 2)
  await db.query(`update people set roles = array['czlonek'] where id = $1`, [ids.ania])
}

// 3. Sprzątanie wypisanych telefonów.
await fails(as('ania', `select forget_push_devices($1)`, [['tel-ola']]), /uprawnień/)
await as('admin', `select forget_push_devices($1)`, [['tel-ola2']])
assert.equal((await db.query(`select count(*)::int n from push_devices where person = $1`, [ids.ola])).rows[0].n, 1)

// 4. Funkcja /api/push w trybie notify: pyta bazę tokenem osoby, wysyła, sprząta wypisane telefony.
process.env.VAPID_PRIVATE = Buffer.alloc(32, 7).toString('base64url')
const { default: handler } = await import('../netlify/functions/push.mjs')
const realFetch = globalThis.fetch
const calls = []
globalThis.fetch = async (url, opt) => {
  calls.push([String(url), opt])
  if (/rpc\/notify_targets$/.test(url)) {
    assert.equal(opt.headers.Authorization, 'Bearer token-ani')
    assert.deepEqual(JSON.parse(opt.body), { targets: [ids.ola] })
    return new Response(JSON.stringify([{ id: 'tel-1', subscription: { endpoint: 'https://push.example/a', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } } },
      { id: 'tel-2', subscription: { endpoint: 'https://push.example/gone', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } } }]))
  }
  if (/rpc\/forget_push_devices$/.test(url)) return new Response('', { status: 204 })
  if (/push\.example\/gone/.test(url)) return new Response('', { status: 410 })
  if (/push\.example/.test(url)) return new Response('', { status: 201 })
  throw new Error('nieoczekiwane: ' + url)
}
const post = body => handler(new Request('https://kns-nabo.netlify.app/api/push', { method: 'POST', body: JSON.stringify(body) }))
let r = await post({ notify: true, token: 'token-ani', people: [ids.ola, 'zły-identyfikator'], title: 'Nowe wydarzenie', body: 'Próba', url: './?wydarzenie=e1' })
assert.deepEqual(await r.json(), { sent: 1, devices: 2, people: 1 })
const forget = calls.find(([u]) => /forget_push_devices/.test(u))
assert.deepEqual(JSON.parse(forget[1].body), { ids: ['tel-2'] })
r = await post({ notify: true, token: 'token-ani', people: [], title: 'x' })
assert.equal(r.status, 400)
globalThis.fetch = async url => (/notify_targets/.test(url) ? new Response(JSON.stringify({ message: 'Powiadomienia wysyłają osoby z prawem edycji.' }), { status: 400 }) : new Response('', { status: 500 }))
r = await post({ notify: true, token: 'x', people: [ids.ola], title: 'x' })
assert.equal(r.status, 403)
assert.match((await r.json()).error, /prawem edycji/)
globalThis.fetch = realFetch
console.log('powiadomienia: wszystkie testy OK')
