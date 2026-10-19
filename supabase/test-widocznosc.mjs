// Test: wydarzenia i ogłoszenia widoczne tylko dla wybranych służb (widocznosc.sql). node supabase/test-widocznosc.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'kalendarz.sql', 'widocznosc.sql', 'widocznosc.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [l, L] = await user('lider@kns.pl', 'Lena', ['czlonek', 'lider'])
const [t, T] = await user('tech@kns.pl', 'Tomek', ['czlonek'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, E] = await user('org@kns.pl', 'Ola', ['czlonek', 'organizator'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
await db.query(`insert into ministries (id, name, leader_ids) values ('tech', 'Technika', array[$1::uuid]), ('kawa', 'Kawa', '{}')`, [l.id])
await db.query(`insert into ministry_members (ministry_id, person, status) values ('tech', $1, 'active')`, [t.id])
const canEdit = (await db.query(`select can_edit from ranks where id = 'organizator'`)).rows[0]?.can_edit
await db.query(`insert into events (id, type, date, status, ministries, data, updated) values
  ('e-all', 'inne', current_date + 3, 'published', '{}', '{"id":"e-all","title":"Dla wszystkich"}', 1),
  ('e-tech', 'inne', current_date + 3, 'published', '{tech}', '{"id":"e-tech","title":"Próba techniki"}', 1),
  ('e-kawa', 'inne', current_date + 3, 'published', '{kawa}', '{"id":"e-kawa","title":"Kawa"}', 1)`)
await db.query(`insert into announcements (id, audience, status, ministries, data, updated) values
  ('a-all', 'public', 'published', '{}', '{"id":"a-all","title":"Wszyscy"}', 1),
  ('a-tech', 'public', 'published', '{tech}', '{"id":"a-tech","title":"Tylko technika"}', 1)`)
const ids = async (C, tbl) => ok(await C.from(tbl).select('id')).map(r => r.id).sort()

assert.deepEqual(await ids(M, 'events'), ['e-all']) // spoza służb
assert.deepEqual(await ids(T, 'events'), ['e-all', 'e-tech']) // służy w technice
assert.deepEqual(await ids(L, 'events'), ['e-all', 'e-kawa', 'e-tech']) // ranga Lider ma prawo edycji — widzi wszystko
if (canEdit) assert.deepEqual(await ids(E, 'events'), ['e-all', 'e-kawa', 'e-tech']) // prawo edycji — wszystko
assert.deepEqual(await ids(M, 'announcements'), ['a-all'])
assert.deepEqual(await ids(T, 'announcements'), ['a-all', 'a-tech'])
// goście: bez ograniczonych
const pub = (await db.query(`select public_preview() p`)).rows[0].p
assert.deepEqual(pub.events.map(e => e.title).sort(), ['Dla wszystkich', 'Kawa', 'Próba techniki'].filter(x => x === 'Dla wszystkich'))
assert.deepEqual(pub.announcements.map(a => a.id), ['a-all'])
// autor widzi swoje
await db.exec(`alter table events disable trigger user; update events set created_by = '${m.id}' where id = 'e-kawa'; alter table events enable trigger user`)
assert.deepEqual(await ids(M, 'events'), ['e-all', 'e-kawa'])
// kalendarz Google (link osobisty)
await db.query(`update people set calendar_token = gen_random_uuid() where id in ($1, $2)`, [t.id, m.id])
const feed = async id => (await db.query(`select calendar_feed((select calendar_token from people where id = $1)) f`, [id])).rows[0].f.events.map(e => e.id).sort()
assert.deepEqual(await feed(t.id), ['e-all', 'e-tech'])
assert.deepEqual(await feed(m.id), ['e-all'])
console.log('widoczność: wszystkie testy OK')
