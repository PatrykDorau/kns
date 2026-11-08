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
export const av = reactive({ list: [], busy: false, error: '', open: {}, planning: {} })
let seq = 0 // kolejne kliknięcia — starsza odpowiedź z bazy nie nadpisuje nowszych zmian
let loading = null
// wczytanie dyspozycyjności i grafiku wszystkich moich służb (wspólne z tabelą grafiku — ScheduleTable)
export async function loadAv(app) {
  if (!app.api.enabled) return
  const mine = ++seq
  try { const list = (await app.api.call('availability')) || []; if (mine === seq) av.list = list } catch (e) { av.error = e.message }
}
export const bumpAv = () => ++seq
export default defineComponent({
  // availOnly — sama dyspozycyjność (strona służby: grafik jest w osobnej zakładce, ScheduleTable)
  props: { ministry: { type: String, required: true }, availOnly: { type: Boolean, default: false } },
  setup(props) {
    const app = useApp()
    const load = () => loadAv(app)
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
    // grafik, część 2: rola i stan zaproszenia przy osobie (new — niewysłane, sent — czeka, yes / no — odpowiedź)
    const STATE = { new: ['○', 'jeszcze nie wysłano'], sent: ['⏱', 'czeka na odpowiedź'], yes: ['✓', 'przyjął(a)'], no: ['✕', 'nie może'] }
    const info = (m, d, id) => m.detail?.[d]?.[id] || { state: 'new', role: '' }
    const lineup = (m, d) => (m.plan?.[d] || []).map(id => ({ id, name: id === m.you ? 'Ty' : m.people.find(p => p.id === id)?.name || '?', ...info(m, d, id) }))
      .sort((a, b) => ((m.roles || []).indexOf(a.role) + 1 || 99) - ((m.roles || []).indexOf(b.role) + 1 || 99))
    const unsent = m => Object.entries(m.plan || {}).reduce((n, [d, ids]) => n + ids.filter(id => info(m, d, id).state === 'new').length, 0)
    const tally = (m, d) => { const t = { yes: 0, sent: 0, no: 0, new: 0 }; for (const x of lineup(m, d)) t[x.state]++; return t }
    async function setRole(m, d, id, role) {
      ((m.detail ||= {})[d] ||= {})[id] = { ...info(m, d, id), role }
      try { await app.api.call('scheduleRole', { id: m.id, day: d, person: id, role }) } catch (e) { av.error = e.message; load() }
    }
    const rolesEdit = reactive({})
    async function saveRoles(m) {
      const roles = rolesEdit[m.id].split(',').map(x => x.trim()).filter(Boolean)
      try { await app.api.call('ministryRoles', { id: m.id, roles }); m.roles = roles; delete rolesEdit[m.id]; load() } catch (e) { av.error = e.message }
    }
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
      try { const n = await app.api.call('schedulePublish', { id: m.id }); app.showToast(n ? 'Zaproszenia wysłane (' + n + ' os.).' : 'Nie ma nowych osób do zaproszenia.'); load() }
      catch (e) { av.error = e.message } finally { av.busy = false }
    }
    const longDay = d => new Date(d + 'T12:00:00').toLocaleDateString('pl', { day: 'numeric', month: 'long' })
    // najbliższa własna służba
    const next = computed(() => { const x = m.value; return x?.member ? x.days.find(d => inPlan(x, d, x.you) && x.detail?.[d]?.[x.you]?.state === 'yes') : '' })
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
    return { ...app, av, m, STATE, lineup, unsent, tally, setRole, rolesEdit, saveRoles, cycle, locked, remind, dayLabel, longDay, count, LABEL, inPlan, planDays, names, togglePlan, publish, next, nextIn, clashes, answered, myAnswers, planned }
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
      <h4 v-if="availOnly">Kto kiedy może</h4>
      <h4 v-else>Grafik<button class="ghost small" :aria-expanded="!!av.open[m.id]" @click="av.open[m.id] = !av.open[m.id]">{{ av.open[m.id] ? 'Zwiń tabelę' : m.lead ? 'Ułóż grafik' : 'Kto kiedy może' }}<svg class="i"><use href="#down"/></svg></button></h4>
      <p v-if="!availOnly && planDays.length && m.lead" class="ap-legend"><span><i class="st-yes">✓</i> przyjął</span><span><i class="st-sent">⏱</i> czeka</span><span><i class="st-no">✕</i> nie może</span><span><i>○</i> nie wysłano</span></p>
      <p v-if="!availOnly && !planDays.length && !av.open[m.id]" class="av-empty">Grafik nie jest jeszcze ułożony.</p>
      <!-- przy otwartej tabeli lista jest pod nią, żeby nowe wiersze nie przesuwały komórek pod palcem -->
      <div v-if="!availOnly && planDays.length && !av.open[m.id]" class="avail-plan">
        <div v-for="d in planDays" :key="d" class="ap-row" :class="{ me: inPlan(m, d, m.you) }"><b>{{ dayLabel(d) }}</b>
            <span class="ap-pills"><span v-for="x in lineup(m, d)" :key="x.id" class="ap-pill" :class="'st-' + x.state" :title="STATE[x.state][1]"><i>{{ STATE[x.state][0] }}</i>{{ x.name }}<select v-if="m.lead && (m.roles || []).length" :value="x.role" :aria-label="'Rola: ' + x.name" @change="setRole(m, d, x.id, $event.target.value)"><option value="">bez roli</option><option v-for="r in m.roles" :key="r">{{ r }}</option></select><em v-else-if="x.role">{{ x.role }}</em></span></span>
            <small v-if="m.lead" class="ap-tally"><span v-if="tally(m, d).yes" class="st-yes">✓{{ tally(m, d).yes }}</span><span v-if="tally(m, d).sent" class="st-sent">⏱{{ tally(m, d).sent }}</span><span v-if="tally(m, d).no" class="st-no">✕{{ tally(m, d).no }}</span></small></div>
      </div>
      <p v-if="av.error" class="error">{{ av.error }}</p>
      <template v-if="availOnly || av.open[m.id]">
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
        <div v-if="m.lead && !availOnly" class="ap-roles"><template v-if="rolesEdit[m.id] !== undefined"><input v-model="rolesEdit[m.id]" placeholder="np. Wokal, Gitara, Bas, Perkusja" aria-label="Role w służbie, po przecinku" @keydown.enter="saveRoles(m)"><button class="small primary" @click="saveRoles(m)">Zapisz</button></template><template v-else><small>Role: {{ (m.roles || []).join(', ') || 'brak' }}</small><button class="ghost small" @click="rolesEdit[m.id] = (m.roles || []).join(', ')">Zmień</button></template></div>
        <p v-if="m.lead && !availOnly && av.planning[m.id]" class="avail-hint">Stuknij komórkę, żeby dodać osobę do grafiku albo ją zdjąć.</p>
        <div v-if="m.lead && !availOnly" class="avail-lead">
          <button class="small" :class="{ primary: av.planning[m.id] }" :aria-pressed="!!av.planning[m.id]" :disabled="!m.people.length" title="Klikaj komórki tabeli: osoba → niedziela" @click="av.planning[m.id] = !av.planning[m.id]"><svg class="i"><use :href="av.planning[m.id] ? '#check' : '#calendar'"/></svg>{{ av.planning[m.id] ? 'Gotowe' : 'Układam grafik' }}</button>
          <button class="small" :class="{ primary: !av.planning[m.id] && unsent(m) }" :disabled="av.busy || !unsent(m)" title="Nowe osoby z grafiku dostaną zaproszenie: Przyjmuję / Nie mogę" @click="publish(m)"><svg class="i"><use href="#megaphone"/></svg>Wyślij zaproszenia<template v-if="unsent(m)"> ({{ unsent(m) }})</template></button>
        </div>
        <p v-for="c in clashes" :key="c.id" class="av-clash"><svg class="i"><use href="#warn"/></svg><span><b>{{ c.name }}: „nie mogę”, a w grafiku</b><small>{{ c.days.map(dayLabel).join(', ') }} · {{ m.lead ? 'zmień grafik albo ustal to z tą osobą' : 'ustal zmianę z liderem' }}</small></span></p>
        <div v-if="!availOnly && planDays.length" class="avail-plan">
          <div v-for="d in planDays" :key="d" class="ap-row" :class="{ me: inPlan(m, d, m.you) }"><b>{{ dayLabel(d) }}</b>
            <span class="ap-pills"><span v-for="x in lineup(m, d)" :key="x.id" class="ap-pill" :class="'st-' + x.state" :title="STATE[x.state][1]"><i>{{ STATE[x.state][0] }}</i>{{ x.name }}<select v-if="m.lead && (m.roles || []).length" :value="x.role" :aria-label="'Rola: ' + x.name" @change="setRole(m, d, x.id, $event.target.value)"><option value="">bez roli</option><option v-for="r in m.roles" :key="r">{{ r }}</option></select><em v-else-if="x.role">{{ x.role }}</em></span></span>
            <small v-if="m.lead" class="ap-tally"><span v-if="tally(m, d).yes" class="st-yes">✓{{ tally(m, d).yes }}</span><span v-if="tally(m, d).sent" class="st-sent">⏱{{ tally(m, d).sent }}</span><span v-if="tally(m, d).no" class="st-no">✕{{ tally(m, d).no }}</span></small></div>
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

/* grafik, część 2: osoby jako pigułki ze stanem zaproszenia i rolą */
.ap-row { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 8px 0; border-top: 1px solid var(--line); }
.ap-row:first-child { border-top: 0; }
.ap-row > b { padding-top: 5px; font-size: 14px; }
.ap-row.me > b { color: var(--accent-text); }
.ap-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ap-pill { color: var(--text) !important; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 6px; border-radius: 999px; background: var(--panel2); font-size: 13.5px; font-weight: 500; }
.ap-pill i { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font-style: normal; font-size: 11px; font-weight: 700; background: var(--panel3); color: var(--muted); }
.ap-pill em { font-style: normal; color: var(--muted); }
.ap-pill select { min-height: 0 !important; padding: 0 24px 0 8px !important; background-position: right 6px center !important; height: 24px; font-size: 12.5px; border-radius: 8px !important; background-color: transparent !important; }
.ap-pill.st-yes i { background: var(--ok-soft); color: var(--ok-text); }
.ap-pill.st-sent i { background: var(--accent-soft); color: var(--accent-text); }
.ap-pill.st-no { text-decoration: line-through; color: var(--muted) !important; }
.ap-pill.st-no i { background: var(--bad-soft); color: var(--bad-text); }
.ap-tally { display: flex; gap: 8px; padding-top: 5px; font-size: 13px; font-weight: 600; }
.ap-tally .st-yes, .ap-legend .st-yes { color: var(--ok-text); } .ap-tally .st-sent, .ap-legend .st-sent { color: var(--accent-text); } .ap-tally .st-no, .ap-legend .st-no { color: var(--bad-text); }
.ap-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 6px; color: var(--muted); font-size: 12.5px; }
.ap-legend i { font-style: normal; font-weight: 700; }
.ap-roles { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.ap-roles small { color: var(--muted); font-size: 13px; }
.ap-roles input { flex: 1; min-width: 0; }
</style>
