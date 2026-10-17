<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { calendarRequest, canUse, churchAnnouncements, churchEvents, churchTypes, countdown, nearestService, planAlert, plannerRequest, role, services, today, DEFAULT_TIME, DEFAULT_PLACE } from './store.js'
import { videoInfo } from '../mobile/church.js'

// Strona startowa (wzór: pulpit z powitaniem, pasem kart i tygodniem): najbliższe nabożeństwo i komunikaty
// rady w pasie przewijanym w bok, pod spodem ogłoszenia (newsletter) i tydzień dzień po dniu.

const active = a => a.audience !== 'council' && (!a.until || a.until >= today())
const newest = (a, b) => (b.date || 0) - (a.date || 0)
const notices = computed(() => churchAnnouncements.value.filter(a => a.important && active(a)).sort(newest))
const news = computed(() => churchAnnouncements.value.filter(a => !a.important && active(a)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || newest(a, b)).slice(0, 8))

const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const asDate = date => new Date(date + 'T12:00')
const typeOf = id => churchTypes.value.find(t => t.id === id) || { name: 'Inne', color: '#8f98a8' }
const items = computed(() => [
  ...services.value.map(s => ({ kind: 'service', id: s.id, type: 'nabozenstwo', date: s.date, time: s.time || DEFAULT_TIME, title: s.sermonTitle ? 'Nabożeństwo: ' + s.sermonTitle : 'Nabożeństwo' })),
  ...churchEvents.value.map(e => ({ kind: 'event', id: e.id, type: e.type, date: e.date, time: e.time || '', title: e.title || typeOf(e.type).name })),
])
// Tydzień: dziś i 6 kolejnych dni, każdy z własną listą.
const week = computed(() => Array.from({ length: 7 }, (_, i) => {
  const date = localDate(new Date(asDate(today()).getTime() + i * 86400000))
  return { date, wd: asDate(date).toLocaleDateString('pl', { weekday: 'short' }).replace('.', ''), n: asDate(date).getDate(),
    items: items.value.filter(it => it.date === date).sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00')) }
}))
const weekRange = computed(() => {
  const f = d => asDate(d).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '')
  return f(week.value[0].date) + ' – ' + f(week.value[6].date)
})
const shortDate = t => (t ? new Date(t).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '') : '')
const svc = computed(() => nearestService.value && nearestService.value.date >= today() ? nearestService.value : null)
const svcWhen = computed(() => (svc.value ? asDate(svc.value.date).toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + (svc.value.time || DEFAULT_TIME) : ''))
const until = computed(() => {
  const c = countdown.value
  if (!c) return ''
  if (c.live) return 'W trakcie'
  return c.days ? `za ${c.days} ${c.days === 1 ? 'dzień' : 'dni'} ${+c.hours} godz` : `za ${+c.hours} godz ${+c.minutes} min`
})
// Ogłoszenie w okienku: grafika, treść i film (wgrany gra od razu; YouTube/Vimeo — w przeglądarce).
const shown = ref(null)
const vid = computed(() => videoInfo(shown.value?.video))
function openService(id) { if (canUse('planner')) { plannerRequest.value = { id }; role.value = 'planner' } else openCalendar({ kind: 'service', id }) }
function openCalendar(req = null) { if (canUse('calendar')) { calendarRequest.value = req; role.value = 'calendar' } }
function openItem(it) { it.kind === 'service' ? openService(it.id) : openCalendar({ kind: it.kind, id: it.id, date: it.date }) }
</script>

<template>
  <!-- Pas kart: najbliższe nabożeństwo, potem komunikaty rady zboru (przewijane w bok). Style: mobile/home.css. -->
  <div class="kh-strip">
    <button v-if="svc" class="kh-svc" @click="openService(svc.id)">
      <span class="kh-tag"><Icon name="calendar" />Najbliższe nabożeństwo</span>
      <b>{{ svcWhen }}</b>
      <span class="kh-body">{{ [svc.sermonTitle, svc.passage].filter(Boolean).join(' · ') || 'Bez tytułu kazania' }}<template v-if="svc.speaker"> — {{ svc.speaker }}</template></span>
      <span class="kh-foot"><span class="kh-until" :class="{ live: countdown?.live }">{{ until }}</span>{{ svc.place || DEFAULT_PLACE }}<em v-if="planAlert && canUse('planner')" class="kh-pill bad">Braki</em></span>
    </button>
    <article v-for="a in notices" :key="a.id" class="kh-notice kh-clickable" @click="shown = a">
      <img v-if="a.image" class="kh-card-img" :src="a.image" alt="" loading="lazy">
      <span class="kh-tag"><Icon name="info" />Komunikat rady zboru<em v-if="a.video" class="kh-film">▶ Film</em></span>
      <b>{{ a.title }}</b>
      <span class="kh-body">{{ a.text }}</span>
      <span class="kh-foot">{{ shortDate(a.date) }}<template v-if="a.until"> · ważne do {{ asDate(a.until).toLocaleDateString('pl', { day: 'numeric', month: 'short' }) }}</template></span>
    </article>
    <article v-if="!notices.length" class="kh-empty"><span class="kh-tag"><Icon name="info" />Komunikaty rady zboru</span><span class="kh-body">Brak aktualnych komunikatów.</span></article>
  </div>

  <div class="kh-panels">
    <section class="kh-panel">
      <div class="kh-panel-h"><h2>Ogłoszenia</h2><span class="kh-muted">z newslettera</span></div>
      <div v-if="news.length" class="kh-anns">
        <article v-for="a in news" :key="a.id" class="kh-ann kh-clickable" @click="shown = a">
          <img v-if="a.image" class="kh-ann-ic kh-ann-img" :src="a.image" alt="" loading="lazy">
          <span v-else class="kh-ann-ic">{{ a.title.trim()[0]?.toUpperCase() }}</span>
          <span class="kh-ann-text"><b><Icon v-if="a.pinned" name="pin" class="kh-pin" />{{ a.title }}<em v-if="a.video" class="kh-film">▶ Film</em></b><span>{{ a.text }}</span></span>
          <small>{{ shortDate(a.date) }}</small>
        </article>
      </div>
      <p v-else class="kh-none">Nie ma nowych ogłoszeń. Dodaje się je w aplikacji na telefon (Więcej → Ogłoszenia).</p>
    </section>

    <section class="kh-panel">
      <div class="kh-panel-h"><h2>Tydzień</h2><span class="kh-muted">{{ weekRange }}</span><span class="kh-spacer"></span><button class="kh-link" @click="openCalendar()">Kalendarz</button></div>
      <div class="kh-week">
        <div v-for="d in week" :key="d.date" class="kh-day" :class="{ today: d.date === today() }">
          <span class="kh-wd">{{ d.wd }}</span>
          <span class="kh-n">{{ d.n }}</span>
          <button v-for="it in d.items" :key="it.kind + it.id" class="kh-ev" :style="{ '--c': typeOf(it.type).color }" :title="(it.time ? it.time + ' ' : '') + it.title" @click="openItem(it)">
            <small v-if="it.time">{{ it.time }}</small>{{ it.title.replace(/^Nabożeństwo: .*/, 'Nabożeństwo') }}
          </button>
        </div>
      </div>
    </section>
  </div>

  <div v-if="shown" class="kh-modal" role="dialog" aria-modal="true" @click.self="shown = null" @keydown.esc="shown = null">
    <div class="kh-modal-box">
      <button class="kh-ib kh-close" title="Zamknij" aria-label="Zamknij" @click="shown = null"><Icon name="x" /></button>
      <img v-if="shown.image" class="kh-modal-img" :src="shown.image" alt="">
      <h2>{{ shown.title }}</h2>
      <p class="kh-modal-text">{{ shown.text }}</p>
      <video v-if="vid?.kind === 'file'" :src="vid.src" controls preload="metadata"></video>
      <a v-else-if="vid" class="kh-yt" :href="vid.link" target="_blank" rel="noopener">
        <img v-if="vid.thumb" :src="vid.thumb" alt="">
        <span>▶ Obejrzyj film ({{ vid.kind === 'youtube' ? 'YouTube' : 'Vimeo' }}) — otworzy się w przeglądarce</span>
      </a>
      <a v-if="shown.link" class="kh-modal-link" :href="shown.link" target="_blank" rel="noopener">{{ shown.linkText || 'Otwórz link' }} ›</a>
    </div>
  </div>
</template>
