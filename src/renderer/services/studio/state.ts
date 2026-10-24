// Stan studia streamu: wygląd podglądu i wizji, sceny, nakładki, odtwarzanie materiałów, stan nadawania.
// Studio streamu: cały obraz transmisji składa aplikacja (płótno 1920×1080) — kamera z ATEM (USB), napisy pieśni
// z prawdziwym cieniem, sceny (odliczanie z ogłoszeniami, pętla ogłoszeń, rzutnik, rzutnik + kamera w okienku,
// plansza końcowa) i pasek z mówcą. Kodowanie: WebCodecs, sprzętowo na karcie graficznej (H.264 High, stała
// przepływność, klatka kluczowa co 2 s) → FFmpeg w procesie głównym tylko wysyła na YouTube. Dźwięk: ATEM (USB)
// + dźwięk filmów ze scen, zmiksowany tutaj (PCM 48 kHz) → FFmpeg koduje AAC.
// Jak w ATEM i na rzutniku: zmiany (scena, pasek mówcy, napisy, okienko) najpierw idą na Podgląd, a na wizję
// dopiero po „Na wizję” — chyba że włączone „Od razu na wizję”. Podgląd rysowany w połowie rozdzielczości.
// Działa niezależnie od otwartego widoku (moduł), żeby wyjście z ekranu Stream nie przerwało transmisji.
import { reactive } from 'vue'
import type { Look, StudioState } from '@/types'

export const W = 1920, H = 1080

export const SCENES = [
  ['camera', 'Kamera'],
  ['projector', 'Rzutnik'],
  ['countdown', 'Odliczanie'],
  ['announcements', 'Ogłoszenia'],
  ['media', 'Materiał'],
  ['end', 'Koniec'],
]
// Na których scenach są nakładki (na planszach — odliczanie, ogłoszenia, koniec — nie ma ich celowo).
export const OVERLAYS = { lyrics: ['camera', 'projector', 'media'], lowerThird: ['camera', 'projector', 'media'], media: ['camera', 'projector'] }
// media — materiał na cały ekran (scena „Media”); omedia — materiał jako nakładka na kamerze/rzutniku,
// ovl: 'off', 'full' (cały kadr — PNG z przezroczystym tłem, napis bez tła), 'corner' (okienko w rogu, mpos)
const look = (): Look => ({ scene: 'camera', lyricsOn: true, lowerThird: false, pip: { corner: 'br', size: 'small', on: false }, lowerAt: 0, lowerOff: 0, media: '', omedia: '', ovl: 'off', mpos: { corner: 'tr', size: 'small' } })
export const studio = reactive<StudioState>({
  program: look(), // to, co idzie na YouTube
  preview: look(), // to, co przygotowujemy
  direct: false, // „Od razu na wizję” — zmiany od razu na wizji (bez podglądu)
  lyrics: '',
  slideEvery: 8, // co ile sekund następne ogłoszenie
  hidden: ['svc'], // wyłączone slajdy (id); „svc” — karta najbliższego nabożeństwa
  slideId: '', // slajd na wizji teraz
  skipped: 0, // klatki pominięte, bo karta graficzna nie nadążała
  audioDb: -100, // szczyt dźwięku w ostatniej chwili (dBFS)
  silentFor: 0, // ile sekund cisza (np. odpięty kabel z miksera)
  camera: '', audio: '', fps: 30, bitrate: 6800000, live: false, error: '', encoder: '',
  hardware: null, // null — nie sprawdzono; true/false — czy karta koduje H.264
  remoteScreen: false, // obraz rzutnika przez sieć dociera
  projector: { kind: 'none' }, // to, co pokazuje rzutnik (etap 2): { kind: 'image'|'video'|'text'|'none', url, text, style, playing, time, at }
  countdownTo: 0, // odliczanie do tej chwili (ms); 0 — do godziny najbliższego nabożeństwa
  left: 0, // ile sekund zostało (do pulpitu)
  autoCamera: false, // po zerze (i 3 s „Zaczynamy”) samo przełącza na Kamerę
  end: { account: '', phone: '', name: 'Kościół Na Skale', title: 'Darowizna', youtube: '', spotify: '' }, // plansza końcowa
  // odtwarzanie materiałów (wspólne dla podglądu i wizji — jak napisy, działa od razu): film gra, pętla, głośność,
  // slajd prezentacji (dla każdej osobno)
  mplay: { playing: true, loop: false, volume: 1, slides: {}, time: 0, duration: 0 },
})
