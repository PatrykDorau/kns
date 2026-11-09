// Test: statystyki ASB (asb-statystyki.sql). node supabase/test-asb-statystyki.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'asb.sql', 'asb-statystyki.sql', 'asb-statystyki.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const user = async (email, name, roles) => {
  const u = await addUser(db, email, name)
  await db.query(`update people set status = 'active', name = $2, roles = $3 where email = $1`, [email, name, roles])
  return createFakeClient(db, u)
}
const S = await user('asb@kns.pl', 'Stud', ['czlonek', 'asb'])
const M = await user('marek@kns.pl', 'Marek', ['czlonek'])
const G = createFakeClient(db, null)
const ok = r => { assert.equal(r.error, null, r.error?.message); return r.data }

ok(await S.from('asb_stat_events').upsert({ id: 'P-1', date: '2026-11-03', name: 'Okultyzm', attendance: 40, quality: 'szacunek', cost_food: 100, cost_posters: 50 }))
ok(await S.from('asb_ads').upsert({ id: 'ADS-1', event_id: 'P-1', date: '2026-10-08', name: 'Promocja', spent: 124.28, impressions: 14324, link_clicks: 138, results: 47 }))
ok(await S.from('asb_stat_cities').upsert({ id: 'Poznań', regular_goal: 50, actions: [{ title: 'Zaproszenia', text: 'Osobiście' }] }))
const ev = ok(await S.from('asb_stat_events').select('*'))[0]
assert.equal(ev.cost_room, null) // nieznany koszt zostaje pusty, nie 0
assert.equal(Number(ok(await S.from('asb_ads').select('spent'))[0].spent), 124.28)
// zła jakość danych odrzucona
assert.ok((await S.from('asb_stat_events').upsert({ id: 'P-2', quality: 'może' })).error)
// zwykły członek i gość nic nie widzą ani nie zapiszą
assert.deepEqual(ok(await M.from('asb_stat_events').select('*')), [])
assert.ok((await M.from('asb_ads').upsert({ id: 'X', name: 'x' })).error)
assert.ok((await G.from('asb_stat_events').select('*')).error || !(await G.from('asb_stat_events').select('*')).data?.length)
// usunięcie wydarzenia odpina reklamę, nie kasuje jej
ok(await S.from('asb_stat_events').delete().eq('id', 'P-1'))
assert.equal(ok(await S.from('asb_ads').select('event_id'))[0].event_id, null)
console.log('statystyki ASB: OK')

// token Meta: zapis przez ASB, nieczytelny z aplikacji, w ustawieniach tylko końcówka
const TOK = 'EAAB' + 'x'.repeat(60) + 'WXYZ'
assert.match((await S.rpc('asb_fb_token_set', { c: 'Poznań', t: 'krótki' })).error?.message || '', /token/)
assert.equal(ok(await S.rpc('asb_fb_token_set', { c: 'Poznań', t: TOK })), '…WXYZ')
assert.ok((await M.rpc('asb_fb_token_set', { c: 'Poznań', t: TOK })).error)
const sec = await S.from('asb_fb_secrets').select('*')
assert.ok(sec.error || !sec.data?.length, 'tokenu nie da się odczytać')
const cityRow = ok(await S.from('asb_stat_cities').select('*')).find(c => c.id === 'Poznań')
assert.equal(cityRow.fb_token_hint, '…WXYZ'); assert.ok(!JSON.stringify(cityRow).includes(TOK))
assert.equal((await db.query(`select token from asb_fb_secrets where city = 'Poznań'`)).rows[0].token, TOK)
ok(await S.rpc('asb_fb_token_set', { c: 'Poznań', t: '' }))
assert.equal((await db.query(`select count(*)::int n from asb_fb_secrets`)).rows[0].n, 0)
console.log('token Meta: OK')
