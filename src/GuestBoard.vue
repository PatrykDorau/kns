<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import { loadPublicPreview, DEFAULT_TIME, DEFAULT_PLACE } from './store.js'
import { videoInfo } from '../mobile/church.js'

// Przed zalogowaniem (i dla czekających na zatwierdzenie): to samo co na stronie — odliczanie do nabożeństwa,
// najbliższy tydzień i ogłoszenia publiczne (tylko to, co baza pokazuje gościom). Style: mobile/home.css.
const pub = ref(null)
onMounted(async () => { const r = await loadPublicPreview(); if (!r.error) pub.value = r })
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, 1000)
onUnmounted(() => clearInterval(timer))

const asDate = d => new Date(d + 'T12:00')
const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const startsAt = s => new Date(s.date + 'T' + (s.time || DEFAULT_TIME)).getTime()
const next = computed(() => (pub.value?.services || []).filter(s => startsAt(s) + 3 * 3600e3 > now.value).sort((a, b) => startsAt(a) - startsAt(b))[0] || null)
const cd = computed(() => {
  if (!next.value) return null
  const sec = Math.floor(Math.max(0, startsAt(next.value) - now.value) / 1000)
  return { live: sec === 0, d: Math.floor(sec / 86400), h: Math.floor(sec / 3600) % 24, m: Math.floor(sec / 60) % 60, s: sec % 60 }
})
const pad = n => String(n).padStart(2, '0')
const typeOf = id => (pub.value?.types || []).find(t => t.id === id) || { name: id === 'nabozenstwo' ? 'Nabożeństwo' : 'Wydarzenie', color: id === 'nabozenstwo' ? '#f2a53c' : '#6ea8ff' }
const items = computed(() => [
  ...(pub.value?.services || []).map((s, i) => ({ key: 's' + i, date: s.date, time: s.time || DEFAULT_TIME, title: 'Nabożeństwo', color: typeOf('nabozenstwo').color, full: 'Nabożeństwo' + (s.sermonTitle ? ': ' + s.sermonTitle : '') })),
  ...(pub.value?.events || []).map((e, i) => ({ key: 'e' + i, date: e.date, time: e.time || '', title: e.title || typeOf(e.type).name, color: typeOf(e.type).color, full: [e.title, e.place].filter(Boolean).join(' · ') })),
].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)))
const today = localDate(new Date())
const week = computed(() => Array.from({ length: 7 }, (_, i) => {
  const date = localDate(new Date(asDate(today).getTime() + i * 86400000))
  return { date, wd: asDate(date).toLocaleDateString('pl', { weekday: 'short' }).replace('.', ''), n: asDate(date).getDate(), items: items.value.filter(it => it.date === date) }
}))
const anns = computed(() => pub.value?.announcements || [])
const shortDate = t => (t ? new Date(t).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '') : '')
const shown = ref(null)
const vid = computed(() => videoInfo(shown.value?.video))
</script>

<template>
  <template v-if="pub">
    <section v-if="next" class="kh-panel kh-countdown">
      <span class="kh-tag"><Icon name="calendar" />{{ cd?.live ? 'Nabożeństwo trwa' : 'Do nabożeństwa' }}</span>
      <div v-if="cd && !cd.live" class="kh-cd">
        <span><b>{{ cd.d }}</b><small>dni</small></span><span><b>{{ pad(cd.h) }}</b><small>godz</small></span>
        <span><b>{{ pad(cd.m) }}</b><small>min</small></span><span><b>{{ pad(cd.s) }}</b><small>s</small></span>
      </div>
      <p class="kh-muted">{{ asDate(next.date).toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) }}, {{ next.time || DEFAULT_TIME }} · {{ next.place || DEFAULT_PLACE }}<template v-if="next.sermonTitle"> · {{ next.sermonTitle }}</template></p>
    </section>

    <section class="kh-panel">
      <div class="kh-panel-h"><h2>Najbliżej w kościele</h2><span class="kh-muted">najbliższe 7 dni</span></div>
      <div class="kh-week">
        <div v-for="d in week" :key="d.date" class="kh-day" :class="{ today: d.date === today }">
          <span class="kh-wd">{{ d.wd }}</span>
          <span class="kh-n">{{ d.n }}</span>
          <div v-for="it in d.items" :key="it.key" class="kh-ev" :style="{ '--c': it.color }" :title="it.full"><small v-if="it.time">{{ it.time }}</small>{{ it.title }}</div>
        </div>
      </div>
    </section>

    <section v-if="anns.length" class="kh-panel">
      <div class="kh-panel-h"><h2>Ogłoszenia</h2></div>
      <div class="kh-anns">
        <button v-for="a in anns" :key="a.id" class="kh-ann" @click="shown = a">
          <img v-if="a.image" class="kh-ann-ic kh-ann-img" :src="a.image" alt="" loading="lazy">
          <span v-else class="kh-ann-ic">{{ a.title.trim()[0]?.toUpperCase() }}</span>
          <span class="kh-ann-text"><b>{{ a.title }}<em v-if="a.video" class="kh-film">▶ Film</em></b><span>{{ a.text }}</span></span>
          <small>{{ shortDate(a.date) }}</small>
        </button>
      </div>
    </section>

    <div v-if="shown" class="kh-modal" role="dialog" aria-modal="true" @click.self="shown = null">
      <div class="kh-modal-box">
        <button class="kh-ib kh-close" title="Zamknij" aria-label="Zamknij" @click="shown = null"><Icon name="x" /></button>
        <img v-if="shown.image" class="kh-modal-img" :src="shown.image" alt="">
        <h2>{{ shown.title }}</h2>
        <p class="kh-modal-text">{{ shown.text }}</p>
        <video v-if="vid?.kind === 'file'" :src="vid.src" controls preload="metadata"></video>
        <a v-else-if="vid" class="kh-yt" :href="vid.link" target="_blank" rel="noopener"><img v-if="vid.thumb" :src="vid.thumb" alt=""><span>▶ Obejrzyj film — otworzy się w przeglądarce</span></a>
        <a v-if="shown.link" class="kh-modal-link" :href="shown.link" target="_blank" rel="noopener">{{ shown.linkText || 'Otwórz link' }} ›</a>
      </div>
    </div>
  </template>
</template>
