// Skróty klawiszowe pulpitu (Studio): realizator nie musi celować myszką w czasie nabożeństwa.
//   Spacja / Enter — „Na wizję” (podgląd przechodzi na wizję)
//   F1–F6          — sceny: Kamera, Rzutnik, Odliczanie, Materiał, Życie kościoła, Koniec (na podgląd)
//   N              — napisy pieśni wł./wył. (od razu na wizji)
//   1, 2, 3        — sygnały dla kamerzysty (osobno, w StreamPanel)
// Nie działają przy pisaniu w polach ani z Ctrl/Alt (te zostają dla systemu).
import { onBeforeUnmount, onMounted } from 'vue'
import { SCENES, differs, setScene, studio, take, toggleLyrics } from '@/services/studio'

export const SCENE_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']
export const KEY_HELP: [string, string][] = [['Spacja', 'Na wizję'], ['F1–F6', 'sceny'], ['N', 'napisy pieśni'], ['1 2 3', 'sygnały dla kamerzysty']]

export function useDeskKeys(enabled: () => boolean) {
  function onKey(e: KeyboardEvent) {
    if (!enabled() || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return
    const t = e.target as HTMLElement
    if (t?.closest?.('input, textarea, select, [contenteditable=true]')) return
    const scene = SCENE_KEYS.indexOf(e.key)
    if (scene >= 0 && SCENES[scene]) { e.preventDefault(); setScene(SCENES[scene][0]); return }
    // Spacja/Enter na przycisku zostawiamy przyciskowi (to jego kliknięcie)
    if ((e.key === ' ' || e.key === 'Enter') && !t?.closest?.('button, a, [role=tab]')) {
      e.preventDefault()
      if (!studio.direct && differs()) take()
      return
    }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleLyrics() }
  }
  onMounted(() => addEventListener('keydown', onKey))
  onBeforeUnmount(() => removeEventListener('keydown', onKey))
}
