import { ask } from '@/utils/ask'
// Nadawanie z aplikacji (bez OBS) na YouTube: start (wybrana albo nowa transmisja, przepięcie na stały klucz),
// ręczne „na żywo”, gdy YouTube zobaczy obraz, koniec; zmiana dźwięku w trakcie.
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { api, cameraLock, settings } from '@/stores'
import { refeedLyrics } from '@/services/lyricsFeed'
import { requestKeyFrame, setFps, startEncoding, stopEncoding, studio } from '@/services/studio'
import type { StreamState, YtBroadcast, Service } from '@/types'
import { ytDescription, type YouTube } from './useYouTube'
import type { StreamDevices } from './useStreamDevices'

export function useBroadcast(service: Ref<Service | null>, youtube: YouTube, dev: StreamDevices) {
  const { yt, loadYt, ytDo, chosen, chosenId, newTitle, privacy, upcoming } = youtube
  const live = ref<StreamState>({ running: false, starting: false })
  const liveOn = computed(() => live.value.running || live.value.starting)
  const liveError = ref('')
  const liveBroadcast = ref<YtBroadcast | null>(null) // transmisja, którą nadajemy (do ręcznego „na żywo” i tytułu w trakcie)

  // przepływność: wybrana albo automatyczna według jakości i klatek
  const hiFps = computed(() => +settings.streamFps > 30)
  const autoKbps = computed(() => (settings.streamQuality === '720' ? (hiFps.value ? 5000 : 3500) : (hiFps.value ? 9000 : 6800)))
  const kbps = computed(() => +settings.streamKbps || autoKbps.value)

  async function goLive() {
    liveError.value = ''
    if (!yt.value.stream) await loadYt()
    if (!yt.value.stream) { liveError.value = 'Nie mam klucza transmisji z YouTube — kliknij odśwież albo połącz kanał ponownie.'; return }
    let b = chosen.value
    if (b && b.streamId !== yt.value.stream.id) {
      // transmisja z YouTube Studio pod innym kluczem — przepinamy ją na stały klucz aplikacji
      const res = await ytDo(() => api.ytBind(b.id))
      if (!res || res.error) return
    }
    if (!b) {
      const svc = service.value
      const res = await ytDo(() => api.ytCreate({ title: newTitle.value, description: svc ? ytDescription(svc) : '', start: new Date(Date.now() + 60000).toISOString(), privacy: privacy.value }))
      if (!res || res.error) return
      b = res
      chosenId.value = res.id
    }
    liveBroadcast.value = b
    if (dev.engine.value === 'studio') {
      // studio: obraz składa i koduje aplikacja (karta graficzna), FFmpeg tylko wysyła
      setFps(settings.streamFps)
      studio.bitrate = kbps.value * 1000
      const res = await api.streamStartStudio({ url: yt.value.stream.url, key: yt.value.stream.key, fps: settings.streamFps, kbps: kbps.value })
      if (res?.error) { liveError.value = res.error; return }
      await startEncoding()
      watchGoLive()
      return
    }
    cameraLock.value = true // podgląd kamer w Stream oddaje obraz z ATEM
    await new Promise(r => setTimeout(r, 800))
    const res = await api.streamStart({ url: yt.value.stream.url, key: yt.value.stream.key, video: settings.streamVideo, audio: settings.streamAudio, quality: settings.streamQuality, fps: settings.streamFps, kbps: +settings.streamKbps || 0 })
    if (res?.error) { liveError.value = res.error; cameraLock.value = false; return }
    refeedLyrics() // napisy od pierwszej klatki
    watchGoLive()
  }
  // Transmisja bez automatycznego startu (np. zaplanowana w YouTube Studio): gdy YouTube zobaczy obraz — „na żywo”.
  let goLiveTimer = 0
  function watchGoLive() {
    clearInterval(goLiveTimer)
    let tries = 0
    goLiveTimer = window.setInterval(async () => {
      if (!liveOn.value || ++tries > 40) { clearInterval(goLiveTimer); return }
      await loadYt()
      const b = upcoming.value.find(x => x.id === liveBroadcast.value?.id)
      if (!b || b.status === 'live') { if (b?.status === 'live') clearInterval(goLiveTimer); return }
      if (yt.value.stream?.status === 'active' && !b.autoStart && ['ready', 'created', 'testing'].includes(b.status)) {
        const res = await api.ytGoLive(b.id)
        if (res?.error) liveError.value = 'YouTube: ' + res.error
        else clearInterval(goLiveTimer)
      }
    }, 6000)
  }
  async function stopLive() {
    if (!(await ask('Zakończyć transmisję? Na YouTube zakończy się sama po chwili od zatrzymania obrazu.'))) return
    stopEncoding()
    live.value = await api.streamStop()
    cameraLock.value = false
    setTimeout(loadYt, 4000)
  }
  // Tryb prosty: dźwięk otwiera FFmpeg — zmiana w trakcie to restart nadawania na 1–2 s.
  async function switchSimpleAudio(e: Event) {
    const pick = e.target as HTMLSelectElement, v = pick.value
    if (live.value.running && !(await ask('W trybie prostym zmiana dźwięku przerywa nadawanie na 1–2 sekundy. Zmienić?'))) { pick.value = settings.streamAudio; return }
    settings.streamAudio = v
    if (liveOn.value) await api.streamAudio?.(v)
  }

  let offLive: (() => void) | null = null, offKey: (() => void) | null = null
  onMounted(async () => {
    offLive = api.onStreamState?.(x => { live.value = x })
    const ls = await api.streamState?.()
    if (ls) { live.value = ls; if (ls.running || ls.starting) cameraLock.value = true }
    offKey = api.onStudioNeedKey?.(() => requestKeyFrame())
  })
  // goLiveTimer zostaje: transmisja trwa także po wyjściu z ekranu Stream
  onBeforeUnmount(() => { offLive?.(); offKey?.() })

  return { live, liveOn, liveError, liveBroadcast, autoKbps, kbps, goLive, stopLive, switchSimpleAudio }
}
export type Broadcast = ReturnType<typeof useBroadcast>
