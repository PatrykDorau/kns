// Biblioteka materiałów: pliki, prezentacje, Biblia, odliczanie, ogłoszenia, pętle, usuwanie i nazwy.
import { computed, ref, shallowRef } from 'vue'
import { parseBibleXml, parseRef, passage, refLabel, toSlides } from '@/services/bible'
import type { LibraryItem } from '@/types'
import { flash, hide } from './display'
import { visibleItems, visibleSongs } from './lists'
import { itemById, label, verses } from './live'
import { today } from './services'
import { TEXT_STYLE, api, busy, churchAnnouncements, churchEvents, confirmId, hidden, items, liveId, notice, renameValue, renamingId, selectedId, services, settings, songs, tab, uid } from './state'

/* ---------- pliki ---------- */
export const BUILTIN_NOTE = 'Prezentację odtworzył wbudowany czytnik — sprawdź slajdy, bo układ i kolory mogą różnić się od oryginału. Dokładną kopię daje komputer z PowerPointem lub LibreOffice albo zapis prezentacji jako PDF.'

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
      const { pdfToImages } = await import('@/services/pdf')
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

    const item = (f, hidden): LibraryItem => ({ id: uid(), type: f.type, name: f.name, path: f.path, fit: 'contain', loop: false, ...(hidden ? { hidden: true } : {}) })
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
        const deck: LibraryItem = { id: uid(), type: 'scene', name: part.name, seconds: 5, volume: 0.25, transition: 'fade', fadeMs: 350, auto: false, entries: slides.map(entry) }
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

export const fileUsed = p => items.value.some(i => i.path === p || i.bgImage === p) || settings.songStyle.bgImage === p ||
  services.value.some(s => s.files.some(f => f.path === p))
// Kasuje kopię pliku z folderu aplikacji, gdy nic już z niej nie korzysta.
export const dropFile = p => { if (p && !fileUsed(p)) api.removeFile(p) }

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
  const it: LibraryItem = { id: uid(), type: 'text', name: '', text: '', ...TEXT_STYLE }
  items.value.push(it)
  selectedId.value = it.id
}

/* ---------- Biblia ---------- */
// Plik Biblii jest wczytywany raz (zapamiętany w danych aplikacji), a fragment staje się pętlą
// slajdów tekstowych przełączanych ręcznie — tak jak prezentacja.
export const bible = shallowRef(null)
export const bibleOpen = ref(false)
export let bibleLoaded = false
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
  const slides = toSlides(r.book, verses, perSlide).map((s): LibraryItem => ({ ...TEXT_STYLE, id: uid(), type: 'text', name: refLabel(r.book, s.verses), text: s.text, fs: 9, hidden: true }))
  const deck: LibraryItem = { id: uid(), type: 'scene', name: refLabel(r.book, verses), seconds: 5, volume: 0.25, transition: 'fade', fadeMs: 350, auto: false,
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
  const it: LibraryItem = { ...TEXT_STYLE, id: uid(), type: 'text', name: 'Odliczanie', fs: 14,
    text: 'Nabożeństwo rozpocznie się za\n' + COUNTDOWN, endText: 'Zaraz zaczynamy!', countMode: 'service', minutes: 5, target: 0 }
  items.value.push(it)
  selectedId.value = it.id
}

// Ogłoszenia (z aplikacji na telefon) jako pętla slajdów przełączanych samoczynnie — np. przed nabożeństwem.
// Komunikaty rady najpierw; ogłoszenia po terminie ważności i te tylko dla rady są pomijane.
export const currentAnnouncements = computed(() => churchAnnouncements.value
  .filter(a => a.audience !== 'council' && (!a.until || a.until >= today()) && a.title)
  .sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || (b.date || 0) - (a.date || 0)))
// Grafiki zaznaczone w aplikacji „Pokaż na rzutniku”: aktualne ogłoszenia i nadchodzące wydarzenia (najbliższe najpierw).
export const projectorGraphics = computed(() => [
  ...currentAnnouncements.value.filter(a => a.projector && a.image).map(a => ({ key: 'a' + a.id, name: a.title, image: a.image, order: a.important ? '0' : '2' })),
  ...churchEvents.value.filter(e => e.projector && e.image && e.date && e.date >= today()).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .map((e, i) => ({ key: 'e' + e.id, name: e.title || 'Wydarzenie', image: e.image, order: '1' + String(i).padStart(3, '0') })),
].sort((a, b) => a.order.localeCompare(b.order)))
// Pętla ogłoszeń: grafiki (gdy w aplikacji zaznaczono „na rzutniku”), a bez grafik — ogłoszenia jako tekst.
// Grafiki są w internecie — wczytujemy je od razu, żeby w trakcie pętli były już w pamięci.
export function addAnnouncements() {
  const graphics = projectorGraphics.value
  if (graphics.length) {
    graphics.forEach(g => { const img = new Image(); img.src = g.image })
    const slides = graphics.map((g): LibraryItem => ({ id: uid(), type: 'image', name: g.name, path: g.image, fit: 'contain', loop: false, hidden: true }))
    const deck: LibraryItem = { id: uid(), type: 'scene', name: 'Ogłoszenia — grafiki', seconds: 10, volume: 0.25, transition: 'fade', fadeMs: 600, auto: true,
      entries: slides.map(it => ({ key: uid(), ref: it.id, seconds: null })) }
    items.value.push(...slides, deck)
    tab.value = 'materials'
    selectedId.value = deck.id
    return
  }
  // Na rzutniku tylko grafiki (z wszystkimi informacjami na nich) — bez slajdów z samym tekstem.
  flash('Nie ma grafik do pokazania. W ogłoszeniu albo wydarzeniu dodaj grafikę i zaznacz „Pokaż na nabożeństwie”.')
}

export function addLoop() {
  const n = items.value.filter(i => i.type === 'scene').length + 1
  const it: LibraryItem = { id: uid(), type: 'scene', name: 'Pętla ' + n, seconds: 5, volume: 0.25, transition: 'fade', fadeMs: 350, entries: [] }
  items.value.push(it)
  selectedId.value = it.id
}

export function deleteItem(it) {
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
