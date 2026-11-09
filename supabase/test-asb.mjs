// Test ASB (supabase/asb.sql): node supabase/test-asb.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'asb.sql', 'asb.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const a = await addUser(db, 'admin@kns.pl'), s = await addUser(db, 'student@kns.pl'), m = await addUser(db, 'marek@kns.pl')
await db.query(`update people set status = 'active', roles = array['czlonek', 'asb'] where email = 'student@kns.pl'`)
await db.query(`update people set status = 'active', roles = array['czlonek', 'lider'] where email = 'marek@kns.pl'`)
const A = createFakeClient(db, a), S = createFakeClient(db, s), M = createFakeClient(db, m)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

assert.equal(ok(await A.from('ranks').select('*')).some(r => r.id === 'asb'), true)
ok(await S.from('asb_meetings').upsert({ id: 'm1', season: '2026/2027', sort: 1, month: 'PAŹDZIERNIK', date: '2026-10-06', leader: 'Konrad', helper: 'Szymon', topic: 'Czy chrześcijaństwo ma sens?', attendance: 15 }))
ok(await S.from('asb_ideas').upsert({ id: 'i1', author: 'Szymon', topic: 'Proces Jezusa' }))
assert.equal(ok(await A.from('asb_meetings').select('*')).length, 1) // administrator widzi
assert.deepEqual(ok(await M.from('asb_meetings').select('*')), []) // bez rangi ASB — nic
assert.deepEqual(ok(await M.from('asb_ideas').select('*')), [])
err(await M.from('asb_meetings').upsert({ id: 'm2', season: 'x', topic: 'hack' }), /row-level security|permission/)
ok(await S.from('asb_meetings').update({ attendance: 17 }).eq('id', 'm1'))
assert.equal(ok(await S.from('asb_meetings').select('*'))[0].attendance, 17)
ok(await S.from('asb_ideas').delete().eq('id', 'i1'))
assert.equal(ok(await S.from('asb_ideas').select('*')).length, 0)

// Zaangażowany (ranga asb_zaang): widzi grafik i pomysły, dopisuje pomysły, niczego nie zmienia ani nie usuwa
const z = await addUser(db, 'zaang@kns.pl'); await db.query(`update people set status = 'active', roles = array['czlonek', 'asb_zaang'] where email = 'zaang@kns.pl'`)
const Z = createFakeClient(db, z)
assert.equal(ok(await Z.from('asb_meetings').select('*')).length, 1)
assert.ok((await Z.from('asb_meetings').upsert({ id: 'mz', season: '2026/2027', topic: 'moje' })).error)
await Z.from('asb_meetings').update({ attendance: 99 }).eq('id', 'm1')
assert.equal(ok(await A.from('asb_meetings').select('*')).find(x => x.id === 'm1').attendance, 17)
ok(await Z.from('asb_ideas').upsert({ id: 'iz', author: 'Zosia', topic: 'Kim był Paweł?' }))
assert.equal(ok(await S.from('asb_ideas').select('*')).length, 1)
await Z.from('asb_ideas').delete().eq('id', 'iz')
assert.equal(ok(await Z.from('asb_ideas').select('*')).length, 1)
assert.equal(ok(await Z.rpc('is_asb')), false); assert.equal(ok(await Z.rpc('is_asb_member')), true)
// głosy: każdy z dostępem do ASB raz na pomysł, cofnięcie; bez dostępu — nie
assert.equal(ok(await Z.rpc('asb_idea_vote', { i: 'iz', v: true })), 1)
assert.equal(ok(await Z.rpc('asb_idea_vote', { i: 'iz', v: true })), 1) // drugi raz nic nie dodaje
assert.equal(ok(await S.rpc('asb_idea_vote', { i: 'iz', v: true })), 2)
err(await M.rpc('asb_idea_vote', { i: 'iz', v: true }), /dostępem do ASB/)
assert.equal(ok(await Z.from('asb_idea_votes').select('*')).length, 2)
assert.deepEqual(ok(await M.from('asb_idea_votes').select('*')), [])
assert.equal(ok(await Z.rpc('asb_idea_vote', { i: 'iz', v: false })), 1)
ok(await S.from('asb_ideas').delete().eq('id', 'iz'))
assert.equal((await db.query('select count(*)::int n from asb_idea_votes')).rows[0].n, 0) // usunięty pomysł — głosy też

// Kalendarz kościelny: spotkanie z datą → wydarzenie „asb_<id>” (opublikowane, widzi je każdy członek)
const ev = async id => (await db.query('select * from events where id = $1', ['asb_' + id])).rows[0]
let e = await ev('m1')
assert.equal(e.status, 'published'); assert.equal(e.type, 'studenckie'); assert.equal(e.is_public, true)
assert.equal(e.data.title, 'ASB: Czy chrześcijaństwo ma sens?'); assert.equal(e.data.asb, 'm1')
assert.equal(ok(await M.from('events').select('*')).some(x => x.id === 'asb_m1'), true)
ok(await S.from('asb_meetings').upsert({ id: 'm3', season: '2026/2027', sort: 3, kind: 'wewnetrzne', date: '2026-10-10', time: '18:00', topic: '', leader: 'Konrad', note: 'tajne', study: 'Dz 17' }))
e = await ev('m3')
assert.equal(e.is_public, false); assert.equal(e.data.title, 'ASB: spotkanie wewnętrzne'); assert.equal(e.data.time, '18:00')
assert.equal(JSON.stringify(e.data).includes('tajne'), false) // notatka zostaje w ASB
err(await S.from('asb_meetings').upsert({ id: 'm4', season: 'x', kind: 'zly' }), /check|asb_meetings_kind/)
ok(await S.from('asb_meetings').update({ leader: 'Przerwa', topic: '' }).eq('id', 'm1'))
assert.equal(await ev('m1'), undefined) // przerwa — znika z kalendarza
ok(await S.from('asb_meetings').delete().eq('id', 'm3'))
assert.equal(await ev('m3'), undefined)

// Przypomnienie: dzwonek dla wszystkich z rangą ASB (bez wysyłającego)
await addUser(db, 'kasia@kns.pl')
await db.query("update people set status = 'active', roles = array['czlonek', 'asb'] where email = 'kasia@kns.pl'")
ok(await S.from('asb_meetings').upsert({ id: 'm5', season: '2026/2027', sort: 5, kind: 'wewnetrzne', date: '2026-10-20', topic: 'Spotkanie organizacyjne', place: 'Studnia' }))
assert.equal(ok(await S.rpc('asb_remind', { meeting: 'm5' })), 2) // organizatorka Kasia i zaangażowana Zosia
const box = (await db.query("select i.* from inbox i join people p on p.id = i.person where p.email = 'kasia@kns.pl'")).rows
assert.equal(box.length, 1); assert.equal(box[0].title, 'ASB: Spotkanie organizacyjne'); assert.equal(box[0].url, './?asb=m5')
assert.match(box[0].body, /20\.10 · 19:00 · Studnia/)
assert.equal((await db.query("select count(*)::int n from inbox i join people p on p.id = i.person where p.email = 'marek@kns.pl'")).rows[0].n, 0)
err(await M.rpc('asb_remind', { meeting: 'm5' }), /rangą ASB/)
assert.notEqual(ok(await S.from('asb_meetings').select('*').eq('id', 'm5'))[0].reminded, null)
console.log('asb: wszystkie testy OK')
