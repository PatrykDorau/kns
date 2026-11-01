// Akordy pieśni: { "treść linijki": { "pozycja": "Am" } }. Przypisane do treści linijki, a nie do jej numeru:
// tekst pieśni (wspólny z rzutnikiem) zostaje czysty, powtórzony refren ma akordy od razu, a zmiana linijki gubi tylko jej akordy.
export type Chords = Record<string, Record<string, string>>

export const lineKey = (line: string) => line.trim()

// słowa linijki z akordem nad każdym; akord zawsze stoi przy początku słowa
export function tokens(line: string, marks: Record<string, string> = {}) {
  const key = lineKey(line), out: { text: string, pos: number, chord: string }[] = []
  for (const m of key.matchAll(/\S+/g)) {
    const end = m.index + m[0].length
    const hit = Object.keys(marks).map(Number).sort((a, b) => a - b).find(p => p >= m.index && p < end)
    out.push({ text: m[0], pos: m.index, chord: hit === undefined ? '' : marks[hit] })
  }
  return out
}
export function setChord(chords: Chords, line: string, pos: number, chord: string) {
  const key = lineKey(line), marks = { ...(chords[key] || {}) }
  if (chord) marks[pos] = chord; else delete marks[pos]
  if (Object.keys(marks).length) chords[key] = marks; else delete chords[key]
}
// od najczęstszego — do szybkiego wyboru
export function usedChords(chords: Chords) {
  const n = new Map<string, number>()
  for (const marks of Object.values(chords || {})) for (const c of Object.values(marks)) n.set(c, (n.get(c) || 0) + 1)
  return [...n.keys()].sort((a, b) => n.get(b) - n.get(a))
}
// przed zapisem: bez akordów linijek, których już nie ma w tekście
export function pruneChords(chords: Chords, text: string): Chords {
  const lines = new Set(String(text || '').split('\n').map(l => lineKey(l.replace(/^\[[^\]\s]{1,3}\][ \t]*/, ''))))
  return Object.fromEntries(Object.entries(chords || {}).filter(([k]) => lines.has(k)))
}
