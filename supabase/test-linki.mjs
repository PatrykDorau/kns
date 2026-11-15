// Test: kanały KNS (linki.sql). node supabase/test-linki.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'linki.sql', 'linki.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, roles, status = 'active') => {
  const u = await addUser(db, email, email)
  await db.query(`update people set status = $3, roles = $2 where email = $1`, [email, roles, status])
  return createFakeClient(db, u)
}
const M = await user('ania@kns.pl', ['czlonek'])
const A = await user('szef@kns.pl', ['admin'])
const P = await user('nowy@kns.pl', [], 'pending')
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const items = [{ name: 'WhatsApp — członkowie', url: 'https://chat.whatsapp.com/abc', note: 'ogłoszenia' }, { name: 'Facebook', url: 'https://facebook.com/kns' }]
err(await M.rpc('kns_links_save', { items }), /zarządzający/)
ok(await A.rpc('kns_links_save', { items }))
assert.deepEqual(ok(await M.rpc('kns_links_load')).map(l => l.name), ['WhatsApp — członkowie', 'Facebook'])
assert.deepEqual(ok(await P.rpc('kns_links_load')), [])
err(await A.rpc('kns_links_save', { items: [{ name: 'Zły', url: 'javascript:alert(1)' }] }), /https/)
assert.equal(ok(await M.rpc('kns_links_load')).length, 2) // nieudany zapis niczego nie zmienia
ok(await A.rpc('kns_links_save', { items: [items[1]] }))
assert.deepEqual(ok(await M.rpc('kns_links_load')).map(l => l.name), ['Facebook'])
assert.ok((await M.from('kns_links').select('*')).error || !(await M.from('kns_links').select('*')).data?.length)
console.log('linki: OK')
