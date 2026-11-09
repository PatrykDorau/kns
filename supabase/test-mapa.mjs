// Test: Mapa KNS (mapa.sql). node supabase/test-mapa.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'mapa.sql', 'mapa.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, roles, status = 'active') => {
  const u = await addUser(db, email, email)
  await db.query(`update people set status = $3, roles = $2 where email = $1`, [email, roles, status])
  return [u, createFakeClient(db, u)]
}
const [a, A] = await user('ania@kns.pl', ['czlonek'])
const [b, B] = await user('bartek@kns.pl', ['czlonek'])
const [, Adm] = await user('szef@kns.pl', ['admin'])
const [, P] = await user('nowy@kns.pl', [], 'pending')
const G = createFakeClient(db, null)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

// import z listy: wspólny wpis pary (dwóch właścicieli)
await db.query(`insert into kns_map (id, label, area, place, owners, source) values ('imp-1', 'Ania i Bartek Nowak', 'pz:Łazarz', 'Łazarz', array[$1::uuid, $2::uuid], 'lista')`, [a.id, b.id])
// sam: zmiana wpisu pary przez jedną z osób
const id = ok(await B.rpc('kns_map_me', { lbl: 'Bartek i Ania Nowak', ar: 'pz:Wilda', pl: '' }))
assert.equal(id, 'imp-1')
assert.deepEqual(ok(await A.from('kns_map').select('*')).map(x => [x.label, x.area]), [['Bartek i Ania Nowak', 'pz:Wilda']])
err(await A.rpc('kns_map_me', { lbl: 'x', ar: 'pz:Wilda', pl: '' }), /podpis/)
err(await A.rpc('kns_map_me', { lbl: 'Ania', ar: 'Wilda', pl: '' }), /osiedle/)
// administrator: nowy wpis dla siebie i poprawka cudzego
ok(await Adm.rpc('kns_map_me', { lbl: 'Szef', ar: 'gm:Komorniki', pl: 'Plewiska' }))
ok(await Adm.from('kns_map').update({ place: 'Wilda Dolna' }).eq('id', 'imp-1'))
// obcy wpis: zwykły członek nie zmieni ani nie usunie
const sz = (await db.query(`select id from kns_map where label = 'Szef'`)).rows[0].id
await A.from('kns_map').update({ label: 'hack' }).eq('id', sz)
await A.from('kns_map').delete().eq('id', sz)
assert.equal((await db.query(`select label from kns_map where id = $1`, [sz])).rows[0].label, 'Szef')
// oczekujący i gość nic nie widzą
assert.deepEqual(ok(await P.from('kns_map').select('*')), [])
err(await P.rpc('kns_map_me', { lbl: 'Nowy', ar: 'pz:Wilda', pl: '' }), /członków/)
assert.ok((await G.from('kns_map').select('*')).error || !(await G.from('kns_map').select('*')).data?.length)
// usunięcie własnego wpisu
ok(await A.from('kns_map').delete().eq('id', 'imp-1'))
assert.equal((await db.query(`select count(*)::int n from kns_map`)).rows[0].n, 1)
console.log('mapa KNS: OK')
