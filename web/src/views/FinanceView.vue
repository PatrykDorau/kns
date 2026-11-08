<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Finanse służb (wzór: Avenit, bez płatności online): roczny plan każdej służby, wydatki i pasek realizacji.
// Lider widzi swoją służbę i wpisuje wydatki; rada i administrator widzą wszystkie i ustalają plany.
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ year: new Date().getFullYear(), data: null, error: '', busy: false, open: '', plan: {}, add: {} })
    async function load() {
      st.error = ''
      try { st.data = await app.api.call('finance', { year: st.year }) } catch (e) { st.error = e.message }
    }
    onMounted(load)
    const list = computed(() => st.data?.ministries || [])
    const sum = k => list.value.reduce((n, m) => n + +m[k], 0)
    const zl = n => (Math.round(+n * 100) / 100).toLocaleString('pl', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' zł'
    const pct = m => (+m.planned ? Math.round(+m.spent / +m.planned * 100) : 0)
    const year = d => { st.year += d; st.open = ''; load() }
    function startAdd(m) { st.add[m.id] = { day: app.todayStr.value, amount: '', title: '' } }
    async function addExpense(m) {
      const f = st.add[m.id]
      st.busy = true; st.error = ''
      try { await app.api.call('financeExpense', { id: m.id, ...f, amount: +String(f.amount).replace(',', '.') }); delete st.add[m.id]; await load() } catch (e) { st.error = e.message } finally { st.busy = false }
    }
    async function savePlan(m) {
      st.busy = true; st.error = ''
      try { await app.api.call('financePlan', { id: m.id, year: st.year, amount: +String(st.plan[m.id]).replace(',', '.') || 0, note: m.note || '' }); delete st.plan[m.id]; await load() } catch (e) { st.error = e.message } finally { st.busy = false }
    }
    async function remove(e) {
      if (!(await ask('Usunąć wydatek „' + e.title + '” (' + zl(e.amount) + ')?', { ok: 'Usuń', danger: true }))) return
      try { await app.api.call('financeExpenseDelete', { id: e.id }); await load() } catch (x) { st.error = x.message }
    }
    return { ...app, st, list, sum, zl, pct, year, startAdd, addExpense, savePlan, remove }
  },
})
</script>

<template>
  <div class="fn-top">
    <div class="fn-year"><button class="icon" aria-label="Poprzedni rok" @click="year(-1)"><svg class="i"><use href="#back"/></svg></button><b>{{ st.year }}</b><button class="icon" aria-label="Następny rok" @click="year(1)"><svg class="i" style="transform: scaleX(-1)"><use href="#back"/></svg></button></div>
    <p class="fn-who">{{ st.data?.all ? 'Wszystkie służby' : 'Służby, którymi kierujesz' }}</p>
  </div>
  <p v-if="st.error" class="error">{{ st.error }}</p>
  <template v-if="st.data">
    <p v-if="!list.length" class="note">Finanse widzi lider służby (swojej) oraz rada i administrator. Nie kierujesz żadną służbą.</p>
    <div v-else class="fn-tiles">
      <div class="fn-tile"><small>Plan na {{ st.year }}</small><b>{{ zl(sum('planned')) }}</b></div>
      <div class="fn-tile spent"><small>Wydano</small><b>{{ zl(sum('spent')) }}</b></div>
      <div class="fn-tile" :class="sum('planned') - sum('spent') < 0 ? 'over' : 'left'"><small>{{ sum('planned') - sum('spent') < 0 ? 'Ponad plan' : 'Zostało' }}</small><b>{{ zl(Math.abs(sum('planned') - sum('spent'))) }}</b></div>
    </div>

    <article v-for="m in list" :key="m.id" class="fn-card card">
      <button class="fn-head" :aria-expanded="st.open === m.id" @click="st.open = st.open === m.id ? '' : m.id">
        <span class="fn-name"><b>{{ m.name }}</b><small>{{ zl(m.spent) }}{{ +m.planned ? ' z ' + zl(m.planned) : ' · bez planu' }}</small></span>
        <span v-if="+m.planned" class="fn-pct" :class="{ over: pct(m) > 100 }">{{ pct(m) }}%</span>
        <svg class="i fn-chev"><use href="#down"/></svg>
      </button>
      <div class="fn-bar" :class="{ over: pct(m) > 100 }"><span :style="{ width: Math.min(100, pct(m)) + '%' }"></span></div>

      <div v-if="st.open === m.id" class="fn-body">
        <div v-if="st.data.all" class="fn-plan">
          <template v-if="st.plan[m.id] !== undefined">
            <input v-model="st.plan[m.id]" inputmode="decimal" placeholder="Plan na rok (zł)" aria-label="Plan na rok w złotych" @keydown.enter="savePlan(m)">
            <button class="primary small" :disabled="st.busy" @click="savePlan(m)">Zapisz plan</button>
          </template>
          <button v-else class="small" @click="st.plan[m.id] = +m.planned || ''"><svg class="i"><use href="#pencil"/></svg>{{ +m.planned ? 'Zmień plan' : 'Ustal plan na ' + st.year }}</button>
        </div>
        <form v-if="st.add[m.id]" class="fn-add" @submit.prevent="addExpense(m)">
          <input v-model="st.add[m.id].title" maxlength="200" placeholder="Na co? np. struny, pizza na spotkanie" aria-label="Na co" required>
          <input v-model="st.add[m.id].amount" inputmode="decimal" placeholder="Kwota zł" aria-label="Kwota w złotych" required>
          <input v-model="st.add[m.id].day" type="date" aria-label="Data">
          <button class="primary" :disabled="st.busy">Dodaj</button>
          <button type="button" @click="delete st.add[m.id]">Anuluj</button>
        </form>
        <button v-else class="small" @click="startAdd(m)"><svg class="i"><use href="#plus"/></svg>Dodaj wydatek</button>
        <p v-if="!m.expenses.length" class="note">W {{ st.year }} nie ma jeszcze wydatków.</p>
        <div v-else class="fn-list">
          <p v-for="e in m.expenses" :key="e.id"><span><b>{{ e.title }}</b><small>{{ shortDate(e.day) }} · {{ e.by }}</small></span><em>{{ zl(e.amount) }}</em>
            <button v-if="e.mine || st.data.all" class="icon" :aria-label="'Usuń wydatek ' + e.title" @click="remove(e)"><svg class="i"><use href="#trash"/></svg></button></p>
        </div>
      </div>
    </article>
  </template>
  <p v-else-if="!st.error" class="note">Wczytywanie…</p>
</template>

<style scoped>
.fn-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.fn-year { display: flex; align-items: center; gap: 6px; }
.fn-year b { font-size: 20px; min-width: 56px; text-align: center; }
.fn-who { margin: 0; color: var(--muted); font-size: 14px; }
.fn-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.fn-tile { padding: 14px; border-radius: 18px; background: var(--panel); display: flex; flex-direction: column; gap: 4px; }
.fn-tile small { color: var(--muted); font-size: 13px; }
.fn-tile b { font-size: clamp(16px, 4vw, 24px); font-variant-numeric: tabular-nums; }
.fn-tile.spent { background: var(--accent-soft); }
.fn-tile.left b { color: var(--ok-text); }
.fn-tile.over { background: var(--bad-soft); }
.fn-tile.over b { color: var(--bad-text); }
.fn-card { display: block !important; padding: 0 !important; margin-bottom: 10px; overflow: hidden; }
.fn-head { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 16px 10px !important; background: none !important; border: 0 !important; border-radius: 0 !important; text-align: left; min-height: 0 !important; }
.fn-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fn-name b { font-size: 16px; }
.fn-name small { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.fn-pct { font-weight: 700; font-variant-numeric: tabular-nums; }
.fn-pct.over { color: var(--bad-text); }
.fn-chev { width: 18px; height: 18px; color: var(--muted); transition: transform .2s; }
.fn-head[aria-expanded=true] .fn-chev { transform: rotate(180deg); }
.fn-bar { height: 6px; margin: 0 16px 14px; border-radius: 3px; background: var(--panel2); overflow: hidden; }
.fn-bar span { display: block; height: 100%; border-radius: 3px; background: var(--ok); }
.fn-bar.over span { background: var(--bad); }
.fn-body { display: grid; gap: 10px; padding: 0 16px 16px; }
.fn-plan { display: flex; gap: 8px; align-items: center; }
.fn-plan input { max-width: 200px; }
.fn-add { display: grid; grid-template-columns: minmax(0, 2fr) minmax(90px, 1fr) minmax(130px, 1fr) auto auto; gap: 8px; }
@media (max-width: 700px) { .fn-add { grid-template-columns: 1fr 1fr; } .fn-add > input:first-child { grid-column: 1 / -1; } }
.fn-list p { display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 0; border-top: 1px solid var(--line); }
.fn-list span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fn-list b { font-size: 14.5px; font-weight: 600; }
.fn-list small { color: var(--muted); font-size: 12.5px; }
.fn-list em { font-style: normal; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
