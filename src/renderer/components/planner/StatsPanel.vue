<script setup>
import { computed, ref } from 'vue'
import Icon from '../common/Icon.vue'
import { services, songs, today } from '../../stores/store.js'
import { ago, bookName, bookOf, bookShort, isNewTestament, keywords, songHistory, tally } from '../../services/stats.js'

// Statystyki odbytych nabożeństw (do dziś): pieśni i kazania, w wybranym okresie.
const emit = defineEmits(['close'])
const tab = ref('songs')
const range = ref('year')
const RANGES = [['year', 'Ostatnie 12 miesięcy'], ['half', 'Ostatnie 6 miesięcy'], ['all', 'Cała historia']]

const since = computed(() => {
  if (range.value === 'all') return ''
  const d = new Date(); d.setMonth(d.getMonth() - (range.value === 'year' ? 12 : 6))
  return d.toISOString().slice(0, 10)
})
const held = computed(() => services.value.filter(s => s.date && s.date <= today() && s.date >= since.value).sort((a, b) => b.date.localeCompare(a.date)))
const short = d => new Date(d + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'short', year: '2-digit' })

/* ---------- pieśni ---------- */
const history = computed(() => songHistory(held.value, songs.value))
const top = computed(() => [...history.value.values()].sort((a, b) => b.count - a.count || b.dates[0].localeCompare(a.dates[0])).slice(0, 15))
const maxSong = computed(() => top.value[0]?.count || 1)
// Dawno nieśpiewane: z historii, od najdawniej śpiewanej — dobre kandydatki, żeby nie powtarzać wciąż tych samych.
const allHistory = computed(() => songHistory(services.value.filter(s => s.date && s.date <= today()), songs.value))
const forgotten = computed(() => [...allHistory.value.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0])).slice(0, 12))
const never = computed(() => songs.value.filter(s => !allHistory.value.has(s.id)).sort((a, b) => ((+a.number || 1e9) - (+b.number || 1e9)) || a.title.localeCompare(b.title, 'pl')))
const showNever = ref(false)
const songTitle = s => (s.number ? s.number + '. ' : '') + s.title

/* ---------- kazania ---------- */
const sermons = computed(() => held.value.filter(s => (s.sermonTitle || '').trim() || (s.passage || '').trim()))
const books = computed(() => tally(sermons.value.map(s => bookOf(s.passage)).filter(i => i >= 0)).map(r => ({ ...r, name: bookShort(r.label) + ' · ' + bookName(r.label) })))
const maxBook = computed(() => books.value[0]?.n || 1)
const testament = computed(() => {
  const all = sermons.value.map(s => bookOf(s.passage)).filter(i => i >= 0)
  const nt = all.filter(isNewTestament).length
  return { ot: all.length - nt, nt, total: all.length }
})
const speakers = computed(() => tally(sermons.value.map(s => (s.speaker || '').trim())))
const maxSpeaker = computed(() => speakers.value[0]?.n || 1)
const words = computed(() => keywords(sermons.value.map(s => s.sermonTitle)))
const pct = (n, max) => Math.max(3, Math.round((n / max) * 100)) + '%'
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal manager stats" role="dialog" aria-modal="true" aria-label="Statystyki">
      <div class="modal-head">
        <h3>Statystyki</h3>
        <div class="seg" role="tablist">
          <button role="tab" :class="{ on: tab === 'songs' }" :aria-selected="tab === 'songs'" @click="tab = 'songs'"><Icon name="music" /><span>Pieśni</span></button>
          <button role="tab" :class="{ on: tab === 'sermons' }" :aria-selected="tab === 'sermons'" @click="tab = 'sermons'"><Icon name="book" /><span>Kazania</span></button>
        </div>
        <span class="spacer"></span>
        <select v-model="range" aria-label="Okres">
          <option v-for="[id, name] in RANGES" :key="id" :value="id">{{ name }}</option>
        </select>
        <button class="iconbtn" aria-label="Zamknij" @click="emit('close')"><Icon name="x" /></button>
      </div>

      <div class="tiles">
        <div class="tile"><b>{{ held.length }}</b><span>nabożeństw w okresie</span></div>
        <template v-if="tab === 'songs'">
          <div class="tile"><b>{{ history.size }}</b><span>różnych pieśni</span></div>
          <div class="tile"><b>{{ [...history.values()].reduce((n, r) => n + r.count, 0) }}</b><span>wykonań pieśni</span></div>
          <div class="tile"><b>{{ never.length }}</b><span>pieśni z bazy jeszcze nieśpiewanych</span></div>
        </template>
        <template v-else>
          <div class="tile"><b>{{ sermons.length }}</b><span>kazań</span></div>
          <div class="tile"><b>{{ testament.total ? Math.round(testament.nt / testament.total * 100) : 0 }}%</b><span>z Nowego Testamentu ({{ testament.nt }} NT · {{ testament.ot }} ST)</span></div>
          <div class="tile"><b>{{ speakers.length }}</b><span>mówców</span></div>
        </template>
      </div>

      <div v-if="!held.length" class="empty">W tym okresie nie ma jeszcze odbytych nabożeństw.</div>

      <!-- pieśni -->
      <div v-else-if="tab === 'songs'" class="stats-grid">
        <section class="stat-card">
          <h4>Najczęściej śpiewane</h4>
          <ol class="bars">
            <li v-for="r in top" :key="r.key" :title="'Śpiewana: ' + r.dates.map(short).join(', ')">
              <span class="bl">{{ songTitle(r) }}</span>
              <span class="track"><i :style="{ width: pct(r.count, maxSong) }"></i></span>
              <span class="bv">{{ r.count }}×</span>
              <span class="bd">{{ short(r.dates[0]) }}</span>
            </li>
          </ol>
        </section>
        <section class="stat-card">
          <h4>Dawno nieśpiewane</h4>
          <p class="note">Z całej historii — od najdawniej śpiewanej.</p>
          <ol class="plain-list">
            <li v-for="r in forgotten" :key="r.key"><span>{{ songTitle(r) }}</span><small>{{ ago(r.dates[0], today()) }} · {{ r.count }}×</small></li>
          </ol>
          <h4 class="mt">Jeszcze nieśpiewane <span class="pill">{{ never.length }}</span></h4>
          <button v-if="never.length" class="small" @click="showNever = !showNever">{{ showNever ? 'Schowaj' : 'Pokaż listę' }}</button>
          <ol v-if="showNever" class="plain-list">
            <li v-for="s in never" :key="s.id"><span>{{ songTitle(s) }}</span></li>
          </ol>
        </section>
      </div>

      <!-- kazania -->
      <div v-else class="stats-grid">
        <section class="stat-card">
          <h4>Księgi Biblii</h4>
          <p v-if="!books.length" class="note">Brak rozpoznanych fragmentów — wpisuj je jak „J 3,16–21”.</p>
          <ol class="bars">
            <li v-for="r in books" :key="r.label"><span class="bl">{{ r.name }}</span><span class="track"><i :style="{ width: pct(r.n, maxBook) }"></i></span><span class="bv">{{ r.n }}</span></li>
          </ol>
          <h4 class="mt">Mówcy</h4>
          <ol class="bars">
            <li v-for="r in speakers" :key="r.label"><span class="bl">{{ r.label }}</span><span class="track"><i :style="{ width: pct(r.n, maxSpeaker) }"></i></span><span class="bv">{{ r.n }}</span></li>
          </ol>
        </section>
        <section class="stat-card">
          <h4>Słowa w tytułach kazań</h4>
          <div class="words">
            <span v-for="w in words" :key="w.word" class="word" :style="{ fontSize: 12 + Math.min(8, (w.n - 1) * 2) + 'px' }">{{ w.word }} <small>{{ w.n }}</small></span>
            <p v-if="!words.length" class="note">Brak tytułów kazań w tym okresie.</p>
          </div>
          <h4 class="mt">Kazania</h4>
          <table class="sermons">
            <tbody>
              <tr v-for="s in sermons" :key="s.id"><td>{{ short(s.date) }}</td><td>{{ s.sermonTitle || '—' }}</td><td>{{ s.passage }}</td><td>{{ s.speaker }}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
</template>
