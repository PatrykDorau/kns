// Scena „Rzutnik” w studiu: to, co pokazuje Rzutnik na TYM komputerze (zdjęcie, film, tekst, slajd prezentacji).
// Rzutnik na innym komputerze — przechwytywanie ekranu przez sieć (osobno).
import { watch } from 'vue'
import { hidden, liveSlide, video } from './store.js'
import { studio } from './studio.js'

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
}
