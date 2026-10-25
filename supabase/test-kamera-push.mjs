// Test: sygnały kamery jako powiadomienia (kamera-push.sql) — zapis telefonu, kto wysyła, komu idzie.
// node supabase/test-kamera-push.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'push-urzadzenia.sql', 'kamera-push.sql', 'kamera-push.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, T] = await user('tech@kns.pl', 'Tomek', ['czlonek', 'technika'])
const [, K] = await user('kam@kns.pl', 'Kamil', ['czlonek', 'technika'])
const [, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const sub = n => ({ subscription: { endpoint: 'https://push.example/' + n, keys: { p256dh: 'x', auth: 'y' } } })

ok(await K.rpc('push_claim', { did: 'tel-kamil', d: sub('kamil') }))
ok(await M.rpc('push_claim', { did: 'tel-marek', d: sub('marek') }))
// tylko służba techniczna zapisuje telefon na sygnały
err(await M.rpc('cue_phone_set', { did: 'tel-marek', turn_on: true }), /technicznej/)
assert.equal(ok(await K.rpc('cue_phone_on', { did: 'tel-kamil' })), false)
ok(await K.rpc('cue_phone_set', { did: 'tel-kamil', turn_on: true }))
assert.equal(ok(await K.rpc('cue_phone_on', { did: 'tel-kamil' })), true)
// ponowne otwarcie aplikacji (push_claim usuwa i wstawia telefon) — zapis na sygnały zostaje
ok(await K.rpc('push_claim', { did: 'tel-kamil', d: sub('kamil2') }))
// wysyła służba techniczna; dostaje telefon Kamila (nowa subskrypcja)
err(await M.rpc('cue_targets'), /technicz/)
const t = ok(await T.rpc('cue_targets'))
assert.equal(t.length, 1); assert.equal(t[0].subscription.endpoint, 'https://push.example/kamil2')
// bez rangi technika — telefon już nie dostaje
await db.query(`update people set roles = '{czlonek}' where email = 'kam@kns.pl'`)
assert.equal(ok(await T.rpc('cue_targets')).length, 0)
await db.query(`update people set roles = '{czlonek,technika}' where email = 'kam@kns.pl'`)
ok(await K.rpc('cue_phone_set', { did: 'tel-kamil', turn_on: false }))
assert.equal(ok(await T.rpc('cue_targets')).length, 0)
console.log('kamera-push: OK')
