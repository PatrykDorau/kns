// Test: wybory i głosowania (wybory.sql) — zgłoszenia, zatwierdzanie przez radę, tajne głosowanie na kilka osób, wyniki.
// node supabase/test-wybory.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'kalendarz.sql', 'wybory.sql', 'wybory.sql']
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

// rada zakłada wybory na osoby (do 2 wyborów); członek nie może
const eid = ok(await R.rpc('election_save', { e: { title: 'Wybory rady 2027', kind: 'people', max_choices: 2 } }))
err(await M.rpc('election_save', { e: { title: 'X' } }), /rada/)
assert.ok((await db.query(`select count(*)::int n from inbox where title like 'Wybory:%'`)).rows[0].n >= 3) // powiadomienie do członków
// lista osób do zgłaszania — bez e-maili, dla członków; czekający nic nie widzi
const people = ok(await M.rpc('election_people'))
assert.ok(people.length >= 4); assert.equal(people[0].email, undefined)
assert.equal((await P.rpc('election_people')).data?.length || 0, 0)

// zgłoszenia
ok(await M.rpc('election_nominate', { e: eid, who: ka.id }))
ok(await J.rpc('election_nominate', { e: eid, who: ka.id }))
ok(await M.rpc('election_nominate', { e: eid, who: ja.id }))
ok(await K.rpc('election_nominate', { e: eid, who: ma.id }))
err(await P.rpc('election_nominate', { e: eid, who: ka.id }), /zatwierdzeni/)
let mine = await find(M, eid)
assert.equal(mine.candidates.length, 2) // widzi tylko swoje zgłoszenia (przed akceptacją)
assert.equal(mine.candidates[0].nominations, null) // liczby zgłoszeń widzi tylko rada
let rada = await find(R, eid)
assert.equal(rada.candidates.length, 3)
const kasia = rada.candidates.find(c => c.person === ka.id), jan = rada.candidates.find(c => c.person === ja.id), marek = rada.candidates.find(c => c.person === ma.id)
assert.equal(kasia.nominations, 2)
// wycofanie zgłoszenia
ok(await J.rpc('election_nominate', { e: eid, who: ka.id, withdraw: true }))
assert.equal((await find(R, eid)).candidates.find(c => c.id === kasia.id).nominations, 1)

// głosowanie przed zatwierdzeniem — nie
err(await R.rpc('election_status', { e: eid, s: 'voting' }), /zatwierdź/)
err(await M.rpc('election_review', { c: kasia.id, ok: true }), /rada/)
ok(await R.rpc('election_review', { c: kasia.id, ok: true }))
ok(await R.rpc('election_review', { c: jan.id, ok: true }))
ok(await R.rpc('election_review', { c: marek.id, ok: false }))
ok(await R.rpc('election_status', { e: eid, s: 'voting' }))
err(await M.rpc('election_nominate', { e: eid, who: ja.id }), /zamknięte/)
mine = await find(M, eid)
assert.deepEqual(mine.candidates.map(c => c.id).sort(), [kasia.id, jan.id].sort()) // tylko zaakceptowani
assert.equal(mine.candidates[0].votes, null) // wyniki dopiero po zakończeniu

// głosy: do 2, bez powtórzeń, tylko zaakceptowani, raz
err(await M.rpc('election_vote', { e: eid, choices: [kasia.id, jan.id, marek.id] }), /najwyżej 2/)
err(await M.rpc('election_vote', { e: eid, choices: [marek.id] }), /Nieprawidłowy/)
err(await M.rpc('election_vote', { e: eid, choices: [kasia.id, kasia.id] }), /tylko raz/)
ok(await M.rpc('election_vote', { e: eid, choices: [kasia.id, jan.id] }))
err(await M.rpc('election_vote', { e: eid, choices: [kasia.id] }), /już oddany/)
// wstrzymane — nie można głosować; wznowienie bez ponownego powiadomienia
const inboxBefore = (await db.query(`select count(*)::int n from inbox where title like 'Głosowanie:%'`)).rows[0].n
ok(await R.rpc('election_status', { e: eid, s: 'paused' }))
assert.equal((await find(K, eid)).status, 'paused')
err(await K.rpc('election_vote', { e: eid, choices: [kasia.id] }), /nie jest otwarte/)
err(await R.rpc('election_status', { e: eid, s: 'paused' }), /trwające/)
ok(await R.rpc('election_status', { e: eid, s: 'voting' }))
assert.equal((await db.query(`select count(*)::int n from inbox where title like 'Głosowanie:%'`)).rows[0].n, inboxBefore)
ok(await K.rpc('election_vote', { e: eid, choices: [kasia.id] }))
ok(await J.rpc('election_vote', { e: eid, choices: [kasia.id] }))
err(await P.rpc('election_vote', { e: eid, choices: [kasia.id] }), /zatwierdzeni/)
assert.equal((await find(M, eid)).voted, true)
assert.equal((await find(R, eid)).turnout, 3)
// tajność: tabela głosów nie ma kolumny osoby, a bezpośredni dostęp do tabel jest zablokowany
const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'election_votes'`)).rows.map(r => r.column_name)
assert.deepEqual(cols.sort(), ['candidate_id', 'election_id'])
err(await M.from('election_votes').select('*'), /permission|denied|row-level/)
err(await R.from('election_voters').select('*'), /permission|denied|row-level/)
err(await R.rpc('election_status', { e: eid, s: 'nominations' }), /oddane głosy/)

// koniec i wyniki
ok(await R.rpc('election_status', { e: eid, s: 'closed' }))
const res = (await find(M, eid)).candidates
assert.equal(res.find(c => c.id === kasia.id).votes, 3)
assert.equal(res.find(c => c.id === jan.id).votes, 1)
err(await K.rpc('election_vote', { e: eid, choices: [jan.id] }), /nie jest otwarte/)

// głosowanie na opcje (np. uchwała na spotkaniu członkowskim), od razu bez zgłoszeń, podpięte pod spotkanie
await db.query(`insert into events (id, type, date, data) values ('sp1', 'czlonkowskie', current_date, '{"id":"sp1","title":"Spotkanie członkowskie"}')`)
const g = ok(await R.rpc('election_save', { e: { title: 'Zakup nagłośnienia', kind: 'options', max_choices: 1, options: ['Za', 'Przeciw', 'Wstrzymuję się'], event_id: 'sp1' } }))
assert.equal((await find(M, g)).event_id, 'sp1')
assert.deepEqual((await find(R, g)).candidates.map(c => c.label), ['Za', 'Przeciw', 'Wstrzymuję się']) // kolejność jak wpisane
ok(await R.rpc('election_status', { e: g, s: 'voting' }))
const za = (await find(M, g)).candidates.find(c => c.label === 'Za')
ok(await M.rpc('election_vote', { e: g, choices: [za.id] }))
// wyniki niepubliczne — tylko rada
ok(await R.rpc('election_save', { e: { id: g, title: 'Zakup nagłośnienia', results_public: false } }))
ok(await R.rpc('election_status', { e: g, s: 'closed' }))
assert.equal((await find(M, g)).candidates[0].votes, null)
assert.equal((await find(R, g)).candidates.find(c => c.label === 'Za').votes, 1)
ok(await R.rpc('election_remove', { e: g }))
assert.equal(await find(R, g), undefined)
console.log('wybory: wszystkie testy OK')
