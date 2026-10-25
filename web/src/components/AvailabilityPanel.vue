<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'

// Dyspozycyjność jednej służby (karta w „Moja służba”): na najbliższe niedziele każdy zaznacza
// „mogę / nie mogę / nie wiem” (kolejne kliknięcia zmieniają odpowiedź); każdy w służbie widzi tabelę osoby × niedziele,
// lider może przypomnieć tym, którzy nie uzupełnili. Dane wszystkich służb wczytywane raz, wspólne dla kart.
// Grafik (#50): lider w tabeli włącza „Układam grafik” i klika komórki (osoba → niedziela), „Wyślij grafik” —
// każdy dostaje powiadomienie ze swoimi niedzielami; wszyscy w służbie widzą grafik, swoje niedziele — wyróżnione.
const NEXT = { undefined: 'yes', yes: 'no', no: 'maybe', maybe: null }
const LABEL = { yes: 'Mogę', no: 'Nie mogę', maybe: 'Nie wiem' }
const av = reactive({ list: [], busy: false, error: '', open: {}, planning: {} })
let seq = 0 // kolejne kliknięcia — starsza odpowiedź z bazy nie nadpisuje nowszych zmian
let loading = null
export default defineComponent({
  props: { ministry: { type: String, required: true } },
  setup(props) {
    const app = useApp()
    async function load() {
      if (!app.api.enabled) return
      const mine = ++seq
      try { const list = (await app.api.call('availability')) || []; if (mine === seq) av.list = list } catch (e) { av.error = e.message }
    }
    let reload = 0
    // kilka kart naraz — jedno zapytanie
    onMounted(() => { if (!loading) loading = load().finally(() => setTimeout(() => { loading = null }, 1000)) })
    const m = computed(() => av.list.find(x => x.id === props.ministry))
    // w grafiku i potwierdzone „mogę” — zmianę ustala się z liderem (blokada też w bazie)
    const locked = (m, d) => inPlan(m, d, m.you) && m.mine[d] === 'yes'
    async function cycle(m, d) {
      if (locked(m, d)) { av.error = 'Na tę niedzielę jesteś w grafiku — zmianę ustal z liderem służby.'; return }
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
    // grafik
    const inPlan = (m, d, id) => (m.plan?.[d] || []).includes(id)
    const planDays = computed(() => (m.value?.days || []).filter(d => (m.value.plan?.[d] || []).length))
    const names = (m, d) => (m.plan?.[d] || []).map(id => m.people.find(p => p.id === id)?.name || '?').join(', ')
    async function togglePlan(m, d, p) {
      if (!m.plan) m.plan = {}
      const list = m.plan[d] || (m.plan[d] = []), i = list.indexOf(p.id)
      if (i >= 0) list.splice(i, 1); else list.push(p.id) // od razu na ekranie
      seq++
      try { await app.api.call('scheduleToggle', { id: m.id, day: d, person: p.id }); clearTimeout(reload); reload = setTimeout(load, 900) }
      catch (e) { av.error = e.message; load() }
    }
    async function publish(m) {
      av.busy = true
      try { const n = await app.api.call('schedulePublish', { id: m.id }); app.showToast(n ? 'Grafik wysłany (' + n + ' os.).' : 'W grafiku nikogo jeszcze nie ma.') }
      catch (e) { av.error = e.message } finally { av.busy = false }
    }
    return { ...app, av, m, cycle, locked, remind, dayLabel, count, LABEL, inPlan, planDays, names, togglePlan, publish }
  },
})
</script>

<template>
  <div v-if="m" class="mm-sec avail">
    <div class="avail-h"><small class="mm-lbl">Dyspozycyjność</small><button class="ghost small" :aria-expanded="!!av.open[m.id]" @click="av.open[m.id] = !av.open[m.id]"><svg class="i"><use href="#users"/></svg>{{ av.open[m.id] ? 'Ukryj' : 'Kto kiedy może' }}</button></div>
    <template v-if="m.member">
      <p class="avail-hint">Kliknij niedzielę: <b class="st-yes">mogę</b> → <b class="st-no">nie mogę</b> → <b class="st-maybe">nie wiem</b> → puste.</p>
      <div class="avail-days" role="group" :aria-label="'Moja dyspozycyjność: ' + m.name">
        <button v-for="d in m.days" :key="d" type="button" class="avail-day" :class="[m.mine[d] ? 'st-' + m.mine[d] : '', { planned: inPlan(m, d, m.you), locked: locked(m, d) }]" :aria-disabled="locked(m, d)" :title="(LABEL[m.mine[d]] || 'Brak odpowiedzi') + (locked(m, d) ? ' · w grafiku — zmianę ustal z liderem' : inPlan(m, d, m.you) ? ' · w grafiku' : '')" :aria-label="dayLabel(d) + ': ' + (LABEL[m.mine[d]] || 'brak odpowiedzi') + (inPlan(m, d, m.you) ? ', jesteś w grafiku' : '')" @click="cycle(m, d)">
          <small>{{ dayLabel(d) }}</small><span>{{ m.mine[d] === 'yes' ? '✓' : m.mine[d] === 'no' ? '✕' : m.mine[d] === 'maybe' ? '?' : '–' }}</span>
          <em v-if="inPlan(m, d, m.you)" class="avail-plan-tag">{{ locked(m, d) ? '🔒 grafik' : 'grafik' }}</em>
        </button>
      </div>
    </template>
    <!-- grafik: kto w którą niedzielę -->
    <div v-if="planDays.length" class="avail-plan">
      <small class="mm-lbl">Grafik</small>
      <p v-for="d in planDays" :key="d" :class="{ me: inPlan(m, d, m.you) }"><b>{{ dayLabel(d) }}</b><span>{{ names(m, d) }}</span></p>
    </div>
    <p v-if="av.error" class="error">{{ av.error }}</p>
    <!-- cała służba: osoby × niedziele (lider może przypomnieć) -->
    <div v-if="av.open[m.id]" class="avail-table-wrap">
      <table class="avail-table">
        <thead><tr><th></th><th v-for="d in m.days" :key="d">{{ dayLabel(d) }}</th></tr></thead>
        <tbody>
          <tr v-for="p in m.people" :key="p.id"><th>{{ p.name }}</th>
            <td v-for="d in m.days" :key="d" :class="[p.states[d] ? 'st-' + p.states[d] : '', { planned: inPlan(m, d, p.id), pick: av.planning[m.id] }]" :title="(LABEL[p.states[d]] || 'brak') + (inPlan(m, d, p.id) ? ' · w grafiku' : '') + (av.planning[m.id] ? ' — kliknij: do grafiku / z grafiku' : '')"
                @click="av.planning[m.id] && togglePlan(m, d, p)">{{ p.states[d] === 'yes' ? '✓' : p.states[d] === 'no' ? '✕' : p.states[d] === 'maybe' ? '?' : '' }}</td></tr>
          <tr class="avail-sum"><th>Mogą</th><td v-for="d in m.days" :key="d">{{ count(m, d, 'yes') }}</td></tr>
        </tbody>
      </table>
      <p v-if="!m.people.length" class="note">W tej służbie nikt jeszcze nie służy.</p>
      <div v-if="m.lead" class="avail-lead">
        <button class="small" :disabled="av.busy || !m.people.length" title="Powiadomienie dla osób, które nie zaznaczyły najbliższych 4 niedziel" @click="remind(m)"><svg class="i"><use href="#bell"/></svg>Przypomnij brakującym</button>
        <button class="small" :class="{ primary: av.planning[m.id] }" :aria-pressed="!!av.planning[m.id]" :disabled="!m.people.length" title="Klikaj komórki tabeli: osoba → niedziela (wyróżnione obwódką)" @click="av.planning[m.id] = !av.planning[m.id]"><svg class="i"><use href="#calendar"/></svg>{{ av.planning[m.id] ? 'Gotowe' : 'Układam grafik' }}</button>
        <button class="small" :disabled="av.busy || !planDays.length" title="Każdy z grafiku dostanie powiadomienie ze swoimi niedzielami" @click="publish(m)"><svg class="i"><use href="#megaphone"/></svg>Wyślij grafik</button>
      </div>
      <p v-if="m.lead && av.planning[m.id]" class="avail-hint">Kliknij komórkę, żeby dodać osobę do grafiku na tę niedzielę (albo ją zdjąć). Po ułożeniu — „Wyślij grafik”.</p>
    </div>
  </div>
</template>
