import { mergeTypes } from '../mobile/church.js'
import { BAZA, createCloud } from './cloud.js'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { parseBibleXml, parseRef, passage, refLabel, toSlides } from './bible.js'
export { parseBibleXml } // do testów

// Wspólny stan panelu sterowania: biblioteka, pieśni, to co jest na żywo.
export const api = window.api
// Pętla ma w danych typ „scene” — tak zapisują ją istniejące biblioteki.
export const KIND = { image: 'Zdjęcie', video: 'Film', text: 'Tekst', scene: 'Pętla', song: 'Pieśń' }
export const TEXT_STYLE = { fs: 12, color: '#ffffff', bg: '#000000', bgImage: null, dim: 0.45, align: 'center', valign: 'center', shadow: false }
const SONG_LIMIT = 300

export const items = ref([])
export const songs = ref([])
export const settings = reactive({
  fadeMs: 350, // 0 = bez przejścia
  copyFiles: true,
  remote: false,
  remoteToken: '',
  songSort: 'number', // 'number' | 'title'
  service: [], // pieśni na najbliższe nabożeństwo: [{ key, songId }]
  activeService: null, // id nabożeństwa wczytanego do wyświetlania
  sharedDir: '', // folder wspólny z nabożeństwami i bazą pieśni (ten sam na wszystkich komputerach)
  cue: false, // sygnały dla kamerzysty (stream)
  cueToken: '',
  camLayout: 'grid', // układ kamer w stream: 'grid' | 'big' | 'row' | 'column' | 'one'
  camLabels: true, // podpisy na obrazach kamer
  camOnTop: false, // okno stream zawsze na wierzchu
  camCueBar: true, // w trybie nakładki: pasek sygnałów dla kamerzysty pod kamerami
  deletedSongs: {}, // id → czas usunięcia; żeby pieśń usunięta tutaj zniknęła też na innych komputerach
  songStyle: { ...TEXT_STYLE, fs: 14, shadow: true, valign: 'top' }, // pieśni domyślnie od góry ekranu
})
// Aktualizacja aplikacji: { current, version?, ready?, url? } — z procesu głównego.
export const appUpdate = ref({ current: '' })
export const role = ref(null) // wybrana służba: 'display' | 'stream' | 'planner'
export const services = ref([]) // zaplanowane nabożeństwa
// Baza danych (Supabase) — „folder wspólny” o nazwie BAZA; inne foldery (dysk, Dysk Google) idą przez IPC.
const cloud = typeof window !== 'undefined' && window.api ? createCloud(window.api) : null
const shared = dir => (dir === BAZA ? cloud : api)
export { BAZA }
// Życie kościoła z Dysku Google (zapisywane na telefonie): rodzaje wydarzeń z szablonami i wydarzenia.
export const churchTypes = ref(mergeTypes(null))
export const churchEvents = ref([])
export const churchAnnouncements = ref([])
// Przejścia między widokami: Kalendarz/Start otwierają nabożeństwo w Organizacji i odwrotnie.
export const plannerRequest = ref(null) // { id } — otwórz nabożeństwo; { date } — nowe na ten dzień
export const calendarRequest = ref(null) // { kind, id, date } — pokaż w kalendarzu
export async function saveChurchEvent(ev, base = 0) {
  if (!cloud) return { error: 'Brak połączenia z bazą danych.' }
  const res = await cloud.saveEvent(ev, base)
  if (res.error) return res
  const i = churchEvents.value.findIndex(x => x.id === ev.id)
  if (i >= 0) churchEvents.value[i] = ev
  else churchEvents.value.push(ev)
  return res
}
export async function removeChurchEvent(id) {
  if (!cloud) return { error: 'Brak połączenia z bazą danych.' }
  const res = await cloud.removeEvent(id)
  if (!res.error) churchEvents.value = churchEvents.value.filter(x => x.id !== id)
  return res
}
export const serviceModal = ref(false) // okno „Wczytaj nabożeństwo”
export const plannerTarget = ref(null) // nabożeństwo edytowane w organizacji — tam trafia pieśń dodana z bazy
export const tab = ref('materials')
export const search = reactive({ materials: '', songs: '', service: '' })
export const selectedId = ref(null)
export const liveId = ref(null)
export const liveNonce = ref(0)
export const songIndex = ref(0) // zwrotka pieśni na rzutniku
export const previewIndex = ref(0) // zwrotka w podglądzie, gdy pieśń nie jest na żywo
export const displays = ref([])
export const displayId = ref(null)
export const output = ref({ open: false, fullscreen: false, waiting: false })
export const video = ref({ time: 0, duration: 0, paused: true, step: 0 })
export const volume = ref(0.25)
export const notice = ref('')
export const busy = ref('')
export const remoteUrl = ref('')
export const renamingId = ref(null)
export const renameValue = ref('')
export const confirmId = ref(null)
export const managerOpen = ref(false) // duży widok bazy pieśni
export const hidden = ref(false) // obraz na rzutniku schowany (H), ale nadal „na żywo”
export const frozen = ref(false) // rzutnik stoi na ostatnim obrazie (F); zmiany czekają na odmrożenie
export const frozenAt = ref(null) // { id, index } — na czym stanął rzutnik w chwili zamrożenia
export const previewVideo = ref(null) // { time, duration, paused } filmu w podglądzie
const liveStart = ref(0) // od której sekundy ma ruszyć film na rzutniku
const liveStep = ref(0) // od którego slajdu ma ruszyć pętla / prezentacja na rzutniku
export const textPopup = ref(null) // element, którego tekst jest edytowany w dużym oknie
const liveFrozen = ref(null) // tekst na żywo: stan wysłany na rzutnik, niezależny od dalszej edycji
const loaded = ref(false)

export const uid = () => Math.random().toString(36).slice(2, 10)
const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
export const itemById = id => items.value.find(i => i.id === id)
const find = id => (id == null ? null : itemById(id) || songs.value.find(s => s.id === id) || null)
export const selected = computed(() => find(selectedId.value))
export const liveItem = computed(() => find(liveId.value))

// Pusta linia w tekście pieśni rozdziela zwrotki (slajdy). Slajd może zaczynać się skrótem
// w nawiasie kwadratowym, np. „[2]” albo „[R]” — ten klawisz przenosi wtedy prosto do niego.
const SHORTCUT = /^\[([^\]\s]{1,3})\][ \t]*/
const parsedSongs = new WeakMap()
function parseSong(song) {
  let cached = parsedSongs.get(song)
  if (!cached || cached.text !== song.text) {
    const list = song.text.split(/\n[ \t]*\n/).map(v => v.trim()).filter(Boolean).map(v => {
      const m = SHORTCUT.exec(v)
      return { key: m ? m[1] : '', text: m ? v.slice(m[0].length).trim() : v }
    }).filter(v => v.text)
    parsedSongs.set(song, cached = { text: song.text, list })
  }
  return cached.list
}
export const verses = song => parseSong(song).map(v => v.text)
// Początek tekstu — pomaga upewnić się, że to ta pieśń, a nie inna o podobnym tytule.
export const firstLine = song => (parseSong(song)[0]?.text.split('\n').slice(0, 2).join(' / ') || '')
// To, co widać przy slajdzie na liście: jego skrót albo kolejny numer.
export const verseKey = (song, i) => parseSong(song)[i]?.key || String(i + 1)

export const label = it => {
  if (!it) return 'Usunięty element'
  if (it.type === 'song') return (it.number ? it.number + '. ' : '') + (it.title.trim() || 'Bez tytułu')
  if (it.name?.trim()) return it.name.trim()
  if (it.type === 'text') return it.text.trim().split('\n')[0] || 'Pusty tekst'
  return KIND[it.type]
}
export const kindLabel = it => (it.missing ? 'Nie znaleziono pliku' : it.type === 'scene' ? `Pętla · slajdów: ${it.entries.length}` : KIND[it.type])

/* ---------- co widać ---------- */
// Zamienia element biblioteki na to, co rysuje Stage. Pętla i pieśń dostają gotowe slajdy,
// żeby okno rzutnika nie musiało znać biblioteki.
export function view(it, index = 0) {
  if (!it) return null
  if (it.type === 'scene') {
    const slides = it.entries.map(e => {
      const s = itemById(e.ref)
      return s && !s.missing ? { ...s, seconds: e.seconds || it.seconds } : null
    }).filter(Boolean)
    return { id: it.id, type: 'scene', fadeMs: it.transition === 'none' ? 0 : it.fadeMs, auto: it.auto !== false, slides }
  }
  if (it.type === 'song') {
    const all = verses(it)
    const i = clamp(index, 0, Math.max(0, all.length - 1))
    return { ...settings.songStyle, id: it.id, type: 'text', text: all[i] || '', slideKey: i, fadeMs: settings.fadeMs }
  }
  if (it.type === 'text' && it.text?.includes(COUNTDOWN)) {
    return { ...it, fadeMs: settings.fadeMs, target: it.countMode === 'minutes' ? it.target || 0 : nextServiceStart.value || 0 }
  }
  return { ...it, fadeMs: settings.fadeMs }
}

export const selectedIndex = computed(() => (selected.value?.id === liveId.value ? songIndex.value : previewIndex.value))
export const selectedView = computed(() => view(selected.value, selectedIndex.value))
export const liveView = computed(() => {
  const it = liveItem.value
  if (it?.type === 'text' && liveFrozen.value) return JSON.parse(liveFrozen.value)
  return view(it, songIndex.value)
})
// Edytowany tekst trafia na rzutnik dopiero po zatwierdzeniu — literówek nie widzi cała sala.
export const textDirty = computed(() => liveItem.value?.type === 'text' && JSON.stringify(view(liveItem.value)) !== liveFrozen.value)
export function sendText() { liveFrozen.value = JSON.stringify(view(liveItem.value)) }

// To, co faktycznie widać teraz na rzutniku (dla pętli — jej bieżący slajd).
export const liveSlide = computed(() => {
  const v = liveView.value
  if (v?.type !== 'scene') return v
  return v.slides.length ? v.slides[(video.value.step || 0) % v.slides.length] : null
})
export const liveIsVideo = computed(() => liveSlide.value?.type === 'video')
/* Pętla w podglądzie stoi na wybranym slajdzie, dopóki nie włączy się jej odtwarzania.
   Pętla na rzutniku prowadzi podgląd sama. */
export const loopStep = ref(0)
export const loopPlaying = ref(false)
const slideCount = it => view(it).slides.length
export const selectedStep = computed(() => {
  const it = selected.value
  if (it?.type !== 'scene') return 0
  return (it.id === liveId.value ? video.value.step || 0 : loopStep.value) % (slideCount(it) || 1)
})
export const followStep = computed(() => {
  const it = selected.value
  if (it?.type !== 'scene') return null
  if (it.id === liveId.value) return video.value.step || 0
  return loopPlaying.value ? null : loopStep.value
})
// Numer slajdu, któremu odpowiada pozycja na liście pętli (-1, gdy plik zaginął).
export function entrySlide(loop, i) {
  let n = -1
  for (let k = 0; k <= i; k++) {
    const s = itemById(loop.entries[k].ref)
    if (s && !s.missing) n++
    else if (k === i) return -1
  }
  return n
}
// Ręczne sterowanie: wybrana pętla na rzutniku przeskakuje od razu, inaczej zmienia się podgląd.
export function setLoopStep(i) {
  if (selected.value.id === liveId.value) api.videoCmd({ type: 'step', value: i })
  else { loopPlaying.value = false; loopStep.value = i }
}
export function stepLoop(d) {
  const n = slideCount(selected.value)
  if (n) setLoopStep((selectedStep.value + d + n) % n)
}
export const mirroring = computed(() => !!selected.value && selected.value.id === liveId.value && liveIsVideo.value)
export const canGo = computed(() => {
  const it = selected.value
  if (!it || it.missing) return false
  if (it.type === 'scene') return view(it).slides.length > 0
  if (it.type === 'song') return verses(it).length > 0
  return true
})

/* ---------- listy ---------- */
const plain = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')
const songText = new WeakMap() // pieśń → tekst do wyszukiwania (liczony raz na zmianę)
function searchable(song) {
  const key = song.number + '\n' + song.title + '\n' + song.text
  let cached = songText.get(song)
  if (!cached || cached.key !== key) songText.set(song, cached = { key, title: plain(song.title), text: plain(song.text) })
  return cached
}

export const visibleItems = computed(() => {
  const q = plain(search.materials.trim())
  return items.value.filter(it => !it.hidden && (!q || plain(label(it)).includes(q)))
})
const byTitle = (a, b) => a.title.localeCompare(b.title, 'pl')
const byNumber = (a, b) => (a.number ? +a.number || 1e9 : 1e9) - (b.number ? +b.number || 1e9 : 1e9)
export const sortSongs = list => [...list].sort(settings.songSort === 'title' ? byTitle : (a, b) => byNumber(a, b) || byTitle(a, b))
const sortedSongs = computed(() => sortSongs(songs.value))
// list: posortowana lista do przeszukania (domyślnie cała baza; okno bazy pieśni podaje swoją wersję roboczą).
export function matchSongs(query, list = sortedSongs.value) {
  const q = plain(query.trim())
  if (!q) return list
  // Trafienia w numerze i tytule idą przed trafieniami w samym tekście.
  const first = [], rest = []
  for (const s of list) {
    const c = searchable(s)
    if (s.number === q || c.title.includes(q)) first.push(s)
    else if (c.text.includes(q)) rest.push(s)
  }
  return [...first, ...rest]
}
const matchingSongs = computed(() => matchSongs(search.songs))
export const findSongs = (query, limit = 8) => (query.trim() ? matchSongs(query).slice(0, limit) : [])
// Podpowiedzi przy dodawaniu pieśni do nabożeństwa.
export const serviceResults = computed(() => (search.service.trim() ? matchSongs(search.service).slice(0, 8) : []))
export const serviceList = computed(() => settings.service
  .map(e => ({ key: e.key, song: songs.value.find(s => s.id === e.songId) }))
  .filter(e => e.song))
export const songMatches = computed(() => matchingSongs.value.length)
export const visibleSongs = computed(() => matchingSongs.value.slice(0, SONG_LIMIT))

/* ---------- rzutnik ---------- */
export function setDisplays(list) {
  displays.value = list
  if (!list.some(d => d.id === displayId.value)) displayId.value = (list.find(d => !d.current) || list[0])?.id ?? null
}
export const openOutput = () => api.openOutput(displayId.value)
export const toggleOutput = () => (output.value.open || output.value.waiting ? api.closeOutput() : openOutput())

export async function goLive() {
  if (!canGo.value) return
  frozen.value = false
  notice.value = ''
  if (!output.value.open && !output.value.waiting) await openOutput()
  const it = selected.value
  // Filmy w pętli startują same, więc zaczynają na cichej głośności ustawionej w pętli.
  if (it.type === 'scene') volume.value = it.volume
  if (it.type === 'song') songIndex.value = previewIndex.value
  liveFrozen.value = it.type === 'text' ? JSON.stringify(view(it)) : null
  // Film rusza na rzutniku od miejsca, do którego został przewinięty w podglądzie.
  liveStart.value = it.type === 'video' && previewVideo.value ? previewVideo.value.time : 0
  // Pętla i prezentacja zaczynają od slajdu, który jest właśnie w podglądzie.
  liveStep.value = it.type === 'scene' ? selectedStep.value : 0
  hidden.value = false
  liveNonce.value++
  liveId.value = it.id
}

// Zdejmuje obraz z rzutnika — okno robi się przezroczyste.
export function hide() { liveId.value = null }
// H: chowa obraz bez zdejmowania go — drugie naciśnięcie pokazuje go z powrotem.
export function toggleHidden(on = !hidden.value) { if (liveId.value) hidden.value = on }
// F działa na zaznaczeniu, ale nigdy niczego nie wyświetla: zamraża zaznaczony materiał lub
// pieśń tylko wtedy, gdy właśnie on jest na rzutniku, a naciśnięte na zamrożonym — odmraża.
// Zamrożony rzutnik nie reaguje na strzałki, pętla i film stoją; „Wyświetl” zdejmuje zamrożenie.
export const selectedFrozen = computed(() => frozen.value && !!selected.value && frozenAt.value?.id === selected.value.id)
export const frozenLabel = computed(() => {
  const it = frozenAt.value && find(frozenAt.value.id)
  if (!it) return ''
  if (it.type === 'song') return `${label(it)} — slajd ${verseKey(it, frozenAt.value.index)}`
  if (it.type !== 'scene') return label(it)
  const slides = view(it).slides
  const at = slides.length ? frozenAt.value.step % slides.length : 0
  return `${label(it)} — slajd ${at + 1}: ${label(slides[at])}`
})
// Krótki komunikat, który sam znika.
let flashTimer = null
export function flash(message) {
  notice.value = message
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { if (notice.value === message) notice.value = '' }, 3500)
}
export function toggleFrozen() {
  const it = selected.value
  if (frozen.value) {
    if (it?.id === frozenAt.value?.id) frozen.value = false
    else flash(`Zamrożone jest „${frozenLabel.value}”. Zaznacz je, żeby odmrozić.`)
  } else if (!liveId.value) flash('Nie można zamrozić — nic się nie wyświetla.')
  else if (it?.id !== liveId.value) flash(it ? `Nie można zamrozić — „${label(it)}” nie jest wyświetlane.` : 'Nie można zamrozić — nic nie jest zaznaczone.')
  // Filmów się nie zamraża — do zatrzymania służy pauza na pasku pod podglądem.
  else if (liveIsVideo.value) flash('Filmów nie można zamrażać — użyj pauzy.')
  else frozen.value = true
}

// Klawisz skrótu: przejście do slajdu z takim oznaczeniem (kolejne naciśnięcia krążą po
// slajdach o tym samym skrócie, np. refrenach). Cyfra bez własnego skrótu = slajd o tym numerze.
export function jumpToKey(key) {
  const song = liveItem.value?.type === 'song' ? liveItem.value : selected.value?.type === 'song' ? selected.value : null
  if (!song) return false
  const list = parseSong(song)
  const live = song.id === liveId.value
  const now = live ? songIndex.value : previewIndex.value
  const hits = list.map((v, i) => (v.key.toLowerCase() === key.toLowerCase() ? i : -1)).filter(i => i >= 0)
  let target = hits.find(i => i > now) ?? hits[0]
  if (target == null && /^[1-9]$/.test(key) && +key <= list.length) target = +key - 1
  if (target == null) return false
  if (live) songIndex.value = target
  else previewIndex.value = target
  return true
}

export function setVerse(i) {
  if (selected.value?.id === liveId.value) songIndex.value = i
  else previewIndex.value = i
}

// Następna / poprzednia zwrotka. Pilot z telefonu (everything=true) poza pieśniami
// przechodzi po prostu do sąsiedniego elementu listy i od razu go wyświetla.
export function stepBy(d, everything = false) {
  const song = liveItem.value?.type === 'song' ? liveItem.value : selected.value?.type === 'song' ? selected.value : null
  if (song) {
    const last = verses(song).length - 1
    const list = serviceList.value
    const at = list.findIndex(e => e.song.id === song.id)
    const neighbour = at >= 0 ? list[at + d]?.song : null
    // Pilot: za ostatnim slajdem „Dalej” przechodzi do następnej pieśni z listy nabożeństwa.
    if (everything && song.id === liveId.value && neighbour && (d > 0 ? songIndex.value >= last : songIndex.value <= 0)) {
      selectedId.value = neighbour.id
      goLive()
    } else if (song.id === liveId.value) songIndex.value = clamp(songIndex.value + d, 0, last)
    else previewIndex.value = clamp(previewIndex.value + d, 0, last)
  } else if (liveItem.value?.type === 'scene') {
    const n = slideCount(liveItem.value)
    if (n) api.videoCmd({ type: 'step', value: ((video.value.step || 0) % n + d + n) % n })
  } else if (selected.value?.type === 'scene') {
    stepLoop(d)
  } else if (everything) {
    const list = visibleItems.value
    const i = list.findIndex(x => x.id === selectedId.value)
    const next = list[clamp(i + d, 0, list.length - 1)]
    if (next) { selectedId.value = next.id; goLive() }
  }
}

/* ---------- pliki ---------- */
const BUILTIN_NOTE = 'Prezentację odtworzył wbudowany czytnik — sprawdź slajdy, bo układ i kolory mogą różnić się od oryginału. Dokładną kopię daje komputer z PowerPointem lub LibreOffice albo zapis prezentacji jako PDF.'

// Zamienia wskazane pliki na elementy biblioteki. Prezentacja (PowerPoint albo wielostronicowy PDF)
// staje się pętlą ze slajdami przełączanymi ręcznie; pozostałe pliki — pojedynczymi materiałami.
export async function addFiles(paths, intoLoop = null) {
  if (!paths.length) return
  busy.value = 'Dodawanie plików…'
  try {
    const parts = [] // { name, files, deck } — deck: slajdy jednej prezentacji
    let problem = ''
    const pdfPages = async (name, file, word) => {
      const pages = []
      const { pdfToImages } = await import('./pdf.js')
      await pdfToImages(await api.readPdf(file), async (n, total, bytes) => {
        busy.value = `${name}: ${word} ${n} z ${total}…`
        pages.push(await api.saveImage(total > 1 ? `${name} – ${word} ${n}` : name, bytes))
      })
      return pages
    }
    for (const f of await api.importFiles(paths, settings.copyFiles)) {
      if (f.type === 'pptx') {
        busy.value = `Importuję prezentację „${f.name}”…`
        const res = await api.pptxToSlides(f.path)
        // LibreOffice oddaje PDF — rozkładamy go na strony tak jak każdy inny.
        const slides = res.pdf ? await pdfPages(f.name, res.pdf, 'slajd') : res.slides || []
        parts.push({ name: f.name, files: slides, deck: true })
        if (res.error) problem = res.error
        else if (res.method === 'builtin') problem = BUILTIN_NOTE
      } else if (f.type === 'pdf') {
        busy.value = `Importuję „${f.name}”…`
        parts.push({ name: f.name, files: await pdfPages(f.name, f.path, 'str.'), deck: true })
      } else {
        parts.push({ name: f.name, files: [f], deck: false })
      }
    }

    const item = (f, hidden) => ({ id: uid(), type: f.type, name: f.name, path: f.path, fit: 'contain', loop: false, ...(hidden ? { hidden: true } : {}) })
    const entry = it => ({ key: uid(), ref: it.id, seconds: null })
    let last = null
    for (const part of parts) {
      if (intoLoop) {
        // Slajdy dodane wprost do pętli nie zaśmiecają głównej listy materiałów.
        const added = part.files.map(f => item(f, true))
        items.value.push(...added)
        intoLoop.entries.push(...added.map(entry))
        last = added.at(-1) || last
      } else if (part.deck && part.files.length > 1) {
        const slides = part.files.map(f => item(f, true))
        const deck = { id: uid(), type: 'scene', name: part.name, seconds: 5, volume: 0.25, transition: 'fade', fadeMs: 350, auto: false, entries: slides.map(entry) }
        items.value.push(...slides, deck)
        last = deck
      } else {
        const added = part.files.map(f => item(f, false))
        items.value.push(...added)
        last = added.at(-1) || last
      }
    }
    if (!intoLoop && last) { tab.value = 'materials'; selectedId.value = last.id }
    notice.value = problem || (last ? '' : 'Tych plików nie da się wyświetlić — obsługiwane są zdjęcia, filmy, PDF i prezentacje PowerPoint.')
  } catch (e) {
    notice.value = 'Nie udało się dodać plików: ' + e.message
  } finally {
    busy.value = ''
  }
}
export const pickFiles = async intoLoop => addFiles(await api.pickFiles(), intoLoop)
// Prezentacja (PowerPoint lub PDF) — wchodzi jako pętla ze slajdami przełączanymi ręcznie.
export const pickDeck = async () => addFiles(await api.pickFiles('deck'))

const fileUsed = p => items.value.some(i => i.path === p || i.bgImage === p) || settings.songStyle.bgImage === p ||
  services.value.some(s => s.files.some(f => f.path === p))
// Kasuje kopię pliku z folderu aplikacji, gdy nic już z niej nie korzysta.
const dropFile = p => { if (p && !fileUsed(p)) api.removeFile(p) }

export async function pickBackground(style) {
  const [file] = await api.importFiles(await api.pickFiles('image'), settings.copyFiles)
  if (file) setBackground(style, file.path)
}
export function setBackground(style, p) {
  const old = style.bgImage
  style.bgImage = p
  dropFile(old)
}

/* ---------- biblioteka ---------- */
export function addText() {
  const it = { id: uid(), type: 'text', name: '', text: '', ...TEXT_STYLE }
  items.value.push(it)
  selectedId.value = it.id
}

/* ---------- Biblia ---------- */
// Plik Biblii jest wczytywany raz (zapamiętany w danych aplikacji), a fragment staje się pętlą
// slajdów tekstowych przełączanych ręcznie — tak jak prezentacja.
export const bible = shallowRef(null)
export const bibleOpen = ref(false)
let bibleLoaded = false
export async function loadBible() {
  if (!bibleLoaded) { bible.value = await api.loadStore('bible'); bibleLoaded = true }
  return bible.value
}
export async function importBible() {
  const file = await api.biblePick()
  if (!file) return null
  const data = parseBibleXml(file.text, file.name)
  const known = data.books.filter(b => b.index >= 0).length
  if (known < 20) throw new Error(`Rozpoznano tylko ${known} ksiąg z ${data.books.length} — ten plik nie wygląda na pełną Biblię.`)
  bible.value = data
  bibleLoaded = true
  await api.saveStore('bible', data)
  return data
}
export function addPassage(ref, perSlide = 2, source = null) {
  const r = parseRef(ref)
  if (!r) return { error: 'Nie rozpoznaję odnośnika — wpisz np. J 3,16–21.' }
  const verses = passage(bible.value, r)
  if (!verses.length) return { error: 'W tej Biblii nie ma takiego fragmentu.' }
  const slides = toSlides(r.book, verses, perSlide).map(s => ({ ...TEXT_STYLE, id: uid(), type: 'text', name: refLabel(r.book, s.verses), text: s.text, fs: 9, hidden: true }))
  const deck = { id: uid(), type: 'scene', name: refLabel(r.book, verses), seconds: 5, volume: 0.25, transition: 'fade', fadeMs: 350, auto: false,
    entries: slides.map(it => ({ key: uid(), ref: it.id, seconds: null })), ...(source ? { source } : {}) }
  items.value.push(...slides, deck)
  // Dodany ręcznie — od razu zaznaczony; dodany przy wczytywaniu nabożeństwa — tylko czeka w materiałach.
  if (!source) { tab.value = 'materials'; selectedId.value = deck.id }
  return { deck }
}

// Odliczanie na rzutniku: zwykły tekst ze znacznikiem {odliczanie}, który scena zamienia na pozostały czas.
// Cel: najbliższe nabożeństwo albo „za N minut” od kliknięcia Start.
export const COUNTDOWN = '{odliczanie}'
export function addCountdown() {
  const it = { ...TEXT_STYLE, id: uid(), type: 'text', name: 'Odliczanie', fs: 14,
    text: 'Nabożeństwo rozpocznie się za\n' + COUNTDOWN, endText: 'Zaraz zaczynamy!', countMode: 'service', minutes: 5, target: 0 }
  items.value.push(it)
  selectedId.value = it.id
}

// Ogłoszenia (z aplikacji na telefon) jako pętla slajdów przełączanych samoczynnie — np. przed nabożeństwem.
// Komunikaty rady najpierw; ogłoszenia po terminie ważności i te tylko dla rady są pomijane.
export const currentAnnouncements = computed(() => churchAnnouncements.value
  .filter(a => a.audience !== 'council' && (!a.until || a.until >= today()) && a.title)
  .sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || (b.date || 0) - (a.date || 0)))
export function addAnnouncements() {
  const list = currentAnnouncements.value
  if (!list.length) return
  const slides = list.map(a => ({ ...TEXT_STYLE, id: uid(), type: 'text', name: a.title, text: a.title + (a.text ? '\n\n' + a.text.trim() : ''), fs: a.text && a.text.length > 160 ? 7 : 9, hidden: true }))
  const deck = { id: uid(), type: 'scene', name: 'Ogłoszenia', seconds: 12, volume: 0.25, transition: 'fade', fadeMs: 500, auto: true,
    entries: slides.map(it => ({ key: uid(), ref: it.id, seconds: null })) }
  items.value.push(...slides, deck)
  tab.value = 'materials'
  selectedId.value = deck.id
}

export function addLoop() {
  const n = items.value.filter(i => i.type === 'scene').length + 1
  const it = { id: uid(), type: 'scene', name: 'Pętla ' + n, seconds: 5, volume: 0.25, transition: 'fade', fadeMs: 350, entries: [] }
  items.value.push(it)
  selectedId.value = it.id
}

function deleteItem(it) {
  const i = items.value.indexOf(it)
  if (i >= 0) items.value.splice(i, 1)
  dropFile(it.path)
  dropFile(it.bgImage)
}

export function removeEntry(loop, i) {
  const [entry] = loop.entries.splice(i, 1)
  const it = itemById(entry.ref)
  const stillUsed = items.value.some(l => l.type === 'scene' && l.entries.some(e => e.ref === entry.ref))
  if (it?.hidden && !stillUsed) deleteItem(it)
}

export function remove(it) {
  confirmId.value = null
  if (it.id === liveId.value) hide()
  const list = it.type === 'song' ? visibleSongs.value : visibleItems.value
  const at = list.indexOf(it)
  const neighbour = list[at + 1] || list[at - 1]
  if (it.type === 'song') {
    songs.value.splice(songs.value.indexOf(it), 1)
    settings.service = settings.service.filter(e => e.songId !== it.id)
    if (settings.sharedDir) settings.deletedSongs[it.id] = Date.now()
  } else {
    if (it.type === 'scene') while (it.entries.length) removeEntry(it, 0)
    else for (const loop of items.value) if (loop.type === 'scene') loop.entries = loop.entries.filter(e => e.ref !== it.id)
    deleteItem(it)
  }
  if (it.id === selectedId.value) selectedId.value = neighbour?.id ?? null
}

export function moveItem(fromId, toId) {
  const list = items.value
  const from = list.findIndex(x => x.id === fromId)
  const [it] = list.splice(from, 1)
  const to = list.findIndex(x => x.id === toId)
  list.splice(from <= to ? to + 1 : to, 0, it)
}

export function startRename(it) {
  selectedId.value = it.id
  renameValue.value = label(it)
  renamingId.value = it.id
}
export function commitRename(it) {
  if (renamingId.value !== it.id) return
  renamingId.value = null
  const name = renameValue.value.trim()
  // Pusta nazwa tekstu = wróć do pokazywania jego pierwszej linii.
  if (name || it.type === 'text') it.name = name
}

/* ---------- pieśni ---------- */
export function addToService(song) {
  settings.service.push({ key: uid(), songId: song.id })
  search.service = ''
  tab.value = 'songs'
  selectedId.value = song.id
}
export function removeFromService(i) {
  const entry = serviceList.value[i]
  settings.service = settings.service.filter(e => e.key !== entry.key)
}
export function moveInService(from, to) {
  const keys = serviceList.value.map(e => e.key)
  keys.splice(to, 0, ...keys.splice(from, 1))
  settings.service = keys.map(key => settings.service.find(e => e.key === key))
}
export function clearService() { settings.service = [] }

export function addSong() {
  const song = { id: uid(), type: 'song', number: '', title: '', text: '' }
  songs.value.push(song)
  search.songs = ''
  return song
}

// Wczytuje pieśni z plików lub folderu, ale ich nie zapisuje — trafiają do wersji roboczej w oknie bazy.
// Pieśni z folderu na Dysku Google (np. cała baza z OpenSong).
export async function songsFromDrive(link) {
  const off = api.onSongsDriveProgress(p => { busy.value = `Pobieram pieśni z Dysku Google: ${p.done} z ${p.total}…` })
  busy.value = 'Szukam pieśni w folderze na Dysku Google…'
  try {
    const res = await api.songsFromDrive(link)
    if (res.error) return { error: res.error, songs: [], skipped: 0 }
    return parseSongFiles(res.files)
  } finally { off(); busy.value = '' }
}
async function parseSongFiles(files) {
  const found = []
  let skipped = 0
  if (files.length) {
    const { parseSongFile } = await import('./songImport.js')
    for (const f of files) {
      const list = parseSongFile(f.name, f.content)
      if (!list.length) skipped++
      found.push(...list.map(x => ({ id: uid(), type: 'song', ...x })))
    }
  }
  return { songs: found, skipped }
}
export async function pickSongs(folder) {
  const files = await api.pickSongFiles(folder)
  const found = []
  let skipped = 0
  if (files.length) {
    const { parseSongFile } = await import('./songImport.js')
    for (const f of files) {
      const list = parseSongFile(f.name, f.content)
      if (!list.length) skipped++
      found.push(...list.map(x => ({ id: uid(), type: 'song', ...x })))
    }
  }
  return { songs: found, skipped }
}

// Zapis z okna bazy pieśni: tylko to, co użytkownik faktycznie zmienił od otwarcia okna.
export function applySongChanges({ added, removed, edited }) {
  for (const id of removed) { const song = songs.value.find(x => x.id === id); if (song) remove(song) }
  for (const e of edited) { const song = songs.value.find(x => x.id === e.id); if (song) Object.assign(song, { number: e.number, title: e.title, text: e.text }) }
  songs.value.push(...added.map(x => ({ id: x.id, type: 'song', number: x.number, title: x.title, text: x.text })))
}


/* ---------- nabożeństwa ---------- */
const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const today = () => localDate(new Date())
// Najbliższa niedziela (dzisiejsza też się liczy).
export const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return localDate(d) }
// Informacje, bez których nabożeństwo nie jest gotowe (opcjonalny jest tylko skład zespołu).
const REQUIRED = [['sermonTitle', 'tytułu kazania'], ['passage', 'fragmentu'], ['speaker', 'mówcy']]
export const missingInfo = svc => [
  ...REQUIRED.filter(([key]) => !String(svc[key] || '').trim()).map(([, name]) => name),
  ...(svc.songs?.length ? [] : ['pieśni']),
]
// Alarm: na najbliższą niedzielę nie ma nabożeństwa albo brakuje w nim wymaganych informacji.
export const planAlert = computed(() => {
  const date = nextSunday()
  const service = services.value.find(s => s.date === date) || null
  if (!service) return { date, service: null, text: `Nie ma nabożeństwa na niedzielę ${prettyDate(date).replace(/^niedziela, /, '')}.` }
  const missing = missingInfo(service)
  return missing.length ? { date, service, text: `Nabożeństwo na niedzielę nie ma: ${missing.join(', ')}.` } : null
})
// Godzina i miejsce: każde nabożeństwo ma je zapisane, a domyślnie zawsze 12:12 w Hotelu Forza.
export const DEFAULT_TIME = '12:12'
export const DEFAULT_PLACE = 'Hotel Forza'
export const serviceTime = svc => svc?.time || DEFAULT_TIME
export const servicePlace = svc => svc?.place || DEFAULT_PLACE
const startsAt = svc => new Date(svc.date + 'T' + serviceTime(svc)).getTime()

const RUNS = 3 * 3600e3 // tyle trwa nabożeństwo „w trakcie”
// Początek najbliższego nabożeństwa (także trwającego) — zegar co pół minuty wystarcza, a rzutnik nie dostaje zmian co sekundę.
const nowCoarse = ref(Date.now())
export const nextServiceStart = computed(() => services.value
  .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date || '')).map(startsAt).filter(t => t + RUNS > nowCoarse.value).sort((a, b) => a - b)[0] || 0)

// Odliczanie do najbliższego nabożeństwa; przez 3 godziny od rozpoczęcia — „w trakcie”, potem do następnego.
export const now = ref(Date.now())
export const countdown = computed(() => {
  const next = services.value.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date || '') && startsAt(s) + RUNS > now.value)
    .sort((a, b) => startsAt(a) - startsAt(b))[0]
  if (!next) return null
  const left = Math.max(0, startsAt(next) - now.value)
  const sec = Math.floor(left / 1000)
  return {
    service: next, live: left === 0,
    days: Math.floor(sec / 86400), hours: Math.floor(sec / 3600) % 24, minutes: Math.floor(sec / 60) % 60, seconds: sec % 60,
    when: prettyDate(next.date) + ', ' + serviceTime(next), place: servicePlace(next),
  }
})
// „dziś”, „jutro”, „za 4 dni”, „wczoraj”, „3 dni temu” — przy nabożeństwach na listach.
export function relDay(date) {
  const days = Math.round((new Date(date + 'T12:00') - new Date(today() + 'T12:00')) / 86400000)
  if (days === 0) return 'dziś'
  if (days === 1) return 'jutro'
  if (days === -1) return 'wczoraj'
  return days > 0 ? `za ${days} dni` : `${-days} dni temu`
}
export const prettyDate = date => (date ? new Date(date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'bez daty')
export const sortedServices = computed(() => [...services.value].sort((a, b) => b.date.localeCompare(a.date)))
// Najbliższe nabożeństwo: dzisiejsze lub pierwsze przyszłe, a gdy takich nie ma — ostatnie.
export const nearestService = computed(() => {
  const upcoming = sortedServices.value.filter(s => s.date >= today())
  return upcoming.at(-1) || sortedServices.value[0] || null
})
export const activeService = computed(() => services.value.find(s => s.id === settings.activeService) || null)

// Potwierdzenie: nabożeństwo na najbliższą niedzielę istnieje i ma komplet wymaganych informacji.
export const planReady = computed(() => {
  if (planAlert.value) return null
  const service = services.value.find(s => s.date === nextSunday())
  return service ? { service, text: `Nabożeństwo na niedzielę ${prettyDate(service.date).replace(/^niedziela, /, '')} jest gotowe.` } : null
})

// Kto zmienia nabożeństwa na tym komputerze: konto Google, a bez niego użytkownik Windows i nazwa komputera.
const computerUser = ref('')
export const me = () => sharedAccount.value?.email || computerUser.value || 'ten komputer'

// Na jeden dzień jest jedno nabożeństwo: „nowe” na zajęty dzień otwiera istniejące.
export function newService(date = today(), add = true) {
  const existing = services.value.find(s => s.date === date)
  if (existing) return existing
  const svc = { id: uid(), date, time: DEFAULT_TIME, place: DEFAULT_PLACE, sermonTitle: '', passage: '', speaker: '', band: '', notes: '', songs: [], files: [], createdBy: me() }
  if (add) services.value.push(svc)
  return svc
}

// Dwa nabożeństwa na ten sam dzień (np. utworzone niezależnie na komputerze i na telefonie) są łączone:
// zostaje nowsze, puste pola uzupełnia drugie, pieśni i załączniki są sumowane, a drugie znika wszędzie.
// Wybór jest taki sam na każdym komputerze, więc łączenie w kilku miejscach naraz daje ten sam wynik.
function mergeSameDay() {
  const byDate = new Map()
  for (const svc of services.value) byDate.set(svc.date, [...(byDate.get(svc.date) || []), svc])
  let merged = 0
  for (const group of byDate.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => (b.updated || 0) - (a.updated || 0) || (a.id < b.id ? -1 : 1))
    const [keep, ...rest] = group
    for (const other of rest) {
      for (const key of ['sermonTitle', 'passage', 'speaker', 'band', 'notes', 'createdBy']) {
        if (!String(keep[key] || '').trim() && String(other[key] || '').trim()) keep[key] = other[key]
      }
      const sameSong = e => x => x.title === e.title && (x.number || '') === (e.number || '')
      for (const e of other.songs) if (!keep.songs.some(sameSong(e))) keep.songs.push(e)
      for (const f of other.files) if (!keep.files.some(x => x.name === f.name)) keep.files.push(f)
      if (settings.activeService === other.id) settings.activeService = keep.id
      services.value.splice(services.value.indexOf(other), 1)
      synced.delete(other.id)
      if (other.shared && settings.sharedDir) shared(settings.sharedDir).sharedRemove(settings.sharedDir, other.id)
      merged++
    }
  }
  if (merged) flash(merged === 1 ? 'Połączono dwa nabożeństwa z tego samego dnia.' : `Połączono nabożeństwa z tych samych dni (${merged}).`)
}
export function removeService(svc) {
  services.value.splice(services.value.indexOf(svc), 1)
  if (svc.shared && settings.sharedDir) shared(settings.sharedDir).sharedRemove(settings.sharedDir, svc.id)
  else for (const f of svc.files) dropFile(f.path)
  synced.delete(svc.id)
}
export async function attachToService(svc) {
  const paths = await api.pickFiles()
  if (!paths.length) return
  busy.value = 'Dodaję załącznik…'
  try {
    // 'all' — do biblioteki aplikacji trafia też sam PDF lub prezentacja, żeby załącznik nie zależał od pendrive'a.
    const files = await api.importFiles(paths, 'all')
    svc.files.push(...files.map(f => ({ key: uid(), path: f.path, name: f.name, type: f.type })))
  } finally {
    busy.value = ''
  }
}
export function detachFromService(svc, i) {
  const [f] = svc.files.splice(i, 1)
  dropFile(f.path)
}

// Rzutnik: lista pieśni i załączniki nabożeństwa trafiają do panelu wyświetlania.
// parts — co wczytać: pieśni (zastępują listę), załączniki (trafiają do materiałów) albo jedno i drugie.
export async function applyService(svc, parts = { songs: true, files: true }) {
  if (parts.songs) settings.service = svc.songs.filter(e => songs.value.some(x => x.id === e.songId)).map(e => ({ key: uid(), songId: e.songId }))
  settings.activeService = svc.id
  const files = parts.files ? svc.files : []
  // Przy logowaniu do Dysku Google załączniki pobierane są dopiero teraz, gdy są potrzebne.
  if ((settings.sharedDir === 'google' || settings.sharedDir === BAZA) && files.length) {
    busy.value = 'Pobieram załączniki z Dysku Google…'
    const got = await api.sharedEnsure(files.map(f => f.path))
    busy.value = ''
    if (got.error) flash(got.error)
  }
  for (const f of files) {
    const source = svc.id + ':' + f.key
    if (items.value.some(i => i.source === source)) continue // już wczytane wcześniej
    const before = items.value.length
    await addFiles([f.path])
    for (const it of items.value.slice(before)) it.source = source
  }
  // Fragment Biblii z nabożeństwa — gdy jest wczytana Biblia, trafia do materiałów jako pętla.
  let verses = false
  if (parts.files && svc.passage?.trim() && await loadBible() && !items.value.some(i => i.source === svc.id + ':bible')) {
    verses = !addPassage(svc.passage, 2, svc.id + ':bible').error
  }
  tab.value = parts.songs ? 'songs' : 'materials'
  if (parts.songs) selectedId.value = serviceList.value[0]?.song.id ?? selectedId.value
  serviceModal.value = false
  const missing = parts.songs ? svc.songs.length - settings.service.length : 0
  const what = [parts.songs && `pieśni ${settings.service.length}`, parts.files && `załączników ${files.length}`, verses && `fragment ${svc.passage}`].filter(Boolean).join(', ')
  flash(`Wczytano z nabożeństwa: ${what}.` + (missing ? ` Brak w bazie: ${missing}.` : ''))
}

// Nabożeństwo wędruje między komputerami razem z tekstami pieśni, bo każdy komputer ma własną
// bazę (i własne identyfikatory pieśni). Przy odbiorze pieśni są dopasowywane po numerze i tytule,
// a brakujące dopisywane do tutejszej bazy.
function servicePayload(svc) {
  const copy = plainCopy(svc)
  const texts = copy.songs.map(e => songs.value.find(x => x.id === e.songId)).filter(Boolean).map(({ number, title, text }) => ({ number, title, text }))
  return { service: copy, songs: texts }
}
function adoptService({ service, songs: texts }, id) {
  const entries = []
  for (const e of service.songs || []) {
    const same = x => x.title === e.title && (x.number || '') === (e.number || '')
    let own = songs.value.find(same)
    const text = (texts || []).find(same)
    if (!own && text) { own = { id: uid(), type: 'song', ...text }; songs.value.push(own) }
    entries.push({ key: e.key || uid(), songId: own?.id ?? null, title: e.title, number: e.number || '' })
  }
  return { band: '', notes: '', files: [], ...service, id, songs: entries }
}

// Ręczne przeniesienie: nabożeństwo jako folder (np. na pendrivie).
export const exportService = svc => api.exportService(servicePayload(svc))
export async function importService() {
  const res = await api.importService()
  if (!res.payload) return res
  const svc = adoptService(res.payload, uid())
  services.value.push(svc)
  return { service: svc }
}

/* ---------- folder wspólny: te same nabożeństwa na wielu komputerach ---------- */
// Każdy komputer wskazuje ten sam folder (OneDrive, Dysk Google, dysk sieciowy…). Nabożeństwa są
// tam zapisywane jako podfoldery; aplikacja co kilkanaście sekund sprawdza, czy ktoś coś zmienił.
// Przy równoczesnej edycji wygrywa późniejszy zapis.
export const sharedStatus = ref('')
export const sharedAccount = ref(null) // { provider, email } — konto dysku, na którym leży folder (gdy da się ustalić)
const synced = new Map() // id → stan nabożeństwa, który jest już w folderze wspólnym
const snapshot = svc => JSON.stringify({ ...svc, updated: 0 })
const clock = () => new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })

export const syncing = ref(false)
let syncRun = null
// Trwająca synchronizacja nie jest uruchamiana drugi raz — wywołujący czeka na jej koniec.
export function syncShared() {
  if (syncRun) return syncRun
  syncing.value = true
  syncRun = runSync().finally(() => { syncing.value = false; syncRun = null })
  return syncRun
}
// Sprawdzanie zmian z innych komputerów i telefonów: co 2 minuty, po powrocie do okna (nie częściej
// niż co 30 s) i od razu po zapisie. Zapis nabożeństwa wysyła je od razu.
const SYNC_EVERY = 2 * 60000
let lastSync = 0
function syncIfStale() {
  if (Date.now() - lastSync < 30000) return
  lastSync = Date.now()
  syncShared()
}
async function runSync() {
  const dir = settings.sharedDir
  if (!dir || !loaded.value) return
  const res = await shared(dir).sharedRead(dir)
  googleExpired.value = !!res.needLogin
  if (dir === BAZA) sharedAccount.value = cloud.account() || sharedAccount.value
  if (res.error) { sharedStatus.value = res.error; return }
  if (res.templates !== undefined) churchTypes.value = mergeTypes(res.templates)
  if (Array.isArray(res.events)) churchEvents.value = res.events
  if (Array.isArray(res.announcements)) churchAnnouncements.value = res.announcements
  const seen = new Set()
  for (const payload of res.list) {
    const id = payload.service.id
    seen.add(id)
    const local = services.value.find(x => x.id === id)
    if (local && (local.updated || 0) >= (payload.service.updated || 0)) continue
    const svc = { ...adoptService(payload, id), shared: true }
    if (local) Object.assign(local, svc)
    else services.value.push(svc)
    synced.set(id, snapshot(services.value.find(x => x.id === id)))
  }
  mergeSameDay()
  // Nabożeństwo usunięte na innym komputerze znika też tutaj.
  for (const svc of [...services.value]) {
    if (svc.shared && !seen.has(svc.id)) { services.value.splice(services.value.indexOf(svc), 1); synced.delete(svc.id) }
  }
  await pushShared()
  await syncSongs(dir)
  if (settings.sharedDir === dir) sharedStatus.value = 'Zsynchronizowano o ' + clock()
}

/* Wspólna baza pieśni. Każda pieśń ma czas ostatniej zmiany; przy łączeniu wygrywa nowsza wersja,
   a usunięcia są zapamiętywane, żeby pieśń nie „wracała” z innego komputera. */
const songSeen = new Map() // id → treść przy ostatnim sprawdzeniu (do wykrywania edycji)
const songBody = s => s.number + '\n' + s.title + '\n' + s.text
let songsDirty = true
let songsMtime = 0
function stampSongs() {
  const now = Date.now()
  for (const s of songs.value) {
    const body = songBody(s)
    const seen = songSeen.get(s.id)
    if (seen === body) continue
    // Edycja jest zawsze nowsza od wersji, na której powstała — także gdy zegary komputerów się różnią.
    if (seen !== undefined || !s.updated) s.updated = Math.max(now, (s.updated || 0) + 1)
    songSeen.set(s.id, body)
  }
}
// Ta sama pieśń dodana niezależnie na dwóch komputerach dostaje wspólny identyfikator.
function changeSongId(song, id) {
  const old = song.id
  song.id = id
  songSeen.set(id, songSeen.get(old)); songSeen.delete(old)
  for (const e of settings.service) if (e.songId === old) e.songId = id
  for (const svc of services.value) for (const e of svc.songs) if (e.songId === old) e.songId = id
  if (selectedId.value === old) selectedId.value = id
  if (liveId.value === old) liveId.value = id
}
// Ta sama pieśń dwa razy (np. raz z numerem z bazy wspólnej, raz bez numeru z tego komputera):
// zostaje ta z numerem, z nowszym tekstem, a odwołania w nabożeństwach przechodzą na nią.
// Pieśni o tym samym tytule, ale różnych numerach, to różne pieśni — zostają obie.
function mergeTwinSongs(deleted) {
  const groups = new Map()
  for (const s of songs.value) {
    const key = plain(String(s.title || '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (key) groups.set(key, [...(groups.get(key) || []), s])
  }
  let merged = 0
  for (const group of groups.values()) {
    if (group.length < 2 || new Set(group.map(s => s.number).filter(Boolean)).size > 1) continue
    group.sort((a, b) => (b.number ? 1 : 0) - (a.number ? 1 : 0) || (b.updated || 0) - (a.updated || 0) || (a.id < b.id ? -1 : 1))
    const [keep, ...rest] = group
    for (const other of rest) {
      if ((other.updated || 0) > (keep.updated || 0) && other.text !== keep.text) keep.text = other.text
      const old = other.id
      for (const e of settings.service) if (e.songId === old) e.songId = keep.id
      for (const svc of services.value) for (const e of svc.songs) if (e.songId === old) e.songId = keep.id
      if (selectedId.value === old) selectedId.value = keep.id
      if (liveId.value === old) liveId.value = keep.id
      songs.value.splice(songs.value.indexOf(other), 1)
      songSeen.delete(old)
      const at = Date.now()
      if (settings.sharedDir) settings.deletedSongs[old] = at
      if (deleted) deleted[old] = at
      merged++
    }
  }
  return merged
}
async function syncSongs(dir) {
  stampSongs()
  const remote = await shared(dir).sharedSongsRead(dir, songsDirty ? 0 : songsMtime)
  if (remote.error || remote.unchanged) return
  const remoteSongs = remote.songs || []
  const deleted = { ...remote.deleted }
  for (const [id, at] of Object.entries(settings.deletedSongs)) if (!(deleted[id] >= at)) deleted[id] = at

  const byId = new Map(songs.value.map(s => [s.id, s]))
  const nameOf = s => (s.number || '') + '|' + s.title
  const byName = new Map(songs.value.map(s => [nameOf(s), s]))
  const remoteIds = new Set(remoteSongs.map(r => r.id))
  for (const r of remoteSongs) {
    if (deleted[r.id] >= (r.updated || 0)) continue
    let own = byId.get(r.id)
    if (!own) {
      const twin = byName.get(nameOf(r))
      if (twin && !remoteIds.has(twin.id)) { changeSongId(twin, r.id); byId.set(r.id, twin); own = twin }
    }
    if (!own) {
      own = { id: r.id, type: 'song', number: r.number || '', title: r.title, text: r.text, updated: r.updated || 0 }
      songs.value.push(own)
    } else if ((r.updated || 0) > (own.updated || 0)) {
      Object.assign(own, { number: r.number || '', title: r.title, text: r.text, updated: r.updated })
    } else continue
    songSeen.set(own.id, songBody(own))
  }
  if (mergeTwinSongs(deleted)) stampSongs()
  for (const s of [...songs.value]) {
    if (!(deleted[s.id] >= (s.updated || 0))) continue
    if (s.id === liveId.value) hide()
    if (s.id === selectedId.value) selectedId.value = null
    songs.value.splice(songs.value.indexOf(s), 1)
    settings.service = settings.service.filter(e => e.songId !== s.id)
  }

  const mine = songs.value.map(({ id, number, title, text, updated }) => ({ id, number, title, text, updated: updated || 0 }))
  const order = list => JSON.stringify([...list].sort((a, b) => (a.id < b.id ? -1 : 1)))
  const same = order(mine) === order(remoteSongs.map(({ id, number, title, text, updated }) => ({ id, number: number || '', title, text, updated: updated || 0 }))) &&
    JSON.stringify(deleted) === JSON.stringify(remote.deleted || {})
  if (same) { songsMtime = remote.mtime; songsDirty = false; return }
  const res = await shared(dir).sharedSongsWrite(dir, { songs: mine, deleted })
  if (res.error) { sharedStatus.value = res.error; return }
  songsMtime = res.mtime
  songsDirty = false
}
let songSyncTimer = null
function songsChanged() {
  songsDirty = true
  if (!settings.sharedDir) return
  clearTimeout(songSyncTimer)
  songSyncTimer = setTimeout(syncShared, 3000)
}

let pushing = false
async function pushShared() {
  const dir = settings.sharedDir
  if (!dir || !loaded.value || pushing) return
  pushing = true
  try {
    for (const svc of services.value) {
      if (synced.get(svc.id) === snapshot(svc)) continue
      svc.updated = Date.now()
      svc.updatedBy = me()
      const res = await shared(dir).sharedWrite(dir, servicePayload(svc))
      if (res.error) { sharedStatus.value = res.error; return }
      // Załączniki leżą odtąd w folderze wspólnym — lokalna kopia nie jest już potrzebna.
      for (const f of svc.files) {
        const moved = res.files.find(x => x.key === f.key)
        if (moved && moved.path !== f.path) { const old = f.path; f.path = moved.path; dropFile(old) }
      }
      svc.shared = true
      synced.set(svc.id, snapshot(svc))
      sharedStatus.value = 'Zapisano o ' + clock()
    }
  } finally {
    pushing = false
  }
}
let pushTimer = null
function pushSoon() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(pushShared, 1500)
}

// Po zmianie folderu wszystko, co jest na tym komputerze, trafia do nowego folderu — a nie zostaje
// uznane za „usunięte gdzie indziej”, bo w nowym folderze jeszcze tego nie ma.
function forgetShared() {
  synced.clear()
  songsMtime = 0
  songsDirty = true
  for (const svc of services.value) delete svc.shared
}
export const sharedSuggestions = ref([]) // znalezione na tym komputerze foldery aplikacji
export const googleError = ref('') // ostatni błąd logowania — zostaje widoczny, bo użytkownik jest wtedy w przeglądarce
export const googleExpired = ref(false) // logowanie do Dysku Google wygasło (tryb testowy Google: co 7 dni)

/* ---------- dostęp do służb (konto i rangi z bazy) ---------- */
// Bez zalogowania nic nie działa. Rzutnik i Stream — służba techniczna (ranga „technika”) i administrator;
// Organizacja — rangi z prawem edycji. Bez internetu (np. w kościele) liczy się ostatnie udane sprawdzenie
// z tego komputera, jeśli było w ciągu 30 dni — żeby rzutnik nie stanął w trakcie nabożeństwa.
export const access = reactive({ checked: false, status: '', email: '', roles: [], names: [], edit: false, manage: false, offline: false, error: '' })
const ACCESS_KEY = 'kns-dostep', ACCESS_DAYS = 30
function applyAccess(a, offline = false) {
  Object.assign(access, { status: a.status || '', email: a.email || '', roles: a.roles || [], names: a.names || [], edit: !!a.edit, manage: !!a.manage, offline, error: '' })
}
export async function refreshAccess() {
  if (!cloud) return
  const r = await cloud.access()
  access.checked = true
  if (!r.error) {
    applyAccess(r)
    try { localStorage.setItem(ACCESS_KEY, JSON.stringify({ ...r, at: Date.now() })) } catch { /* bez zapisu */ }
    return
  }
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(ACCESS_KEY) || 'null') } catch { /* brak */ }
  if (/połączenia|fetch|network/i.test(r.error) && saved && Date.now() - saved.at < ACCESS_DAYS * 86400000) { applyAccess(saved, true); return }
  applyAccess({})
  access.error = r.needLogin ? '' : r.error
}
export function canUse(which) {
  if (access.status !== 'active') return false
  if (which === 'calendar') return true
  if (which === 'planner') return access.edit
  return access.roles.includes('technika') || access.manage
}
export function accessReason(which) {
  if (!access.status) return 'Zaloguj się kontem Google'
  if (access.status === 'pending') return 'Konto czeka na zatwierdzenie'
  if (access.status !== 'active') return 'Brak dostępu'
  if (canUse(which)) return ''
  return which === 'planner' ? 'Tylko dla osób z prawem edycji' : 'Tylko dla służby technicznej'
}

// Logowanie do Dysku Google: aplikacja sama czyta i zapisuje folder „Aplikacja KNS Nabo” — bez programu
// „Dysk Google na komputer” i bez wskazywania folderu. W ustawieniach zamiast ścieżki jest wtedy „google”.
export async function loginGoogle() {
  busy.value = 'Dokończ logowanie w przeglądarce, która się otworzyła…'
  try {
    googleError.value = ''
    const res = await api.googleLogin()
    if (res.error) { googleError.value = 'Logowanie nie powiodło się: ' + res.error; return }
    googleExpired.value = false
    if (cloud) {
      // Dane kościoła są w bazie; to samo konto Google loguje do bazy (konto musi być zatwierdzone).
      await cloud.signOut()
      const c = await cloud.connect()
      if (c.error && !/czeka na zatwierdzenie|nie ma dostępu/.test(c.error)) { googleError.value = c.error; return }
      if (c.error) sharedStatus.value = c.error
      sharedAccount.value = cloud.account()
      await refreshAccess()
      if (settings.sharedDir !== BAZA) connectSharedDir(BAZA)
      else syncShared()
      return
    }
    sharedAccount.value = res.email ? { provider: 'Dysk Google', email: res.email } : sharedAccount.value
    if (settings.sharedDir !== 'google') connectSharedDir('google')
    else syncShared()
  } finally {
    busy.value = ''
  }
}
export async function logoutGoogle() {
  await api.googleLogout()
  await cloud?.signOut()
  try { localStorage.removeItem(ACCESS_KEY) } catch { /* bez zapisu */ }
  applyAccess({})
  role.value = null
  googleExpired.value = false
  leaveSharedDir()
}
export async function findSharedDir() {
  sharedSuggestions.value = settings.sharedDir ? [] : await api.sharedSuggest()
}
export function connectSharedDir(dir) {
  if (!dir || dir === settings.sharedDir) return
  forgetShared()
  settings.sharedDir = dir
  sharedSuggestions.value = []
}
export async function pickSharedDir() {
  const dir = await api.sharedPick()
  if (!dir || dir === settings.sharedDir) return
  // Łatwo kliknąć o jeden folder za wysoko (np. „Mój dysk”) — wtedy pytamy, zanim cokolwiek tam powstanie.
  const check = await api.sharedCheck(dir)
  if (!check.hasData && !confirm(`W folderze „${check.name}” nie ma jeszcze danych aplikacji (podfolderów „nabozenstwa” i „piesni”).\n\nUtworzyć je tutaj? Wybierz „Anuluj”, jeśli chodziło o folder „Aplikacja KNS Nabo”.`)) return
  connectSharedDir(dir)
}
export function leaveSharedDir() {
  settings.sharedDir = ''
  sharedStatus.value = ''
  forgetShared()
  findSharedDir()
}

/* ---------- zapis ---------- */
// Przez IPC przechodzą tylko zwykłe obiekty, nie reaktywne — stąd kopia przez JSON.
const plainCopy = data => JSON.parse(JSON.stringify(data))
const savers = {
  library: () => api.saveStore('library', plainCopy(items.value.map(({ missing, ...rest }) => rest))),
  songs: () => api.saveStore('songs', plainCopy(songs.value)),
  settings: () => api.saveStore('settings', plainCopy(settings)),
  services: () => api.saveStore('services', plainCopy(services.value)),
}
const timers = {}
function saveSoon(name) {
  if (!loaded.value) return
  clearTimeout(timers[name])
  timers[name] = setTimeout(() => { delete timers[name]; savers[name]() }, 500)
}
// Zapisuje od razu wszystko, co czeka — przed kopią zapasową.
export async function flush() {
  for (const name of Object.keys(timers)) { clearTimeout(timers[name]); delete timers[name]; await savers[name]() }
}

function migrate(it) {
  if (it.type !== 'scene') return it
  const { itemIds, ...rest } = it
  return {
    volume: 0.25, transition: 'fade', fadeMs: 350, ...rest,
    name: (it.name || '').replace(/^Scena( \d+)?$/, 'Pętla$1'),
    entries: it.entries || (itemIds || []).map(ref => ({ key: uid(), ref, seconds: null })),
  }
}

let started = false
export async function init() {
  if (started) return
  started = true
  api.onDisplays(setDisplays)
  api.onOutputState(state => {
    output.value = state
    if (!state.open) hidden.value = frozen.value = false
    if (!state.open && !state.waiting) liveId.value = null
  })
  api.onVideoState(state => { video.value = state })
  api.onPptxProgress(p => { busy.value = `${p.name}: slajd ${p.done} z ${p.count}…` })
  api.updateState().then(s => { appUpdate.value = s })
  api.onUpdate(s => { appUpdate.value = { ...appUpdate.value, ...s } })
  api.onRemoteCmd(cmd => (cmd === 'hide' ? toggleHidden() : stepBy(cmd === 'next' ? 1 : -1, true)))
  wire()
  setInterval(() => { now.value = Date.now() }, 1000)
  setInterval(() => { nowCoarse.value = Date.now() }, 30000)
  setDisplays(await api.getDisplays())

  const saved = await api.loadStore('settings')
  if (saved) Object.assign(settings, saved, { songStyle: { ...settings.songStyle, ...saved.songStyle } })
  if (!settings.remoteToken) settings.remoteToken = uid()
  items.value = ((await api.loadStore('library')) || []).map(migrate)
  songs.value = (await api.loadStore('songs')) || []
  services.value = (await api.loadStore('services')) || []
  computerUser.value = await api.userName()
  mergeTwinSongs()
  mergeSameDay()
  // Układ folderu wspólnego się zmienił (podfoldery „nabozenstwa” i „piesni”) — nabożeństwa z tego
  // komputera zostaną zapisane od nowa w nowym miejscu zamiast zniknąć jako „usunięte gdzie indziej”.
  if (settings.sharedLayout !== 2) {
    for (const svc of services.value) delete svc.shared
    settings.sharedLayout = 2
  }
  selectedId.value = visibleItems.value[0]?.id ?? null
  loaded.value = true

  watch(items, () => saveSoon('library'), { deep: true })
  watch(songs, () => { saveSoon('songs'); songsChanged() }, { deep: true })
  watch(services, () => { saveSoon('services'); pushSoon() }, { deep: true })
  // Komputery połączone dotąd z Dyskiem Google (albo folderem) przechodzą na bazę danych — tam są teraz nabożeństwa i pieśni.
  if (cloud && settings.sharedDir !== BAZA) connectSharedDir(BAZA)
  refreshAccess()
  findSharedDir()
  watch(() => settings.sharedDir, async dir => {
    sharedAccount.value = null
    syncShared()
    const account = dir === BAZA ? null : dir ? await api.sharedAccount(dir) : null
    if (settings.sharedDir === dir) sharedAccount.value = account
  }, { immediate: true })
  setInterval(() => { lastSync = Date.now(); syncShared() }, SYNC_EVERY)
  // Powrót do okna: synchronizacja, a bez połączonego folderu — ponowne szukanie go (np. po dodaniu skrótu).
  window.addEventListener('focus', () => (settings.sharedDir ? syncIfStale() : findSharedDir()))
  watch(settings, () => saveSoon('settings'), { deep: true })
  watch(() => settings.remote, async on => {
    const res = await api.setRemote(on, settings.remoteToken)
    remoteUrl.value = res.url || ''
    if (res.error) { notice.value = 'Pilot: ' + res.error; settings.remote = false }
  }, { immediate: true })
}

// Każda zmiana tego, co jest „na żywo”, od razu trafia na rzutnik.
const livePayload = computed(() => {
  if (!liveView.value) return null
  const { missing, ...rest } = liveView.value
  return JSON.stringify({ ...rest, nonce: liveNonce.value, startAt: liveStart.value, startStep: liveStep.value })
})
// Podpinane dopiero w init(): ten moduł ładuje też okno rzutnika, a ono nie może nic wysyłać.
function wire() {
  const send = json => api.show(json ? { ...JSON.parse(json), volume: volume.value } : null)
  watch(livePayload, json => { if (!frozen.value) send(json) })
  watch(frozen, on => {
    frozenAt.value = on ? { id: liveId.value, index: songIndex.value, step: video.value.step || 0 } : null
    api.videoCmd({ type: 'freeze', value: on })
    if (!on) send(livePayload.value) // po odmrożeniu rzutnik dogania to, co zmieniło się w międzyczasie
  })
  watch(hidden, on => api.videoCmd({ type: 'blank', value: on }))
  watch(liveId, id => { if (!id) hidden.value = frozen.value = false })
  watch([liveId, liveNonce], () => { video.value = { time: 0, duration: 0, paused: true, step: liveStep.value } })
  watch(selectedId, () => { previewIndex.value = 0; confirmId.value = null; loopStep.value = 0; loopPlaying.value = false })
  watch(volume, v => api.videoCmd({ type: 'volume', value: v }))
  watch(() => (liveItem.value?.type === 'scene' ? liveItem.value.volume : null), v => { if (v != null) volume.value = v })
  watch(() => {
    const it = liveItem.value
    if (!it) return 'Nic nie jest wyświetlane'
    if (hidden.value) return 'Ukryte: ' + label(it)
    return label(it) + (it.type === 'song' ? ` — ${songIndex.value + 1} / ${verses(it).length}` : '')
  }, title => api.remoteState({ title }), { immediate: true })
}
