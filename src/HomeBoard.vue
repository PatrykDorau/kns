<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import Countdown from './Countdown.vue'
import { calendarRequest, canUse, churchAnnouncements, churchEvents, churchTypes, planAlert, planReady, plannerRequest, role, services, today, DEFAULT_TIME, DEFAULT_PLACE } from './store.js'

// Strona startowa: komunikaty rady (przewijane w dół), kartki z newslettera, najbliższe nabożeństwo
// i wszystko, co dzieje się w kościele w najbliższym tygodniu.
const active = a => a.audience !== 'council' && (!a.until || a.until >= today())
const newest = (a, b) => (b.date || 0) - (a.date || 0)
const notices = computed(() => churchAnnouncements.value.filter(a => a.important && active(a)).sort(newest))
const news = computed(() => churchAnnouncements.value.filter(a => !a.important && active(a)).sort(newest).slice(0, 6))

const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const asDate = date => new Date(date + 'T12:00')
const typeOf = id => churchTypes.value.find(t => t.id === id) || { name: 'Inne', color: '#8f98a8' }
const week = computed(() => {
  const from = today(), until = localDate(new Date(Date.now() + 6 * 86400000))
  return [
    ...services.value.map(s => ({ kind: 'service', id: s.id, type: 'nabozenstwo', date: s.date, time: s.time || DEFAULT_TIME, place: s.place || DEFAULT_PLACE, title: s.sermonTitle ? 'Nabożeństwo: ' + s.sermonTitle : 'Nabożeństwo' })),
    ...churchEvents.value.map(e => ({ kind: 'event', id: e.id, type: e.type, date: e.date, time: e.time || '', place: e.place || '', title: e.title || typeOf(e.type).name })),
  ].filter(it => it.date >= from && it.date <= until).sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')))
})
const dayLabel = d => {
  const t = today(), next = localDate(new Date(asDate(t).getTime() + 86400000))
  if (d === t) return 'dziś'
  if (d === next) return 'jutro'
  return asDate(d).toLocaleDateString('pl', { weekday: 'short', day: 'numeric' }).replace('.', '')
}
const shortDate = t => (t ? new Date(t).toLocaleDateString('pl', { day: 'numeric', month: 'short' }) : '')
// Nabożeństwo → Organizacja (dla rang z edycją), wydarzenie → Kalendarz.
function openItem(it) {
  if (it.kind === 'service' && canUse('planner')) { plannerRequest.value = { id: it.id }; role.value = 'planner' } else if (canUse('calendar')) { calendarRequest.value = { kind: it.kind, id: it.id, date: it.date }; role.value = 'calendar' }
}
</script>

<template>
  <div class="board">
    <section class="board-col">
      <h2 class="board-h">Komunikaty rady zboru</h2>
      <div v-if="notices.length" class="notice-list">
        <article v-for="a in notices" :key="a.id" class="notice-card">
          <b>{{ a.title }}</b>
          <p>{{ a.text }}</p>
          <small>{{ shortDate(a.date) }}<template v-if="a.until"> · ważne do {{ asDate(a.until).toLocaleDateString('pl', { day: 'numeric', month: 'short' }) }}</template></small>
        </article>
      </div>
      <p v-else class="board-empty">Brak aktualnych komunikatów.</p>

      <h2 class="board-h">Z newslettera</h2>
      <div v-if="news.length" class="news-cards">
        <article v-for="a in news" :key="a.id" class="news-card">
          <b>{{ a.title }}</b>
          <p>{{ a.text }}</p>
          <small>{{ shortDate(a.date) }}</small>
        </article>
      </div>
      <p v-else class="board-empty">Nie ma nowych ogłoszeń. Dodaje się je w aplikacji na telefon (Więcej → Ogłoszenia).</p>
    </section>

    <section class="board-col">
      <h2 class="board-h">Najbliższe nabożeństwo</h2>
      <Countdown />
      <p v-if="planAlert" class="board-alert bad"><Icon name="missing" />{{ planAlert.text }}</p>
      <p v-else-if="planReady" class="board-alert ok"><Icon name="check" />{{ planReady.text }}</p>

      <h2 class="board-h">Ten tydzień</h2>
      <div v-if="week.length" class="week-list">
        <button v-for="it in week" :key="it.kind + it.id" class="week-item" @click="openItem(it)">
          <span class="wk-day" :class="{ today: it.date === today() }">{{ dayLabel(it.date) }}</span>
          <i class="wk-dot" :style="{ background: typeOf(it.type).color }"></i>
          <span class="wk-title">{{ it.title }}<small v-if="it.place">{{ it.place }}</small></span>
          <span class="wk-time">{{ it.time }}</span>
        </button>
      </div>
      <p v-else class="board-empty">W najbliższych dniach nic nie zaplanowano.</p>
    </section>
  </div>
</template>

<style scoped>
.board { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 28px; width: 100%; max-width: 1180px; text-align: left; }
.board-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.board-h { margin: 8px 0 0; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.board-empty { margin: 0; color: var(--muted); font-size: 13px; }
.notice-list { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; padding-right: 4px; }
.notice-card { padding: 12px 14px; border-radius: 12px; background: rgba(245, 165, 36, .1); border: 1px solid rgba(245, 165, 36, .4); }
.notice-card b { display: block; color: #f5b942; font-size: 15px; }
.notice-card p, .news-card p { margin: 4px 0; white-space: pre-wrap; font-size: 13px; }
.notice-card small, .news-card small { color: var(--muted); font-size: 12px; }
.news-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.news-card { padding: 12px 14px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); }
.news-card p { color: var(--muted); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.board-alert { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; }
.board-alert.bad { color: #ff8a82; }
.board-alert.ok { color: var(--ok); }
.board-alert .icon { width: 16px; height: 16px; }
.week-list { display: flex; flex-direction: column; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; }
.week-item { display: flex; align-items: center; gap: 10px; justify-content: flex-start; padding: 10px 14px; border: 0; border-radius: 0; background: none; text-align: left; }
.week-item + .week-item { border-top: 1px solid var(--line); }
.week-item:hover { background: var(--panel2); }
.wk-day { width: 62px; flex: none; color: var(--muted); font-size: 12px; font-weight: 600; }
.wk-day.today { color: var(--accent); }
.wk-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.wk-title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wk-title small { color: var(--muted); font-size: 12px; }
.wk-time { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
</style>
