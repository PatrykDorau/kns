// Test: wyłączone i wyciszone moduły nie wysyłają powiadomień (powiadomienia-moduly.sql). node supabase/test-powiadomienia-moduly.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser } from './fake-client.mjs'

const db = new PGlite()
const files = ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'posluchaj.sql', 'zgody.sql', 'powiadomienia-moduly.sql', 'powiadomienia-moduly.sql']
await setupDb(db, files.map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n'), ['admin@kns.pl'])
const u = await addUser(db, 'ania@kns.pl', 'ania@kns.pl')
await db.query(`update people set status = 'active', roles = '{czlonek}' where id = $1`, [u.id])
const set = v => db.query(`insert into site_settings (key, value) values ('moduly', $1) on conflict (key) do update set value = excluded.value`, [JSON.stringify(v)])
const send = async (t, url) => (await db.query(`select inbox_add(array[$1::uuid], $2, '', $3) n`, [u.id, t, url])).rows[0].n
const mod = async (url, t) => (await db.query(`select inbox_module($1, $2) m`, [url, t])).rows[0].m

assert.equal(await mod('./cele', 'Cele wsparcia — 10.2026'), 'goals')
assert.equal(await mod('./?sluzby=moja', 'Czekamy na odpowiedź: Muzyczna'), 'grafik')
assert.equal(await mod('./?sluzby=moja', 'Muzyczna: Ania nie może 12.11'), 'grafik')
assert.equal(await mod('./?sluzby=1', 'Dodano Cię do służby: Muzyczna'), 'serve')
assert.equal(await mod('./?wydarzenie=x', 'Zapis: Wyjazd'), 'cal')
assert.equal(await mod('./', 'Wiadomość'), 'msg')

assert.equal(await send('Cele wsparcia — 10.2026', './cele'), 1) // bez ustawień — wszystko idzie
await set({ off: ['goals'] })
assert.equal(await send('Cele wsparcia — 11.2026', './cele'), 0) // wyłączony moduł
assert.equal(await send('Głosowanie: X', './glosowania'), 1)
await set({ off: [], mute: ['votes'] })
assert.equal(await send('Głosowanie: Y', './glosowania'), 0) // wyciszony
assert.equal(await send('Cele wsparcia — 12.2026', './cele'), 1)
await set({ off: ['serve'] })
assert.equal(await send('Czekamy na odpowiedź: Muzyczna', './?sluzby=moja'), 0) // grafik bez służb też milczy
await set({ mute: ['grafik'] })
assert.equal(await send('Czekamy na odpowiedź: Muzyczna', './?sluzby=moja'), 0)
assert.equal(await send('Dodano Cię do służby: Muzyczna', './?sluzby=1'), 1) // służby dalej wysyłają
const titles = (await db.query(`select title from inbox where person = $1 order by id`, [u.id])).rows.map(r => r.title)
assert.deepEqual(titles, ['Cele wsparcia — 10.2026', 'Głosowanie: X', 'Cele wsparcia — 12.2026', 'Dodano Cię do służby: Muzyczna'])
console.log('powiadomienia-moduly: OK')
