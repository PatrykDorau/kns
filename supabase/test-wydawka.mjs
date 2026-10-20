// Test wydawki z wieloma przedmiotami (supabase/wydawka.sql): node supabase/test-wydawka.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'wydawka.sql', 'wydawka.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const o = await addUser(db, 'ola@kns.pl', 'Ola'), b = await addUser(db, 'bartek@kns.pl', 'Bartek'), c = await addUser(db, 'celina@kns.pl', 'Celina')
const d = await addUser(db, 'darek@kns.pl', 'Darek'), g = await addUser(db, 'gosc@kns.pl', 'Gość')
await db.query(`update people set status = 'active', roles = array['czlonek'] where email <> 'gosc@kns.pl' and email <> 'admin@kns.pl'`)
const O = createFakeClient(db, o), B = createFakeClient(db, b), C = createFakeClient(db, c), D = createFakeClient(db, d), G = createFakeClient(db, g)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const box = async X => ok(await X.from('inbox').select('*').order('id')).map(x => x.title + ' | ' + x.body)
const post = async (X, id = 'w1') => ok(await X.rpc('giveaway_board')).find(x => x.id === id)
const item = async (X, iid, id = 'w1') => (await post(X, id)).items.find(i => i.id === iid)
const items = [{ id: 'w1-a', title: 'Wózek', image: 'https://x/ogloszenia/a.jpg', qty: 1 }, { id: 'w1-b', title: '', image: '', qty: 2 }]
const save = (X, extra = {}) => X.rpc('giveaway_save', { gid: 'w1', new_title: 'Rzeczy dla dzieci', new_description: 'Po przeprowadzce', new_place: 'Wrzeszcz', new_items: items, new_closed: false, ...extra })
const TURN = 'Wydawka: teraz Twoja kolej'

// bez zatwierdzenia — nic; tabele tylko przez funkcje
err(await G.rpc('giveaway_board'), /zatwierdzonych/)
err(await save(G), /zatwierdzonych/)
err(await B.from('giveaway_items').select('*'), /permission denied/)
// dodaje Ola: dwa przedmioty (drugi bez nazwy — nazwa wydawki)
err(await save(O, { new_title: ' ' }), /Podaj/)
err(await save(O, { new_items: [] }), /co najmniej jeden/)
ok(await save(O))
const p = await post(B)
assert.equal(p.owner, 'Ola')
assert.deepEqual(p.items.map(i => [i.title, i.qty]), [['Wózek', 1], ['Rzeczy dla dzieci', 2]])
assert.equal(p.items[0].claims, null) // kto się zapisał — tylko oddający
err(await save(B, { new_title: 'Moje' }), /oddający/)
err(await O.rpc('giveaway_claim', { iid: 'w1-a', new_note: '' }), /Twoja/)
// wózek: Bartek bierze, Celina i Darek na rezerwie — kolejka osobna dla każdego przedmiotu
assert.equal(ok(await B.rpc('giveaway_claim', { iid: 'w1-a', new_note: 'Mogę jutro' })), 1)
assert.equal(ok(await C.rpc('giveaway_claim', { iid: 'w1-a', new_note: '' })), 2)
assert.equal(ok(await D.rpc('giveaway_claim', { iid: 'w1-a', new_note: '' })), 3)
assert.equal(ok(await C.rpc('giveaway_claim', { iid: 'w1-b', new_note: '' })), 1)
assert.equal((await box(O)).length, 4)
assert.match((await box(O))[1], /Celina zapisał\(a\) się na listę rezerwową \(1\.\)/)
assert.equal((await item(C, 'w1-a')).myPos, 2)
assert.equal((await item(C, 'w1-b')).myPos, 1)
assert.deepEqual((await item(O, 'w1-a')).claims.map(x => x.name), ['Bartek', 'Celina', 'Darek'])
// Bartek rezygnuje z wózka → Celina: teraz Twoja kolej
ok(await B.rpc('giveaway_unclaim', { iid: 'w1-a' }))
assert.equal((await box(C)).at(-1).split(' | ')[0], TURN)
// Ola skreśla Celinę → Darek dostaje kolej
err(await B.rpc('giveaway_drop', { iid: 'w1-a', who: c.id }), /oddający/)
ok(await O.rpc('giveaway_drop', { iid: 'w1-a', who: c.id }))
assert.equal((await box(D)).at(-1).split(' | ')[0], TURN)
// więcej sztuk wózka → kolejny z rezerwy
ok(await B.rpc('giveaway_claim', { iid: 'w1-a', new_note: '' }))
ok(await save(O, { new_items: [{ ...items[0], qty: 2 }, items[1]] }))
assert.equal((await box(B)).at(-1).split(' | ')[0], TURN)
// wydane wszystko (wózek 2 szt., rzeczy 2 szt.) → zamknięte
ok(await O.rpc('giveaway_given', { iid: 'w1-a', who: d.id, val: true }))
ok(await O.rpc('giveaway_given', { iid: 'w1-a', who: b.id, val: true }))
ok(await O.rpc('giveaway_given', { iid: 'w1-b', who: c.id, val: true }))
assert.equal((await post(O)).closed, false) // „rzeczy” — 1 z 2
ok(await save(O, { new_items: [{ ...items[0], qty: 2 }, { ...items[1], qty: 1 }] }))
ok(await O.rpc('giveaway_given', { iid: 'w1-b', who: c.id, val: true }))
assert.equal((await post(O)).closed, true)
assert.equal((await item(D, 'w1-a')).myGiven, true)
err(await C.rpc('giveaway_claim', { iid: 'w1-a', new_note: '' }), /zamknięta/)
// usunięty z listy przedmiot znika razem z zapisami
ok(await save(O, { new_items: [{ ...items[0], qty: 2 }], new_closed: true }))
assert.deepEqual((await post(O)).items.map(i => i.id), ['w1-a'])
// usuwa oddający
err(await B.rpc('giveaway_delete', { gid: 'w1' }), /oddający/)
ok(await O.rpc('giveaway_delete', { gid: 'w1' }))
assert.equal(await post(O), undefined)
console.log('wydawka: wszystkie testy OK')
