<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Miejsce na dane (administrator i deweloperzy, zakładka w „Zgłoszeniach”): ile zajmuje baza i pliki na tle limitów
// darmowego planu Supabase, lista plików (nieużywane na górze), pobieranie i usuwanie (np. przed usunięciem — pobierz na dysk).
const BUCKETS = { ogloszenia: 'Grafiki i filmy (ogłoszenia, wydarzenia, cele, wydawka)', protokoly: 'Materiały i protokoły', asb: 'Załączniki ASB', zdjecia: 'Zdjęcia na stronę główną' }
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ data: null, busy: false, error: '', filter: 'unused', sel: {} })
    async function load() {
      st.busy = true
      try { st.data = await app.api.call('storageUsage'); st.error = '' } catch (e) { st.error = e.message || String(e) } finally { st.busy = false }
    }
    onMounted(load)
    const mb = n => !n ? '0 MB' : n >= 1073741824 ? (n / 1073741824).toFixed(n % 1073741824 ? 1 : 0).replace('.', ',') + ' GB' : n >= 1024 * 1024 * 100 ? Math.round(n / 1048576) + ' MB' : n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB'
    const files = computed(() => st.data?.files || [])
    const total = computed(() => files.value.reduce((a, f) => a + f.size, 0))
    const buckets = computed(() => Object.entries(BUCKETS).map(([id, name]) => {
      const list = files.value.filter(f => f.bucket === id)
      return { id, name, n: list.length, size: list.reduce((a, f) => a + f.size, 0) }
    }).filter(b => b.n))
    const unused = computed(() => files.value.filter(f => !f.usedBy))
    const shown = computed(() => st.filter === 'unused' ? unused.value : files.value.filter(f => f.bucket !== 'zdjecia'))
    const pct = (a, b) => Math.min(100, Math.round(a / b * 1000) / 10)
    const fileName = f => f.name.split('/').pop()
    const key = f => f.bucket + '/' + f.name
    const selected = computed(() => shown.value.filter(f => st.sel[key(f)]))
    async function download(f) {
      try { const url = await app.api.call('storageUrl', { bucket: f.bucket, name: f.name }); window.open(url, '_blank', 'noopener') } catch (e) { st.error = e.message || String(e) }
    }
    async function remove(list) {
      const used = list.filter(f => f.usedBy)
      const text = 'Usunąć ' + (list.length === 1 ? '„' + fileName(list[0]) + '”' : list.length + ' plików') + ' (' + mb(list.reduce((a, f) => a + f.size, 0)) + ')? Tego nie da się cofnąć.'
        + (used.length ? ' ' + used.length + ' z nich jest używanych — np. ' + used[0].usedBy + ' straci plik. Jeśli chcesz zachować, najpierw pobierz.' : '')
      if (!(await ask(text, { ok: 'Usuń', danger: true }))) return
      st.busy = true
      try {
        let gone = 0
        for (const b of new Set(list.map(f => f.bucket))) gone += await app.api.call('storageRemove', { bucket: b, names: list.filter(f => f.bucket === b).map(f => f.name) })
        st.sel = {}
        app.showToast(gone === list.length ? 'Usunięto: ' + gone + '.' : 'Usunięto ' + gone + ' z ' + list.length + ' — do pozostałych brak uprawnień.')
      } catch (e) { st.error = e.message || String(e) } finally { st.busy = false }
      await load()
    }
    const ago = d => new Date(d).toLocaleDateString('pl', { day: 'numeric', month: 'short', year: 'numeric' })
    return { ...app, st, mb, total, buckets, unused, shown, pct, fileName, key, selected, download, remove, ago, BUCKETS }
  },
})
</script>

<template>
  <p class="note" style="margin-top:0">Darmowy plan Supabase: baza do 500 MB, pliki do 1 GB. Grafiki są zmniejszane przy wgrywaniu (zwykle 100–300 kB).</p>
  <p v-if="st.error" class="error">{{ st.error }}</p>
  <div v-if="!st.data && st.busy" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 2" :key="n" class="skel skel-row"></div></div>
  <template v-if="st.data">
    <div class="sp-meters">
      <div class="sp-meter">
        <div class="sp-h"><b>Baza</b><span>{{ mb(st.data.db) }} z {{ mb(st.data.dbLimit) }}</span></div>
        <div class="goal-bar thin"><i class="done" :style="{ width: Math.max(1, pct(st.data.db, st.data.dbLimit)) + '%' }"></i></div>
        <small>teksty: nabożeństwa, pieśni, ogłoszenia, osoby… · zajęte {{ pct(st.data.db, st.data.dbLimit) }}%</small>
      </div>
      <div class="sp-meter">
        <div class="sp-h"><b>Pliki</b><span>{{ mb(total) }} z {{ mb(st.data.filesLimit) }}</span></div>
        <div class="goal-bar thin"><i class="done" :style="{ width: Math.max(1, pct(total, st.data.filesLimit)) + '%' }"></i></div>
        <small v-for="b in buckets" :key="b.id">{{ b.name }}: {{ b.n }} · {{ mb(b.size) }}</small>
      </div>
    </div>

    <div class="chips bug-filter" role="group" aria-label="Pliki">
      <button class="chipbtn" :class="{ on: st.filter === 'unused' }" @click="st.filter = 'unused'; st.sel = {}">Nieużywane · {{ unused.length }}</button>
      <button class="chipbtn" :class="{ on: st.filter === 'all' }" @click="st.filter = 'all'; st.sel = {}">Wszystkie pliki</button>
    </div>
    <div v-if="st.filter === 'unused' && unused.length" class="sp-bulk">
      <span>Pliki wgrane, ale nigdzie niepodpięte (np. ogłoszenie nie zostało zapisane) — razem {{ mb(unused.reduce((a, f) => a + f.size, 0)) }}.</span>
      <button class="danger small" :disabled="st.busy" @click="remove(unused)"><svg class="i"><use href="#trash"/></svg>Usuń wszystkie nieużywane</button>
    </div>
    <div v-else-if="selected.length" class="sp-bulk">
      <span>Zaznaczone: {{ selected.length }} · {{ mb(selected.reduce((a, f) => a + f.size, 0)) }}</span>
      <button class="danger small" :disabled="st.busy" @click="remove(selected)"><svg class="i"><use href="#trash"/></svg>Usuń zaznaczone</button>
    </div>
    <p v-if="!shown.length" class="note">{{ st.filter === 'unused' ? 'Nie ma nieużywanych plików.' : 'Nie ma plików.' }}</p>
    <div v-for="f in shown" :key="key(f)" class="sp-file">
      <label v-if="st.filter === 'all'" class="sp-check"><input v-model="st.sel[key(f)]" type="checkbox" :aria-label="'Zaznacz ' + fileName(f)"></label>
      <span class="sp-info">
        <b>{{ fileName(f) }}</b>
        <small>{{ mb(f.size) }} · {{ ago(f.created) }} · <span :class="f.usedBy ? '' : 'sp-unused'">{{ f.usedBy || 'nieużywany' }}</span></small>
      </span>
      <button class="icon" aria-label="Pobierz" title="Pobierz (zachowaj na dysku przed usunięciem)" @click="download(f)"><svg class="i"><use href="#download"/></svg></button>
      <button class="icon" :disabled="st.busy" aria-label="Usuń" title="Usuń" @click="remove([f])"><svg class="i"><use href="#trash"/></svg></button>
    </div>
  </template>
</template>

<style scoped>
.sp-meters { display: grid; gap: 10px; margin-bottom: 14px; }
@media (min-width: 720px) { .sp-meters { grid-template-columns: 1fr 1fr; } }
.sp-meter { display: flex; flex-direction: column; gap: 6px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
.sp-h { display: flex; justify-content: space-between; gap: 10px; }
.sp-h span { color: var(--muted); font-size: 14px; }
.sp-meter small { color: var(--muted); font-size: 12.5px; }
.sp-bulk { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin: 0 0 10px; padding: 10px 12px; border-radius: 12px; background: var(--panel2); font-size: 13px; color: var(--muted); }
.sp-bulk span { flex: 1 1 220px; }
.sp-file { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.sp-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sp-info b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-info small { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-unused { color: var(--accent); font-weight: 700; }
.sp-check input { width: 18px; height: 18px; }
</style>
