// Co widać: element biblioteki → to, co rysuje rzutnik; zaznaczenie, „na żywo”, pętle.
import { computed, ref } from 'vue'
import type { Shown } from '@/types'
import { COUNTDOWN } from './library'
import { nextServiceStart } from './services'
import { KIND, api, clamp, hidden, items, liveFrozen, liveId, previewIndex, selectedId, settings, songIndex, songs, video } from './state'

export const itemById = id => items.value.find(i => i.id === id)
export const find = (id: string | null): Shown | null => (id == null ? null : (itemById(id) || songs.value.find(s => s.id === id) || null) as Shown | null)
export const selected = computed(() => find(selectedId.value))
export const liveItem = computed(() => find(liveId.value))

// Pusta linia w tekście pieśni rozdziela zwrotki (slajdy). Slajd może zaczynać się skrótem
// w nawiasie kwadratowym, np. „[2]” albo „[R]” — ten klawisz przenosi wtedy prosto do niego.
export const SHORTCUT = /^\[([^\]\s]{1,3})\][ \t]*/
export const parsedSongs = new WeakMap()
export function parseSong(song) {
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
export const verses = (song): string[] => parseSong(song).map(v => v.text)
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
    return { ...settings.songStyle, id: it.id, type: 'text', song: true, text: all[i] || '', slideKey: i, fadeMs: settings.fadeMs }
  }
  if (it.type === 'text' && it.text?.includes(COUNTDOWN)) {
    return { ...it, fadeMs: settings.fadeMs, target: it.countMode === 'minutes' ? it.target || 0 : nextServiceStart.value || 0 }
  }
  return { ...it, fadeMs: settings.fadeMs }
}

export const selectedIndex = computed(() => (selected.value?.id === liveId.value ? songIndex.value : previewIndex.value))
export const selectedView = computed(() => view(selected.value, selectedIndex.value))
// Bieżąca zwrotka pieśni na rzutniku (pusto przy „Ukryj” i gdy nie ma pieśni) — napisy dla OBS i nadawania.
export const lyricsNow = computed(() => { const v = liveView.value; return !hidden.value && v?.type === 'text' && v.song ? v.text : '' })
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
export const slideCount = it => view(it).slides.length
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
