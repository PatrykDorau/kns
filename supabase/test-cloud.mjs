// Test src/cloud.js (aplikacja na komputer ↔ baza) na prawdziwym schemacie w PGlite, razem z telefonem (mobile/supa.js):
//   npm i --no-save @electric-sql/pglite@0.2.17 && node supabase/test-cloud.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { setupDb, addUser, createFakeClient } from './fake-client.mjs'
import { createCloud } from '../src/cloud.js'
import { createSupa } from '../mobile/supa.js'

const db = new PGlite()
await setupDb(db, ['schema.sql', 'kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'zapisy.sql', 'posluchaj.sql', 'asb.sql', 'wiadomosci.sql', 'materialy.sql', 'przeczytane.sql'].map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join(String.fromCharCode(10)), ['admin@kns.pl'])
const admin = await addUser(db, 'admin@kns.pl')
const tech = await addUser(db, 'tech@kns.pl')
const member = await addUser(db, 'czlonek@kns.pl')
const inDays = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

// Podstawione IPC aplikacji (logowanie Google i załączniki na Dysku).
const ipc = email => ({
  cloudIdToken: async () => ({ idToken: email }),
  cloudMapFiles: async list => ({ services: list.map(s => ({ id: s.id, files: s.files.map(f => ({ ...f, path: 'C:/cache/' + s.id + '/' + f.path.slice(6) })) })) }),
  cloudStoreFiles: async svc => ({ files: svc.files.map(f => ({ key: f.key, path: 'C:/cache/' + svc.id + '/' + f.name })), kept: svc.files.map(f => ({ ...f, path: 'pliki/' + f.name })) }),
})
const desktop = email => createCloud(ipc(email), createFakeClient(db, null)) // bez sesji — loguje się tokenem z „Google”

// osoba czekająca: logowanie działa, ale danych nie ma
const T = desktop('tech@kns.pl')
let r = await T.sharedRead()
assert.match(r.error, /czeka na zatwierdzenie/)
const A = desktop('admin@kns.pl')
r = await A.connect()
assert.equal(r.email, 'admin@kns.pl')
const phone = createSupa({ noFiles: true }, createFakeClient(db, admin))
await phone.ready
await phone.api.call('setPerson', { email: 'tech@kns.pl', status: 'active', roles: ['czlonek', 'technika'] })
await phone.api.call('setPerson', { email: 'czlonek@kns.pl', status: 'active' })

// pieśni: komputer wysyła swoją bazę (np. z OpenSong), potem tylko zmiany
r = await T.sharedSongsRead('baza', 0)
assert.deepEqual([r.songs.length, r.mtime], [0, 0])
const mine = Array.from({ length: 1205 }, (_, i) => ({ id: 'os' + i, number: String(i + 1), title: 'Pieśń ' + i, text: 'zwrotka', updated: 1000 + i }))
r = await T.sharedSongsWrite('baza', { songs: mine, deleted: {} })
assert.equal(r.mtime, 1000 + 1204)
assert.equal((await db.query('select count(*)::int n from songs')).rows[0].n, 1205)
r = await T.sharedSongsRead('baza', r.mtime)
assert.equal(r.unchanged, true)
// telefon zmienia pieśń → komputer ją dostaje
await phone.saveSongs({ song: { id: 'os5', number: '6', title: 'Pieśń 5', text: 'nowy tekst z telefonu' } }, 1005)
r = await T.sharedSongsRead('baza', 1000 + 1204)
assert.equal(r.songs.length, 1205)
assert.equal(r.songs.find(s => s.id === 'os5').text, 'nowy tekst z telefonu')
// komputer usuwa pieśń i zmienia inną — telefon to widzi
const now = Date.now()
r = await T.sharedSongsWrite('baza', { songs: [{ ...mine[7], text: 'z komputera', updated: now }], deleted: { os9: now } })
const phoneSongs = (await phone.load()).songs
assert.equal(phoneSongs.length, 1204)
assert.equal(phoneSongs.find(s => s.id === 'os7').text, 'z komputera')
r = await T.sharedSongsRead('baza', 0)
assert.equal(r.deleted.os9, now)
// starsza wersja z komputera nie nadpisze nowszej z bazy
await T.sharedSongsWrite('baza', { songs: [{ ...mine[5], text: 'stary', updated: 1 }], deleted: {} })
assert.equal((await db.query(`select text from songs where id = 'os5'`)).rows[0].text, 'nowy tekst z telefonu')

// nabożeństwo z komputera (z załącznikiem) → telefon; z telefonu → komputer (z tekstami pieśni)
const svc = { id: 'k1', date: inDays(2), time: '10:00', sermonTitle: 'Z komputera', songs: [{ key: 'a', songId: 'os7', title: 'Pieśń 7', number: '8' }], files: [{ key: 'f', name: 'slajdy.pptx', path: 'C:/Users/x/slajdy.pptx', type: 'pptx' }], updated: now, updatedBy: 'tech' }
r = await T.sharedWrite('baza', { service: svc, songs: [] })
assert.deepEqual(r.files, [{ key: 'f', path: 'C:/cache/k1/slajdy.pptx' }])
const onPhone = (await phone.load()).services.find(s => s.id === 'k1')
assert.equal(onPhone.files[0].path, 'pliki/slajdy.pptx')
await phone.save({ service: { ...onPhone, sermonTitle: 'Poprawione na telefonie', updated: now + 5 }, songs: [] }, now)
r = await T.sharedRead()
const got = r.list.find(p => p.service.id === 'k1')
assert.equal(got.service.sermonTitle, 'Poprawione na telefonie')
assert.equal(got.service.files[0].path, 'C:/cache/k1/slajdy.pptx')
assert.deepEqual(got.songs.map(s => s.text), ['z komputera'])
assert.equal(T.account().email, 'tech@kns.pl')

// kalendarz, szablony, ogłoszenia z telefonu są też na komputerze
await phone.saveEvent({ id: 'e1', type: 'studenckie', title: 'Studenci', date: inDays(3), program: [], updated: 1 })
await phone.saveAnnouncement({ id: 'a1', title: 'Piknik', text: 'x', audience: 'public', updated: 1 })
r = await T.sharedRead()
assert.deepEqual([r.events.length, r.announcements.length], [1, 1])

// członek bez prawa edycji: czyta, ale nie zapisze
const M = desktop('czlonek@kns.pl')
r = await M.sharedRead()
assert.equal(r.list.length, 1)
r = await M.sharedWrite('baza', { service: { ...svc, files: [], updated: now + 99 }, songs: [] })
assert.match(r.error, /uprawnień/)
r = await M.sharedRemove('baza', 'k1')
assert.equal((await db.query(`select count(*)::int n from services`)).rows[0].n, 1) // RLS: usunięcie bez skutku
// komputer usuwa nabożeństwo
await T.sharedRemove('baza', 'k1')
assert.equal((await phone.load()).services.length, 0)
// kalendarz z komputera: technika zapisuje wydarzenie, telefon je widzi; członek nie zapisze; konflikt wersji
r = await T.saveEvent({ id: 'e9', type: 'inne', title: 'Próba zespołu', date: inDays(4), time: '18:00', program: [], updated: 100 }, 0)
assert.equal(r.ok, true)
assert.ok((await phone.load()).events.some(e => e.title === 'Próba zespołu'))
r = await T.saveEvent({ id: 'e9', type: 'inne', title: 'Stara wersja', date: inDays(4), updated: 101 }, 50)
assert.match(r.error, /w międzyczasie/)
r = await M.saveEvent({ id: 'e10', type: 'inne', title: 'x', date: inDays(4), updated: 1 }, 0)
assert.equal((await db.query(`select status from events where id = 'e10'`)).rows[0].status, 'pending') // zgłoszenie
r = await (await M.access())
assert.deepEqual([r.status, r.edit], ['active', false])
r = await T.access()
assert.deepEqual([r.edit, r.roles.includes('technika')], [true, true])
await T.removeEvent('e9')
assert.ok(!(await phone.load()).events.some(e => e.id === 'e9'))
// bez dostępu do folderu na Dysku: nabożeństwo się zapisuje, stary załącznik zostaje, nowy — tylko lokalnie
const noDrive = createCloud({ ...ipc('tech@kns.pl'), cloudStoreFiles: async () => ({ error: 'Konto nie ma dostępu do folderu' }) }, createFakeClient(db, null))
r = await noDrive.sharedWrite('baza', { service: { id: 'k2', date: inDays(9), files: [
  { key: 'a', name: 'stary.pdf', path: String.raw`C:\Users\x\AppData\Roaming\rzutnik\dysk-google\k2\stary.pdf` },
  { key: 'b', name: 'nowy.pptx', path: String.raw`C:\Users\x\Desktop\nowy.pptx` }], songs: [], updated: 5 }, songs: [] })
assert.match(r.warning, /\(1\) zostały tylko na tym komputerze/)
assert.deepEqual((await phone.load()).services.find(s => s.id === 'k2').files.map(f => f.path), ['pliki/stary.pdf'])
console.log('cloud.js: wszystkie testy OK')
