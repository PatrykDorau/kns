// Statystyki z historii nabożeństw: pieśni (ile razy i kiedy) i kazania (księgi, mówcy, słowa w tytułach).
import { BOOKS, parseRef, plain } from '@/services/bible'

// Pieśń z nabożeństwa → klucz w bazie: po identyfikatorze, a gdy go nie ma — po numerze i tytule.
export function songKey(entry, songs) {
  const own = songs.find(s => s.id === entry.songId) || songs.find(s => s.title === entry.title && (s.number || '') === (entry.number || ''))
  return own ? own.id : 'x:' + (entry.number || '') + '|' + entry.title
}

// { klucz: { title, number, count, dates: [najnowsza…] } } z nabożeństw w zakresie dat.
export function songHistory(services, songs) {
  const out = new Map()
  for (const svc of services) {
    for (const e of svc.songs || []) {
      const key = songKey(e, songs)
      const own = songs.find(s => s.id === key)
      const row = out.get(key) || { key, title: own?.title || e.title, number: own?.number || e.number || '', count: 0, dates: [] }
      if (!row.dates.includes(svc.date)) { row.count++; row.dates.push(svc.date) }
      out.set(key, row)
    }
  }
  for (const row of out.values()) row.dates.sort().reverse()
  return out
}

// Słowa w tytułach kazań — bez krótkich i bardzo częstych słów.
const STOP = new Set(('a aby albo ale aż bez bo by być był była było co czy dla do gdy gdzie i ich im jak jako jest jego jej już kiedy kto która które który lub ma mnie mój my na nad nam nas nie nim o od oraz po pod przez przy się są ta tak tam te tego tej ten to tu twój ty tylko w we wszystko wy z za ze że czyli jestem jesteś będzie będą może można twoja moja nasz nasza nasze nawet także więc wtedy u oto').split(' ').map(plain))
export function keywords(titles, limit = 30) {
  const count = new Map()
  for (const t of titles) {
    const seen = new Set()
    for (const raw of String(t || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (raw.length < 4 || STOP.has(plain(raw)) || seen.has(raw)) continue
      seen.add(raw)
      count.set(raw, (count.get(raw) || 0) + 1)
    }
  }
  return [...count].map(([word, n]) => ({ word, n })).sort((a, b) => b.n - a.n || a.word.localeCompare(b.word, 'pl')).slice(0, limit)
}

// Księga Biblii z pola „Fragment” (np. „J 3,16–21” → Ewangelia Jana).
export function bookOf(passage) {
  const r = parseRef(passage)
  return r ? r.book : -1
}
export const bookName = i => BOOKS[i]?.[1] ? BOOKS[i][1].replace(/\p{L}/u, c => c.toUpperCase()) : '?'
export const bookShort = i => BOOKS[i]?.[0] || '?'
export const isNewTestament = i => i >= 39

// Zlicza wartości (np. mówców, księgi) → [{ label, n }] od największej.
export function tally(values) {
  const count = new Map()
  for (const v of values) if (v !== '' && v != null) count.set(v, (count.get(v) || 0) + 1)
  return [...count].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || String(a.label).localeCompare(String(b.label), 'pl'))
}

// „3 tyg. temu”, „2 mies. temu” — do list pieśni.
export function ago(date, today) {
  const days = Math.round((new Date(today + 'T12:00') - new Date(date + 'T12:00')) / 86400000)
  if (days <= 0) return 'dziś'
  if (days < 14) return days === 1 ? 'wczoraj' : `${days} dni temu`
  if (days < 60) return `${Math.round(days / 7)} tyg. temu`
  if (days < 730) return `${Math.round(days / 30)} mies. temu`
  return `${Math.round(days / 365)} lat temu`
}
