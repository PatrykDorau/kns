<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'

// Moduły (wzór: Avenit): administrator włącza i wyłącza części aplikacji dla całego kościoła i ustala, które służby
// mają do nich dostęp (np. „Tłumaczenie” tylko dla tłumaczy). Wyłączona albo niedostępna część znika z menu, ze Startu
// i z adresów; administratorzy widzą wszystko. Zapis w ustawieniach strony (site_settings „moduly”:
// { off: [...], only: { moduł: [id służb] } }) — nowe moduły są od razu włączone dla wszystkich. Dane w bazie zostają.
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ busy: '', error: '', open: '' })
    onMounted(() => { if (!app.serve.list.length && !app.serve.busy) app.loadServe() })
    const groups = computed(() => {
      const by = {}
      for (const m of app.MODULES) (by[m.group] ||= []).push(m)
      return Object.entries(by).map(([name, list]) => ({ name, list }))
    })
    const isOff = id => (app.modules.value.off || []).includes(id)
    const onCount = computed(() => app.MODULES.filter(m => !isOff(m.id)).length)
    const only = id => app.modules.value.only?.[id] || []
    const ministries = computed(() => app.serve.list.map(m => ({ id: m.id, name: m.name })))
    const accessLabel = id => { const l = only(id); return l.length ? l.map(x => ministries.value.find(m => m.id === x)?.name || 'usunięta służba').join(', ') : 'wszyscy' }
    async function run(id, fn) {
      st.busy = id; st.error = ''
      try { await fn() } catch (e) { st.error = e.message } finally { st.busy = '' }
    }
    const toggle = m => run(m.id, () => app.setModule(m.id, isOff(m.id)))
    function pick(m, mid) {
      const cur = only(m.id)
      const next = mid === '' ? [] : cur.includes(mid) ? cur.filter(x => x !== mid) : [...cur, mid]
      run(m.id, () => app.setModuleOnly(m.id, next))
    }
    return { ...app, st, groups, onCount, isOff, only, ministries, accessLabel, toggle, pick }
  },
})
</script>

<template>
  <p class="md-lead">Włączasz tylko to, czego kościół używa, i decydujesz, które służby mają dostęp. Wyłączona albo niedostępna część znika z menu i ze Startu — dane zostają i wracają po ponownym włączeniu. Administratorzy widzą wszystko.<b> Włączonych: {{ onCount }} z {{ MODULES.length }}.</b></p>
  <p v-if="st.error" class="error">{{ st.error }}</p>
  <section v-for="g in groups" :key="g.name" class="md-group">
    <h3 class="md-h">{{ g.name }}</h3>
    <div class="md-grid">
      <article v-for="m in g.list" :key="m.id" class="md-card" :class="{ on: !isOff(m.id), open: st.open === m.id }">
        <div class="md-top">
          <span class="md-ic"><svg class="i"><use :href="'#' + m.icon"/></svg></span>
          <span class="md-txt"><b>{{ m.name }}</b><small>{{ m.desc }}</small></span>
          <button class="md-sw" role="switch" :aria-checked="!isOff(m.id)" :aria-label="(isOff(m.id) ? 'Włącz: ' : 'Wyłącz: ') + m.name" :disabled="st.busy === m.id" @click="toggle(m)"><i></i></button>
        </div>
        <button v-if="!isOff(m.id)" class="md-acc" :class="{ limited: only(m.id).length }" :aria-expanded="st.open === m.id" @click="st.open = st.open === m.id ? '' : m.id">
          <svg class="i"><use href="#users"/></svg><span>Dostęp: <b>{{ accessLabel(m.id) }}</b></span><svg class="i md-chev"><use href="#down"/></svg>
        </button>
        <div v-if="st.open === m.id && !isOff(m.id)" class="md-chips" role="group" :aria-label="'Kto ma dostęp: ' + m.name">
          <button class="filter" :class="{ on: !only(m.id).length }" :disabled="st.busy === m.id" @click="pick(m, '')">Wszyscy</button>
          <button v-for="x in ministries" :key="x.id" class="filter" :class="{ on: only(m.id).includes(x.id) }" :aria-pressed="only(m.id).includes(x.id)" :disabled="st.busy === m.id" @click="pick(m, x.id)">{{ x.name }}</button>
          <small v-if="!ministries.length" class="md-note">Wczytuję służby…</small>
          <small v-else class="md-note">Zaznacz służby — moduł zobaczą tylko ich członkowie i liderzy.</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.md-lead { margin: 0 0 16px; color: var(--muted); font-size: 15px; line-height: 1.5; }
.md-lead b { color: var(--text); font-weight: 600; }
.md-group { margin-bottom: 18px; }
.md-h { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: var(--muted); }
.md-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; align-items: start; }
.md-card { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); transition: background-color .2s, border-color .2s; }
.md-card.on { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 9%, var(--panel)); }
.md-card.open { grid-column: 1 / -1; }
.md-top { display: flex; align-items: center; gap: 12px; }
.md-ic { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--panel2); color: var(--muted); }
.md-card.on .md-ic { background: var(--accent); color: #2a1906; }
.md-ic svg.i { width: 20px; height: 20px; }
.md-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.md-txt b { font-size: 15px; font-weight: 600; }
.md-txt small { color: var(--muted); font-size: 12.5px; line-height: 1.35; }
.md-sw { flex: none; position: relative; width: 44px !important; height: 26px; min-height: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 999px !important; background: var(--panel3) !important; transition: background-color .2s; }
.md-sw i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); transition: transform .2s; }
.md-card.on .md-sw { background: var(--ok) !important; }
.md-card.on .md-sw i { transform: translateX(18px); }
.md-acc { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px !important; padding: 4px 10px !important; border: 0 !important; border-radius: 10px !important; background: var(--tint) !important; color: var(--muted) !important; font-size: 13px; font-weight: 500 !important; text-align: left; justify-content: flex-start; }
.md-acc svg.i { flex: none; width: 15px; height: 15px; }
.md-acc span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-acc b { color: var(--text); font-weight: 600; }
.md-acc.limited b { color: var(--accent-text); }
.md-chev { transition: transform .2s; }
.md-acc[aria-expanded=true] .md-chev { transform: rotate(180deg); }
.md-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.md-note { flex-basis: 100%; color: var(--muted); font-size: 12.5px; }
</style>
