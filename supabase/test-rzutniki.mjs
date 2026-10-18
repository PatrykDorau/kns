// Test: rzutniki dla Streamu (rzutniki.sql) — zapis i odczyt tylko dla zatwierdzonych członków.
// node supabase/test-rzutniki.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
await setupDb(db, ['schema.sql', 'rzutniki.sql', 'rzutniki.sql'].map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, status) => {
  const u = await addUser(db, email, email)
  await db.query(`update people set status = $2, roles = '{czlonek}' where email = $1`, [email, status])
  return createFakeClient(db, u)
}
const A = await user('a@kns.pl', 'active'), B = await user('b@kns.pl', 'active'), P = await user('p@kns.pl', 'pending')
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }

ok(await A.from('projector_links').upsert({ id: 'pc1', name: 'Laptop rzutnik', key: 'klucz1234567', screen: true }))
assert.equal(ok(await B.from('projector_links').select('*')).length, 1) // drugi członek widzi
assert.equal((await P.from('projector_links').select('*')).data?.length || 0, 0) // czekający na zatwierdzenie — nie
const anon = createFakeClient(db, null)
assert.equal((await anon.from('projector_links').select('*')).data?.length || 0, 0) // gość — nie
// zmiana klucza (np. „Nowy klucz”) — ten sam komputer
ok(await B.from('projector_links').upsert({ id: 'pc1', name: 'Laptop rzutnik', key: 'nowyklucz9876', screen: false }))
assert.equal(ok(await A.from('projector_links').select('key'))[0].key, 'nowyklucz9876')
const bad = await P.from('projector_links').upsert({ id: 'pc2', name: 'x', key: 'klucz1234567' })
assert.ok(bad.error, 'niezatwierdzony nie zapisze')
console.log('rzutniki: wszystkie testy OK')
