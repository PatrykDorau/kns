// Studio streamu: wygląd obrazu (podgląd i wizja) i odtwarzanie materiałów.
import type { TextStyle } from './library'

export type SceneId = 'camera' | 'projector' | 'countdown' | 'media' | 'end'
export type Corner = 'tl' | 'tr' | 'bl' | 'br'
export type BoxSize = 'small' | 'medium' | 'large' | string

export interface Pip {
  corner: Corner | string
  size: BoxSize
  on: boolean // kamera w okienku (na każdej scenie poza Kamerą)
}

// Wygląd plansz (kopia ustawień): odliczanie, koniec.
export interface LookStyles { cd: any, end: any }

// Wygląd jednej strony (podgląd albo wizja).
export interface Look {
  scene: SceneId | string
  lyricsOn: boolean
  lowerThird: boolean
  pip: Pip
  lowerAt: number
  lowerOff: number
  media: string // materiał na cały ekran (scena „Media”)
  omedia: string // materiał jako nakładka
  ovl: 'off' | 'full' | 'corner'
  endOvl: boolean // baner (nakładka u dołu)
  prayer: boolean // czas modlitwy (napis u dołu)
  styles?: LookStyles | null // wizja: wygląd plansz z chwili „Na wizję” (null — bieżące ustawienia)
  mpos: { corner: Corner | string; size: BoxSize }
}

// Odtwarzanie materiałów (wspólne dla podglądu i wizji).
export interface MediaPlay {
  playing: boolean
  loop: boolean
  volume: number
  slides: Record<string, number> // id prezentacji → numer slajdu
  time: number
  duration: number
}

// Slajd pętli ogłoszeń w Stream: grafika, karta z tekstem albo karta najbliższego nabożeństwa.
export interface StudioSlide {
  id: string
  title: string
  image?: string
  text?: string
  service?: boolean
}

// To, co pokazuje rzutnik na tym komputerze.
export interface ProjectorShown {
  kind: 'image' | 'video' | 'text' | 'none' | string
  url?: string
  text?: string
  style?: Partial<TextStyle>
  playing?: boolean
  time?: number
  at?: number
}

export interface EndCard {
  account: string
  phone: string
  name: string
  title: string
  youtube: string
  spotify: string
}

export interface StudioState {
  program: Look
  preview: Look
  direct: boolean
  lyrics: string
  slideEvery: number
  hidden: string[]
  slideId: string
  skipped: number
  audioDb: number
  silentFor: number
  camera: string
  audio: string
  fps: number
  bitrate: number
  live: boolean
  error: string
  encoder: string
  hardware: boolean | null
  remoteScreen: boolean
  projector: ProjectorShown
  countdownTo: number
  left: number
  autoCamera: boolean
  end: EndCard
  mplay: MediaPlay
}

// Stan odbioru obrazu rzutnika przez sieć.
export type ScreenState = 'off' | 'connecting' | 'on'
