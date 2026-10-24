// Test pliku kalendarza (iCal) dla Kalendarza Google: node supabase/test-kalendarz.mjs
import assert from 'node:assert/strict'
import { buildIcs } from '../netlify/functions/kalendarz.mjs'
import handler from '../netlify/functions/kalendarz.mjs'

const ics = buildIcs({
  services: [{ id: 's1', date: '2026-10-18', time: '10:00', place: 'Hotel Forza', sermonTitle: 'Kogo głosu słucham?', passage: 'J 10,19-42', speaker: 'Jan',
    program: [{ offset: -15, category: 'inne', title: 'Odprawa' }, { offset: 0, category: 'prowadzenie' }, { offset: 95, category: 'uwielbienie', title: 'Pieśń / kolekta' }], updated: 1760000000000 }],
  events: [
    { id: 'e1', type: 'studenckie', title: 'Spotkanie studenckie, studium; Jana', date: '2026-10-21', time: '23:30', place: 'Salka', description: 'Linia 1\nLinia 2', program: [] },
    { id: 'e2', type: 'inne', title: 'Dzień bez godziny', date: '2026-10-25', program: [] },
    { id: 'e4', type: 'inne', title: 'Z godziną zakończenia', date: '2026-10-26', time: '18:00', endTime: '21:30', program: [] },
    { id: 'e5', type: 'inne', title: 'Bez zakończenia', date: '2026-10-27', time: '18:00', program: [] },
    { id: 'e3', type: 'inne', title: 'Bez daty', program: [] },
  ],
  types: [{ id: 'studenckie', name: 'Spotkanie studenckie' }],
}, new Date('2026-10-17T10:00:00Z'))

const unfolded = ics.replace(/\r\n /g, '')
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'))
assert.ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'linie zawinięte do 75 bajtów')
assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, 5) // bez wydarzenia bez daty
assert.match(unfolded, /DTSTART;TZID=Europe\/Warsaw:20261026T180000\r\nDTEND;TZID=Europe\/Warsaw:20261026T213000/) // podany koniec
assert.match(unfolded, /DTSTART;TZID=Europe\/Warsaw:20261027T180000\r\nDTEND;TZID=Europe\/Warsaw:20261027T200000/) // bez końca — 2 h
assert.match(unfolded, /UID:svc-s1@kns-nabo\r\nDTSTAMP:20261017T100000Z\r\nDTSTART;TZID=Europe\/Warsaw:20261018T100000\r\nDTEND;TZID=Europe\/Warsaw:20261018T115000/)
assert.match(unfolded, /SUMMARY:Nabożeństwo: Kogo głosu słucham\?/)
assert.match(unfolded, /DESCRIPTION:Kogo głosu słucham\? · J 10\\,19-42\\n\\nMówca: Jan\\n\\n09:45 Inne — Odprawa\\n10:00 Prowadzenie\\n11:35 Uwielbienie — Pieśń \/ kolekta/)
assert.match(unfolded, /SUMMARY:Spotkanie studenckie\\, studium\\; Jana/)
assert.match(unfolded, /DTSTART;TZID=Europe\/Warsaw:20261021T233000\r\nDTEND;TZID=Europe\/Warsaw:20261022T013000/) // po północy — następny dzień
assert.match(unfolded, /DESCRIPTION:Linia 1\\nLinia 2/)
assert.match(unfolded, /DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026/)
assert.match(unfolded, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Warsaw/)

// zły klucz — bez pytania bazy
let r = await handler(new Request('https://kns-nabo.netlify.app/api/kalendarz?t=zly'))
assert.equal(r.status, 400)
// nieaktualny klucz — baza zwraca null
const realFetch = globalThis.fetch
globalThis.fetch = async (url, opt) => { assert.match(url, /rpc\/calendar_feed$/); assert.equal(JSON.parse(opt.body).token, '11111111-2222-3333-4444-555555555555'); return new Response('null', { status: 200 }) }
r = await handler(new Request('https://kns-nabo.netlify.app/api/kalendarz?t=11111111-2222-3333-4444-555555555555'))
assert.equal(r.status, 404)
globalThis.fetch = async () => new Response(JSON.stringify({ services: [], events: [{ id: 'x', type: 'inne', title: 'Próba', date: '2026-11-01', time: '18:00', program: [] }], types: [] }))
r = await handler(new Request('https://kns-nabo.netlify.app/api/kalendarz?t=11111111-2222-3333-4444-555555555555'))
assert.equal(r.headers.get('Content-Type'), 'text/calendar; charset=utf-8')
assert.match(await r.text(), /SUMMARY:Próba/)
globalThis.fetch = realFetch
console.log('kalendarz.mjs: wszystkie testy OK')
