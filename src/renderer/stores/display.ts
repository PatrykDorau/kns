// Rzutnik: okno wyświetlania, „Wyświetl”, ukrywanie, zamrażanie, zwrotki i slajdy.
import { computed } from 'vue'
import { serviceList, visibleItems } from './lists'
import { canGo, find, label, liveIsVideo, liveItem, parseSong, selected, selectedStep, slideCount, stepLoop, verseKey, verses, lyricsParts, streamPart, view } from './live'
import { now } from './services'
import { api, clamp, displayId, displays, frozen, frozenAt, hidden, liveFrozen, liveId, liveNonce, liveStart, liveStep, notice, output, previewIndex, previewVideo, selectedId, settings, songIndex, video, volume } from './state'

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
export let flashTimer = null
export function flash(message) {
  notice.value = message
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 3500)
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
    // napisy dla streamu w częściach: strzałka najpierw przechodzi po częściach, rzutnik zostaje na całej zwrotce
    if (song.id === liveId.value && settings.streamPartMode !== 'auto' && lyricsParts.value.length > 1) {
      if (d > 0 && streamPart.value < lyricsParts.value.length - 1) { streamPart.value++; return }
      if (d < 0 && streamPart.value > 0) { streamPart.value--; return }
    }
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
