// Biblioteka materiałów, pieśni i nabożeństwa — tak, jak są zapisane na dysku i w bazie.

export type ItemType = 'image' | 'video' | 'text' | 'scene' | 'song' | 'web'

// Wygląd tekstu (materiał „Tekst”, pieśni, Biblia, odliczanie).
export interface TextStyle {
  fs: number // wielkość (procent wysokości ekranu)
  color: string
  bg: string
  bgImage: string | null
  dim: number // przyciemnienie zdjęcia w tle (0–1)
  align: 'left' | 'center' | 'right' | string
  valign: 'top' | 'center' | 'bottom' | string
  shadow: boolean
}

// Slajd pętli / prezentacji: odwołanie do innego materiału.
export interface SceneEntry {
  key: string
  ref: string // id materiału
  seconds: number | null // null — jak w całej pętli
}

// Jeden materiał biblioteki. Pola zależą od rodzaju (type), więc większość jest opcjonalna.
export interface LibraryItem extends Partial<TextStyle> {
  id: string
  type: ItemType
  name: string
  hidden?: boolean // slajd prezentacji — nie pokazuje się osobno na liście
  missing?: boolean // pliku nie ma na dysku (ustawiane po wczytaniu, nie zapisywane)
  // zdjęcie, film
  path?: string
  fit?: 'contain' | 'cover' | string
  loop?: boolean
  // tekst
  text?: string
  endText?: string
  countMode?: 'service' | 'minutes' | string // odliczanie: do nabożeństwa albo o kilka minut
  minutes?: number
  target?: number
  // strona internetowa: adres, powiększenie, przewinięcie (px strony przy oknie 1920×1080)
  url?: string
  zoom?: number
  scroll?: number
  webMax?: number // ile da się przewinąć (z podglądu; nie trzeba zapisywać)
  // pętla / prezentacja
  seconds?: number
  volume?: number
  transition?: 'fade' | 'cut' | string
  fadeMs?: number
  auto?: boolean
  entries?: SceneEntry[]
  source?: string
  // panel Media w Stream: prezentacja sama przełącza slajdy co mSec sekund
  mAuto?: boolean
  mSec?: number
}

// Bieżący slajd prezentacji/pętli (panel Media w Stream): materiał z dopiskiem, z której prezentacji pochodzi.
export interface MediaSlide extends LibraryItem {
  deckOf?: string
  slideNo?: number
  slideCount?: number
}

export interface Song {
  id: string
  type: 'song'
  number: string
  title: string
  text: string
  updated?: number
  missing?: boolean
}

// Materiał albo pieśń — to, co można zaznaczyć i wyświetlić (pola pieśni są wtedy opcjonalne).
export type Shown = LibraryItem & Partial<Omit<Song, 'id' | 'type'>>

// Pieśń na liście „na najbliższe nabożeństwo” (ustawienia).
export interface ServiceSongRef {
  key: string
  songId: string
}

// Plik dołączony do nabożeństwa (np. prezentacja kazania).
export interface ServiceFile {
  key: string
  path: string
  name: string
  type: string
}

// Pieśń w planie nabożeństwa.
export interface ServiceSong {
  key: string
  id?: string
  songId?: string
  number?: string
  title?: string
  text?: string
  [field: string]: unknown
}

// Punkt programu nabożeństwa (zapis wspólny z telefonem): przesunięcie w minutach od początku.
export interface ProgramItem {
  key: string
  offset: number
  category: string
  title: string
  person: string
  note: string
}

// Zaplanowane nabożeństwo.
export interface Service {
  id: string
  date: string // RRRR-MM-DD
  time?: string
  place?: string
  sermonTitle?: string
  passage?: string
  speaker?: string
  band?: string
  notes?: string
  thoughts?: string // myśli z kazania
  program?: ProgramItem[]
  songs: ServiceSong[]
  files: ServiceFile[]
  createdBy?: string
  updated?: number
  updatedBy?: string
  shared?: boolean
}
