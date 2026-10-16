<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { addMinutes, category } from '../mobile/church.js'
import { churchEvents, churchTypes, services, today, DEFAULT_TIME, DEFAULT_PLACE } from './store.js'

// Kalendarz życia kościoła: nabożeństwa i wydarzenia dodane na telefonie (spotkania studenckie,
// członkowskie, rady…). Nabożeństwo otwiera się do edycji; wydarzenia są tu tylko do podglądu.
defineProps({ selected: { type: String, default: '' } })
const emit = defineEmits(['select'])

const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const asDate = date => new Date(date + 'T12:00')
const typeOf = id => churchTypes.value.find(t => t.id === id) || { id, name: 'Inne', color: '#8f98a8' }
const items = computed(() => [
  ...services.value.filter(s => s.date).map(s => ({ kind: 'service', id: s.id, type: 'nabozenstwo', date: s.date, time: s.time || DEFAULT_TIME, place: s.place || DEFAULT_PLACE, title: s.sermonTitle ? 'Nabożeństwo: ' + s.sermonTitle : 'Nabożeństwo', ref: s })),
  ...churchEvents.value.filter(e => e.date).map(e => ({ kind: 'event', id: e.id, type: e.type, date: e.date, time: e.time || '', place: e.place || '', title: e.title || typeOf(e.type).name, ref: e })),
].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00'))))

const month = ref(today().slice(0, 7))
const day = ref('')
const open = ref('') // rozwinięte wydarzenie
const label = computed(() => asDate(month.value + '-01').toLocaleDateString('pl', { month: 'long', year: 'numeric' }))
function shift(by) { const d = asDate(month.value + '-01'); d.setMonth(d.getMonth() + by); month.value = localDate(d).slice(0, 7); day.value = '' }
const WEEK = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd']
const days = computed(() => {
  const first = asDate(month.value + '-01')
  const d = new Date(first); d.setDate(1 - ((first.getDay() + 6) % 7))
  const out = []
  do {
    for (let i = 0; i < 7; i++) {
      const date = localDate(d)
      out.push({ date, n: d.getDate(), inMonth: date.startsWith(month.value), items: items.value.filter(it => it.date === date) })
      d.setDate(d.getDate() + 1)
    }
  } while (localDate(d).startsWith(month.value))
  return out
})
const agenda = computed(() => {
  if (day.value) return items.value.filter(it => it.date === day.value)
  const until = localDate(new Date(Date.now() + 60 * 86400000))
  return items.value.filter(it => it.date >= today() && it.date <= until)
})
const pretty = date => asDate(date).toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' })
function pick(it) {
  if (it.kind === 'service') emit('select', it.ref)
  else open.value = open.value === it.id ? '' : it.id
}
</script>

<template>
  <div class="cal">
    <div class="cal-head">
      <button class="iconbtn" title="Poprzedni miesiąc" aria-label="Poprzedni miesiąc" @click="shift(-1)"><Icon name="left" /></button>
      <b>{{ label }}</b>
      <button class="iconbtn" title="Następny miesiąc" aria-label="Następny miesiąc" @click="shift(1)"><Icon name="right" /></button>
    </div>
    <div class="cal-grid">
      <span v-for="w in WEEK" :key="w" class="wd">{{ w }}</span>
      <button v-for="c in days" :key="c.date" class="cal-day" :class="{ out: !c.inMonth, today: c.date === today(), sel: c.date === day }"
              :aria-label="pretty(c.date)" :aria-pressed="c.date === day" @click="day = day === c.date ? '' : c.date">
        {{ c.n }}
        <span class="dots"><i v-for="(it, k) in c.items.slice(0, 4)" :key="k" :style="{ background: typeOf(it.type).color }"></i></span>
      </button>
    </div>
    <div class="cal-sub">
      <span>{{ day ? pretty(day) : 'Najbliższe 60 dni' }}</span>
      <button v-if="day" class="linklike" @click="day = ''">Wszystkie</button>
    </div>
    <ul class="agenda">
      <li v-if="!agenda.length" class="none">{{ day ? 'Tego dnia nic nie zaplanowano.' : 'Nic nie zaplanowano.' }}</li>
      <li v-for="it in agenda" :key="it.kind + it.id" :style="{ '--c': typeOf(it.type).color }" :class="{ sel: it.kind === 'service' && it.id === selected }">
        <button class="ag" @click="pick(it)">
          <span class="when">{{ asDate(it.date).toLocaleDateString('pl', { day: 'numeric', month: 'short' }) }}<small>{{ it.time }}</small></span>
          <span class="what"><b>{{ it.title }}</b><small>{{ typeOf(it.type).name }}<template v-if="it.place"> · {{ it.place }}</template></small></span>
        </button>
        <div v-if="open === it.id" class="ev-more">
          <p v-if="it.ref.description">{{ it.ref.description }}</p>
          <ol v-if="it.ref.program?.length" class="tl">
            <li v-for="p in [...it.ref.program].sort((a, b) => a.offset - b.offset)" :key="p.key"><b>{{ addMinutes(it.time || '00:00', p.offset) }}</b> {{ category(p.category).name }}<template v-if="p.title"> — {{ p.title }}</template><template v-if="p.person"> ({{ p.person }})</template></li>
          </ol>
          <p class="note">Wydarzenia dodaje się i zmienia w aplikacji na telefonie (Kalendarz).</p>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cal { display: flex; flex-direction: column; gap: 8px; }
.cal-head { display: flex; align-items: center; gap: 6px; }
.cal-head b { flex: 1; text-align: center; text-transform: capitalize; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.wd { text-align: center; font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 700; }
.cal-day { flex-direction: column; gap: 3px; padding: 4px 0; min-height: 40px; border-radius: 8px; border-color: transparent; background: var(--panel2); font-weight: 600; }
.cal-day.out { background: none; color: var(--muted); opacity: .5; font-weight: 400; }
.cal-day.today { border-color: var(--accent); color: var(--accent); }
.cal-day.sel { background: var(--accent); color: #fff; }
.dots { display: flex; gap: 2px; min-height: 5px; }
.dots i { width: 5px; height: 5px; border-radius: 50%; }
.cal-sub { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
.linklike { background: none; border: 0; padding: 0; color: var(--accent); text-transform: none; letter-spacing: 0; }
.agenda { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.agenda > li.none { color: var(--muted); background: none; border: 0; }
.agenda > li { border-radius: 10px; background: var(--panel2); border-left: 4px solid var(--c); }
.agenda > li.sel { outline: 1px solid var(--accent); }
.ag { width: 100%; justify-content: flex-start; gap: 10px; background: none; border: 0; text-align: left; padding: 8px 10px; }
.when { display: flex; flex-direction: column; width: 56px; flex: none; font-weight: 700; }
.when small, .what small { color: var(--muted); font-weight: 400; font-size: 12px; }
.what { display: flex; flex-direction: column; min-width: 0; }
.what b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-more { padding: 0 12px 10px 76px; }
.ev-more p { margin: 0 0 6px; white-space: pre-wrap; }
.tl { margin: 0 0 6px; padding-left: 18px; }
</style>
