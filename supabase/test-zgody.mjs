// Test: zgody na e-maile według rodzaju powiadomienia (zgody.sql) — rodzaj z adresu, zapis zgód, kolejka e-maili.
// node supabase/test-zgody.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'zatwierdzanie.sql', 'sluzby.sql', 'skrzynka.sql', 'zgody.sql', 'zgody.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return [u, createFakeClient(db, u)]
}
const [a, A] = await user('ania@kns.pl', 'Ania', ['czlonek'])
const [b] = await user('bartek@kns.pl', 'Bartek', ['czlonek'])
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }

// rodzaj z adresu
const kinds = { './?sluzby=1': 'sluzby', './?wydarzenie=e1': 'wydarzenia', './glosowania': 'glosowania', './?asb=x': 'asb', './cele': 'cele', './?ogloszenie=a': 'ogloszenia', './': 'wiadomosci', '': 'wiadomosci' }
for (const [u, k] of Object.entries(kinds)) assert.equal((await db.query('select inbox_kind($1) k', [u])).rows[0].k, k, u)

// zgody: tylko znane rodzaje, tylko tak/nie
const p = ok(await A.rpc('set_mail_prefs', { prefs: { wydarzenia: true, glosowania: false, zle: true, sluzby: 'nie' } }))
assert.deepEqual(p.mail_prefs, { wydarzenia: true, glosowania: false })

// powiadomienia: rodzaj ustawia się sam; kolejka bierze tylko te, na które jest zgoda
await db.query(`insert into inbox (person, title, url) values ($1, 'Zaproszenie', './?wydarzenie=e1'), ($1, 'Głosowanie', './glosowania'), ($2, 'Zaproszenie', './?wydarzenie=e1')`, [a.id, b.id])
const rows = (await db.query(`select kind from inbox where person = $1 order by id`, [a.id])).rows.map(r => r.kind)
assert.deepEqual(rows, ['wydarzenia', 'glosowania'])
const q = (await db.query('select * from mail_queue()')).rows
assert.equal(q.length, 1); assert.equal(q[0].email, 'ania@kns.pl'); assert.equal(q[0].title, 'Zaproszenie')
assert.equal((await db.query('select * from mail_queue()')).rows.length, 0) // drugi raz nic
// zwykły użytkownik nie może czytać kolejki
assert.match((await A.rpc('mail_queue')).error?.message || '', /permission|uprawnie/i)
console.log('zgody: wszystkie testy OK')
