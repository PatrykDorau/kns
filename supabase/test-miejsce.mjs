// Test „Miejsce na dane” (supabase/miejsce.sql): node supabase/test-miejsce.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'cele.sql', 'asb.sql', 'zgloszenia.sql', 'wydawka.sql', 'miejsce.sql', 'miejsce.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const a = await addUser(db, 'admin@kns.pl', 'Admin'), m = await addUser(db, 'marek@kns.pl', 'Marek')
await db.query(`update people set status = 'active', roles = array['czlonek'] where email = 'marek@kns.pl'`)
const A = createFakeClient(db, a), M = createFakeClient(db, m)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
assert.match((await M.rpc('storage_usage')).error?.message || '', /administrator/)
const u = ok(await A.rpc('storage_usage'))
assert.ok(u.db > 0 && u.dbLimit === 500 * 1024 * 1024 && Array.isArray(u.files))
console.log('miejsce: wszystkie testy OK')
