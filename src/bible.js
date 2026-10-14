// Biblia na rzutniku: import pliku Biblii (OpenSong albo Zefania XML), rozpoznawanie odnośników
// w stylu „J 3,16–21”, „1 Kor 13,4-7”, „Ps 23” i dzielenie fragmentu na slajdy.

// 66 ksiąg w kolejności kanonu protestanckiego: skrót (jak w Biblii Tysiąclecia) i inne nazwy.
export const BOOKS = [
  ['Rdz', 'rodzaju', 'genesis', 'gen', '1 mojżeszowa', '1moj'], ['Wj', 'wyjścia', 'exodus', 'exo', '2 mojżeszowa', '2moj'], ['Kpł', 'kapłańska', 'leviticus', 'lev', '3 mojżeszowa', '3moj'],
  ['Lb', 'liczb', 'numeri', 'numbers', 'num', '4 mojżeszowa', '4moj'], ['Pwt', 'powtórzonego prawa', 'deuteronomium', 'deuteronomy', 'deu', '5 mojżeszowa', '5moj'],
  ['Joz', 'jozuego', 'joshua', 'jos'], ['Sdz', 'sędziów', 'judges', 'jdg'], ['Rt', 'rut', 'ruth'], ['1 Sm', '1 samuela', '1 samuel', '1sam'], ['2 Sm', '2 samuela', '2 samuel', '2sam'],
  ['1 Krl', '1 królewska', '1 kings', '1kgs', '1 król'], ['2 Krl', '2 królewska', '2 kings', '2kgs', '2 król'], ['1 Krn', '1 kronik', '1 chronicles', '1chr'], ['2 Krn', '2 kronik', '2 chronicles', '2chr'],
  ['Ezd', 'ezdrasza', 'ezra'], ['Ne', 'nehemiasza', 'nehemiah', 'neh'], ['Est', 'estery', 'esther'], ['Hi', 'hioba', 'job', 'joba', 'ijoba'], ['Ps', 'psalm', 'psalmów', 'psalmy', 'psalms'],
  ['Prz', 'przysłów', 'proverbs', 'prov', 'przypowieści salomona', 'przyp'], ['Koh', 'koheleta', 'kaznodziei', 'ecclesiastes', 'eccl', 'kazn'], ['Pnp', 'pieśń nad pieśniami', 'pieśni nad pieśniami', 'song of songs', 'song of solomon', 'song'],
  ['Iz', 'izajasza', 'isaiah', 'isa'], ['Jr', 'jeremiasza', 'jeremiah', 'jer'], ['Lm', 'lamentacje', 'treny', 'lamentations', 'lam'], ['Ez', 'ezechiela', 'ezekiel', 'ezek'],
  ['Dn', 'daniela', 'daniel', 'dan'], ['Oz', 'ozeasza', 'hosea', 'hos'], ['Jl', 'joela', 'joel'], ['Am', 'amosa', 'amos'], ['Ab', 'abdiasza', 'obadiah', 'obad'], ['Jon', 'jonasza', 'jonah'],
  ['Mi', 'micheasza', 'micah', 'mic'], ['Na', 'nahuma', 'nahum', 'nah'], ['Ha', 'habakuka', 'habakkuk', 'hab'], ['So', 'sofoniasza', 'zephaniah', 'zeph'], ['Ag', 'aggeusza', 'haggai', 'hag'],
  ['Za', 'zachariasza', 'zechariah', 'zech'], ['Ml', 'malachiasza', 'malachi', 'mal'],
  ['Mt', 'mateusza', 'matthew', 'matt', 'mat'], ['Mk', 'marka', 'mark', 'mar'], ['Łk', 'łukasza', 'luke', 'luk'], ['J', 'jana', 'john', 'jan'], ['Dz', 'dzieje apostolskie', 'dzieje', 'acts'],
  ['Rz', 'rzymian', 'romans', 'rom'], ['1 Kor', '1 koryntian', '1 corinthians', '1cor'], ['2 Kor', '2 koryntian', '2 corinthians', '2cor'], ['Ga', 'galacjan', 'galatians', 'gal'],
  ['Ef', 'efezjan', 'ephesians', 'eph'], ['Flp', 'filipian', 'philippians', 'phil'], ['Kol', 'kolosan', 'colossians', 'col'], ['1 Tes', '1 tesaloniczan', '1 thessalonians', '1thess'],
  ['2 Tes', '2 tesaloniczan', '2 thessalonians', '2thess'], ['1 Tm', '1 tymoteusza', '1 timothy', '1tim'], ['2 Tm', '2 tymoteusza', '2 timothy', '2tim'], ['Tt', 'tytusa', 'titus', 'tyt'],
  ['Flm', 'filemona', 'philemon', 'phlm'], ['Hbr', 'hebrajczyków', 'hebrews', 'heb'], ['Jk', 'jakuba', 'james', 'jas', 'jak'], ['1 P', '1 piotra', '1 peter', '1pet', '1 pt'],
  ['2 P', '2 piotra', '2 peter', '2pet', '2 pt'], ['1 J', '1 jana', '1 john', '1jn'], ['2 J', '2 jana', '2 john', '2jn'], ['3 J', '3 jana', '3 john', '3jn'], ['Jud', 'judy', 'jude'],
  ['Ap', 'apokalipsa', 'objawienie', 'objawienia', 'revelation', 'rev', 'obj'],
]

export const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '')
const ALIASES = BOOKS.map(names => names.map(plain))

// Pełna nazwa księgi z pliku („1 Księga Królewska”, „Ewangelia wg św. Jana”) → numer 0–65.
// Cyfra na początku musi się zgadzać, a z pasujących nazw wygrywa najdłuższa.
function matchName(name) {
  const n = plain(name), digit = /^\d/.test(n) ? n[0] : '', core = digit ? n.slice(1) : n
  let best = -1, len = 0
  ALIASES.forEach((list, i) => {
    for (const a of list) {
      const ad = /^\d/.test(a) ? a[0] : '', ac = ad ? a.slice(1) : a
      if (ad !== digit || ac.length < 3 || !core.includes(ac)) continue
      if (ac.length > len) { best = i; len = ac.length }
    }
  })
  return best
}

/* ---------- import ---------- */
// Zwraca { name, books: [{ name, index (0–65 albo -1), chapters: [[werset 1, werset 2…], …] }] }.
export function parseBibleXml(xml, fileName = 'Biblia') {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('To nie jest poprawny plik XML.')
  const zefania = doc.querySelector('XMLBIBLE, xmlbible')
  const bookEls = zefania ? [...doc.querySelectorAll('BIBLEBOOK')] : [...doc.querySelectorAll('bible > b')]
  if (!bookEls.length) throw new Error('W pliku nie ma ksiąg — obsługiwane są Biblie z OpenSong i w formacie Zefania XML.')
  const books = bookEls.map((b, i) => {
    const name = (zefania ? b.getAttribute('bname') || b.getAttribute('bsname') : b.getAttribute('n')) || `Księga ${i + 1}`
    const chapters = []
    for (const c of zefania ? b.querySelectorAll('CHAPTER') : b.querySelectorAll(':scope > c')) {
      const cn = +(zefania ? c.getAttribute('cnumber') : c.getAttribute('n')) || chapters.length + 1
      const verses = []
      for (const v of zefania ? c.querySelectorAll('VERS') : c.querySelectorAll(':scope > v')) {
        const vn = +(zefania ? v.getAttribute('vnumber') : v.getAttribute('n')) || verses.length + 1
        verses[vn - 1] = v.textContent.replace(/\s+/g, ' ').trim()
      }
      chapters[cn - 1] = verses
    }
    // Zefania numeruje księgi 1–66 jak kanon protestancki; inaczej — po nazwie.
    const bnumber = zefania ? +b.getAttribute('bnumber') : 0
    return { name, index: bnumber >= 1 && bnumber <= 66 ? bnumber - 1 : -1, chapters }
  })
  // Księgi bez numeru: najpierw po nazwie, a gdy plik ma dokładnie 66 ksiąg — po kolejności.
  for (const [i, b] of books.entries()) {
    if (b.index >= 0) continue
    const hit = matchName(b.name)
    b.index = hit >= 0 && !books.some(x => x.index === hit) ? hit : books.length === 66 ? i : -1
  }
  const title = doc.documentElement.getAttribute('biblename') || doc.querySelector('INFORMATION > title, title')?.textContent || fileName.replace(/\.[^.]+$/, '')
  return { name: title.trim(), books }
}

/* ---------- odnośniki ---------- */
function findBook(text) {
  const n = plain(text)
  if (!n) return -1
  // Najpierw dokładne skróty („J”, „1 J”), potem początki nazw („Jan”, „Rzym”).
  let hit = ALIASES.findIndex(list => list[0] === n)
  if (hit < 0) hit = ALIASES.findIndex(list => list.some(a => a === n))
  if (hit < 0) hit = ALIASES.findIndex(list => list.slice(1).some(a => a.startsWith(n) && n.length >= 3))
  return hit
}
// „J 3,16–21” → { book: 42, label, parts: [{ chapter, from, to }] }; obsługuje też „J 3,16-4,2”, „Ps 23”, „J 3:16”, „Rz 8,28.31-32”.
export function parseRef(ref) {
  const m = /^\s*((?:[1-3]\s*)?[\p{L}][\p{L}\s.]*?)\s*(\d+)(.*)$/u.exec(String(ref || ''))
  if (!m) return null
  const book = findBook(m[1])
  if (book < 0) return null
  const chapter = +m[2]
  const rest = m[3].replace(/[–—]/g, '-').replace(/\s+/g, '')
  const parts = []
  if (!rest) parts.push({ chapter, from: 1, to: Infinity })
  else {
    const body = rest.replace(/^[,:]/, '')
    let ch = chapter
    for (const piece of body.split(/[.;]/).filter(Boolean)) {
      let r
      if ((r = /^(\d+)-(\d+)[,:](\d+)$/.exec(piece))) { parts.push({ chapter: ch, from: +r[1], to: Infinity }, { chapter: +r[2], from: 1, to: +r[3] }); ch = +r[2] } // 16-4,2
      else if ((r = /^(\d+)[,:](\d+)(?:-(\d+))?$/.exec(piece))) { ch = +r[1]; parts.push({ chapter: ch, from: +r[2], to: +(r[3] || r[2]) }) } // 4,2 albo 4,2-5
      else if ((r = /^(\d+)(?:-(\d+))?$/.exec(piece))) parts.push({ chapter: ch, from: +r[1], to: +(r[2] || r[1]) })
      else return null
    }
  }
  return { book, parts }
}

// Wersety fragmentu: [{ chapter, verse, text }]; pusta lista, gdy w tej Biblii czegoś nie ma.
export function passage(bible, ref) {
  const r = typeof ref === 'string' ? parseRef(ref) : ref
  if (!r || !bible) return []
  const b = bible.books.find(x => x.index === r.book)
  if (!b) return []
  const out = []
  for (const p of r.parts) {
    const verses = b.chapters[p.chapter - 1] || []
    for (let v = p.from; v <= Math.min(p.to, verses.length); v++) if (verses[v - 1]) out.push({ chapter: p.chapter, verse: v, text: verses[v - 1] })
  }
  return out
}

// Skrót odnośnika do podpisu slajdu, np. „J 3,16–17”.
export function refLabel(book, verses) {
  if (!verses.length) return BOOKS[book][0]
  const a = verses[0], z = verses.at(-1)
  const tail = a.chapter === z.chapter ? (a.verse === z.verse ? `${a.verse}` : `${a.verse}–${z.verse}`) : `${a.verse}–${z.chapter},${z.verse}`
  return `${BOOKS[book][0]} ${a.chapter},${tail}`
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = n => String(n).split('').map(d => SUP[d]).join('')
// Slajdy: po kilka wersetów (do perSlide i ok. 320 znaków), z małymi numerami wersetów i podpisem na dole.
export function toSlides(book, verses, perSlide = 2) {
  const slides = []
  let group = []
  const flush = () => { if (group.length) slides.push({ verses: group, text: group.map(v => sup(v.verse) + ' ' + v.text).join(' ') + '\n\n' + refLabel(book, group) }); group = [] }
  for (const v of verses) {
    const size = group.reduce((n, x) => n + x.text.length, 0)
    if (group.length >= perSlide || (group.length && size + v.text.length > 320)) flush()
    group.push(v)
  }
  flush()
  return slides
}
