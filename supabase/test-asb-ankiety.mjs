// Test: ankiety ASB z kodem QR (asb-ankiety.sql). node supabase/test-asb-ankiety.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'asb.sql', 'asb-statystyki.sql', 'asb-ankiety.sql', 'asb-ankiety.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, roles) => {
  const u = await addUser(db, email, email)
  await db.query(`update people set status = 'active', roles = $2 where email = $1`, [email, roles])
  return createFakeClient(db, u)
}
const S = await user('org@kns.pl', ['czlonek', 'asb'])
const Z = await user('zaang@kns.pl', ['czlonek', 'asb_zaang'])
const G = createFakeClient(db, null)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }
const err = (r, re) => assert.match(r.error?.message || '', re)

const questions = [
  { id: 'q1', text: 'Skąd się dowiedziałeś?', type: 'source' },
  { id: 'q2', text: 'Czy jesteś pierwszy raz?', type: 'one', options: ['Tak', 'Nie'] },
  { id: 'q3', text: 'Co Cię zainteresowało?', type: 'many', options: ['Temat', 'Jedzenie', 'Ludzie'] },
  { id: 'q4', text: 'Co poprawić?', type: 'open' },
]
ok(await S.from('asb_stat_events').upsert({ id: 'E1', name: 'Okultyzm', date: '2026-11-03' }))
ok(await S.from('asb_surveys').upsert({ id: 's1', title: 'Okultyzm', event_id: 'E1', questions }))
const token = (await db.query(`select token from asb_surveys where id = 's1'`)).rows[0].token
assert.equal(token.length, 12)

// gość: widzi pytania, wysyła odpowiedzi; śmieci są odfiltrowane
const pub = ok(await G.rpc('asb_survey_public', { t: token }))
assert.equal(pub.questions.length, 4); assert.equal(pub.open, true)
ok(await G.rpc('asb_survey_submit', { t: token, a: { q1: 'src_friends', q2: 'Tak', q3: ['Temat', 'Hakowanie'], q4: '  Więcej czasu na pytania  ', x: 'obce' } }))
ok(await G.rpc('asb_survey_submit', { t: token, a: { q1: 'src_social' } }))
err(await G.rpc('asb_survey_submit', { t: token, a: { q1: 'zmyślone' } }), /przynajmniej/)
err(await G.rpc('asb_survey_submit', { t: 'zly', a: { q1: 'src_social' } }), /Nie ma/)
const rows = ok(await S.from('asb_survey_answers').select('*'))
assert.equal(rows.length, 2)
assert.deepEqual(rows.find(r => r.answers.q2).answers, { q1: 'src_friends', q2: 'Tak', q3: ['Temat'], q4: 'Więcej czasu na pytania' })
// gość ani zaangażowany nie czytają tabel bezpośrednio
assert.ok((await G.from('asb_survey_answers').select('*')).error || !(await G.from('asb_survey_answers').select('*')).data?.length)
assert.deepEqual(ok(await Z.from('asb_survey_answers').select('*')), [])
assert.ok((await Z.from('asb_surveys').upsert({ id: 's2', title: 'x' })).error)
// zamknięta ankieta nie przyjmuje odpowiedzi
ok(await S.from('asb_surveys').update({ open: false }).eq('id', 's1'))
err(await G.rpc('asb_survey_submit', { t: token, a: { q1: 'src_social' } }), /zamknięta/)
// usunięcie ankiety kasuje odpowiedzi
ok(await S.from('asb_surveys').delete().eq('id', 's1'))
assert.equal((await db.query('select count(*)::int n from asb_survey_answers')).rows[0].n, 0)
console.log('ankiety ASB: OK')
