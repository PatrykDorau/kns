<script setup lang="ts">
import { LOWER_DEFAULT } from '@/services/studio/cards'
import TextColor from './TextColor.vue'

// Pasek mówcy w presecie: napisy, kolor i logo.
defineProps<{ look: { ink?: string, style?: string, name: string, sub: string, color: string, logo: boolean } }>()
</script>

<template>
  <div class="desk-cd desk-banner" role="group" aria-label="Pasek mówcy">
    <div class="desk-opt-group">
      <small class="muted">Styl</small>
      <button :class="{ on: look.style !== 'edit' }" @click="look.style = 'rock'">Skała</button>
      <button :class="{ on: look.style === 'edit' }" @click="look.style = 'edit'">Czysty</button>
    </div>
    <TextColor :look="look" />
    <div class="desk-opt-group desk-cd-text">
      <label>Imię i nazwisko <input v-model="look.name" maxlength="60"></label>
      <label>Podpis <input v-model="look.sub" maxlength="100"></label>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Kolor</small>
      <label class="desk-color" title="Kolor paska"><input v-model="look.color" type="color" aria-label="Kolor paska"></label>
      <button v-for="c in ['#f6a836', '#f5e532', '#e5484d', '#4f8ef7', '#ffffff']" :key="c" class="desk-swatch" :class="{ on: look.color === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor ' + c" @click="look.color = c"></button>
      <label class="check"><input v-model="look.logo" type="checkbox"> Logo kościoła</label>
      <button class="small" title="Przywróć domyślny pasek" @click="Object.assign(look, LOWER_DEFAULT)">Domyślny</button>
    </div>
    <p class="desk-help">Puste pole nic nie pokazuje. {mówca} i {kazanie} wstawiają dane z najbliższego nabożeństwa.</p>
  </div>
</template>
