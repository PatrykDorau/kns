// Test: grupki domowe na Mapie KNS (grupki.sql). node supabase/test-grupki.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'grupki.sql', 'grupki.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, roles, status = 'active') => {
  const u = await addUser(db, email, email)
  await db.query(`update people set status = $3, roles = $2, name = $4 where email = $1`, [email, roles, status, email.split('@')[0]])
  return [u, createFakeClient(db, u)]
}
const [a, A] = await user('ania@kns.pl', ['czlonek'])
const [b, B] = await user('bartek@kns.pl', ['czlonek'])
const [, C] = await user('celina@kns.pl', ['czlonek'])
const [, Adm] = await user('szef@kns.pl', ['admin'])
const [, P] = await user('nowy@kns.pl', [], 'pending')
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const load = async X => ok(await X.rpc('kns_groups_load'))
const grupa = async id => (await db.query(`select grupa from people where id = $1`, [id])).rows[0].grupa

// prowadząca zakłada grupkę — zostaje prowadzącą i uczestniczką
const g = ok(await A.rpc('kns_group_save', { gid: '', nm: 'Grupka Wilda', ar: 'pz:Wilda', pl: '', dy: 'wtorek', tm: '19:00', ldrs: null }))
assert.equal(await grupa(a.id), 'Grupka Wilda')
err(await B.rpc('kns_group_save', { gid: '', nm: 'grupka wilda', ar: 'pz:Wilda', pl: '', dy: '', tm: '', ldrs: null }), /już jest/)
err(await B.rpc('kns_group_save', { gid: '', nm: 'X', ar: 'pz:Wilda', pl: '', dy: '', tm: '', ldrs: null }), /nazwę/)
err(await B.rpc('kns_group_save', { gid: '', nm: 'Nowa', ar: 'Wilda', pl: '', dy: '', tm: '', ldrs: null }), /osiedle/)
// uczestnik dołącza; nie może zmienić grupki
ok(await B.rpc('kns_group_join', { gid: g, joining: true }))
err(await B.rpc('kns_group_save', { gid: g, nm: 'hack', ar: 'pz:Wilda', pl: '', dy: '', tm: '', ldrs: null }), /prowadzący/)
err(await B.rpc('kns_group_delete', { gid: g }), /prowadzący/)
let [x] = await load(B)
assert.deepEqual(x.members.map(m => m.name), ['ania', 'bartek'])
assert.deepEqual(x.leaders.map(m => m.name), ['ania'])
assert.equal(x.mine, true); assert.equal(x.can, false); assert.equal(x.lead, false)
// prowadząca dopisuje współprowadzącego i zmienia nazwę — uczestnicy zostają
ok(await A.rpc('kns_group_save', { gid: g, nm: 'Wilda Dolna', ar: 'pz:Wilda', pl: 'Dolna Wilda', dy: 'wtorek', tm: '19:30', ldrs: [a.id, b.id, b.id] }));
[x] = await load(C)
assert.equal(x.name, 'Wilda Dolna'); assert.deepEqual(x.leaders.map(m => m.name), ['ania', 'bartek']); assert.equal(x.members.length, 2); assert.equal(x.mine, false)
assert.equal(await grupa(b.id), 'Wilda Dolna')
err(await A.rpc('kns_group_save', { gid: g, nm: 'Wilda Dolna', ar: 'pz:Wilda', pl: '', dy: '', tm: '', ldrs: [] }), /prowadzącego/)
// współprowadzący odchodzi; jedyna prowadząca nie może odejść
ok(await B.rpc('kns_group_join', { gid: g, joining: false }));
[x] = await load(A)
assert.deepEqual(x.leaders.map(m => m.name), ['ania']); assert.equal(x.members.length, 1); assert.equal(x.lead, true)
err(await A.rpc('kns_group_join', { gid: g, joining: false }), /jedynym/)
// podpowiedzi w profilu zawierają grupki z mapy
ok(await C.rpc('kns_group_save', { gid: '', nm: 'Komorniki', ar: 'gm:Komorniki', pl: 'Plewiska', dy: '', tm: '', ldrs: null }))
assert.deepEqual(ok(await B.rpc('group_names')), ['Komorniki', 'Wilda Dolna'])
// oczekujący nic nie widzi i nie dodaje; tabela niedostępna wprost
assert.deepEqual(await load(P), [])
err(await P.rpc('kns_group_save', { gid: '', nm: 'Nowa', ar: 'pz:Wilda', pl: '', dy: '', tm: '', ldrs: null }), /członków/)
assert.ok((await B.from('kns_groups').select('*')).error || !(await B.from('kns_groups').select('*')).data?.length)
// administrator usuwa — uczestnikom czyści się pole Grupka
ok(await Adm.rpc('kns_group_delete', { gid: g }))
assert.equal(await grupa(a.id), '')
assert.equal((await load(A)).length, 1)
console.log('grupki: OK')
