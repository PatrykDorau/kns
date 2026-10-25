// Potwierdzenie przed wysłaniem nakładki na wizję (pasek mówcy, modlitwa, baner, napis na cały kadr, „PIP na wizję”):
// pierwsze kliknięcie pokazuje nakładkę na podglądzie (z ustawieniami) i pyta, drugie („Tak, na wizję”) wysyła.
// Pytanie o nakładkę czeka, aż odpowiesz (można ją w tym czasie dopasować); „Nie” zdejmuje ją z podglądu.
// Pytanie o PIP znika samo po 8 s.
import { ref } from 'vue'
import { clearPreviewMedia, showMediaOverlay } from '@/services/studio'
import { label } from '@/stores'
import type { LibraryItem } from '@/types'

export const ovlAsk = ref<{ what: string, run: () => void, cancel?: () => void } | null>(null)
let timer = 0
export function confirmLive(what: string, run: () => void, cancel?: () => void) {
  clearTimeout(timer)
  ovlAsk.value?.cancel?.() // poprzednie pytanie bez odpowiedzi — jego nakładka schodzi z podglądu
  ovlAsk.value = { what, run, cancel }
  if (!cancel) timer = window.setTimeout(() => { ovlAsk.value = null }, 8000)
}
export function answerLive(yes: boolean) {
  const a = ovlAsk.value
  ovlAsk.value = null; clearTimeout(timer)
  if (yes) a?.run(); else a?.cancel?.()
}
// materiał jako nakładka: napis — na cały kadr, od razu na wizję (po potwierdzeniu); reszta — PIP na podgląd
export function overlayItem(it: LibraryItem) {
  if (it.type === 'text') { showMediaOverlay(it.id); confirmLive('napis „' + label(it) + '” na całym kadrze', () => showMediaOverlay(it.id, true), clearPreviewMedia) }
  else showMediaOverlay(it.id)
}
