<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Zaproszenia do służby (wzór: Avenit) — na Starcie i w „Moja służba”: lider wpisał w grafik i kliknął „Wyślij
// zaproszenia”, osoba odpowiada „Przyjmuję / Nie mogę” (można zmienić zdanie). Przyjęte — krótka lista „Służysz”.
// Dane wspólne dla wszystkich miejsc (jedno zapytanie), odświeżane po odpowiedzi.
export const duties = reactive({ list: [], loaded: false, busy: '' })
let loading = null
export function loadDuties(app) {
  if (!app.api.enabled) return Promise.resolve()
  if (!loading) loading = app.api.call('myDuties').then(l => { duties.list = l || []; duties.loaded = true }).catch(() => null).finally(() => { setTimeout(() => { loading = null }, 800) })
  return loading
}

export default defineComponent({
  props: { compact: { type: Boolean, default: false } }, // na Starcie: tylko zaproszenia i najbliższa przyjęta
  setup(props) {
    const app = useApp()
    onMounted(() => loadDuties(app))
    const key = d => d.id + d.day
    const pending = computed(() => duties.list.filter(d => d.state === 'sent'))
    const taken = computed(() => duties.list.filter(d => d.state !== 'sent').slice(0, props.compact ? 0 : 8))
    const when = d => {
      const n = Math.round((new Date(d + 'T12:00').getTime() - new Date(app.todayStr.value + 'T12:00').getTime()) / 864e5)
      const date = new Date(d + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' })
      return date + (n <= 0 ? ' · dziś' : n === 1 ? ' · jutro' : n < 7 ? ' · za ' + n + ' dni' : '')
    }
    async function answer(d, ok) {
      // rezygnacja zawiadamia lidera — najpierw potwierdzenie (przyjęcie bez pytania)
      if (!ok && !(await ask((d.state === 'yes' ? 'Zrezygnować ze służby' : 'Odmówić służby') + ' „' + d.name + (d.role ? ' · ' + d.role : '') + '” — ' + when(d.day) + '? Lider dostanie powiadomienie, że nie możesz.', { ok: 'Nie mogę', danger: true }))) return
      duties.busy = key(d)
      try {
        await app.api.call('scheduleAnswer', { id: d.id, day: d.day, ok })
        d.state = ok ? 'yes' : 'no'
        app.showToast(ok ? 'Dziękujemy! Służba przyjęta.' : 'Lider dostał informację, że nie możesz.')
        loadDuties(app)
      } catch (e) { app.showToast(e.message) } finally { duties.busy = '' }
    }
    return { duties, pending, taken, when, answer, key }
  },
})
</script>

<template>
  <div v-if="pending.length || taken.length" class="dv">
    <article v-for="d in pending" :key="key(d)" class="dv-inv">
      <span class="dv-ic"><svg class="i"><use href="#serve"/></svg></span>
      <div class="dv-txt">
        <small>Zaproszenie do służby</small>
        <b>{{ d.name }}<em v-if="d.role"> · {{ d.role }}</em></b>
        <span>{{ when(d.day) }}</span>
      </div>
      <div class="dv-acts">
        <button class="dv-yes" :disabled="duties.busy === key(d)" @click="answer(d, true)"><svg class="i"><use href="#check"/></svg>Przyjmuję</button>
        <button class="dv-no" :disabled="duties.busy === key(d)" @click="answer(d, false)"><svg class="i"><use href="#x"/></svg>Nie mogę</button>
      </div>
    </article>
    <div v-if="taken.length" class="dv-list">
      <p v-for="d in taken" :key="key(d)" :class="'dr-' + d.state">
        <i :title="d.state === 'yes' ? 'przyjęte' : 'odmówione'">{{ d.state === 'yes' ? '✓' : '✕' }}</i>
        <span><b>{{ d.name }}<em v-if="d.role"> · {{ d.role }}</em></b><small>{{ when(d.day) }}</small></span>
        <button class="ghost small" :disabled="duties.busy === key(d)" @click="answer(d, d.state !== 'yes')">{{ d.state === 'yes' ? 'Jednak nie mogę' : 'Jednak mogę' }}</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.dv { display: grid; gap: 10px; margin-bottom: 14px; }
.dv-inv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 14px; align-items: center; padding: 16px; border-radius: 20px;
  background: linear-gradient(135deg, rgba(242, 165, 60, .2), rgba(242, 165, 60, .06)), var(--panel); border: 1px solid rgba(242, 165, 60, .35); }
.dv-ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: var(--accent); color: #2a1906; }
.dv-ic svg.i { width: 22px; height: 22px; }
.dv-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dv-txt small { color: var(--accent-text); font-size: 13px; font-weight: 600; }
.dv-txt b { font-size: 18px; line-height: 1.25; }
.dv-txt em { font-style: normal; font-weight: 500; color: var(--muted); }
.dv-txt span { color: var(--muted); font-size: 14px; }
.dv-acts { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.dv-acts button { min-height: 46px; justify-content: center; font-weight: 600 !important; font-size: 15px; border: 0 !important; }
.dv-yes { background: var(--ok) !important; color: #0e2416 !important; }
.dv-no { background: var(--panel2) !important; color: var(--text) !important; }
.dv-list { display: grid; gap: 2px; }
.dv-list p { display: flex; align-items: center; gap: 12px; margin: 0; padding: 8px 4px; }
.dv-list i { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; font-style: normal; font-weight: 700; font-size: 13px; }
.dv-list .dr-yes i { background: var(--ok-soft); color: var(--ok-text); }
.dv-list .dr-no i { background: var(--bad-soft); color: var(--bad-text); }
.dv-list span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dv-list b { font-size: 15px; }
.dv-list em { font-style: normal; font-weight: 500; color: var(--muted); }
.dv-list small { color: var(--muted); font-size: 13px; }
@media (min-width: 700px) {
  .dv-inv { grid-template-columns: auto minmax(0, 1fr) auto; }
  .dv-acts { grid-column: auto; margin-top: 0; grid-template-columns: auto auto; }
  .dv-acts button { padding: 0 18px; }
}
</style>
