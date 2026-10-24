// Stan aplikacji (reaktywny) i stałe — bez zależności od innych modułów stanu.
import { reactive, ref } from 'vue'
import { mergeTypes } from '@web/services/church'
import { BAZA, createCloud } from '@/services/cloud'
import type { KnsApi, LibraryItem, OutputState, Role, Service, Settings, Song, TextStyle } from '@/types'

// Baza danych (Supabase) — „folder wspólny” o nazwie BAZA; inne foldery (dysk, Dysk Google) idą przez IPC.
export { BAZA }

// Wspólny stan panelu sterowania: biblioteka, pieśni, to co jest na żywo.
export const api: KnsApi = window.api
// Pętla ma w danych typ „scene” — tak zapisują ją istniejące biblioteki.
export const KIND = { image: 'Zdjęcie', video: 'Film', text: 'Tekst', scene: 'Pętla', song: 'Pieśń', web: 'Strona internetowa' }
export const TEXT_STYLE: TextStyle = { fs: 12, color: '#ffffff', bg: '#000000', bgImage: null, dim: 0.45, align: 'center', valign: 'center', shadow: false }
export const SONG_LIMIT = 300

export const items = ref<LibraryItem[]>([])
export const songs = ref<Song[]>([])
export const settings = reactive<Settings>({
  fadeMs: 350, // 0 = bez przejścia
  copyFiles: true,
  remote: false,
  lyrics: false, lyricsPos: 'dol', lyricsSize: 6, lyricsBar: false, // napisy pieśni dla OBS (na tym komputerze)
  lyricsOnline: false, lyricsKey: '', // napisy przez internet (kns-nabo.netlify.app/napisy?k=…)
  remoteToken: '',
  songSort: 'number', // 'number' | 'title'
  service: [], // pieśni na najbliższe nabożeństwo: [{ key, songId }]
  activeService: null, // id nabożeństwa wczytanego do wyświetlania
  sharedDir: '', // folder wspólny z nabożeństwami i bazą pieśni (ten sam na wszystkich komputerach)
  cue: false, // sygnały dla kamerzysty (stream)
  cueToken: '',
  atemAddress: '', atemDirect: false, ytPrivacy: 'public', // pulpit streamu: ATEM przez sieć i YouTube
  streamVideo: '', streamAudio: '', streamQuality: '1080', streamFps: 30, streamEngine: 'studio', studioCamera: '', studioAudio: '', streamKbps: 0, pipCorner: 'br', pipSize: 'small', studioAutoCamera: false, studioDirect: false, ytFolded: false, cfgFolded: false, mediaOpen: true, screenShare: false, screenRemote: true, deviceId: '', streamProjector: '', studioLocalProjector: false, cueFolded: false, svcFolded: false, railFolded: false, donateInit: false, studioHidden: ['svc'], studioSlideSec: 8, donateAccount: '', donatePhone: '789 571 542', donateName: 'Kościół Na Skale', donateTitle: 'Darowizna', streamLyrics: 'local', streamLyricsKey: '', // nadawanie bez OBS
  // napisy dla streamu w częściach (rzutnik pokazuje całą zwrotkę): najwyżej N linijek naraz (0 — cała zwrotka);
  // następna część strzałką ('keys' — pierwsze naciśnięcie zmienia tylko napisy) albo sama ('auto' — po N s na linijkę)
  streamLines: 0, streamPartMode: 'keys', streamLineSec: 4,
  musicList: [], musicVolume: 0.35, musicLoop: false, musicShuffle: false, // podkład muzyczny na transmisji (Stream → Media)
  camLayout: 'grid', // układ kamer w stream: 'grid' | 'big' | 'row' | 'column' | 'one'
  camLabels: true, // podpisy na obrazach kamer
  camOnTop: false, // okno stream zawsze na wierzchu
  camCueBar: true, // w trybie nakładki: pasek sygnałów dla kamerzysty pod kamerami
  libraryTrash: [], // kosz Biblioteki: { item, extras, refs, at }
  deletedSongs: {}, // id → czas usunięcia; żeby pieśń usunięta tutaj zniknęła też na innych komputerach
  songStyle: { ...TEXT_STYLE, fs: 14, shadow: true, valign: 'top' }, // pieśni domyślnie od góry ekranu
})
// Aktualizacja aplikacji: { current, version?, ready?, url? } — z procesu głównego.
export const appUpdate = ref<{ current: string; version?: string; ready?: boolean; url?: string }>({ current: '' })
export const role = ref<Role | null>(null) // wybrana służba: 'display' | 'stream' | 'planner'
export const services = ref<Service[]>([]) // zaplanowane nabożeństwa
export const cloud = typeof window !== 'undefined' && window.api ? createCloud(window.api) : null
export const shared = dir => (dir === BAZA ? cloud : api)
// Życie kościoła z Dysku Google (zapisywane na telefonie): rodzaje wydarzeń z szablonami i wydarzenia.
export const churchTypes = ref(mergeTypes(null))
export const churchEvents = ref([])
export const churchAnnouncements = ref([])
// Przejścia między widokami: Kalendarz/Start otwierają nabożeństwo w Organizacji i odwrotnie.
export const plannerRequest = ref(null) // { id } — otwórz nabożeństwo; { date } — nowe na ten dzień
export const calendarRequest = ref(null) // { kind, id, date } — pokaż w kalendarzu
export const serviceModal = ref(false) // okno „Wczytaj nabożeństwo”
export const plannerTarget = ref(null) // nabożeństwo edytowane w organizacji — tam trafia pieśń dodana z bazy
export const tab = ref('materials')
export const search = reactive({ materials: '', songs: '', service: '' })
export const selectedId = ref(null)
export const liveId = ref(null)
export const liveNonce = ref(0)
export const songIndex = ref(0) // zwrotka pieśni na rzutniku
export const previewIndex = ref(0) // zwrotka w podglądzie, gdy pieśń nie jest na żywo
export const displays = ref([])
export const displayId = ref(null)
export const output = ref<OutputState>({ open: false, fullscreen: false, waiting: false })
export const video = ref({ time: 0, duration: 0, paused: true, step: 0 })
export const volume = ref(0.25)
export const notice = ref('')
export const busy = ref('')
export const remoteUrl = ref('')
export const overlayUrl = ref('')
// Nadawanie z aplikacji trzyma obraz z ATEM — podgląd kamer w Stream go wtedy oddaje.
export const cameraLock = ref(false)
export const renamingId = ref(null)
export const renameValue = ref('')
export const confirmId = ref(null)
export const managerOpen = ref(false) // duży widok bazy pieśni
export const hidden = ref(false) // obraz na rzutniku schowany (H), ale nadal „na żywo”
export const frozen = ref(false) // rzutnik stoi na ostatnim obrazie (F); zmiany czekają na odmrożenie
export const frozenAt = ref(null) // { id, index } — na czym stanął rzutnik w chwili zamrożenia
export const previewVideo = ref(null) // { time, duration, paused } filmu w podglądzie
export const liveStart = ref(0) // od której sekundy ma ruszyć film na rzutniku
export const liveStep = ref(0) // od którego slajdu ma ruszyć pętla / prezentacja na rzutniku
export const textPopup = ref(null) // element, którego tekst jest edytowany w dużym oknie
export const liveFrozen = ref(null) // tekst na żywo: stan wysłany na rzutnik, niezależny od dalszej edycji
export const loaded = ref(false)

export const uid = () => Math.random().toString(36).slice(2, 10)
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
