// Kalendarz kościoła do subskrypcji w Kalendarzu Google / iPhonie / Outlooku (format iCal):
//   https://kns-nabo.netlify.app/api/kalendarz?t=<tajny klucz osoby>
// Klucz każda zatwierdzona osoba ma w aplikacji (Więcej → Kalendarz Google). Dane bierze z bazy przez
// funkcję calendar_feed (supabase/kalendarz.sql) — tylko to, co ta osoba widzi w aplikacji.
export const config = { path: '/api/kalendarz' }

const SUPABASE = { url: 'https://igkjlgdpvgdeqfqctnnf.supabase.co', key: 'sb_publishable_Ji4v_zRY2OGsMRAWwiis-g_x6WAYCPI' }
const DEFAULT_TIME = '12:12', DEFAULT_PLACE = 'Hotel Forza'
const CATEGORY = { inne: 'Inne', prowadzenie: 'Prowadzenie', ogloszenia: 'Ogłoszenia', uwielbienie: 'Uwielbienie', modlitwa: 'Modlitwa', kazanie: 'Kazanie',
  swiadectwo: 'Świadectwo', wieczerza: 'Wieczerza Pańska', chrzest: 'Chrzest', dzieci: 'Dzieci', porzadek: 'Punkt obrad' }

export default async req => {
  const token = new URL(req.url).searchParams.get('t') || ''
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response('Brak klucza kalendarza.', { status: 400 })
  const res = await fetch(SUPABASE.url + '/rest/v1/rpc/calendar_feed', {
    method: 'POST', headers: { apikey: SUPABASE.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  })
  const feed = res.ok ? await res.json() : null
  if (!feed) return new Response('Ten adres kalendarza jest nieaktualny — weź nowy w aplikacji (Więcej → Kalendarz Google).', { status: 404 })
  return new Response(buildIcs(feed), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Content-Disposition': 'inline; filename="kosciol-na-skale.ics"' },
  })
}

// Tekst w iCal: znaki specjalne i zawijanie długich linii (75 bajtów).
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function fold(line) {
  const out = []
  let cur = '', bytes = 0
  for (const ch of line) {
    const n = Buffer.byteLength(ch)
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0 }
    cur += ch; bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}
const minutes = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const hhmm = total => String(Math.floor(total / 60) % 24).padStart(2, '0') + String(total % 60).padStart(2, '0')
const ymd = d => d.replace(/-/g, '')
function addDays(date, n) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
// Czas trwania: podana godzina zakończenia (po północy — następny dzień); inaczej koniec programu + 15 min,
// a bez programu — nabożeństwo 1 h 45 min, wydarzenie 2 h.
function span(item, start, fallback) {
  const s = minutes(start)
  if (/^\d\d:\d\d$/.test(item.endTime || '')) { const e = minutes(item.endTime); return { s, e: e > s ? e : e + 1440 } }
  const last = Math.max(0, ...(item.program || []).map(p => Number(p.offset) || 0))
  return { s, e: s + Math.max(fallback, last ? last + 15 : 0) }
}
function programText(item, start) {
  return [...(item.program || [])].sort((a, b) => a.offset - b.offset)
    .map(p => hhmm(minutes(start) + Number(p.offset || 0) + 1440).replace(/(\d\d)(\d\d)/, '$1:$2') + ' ' + (p.categoryName || CATEGORY[p.category] || 'Inne') + (p.title ? ' — ' + p.title : '') + (p.person ? ' (' + p.person + ')' : ''))
    .join('\n')
}

export function buildIcs(feed, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const typeName = id => (feed.types || []).find(t => t.id === id)?.name || ''
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kosciol Na Skale//KNS Nabo//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Kościół Na Skale', 'X-WR-TIMEZONE:Europe/Warsaw', 'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Warsaw',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE']
  const event = (uid, item, title, start, place, description, fallback) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) return
    lines.push('BEGIN:VEVENT', 'UID:' + uid + '@kns-nabo', 'DTSTAMP:' + stamp)
    if (start) {
      const { s, e } = span(item, start, fallback)
      lines.push(`DTSTART;TZID=Europe/Warsaw:${ymd(item.date)}T${hhmm(s)}00`, `DTEND;TZID=Europe/Warsaw:${ymd(addDays(item.date, Math.floor(e / 1440)))}T${hhmm(e)}00`)
    } else lines.push(`DTSTART;VALUE=DATE:${ymd(item.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(item.date, 1))}`)
    lines.push('SUMMARY:' + esc(title))
    if (place) lines.push('LOCATION:' + esc(place))
    if (description) lines.push('DESCRIPTION:' + esc(description))
    if (item.updated) lines.push('LAST-MODIFIED:' + new Date(item.updated).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'))
    lines.push('END:VEVENT')
  }
  for (const s of feed.services || []) {
    const start = s.time || DEFAULT_TIME
    const about = [[s.sermonTitle, s.passage].filter(Boolean).join(' · '), s.speaker && 'Mówca: ' + s.speaker, programText(s, start)].filter(Boolean).join('\n\n')
    event('svc-' + s.id, s, 'Nabożeństwo' + (s.sermonTitle ? ': ' + s.sermonTitle : ''), start, s.place || DEFAULT_PLACE, about, 105)
  }
  for (const e of feed.events || []) {
    const about = [e.description, programText(e, e.time || '00:00')].filter(Boolean).join('\n\n')
    event('ev-' + e.id, e, e.title || typeName(e.type) || 'Wydarzenie', e.time || '', e.place || '', about, 120)
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
