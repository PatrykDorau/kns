<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'

// Dyspozycyjność w służbach („Zaangażuj się”): na najbliższe niedziele każdy zaznacza w swoich służbach
// „mogę / nie mogę / nie wiem” (kolejne kliknięcia zmieniają odpowiedź); każdy w służbie widzi tabelę osoby × niedziele,
// lider może przypomnieć tym, którzy nie uzupełnili.
const NEXT = { undefined: 'yes', yes: 'no', no: 'maybe', maybe: null }
const LABEL = { yes: 'Mogę', no: 'Nie mogę', maybe: 'Nie wiem' }
export default defineComponent({
  setup() {
    const app = useApp()
    const av = reactive({ list: [], busy: false, error: '', open: {} })
    let seq = 0 // kolejne kliknięcia — starsza odpowiedź z bazy nie nadpisuje nowszych zmian
    async function load() {
      if (!app.api.enabled) return
      const mine = ++seq
      try { const list = (await app.api.call('availability')) || []; if (mine === seq) av.list = list } catch (e) { av.error = e.message }
    }
    let reload = 0
    onMounted(load)
    async function cycle(m, d) {
      const st = NEXT[m.mine[d]]
      const before = m.mine[d]
      if (st) m.mine[d] = st; else delete m.mine[d]
      seq++
      try { await app.api.call('availabilitySet', { id: m.id, day: d, state: st }); clearTimeout(reload); reload = setTimeout(load, 900) }
      catch (e) { if (before) m.mine[d] = before; else delete m.mine[d]; av.error = e.message }
    }
    async function remind(m) {
      av.busy = true
      try { const n = await app.api.call('availabilityRemind', { id: m.id }); app.showToast(n ? 'Przypomnienie wysłane (' + n + ').' : 'Wszyscy już uzupełnili.') }
      catch (e) { av.error = e.message } finally { av.busy = false }
    }
    const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('pl', { day: 'numeric', month: 'short' })
    const count = (m, d, st) => m.people.filter(p => p.states[d] === st).length
    return { ...app, av, cycle, remind, dayLabel, count, LABEL }
  },
})
</script>

<template>
  <section class="avail">
    <div class="section"><h2>Dyspozycyjność</h2></div>
    <p v-if="!av.list.length && !av.error" class="note">Nie służysz jeszcze w żadnej służbie — zgłoś się w „Wszystkie służby”.</p>
    <p class="avail-hint">Zaznacz, w które niedziele możesz służyć — kolejne kliknięcia: <b class="st-yes">mogę</b> → <b class="st-no">nie mogę</b> → <b class="st-maybe">nie wiem</b> → puste.</p>
    <p v-if="av.error" class="error">{{ av.error }}</p>
    <article v-for="m in av.list" :key="m.id" class="avail-card">
      <div class="avail-h"><b>{{ m.name }}</b><button class="ghost small" :aria-expanded="!!av.open[m.id]" @click="av.open[m.id] = !av.open[m.id]"><svg class="i"><use href="#users"/></svg>{{ av.open[m.id] ? 'Ukryj' : 'Kto kiedy może' }}</button></div>
      <div v-if="m.member" class="avail-days" role="group" :aria-label="'Moja dyspozycyjność: ' + m.name">
        <button v-for="d in m.days" :key="d" type="button" class="avail-day" :class="m.mine[d] ? 'st-' + m.mine[d] : ''" :title="LABEL[m.mine[d]] || 'Brak odpowiedzi'" :aria-label="dayLabel(d) + ': ' + (LABEL[m.mine[d]] || 'brak odpowiedzi')" @click="cycle(m, d)">
          <small>{{ dayLabel(d) }}</small><span>{{ m.mine[d] === 'yes' ? '✓' : m.mine[d] === 'no' ? '✕' : m.mine[d] === 'maybe' ? '?' : '–' }}</span>
        </button>
      </div>
      <!-- cała służba: osoby × niedziele (lider może przypomnieć) -->
      <div v-if="av.open[m.id]" class="avail-table-wrap">
        <table class="avail-table">
          <thead><tr><th></th><th v-for="d in m.days" :key="d">{{ dayLabel(d) }}</th></tr></thead>
          <tbody>
            <tr v-for="p in m.people" :key="p.id"><th>{{ p.name }}</th><td v-for="d in m.days" :key="d" :class="p.states[d] ? 'st-' + p.states[d] : ''" :title="LABEL[p.states[d]] || 'brak'">{{ p.states[d] === 'yes' ? '✓' : p.states[d] === 'no' ? '✕' : p.states[d] === 'maybe' ? '?' : '' }}</td></tr>
            <tr class="avail-sum"><th>Mogą</th><td v-for="d in m.days" :key="d">{{ count(m, d, 'yes') }}</td></tr>
          </tbody>
        </table>
        <p v-if="!m.people.length" class="note">W tej służbie nikt jeszcze nie służy.</p>
        <button v-if="m.lead" class="small" :disabled="av.busy || !m.people.length" title="Powiadomienie dla osób, które nie zaznaczyły najbliższych 4 niedziel" @click="remind(m)"><svg class="i"><use href="#bell"/></svg>Przypomnij brakującym</button>
      </div>
    </article>
  </section>
</template>
