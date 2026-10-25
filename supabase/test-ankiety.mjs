// Test: ankiety (ankiety.sql) — tworzenie dla grupy, powiadomienia, wypełnianie, poprawianie, anonimowość, wyniki, zamykanie.
// node supabase/test-ankiety.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'asb.sql', 'wiadomosci.sql', 'ankiety.sql', 'ankiety.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [, P] = await user('pastor@kns.pl', 'Piotr Pastor', ['czlonek', 'pastor'])
const [, L] = await user('lider@kns.pl', 'Zosia Lider', ['czlonek', 'lider'])
const [, M] = await user('marek@kns.pl', 'Marek', ['czlonek'])
const [, A] = await user('ania@kns.pl', 'Ania', ['czlonek', 'lider'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)
const box = async email => (await db.query(`select i.* from inbox i join people p on p.id = i.person where p.email = $1 order by i.id`, [email])).rows

const Q = [{ id: 'q1', type: 'one', label: 'Jak oceniasz spotkania?', options: ['Dobrze', 'Średnio'], required: true },
  { id: 'q2', type: 'scale', label: 'Skala', required: false }, { id: 'q3', type: 'text', label: 'Uwagi' }]
// tylko pastor / rada / administrator tworzy
err(await M.rpc('survey_save', { s: { id: 's1', title: 'X', questions: Q, everyone: true } }), /pastor, rada/)
err(await P.rpc('survey_save', { s: { id: 's1', title: 'Ewaluacja', questions: Q } }), /Wybierz, kto/)
err(await P.rpc('survey_save', { s: { id: 's1', title: 'Ewaluacja', questions: [], ranks: ['lider'] } }), /co najmniej jedno/)
ok(await P.rpc('survey_save', { s: { id: 's1', title: 'Ewaluacja liderów', questions: Q, ranks: ['lider'], anonymous: true } }))
// powiadomienie: liderzy tak, Marek nie
assert.equal((await box('lider@kns.pl')).filter(i => i.title === 'Ankieta: Ewaluacja liderów').length, 1)
assert.equal((await box('ania@kns.pl'))[0].url, './ankiety/s1')
assert.equal((await box('marek@kns.pl')).length, 0)
// lista
assert.equal(ok(await M.rpc('survey_board')).list.length, 0)
const lb = ok(await L.rpc('survey_board')); assert.equal(lb.canCreate, false); assert.equal(lb.list[0].forMe, true); assert.equal(lb.list[0].answered, false)
assert.equal(ok(await P.rpc('survey_board')).list[0].targets, 2)
// odpowiedzi
err(await M.rpc('survey_answer', { sid: 's1', answers: { q1: 0 } }), /innej grupy/)
err(await L.rpc('survey_answer', { sid: 's1', answers: { q3: 'hej' } }), /wymagane/)
ok(await L.rpc('survey_answer', { sid: 's1', answers: { q1: 0, q2: 4, q3: 'Super' } }))
ok(await L.rpc('survey_answer', { sid: 's1', answers: { q1: 1, q2: 5 } })) // poprawka
assert.deepEqual(ok(await L.rpc('survey_board')).list[0].myAnswers, { q1: 1, q2: 5 })
// pytań nie da się zmienić po odpowiedzi; tytuł tak; anonimowość zostaje
err(await P.rpc('survey_save', { s: { id: 's1', title: 'Ewaluacja liderów', questions: Q.slice(0, 1), ranks: ['lider'], anonymous: true } }), /pytań nie można/)
ok(await P.rpc('survey_save', { s: { id: 's1', title: 'Ewaluacja liderów 2026', questions: Q, ranks: ['lider'], anonymous: false } }))
assert.equal((await db.query(`select anonymous from surveys where id = 's1'`)).rows[0].anonymous, true)
// wyniki: tylko prowadzący, anonimowo bez imion, brakujący
err(await L.rpc('survey_results', { sid: 's1' }), /Wyniki widzi/)
const res = ok(await P.rpc('survey_results', { sid: 's1' }))
assert.equal(res.responses.length, 1); assert.equal(res.responses[0].name, null); assert.deepEqual(res.missing, ['Ania'])
// imienna ankieta dla wszystkich
ok(await P.rpc('survey_save', { s: { id: 's2', title: 'Piknik', questions: [{ id: 'a', type: 'many', label: 'Co przyniesiesz?', options: ['Ciasto', 'Napoje'] }], everyone: true, closes: '2099-01-01' } }))
ok(await M.rpc('survey_answer', { sid: 's2', answers: { a: [0, 1] } }))
assert.equal(ok(await P.rpc('survey_results', { sid: 's2' })).responses[0].name, 'Marek')
// zamknięcie: koniec odpowiedzi; termin w przeszłości zamyka sam
ok(await P.rpc('survey_status', { sid: 's2', st: 'closed' }))
err(await A.rpc('survey_answer', { sid: 's2', answers: { a: [0] } }), /zamknięta/)
await db.query(`update surveys set closes = current_date - 1 where id = 's1'`)
assert.equal(ok(await L.rpc('survey_board')).list.find(s => s.id === 's1').status, 'closed')
err(await M.rpc('survey_remove', { sid: 's2' }), /uprawnień/)
ok(await P.rpc('survey_remove', { sid: 's2' }))
assert.equal((await db.query(`select count(*)::int n from survey_responses where survey_id = 's2'`)).rows[0].n, 0)
// konkretna osoba (Marek) obok rangi
const marekId = (await db.query(`select id from people where email = 'marek@kns.pl'`)).rows[0].id
ok(await P.rpc('survey_save', { s: { id: 's3', title: 'Dla Marka i liderów', questions: Q, ranks: ['lider'], people: [marekId] } }))
assert.equal(ok(await M.rpc('survey_board')).list.find(s => s.id === 's3').forMe, true)
assert.equal(ok(await P.rpc('survey_board')).list.find(s => s.id === 's3').people[0].name, 'Marek')
ok(await P.rpc('survey_save', { s: { id: 's4', title: 'Tylko Marek', questions: Q, people: [marekId] } }))
assert.equal(ok(await A.rpc('survey_board')).list.some(s => s.id === 's4'), false)
// gość nic nie widzi
err(await createFakeClient(db).rpc('survey_board'), /.+/)
console.log('ankiety: OK')
