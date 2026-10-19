// Import pieśni z popularnych formatów. Każda funkcja zwraca listę { number, title, text },
// gdzie w „text” zwrotki są rozdzielone pustą linią.

const clean = text => text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()

// „123. Tytuł” albo „123 - Tytuł” → numer i tytuł osobno.
function song(title, text, number = '') {
  title = String(title || '').trim()
  const m = /^(\d{1,4})\s*[.)\-–:]\s*(.+)$/.exec(title)
  if (m && !number) { number = m[1]; title = m[2] }
  return { number: String(number || '').trim(), title, text: clean(String(text || '')) }
}

/* ---------- zwykły tekst ---------- */
const SEPARATOR = /^[ \t]*(?:={3,}|-{3,}|#{3,}|\*{3,})[ \t]*$/m

function fromText(fileTitle, content) {
  content = content.replace(/\r\n?/g, '\n')
  // Jeden plik z wieloma pieśniami rozdzielonymi linią ===, --- albo ###.
  if (SEPARATOR.test(content)) {
    return content.split(new RegExp(SEPARATOR.source, 'm')).map(part => {
      const lines = part.trim().split('\n')
      return song(lines[0], lines.slice(1).join('\n'))
    })
  }
  // Jeden plik = jedna pieśń; tytułem jest nazwa pliku.
  const lines = content.trim().split('\n')
  const sameAsTitle = lines[0]?.trim().toLowerCase() === fileTitle.toLowerCase()
  return [song(fileTitle, sameAsTitle ? lines.slice(1).join('\n') : content)]
}

/* ---------- ChordPro ---------- */
function fromChordPro(fileTitle, content) {
  let title = fileTitle
  const lines = []
  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    const directive = /^\s*\{\s*([^:}]+)\s*:?\s*([^}]*)\}\s*$/.exec(line)
    if (directive) {
      if (/^(title|t)$/i.test(directive[1])) title = directive[2]
      else if (/^(soc|eoc|sov|eov|start_of_|end_of_)/i.test(directive[1])) lines.push('')
      continue
    }
    if (line.trim().startsWith('#')) continue
    lines.push(line.replace(/\[[^\]]*\]/g, '').replace(/ {2,}/g, ' '))
  }
  return [song(title, lines.join('\n'))]
}

/* ---------- XML: OpenLyrics (OpenLP) i OpenSong ---------- */
function fromXml(fileTitle, content) {
  const doc = new DOMParser().parseFromString(content, 'application/xml')
  const root = doc.documentElement
  if (doc.querySelector('parsererror') || root.localName !== 'song') return []
  const first = name => [...root.getElementsByTagName('*')].find(el => el.localName === name)

  const verses = [...root.getElementsByTagName('*')].filter(el => el.localName === 'verse')
  if (verses.length) {
    // OpenLyrics: <verse><lines>linia<br/>linia</lines></verse>
    const text = verses.map(verse => [...verse.getElementsByTagName('*')].filter(el => el.localName === 'lines').map(lines => {
      const copy = lines.cloneNode(true) as Element
      for (const el of [...copy.getElementsByTagName('*')]) {
        if (el.localName === 'br') el.replaceWith('\n')
        else if (el.localName === 'chord' || el.localName === 'comment') el.remove()
      }
      return copy.textContent.split('\n').map(l => l.trim()).join('\n').trim()
    }).join('\n')).join('\n\n')
    return [song(first('title')?.textContent || fileTitle, text, first('songbook')?.getAttribute('entry') || '')]
  }

  // OpenSong: [V1] zaczyna zwrotkę, linie z kropką to akordy, ze średnikiem — komentarze.
  const lyrics = first('lyrics')?.textContent
  if (lyrics == null) return []
  // Linie zaczynające się cyfrą to kolejne zwrotki zapisane pod wspólnymi akordami
  // („1Pierwsza…”, „2Druga…”) — rozdzielamy je na osobne części V1, V2…
  const sections = new Map()
  const add = (label, line) => { if (!sections.has(label)) sections.set(label, []); sections.get(label).push(line) }
  let label = 'V1'
  for (const raw of lyrics.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.startsWith('[')) { label = raw.replace(/[[\]]/g, '').trim().toUpperCase() || 'V1'; continue }
    if (raw.startsWith('.') || raw.startsWith(';')) continue
    if (raw.trim() === '---') { add(label, ''); continue } // „---” = nowy slajd w tej samej części
    const numbered = /^(\d)(.*)$/.exec(raw)
    const text = (numbered ? numbered[2] : raw).replace(/\|\|/g, '\n\n').replace(/[_|]/g, '').replace(/[ \t]{2,}/g, ' ')
    const lines = text.split('\n').map(l => l.trim())
    if (!lines.join('')) continue
    for (const l of lines) add(numbered ? label.replace(/\d+$/, '') + numbered[1] : label, l)
  }
  // <presentation> podaje kolejność wyświetlania, np. „V1 C V2 C”.
  const wanted = (first('presentation')?.textContent || '').toUpperCase().split(/\s+/).filter(l => sections.has(l))
  const order = wanted.length ? wanted : [...sections.keys()]
  const text = order.map(l => sections.get(l).join('\n')).join('\n\n')
  return [song(first('title')?.textContent || fileTitle, text, first('hymn_number')?.textContent || '')]
}

/* ---------- JSON (także kopia z tej aplikacji) ---------- */
function fromJson(content) {
  const data = JSON.parse(content)
  const list = Array.isArray(data) ? data : data.songs || data.piesni || []
  return list.map(s => {
    const text = s.text ?? s.lyrics ?? s.tekst ?? (Array.isArray(s.verses) ? s.verses.map(v => (typeof v === 'string' ? v : v.text || '')).join('\n\n') : '')
    return song(s.title ?? s.tytul ?? s.name ?? '', text, s.number ?? s.numer ?? '')
  })
}

export function parseSongFile(name, content) {
  const ext = (/\.[^.]+$/.exec(name)?.[0] || '').toLowerCase()
  const fileTitle = name.replace(/\.[^.]+$/, '')
  let songs = []
  try {
    if (ext === '.json') songs = fromJson(content)
    else if (ext === '.xml' || content.trimStart().startsWith('<')) songs = fromXml(fileTitle, content)
    else if (['.pro', '.cho', '.chopro', '.crd'].includes(ext) || /^\s*\{(title|t):/im.test(content)) songs = fromChordPro(fileTitle, content)
    else songs = fromText(fileTitle, content)
  } catch { songs = [] }
  return songs.filter(s => s.title && s.text)
}
