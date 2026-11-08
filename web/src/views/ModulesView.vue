<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, reactive } from 'vue'
import { useApp } from '@/composables/useApp'

// Moduły (wzór: Avenit): administrator włącza i wyłącza części aplikacji dla całego kościoła. Wyłączona część znika
// z menu, ze Startu i z adresów. Zapis w ustawieniach strony (site_settings „moduly”: lista wyłączonych — nowe moduły
// są więc od razu włączone). Dane w bazie zostają — po ponownym włączeniu wszystko wraca.
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ busy: '', error: '' })
    const groups = computed(() => {
      const by = {}
      for (const m of app.MODULES) (by[m.group] ||= []).push(m)
      return Object.entries(by).map(([name, list]) => ({ name, list }))
    })
    const onCount = computed(() => app.MODULES.filter(m => app.modOn(m.id)).length)
    async function toggle(m) {
      st.busy = m.id; st.error = ''
      try { await app.setModule(m.id, !app.modOn(m.id)) } catch (e) { st.error = e.message } finally { st.busy = '' }
    }
    return { ...app, st, groups, onCount, toggle }
  },
})
</script>

<template>
  <p class="md-lead">Włączasz tylko to, czego kościół używa. Wyłączona część znika z menu i ze Startu u wszystkich — dane zostają i wracają po ponownym włączeniu.<b> Włączonych: {{ onCount }} z {{ MODULES.length }}.</b></p>
  <p v-if="st.error" class="error">{{ st.error }}</p>
  <section v-for="g in groups" :key="g.name" class="md-group">
    <h3 class="md-h">{{ g.name }}</h3>
    <div class="md-grid">
      <button v-for="m in g.list" :key="m.id" class="md-card" :class="{ on: modOn(m.id) }" role="switch" :aria-checked="modOn(m.id)" :disabled="st.busy === m.id" @click="toggle(m)">
        <span class="md-ic"><svg class="i"><use :href="'#' + m.icon"/></svg></span>
        <span class="md-txt"><b>{{ m.name }}</b><small>{{ m.desc }}</small></span>
        <span class="md-sw" aria-hidden="true"><i></i></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.md-lead { margin: 0 0 16px; color: var(--muted); font-size: 15px; line-height: 1.5; }
.md-lead b { color: var(--text); font-weight: 600; }
.md-group { margin-bottom: 18px; }
.md-h { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: var(--muted); }
.md-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.md-card { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 72px; padding: 12px 14px !important; border-radius: 18px !important; background: var(--panel) !important;
  border: 1px solid var(--line) !important; text-align: left; justify-content: flex-start; color: var(--text) !important; transition: background-color .2s, border-color .2s; }
.md-card.on { border-color: color-mix(in srgb, var(--accent) 55%, transparent) !important; background: color-mix(in srgb, var(--accent) 9%, var(--panel)) !important; }
.md-ic { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--panel2); color: var(--muted); }
.md-card.on .md-ic { background: var(--accent); color: #2a1906; }
.md-ic svg.i { width: 20px; height: 20px; }
.md-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.md-txt b { font-size: 15px; font-weight: 600; }
.md-txt small { color: var(--muted); font-size: 12.5px; line-height: 1.35; }
.md-sw { flex: none; position: relative; width: 40px; height: 24px; border-radius: 999px; background: var(--panel3); transition: background-color .2s; }
.md-sw i { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); transition: transform .2s; }
.md-card.on .md-sw { background: var(--ok); }
.md-card.on .md-sw i { transform: translateX(16px); }
</style>
