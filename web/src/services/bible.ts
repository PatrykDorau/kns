// Księgi Biblii i odnośniki w stylu „J 3,16–21” — do statystyk kazań (kopia części src/renderer/services/bible.ts aplikacji na komputer).
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
