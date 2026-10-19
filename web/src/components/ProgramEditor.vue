<script lang="ts">
// @ts-nocheck — przeniesione z index.html
import { computed, defineComponent, ref } from 'vue'
import { CATEGORIES, addMinutes, category, categoryName, offsetOf, setCategory } from '@/services/church'
import { uid } from '@/services/drive'
export default defineComponent({
  props: { items: { type: Array, required: true }, start: { type: String, default: '00:00' }, readonly: Boolean, sermon: Object, template: Array },
  emits: ['fill'],
  setup(props) {
    const timeOf = p => addMinutes(props.start || '00:00', p.offset)
    const sorted = computed(() => [...props.items].sort((a, b) => a.offset - b.offset))
    // Czas trwania punktu: do następnego punktu programu.
    const openKey = ref('') // rozwinięty punkt (edycja godziny, rodzaju, opisu, osoby)
    const initialsOf = name => String(name).split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    const duration = p => { const i = sorted.value.indexOf(p), next = sorted.value[i + 1]; return next ? next.offset - p.offset : 0 }
    function setTime(p, t) {
      if (!t) return
      p.offset = offsetOf(props.start || '00:00', t)
      props.items.sort((a, b) => a.offset - b.offset)
    }
    function add() {
      const last = props.items[props.items.length - 1]
      const p = { key: uid(), offset: last ? last.offset + 10 : 0, category: 'inne', title: '', person: '', note: '' }
      props.items.push(p); openKey.value = p.key
    }
    const cat = p => category(p.category)
    const label = p => {
      if (p.category === 'kazanie' && props.sermon) {
        const title = [p.title || props.sermon.title, props.sermon.passage].filter(Boolean).join(', ')
        return [title, p.person || props.sermon.speaker].filter(Boolean).join(' — ')
      }
      return [p.title, p.person].filter(Boolean).join(' — ')
    }
    return { catName: categoryName, setCategory, openKey, initialsOf, duration, categories: CATEGORIES, timeOf, sorted, setTime, add, cat, label }
  },
})
</script>

<template>
  <div class="program">
    <ol v-if="readonly" class="timeline">
      <li v-if="!items.length" class="note">Program nie jest jeszcze ułożony.</li>
      <li v-for="p in sorted" :key="p.key">
        <time>{{ timeOf(p) }}</time>
        <span class="tl-ic"><svg class="i"><use :href="'#' + cat(p).icon"/></svg></span>
        <span class="tl-body"><b>{{ catName(p) }}</b><span v-if="label(p)">{{ label(p) }}</span><slot name="item" :item="p"></slot></span>
        <small v-if="duration(p)" class="tl-dur">{{ duration(p) }} min</small>
      </li>
    </ol>
    <template v-else>
      <div v-for="(p, i) in items" :key="p.key" class="pg-row" :class="{ open: openKey === p.key }">
        <button type="button" class="pg-head" :aria-expanded="openKey === p.key" @click="openKey = openKey === p.key ? '' : p.key">
          <time>{{ timeOf(p) }}</time>
          <span class="tl-ic"><svg class="i"><use :href="'#' + cat(p).icon"/></svg></span>
          <span class="pg-main"><small>{{ catName(p) }}</small><b>{{ label(p) || catName(p) }}</b></span>
          <span class="pg-side"><small v-if="duration(p)">{{ duration(p) }} min</small><span v-if="p.person" class="pg-person" :title="p.person">{{ initialsOf(p.person) }}</span><small v-else class="pg-noone">Brak osób</small></span>
          <svg class="i pg-chev"><use href="#down"/></svg>
        </button>
        <div v-if="openKey === p.key" class="pg-edit">
        <div class="pg-top">
          <input type="time" :value="timeOf(p)" aria-label="Godzina punktu" @change="setTime(p, $event.target.value)">
          <input class="pg-cat" :value="catName(p)" list="pg-cats" placeholder="Rodzaj — wybierz albo wpisz" aria-label="Rodzaj punktu" autocomplete="off" @change="setCategory(p, $event.target.value)" @focus="$event.target.select()">
          <button class="icon" type="button" aria-label="Usuń punkt" @click="items.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
        </div>
        <div class="pg-fields">
          <input v-model="p.title" :placeholder="p.category === 'kazanie' ? 'Tytuł (gdy inny niż wyżej)' : 'Opis, np. Pieśń / kolekta'" aria-label="Opis punktu" autocomplete="off">
          <input v-model="p.person" placeholder="Kto" aria-label="Kto prowadzi ten punkt" autocomplete="off">
        </div>
        </div>
        <p v-if="p.category === 'kazanie' && sermon && (sermon.title || sermon.passage) && !$slots.item" class="pg-sermon">{{ [sermon.title, sermon.passage, sermon.speaker].filter(Boolean).join(' · ') }}</p>
        <slot name="item" :item="p"></slot>
      </div>
      <datalist id="pg-cats"><option v-for="c in categories" :key="c.id" :value="c.name"></option></datalist>
      <div class="pg-add">
        <button type="button" @click="add"><svg class="i"><use href="#plus"/></svg>Dodaj punkt</button>
        <button v-if="template && template.length" type="button" @click="$emit('fill')">Z szablonu</button>
      </div>
    </template>
  </div>
</template>
