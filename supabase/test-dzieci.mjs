// Test: meldowanie dzieci (dzieci.sql). node supabase/test-dzieci.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'materialy.sql', 'dyspozycyjnosc.sql', 'widocznosc.sql', 'sluzby2.sql', 'lider-w-sluzbie.sql', 'dzieci.sql', 'dzieci.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, A] = await user('admin@kns.pl', 'Admin', ['czlonek', 'admin'])
const [r, R] = await user('rodzic@kns.pl', 'Rodzic', ['czlonek'])
const [, R2] = await user('inny@kns.pl', 'Inny', ['czlonek'])
const [n, N] = await user('naucz@kns.pl', 'Nauczycielka', ['czlonek'])
const ok = x => { assert.equal(x.error, null, x.error?.message); return x.data }
const err = (x, re) => assert.match(x.error?.message || '', re)
await db.query(`insert into ministries (id, name) values ('szk', 'Szkółka')`)
await db.query(`insert into ministry_members (ministry_id, person, status) values ('szk', $1, 'active')`, [n.id])

// nauczycielka jeszcze nie jest nauczycielem — administrator oznacza służbę jako szkółkę
assert.equal(ok(await N.rpc('kids_mine')).teacher, false)
err(await N.rpc('kids_ministry_set', { mid: 'szk', on_: true }), /administrator/)
ok(await A.rpc('kids_ministry_set', { mid: 'szk', on_: true }))
assert.equal(ok(await N.rpc('kids_mine')).teacher, true)

// rodzic: dzieci, meldunek, kod wspólny dla rodzeństwa
err(await R.rpc('kid_save', { k: { name: ' ' } }), /imię/)
const zosia = ok(await R.rpc('kid_save', { k: { name: 'Zosia', born: '2020', allergies: 'orzechy' } }))
const jas = ok(await R.rpc('kid_save', { k: { name: 'Jaś', born: '2018' } }))
err(await R2.rpc('kid_save', { k: { id: zosia, name: 'X' } }), /nie jest Twoje/)
err(await R2.rpc('kid_checkin', { kid_ids: [zosia], r: '' }), /nie jest Twoje/)
err(await R.rpc('kid_checkin', { kid_ids: [zosia], r: 'Kosmos' }), /sali/)
const code = ok(await R.rpc('kid_checkin', { kid_ids: [zosia], r: 'Maluchy (2–4)' }))
assert.match(code, /^\d{4}$/)
assert.equal(ok(await R.rpc('kid_checkin', { kid_ids: [jas], r: 'Szkolne (7–12)' })), code)
assert.equal(ok(await R.rpc('kids_mine')).kids.find(k => k.id === zosia).today.code, code)
assert.equal(ok(await R2.rpc('kids_mine')).kids.length, 0)

// nauczyciel: lista z alergiami; inni nie
err(await R.rpc('kids_board'), /nauczyciele/)
const board = ok(await N.rpc('kids_board'))
assert.equal(board.length, 2); assert.equal(board.find(k => k.name === 'Zosia').allergies, 'orzechy')
err(await N.rpc('kid_pickup', { c: '0000' === code ? '1111' : '0000' }), /Nie ma dziecka/)
err(await R.rpc('kid_pickup', { c: code }), /nauczyciele/)
assert.equal(ok(await N.rpc('kid_pickup', { c: code })), 'Jaś, Zosia')
err(await N.rpc('kid_pickup', { c: code }), /już odebrane/)
assert.ok((await db.query(`select title from inbox where person = $1`, [r.id])).rows.some(x => /Odebrano: Jaś, Zosia/.test(x.title)))
// po odbiorze ponowny meldunek — nowy kod możliwy, dziecko znów w sali
ok(await R.rpc('kid_checkin', { kid_ids: [zosia], r: '' }))
assert.equal(ok(await N.rpc('kids_board')).find(k => k.name === 'Zosia').out, null)
ok(await N.rpc('kids_rooms_set', { r: ['Sala A', ' ', 'Sala B'] }))
assert.deepEqual(ok(await R.rpc('kids_mine')).rooms, ['Sala A', 'Sala B'])
ok(await R.rpc('kid_delete', { kid_id: jas }))
assert.equal(ok(await R.rpc('kids_mine')).kids.length, 1)
console.log('dzieci: OK')
