// Skróty klawiszowe pulpitu (Studio): realizator nie musi celować myszką w czasie nabożeństwa.
//   F1–F6   — sceny: Kamera, Rzutnik, Odliczanie, Materiał, Życie kościoła, Koniec (tylko na podgląd)
//   N       — napisy pieśni wł./wył. (od razu na wizji)
//   1, 2, 3 — sygnały dla kamerzysty (osobno, w StreamPanel)
// „Na wizję” celowo bez skrótu — tylko przyciskiem (przypadkowe naciśnięcie klawisza nie zmieni obrazu u widzów).
// Nie działają przy pisaniu w polach ani z Ctrl/Alt (te zostają dla systemu).
import { onBeforeUnmount, onMounted } from 'vue'
import { SCENES, setScene, toggleLyrics } from '@/services/studio'

export const SCENE_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']
export const KEY_HELP: [string, string][] = [['F1–F6', 'sceny na podgląd'], ['N', 'napisy pieśni'], ['1 2 3', 'sygnały dla kamerzysty']]

export function useDeskKeys(enabled: () => boolean) {
  function onKey(e: KeyboardEvent) {
    if (!enabled() || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return
    const t = e.target as HTMLElement
    if (t?.closest?.('input, textarea, select, [contenteditable=true]')) return
    const scene = SCENE_KEYS.indexOf(e.key)
    if (scene >= 0 && SCENES[scene]) { e.preventDefault(); setScene(SCENES[scene][0]); return }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleLyrics() }
  }
  onMounted(() => addEventListener('keydown', onKey))
  onBeforeUnmount(() => removeEventListener('keydown', onKey))
}
