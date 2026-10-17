<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Brand from './Brand.vue'
import { access, loadPeople, role, setPerson } from './store.js'

// Osoby (administrator): zatwierdzanie nowych kont, rangi, odbieranie dostępu — to samo co na telefonie (Więcej → Osoby).
const people = ref([])
const ranks = ref([])
const busy = ref(false)
const error = ref('')
const withDraft = p => ({ ...p, roles: p.roles || [], draft: [...(p.roles || [])], busy: false, error: '' })
async function load() {
  busy.value = true; error.value = ''
  const res = await loadPeople()
  busy.value = false
  if (res.error) { error.value = res.error; return }
  people.value = res.people.map(withDraft); ranks.value = res.ranks
}
onMounted(load)

const groups = computed(() => [
  { id: 'pending', title: 'Czekają na zatwierdzenie', list: people.value.filter(p => p.status === 'pending').sort((a, b) => String(b.requested).localeCompare(String(a.requested))) },
  { id: 'active', title: 'Członkowie', list: people.value.filter(p => p.status === 'active').sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'pl')) },
  { id: 'rejected', title: 'Bez dostępu', list: people.value.filter(p => p.status === 'rejected') },
].filter(g => g.list.length))
const initials = p => (p.name || p.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
const ago = t => { const h = Math.round((Date.now() - new Date(t)) / 3600e3); return h < 1 ? 'przed chwilą' : h < 24 ? h + ' godz. temu' : Math.round(h / 24) + ' dni temu' }
const changed = p => [...p.draft].sort().join() !== [...p.roles].sort().join()
const toggle = (p, id) => { p.draft = p.draft.includes(id) ? p.draft.filter(r => r !== id) : [...p.draft, id] }
async function save(p, status) {
  if (status === 'rejected' && p.status === 'active' && !confirm(`Odebrać dostęp osobie ${p.name || p.email}?`)) return
  p.busy = true; p.error = ''
  const res = await setPerson(p.email, status || null, status === 'rejected' ? p.roles : p.draft)
  p.busy = false
  if (res.error) { p.error = res.error; return }
  Object.assign(p, withDraft(res.person))
}
</script>

<template>
  <div class="app">
    <header>
      <button class="iconbtn" title="Strona startowa" aria-label="Strona startowa" @click="role = null"><Icon name="left" /></button>
      <Brand />
      <h1>Osoby</h1>
      <span class="spacer"></span>
      <button :disabled="busy" @click="load"><Icon name="refresh" />Odśwież</button>
    </header>
    <main class="people-page">
      <p v-if="!access.manage" class="empty">Osobami zarządza administrator.</p>
      <p v-else-if="error" class="warnline">{{ error }}</p>
      <p v-else-if="busy && !people.length" class="empty">Wczytuję listę osób…</p>
      <template v-for="g in groups" :key="g.id">
        <h2>{{ g.title }} · {{ g.list.length }}</h2>
        <div class="people-grid">
          <article v-for="p in g.list" :key="p.email" class="person" :class="p.status">
            <div class="p-head">
              <span class="p-av">{{ initials(p) }}</span>
              <span class="p-meta"><b>{{ p.name || p.email }}</b><small>{{ p.email }}<template v-if="p.status === 'pending' && p.requested"> · {{ ago(p.requested) }}</template></small></span>
            </div>
            <div v-if="p.status !== 'rejected'" class="p-ranks">
              <button v-for="r in ranks" :key="r.id" class="p-rank" :class="{ on: p.draft.includes(r.id) }" :aria-pressed="p.draft.includes(r.id)" :disabled="p.busy" @click="toggle(p, r.id)">{{ r.name }}</button>
            </div>
            <p v-if="p.error" class="warnline">{{ p.error }}</p>
            <div class="p-actions">
              <template v-if="p.status === 'pending'">
                <button :disabled="p.busy" @click="save(p, 'rejected')">Odrzuć</button>
                <button class="primary" :disabled="p.busy" @click="save(p, 'active')"><Icon name="check" />{{ p.busy ? 'Zapisuję…' : 'Zatwierdź' }}</button>
              </template>
              <button v-else-if="p.status === 'rejected'" :disabled="p.busy" @click="save(p, 'active')">{{ p.busy ? 'Zapisuję…' : 'Przywróć dostęp' }}</button>
              <template v-else>
                <button v-if="p.email !== access.email" :disabled="p.busy" @click="save(p, 'rejected')">Odbierz dostęp</button>
                <button class="primary" :disabled="p.busy || !changed(p)" @click="save(p)">{{ p.busy ? 'Zapisuję…' : changed(p) ? 'Zapisz rangi' : 'Zapisane' }}</button>
              </template>
            </div>
          </article>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.people-page { display: block; flex: 1; min-height: 0; overflow-y: auto; padding: 4px 24px 24px; }
.people-page h2 { margin: 18px 0 10px; }
.people-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 12px; }
.person { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); }
.person.pending { border-color: rgba(242, 165, 60, .45); }
.person.rejected { opacity: .7; }
.p-head { display: flex; align-items: center; gap: 12px; }
.p-av { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #f2a53c, #f07fb4 55%, #a98bff); color: #1f1608; font-weight: 700; font-size: 14px; }
.p-meta { display: flex; flex-direction: column; min-width: 0; }
.p-meta b { font-size: 15px; }
.p-meta small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-ranks { display: flex; flex-wrap: wrap; gap: 6px; }
.p-rank { padding: 5px 11px; border-radius: 999px; font-size: 12px; background: var(--panel2); }
.p-rank.on { background: var(--accent-soft); border-color: rgba(242, 165, 60, .5); color: var(--accent); }
.p-actions { display: flex; justify-content: flex-end; gap: 8px; }
.warnline { color: var(--warn); margin: 0; }
</style>
