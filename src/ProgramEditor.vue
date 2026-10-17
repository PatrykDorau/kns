<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { CATEGORIES, addMinutes, categoryName, offsetOf, setCategory } from '../mobile/church.js'
import { uid } from './store.js'

// Program nabożeństwa (ten sam zapis co na telefonie): punkty trzymają przesunięcie w minutach
// od początku, więc po zmianie godziny nabożeństwa cały program przesuwa się razem z nią.
const props = defineProps({
  items: { type: Array, required: true },
  start: { type: String, default: '00:00' },
  sermon: { type: Object, default: null },
  template: { type: Array, default: () => [] },
})
const emit = defineEmits(['fill'])

const timeOf = p => addMinutes(props.start || '00:00', p.offset)
function setTime(p, t) {
  if (!t) return
  p.offset = offsetOf(props.start || '00:00', t)
  props.items.sort((a, b) => a.offset - b.offset)
}
function add() {
  const last = props.items[props.items.length - 1]
  props.items.push({ key: uid(), offset: last ? last.offset + 10 : 0, category: 'inne', title: '', person: '', note: '' })
}
const sermonLine = computed(() => [props.sermon?.title, props.sermon?.passage, props.sermon?.speaker].filter(Boolean).join(' · '))
</script>

<template>
  <div class="program-ed">
    <div v-if="!items.length" class="empty slim">Program nie jest jeszcze ułożony.</div>
    <datalist id="pg-cats"><option v-for="c in CATEGORIES" :key="c.id" :value="c.name"></option></datalist>
    <div v-for="(p, i) in items" :key="p.key" class="pg-line">
      <input class="pg-time" type="time" :value="timeOf(p)" aria-label="Godzina punktu" @change="setTime(p, $event.target.value)">
      <input class="pg-cat" :value="categoryName(p)" list="pg-cats" type="text" placeholder="Rodzaj — wybierz albo wpisz" aria-label="Rodzaj punktu" @change="setCategory(p, $event.target.value)" @focus="$event.target.select()">
      <input v-model="p.title" type="text" :placeholder="p.category === 'kazanie' ? (sermonLine || 'Tytuł kazania') : 'Opis, np. Pieśń / kolekta'" aria-label="Opis punktu">
      <input v-model="p.person" class="pg-person" type="text" placeholder="Kto" aria-label="Kto prowadzi ten punkt">
      <button class="iconbtn danger" title="Usuń punkt" aria-label="Usuń punkt" @click="items.splice(i, 1)"><Icon name="x" /></button>
    </div>
    <div class="btnrow">
      <button @click="add"><Icon name="plus" />Dodaj punkt</button>
      <button v-if="template.length" title="Wstawia program z szablonu nabożeństwa (zmienia się go na telefonie: Kalendarz → Szablony)" @click="emit('fill')"><Icon name="copy" />Z szablonu</button>
    </div>
  </div>
</template>

<style scoped>
.program-ed { display: flex; flex-direction: column; gap: 6px; }
.pg-line { display: grid; grid-template-columns: 96px 170px 1fr 150px auto; gap: 6px; align-items: center; }
.pg-line input, .pg-line select { min-width: 0; }
.btnrow { margin-top: 4px; }
</style>
