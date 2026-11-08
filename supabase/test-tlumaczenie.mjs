// Test: kanały tłumaczenia na żywo (tlumaczenie.sql). node supabase/test-tlumaczenie.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'materialy.sql', 'dyspozycyjnosc.sql', 'widocznosc.sql', 'sluzby2.sql', 'lider-w-sluzbie.sql', 'tlumaczenie.sql', 'tlumaczenie.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, A] = await user('admin@kns.pl', 'Admin', ['czlonek', 'admin'])
const [t, T] = await user('anna@kns.pl', 'Anna', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const anon = createFakeClient(db, null)
await db.query(`insert into ministries (id, name) values ('tl', 'Tłumacze')`)
await db.query(`insert into ministry_members (ministry_id, person, status) values ('tl', $1, 'active')`, [t.id])

assert.equal(ok(await T.rpc('tl_info')).can, false)
err(await T.rpc('tl_start', { l: 'EN', nm: 'English' }), /tłumacze/)
ok(await A.rpc('tl_ministry_set', { mid: 'tl', on_: true }))
assert.equal(ok(await T.rpc('tl_info')).can, true)
err(await T.rpc('tl_start', { l: 'english!', nm: '' }), /Kod języka/)
const sid = ok(await T.rpc('tl_start', { l: 'en', nm: 'English' }))
ok(await T.rpc('tl_ping', { sid, n: 12 }))
// słuchacz bez konta widzi kanał, bez danych tłumacza
const live = ok(await anon.rpc('tl_live'))
assert.deepEqual(live.map(x => [x.lang, x.name, x.listeners]), [['EN', 'English', 12]])
assert.equal(live[0].translator, undefined)
err(await anon.rpc('tl_start', { l: 'EN', nm: '' }), /.+/)
// stary kanał (bez sygnału 45 s) znika; zatrzymany też
await db.query(`update translation_sessions set seen = now() - interval '1 minute'`)
assert.deepEqual(ok(await anon.rpc('tl_live')), [])
ok(await T.rpc('tl_ping', { sid, n: 3 }))
assert.equal(ok(await anon.rpc('tl_live')).length, 1)
ok(await T.rpc('tl_stop', { sid }))
assert.deepEqual(ok(await anon.rpc('tl_live')), [])
console.log('tłumaczenie: OK')
