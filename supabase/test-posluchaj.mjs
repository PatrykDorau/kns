// Test ustawień strony (supabase/posluchaj.sql): node supabase/test-posluchaj.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'posluchaj.sql', 'posluchaj.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const a = await addUser(db, 'admin@kns.pl'), m = await addUser(db, 'marek@kns.pl')
await db.query(`update people set status = 'active', roles = array['czlonek', 'lider'] where email = 'marek@kns.pl'`)
const A = createFakeClient(db, a), M = createFakeClient(db, m), G = createFakeClient(db, null)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const links = { youtube: 'https://www.youtube.com/playlist?list=PL123', spotify: 'https://open.spotify.com/show/abc' }
ok(await A.rpc('set_site_setting', { k: 'posluchaj', v: links }))
err(await M.rpc('set_site_setting', { k: 'posluchaj', v: {} }), /administrator/)
err(await G.rpc('set_site_setting', { k: 'posluchaj', v: {} }), /permission denied|administrator/)
err(await A.rpc('set_site_setting', { k: 'Zła nazwa', v: {} }), /Niepoprawna/)
assert.deepEqual(ok(await G.from('site_settings').select('key,value'))[0].value, links) // gość czyta
err(await M.from('site_settings').update({ value: {} }).eq('key', 'posluchaj'), /permission denied/)
console.log('posłuchaj: wszystkie testy OK')
