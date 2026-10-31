<script setup lang="ts">
import { computed } from 'vue'
import { label } from '@/stores'
import { LOWER_DEFAULT } from '@/services/studio/cards'
import { useDesk } from '@/composables/stream/useStreamDesk'
import TextColor from './TextColor.vue'

// Pasek mówcy w presecie: napisy, kolor, logo i zdjęcie mówcy.
const props = defineProps<{ look: { ink?: string, photo?: string, style?: string, name: string, sub: string, color: string, logo: boolean } }>()
if (props.look.photo === undefined) props.look.photo = '' // nowe pole po aktualizacji
const { mediaList, addMediaFiles } = useDesk()
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
// zdjęcie z dysku: dodaje do Biblioteki i od razu wybiera
async function addPhoto() { const before = new Set(mediaList.value.map(x => x.id)); if (await addMediaFiles()) { const n = mediaList.value.find(x => x.type === 'image' && !before.has(x.id)); if (n) props.look.photo = n.id } }
</script>

<template>
  <div class="desk-cd desk-banner" role="group" aria-label="Pasek mówcy">
    <div class="desk-opt-group">
      <small class="muted">Styl</small>
      <button :class="{ on: look.style !== 'edit' }" @click="look.style = 'rock'">Ciemny</button>
      <button :class="{ on: look.style === 'edit' }" @click="look.style = 'edit'">Jasny</button>
    </div>
    <TextColor :look="look" />
    <div class="desk-opt-group desk-cd-text">
      <label>Imię i nazwisko <input v-model="look.name" maxlength="60"></label>
      <label>Podpis <input v-model="look.sub" maxlength="100"></label>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Zdjęcie mówcy</small>
      <select v-model="look.photo" aria-label="Zdjęcie mówcy">
        <option value="">Bez zdjęcia</option>
        <option v-for="it in images" :key="it.id" :value="it.id">{{ label(it) }}</option>
      </select>
      <button class="small" title="Zdjęcie z dysku — trafi też do Biblioteki" @click="addPhoto">Z dysku…</button>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Kolor</small>
      <label class="desk-color" title="Kolor paska"><input v-model="look.color" type="color" aria-label="Kolor paska"></label>
      <button v-for="c in ['#f6a836', '#f5e532', '#e5484d', '#4f8ef7', '#ffffff']" :key="c" class="desk-swatch" :class="{ on: look.color === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor ' + c" @click="look.color = c"></button>
      <label v-if="!look.photo" class="check"><input v-model="look.logo" type="checkbox"> Logo kościoła</label>
      <button class="small" title="Przywróć domyślny pasek" @click="Object.assign(look, LOWER_DEFAULT)">Domyślny</button>
    </div>
    <p class="desk-help">Puste pole nic nie pokazuje. {mówca} i {kazanie} wstawiają dane z najbliższego nabożeństwa. Zdjęcie: PNG z wyciętym tłem stoi na pasku i wychodzi nad niego, zamiast logo.</p>
  </div>
</template>
