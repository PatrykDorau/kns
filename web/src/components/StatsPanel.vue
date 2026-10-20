<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, ref } from 'vue'
import { useApp } from '@/composables/useApp'
import { ago, bookName, bookOf, bookShort, isNewTestament, keywords, songHistory, tally } from '@/services/stats'

// Statystyki odbytych nabożeństw (do dziś): pieśni i kazania w wybranym okresie — zakładka w „Nabożeństwach”
// (jak „Statystyki” w planerze aplikacji na komputer).
const RANGES = [{ value: 'year', label: 'Ostatnie 12 miesięcy' }, { value: 'half', label: 'Ostatnie 6 miesięcy' }, { value: 'all', label: 'Cała historia' }]
export default defineComponent({
  setup() {
    const app = useApp()
    const tab = ref('songs'), range = ref('year'), showNever = ref(false)
    const today = () => app.todayStr.value
    const since = computed(() => {
      if (range.value === 'all') return ''
      const d = new Date(); d.setMonth(d.getMonth() - (range.value === 'year' ? 12 : 6))
      return d.toISOString().slice(0, 10)
    })
    const held = computed(() => app.services.value.filter(s => s.date && s.date <= today() && s.date >= since.value))
    const short = d => new Date(d + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'short', year: '2-digit' })
    // pieśni
    const history = computed(() => songHistory(held.value, app.songs.value))
    const top = computed(() => [...history.value.values()].sort((a, b) => b.count - a.count || b.dates[0].localeCompare(a.dates[0])).slice(0, 15))
    const plays = computed(() => [...history.value.values()].reduce((n, r) => n + r.count, 0))
    const allHistory = computed(() => songHistory(app.services.value.filter(s => s.date && s.date <= today()), app.songs.value))
    const forgotten = computed(() => [...allHistory.value.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0])).slice(0, 12))
    const never = computed(() => app.songs.value.filter(s => !allHistory.value.has(s.id)).sort((a, b) => ((+a.number || 1e9) - (+b.number || 1e9)) || a.title.localeCompare(b.title, 'pl')))
    const songTitle = s => (s.number ? s.number + '. ' : '') + s.title
    // kazania
    const sermons = computed(() => held.value.filter(s => (s.sermonTitle || '').trim() || (s.passage || '').trim()))
    const books = computed(() => tally(sermons.value.map(s => bookOf(s.passage)).filter(i => i >= 0)).map(r => ({ ...r, name: bookShort(r.label) + ' · ' + bookName(r.label) })))
    const testament = computed(() => {
      const all = sermons.value.map(s => bookOf(s.passage)).filter(i => i >= 0)
      const nt = all.filter(isNewTestament).length
      return { ot: all.length - nt, nt, total: all.length }
    })
    const speakers = computed(() => tally(sermons.value.map(s => (s.speaker || '').trim())))
    const words = computed(() => keywords(sermons.value.map(s => s.sermonTitle)))
    const pct = (n, max) => Math.max(3, Math.round((n / (max || 1)) * 100)) + '%'
    return { ...app, RANGES, tab, range, showNever, held, short, history, top, plays, forgotten, never, songTitle, sermons, books, testament, speakers, words, pct, ago, today }
  },
})
</script>

<template>
  <div class="st-top">
    <div class="chips" role="tablist">
      <button class="chipbtn" role="tab" :class="{ on: tab === 'songs' }" :aria-selected="tab === 'songs'" @click="tab = 'songs'"><svg class="i"><use href="#music"/></svg>Pieśni</button>
      <button class="chipbtn" role="tab" :class="{ on: tab === 'sermons' }" :aria-selected="tab === 'sermons'" @click="tab = 'sermons'"><svg class="i"><use href="#book"/></svg>Kazania</button>
    </div>
    <UiSelect v-model="range" label="Okres" :options="RANGES" class="st-range" />
  </div>

  <div class="st-tiles">
    <div class="st-tile"><b>{{ held.length }}</b><span>nabożeństw</span></div>
    <template v-if="tab === 'songs'">
      <div class="st-tile"><b>{{ history.size }}</b><span>różnych pieśni</span></div>
      <div class="st-tile"><b>{{ plays }}</b><span>wykonań</span></div>
      <div class="st-tile"><b>{{ never.length }}</b><span>jeszcze nieśpiewanych</span></div>
    </template>
    <template v-else>
      <div class="st-tile"><b>{{ sermons.length }}</b><span>kazań</span></div>
      <div class="st-tile"><b>{{ testament.total ? Math.round(testament.nt / testament.total * 100) : 0 }}%</b><span>z Nowego Testamentu</span></div>
      <div class="st-tile"><b>{{ speakers.length }}</b><span>mówców</span></div>
    </template>
  </div>

  <p v-if="!held.length" class="note">W tym okresie nie ma jeszcze odbytych nabożeństw.</p>

  <div v-else-if="tab === 'songs'" class="st-grid">
    <section class="st-card">
      <h3>Najczęściej śpiewane</h3>
      <p v-if="!top.length" class="note">W tym okresie nabożeństwa nie miały wpisanych pieśni.</p>
      <ol class="st-bars">
        <li v-for="r in top" :key="r.key" :title="'Śpiewana: ' + r.dates.map(short).join(', ')">
          <span class="bl">{{ songTitle(r) }}</span><span class="track"><i :style="{ width: pct(r.count, top[0]?.count) }"></i></span><span class="bv">{{ r.count }}×</span>
        </li>
      </ol>
    </section>
    <section class="st-card">
      <h3>Dawno nieśpiewane</h3>
      <p class="note">Z całej historii — od najdawniej śpiewanej.</p>
      <ol class="st-list"><li v-for="r in forgotten" :key="r.key"><span>{{ songTitle(r) }}</span><small>{{ ago(r.dates[0], today()) }} · {{ r.count }}×</small></li></ol>
      <h3 class="mt">Jeszcze nieśpiewane · {{ never.length }}</h3>
      <button v-if="never.length" class="small" @click="showNever = !showNever">{{ showNever ? 'Schowaj' : 'Pokaż listę' }}</button>
      <ol v-if="showNever" class="st-list"><li v-for="s in never" :key="s.id"><span>{{ songTitle(s) }}</span></li></ol>
    </section>
  </div>

  <div v-else class="st-grid">
    <section class="st-card">
      <h3>Księgi Biblii</h3>
      <p v-if="!books.length" class="note">Brak rozpoznanych fragmentów — wpisuj je jak „J 3,16–21”.</p>
      <ol class="st-bars"><li v-for="r in books" :key="r.label"><span class="bl">{{ r.name }}</span><span class="track"><i :style="{ width: pct(r.n, books[0]?.n) }"></i></span><span class="bv">{{ r.n }}</span></li></ol>
      <p v-if="testament.total" class="note">Nowy Testament: {{ testament.nt }} · Stary Testament: {{ testament.ot }}</p>
    </section>
    <section class="st-card">
      <h3>Mówcy</h3>
      <ol class="st-bars"><li v-for="r in speakers" :key="r.label"><span class="bl">{{ r.label }}</span><span class="track"><i :style="{ width: pct(r.n, speakers[0]?.n) }"></i></span><span class="bv">{{ r.n }}</span></li></ol>
      <h3 class="mt">Słowa w tytułach kazań</h3>
      <p v-if="!words.length" class="note">Za mało tytułów.</p>
      <div class="st-words"><span v-for="w in words" :key="w.word" class="ann-tag">{{ w.word }} <b>{{ w.n }}</b></span></div>
    </section>
  </div>
</template>

<style scoped>
.st-top { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.st-top .chips { flex: 1; margin: 0; }
.st-range { min-width: 210px; }
.st-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 14px; }
.st-tile { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
.st-tile b { font-size: 24px; line-height: 1.1; }
.st-tile span { color: var(--muted); font-size: 12.5px; }
.st-grid { display: grid; gap: 12px; }
@media (min-width: 900px) { .st-grid { grid-template-columns: 1fr 1fr; } }
.st-card { padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
.st-card h3 { margin: 0 0 10px; font-size: 15px; }
.st-card h3.mt { margin-top: 16px; }
.st-bars, .st-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.st-bars li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(50px, 1fr) auto; align-items: center; gap: 8px; font-size: 13.5px; }
.st-bars .bl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-bars .track { height: 8px; border-radius: 4px; background: var(--panel2); overflow: hidden; }
.st-bars .track i { display: block; height: 100%; border-radius: 4px; background: var(--accent); }
.st-bars .bv { color: var(--muted); font-weight: 700; font-size: 12.5px; min-width: 28px; text-align: right; }
.st-list li { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.st-list small { color: var(--muted); white-space: nowrap; }
.st-words { display: flex; flex-wrap: wrap; gap: 6px; }
.st-words .ann-tag { font-size: 12px; }
.st-words b { color: var(--accent); margin-left: 2px; }
</style>
