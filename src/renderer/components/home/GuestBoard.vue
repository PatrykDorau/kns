<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { loadListen, loadPublicPreview, DEFAULT_TIME, DEFAULT_PLACE } from '@/stores'

// Przed zalogowaniem (i dla czekających na zatwierdzenie): to samo co na stronie — odliczanie do nabożeństwa
// i „Posłuchaj — odkryj nas” (najnowsze kazanie z YouTube i podcast na Spotify). Style: mobile/home.css.
// Filmy i podcast otwierają się w przeglądarce (odtwarzacze w ramce nie działają w aplikacji z pliku).
const pub = ref(null)
const listen = ref({})
const latest = ref(null) // najnowszy film z kanału (funkcja na stronie czyta kanał RSS YouTube)
onMounted(async () => {
  const r = await loadPublicPreview(); if (!r.error) pub.value = r
  const l = await loadListen(); if (!l.error) listen.value = l
  if (listen.value.youtube) {
    try { const x = await (await fetch('https://kns-nabo.netlify.app/api/najnowsze?yt=' + encodeURIComponent(listen.value.youtube))).json(); if (x.video) latest.value = x } catch { /* zostaje link do kanału */ }
  }
})
const openUrl = url => window.open(url, '_blank')
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, 1000)
onUnmounted(() => clearInterval(timer))

const asDate = d => new Date(d + 'T12:00')
const startsAt = s => new Date(s.date + 'T' + (s.time || DEFAULT_TIME)).getTime()
const next = computed(() => (pub.value?.services || []).filter(s => startsAt(s) + 3 * 3600e3 > now.value).sort((a, b) => startsAt(a) - startsAt(b))[0] || null)
const cd = computed(() => {
  if (!next.value) return null
  const sec = Math.floor(Math.max(0, startsAt(next.value) - now.value) / 1000)
  return { live: sec === 0, d: Math.floor(sec / 86400), h: Math.floor(sec / 3600) % 24, m: Math.floor(sec / 60) % 60, s: sec % 60 }
})
const pad = n => String(n).padStart(2, '0')
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

    <section v-if="listen.youtube || listen.spotify" class="kh-panel">
      <div class="kh-panel-h"><h2>Posłuchaj — odkryj nas</h2><span class="kh-muted">kazania i uwielbienie</span></div>
      <div class="kh-listen">
        <button v-if="listen.youtube" class="kh-lcard" @click="openUrl(latest ? 'https://www.youtube.com/watch?v=' + latest.video : listen.youtube)">
          <img v-if="latest" :src="'https://i.ytimg.com/vi/' + latest.video + '/hqdefault.jpg'" alt="">
          <span class="kh-lplay">▶</span>
          <span class="kh-ltext"><b>YouTube</b><span>{{ latest ? 'Najnowsze: ' + latest.title : 'Kanał kościoła' }}</span></span>
        </button>
        <button v-if="listen.spotify" class="kh-lcard spotify" @click="openUrl(listen.spotify)">
          <span class="kh-lplay">▶</span>
          <span class="kh-ltext"><b>Spotify</b><span>Podcast — najnowszy odcinek kazania</span></span>
        </button>
      </div>
    </section>
  </template>
</template>
