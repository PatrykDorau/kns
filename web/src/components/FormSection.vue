<script lang="ts">
// @ts-nocheck
import { defineComponent } from 'vue'

// Sekcja długiego formularza: nagłówek ze streszczeniem wartości, liczba braków, rozwijana treść.
export default defineComponent({
  props: { id: String, icon: String, title: String, summary: String, bad: Number, open: Boolean },
  emits: ['toggle'],
})
</script>

<template>
  <section :id="'sec-' + id" class="fs" :class="{ open, bad: !!bad }">
    <button type="button" class="fs-head" :aria-expanded="open" @click="$emit('toggle')">
      <svg v-if="icon" class="i fs-ic"><use :href="'#' + icon"/></svg>
      <span class="fs-t"><b>{{ title }}</b><small v-if="summary && !open">{{ summary }}</small></span>
      <em v-if="bad" class="fs-bad" :aria-label="'Braki: ' + bad">{{ bad }}</em>
      <svg class="i fs-chev"><use href="#down"/></svg>
    </button>
    <div v-if="open" class="fs-body"><slot></slot></div>
  </section>
</template>
