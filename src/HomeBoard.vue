<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { calendarRequest, canUse, churchAnnouncements, churchEvents, churchTypes, countdown, nearestService, planAlert, plannerRequest, role, services, today, DEFAULT_TIME, DEFAULT_PLACE } from './store.js'

// Strona startowa (wzór: pulpit z powitaniem, pasem kart i tygodniem): najbliższe nabożeństwo i komunikaty
// rady w pasie przewijanym w bok, pod spodem ogłoszenia (newsletter) i tydzień dzień po dniu.

const active = a => a.audience !== 'council' && (!a.until || a.until >= today())
const newest = (a, b) => (b.date || 0) - (a.date || 0)
const notices = computed(() => churchAnnouncements.value.filter(a => a.important && active(a)).sort(newest))
const news = computed(() => churchAnnouncements.value.filter(a => !a.important && active(a)).sort(newest).slice(0, 8))

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
function openService(id) { if (canUse('planner')) { plannerRequest.value = { id }; role.value = 'planner' } else openCalendar({ kind: 'service', id }) }
function openCalendar(req = null) { if (canUse('calendar')) { calendarRequest.value = req; role.value = 'calendar' } }
function openItem(it) { it.kind === 'service' ? openService(it.id) : openCalendar({ kind: it.kind, id: it.id, date: it.date }) }
</script>

<template>
  <div class="board">
    <!-- Pas kart: najbliższe nabożeństwo, potem komunikaty rady zboru (przewijane w bok). -->
    <div class="strip">
      <button v-if="svc" class="card-svc" @click="openService(svc.id)">
        <span class="card-tag"><Icon name="calendar" />Najbliższe nabożeństwo</span>
        <b>{{ svcWhen }}</b>
        <span class="card-body">{{ [svc.sermonTitle, svc.passage].filter(Boolean).join(' · ') || 'Bez tytułu kazania' }}<template v-if="svc.speaker"> — {{ svc.speaker }}</template></span>
        <span class="card-foot"><span class="until" :class="{ live: countdown?.live }">{{ until }}</span>{{ svc.place || DEFAULT_PLACE }}<em v-if="planAlert && canUse('planner')" class="pill bad">Braki</em></span>
      </button>
      <article v-for="a in notices" :key="a.id" class="card-notice">
        <span class="card-tag"><Icon name="info" />Komunikat rady zboru</span>
        <b>{{ a.title }}</b>
        <span class="card-body">{{ a.text }}</span>
        <span class="card-foot">{{ shortDate(a.date) }}<template v-if="a.until"> · ważne do {{ asDate(a.until).toLocaleDateString('pl', { day: 'numeric', month: 'short' }) }}</template></span>
      </article>
      <article v-if="!notices.length" class="card-empty"><span class="card-tag"><Icon name="info" />Komunikaty rady zboru</span><span class="card-body">Brak aktualnych komunikatów.</span></article>
    </div>

    <div class="panels">
      <section class="panel">
        <div class="panel-h"><h2>Ogłoszenia</h2><span class="muted">z newslettera</span></div>
        <div v-if="news.length" class="ann-list">
          <article v-for="a in news" :key="a.id" class="ann-row">
            <span class="ann-ic">{{ a.title.trim()[0]?.toUpperCase() }}</span>
            <span class="ann-text"><b>{{ a.title }}</b><span>{{ a.text }}</span></span>
            <small>{{ shortDate(a.date) }}</small>
          </article>
        </div>
        <p v-else class="muted">Nie ma nowych ogłoszeń. Dodaje się je w aplikacji na telefon (Więcej → Ogłoszenia).</p>
      </section>

      <section class="panel">
        <div class="panel-h"><h2>Tydzień</h2><span class="muted">{{ weekRange }}</span><span class="spacer"></span><button class="linklike" @click="openCalendar()">Kalendarz</button></div>
        <div class="week">
          <div v-for="d in week" :key="d.date" class="day" :class="{ today: d.date === today() }">
            <span class="day-wd">{{ d.wd }}</span>
            <span class="day-n">{{ d.n }}</span>
            <button v-for="it in d.items" :key="it.kind + it.id" class="day-ev" :style="{ '--c': typeOf(it.type).color }" :title="(it.time ? it.time + ' ' : '') + it.title" @click="openItem(it)">
              <small v-if="it.time">{{ it.time }}</small>{{ it.title.replace(/^Nabożeństwo: .*/, 'Nabożeństwo') }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; gap: 18px; width: 100%; max-width: 1180px; text-align: left; }
.strip { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x proximity; }
.strip > * { flex: 0 0 280px; scroll-snap-align: start; display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-height: 150px; padding: 14px 16px; border-radius: 14px; text-align: left; }
.card-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.card-tag .icon { width: 14px; height: 14px; }
.strip b { font-size: 16px; line-height: 1.3; }
.card-body { flex: 1; font-size: 13px; opacity: .85; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.card-foot { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.card-svc { justify-content: flex-start; background: linear-gradient(160deg, #22325a, #171a21 70%); border: 1px solid rgba(91, 140, 255, .45); }
.card-svc .card-tag { color: var(--accent); }
.card-svc b::first-letter { text-transform: uppercase; }
.until { padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.until.live { background: rgba(240, 72, 62, .18); color: #ff8a82; }
.card-notice { background: linear-gradient(160deg, rgba(245, 165, 36, .18), #171a21 75%); border: 1px solid rgba(245, 165, 36, .4); }
.card-notice .card-tag, .card-notice b { color: #f5b942; }
.card-empty { background: var(--panel); border: 1px dashed var(--line); color: var(--muted); }
.pill { font-style: normal; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; }
.pill.bad { background: rgba(240, 72, 62, .16); color: #ff8a82; }
.panels { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 16px; }
.panel { padding: 14px 16px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); min-width: 0; }
.panel-h { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.panel-h h2 { margin: 0; font: 600 18px Georgia, 'Times New Roman', serif; text-transform: none; letter-spacing: 0; color: var(--text); }
.muted { color: var(--muted); font-size: 12px; }
.spacer { flex: 1; }
.linklike { background: none; border: 0; padding: 0; color: var(--accent); font-size: 13px; }
.ann-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
.ann-row { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 10px; background: var(--panel2); }
.ann-ic { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font: 600 20px Georgia, serif; }
.ann-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ann-text span { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ann-row small { color: var(--muted); font-size: 12px; flex: none; }
.week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.day { display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-height: 170px; padding: 8px 6px; border-radius: 10px; background: var(--panel2); }
.day.today { box-shadow: inset 0 0 0 1px var(--accent); }
.day-wd { text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); }
.day-n { align-self: center; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-weight: 700; margin-bottom: 4px; }
.day.today .day-n { background: var(--accent); color: #fff; }
.day-ev { display: block; justify-content: flex-start; padding: 5px 6px; border: 0; border-left: 3px solid var(--c); border-radius: 6px; background: color-mix(in srgb, var(--c) 16%, transparent); font-size: 11.5px; text-align: left; line-height: 1.25; white-space: normal; overflow-wrap: normal; word-break: normal; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.day-ev small { display: block; color: var(--muted); font-size: 11px; }
</style>
