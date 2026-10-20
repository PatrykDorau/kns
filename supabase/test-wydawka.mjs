// Test wydawki (supabase/wydawka.sql): node supabase/test-wydawka.mjs
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
const box = async (X) => ok(await X.from('inbox').select('*').order('id')).map(x => x.title + ' | ' + x.body)
const item = async (X, id = 'w1') => ok(await X.rpc('giveaway_board')).find(x => x.id === id)
const save = (X, extra = {}) => X.rpc('giveaway_save', { gid: 'w1', new_title: 'Wózek dziecięcy', new_description: 'Mało używany', new_image: '', new_place: 'Wrzeszcz', new_qty: 1, new_closed: false, ...extra })

// bez zatwierdzenia — nic; tabele tylko przez funkcje
err(await G.rpc('giveaway_board'), /zatwierdzonych/)
err(await save(G), /zatwierdzonych/)
err(await B.from('giveaways').select('*'), /permission denied/)
// dodaje Ola
err(await save(O, { new_title: '  ' }), /Podaj/)
ok(await save(O))
assert.equal((await item(B)).owner, 'Ola')
assert.equal((await item(B)).claims, null) // kto się zapisał — tylko oddający
err(await save(B, { new_title: 'Mój' }), /oddający/)
err(await O.rpc('giveaway_claim', { gid: 'w1', new_note: '' }), /Twoja/)
// Bartek bierze, Celina i Darek na rezerwie; Ola dostaje powiadomienia
assert.equal(ok(await B.rpc('giveaway_claim', { gid: 'w1', new_note: 'Mogę jutro' })), 1)
assert.equal(ok(await C.rpc('giveaway_claim', { gid: 'w1', new_note: '' })), 2)
assert.equal(ok(await D.rpc('giveaway_claim', { gid: 'w1', new_note: '' })), 3)
assert.deepEqual(await box(O), ['Wydawka: Wózek dziecięcy | Bartek chce to wziąć.', 'Wydawka: Wózek dziecięcy | Celina zapisał(a) się na listę rezerwową (1.).', 'Wydawka: Wózek dziecięcy | Darek zapisał(a) się na listę rezerwową (2.).'])
assert.equal((await item(C)).myPos, 2)
assert.deepEqual((await item(O)).claims.map(x => x.name), ['Bartek', 'Celina', 'Darek'])
// Bartek rezygnuje → Celina dostaje „teraz Twoja kolej”
ok(await B.rpc('giveaway_unclaim', { gid: 'w1' }))
assert.deepEqual(await box(C), ['Wydawka: teraz Twoja kolej | „Wózek dziecięcy” — możesz odebrać. Umów się z oddającym.'])
assert.equal((await box(D)).length, 0)
// Ola skreśla Celinę → Celina dostaje informację, Darek — że teraz jego kolej
err(await B.rpc('giveaway_drop', { gid: 'w1', who: c.id }), /oddający/)
ok(await O.rpc('giveaway_drop', { gid: 'w1', who: c.id }))
assert.equal((await box(C)).length, 2)
assert.deepEqual(await box(D), ['Wydawka: teraz Twoja kolej | „Wózek dziecięcy” — możesz odebrać. Umów się z oddającym.'])
// więcej sztuk → kolejni z rezerwy też
ok(await B.rpc('giveaway_claim', { gid: 'w1', new_note: '' }))
ok(await save(O, { new_qty: 2 }))
assert.equal((await box(B)).at(-1), 'Wydawka: teraz Twoja kolej | „Wózek dziecięcy” — możesz odebrać. Umów się z oddającym.')
// wydane wszystkie sztuki → zamknięte; nowych zapisów nie ma
ok(await O.rpc('giveaway_given', { gid: 'w1', who: d.id, val: true }))
assert.equal((await item(O)).closed, false)
ok(await O.rpc('giveaway_given', { gid: 'w1', who: b.id, val: true }))
assert.equal((await item(O)).closed, true)
assert.equal((await item(D)).myGiven, true)
err(await C.rpc('giveaway_claim', { gid: 'w1', new_note: '' }), /zamknięta/)
// usuwa oddający
err(await B.rpc('giveaway_delete', { gid: 'w1' }), /oddający/)
ok(await O.rpc('giveaway_delete', { gid: 'w1' }))
assert.equal(await item(O), undefined)
console.log('wydawka: wszystkie testy OK')
