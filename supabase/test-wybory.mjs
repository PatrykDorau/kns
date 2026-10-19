// Test: głosowania (wybory.sql + wybory2.sql) — jedna lista do wyboru (osoby i dowolne odpowiedzi), zgłoszenia
// od członków do terminu, zatwierdzanie przez radę, głosowanie ręczne (otwórz / wstrzymaj / zakończ) i w terminie
// od–do (otwiera się i kończy samo), tajny głos, wyniki. node supabase/test-wybory.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'kalendarz.sql', 'wybory.sql', 'wybory.sql', 'wybory2.sql', 'wybory2.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles, status = 'active') => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = $4, name = $2, roles = $3 where email = $1`, [email, name, roles, status])
  return [u, createFakeClient(db, u)]
}
const [, R] = await user('rada@kns.pl', 'Rafał Rada', ['czlonek', 'rada'])
const [ma, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [ka, K] = await user('kasia@kns.pl', 'Kasia', ['czlonek'])
const [ja, J] = await user('jan@kns.pl', 'Jan', ['czlonek'])
const [, P] = await user('nowy@kns.pl', 'Nowy', [], 'pending')
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const find = async (C, id) => (ok(await C.rpc('elections_overview'))).find(e => e.id === id)
const inIso = min => new Date(Date.now() + min * 60000).toISOString()
const inbox = async like => (await db.query(`select count(*)::int n from inbox where title like $1`, [like])).rows[0].n

// 1. Wybory rady: tworzący dopisuje Jana, członkowie mogą zgłaszać do terminu
err(await M.rpc('election_save', { e: { title: 'X' } }), /rada/)
err(await R.rpc('election_save', { e: { title: 'Zły termin', vote_start: inIso(60), vote_end: inIso(30) } }), /po jego początku/)
err(await R.rpc('election_save', { e: { title: 'Zły termin', allow_nominations: true, nominations_until: inIso(120), vote_start: inIso(60) } }), /przed początkiem/)
const eid = ok(await R.rpc('election_save', { e: { title: 'Wybory rady 2027', max_choices: 2, allow_nominations: true, nominations_until: inIso(60), options: [{ person: ja.id }] } }))
assert.equal(await inbox('Głosowanie: Wybory rady%'), 3) // powiadomienie do członków (bez tworzącego)
let rada = await find(R, eid)
assert.equal(rada.status, 'nominations'); assert.equal(rada.kind, 'mixed')
assert.equal(rada.candidates.length, 1); assert.equal(rada.candidates[0].accepted, true) // dopisany przez tworzącego — od razu na liście
// lista osób do wyboru — bez e-maili; czekający nic nie widzi
assert.ok(ok(await M.rpc('election_people')).length >= 4)
assert.equal((await P.rpc('election_people')).data?.length || 0, 0)

// zgłoszenia: osoby i propozycja tekstem
ok(await M.rpc('election_nominate', { e: eid, who: ka.id }))
ok(await J.rpc('election_nominate', { e: eid, who: ka.id }))
ok(await K.rpc('election_nominate', { e: eid, who: ma.id }))
ok(await K.rpc('election_nominate', { e: eid, label: 'Ktoś spoza zboru' }))
err(await M.rpc('election_nominate', { e: eid }), /Wybierz osobę/)
err(await P.rpc('election_nominate', { e: eid, who: ka.id }), /zatwierdzonych/)
let mine = await find(M, eid)
assert.deepEqual(mine.candidates.map(c => c.label).sort(), ['Jan', 'Kasia']) // zatwierdzony Jan + moje zgłoszenie
assert.equal(mine.candidates[0].nominations, null) // liczby zgłoszeń widzi tylko rada
rada = await find(R, eid)
const kasia = rada.candidates.find(c => c.person === ka.id), marek = rada.candidates.find(c => c.person === ma.id), spoza = rada.candidates.find(c => c.label === 'Ktoś spoza zboru')
assert.equal(kasia.nominations, 2); assert.equal(kasia.accepted, null)
ok(await J.rpc('election_nominate', { e: eid, who: ka.id, withdraw: true }))
assert.equal((await find(R, eid)).candidates.find(c => c.id === kasia.id).nominations, 1)

// rada układa listę: Kasia tak, Marek nie; propozycja tekstem czeka na decyzję
err(await M.rpc('election_review', { c: kasia.id, ok: true }), /rada/)
ok(await R.rpc('election_review', { c: kasia.id, ok: true }))
ok(await R.rpc('election_review', { c: marek.id, ok: false }))
ok(await R.rpc('election_save', { e: { id: eid, title: 'Wybory rady 2027', max_choices: 2, allow_nominations: true, nominations_until: inIso(60), options: [{ person: ka.id }, { person: ja.id }] } }))
rada = await find(R, eid)
assert.deepEqual(rada.candidates.filter(c => c.accepted).map(c => c.label), ['Kasia', 'Jan']) // kolejność z listy
assert.equal(rada.candidates.find(c => c.id === spoza.id).accepted, null) // zgłoszenie czeka na decyzję rady (zapis listy go nie usuwa)

// 2. ręczne otwarcie (np. na spotkaniu) — zgłoszenia zamknięte
ok(await R.rpc('election_status', { e: eid, s: 'voting' }))
assert.equal((await find(M, eid)).status, 'voting')
err(await M.rpc('election_nominate', { e: eid, who: ja.id }), /zamknięte/)
mine = await find(M, eid)
assert.deepEqual(mine.candidates.map(c => c.id).sort(), [kasia.id, rada.candidates.find(c => c.person === ja.id).id].sort())
const jan = mine.candidates.find(c => c.person === ja.id)
assert.equal(mine.candidates[0].votes, null)
err(await M.rpc('election_vote', { e: eid, choices: [kasia.id, jan.id, marek.id] }), /najwyżej 2/)
err(await M.rpc('election_vote', { e: eid, choices: [marek.id] }), /Nieprawidłowy/)
err(await M.rpc('election_vote', { e: eid, choices: [kasia.id, kasia.id] }), /tylko raz/)
ok(await M.rpc('election_vote', { e: eid, choices: [kasia.id, jan.id] }))
err(await M.rpc('election_vote', { e: eid, choices: [kasia.id] }), /już oddany/)
// zapis po oddaniu głosów nie zmienia listy ani liczby wyborów
ok(await R.rpc('election_save', { e: { id: eid, title: 'Wybory rady 2027 (II tura)', max_choices: 5, options: [{ person: ma.id }] } }))
rada = await find(R, eid)
assert.equal(rada.max_choices, 2); assert.equal(rada.candidates.filter(c => c.accepted).length, 2); assert.equal(rada.title, 'Wybory rady 2027 (II tura)')
// wstrzymanie i wznowienie (bez ponownego powiadomienia)
const before = await inbox('Głosowanie:%')
ok(await R.rpc('election_status', { e: eid, s: 'paused' }))
assert.equal((await find(K, eid)).status, 'paused')
err(await K.rpc('election_vote', { e: eid, choices: [kasia.id] }), /nie jest otwarte/)
ok(await R.rpc('election_status', { e: eid, s: 'voting' }))
assert.equal(await inbox('Głosowanie:%'), before)
ok(await K.rpc('election_vote', { e: eid, choices: [kasia.id] }))
ok(await J.rpc('election_vote', { e: eid, choices: [kasia.id] }))
err(await P.rpc('election_vote', { e: eid, choices: [kasia.id] }), /zatwierdzeni/)
assert.equal((await find(R, eid)).turnout, 3)
// tajność
const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'election_votes'`)).rows.map(r => r.column_name)
assert.deepEqual(cols.sort(), ['candidate_id', 'election_id'])
err(await M.from('election_votes').select('*'), /permission|denied|row-level/)
err(await R.rpc('election_status', { e: eid, s: 'nominations' }), /oddane głosy/)
ok(await R.rpc('election_status', { e: eid, s: 'closed' }))
const res = (await find(M, eid)).candidates
assert.equal(res.find(c => c.id === kasia.id).votes, 3); assert.equal(res.find(c => c.id === jan.id).votes, 1)
err(await K.rpc('election_vote', { e: eid, choices: [jan.id] }), /nie jest otwarte/)

// 3. Uchwała w terminie od–do, odpowiedzi tekstem razem z osobą, podpięta pod spotkanie; otwiera się i kończy sama
await db.query(`insert into events (id, type, date, data) values ('sp1', 'czlonkowskie', current_date, '{"id":"sp1","title":"Spotkanie członkowskie"}')`)
const g = ok(await R.rpc('election_save', { e: { title: 'Zakup nagłośnienia', options: ['Za', 'Przeciw', { label: 'Wstrzymuję się' }], event_id: 'sp1', vote_start: inIso(-1), vote_end: inIso(60), results_public: false } }))
let gm = await find(M, g)
assert.equal(gm.status, 'voting'); assert.equal(gm.event_id, 'sp1')
assert.deepEqual(gm.candidates.map(c => c.label), ['Za', 'Przeciw', 'Wstrzymuję się'])
const opens = await inbox('Głosowanie: Zakup%')
ok(await M.rpc('elections_tick')) // pierwsze wejście po starcie — zapis otwarcia i powiadomienie
ok(await K.rpc('elections_tick')) // drugi raz — bez powiadomienia
assert.equal(await inbox('Głosowanie: Zakup%'), opens + 3) // wszyscy oprócz wywołującego
ok(await M.rpc('election_vote', { e: g, choices: [gm.candidates[0].id] }))
// koniec w terminie
await db.query(`update elections set vote_end = now() - interval '1 minute' where id = $1`, [g])
assert.equal((await find(M, g)).status, 'closed')
err(await K.rpc('election_vote', { e: g, choices: [gm.candidates[0].id] }), /nie jest otwarte/)
ok(await M.rpc('elections_tick'))
assert.equal((await db.query(`select status from elections where id = $1`, [g])).rows[0].status, 'closed')
assert.equal(await inbox('Wyniki: Zakup%'), 0) // wyniki niepubliczne — bez powiadomienia
assert.equal((await find(M, g)).candidates[0].votes, null) // tylko rada
assert.equal((await find(R, g)).candidates.find(c => c.label === 'Za').votes, 1)
// zaplanowane na później — „przygotowane”, bez głosowania
const later = ok(await R.rpc('election_save', { e: { title: 'Później', options: ['Tak', 'Nie'], vote_start: inIso(120), vote_end: inIso(180) } }))
assert.equal((await find(M, later)).status, 'ready')
err(await M.rpc('election_vote', { e: later, choices: [(await find(M, later)).candidates[0].id] }), /nie jest otwarte/)
ok(await R.rpc('election_remove', { e: g }))
assert.equal(await find(R, g), undefined)
console.log('wybory: wszystkie testy OK')
