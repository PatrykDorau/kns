// Pulpit streamu jako całość: składa mniejsze części (ATEM, YouTube, nadawanie, stan, urządzenia, rzutniki, media)
// i udostępnia je komponentom pulpitu (provide/inject) — każdy bierze, czego potrzebuje: const desk = useDesk().
import { computed, inject, nextTick, onBeforeUnmount, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import type { PresetKind } from '@/types'
import { items, loadListen, nearestService, settings, songs } from '@/stores'
import { lyricsFeed, lyricsKey, startLyricsFeed } from '@/services/lyricsFeed'
import { remote as remoteScreen } from '@/services/screenShare'
import { SCENES, initLook, pauseIdle, setFps, setPip, studio } from '@/services/studio'
import { cardPic, speakerPic } from '@/services/studio/cards'
import type { Pip, Service } from '@/types'
import { useAtem } from './useAtem'
import { useBroadcast } from './useBroadcast'
import { useLiveChat } from './useLiveChat'
import { useProjectorList } from './useProjectorList'
import { useStreamDevices } from './useStreamDevices'
import { useStreamHealth } from './useStreamHealth'
import { useStudioMedia } from './useStudioMedia'
import { useYouTube } from './useYouTube'

export const SCENE_NAME: Record<string, string> = Object.fromEntries(SCENES)
export const CORNERS = [['tl', '↖', 'Lewy górny róg'], ['tr', '↗', 'Prawy górny róg'], ['bl', '↙', 'Lewy dolny róg'], ['br', '↘', 'Prawy dolny róg']]
export type DeskTab = 'media' | 'proj' | 'slides' | 'music'

function createDesk(service: Ref<Service | null>) {
  const atem = useAtem()
  const youtube = useYouTube(service)
  const liveChat = useLiveChat(youtube)
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

  // PIP kamera: włącz/wyłącz (wyłączenie od razu z wizji), róg i rozmiar zapamiętane na tym komputerze
  function pip(p: Partial<Pip>) { setPip(p); if (p.corner) settings.pipCorner = p.corner; if (p.size) settings.pipSize = p.size }

  // źródła pod scenami: przy Materiale — biblioteka; inaczej zostaje to, co było
  const deskTab = ref<DeskTab>('media')
  const deskMode = ref<'live' | 'prep'>('live') // Studio albo Przygotowanie (presety)
  const prepKind = ref<PresetKind>('cd')
  const prepId = ref('') // preset otwarty w Przygotowaniu
  watch(() => studio.preview.scene, sc => { if (sc === 'media') deskTab.value = 'media' })

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

  /* ---------- gotowość przed startem: bad — pytamy przy starcie, wait — do sprawdzenia, ok — gotowe, puste — nie dotyczy ---------- */
  const readiness = computed(() => {
    const st = devices.engine.value === 'studio'
    const cam = st ? settings.studioCamera : (devices.devices.value.screens.find(x => x.value === settings.streamVideo)?.label || settings.streamVideo)
    const mic = st ? settings.studioAudio : settings.streamAudio
    const mode = settings.streamLyrics, svc = service.value || nearestService.value, here = mode === 'local'
    const heard = studio.audioDb > -55, hour = (t: number) => new Date(t).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
    const lacks = svc ? [!svc.sermonTitle && 'tytuł kazania', !svc.passage && 'fragment', !svc.speaker && 'kaznodzieja'].filter(Boolean) : []
    const speaker = svc?.speaker || ''
    const noSongs = (svc?.songs || []).filter(e => !songs.value.some(x => x.id === e.songId && x.text?.trim()))
    const noFiles = (svc?.files || []).filter(f => !items.value.some(i => i.source === svc.id + ':' + f.key))
    const bible = !!svc?.passage?.trim() && !items.value.some(i => i.source === svc.id + ':bible')
    const air = youtube.chosen.value, day = air?.start?.slice(0, 10), wrongDay = !!(svc && day && day !== svc.date)
    const proj = mode === 'remote' ? (!settings.screenRemote ? { v: 'na innym laptopie — bez obrazu', cls: '' } : remoteScreen.state === 'on' ? { v: 'obraz z laptopa dociera', cls: 'ok' } : { v: remoteScreen.step || 'czekam na laptop przy rzutniku', cls: 'wait' })
      : mode === 'local' ? { v: settings.studioLocalProjector ? 'w tej aplikacji' : 'w tej aplikacji — bez obrazu', cls: settings.studioLocalProjector ? 'ok' : '' } : { v: 'bez rzutnika', cls: '' }
    return [
      { k: 'Kamera', v: cam || 'brak — wybierz', cls: cam ? 'ok' : 'bad', cfg: true },
      { k: 'Dźwięk', v: !mic ? 'bez dźwięku' : heard ? mic : 'cisza: ' + mic, cls: mic && heard ? 'ok' : 'wait', cfg: true },
      { k: 'Rzutnik', ...proj, cfg: true },
      { k: 'Napisy', v: mode === 'off' ? 'wyłączone' : lyricsFeed.tested ? 'test udany o ' + hour(lyricsFeed.tested) : 'bez testu — pokaż na rzutniku slajd pieśni', cls: mode === 'off' ? '' : lyricsFeed.tested ? 'ok' : 'wait', cfg: true },
      { k: 'Transmisja', v: wrongDay ? 'zaplanowana na inny dzień: ' + day : air ? 'zaplanowana' : 'powstanie przy starcie', cls: wrongDay ? 'wait' : 'ok' },
      { k: 'Plan', v: !svc ? 'nie wybrano nabożeństwa' : lacks.length ? 'brakuje: ' + lacks.join(', ') : 'komplet', cls: svc && !lacks.length ? 'ok' : 'wait' },
      { k: 'Zdjęcia', v: !speaker ? 'brak kaznodziei w planie' : [!cardPic(speaker) && 'brak na karcie ogłoszeń', !speakerPic(speaker) && 'brak na pasku'].filter(Boolean).join(', ') || 'karta i pasek', cls: speaker && cardPic(speaker) && speakerPic(speaker) ? 'ok' : 'wait' },
      // pieśni i pliki są potrzebne tam, gdzie działa rzutnik
      ...(here && svc ? [
        { k: 'Pieśni', v: noSongs.length ? 'bez tekstu: ' + noSongs.map(e => e.title).join(', ') : (svc.songs.length || 'brak') + ' w planie', cls: noSongs.length ? 'bad' : svc.songs.length ? 'ok' : 'wait' },
        { k: 'Materiały', v: noFiles.length || bible ? 'niewczytane: ' + [noFiles.length && 'pliki ' + noFiles.length, bible && 'fragment Biblii'].filter(Boolean).join(', ') : 'wczytane', cls: noFiles.length ? 'bad' : bible ? 'wait' : 'ok' },
      ] : []),
    ]
  })

  return { service, ...atem, ...youtube, ...devices, ...broadcast, ...liveChat, ...health, ...projectors, ...media, pip, deskTab, deskMode, prepKind, prepId, unrail, openCfg, lyricsInfo, readiness }
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
