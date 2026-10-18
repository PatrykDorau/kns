// Test: przeczytane ogłoszenia (przeczytane.sql) — każdy widzi tylko swoje, powtórki i cudze/niewidoczne pomijane.
// node supabase/test-przeczytane.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'przeczytane.sql', 'przeczytane.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, roles) => {
  const u = await addUser(db, email, email)
  await db.query(`update people set status = 'active', roles = $2 where email = $1`, [email, roles])
  return [u, createFakeClient(db, u)]
}
const [, M] = await user('marek@kns.pl', ['czlonek'])
const [, K] = await user('kasia@kns.pl', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
await db.query(`insert into announcements (id, audience, data, updated, status) values
  ('a1', 'public', '{"title":"A1"}', 1, 'published'), ('a2', 'members', '{"title":"A2"}', 1, 'published'), ('r1', 'council', '{"title":"Rada"}', 1, 'published')`)

ok(await M.rpc('mark_seen', { ids: ['a1', 'a2', 'r1', 'nie-ma'] }))
ok(await M.rpc('mark_seen', { ids: ['a1'] })) // powtórka — bez błędu
const mine = ok(await M.from('seen_announcements').select('ann_id')).map(x => x.ann_id).sort()
assert.deepEqual(mine, ['a1', 'a2']) // ogłoszenie dla rady niewidoczne dla członka — pominięte
assert.equal(ok(await K.from('seen_announcements').select('ann_id')).length, 0) // cudze niewidoczne
await db.query(`delete from announcements where id = 'a1'`)
assert.equal(ok(await M.from('seen_announcements').select('ann_id')).length, 1) // usunięte ogłoszenie — wpis znika
console.log('przeczytane: wszystkie testy OK')
