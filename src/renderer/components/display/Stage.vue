<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Scena — ten sam komponent rysuje podgląd i obraz na rzutniku.
// mirror: podgląd tylko odwzorowuje film grający na rzutniku, bez własnych przycisków.
// followStep: podgląd pętli idzie za rzutnikiem zamiast liczyć slajdy samodzielnie.
// frozen: wszystko staje w miejscu — film pauzuje, pętla nie przechodzi dalej.
// instant: zmiana na inny materiał bez przenikania (podgląd w panelu) — przejścia między slajdami pętli zostają.
const props = defineProps({ item: Object, live: Boolean, mirror: Boolean, frozen: Boolean, instant: Boolean, followStep: { type: Number, default: null } })
const emit = defineEmits(['video', 'step', 'webmax'])
const root = ref(null)
const video = ref(null)
// setStep: ręczne przejście do wskazanego slajdu pętli.
defineExpose({ video, setStep: n => { ownStep.value = n } })

/* Element typu „scene” to pętla po slajdach: zdjęcia i teksty na czas, filmy do końca. */
const ownStep = ref(0)
const step = computed(() => props.followStep ?? ownStep.value)
const slides = computed(() => (props.item?.type === 'scene' ? props.item.slides || [] : null))
const current = computed(() => {
  if (!slides.value) return props.item || null
  return slides.value.length ? slides.value[step.value % slides.value.length] : null
})
// Zmiana klucza = nowa warstwa = przejście. Edycja tekstu klucza nie zmienia, więc nie miga.
const layerKey = computed(() => {
  const c = current.value
  return c ? [c.id, props.item.nonce || 0, slides.value ? step.value : 0, c.slideKey ?? ''].join(':') : ''
})

// Gdy podgląd przestaje być prowadzony z zewnątrz (start odtwarzania), rusza od bieżącego slajdu.
watch(() => props.followStep, (now, before) => { if (now == null && before != null) ownStep.value = before })

let timer = null
// Nowo wyświetlona pętla rusza od slajdu wybranego w podglądzie (startStep), a nie zawsze od pierwszego.
watch(() => [props.item?.id, props.item?.nonce], () => { ownStep.value = props.item?.startStep || 0 }, { immediate: true })
watch(ownStep, n => emit('step', n))
watch([() => current.value?.id, step, () => current.value?.seconds, () => slides.value?.length, () => props.frozen, () => props.followStep, () => props.item?.auto], () => {
  clearTimeout(timer)
  if (!slides.value || slides.value.length < 2 || props.followStep != null || props.frozen || props.item.auto === false) return
  if (!current.value || current.value.type === 'video') return
  timer = window.setTimeout(() => ownStep.value++, Math.max(1, +current.value.seconds || 5) * 1000)
}, { immediate: true })

// Czas przejścia zapamiętujemy, żeby ukrycie obrazu też wygasało płynnie.
const fadeMs = ref(0)
let switching = null
watch(() => props.item?.fadeMs, ms => { if (props.item && !switching) fadeMs.value = ms ?? 0 }, { immediate: true })
watch(() => props.item?.id, (id, old) => {
  if (!props.instant || old === undefined || id === old) return
  fadeMs.value = 0
  clearTimeout(switching)
  switching = window.setTimeout(() => { switching = null; fadeMs.value = props.item?.fadeMs ?? 0 }, 60)
})

const mediaUrl = p => (/^https:\/\//.test(p) ? p : 'media://local/' + encodeURIComponent(p)) // grafiki ogłoszeń są w internecie
const layerStyle = computed(() => {
  const c = current.value
  // Zdjęcie i film: pasy obok obrazu w kolorze z ustawień, domyślnie czarne — na rzutniku czerń to brak
  // światła, więc na ścianie widać tylko sam obraz (przezroczystość pokazałaby pulpit Windows pod oknem).
  if (c.type !== 'text') return { backgroundColor: c.bg || '#000' }
  if (!c.bgImage) return { backgroundColor: c.bg }
  const dim = `rgba(0,0,0,${c.dim ?? 0.45})`
  return { backgroundColor: '#000', backgroundImage: `linear-gradient(${dim},${dim}),url("${mediaUrl(c.bgImage)}")` }
})

// Cień pod literami: im wyższy poziom (0–1), tym ciemniejszy i szerszy.
function textShadow(c) {
  if (!c.shadow) return 'none'
  const s = c.shadowLevel ?? 0.6
  return `0 0 ${0.04 + 0.16 * s}em rgba(0,0,0,${0.35 + 0.65 * s}), 0 0.04em ${0.08 + 0.4 * s}em rgba(0,0,0,${s}), 0 0 ${0.6 * s}em rgba(0,0,0,${0.8 * s})`
}

// Tekst, który się nie mieści, jest zmniejszany, aż wejdzie w całości.
function fit() {
  for (const box of root.value?.querySelectorAll('.txt') || []) {
    if (!box.clientHeight) continue
    const inner = box.firstElementChild
    const cs = getComputedStyle(box)
    const room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    let fs = +box.dataset.fs || 12
    box.style.fontSize = fs + 'cqh'
    for (let n = 0; n < 40 && fs > 2 && (inner.scrollHeight > room + 1 || inner.scrollWidth > inner.clientWidth + 1); n++) {
      fs *= 0.93
      box.style.fontSize = fs + 'cqh'
    }
  }
}
// Strona internetowa: osobna, zamknięta sesja (partition „rzutnik-strona” — bez preloadu, bez Node), stały
// rozmiar 1920×1080 przeskalowany do sceny, żeby przewinięcie i powiększenie wyglądały tak samo w podglądzie i na rzutniku.
const WEB_W = 1920
const webScale = ref(1)
const webEl = ref(null)
const webReady = ref(false)
function webApply() {
  const el = webEl.value, c = current.value
  if (!el || !webReady.value || c?.type !== 'web') return
  try {
    el.setZoomFactor(+c.zoom || 1)
    el.setAudioMuted(!props.live)
    el.executeJavaScript(`window.scrollTo({ top: ${+c.scroll || 0}, behavior: 'smooth' }); Math.max(0, document.documentElement.scrollHeight - innerHeight)`).then(m => emit('webmax', m)).catch(() => {})
  } catch { /* strona jeszcze się ładuje */ }
}
function webRef(el) { if (el !== webEl.value) { webEl.value = el; webReady.value = false } }
function onWebReady() { webReady.value = true; webApply(); setTimeout(webApply, 1500) } // drugi raz — po doczytaniu obrazków
watch(() => [current.value?.scroll, current.value?.zoom, props.live], webApply)
const resize = new ResizeObserver(() => { fit(); if (root.value) webScale.value = root.value.clientWidth / WEB_W })
onMounted(() => { resize.observe(root.value); fit(); webScale.value = root.value.clientWidth / WEB_W })
watch(() => [layerKey.value, current.value?.text, current.value?.fs], () => nextTick(fit), { flush: 'post' })
onBeforeUnmount(() => { clearTimeout(timer); resize.disconnect() })

const VALIGN = { top: 'flex-start', center: 'center', bottom: 'flex-end' }

// Odliczanie: {odliczanie} w tekście to pozostały czas; po zerze — tekst końcowy (gdy jest).
const TOKEN = '{odliczanie}'
const tick = ref(Date.now())
const ticker = window.setInterval(() => { if (current.value?.text?.includes(TOKEN)) tick.value = Date.now() }, 250)
onBeforeUnmount(() => clearInterval(ticker))
const two = n => String(n).padStart(2, '0')
function left(ms) {
  const s = Math.ceil(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60
  if (d) return `${d} ${d === 1 ? 'dzień' : 'dni'} ${two(h)}:${two(m)}:${two(s % 60)}`
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`
}
const shown = computed(() => {
  const c = current.value
  if (!c?.text?.includes(TOKEN)) return c?.text
  if (!c.target) return c.text.replaceAll(TOKEN, '–:––')
  const ms = c.target - tick.value
  if (ms <= 0) return c.endText?.trim() ? c.endText : c.text.replaceAll(TOKEN, '0:00')
  return c.text.replaceAll(TOKEN, left(ms))
})
// Tekst dopasowuje się od nowa tylko, gdy zmieni się jego długość (nie co sekundę).
watch(() => shown.value?.length, () => nextTick(fit), { flush: 'post' })
let resume = false
watch(() => props.frozen, on => {
  const v = video.value
  if (!v) return
  if (on) { resume = !v.paused; v.pause() } else if (resume) v.play().catch(() => {})
})

function onVideo(e) {
  // Film na rzutniku zaczyna od miejsca wybranego w podglądzie.
  if (e.type === 'loadedmetadata' && props.live && !slides.value && props.item.startAt > 0) e.target.currentTime = props.item.startAt
  emit('video', e.target)
}
function onEnded(e) {
  onVideo(e)
  if (slides.value && props.followStep == null && props.item.auto !== false) ownStep.value++
}
</script>

<template>
  <div ref="root" class="stage" :class="{ has: !!current }" :style="{ '--fade': fadeMs + 'ms' }">
    <Transition name="fade" @before-leave="el => el.querySelector('video')?.pause()">
      <div v-if="current" :key="layerKey" class="layer" :style="layerStyle">
        <img v-if="current.type === 'image'" :src="mediaUrl(current.path)" :style="{ objectFit: current.fit }" alt="">
        <video
          v-else-if="current.type === 'video'"
          ref="video"
          :src="mediaUrl(current.path)"
          :loop="slides ? false : current.loop"
          :autoplay="live || !!slides"
          :muted="!live"
          :style="{ objectFit: current.fit }"
          @loadstart="onVideo" @loadedmetadata="onVideo" @timeupdate="onVideo"
          @play="onVideo" @pause="onVideo" @ended="onEnded"
        />
        <div v-else-if="current.type === 'web'" class="webbox">
          <webview :ref="webRef" :src="current.url" partition="rzutnik-strona" class="webpage" :style="{ transform: 'scale(' + webScale + ')' }" @dom-ready="onWebReady"></webview>
        </div>
        <div v-else class="txt" :class="{ shadow: current.shadow }" :data-fs="current.fs" :style="{ color: current.color, textShadow: textShadow(current), alignItems: VALIGN[current.valign] || 'center' }">
          <div :style="{ textAlign: current.align }">{{ shown }}</div>
        </div>
      </div>
    </Transition>
  </div>
</template>
