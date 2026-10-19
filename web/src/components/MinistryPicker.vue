<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted } from 'vue'
import { useApp } from '@/composables/useApp'

// Widoczność dla wybranych służb (wydarzenie, ogłoszenie): nic nie zaznaczone — dla wszystkich; zaznaczone służby —
// widzą tylko osoby z tych służb, ich liderzy i osoby z prawem edycji (pilnuje baza).
export default defineComponent({
  props: { modelValue: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const app = useApp()
    onMounted(() => { if (!app.serve.list.length) app.loadServe() })
    const picked = computed(() => props.modelValue || [])
    const toggle = id => emit('update:modelValue', picked.value.includes(id) ? picked.value.filter(x => x !== id) : [...picked.value, id])
    return { serve: app.serve, picked, toggle, clear: () => emit('update:modelValue', []) }
  },
})
</script>

<template>
  <div class="mpick">
    <label>Tylko dla służb (opcjonalnie)</label>
    <div class="chips" role="group" aria-label="Widoczność dla służb">
      <button type="button" class="chipbtn" :class="{ on: !picked.length }" :aria-pressed="!picked.length" @click="clear">Wszyscy</button>
      <button v-for="m in serve.list" :key="m.id" type="button" class="chipbtn" :class="{ on: picked.includes(m.id) }" :aria-pressed="picked.includes(m.id)" @click="toggle(m.id)">{{ m.name }}</button>
    </div>
    <p v-if="picked.length" class="note">Widzą tylko osoby z {{ picked.length === 1 ? 'tej służby' : 'tych służb' }}, ich liderzy i osoby z prawem edycji. Nie trafi do gości ani do newslettera.</p>
  </div>
</template>

<style scoped>
.mpick { margin: 6px 0 4px; }
.mpick .chips { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
