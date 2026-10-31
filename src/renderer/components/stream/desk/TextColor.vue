<script setup lang="ts">
// Kolor tekstu presetu: własny albo automatyczny (dobrany do tła). Obwódka: gdy napis gubi się na tle albo kamerze.
defineProps<{ look: { ink?: string, outline?: string } }>()
</script>

<template>
  <div class="desk-opt-group">
    <small class="muted">Kolor tekstu</small>
    <label class="desk-color" title="Kolor tekstu"><input :value="look.ink || '#ffffff'" type="color" aria-label="Kolor tekstu" @input="look.ink = ($event.target as HTMLInputElement).value"></label>
    <button v-for="c in ['#ffffff', '#f4ecdf', '#2b2b2b', '#1a2a9a', '#f6a836', '#f5e66c']" :key="c" class="desk-swatch" :class="{ on: look.ink === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor tekstu ' + c" @click="look.ink = c"></button>
    <button class="small" :class="{ on: !look.ink }" title="Kolor dobrany do tła" @click="look.ink = ''">Auto</button>
  </div>
  <div class="desk-opt-group">
    <small class="muted">Obwódka tekstu</small>
    <button class="small" :class="{ on: !look.outline }" title="Napisy bez obwódki" @click="look.outline = ''">Brak</button>
    <label class="desk-color" title="Kolor obwódki"><input :value="look.outline || '#000000'" type="color" aria-label="Kolor obwódki" @input="look.outline = ($event.target as HTMLInputElement).value"></label>
    <button v-for="c in ['#000000', '#ffffff', '#f4ecdf', '#1a2a9a', '#f6a836']" :key="c" class="desk-swatch" :class="{ on: look.outline === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor obwódki ' + c" @click="look.outline = c"></button>
  </div>
</template>
