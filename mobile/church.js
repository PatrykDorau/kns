// Życie kościoła: typy wydarzeń, kategorie punktów programu i domyślne szablony.
// Szablony można zmieniać w aplikacji — zapisują się w <folder aplikacji>/szablony/szablony.json;
// te poniżej są tylko punktem wyjścia (gdy pliku jeszcze nie ma).
//
// Punkt programu: { key, offset, category, title, person, note } — offset to minuty od początku
// wydarzenia (może być ujemny, np. odprawa 15 minut przed). Dzięki temu po zmianie godziny
// nabożeństwa cały program przesuwa się razem z nią.

export const CATEGORIES = [
  { id: 'inne', name: 'Inne', icon: 'dot' },
  { id: 'prowadzenie', name: 'Prowadzenie', icon: 'mic' },
  { id: 'ogloszenia', name: 'Ogłoszenia', icon: 'megaphone' },
  { id: 'uwielbienie', name: 'Uwielbienie', icon: 'music' },
  { id: 'modlitwa', name: 'Modlitwa', icon: 'pray' },
  { id: 'kazanie', name: 'Kazanie', icon: 'book' },
  { id: 'swiadectwo', name: 'Świadectwo', icon: 'user' },
  { id: 'wieczerza', name: 'Wieczerza Pańska', icon: 'cup' },
  { id: 'chrzest', name: 'Chrzest', icon: 'drop' },
  { id: 'dzieci', name: 'Dzieci', icon: 'users' },
  { id: 'porzadek', name: 'Punkt obrad', icon: 'list' },
]
export const category = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0]

const item = (offset, category, title = '') => ({ offset, category, title })
export const DEFAULT_TYPES = [
  {
    id: 'nabozenstwo', name: 'Nabożeństwo', color: '#5b8cff', time: '12:12', place: 'Hotel Forza', builtin: true,
    program: [
      item(-15, 'inne', 'Odprawa'), item(0, 'prowadzenie'), item(5, 'ogloszenia'), item(10, 'uwielbienie'),
      item(40, 'modlitwa'), item(50, 'kazanie'), item(95, 'uwielbienie', 'Pieśń / kolekta'),
    ],
  },
  { id: 'studenckie', name: 'Spotkanie studenckie', color: '#3ddc97', time: '19:00', place: '', program: [] },
  {
    id: 'czlonkowskie', name: 'Spotkanie członkowskie', color: '#f5a524', time: '18:00', place: '', protocol: true,
    program: [item(0, 'modlitwa', 'Modlitwa na rozpoczęcie'), item(10, 'porzadek', 'Sprawy bieżące'), item(80, 'modlitwa', 'Modlitwa na zakończenie')],
  },
  { id: 'rada', name: 'Spotkanie rady zboru', color: '#e5484d', time: '19:00', place: '', protocol: true, program: [item(0, 'modlitwa'), item(10, 'porzadek', 'Sprawy bieżące')] },
  { id: 'inne', name: 'Inne', color: '#8f98a8', time: '18:00', place: '', program: [] },
]
export const COLORS = ['#5b8cff', '#3ddc97', '#f5a524', '#e5484d', '#b07cff', '#2fc6d6', '#ff7ab6', '#8f98a8']

// Godziny: '12:12' + 50 min → '13:02'; różnica w minutach w drugą stronę.
const minutes = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export function addMinutes(time, offset) {
  const total = ((minutes(time) + Number(offset || 0)) % 1440 + 1440) % 1440
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
}
export const offsetOf = (start, time) => minutes(time) - minutes(start)

// Szablony z pliku łączone z domyślnymi (nowe wbudowane typy pojawiają się same).
export function mergeTypes(saved) {
  const list = Array.isArray(saved) && saved.length ? saved : []
  const out = list.map(t => ({ program: [], place: '', time: '18:00', color: '#8f98a8', ...t }))
  for (const t of DEFAULT_TYPES) if (!out.some(x => x.id === t.id) && !(saved || []).some(x => x.id === t.id && x.removed)) out.push(JSON.parse(JSON.stringify(t)))
  return out.filter(t => !t.removed)
}

// Program wydarzenia z szablonu typu (nowe klucze, żeby punkty dało się przestawiać).
export const programFrom = (type, uid) => (type?.program || []).map(p => ({ key: uid(), offset: p.offset || 0, category: p.category || 'inne', title: p.title || '', person: '', note: '' }))

// Nazwa folderu wydarzenia na Dysku: „2026-10-21 Spotkanie studenckie (ab12cd34)”.
export function eventFolderName(ev) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ev.date || '') ? ev.date : 'bez-daty'
  const title = String(ev.title || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/[. ]+$/, '')
  return date + (title ? ' ' + title : '') + ' (' + ev.id + ')'
}
