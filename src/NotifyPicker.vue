<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { loadDirectory } from './store.js'

// Wybór odbiorców powiadomienia: grupy (wszyscy, rangi) albo pojedyncze osoby. v-model = lista identyfikatorów osób.
const ids = defineModel({ type: Array, default: () => [] })
const open = ref(false)
const people = ref([])
const ranks = ref([])
const error = ref('')
async function show() {
  open.value = true; error.value = ''
  if (people.value.length) return
  const res = await loadDirectory()
  if (res.error) { error.value = res.error; return }
  people.value = res.people; ranks.value = res.ranks
}
const groups = computed(() => [
  { id: 'all', name: 'Wszyscy', ids: people.value.map(p => p.id) },
  ...ranks.value.map(r => ({ id: r.id, name: r.name, ids: people.value.filter(p => (p.roles || []).includes(r.id)).map(p => p.id) })).filter(g => g.ids.length),
])
const allIn = g => g.ids.length && g.ids.every(id => ids.value.includes(id))
const toggleGroup = g => { ids.value = allIn(g) ? ids.value.filter(id => !g.ids.includes(id)) : [...new Set([...ids.value, ...g.ids])] }
const togglePerson = id => { ids.value = ids.value.includes(id) ? ids.value.filter(x => x !== id) : [...ids.value, id] }
const summary = computed(() => {
  const names = people.value.filter(p => ids.value.includes(p.id)).map(p => p.name)
  return names.length > 3 ? names.slice(0, 2).join(', ') + ' i ' + (names.length - 2) + ' innych' : names.join(', ') || ids.value.length + ' osób'
})
</script>

<template>
  <div class="np">
    <button type="button" class="np-btn" @click="show"><Icon name="bell" />{{ ids.length ? 'Powiadomię: ' + summary : 'Powiadom osoby (opcjonalnie)' }}</button>
    <small class="np-note">Powiadomienie wyjdzie po zapisaniu — na telefony osób, które włączyły powiadomienia.</small>
    <div v-if="open" class="kh-modal" role="dialog" aria-label="Kogo powiadomić" @click.self="open = false">
      <div class="kh-modal-box np-box">
        <button class="kh-ib kh-close" title="Zamknij" aria-label="Zamknij" @click="open = false"><Icon name="x" /></button>
        <h2>Kogo powiadomić?</h2>
        <p v-if="error" class="np-error">{{ error }}</p>
        <p v-else-if="!people.length" class="np-note">Wczytuję listę osób…</p>
        <div class="np-groups">
          <button v-for="g in groups" :key="g.id" type="button" class="np-chip" :class="{ on: allIn(g) }" @click="toggleGroup(g)">{{ g.name }} · {{ g.ids.length }}</button>
          <button v-if="ids.length" type="button" class="np-chip clear" @click="ids = []">Wyczyść</button>
        </div>
        <div class="np-list">
          <label v-for="p in people" :key="p.id" class="np-person">
            <input type="checkbox" :checked="ids.includes(p.id)" @change="togglePerson(p.id)">
            <span><b>{{ p.name }}</b><small :class="{ off: !p.devices }">{{ p.devices ? (p.devices === 1 ? 'telefon z powiadomieniami' : p.devices + ' telefony z powiadomieniami') : 'nie ma włączonych powiadomień' }}</small></span>
          </label>
        </div>
        <div class="np-foot"><button class="primary" @click="open = false"><Icon name="check" />Gotowe · {{ ids.length }}</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.np { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
.np-btn { justify-content: flex-start; }
.np-note { color: var(--muted); font-size: 12px; }
.np-error { color: var(--warn); }
.np-box { width: min(560px, 100%); }
.np-groups { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
.np-chip { padding: 5px 12px; border-radius: 999px; font-size: 13px; }
.np-chip.on { background: var(--accent-soft); border-color: rgba(242, 165, 60, .5); color: var(--accent); }
.np-chip.clear { background: none; color: var(--muted); }
.np-list { max-height: 50vh; overflow-y: auto; }
.np-person { display: flex; align-items: center; gap: 12px; padding: 9px 4px; border-bottom: 1px solid var(--line); cursor: pointer; }
.np-person input { width: 18px; height: 18px; accent-color: var(--accent); }
.np-person span { display: flex; flex-direction: column; }
.np-person small { color: var(--muted); font-size: 12px; }
.np-person small.off { color: var(--warn); }
.np-foot { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
