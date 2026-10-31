// Ustawienia aplikacji na komputer (zapisywane na dysku razem z biblioteką).
import type { ServiceSongRef, TextStyle } from './library'
import type { Preset, PresetKind } from './studio'

// Widok aplikacji: służba albo ekran organizacji (kalendarz, osoby).
export type Role = 'display' | 'stream' | 'planner' | 'calendar' | 'people'

export interface Settings {
  fadeMs: number // 0 = bez przejścia
  copyFiles: boolean
  remote: boolean
  // napisy pieśni dla OBS
  lyrics: boolean
  lyricsPos: string
  lyricsSize: number
  lyricsBar: boolean
  lyricsOnline: boolean
  mirrorStream?: boolean
  mirrorLive?: boolean
  studioPresets?: Preset[] // przygotowane plansze i nakładki (Przygotowanie)
  presetsV?: number // wersja presetów (uzupełnienie starych, nowe gotowe)
  presetOn?: Partial<Record<PresetKind, string>> // wybrany preset (na podglądzie)
  lowerLook?: { style?: string, name: string, sub: string, color: string, logo: boolean } // pasek mówcy: napisy (puste — z nabożeństwa), kolor, logo
  lyricsKey: string
  remoteToken: string
  songSort: 'number' | 'title'
  service: ServiceSongRef[] // pieśni na najbliższe nabożeństwo
  activeService: string | null
  sharedDir: string
  cue: boolean
  cueToken: string
  // pulpit streamu
  atemAddress: string
  atemDirect: boolean
  atemFolded?: boolean // ATEM w prawej kolumnie zwinięty
  ytPrivacy: string
  streamVideo: string
  streamAudio: string
  streamQuality: string
  streamFps: number
  streamEngine: 'studio' | 'simple' | string
  studioCamera: string
  studioAudio: string
  streamKbps: number
  pipCorner: string
  pipSize: string
  studioAutoCamera: boolean
  studioDirect: boolean
  ytFolded: boolean
  cfgFolded: boolean
  mediaOpen: boolean
  screenShare: boolean // ten komputer wysyła obraz rzutnika przez sieć
  screenRemote: boolean // stream odbiera obraz rzutnika przez sieć
  deviceId: string
  streamProjector: string // klucz rzutnika, z którego stream bierze obraz
  studioLocalProjector: boolean
  cueFolded: boolean
  svcFolded: boolean
  railFolded: boolean
  deskLayout?: 'classic' | 'cols' // studio: podgląd i wizja nad ustawieniami albo w kolumnie po lewej
  donateInit: boolean
  studioHidden: string[]
  studioSlideSec: number
  // wygląd sceny „Odliczanie”: tło, napis nad zegarem, podpis (tylko przy zegarze na środku), układ, przyciemnienie grafiki (0–80)
  // układ: top, center, split, poster, bar, minimal; zegar: blob, bubble, pill, flip, plain; w środku: ogłoszenia albo napis (sub)
  cdLook?: { draw?: boolean, done?: string, brand?: string, foot?: string, bg: string, c1: string, c2: string, image: string, dim: number, title: string, sub: string, layout: string, timer: string, accent: string, show: 'ann' | 'text', photo?: string }
  // wygląd sceny „Koniec”: tło (jak w odliczaniu), układ: karta z kafelkami, obok siebie, duży napis
  // baner na kamerze: styl (frame — ramka, band — pasek, card — karta w rogu), kolor, napisy, kod QR (all, bank, youtube, spotify, link, none)
  banner?: { style: string, color: string, title: string, sub: string, note: string, qr: string, link: string }
  bannerQueue?: { id: string, style: string, color: string, title: string, sub: string, note: string, qr: string, link: string }[] // kolejka banerów (slajdy w kółko)
  bannerCycle?: boolean // przełączaj banery z kolejki w kółko
  bannerSec?: number // co ile sekund następny baner
  healthFolded?: boolean // statystyki transmisji w prawej kolumnie — zwinięte do samej oceny
  endLook?: { draw?: boolean, brand?: string, bg: string, c1: string, c2: string, image: string, dim: number, title: string, sub: string, layout: 'rock' | 'cards' | 'side' | 'center' | 'image', pic?: string }
  donateAccount: string
  donatePhone: string
  donateName: string
  donateTitle: string
  streamLyrics: 'local' | 'online' | 'none' | string
  streamLyricsKey: string
  prayerStyle?: string
  prayerHead?: string
  prayerText?: string // nakładka „Modlitwa”: napis i podpis
  prayerSub?: string
  prayerLink?: string // kod QR do strony z prośbami modlitewnymi
  prayerLinkLabel?: string
  musicList: { id: string; name: string; path: string }[] // podkład muzyczny na transmisji
  musicVolume: number // 0–1
  musicLoop: boolean // lista w kółko (po ostatnim utworze znowu pierwszy)
  musicShuffle?: boolean // losowa kolejność
  streamLines: number // napisy dla streamu: najwyżej tyle linijek naraz (0 — cała zwrotka)
  streamPartMode: 'keys' | 'auto'
  streamLineSec: number
  camLayout: 'grid' | 'big' | 'row' | 'column' | 'one'
  camLabels: boolean
  camOnTop: boolean
  camCueBar: boolean
  deletedSongs: Record<string, number> // id → czas usunięcia
  libraryTrash?: { item: any, extras?: any[], refs?: { loop: string, i: number, entry: any }[], at: number }[] // kosz Biblioteki
  songStyle: TextStyle
  libSplit?: boolean // biblioteki Rzutnika i Streamu rozdzielone (jednorazowe przeniesienie napisów streamu)
  sharedLayout?: number // wersja układu folderu wspólnego (przenoszenie starych zapisów)
}
