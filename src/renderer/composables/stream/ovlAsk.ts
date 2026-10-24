// Potwierdzenie przed wysłaniem nakładki na wizję (pasek mówcy, modlitwa, baner, napis na cały kadr, „PIP na wizję”):
// pierwsze kliknięcie pyta, drugie („Tak, na wizję”) wysyła. Bez odpowiedzi pytanie znika po 8 s.
import { ref } from 'vue'
import { showMediaOverlay } from '@/services/studio'
import { label } from '@/stores'
import type { LibraryItem } from '@/types'

export const ovlAsk = ref<{ what: string, run: () => void } | null>(null)
let timer = 0
export function confirmLive(what: string, run: () => void) {
  clearTimeout(timer)
  ovlAsk.value = { what, run }
  timer = window.setTimeout(() => { ovlAsk.value = null }, 8000)
}
export function answerLive(yes: boolean) {
  const a = ovlAsk.value
  ovlAsk.value = null; clearTimeout(timer)
  if (yes) a?.run()
}
// materiał jako nakładka: napis — na cały kadr, od razu na wizję (po potwierdzeniu); reszta — PIP na podgląd
export function overlayItem(it: LibraryItem) {
  if (it.type === 'text') confirmLive('napis „' + label(it) + '” na całym kadrze', () => showMediaOverlay(it.id, true))
  else showMediaOverlay(it.id)
}
