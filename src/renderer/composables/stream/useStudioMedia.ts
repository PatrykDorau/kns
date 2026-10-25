// Media na transmisji: materiały z Biblioteki Streamu (osobnej od Rzutnika) — na cały ekran (scena „Media”)
// albo jako nakładka na kamerze/rzutniku; co jest w podglądzie i na wizji.
import { computed, ref } from 'vue'
import { TEXT_STYLE, items, pickFiles, uid } from '@/stores'
import { airMedia, mediaSlide, showMediaFull, studio } from '@/services/studio'
import { overlayItem } from './ovlAsk'
import type { LibraryItem } from '@/types'

export const mediaKind = (it: LibraryItem) => ({ image: 'Zdjęcie', video: 'Film', text: 'Napis', scene: 'Prezentacja' })[it.type] || ''
export const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0')
const itemOf = (id: string) => (id ? items.value.find(x => x.id === id) || null : null)

export function useStudioMedia() {
  const mediaList = computed(() => items.value.filter(it => it.lib === 'stream' && !it.hidden && !it.missing && ['image', 'video', 'text', 'scene'].includes(it.type)))
  const pvFull = computed(() => (studio.preview.scene === 'media' ? itemOf(studio.preview.media) : null)) // na ekran (podgląd)
  const pvOver = computed(() => (studio.preview.ovl !== 'off' && studio.preview.scene !== 'media' ? itemOf(studio.preview.omedia) : null)) // nakładka (podgląd)
  const pgOver = computed(() => (studio.program.ovl !== 'off' && studio.program.scene !== 'media' ? itemOf(studio.program.omedia) : null))
  const onAirIds = computed(() => airMedia())
  // sterowanie tym, co na wizji (film, prezentacja) — dla każdego materiału na wizji
  const airCtl = computed(() => onAirIds.value.map(id => ({ item: itemOf(id), slide: mediaSlide(id) })).filter(x => x.item && x.slide && (x.slide.type === 'video' || x.slide.deckOf)))
  const pickMedia = (it: LibraryItem) => (it.type === 'text' ? overlayItem(it) : showMediaFull(it.id))

  // dodawanie: pliki (zwraca, czy coś przybyło) albo napis — od razu jako nakładka
  async function addMediaFiles() {
    const before = new Set(items.value.map(x => x.id))
    await pickFiles(null, 'stream')
    return items.value.some(x => !before.has(x.id) && !x.hidden)
  }
  const newText = ref('') // napis w trakcie pisania (zostaje przy zmianie zakładki)
  function addMediaText() {
    const text = newText.value.trim()
    if (!text) return
    const it: LibraryItem = { ...TEXT_STYLE, id: uid(), type: 'text', name: text.split('\n')[0].slice(0, 40), text, fs: 9, valign: 'bottom', shadow: true, lib: 'stream' }
    items.value.push(it); newText.value = ''
    overlayItem(it)
  }

  return { mediaList, pvFull, pvOver, pgOver, onAirIds, airCtl, pickMedia, addMediaFiles, newText, addMediaText }
}
