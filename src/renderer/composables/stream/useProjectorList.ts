// Rzutnik na innym komputerze: wybór z listy (komputery z rzutnikiem same się zgłaszają w bazie) zamiast
// wklejania adresu. Lista odświeża się co minutę, gdy rzutnik jest „na innym laptopie”.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { loadProjectors, settings } from '@/stores'
import { lyricsKey } from '@/services/lyricsFeed'

export interface ProjectorLink {
  id: string
  name: string
  key: string
  screen: boolean
  updated: string
}

export const ago = (t: string) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 2 ? 'teraz' : m < 60 ? m + ' min temu' : m < 1440 ? Math.round(m / 60) + ' godz. temu' : Math.round(m / 1440) + ' dni temu' }

export function useProjectorList() {
  const projectors = ref<ProjectorLink[]>([]), manualKey = ref(false)
  // inne komputery najpierw; ten komputer na końcu (test „zdalnego” przesyłania na jednym komputerze)
  const otherProjectors = computed(() => [...projectors.value.filter(p => p.id !== settings.deviceId), ...projectors.value.filter(p => p.id === settings.deviceId)])
  // rzutnik wybrany na liście ('' — żaden z widocznych)
  const pickedProjector = computed(() => (otherProjectors.value.some(p => p.id === settings.streamProjector) ? settings.streamProjector : ''))

  function pickProjector(id: string) {
    const p = otherProjectors.value.find(x => x.id === id)
    settings.streamProjector = id
    if (p) { settings.streamLyricsKey = p.key; manualKey.value = false }
  }
  async function refreshProjectors() {
    const res = await loadProjectors()
    if (!Array.isArray(res)) return
    projectors.value = res
    const list = otherProjectors.value
    const chosen = list.find(p => p.id === settings.streamProjector)
    if (chosen) { if (lyricsKey.value !== chosen.key) settings.streamLyricsKey = chosen.key } // klucz zmieniony na rzutniku („Nowy klucz”)
    else if (list.length && !list.some(p => p.key === lyricsKey.value) && list[0].id !== settings.deviceId) pickProjector(list[0].id) // najświeższy (inny komputer)
  }

  let timer = 0
  watch(() => settings.streamLyrics, mode => { clearInterval(timer); if (mode === 'remote') { refreshProjectors(); timer = window.setInterval(refreshProjectors, 60000) } }, { immediate: true })
  onBeforeUnmount(() => clearInterval(timer))

  return { projectors, manualKey, otherProjectors, pickedProjector, pickProjector, refreshProjectors }
}
