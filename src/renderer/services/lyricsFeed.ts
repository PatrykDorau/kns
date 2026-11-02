// Napisy do transmisji (studio i tryb prosty) — działają przez cały czas pracy aplikacji, niezależnie od tego,
// który ekran jest otwarty (np. przejście na Rzutnik nie zatrzymuje napisów na streamie).
// Źródło: rzutnik na tym komputerze, rzutnik na innym komputerze (kanał na żywo z adresu …/napisy?k=…) albo brak.
import { computed, reactive, watch } from 'vue'
import { api, listenLyrics, lyricsLink, lyricsNow, settings } from '@/stores'
import { studio } from '@/services/studio'

// tested — kiedy dotarł pierwszy niepusty tekst, czyli test napisów przeszedł
export const lyricsFeed = reactive({ text: '', at: 0, link: '', tested: 0 })
// klucz z wklejonego adresu (…/napisy?k=abc) albo sam klucz
export const lyricsKey = computed(() => { const raw = String(settings.streamLyricsKey || ''); const m = raw.match(/[?&]k=([\w-]+)/); return m ? m[1] : raw.trim().replace(/[^\w-]/g, '') })
function feed(text) {
  lyricsFeed.text = String(text || ''); lyricsFeed.at = Date.now()
  if (lyricsFeed.text.trim() && !lyricsFeed.tested) lyricsFeed.tested = lyricsFeed.at
  studio.lyrics = lyricsFeed.text
  api.streamLyrics?.(lyricsFeed.text)
}
// po starcie FFmpeg (tryb prosty) — bieżąca zwrotka od pierwszej klatki
export function refeedLyrics() { api.streamLyrics?.(lyricsFeed.text) }
let started = false, unlisten = null
export function startLyricsFeed() {
  if (started) return
  started = true
  watch([() => settings.streamLyrics, lyricsKey], ([mode, key]) => {
    unlisten?.(); unlisten = null
    lyricsFeed.tested = 0
    if (mode === 'remote' && key) { lyricsFeed.at = 0; unlisten = listenLyrics(key, feed) } // bieżąca zwrotka przyjdzie od razu
    else feed(mode === 'local' ? lyricsNow.value : '')
  }, { immediate: true })
  watch(lyricsNow, t => { if (settings.streamLyrics === 'local') feed(t) })
  // stan połączenia (do pulpitu)
  setInterval(() => { lyricsFeed.link = settings.streamLyrics === 'remote' && lyricsKey.value ? lyricsLink(lyricsKey.value) : settings.streamLyrics }, 1000)
}
