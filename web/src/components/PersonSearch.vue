<script setup lang="ts">
// Wyszukiwanie osoby z listy członków (podpowiedzi podczas pisania) — zamiast długiej listy rozwijanej.
import { computed, ref } from 'vue'

type Person = { id: string; name: string }
const props = withDefaults(defineProps<{ people: Person[]; exclude?: string[]; placeholder?: string; label?: string }>(), { exclude: () => [], placeholder: 'Szukaj osoby…', label: 'Szukaj osoby' })
const emit = defineEmits<{ pick: [p: Person]; focus: [] }>()
const q = ref('')
const open = ref(false)
const active = ref(0)
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
const shown = computed(() => {
  const t = plain(q.value.trim())
  return props.people.filter(p => !props.exclude.includes(p.id) && (!t || plain(p.name || '').includes(t))).slice(0, 8)
})
function pick(p: Person) { emit('pick', p); q.value = ''; active.value = 0 }
function key(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') { active.value = Math.min(active.value + 1, shown.value.length - 1); open.value = true; ev.preventDefault() }
  else if (ev.key === 'ArrowUp') { active.value = Math.max(active.value - 1, 0); ev.preventDefault() }
  else if (ev.key === 'Enter' && open.value && shown.value[active.value]) { pick(shown.value[active.value]); ev.preventDefault() }
  else if (ev.key === 'Escape') open.value = false
}
</script>

<template>
  <div class="psearch">
    <div class="ann-search"><svg class="i"><use href="#search"/></svg>
      <input v-model="q" type="search" :placeholder="placeholder" :aria-label="label" autocomplete="off" role="combobox" :aria-expanded="open && shown.length > 0"
        @focus="open = true; emit('focus')" @blur="open = false" @input="open = true; active = 0" @keydown="key">
    </div>
    <div v-if="open && (shown.length || q.trim())" class="psearch-list" role="listbox">
      <button v-for="(p, i) in shown" :key="p.id" type="button" role="option" :aria-selected="i === active" :class="{ on: i === active }" @mousedown.prevent="pick(p)">
        <svg class="i"><use href="#user"/></svg>{{ p.name }}
      </button>
      <p v-if="!shown.length" class="note">Nikogo nie znaleziono{{ people.length ? '' : ' — lista członków się wczytuje' }}.</p>
    </div>
  </div>
</template>
