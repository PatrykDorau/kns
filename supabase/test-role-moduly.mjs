// Test: role i dostęp do modułów dla osób (role-moduly.sql). node supabase/test-role-moduly.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'posluchaj.sql', 'role-moduly.sql', 'role-moduly.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, A] = await user('szef@kns.pl', 'Szef', ['admin'])
const [m, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, O] = await user('ola@kns.pl', 'Ola', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

// nowa rola z nazwy — identyfikator bez polskich znaków, bez prawa zarządzania
const id = ok(await A.rpc('rank_save', { rid: '', rname: 'Młodzieżówka', edit: true, council: false, protocols: false, approve: false }))
assert.equal(id, 'mlodziezowka')
assert.equal(ok(await A.rpc('rank_save', { rid: '', rname: 'Młodzieżówka', edit: false, council: false, protocols: false, approve: false })), 'mlodziezowka-2')
const r = (await db.query(`select * from ranks where id = 'mlodziezowka'`)).rows[0]
assert.equal(r.can_edit, true); assert.equal(r.manage, false); assert.equal(r.builtin, false)
// zmiana nazwy i uprawnień; administratora nie
ok(await A.rpc('rank_save', { rid: 'mlodziezowka', rname: 'Młodzież', edit: false, council: true, protocols: false, approve: true }))
assert.equal((await db.query(`select name, council, approve from ranks where id = 'mlodziezowka'`)).rows[0].name, 'Młodzież')
err(await A.rpc('rank_save', { rid: 'admin', rname: 'Szefowie', edit: true, council: true, protocols: true, approve: true }), /Administrator/)
err(await M.rpc('rank_save', { rid: '', rname: 'Moja', edit: true, council: true, protocols: true, approve: true }), /administrator/)
// usuwanie: wbudowanej nie, własnej tak — osoby i moduły ją tracą
err(await A.rpc('rank_delete', { rid: 'lider' }), /nie można usunąć/)
await db.query(`update people set roles = array['czlonek', 'mlodziezowka'] where id = $1`, [m.id])
ok(await A.rpc('set_site_setting', { k: 'moduly', v: { off: [], only: {}, ranks: { zadania: ['mlodziezowka', 'lider'], pray: ['mlodziezowka'] } } }))
ok(await A.rpc('rank_delete', { rid: 'mlodziezowka' }))
assert.deepEqual((await db.query(`select roles from people where id = $1`, [m.id])).rows[0].roles, ['czlonek'])
assert.deepEqual((await db.query(`select value->'ranks' r from site_settings where key = 'moduly'`)).rows[0].r, { zadania: ['lider'] })

// moduły dla konkretnych osób: liczba w ustawieniu (bez nazwisk), lista tylko dla administratora
assert.equal(ok(await A.rpc('module_people_set', { mod: 'finanse', emails: ['Marek@kns.pl', 'nikt@kns.pl'] })), 1)
const v = (await db.query(`select value from site_settings where key = 'moduly'`)).rows[0].value
assert.deepEqual(v.people, { finanse: 1 }); assert.deepEqual(v.ranks, { zadania: ['lider'] })
assert.ok(!JSON.stringify(v).includes('marek'))
assert.deepEqual(ok(await M.rpc('my_modules')), ['finanse'])
assert.deepEqual(ok(await O.rpc('my_modules')), [])
assert.deepEqual(ok(await A.rpc('module_people_all')).map(x => [x.module, x.email]), [['finanse', 'marek@kns.pl']])
err(await M.rpc('module_people_all'), /administratora/)
err(await M.rpc('module_people_set', { mod: 'finanse', emails: [] }), /administratora/)
const direct = await M.from('module_people').select('*')
assert.ok(direct.error || !direct.data.length, 'tabela zamknięta')
ok(await A.rpc('module_people_set', { mod: 'finanse', emails: [] }))
assert.deepEqual((await db.query(`select value->'people' p from site_settings where key = 'moduly'`)).rows[0].p, {})
console.log('role i moduły: OK')
