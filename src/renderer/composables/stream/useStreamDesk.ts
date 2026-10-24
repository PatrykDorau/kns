// Pulpit streamu jako całość: składa mniejsze części (ATEM, YouTube, nadawanie, stan, urządzenia, rzutniki, media)
// i udostępnia je komponentom pulpitu (provide/inject) — każdy bierze, czego potrzebuje: const desk = useDesk().
import { computed, inject, nextTick, onBeforeUnmount, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import { loadListen, settings } from '@/stores'
import { lyricsFeed, lyricsKey, startLyricsFeed } from '@/services/lyricsFeed'
import { remote as remoteScreen } from '@/services/screenShare'
import { SCENES, initLook, pauseIdle, setFps, setPip, studio } from '@/services/studio'
import type { Pip, Service } from '@/types'
import { useAtem } from './useAtem'
import { useBroadcast } from './useBroadcast'
import { useProjectorList } from './useProjectorList'
import { useStreamDevices } from './useStreamDevices'
import { useStreamHealth } from './useStreamHealth'
import { useStudioMedia } from './useStudioMedia'
import { useYouTube } from './useYouTube'

export const SCENE_NAME: Record<string, string> = Object.fromEntries(SCENES)
export const CORNERS = [['tl', '↖', 'Lewy górny róg'], ['tr', '↗', 'Prawy górny róg'], ['bl', '↙', 'Lewy dolny róg'], ['br', '↘', 'Prawy dolny róg']]
export type DeskTab = 'media' | 'slides' | 'music'

function createDesk(service: Ref<Service | null>) {
  const atem = useAtem()
  const youtube = useYouTube(service)
  const devices = useStreamDevices()
  const broadcast = useBroadcast(service, youtube, devices)
  const health = useStreamHealth(youtube, broadcast, devices)
  const projectors = useProjectorList()
  const media = useStudioMedia()

  /* ---------- studio: ustawienia zapamiętane między uruchomieniami ---------- */
  if (!studio.live) { initLook({ corner: settings.pipCorner || 'br', size: settings.pipSize || 'small' }); studio.direct = !!settings.studioDirect }
  if (!settings.donateInit) { if (!settings.donatePhone) settings.donatePhone = '789 571 542'; settings.donateInit = true }
  watch(() => settings.streamFps, f => setFps(f))
  // ogłoszenia na transmisji: które są w pętli i co ile sekund
  watch(() => [settings.studioHidden, settings.studioSlideSec], () => { studio.hidden = [...(settings.studioHidden || ['svc'])]; studio.slideEvery = +settings.studioSlideSec || 8 }, { immediate: true, deep: true })
  // plansza końcowa
  watch(() => [settings.studioAutoCamera, settings.donateAccount, settings.donatePhone, settings.donateName, settings.donateTitle], () => {
    studio.autoCamera = !!settings.studioAutoCamera
    Object.assign(studio.end, { account: settings.donateAccount, phone: settings.donatePhone, name: settings.donateName || 'Kościół Na Skale', title: settings.donateTitle || 'Darowizna' })
  }, { immediate: true })
  // YouTube i Spotify na planszę końcową — te same linki co „Posłuchaj” na stronie
  loadListen().then(v => { if (v && !v.error) Object.assign(studio.end, { youtube: v.youtube || v.youtubeMore || '', spotify: v.spotify || '' }) })
  onBeforeUnmount(pauseIdle)

  function pip(p: Partial<Pip>) { setPip(p); if (p.corner) settings.pipCorner = p.corner; if (p.size) settings.pipSize = p.size }

  // zakładki pod scenami: same przechodzą na tę, która pasuje do wybranej sceny
  // źródła pod scenami: przy scenie Ogłoszenia — ich pętla, przy Materiale — biblioteka; inaczej zostaje to, co było
  const deskTab = ref<DeskTab>(studio.preview.scene === 'announcements' ? 'slides' : 'media')
  watch(() => studio.preview.scene, sc => { if (sc === 'announcements') deskTab.value = 'slides'; else if (sc === 'media') deskTab.value = 'media' })

  // ikonka w zwiniętej kolumnie: rozwija kolumnę i daną sekcję
  function unrail(which: 'yt' | 'cue' | 'svc') { settings.railFolded = false; settings[({ yt: 'ytFolded', cue: 'cueFolded', svc: 'svcFolded' } as const)[which]] = false }
  function openCfg() { settings.cfgFolded = false; settings.railFolded = false; nextTick(() => document.getElementById('desk-cfg')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }

  /* ---------- napisy: z rzutnika na tym komputerze, z innego komputera albo bez ---------- */
  // Napisy podaje moduł lyricsFeed (działa też przy otwartym Rzutniku) — tu tylko stan.
  startLyricsFeed()
  const lyricsInfo = computed(() => {
    if (settings.streamLyrics === 'off') return 'wyłączone'
    if (settings.streamLyrics === 'remote' && !lyricsKey.value) return 'wklej adres napisów z komputera z rzutnikiem'
    const t = lyricsFeed.text.split('\n')[0]
    const link = settings.streamLyrics === 'remote' ? (lyricsFeed.link === 'local' ? ' (rzutnik na tym komputerze)' : lyricsFeed.link === 'connecting' ? ' · łączę ponownie…' : '') : ''
    if (settings.streamLyrics === 'remote' && !lyricsFeed.at) return (lyricsFeed.link === 'connecting' ? 'łączę z rzutnikiem…' : 'czekam na rzutnik…')
    return (t ? 'teraz: „' + t + (lyricsFeed.text.includes('\n') ? '…' : '') + '”' : 'teraz bez tekstu (brak pieśni albo „Ukryj”)') + link
  })

  /* ---------- gotowość przed startem (kliknięcie — ustawienia nadawania) ---------- */
  const readiness = computed(() => {
    const st = devices.engine.value === 'studio'
    const cam = st ? settings.studioCamera : (devices.devices.value.screens.find(x => x.value === settings.streamVideo)?.label || settings.streamVideo)
    const mic = st ? settings.studioAudio : settings.streamAudio
    const mode = settings.streamLyrics
    const proj = mode === 'remote' ? (!settings.screenRemote ? { v: 'na innym laptopie — bez obrazu', cls: '' } : remoteScreen.state === 'on' ? { v: 'obraz z laptopa dociera', cls: 'ok' } : { v: remoteScreen.step || 'czekam na laptop przy rzutniku', cls: 'wait' })
      : mode === 'local' ? { v: settings.studioLocalProjector ? 'w tej aplikacji' : 'w tej aplikacji — bez obrazu', cls: settings.studioLocalProjector ? 'ok' : '' } : { v: 'bez rzutnika', cls: '' }
    return [
      { k: 'Kamera', v: cam || 'brak — wybierz', cls: cam ? 'ok' : 'bad' },
      { k: 'Dźwięk', v: mic || 'bez dźwięku', cls: mic ? 'ok' : 'wait' },
      { k: 'Rzutnik', ...proj },
      { k: 'Napisy', v: lyricsInfo.value, cls: mode === 'off' ? '' : lyricsFeed.text || lyricsFeed.at ? 'ok' : 'wait' },
    ]
  })

  return { service, ...atem, ...youtube, ...devices, ...broadcast, ...health, ...projectors, ...media, pip, deskTab, unrail, openCfg, lyricsInfo, readiness }
}

export type Desk = ReturnType<typeof createDesk>
const DESK: InjectionKey<Desk> = Symbol('desk')

// W StreamDesk: tworzy pulpit i udostępnia go częściom.
export function provideDesk(service: Ref<Service | null>) {
  const desk = createDesk(service)
  provide(DESK, desk)
  return desk
}
// W częściach pulpitu.
export function useDesk() {
  const desk = inject(DESK)
  if (!desk) throw new Error('useDesk() poza pulpitem streamu')
  return desk
}
