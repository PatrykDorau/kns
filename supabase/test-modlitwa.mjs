// Test: prośby modlitewne (modlitwa.sql) — zgłoszenie, powiadomienie prowadzących, widoczność, „Modlę się”, statusy.
// node supabase/test-modlitwa.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'asb.sql', 'wiadomosci.sql', 'modlitwa.sql', 'modlitwa.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, P] = await user('pastor@kns.pl', 'Piotr Pastor', ['czlonek', 'pastor'])
const [, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, A] = await user('ania@kns.pl', 'Ania', ['czlonek'])
const G = createFakeClient(db)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const box = async email => (await db.query(`select i.* from inbox i join people p on p.id = i.person where p.email = $1`, [email])).rows

err(await M.rpc('prayer_add', { t: 'a' }), /Napisz/)
const priv = ok(await M.rpc('prayer_add', { t: 'O zdrowie mamy', nm: 'Marek', sh: false }))
const pub = ok(await M.rpc('prayer_add', { t: 'O nową pracę', nm: '', sh: true }))
// gość — bez dostępu (dopóki nie włączymy anon)
err(await G.rpc('prayer_add', { t: 'Prośba gościa' }), /.+/)
// pastor dostał powiadomienia, Ania nie
assert.equal((await box('pastor@kns.pl')).length, 2); assert.equal((await box('ania@kns.pl')).length, 0)
// widoczność: Ania widzi tylko pokazaną zborowi; Marek swoje; pastor wszystko
assert.deepEqual(ok(await A.rpc('prayer_board')).list.map(x => x.id), [pub])
assert.equal(ok(await M.rpc('prayer_board')).list.length, 2)
const pb = ok(await P.rpc('prayer_board')); assert.equal(pb.leader, true); assert.equal(pb.list.length, 2); assert.equal(pb.list.find(x => x.id === priv).from, 'Marek')
// nie da się pokazać zborowi prośby bez zgody; członek nie zmienia statusu cudzej
err(await P.rpc('prayer_status', { rid: priv, st: 'shown' }), /nie zgodził/)
err(await A.rpc('prayer_status', { rid: pub, st: 'private' }), /prowadzący/)
// „Modlę się” i cofnięcie
assert.equal(ok(await A.rpc('prayer_pray', { rid: pub })), true)
assert.equal(ok(await A.rpc('prayer_board')).list[0].prayed, 1)
assert.equal(ok(await A.rpc('prayer_pray', { rid: pub })), false)
err(await A.rpc('prayer_pray', { rid: priv }), /Nie ma/)
// autor kończy swoją; prowadzący chowa
ok(await M.rpc('prayer_status', { rid: priv, st: 'done' }))
ok(await P.rpc('prayer_status', { rid: pub, st: 'private' }))
assert.equal(ok(await A.rpc('prayer_board')).list.length, 0)
err(await A.rpc('prayer_remove', { rid: pub }), /uprawnień/)
ok(await M.rpc('prayer_remove', { rid: pub }))
console.log('modlitwa: OK')
// modlitwa na dziś / tydzień
err(await A.rpc('prayer_focus_set', { sc: 'day', t: 'O pokój w mieście' }), /pastor albo rada/)
ok(await P.rpc('prayer_focus_set', { sc: 'day', t: 'O pokój w mieście' }))
ok(await P.rpc('prayer_focus_set', { sc: 'week', t: 'O młodzież przed wyjazdem' }))
ok(await P.rpc('prayer_focus_set', { sc: 'day', t: 'O chorych w zborze' })) // zastępuje dzisiejszą
const f = ok(await A.rpc('prayer_focus_now'))
assert.deepEqual(f.map(x => x.scope + ':' + x.text), ['day:O chorych w zborze', 'week:O młodzież przed wyjazdem'])
assert.equal(f[0].author, 'Piotr Pastor')
err(await G.rpc('prayer_focus_now'), /.+/)
ok(await P.rpc('prayer_focus_remove', { fid: f[0].id }))
assert.equal(ok(await A.rpc('prayer_focus_now')).length, 1)
console.log('modlitwa na dziś/tydzień: OK')
