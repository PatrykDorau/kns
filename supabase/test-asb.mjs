// Test ASB (supabase/asb.sql): node supabase/test-asb.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'asb.sql', 'asb.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const a = await addUser(db, 'admin@kns.pl'), s = await addUser(db, 'student@kns.pl'), m = await addUser(db, 'marek@kns.pl')
await db.query(`update people set status = 'active', roles = array['czlonek', 'asb'] where email = 'student@kns.pl'`)
await db.query(`update people set status = 'active', roles = array['czlonek', 'lider'] where email = 'marek@kns.pl'`)
const A = createFakeClient(db, a), S = createFakeClient(db, s), M = createFakeClient(db, m)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

assert.equal(ok(await A.from('ranks').select('*')).some(r => r.id === 'asb'), true)
ok(await S.from('asb_meetings').upsert({ id: 'm1', season: '2026/2027', sort: 1, month: 'PAŹDZIERNIK', date: '2026-10-06', leader: 'Konrad', helper: 'Szymon', topic: 'Czy chrześcijaństwo ma sens?', attendance: 15 }))
ok(await S.from('asb_ideas').upsert({ id: 'i1', author: 'Szymon', topic: 'Proces Jezusa' }))
assert.equal(ok(await A.from('asb_meetings').select('*')).length, 1) // administrator widzi
assert.deepEqual(ok(await M.from('asb_meetings').select('*')), []) // bez rangi ASB — nic
assert.deepEqual(ok(await M.from('asb_ideas').select('*')), [])
err(await M.from('asb_meetings').upsert({ id: 'm2', season: 'x', topic: 'hack' }), /row-level security|permission/)
ok(await S.from('asb_meetings').update({ attendance: 17 }).eq('id', 'm1'))
assert.equal(ok(await S.from('asb_meetings').select('*'))[0].attendance, 17)
ok(await S.from('asb_ideas').delete().eq('id', 'i1'))
assert.equal(ok(await S.from('asb_ideas').select('*')).length, 0)
console.log('asb: wszystkie testy OK')
