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
    const longDay = d => new Date(d + 'T12:00:00').toLocaleDateString('pl', { day: 'numeric', month: 'long' })
    // najbliższa własna służba
    const next = computed(() => { const x = m.value; return x?.member ? x.days.find(d => inPlan(x, d, x.you)) : '' })
    const nextIn = computed(() => {
      if (!next.value) return ''
      const n = Math.round((new Date(next.value + 'T12:00:00').getTime() - new Date(app.todayStr.value + 'T12:00:00').getTime()) / 864e5)
      return n <= 0 ? 'dziś' : n === 1 ? 'jutro' : 'za ' + n + ' dni'
    })
    // ktoś w grafiku, choć zaznaczył „nie mogę”; lider widzi wszystkich, reszta — siebie
    const clashes = computed(() => {
      const x = m.value
      if (!x) return []
      return x.people.filter(p => x.lead || p.id === x.you).map(p => ({ id: p.id, name: p.id === x.you ? 'Ty' : p.name, days: x.days.filter(d => inPlan(x, d, p.id) && p.states[d] === 'no') })).filter(c => c.days.length)
    })
    const answered = x => x.people.filter(p => x.days.some(d => p.states[d])).length
    const myAnswers = x => x.days.filter(d => x.mine[d]).length
    const planned = (x, d) => (x.plan?.[d] || []).length
    return { ...app, av, m, cycle, locked, remind, dayLabel, longDay, count, LABEL, inPlan, planDays, names, togglePlan, publish, next, nextIn, clashes, answered, myAnswers, planned }
  },
})
</script>

<template>
  <div v-if="m" class="mm-sec avail">
    <!-- przy otwartej tabeli karty są pod nią: pojawiają się przy układaniu i nie mogą przesuwać komórek -->
    <template v-if="!av.open[m.id]">
      <div v-if="next" class="av-next"><svg class="i"><use href="#calendar"/></svg><span><b>Służysz {{ longDay(next) }}</b><small>{{ nextIn }}</small></span></div>
      <p v-for="c in clashes" :key="c.id" class="av-clash"><svg class="i"><use href="#warn"/></svg><span><b>{{ c.name }}: „nie mogę”, a w grafiku</b><small>{{ c.days.map(dayLabel).join(', ') }} · {{ m.lead ? 'zmień grafik albo ustal to z tą osobą' : 'ustal zmianę z liderem' }}</small></span></p>
    </template>

    <section v-if="m.member" class="av-block">
      <h4>Kiedy mogę<small>{{ myAnswers(m) }} z {{ m.days.length }} niedziel</small></h4>
      <div class="avail-days" role="group" :aria-label="'Moja dyspozycyjność: ' + m.name">
        <button v-for="d in m.days" :key="d" type="button" class="avail-day" :class="[m.mine[d] ? 'st-' + m.mine[d] : '', { planned: inPlan(m, d, m.you), locked: locked(m, d), clash: inPlan(m, d, m.you) && m.mine[d] === 'no' }]" :aria-disabled="locked(m, d)" :title="(LABEL[m.mine[d]] || 'Brak odpowiedzi') + (locked(m, d) ? ' · w grafiku — zmianę ustal z liderem' : inPlan(m, d, m.you) ? ' · w grafiku' : '')" :aria-label="dayLabel(d) + ': ' + (LABEL[m.mine[d]] || 'brak odpowiedzi') + (inPlan(m, d, m.you) ? ', jesteś w grafiku' : '')" @click="cycle(m, d)">
          <small>{{ dayLabel(d) }}</small><span>{{ m.mine[d] === 'yes' ? '✓' : m.mine[d] === 'no' ? '✕' : m.mine[d] === 'maybe' ? '?' : '–' }}</span>
        </button>
      </div>
      <p class="av-legend"><span><b class="st-yes">✓</b> mogę</span><span><b class="st-no">✕</b> nie mogę</span><span><b class="st-maybe">?</b> nie wiem</span><span><i></i> w grafiku</span></p>
    </section>

    <section class="av-block">
      <h4>Grafik<button class="ghost small" :aria-expanded="!!av.open[m.id]" @click="av.open[m.id] = !av.open[m.id]">{{ av.open[m.id] ? 'Zwiń tabelę' : m.lead ? 'Ułóż grafik' : 'Kto kiedy może' }}<svg class="i"><use href="#down"/></svg></button></h4>
      <p v-if="!planDays.length && !av.open[m.id]" class="av-empty">Grafik nie jest jeszcze ułożony.</p>
      <!-- przy otwartej tabeli lista jest pod nią, żeby nowe wiersze nie przesuwały komórek pod palcem -->
      <div v-if="planDays.length && !av.open[m.id]" class="avail-plan">
        <p v-for="d in planDays" :key="d" :class="{ me: inPlan(m, d, m.you) }"><b>{{ dayLabel(d) }}</b><span>{{ names(m, d) }}</span></p>
      </div>
      <p v-if="av.error" class="error">{{ av.error }}</p>
      <template v-if="av.open[m.id]">
        <div v-if="m.lead" class="av-progress">
          <span>Odpowiedziało <b>{{ answered(m) }} z {{ m.people.length }}</b></span>
          <button class="ghost small" :disabled="av.busy || !m.people.length || answered(m) === m.people.length" title="Powiadomienie dla osób, które nie zaznaczyły najbliższych 4 niedziel" @click="remind(m)"><svg class="i"><use href="#bell"/></svg>Przypomnij</button>
        </div>
        <div class="avail-table-wrap">
          <table class="avail-table" :class="{ planning: av.planning[m.id] }">
            <thead><tr><th></th><th v-for="d in m.days" :key="d">{{ dayLabel(d) }}</th></tr></thead>
            <tbody>
              <tr v-for="p in m.people" :key="p.id"><th>{{ p.name }}</th>
                <td v-for="d in m.days" :key="d" :class="[p.states[d] ? 'st-' + p.states[d] : '', { planned: inPlan(m, d, p.id), pick: av.planning[m.id], clash: inPlan(m, d, p.id) && p.states[d] === 'no' }]" :title="(LABEL[p.states[d]] || 'brak') + (inPlan(m, d, p.id) ? ' · w grafiku' : '') + (av.planning[m.id] ? ' — kliknij: do grafiku / z grafiku' : '')"
                    @click="av.planning[m.id] && togglePlan(m, d, p)">{{ p.states[d] === 'yes' ? '✓' : p.states[d] === 'no' ? '✕' : p.states[d] === 'maybe' ? '?' : '' }}</td></tr>
              <tr class="avail-sum"><th>Mogą</th><td v-for="d in m.days" :key="d">{{ count(m, d, 'yes') }}</td></tr>
              <tr class="avail-sum"><th>W grafiku</th><td v-for="d in m.days" :key="d" :class="{ on: planned(m, d) }">{{ planned(m, d) }}</td></tr>
            </tbody>
          </table>
        </div>
        <p v-if="!m.people.length" class="note">W tej służbie nikt jeszcze nie służy.</p>
        <p v-if="m.lead && av.planning[m.id]" class="avail-hint">Stuknij komórkę, żeby dodać osobę do grafiku albo ją zdjąć.</p>
        <div v-if="m.lead" class="avail-lead">
          <button class="small" :class="{ primary: av.planning[m.id] }" :aria-pressed="!!av.planning[m.id]" :disabled="!m.people.length" title="Klikaj komórki tabeli: osoba → niedziela" @click="av.planning[m.id] = !av.planning[m.id]"><svg class="i"><use :href="av.planning[m.id] ? '#check' : '#calendar'"/></svg>{{ av.planning[m.id] ? 'Gotowe' : 'Układam grafik' }}</button>
          <button class="small" :class="{ primary: !av.planning[m.id] && planDays.length }" :disabled="av.busy || !planDays.length" title="Każdy z grafiku dostanie powiadomienie ze swoimi niedzielami" @click="publish(m)"><svg class="i"><use href="#megaphone"/></svg>Wyślij grafik</button>
        </div>
        <p v-for="c in clashes" :key="c.id" class="av-clash"><svg class="i"><use href="#warn"/></svg><span><b>{{ c.name }}: „nie mogę”, a w grafiku</b><small>{{ c.days.map(dayLabel).join(', ') }} · {{ m.lead ? 'zmień grafik albo ustal to z tą osobą' : 'ustal zmianę z liderem' }}</small></span></p>
        <div v-if="planDays.length" class="avail-plan">
          <p v-for="d in planDays" :key="d" :class="{ me: inPlan(m, d, m.you) }"><b>{{ dayLabel(d) }}</b><span>{{ names(m, d) }}</span></p>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.av-next, .av-clash { display: flex; align-items: center; gap: 12px; margin: 0; padding: 12px 14px; border-radius: 14px; background: var(--panel2); }
.av-next svg.i, .av-clash svg.i { flex: none; width: 20px; height: 20px; color: var(--muted); }
.av-next span, .av-clash span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.av-next b, .av-clash b { font-size: 15px; }
.av-next small, .av-clash small { color: var(--muted); font-size: 13px; }
.av-clash { background: var(--bad-soft); }
.av-clash svg.i { color: var(--bad-text); }
.av-block { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.av-block h4 { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; margin: 0; font-size: 15px; }
.av-block h4 small { color: var(--muted); font-size: 13px; font-weight: 400; }
.av-block h4 button { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 4px 8px; font-size: 14px; }
.av-block h4 button svg.i { width: 16px; height: 16px; transition: transform .15s; }
.av-block h4 button[aria-expanded=true] svg.i { transform: rotate(180deg); }
.avail-days { display: grid; grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 6px; overflow: visible; padding: 0; }
.avail-day { min-width: 0; min-height: 60px; justify-content: center; padding: 6px 2px; border: 0; background: var(--panel2); }
.avail-day small { font-size: 12.5px; }
.avail-day.clash { box-shadow: 0 0 0 2px var(--bad-text); }
.av-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: var(--muted); font-size: 13px; }
.av-legend span { display: inline-flex; align-items: center; gap: 5px; }
.av-legend i { width: 12px; height: 12px; border-radius: 4px; box-shadow: inset 0 0 0 2px var(--accent); }
.av-empty { margin: 0; color: var(--muted); font-size: 14px; }
.av-progress { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 14px; }
.av-progress b { color: var(--text); }
.av-progress button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; font-size: 14px; }
.avail-table-wrap { margin: 0; }
.avail-table { width: 100%; margin: 0; }
.avail-table tbody th, .avail-table thead th:first-child { position: sticky; left: 0; z-index: 1; max-width: 118px; overflow: hidden; background: var(--panel); text-overflow: ellipsis; }
.avail-table td { min-width: 44px; height: 40px; }
.avail-table.planning td.pick { cursor: pointer; background: var(--panel2); }
.avail-table td.clash { box-shadow: inset 0 0 0 2px var(--bad-text); }
.avail-sum td.on { color: var(--accent-text); }
.avail-lead button { min-height: 44px; }
.avail-lead { margin: 0; }
</style>
