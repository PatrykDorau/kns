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
// Rodzaj punktu programu: z listy albo wpisany ręcznie (wtedy category 'inne' i własna nazwa w categoryName).
export const categoryName = p => p?.categoryName || category(p?.category).name
export function setCategory(p, text) {
  const v = String(text || '').trim()
  const c = CATEGORIES.find(x => x.name.toLowerCase() === v.toLowerCase())
  if (c) { p.category = c.id; delete p.categoryName } else if (v) { p.category = 'inne'; p.categoryName = v }
}

const item = (offset, category, title = '') => ({ offset, category, title })
export const DEFAULT_TYPES = [
  {
    id: 'nabozenstwo', name: 'Nabożeństwo', color: '#e8a33d', time: '12:12', place: 'Hotel Forza', builtin: true,
    program: [
      item(-15, 'inne', 'Odprawa'), item(0, 'prowadzenie'), item(5, 'ogloszenia'), item(10, 'uwielbienie'),
      item(40, 'modlitwa'), item(50, 'kazanie'), item(95, 'uwielbienie', 'Pieśń / kolekta'),
    ],
  },
  { id: 'studenckie', name: 'Spotkanie studenckie', color: '#3ec7b0', time: '19:00', place: '', program: [] },
  {
    id: 'czlonkowskie', name: 'Spotkanie członkowskie', color: '#a98bff', time: '18:00', place: '', protocol: true,
    program: [item(0, 'modlitwa', 'Modlitwa na rozpoczęcie'), item(10, 'porzadek', 'Sprawy bieżące'), item(80, 'modlitwa', 'Modlitwa na zakończenie')],
  },
  { id: 'rada', name: 'Spotkanie rady zboru', color: '#e5484d', time: '19:00', place: '', protocol: true, program: [item(0, 'modlitwa'), item(10, 'porzadek', 'Sprawy bieżące')] },
  // Inicjatywy członków — ludzie sami coś organizują i zapraszają innych z kościoła (community: w wydarzeniu widać organizatora).
  { id: 'inicjatywa', name: 'Inicjatywa członków', color: '#f07fb4', time: '18:00', place: '', community: true, program: [] },
  { id: 'domowe', name: 'Grupa domowa', color: '#6fd39a', time: '19:00', place: '', community: true, program: [] },
  { id: 'towarzyskie', name: 'Spotkanie towarzyskie', color: '#d9a066', time: '18:00', place: '', community: true, program: [] },
  { id: 'wyjazd', name: 'Wyjazd / wycieczka', color: '#5bc0eb', time: '09:00', place: '', community: true, program: [] },
  { id: 'pomoc', name: 'Pomoc / wolontariat', color: '#b3d36f', time: '10:00', place: '', community: true, program: [] },
  { id: 'inne', name: 'Inne', color: '#6ea8ff', time: '18:00', place: '', program: [] },
]
// Rodzaj „inicjatywa członków” (także rodzaje dodane z community: true w szablonach).
export const isCommunity = (types, id) => !!(types || DEFAULT_TYPES).find(t => t.id === id)?.community || DEFAULT_TYPES.some(t => t.id === id && t.community)
export const COLORS = ['#f2a53c', '#3ec7b0', '#a98bff', '#e5484d', '#6ea8ff', '#f07fb4', '#6fd39a', '#8f98a8']

// Link do pliku na Dysku Google (też Dokumenty, Arkusze, Prezentacje, folder): adres do otwarcia i podgląd w ramce.
// Plik musi być udostępniony „Każda osoba mająca link”, inaczej Google poprosi o dostęp.
export function driveInfo(url) {
  const u = String(url || '').trim()
  let m = u.match(/docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([\w-]{20,})/)
  if (m) return { id: m[2], kind: m[1], link: u, preview: 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/preview' }
  m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([\w-]{20,})/)
  if (m) return { id: m[1], kind: 'file', link: 'https://drive.google.com/file/d/' + m[1] + '/view', preview: 'https://drive.google.com/file/d/' + m[1] + '/preview' }
  m = u.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{20,})/)
  if (m) return { id: m[1], kind: 'folder', link: u, preview: '' }
  return null
}
// Grafika z linku: Dysk Google → adres samego obrazka (plik udostępniony „Każda osoba mająca link”), inny adres https — bez zmian
export function imageFromLink(url) {
  const u = String(url || '').trim(), d = driveInfo(u)
  if (d) return d.kind === 'file' ? 'https://drive.google.com/thumbnail?id=' + d.id + '&sz=w1920' : null
  return /^https:\/\/\S+$/i.test(u) ? u : null
}
// link do pliku: Dysk Google albo inny adres https
export const isFileLink = url => !!driveInfo(url) || /^https:\/\/[^\s]+\.[^\s]+/.test(String(url || '').trim())

// Film w ogłoszeniu: link do YouTube/Vimeo/Google Dysku (odtwarzacz w ramce) albo plik wgrany do bazy (zwykły odtwarzacz wideo).
export function videoInfo(url) {
  const u = String(url || '').trim()
  if (!u) return null
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)
  if (m) return { kind: 'youtube', embed: 'https://www.youtube-nocookie.com/embed/' + m[1], thumb: 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg', link: 'https://www.youtube.com/watch?v=' + m[1] }
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (m) return { kind: 'vimeo', embed: 'https://player.vimeo.com/video/' + m[1], thumb: '', link: 'https://vimeo.com/' + m[1] }
  const d = driveInfo(u)
  if (d && d.kind === 'file') return { kind: 'drive', embed: d.preview, thumb: '', link: d.link }
  if (/^https:\/\/.*(\/ogloszenia\/|\.(mp4|webm|mov)(\?|$))/i.test(u)) return { kind: 'file', src: u, link: u }
  return null
}

// „Posłuchaj”: link YouTube (film, playlista albo identyfikator kanału UC… — wtedy najnowsze filmy kanału)
// i Spotify (podcast, odcinek, playlista) → adres odtwarzacza w ramce.
export function youtubeEmbed(url) {
  const u = String(url || '').trim()
  if (!u) return null
  let m = u.match(/[?&]list=([\w-]+)/)
  if (m) return 'https://www.youtube-nocookie.com/embed/videoseries?list=' + m[1]
  m = u.match(/(?:^|channel\/)(UC[\w-]{22})(?:$|[/?])/)
  if (m) return 'https://www.youtube-nocookie.com/embed/videoseries?list=UU' + m[1].slice(2)
  const v = videoInfo(u)
  return v?.kind === 'youtube' ? v.embed : null
}
export function spotifyEmbed(url) {
  const m = String(url || '').match(/open\.spotify\.com\/(?:intl-\w+\/)?(show|episode|playlist|album|artist)\/(\w+)/)
  return m ? 'https://open.spotify.com/embed/' + m[1] + '/' + m[2] + '?utm_source=generator&theme=0' : null
}

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
