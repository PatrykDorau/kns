// Ustawienia aplikacji na komputer (zapisywane na dysku razem z biblioteką).
import type { ServiceSongRef, TextStyle } from './library'

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
  donateInit: boolean
  studioHidden: string[]
  studioSlideSec: number
  donateAccount: string
  donatePhone: string
  donateName: string
  donateTitle: string
  streamLyrics: 'local' | 'online' | 'none' | string
  streamLyricsKey: string
  streamLines: number // napisy dla streamu: najwyżej tyle linijek naraz (0 — cała zwrotka)
  streamPartMode: 'keys' | 'auto'
  streamLineSec: number
  camLayout: 'grid' | 'big' | 'row' | 'column' | 'one'
  camLabels: boolean
  camOnTop: boolean
  camCueBar: boolean
  deletedSongs: Record<string, number> // id → czas usunięcia
  songStyle: TextStyle
  sharedLayout?: number // wersja układu folderu wspólnego (przenoszenie starych zapisów)
}
