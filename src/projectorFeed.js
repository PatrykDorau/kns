// Scena „Rzutnik” w studiu: to, co pokazuje Rzutnik na TYM komputerze (zdjęcie, film, tekst, slajd prezentacji).
// Rzutnik na innym komputerze — przechwytywanie ekranu przez sieć (osobno).
import { watch } from 'vue'
import { displayId, hidden, liveSlide, settings, video } from './store.js'
import { setRemoteScreen, studio } from './studio.js'
import { lyricsKey } from './lyricsFeed.js'
import { startReceive, startShare, stopReceive, stopShare } from './screenShare.js'

const url = p => (/^https?:\/\//.test(p) ? p : 'media://local/' + encodeURIComponent(p))
let started = false
export function startProjectorFeed() {
  if (started) return
  started = true
  watch([liveSlide, hidden, () => video.value.paused, () => Math.round(video.value.time || 0)], () => {
    const v = liveSlide.value
    if (!v || hidden.value) { studio.projector = { kind: 'none' }; return }
    if (v.type === 'image') studio.projector = { kind: 'image', url: url(v.path) }
    else if (v.type === 'video') studio.projector = { kind: 'video', url: url(v.path), playing: !video.value.paused, time: video.value.time || 0, at: Date.now() }
    else if (v.type === 'text') studio.projector = { kind: 'text', text: v.text, style: v }
    else studio.projector = { kind: 'none' }
  }, { immediate: true })
  // laptop przy rzutniku: udostępnia ekran rzutnika (klucz — ten sam co napisy przez internet)
  watch([() => settings.screenShare, () => settings.lyricsKey, displayId], ([on, key, disp]) => { if (on && key) startShare(key, disp); else stopShare() }, { immediate: true })
  // laptop ze streamem: odbiera, gdy napisy idą z innego komputera (wklejony adres z kluczem)
  // (ten sam klucz co własny — Rzutnik jest na tym komputerze: obraz idzie wprost, bez sieci)
  watch([() => settings.screenRemote, () => settings.streamLyrics, lyricsKey, () => settings.lyricsKey], ([on, mode, key, own]) => { if (on && mode === 'remote' && key && key !== own) startReceive(key, setRemoteScreen); else stopReceive() }, { immediate: true })
}
