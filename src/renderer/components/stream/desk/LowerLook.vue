<script setup lang="ts">
import { LOWER_DEFAULT } from '@/services/studio/cards'

// Pasek mówcy w presecie: napisy (puste — mówca i kazanie z najbliższego nabożeństwa), kolor i logo.
defineProps<{ look: { name: string, sub: string, color: string, logo: boolean } }>()
</script>

<template>
  <div class="desk-cd desk-banner" role="group" aria-label="Pasek mówcy">
    <div class="desk-opt-group desk-cd-text">
      <label>Imię i nazwisko <input v-model="look.name" maxlength="60" placeholder="puste — mówca z nabożeństwa"></label>
      <label>Podpis <input v-model="look.sub" maxlength="100" placeholder="puste — tytuł kazania i fragment"></label>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Kolor</small>
      <label class="desk-color" title="Kolor paska"><input v-model="look.color" type="color" aria-label="Kolor paska"></label>
      <button v-for="c in ['#f6a836', '#f5e532', '#e5484d', '#4f8ef7', '#ffffff']" :key="c" class="desk-swatch" :class="{ on: look.color === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor ' + c" @click="look.color = c"></button>
      <label class="check"><input v-model="look.logo" type="checkbox"> Logo kościoła</label>
      <button class="small" title="Przywróć domyślny pasek" @click="Object.assign(look, LOWER_DEFAULT)">Domyślny</button>
    </div>
  </div>
</template>
