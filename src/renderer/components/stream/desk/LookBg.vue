<script setup lang="ts">
import { computed } from 'vue'
import { label } from '@/stores'
import { bgThumb } from '@/services/studio/cards'
import { useDesk } from '@/composables/stream/useStreamDesk'

// Wybór tła planszy (Odliczanie, Koniec): miniatury gotowych teł, dwa kolory, grafika z Biblioteki albo kamera na żywo.
const props = defineProps<{ look: { bg: string, draw?: boolean, c1: string, c2: string, image: string, dim: number } }>()
const { mediaList, deskTab } = useDesk()
const BGS = [['szczyt', 'Szczyt'], ['swit', 'Świt'], ['noc', 'Noc'], ['zar', 'Żar'], ['krem', 'Krem'], ['piasek', 'Piasek'], ['czern', 'Czerń'], ['paper', 'Papier'], ['sketch', 'Szkic'], ['mountains', 'Góry'], ['colors', 'Kolory'], ['image', 'Grafika'], ['camera', 'Kamera']] as const
const moods = ['szczyt', 'swit', 'noc', 'zar', 'krem', 'piasek', 'czern']
const thumbs = Object.fromEntries(BGS.filter(([id]) => !['colors', 'image', 'camera'].includes(id)).map(([id]) => [id, bgThumb(id)]))
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
const swatch = (id: string) => id === 'colors' ? { background: `linear-gradient(135deg, ${props.look.c1}, ${props.look.c2})` } : thumbs[id] ? { backgroundImage: `url(${thumbs[id]})` } : {}
</script>

<template>
  <div class="desk-opt-group desk-bgs" role="group" aria-label="Tło">
    <small class="muted">Tło</small>
    <button v-for="[id, name] in BGS" :key="id" class="desk-bg" :class="{ on: look.bg === id }" :aria-pressed="look.bg === id" :title="name" @click="look.bg = id">
      <span class="desk-bg-pic" :class="'bg-' + id" :style="swatch(id)"></span>{{ name }}
    </button>
  </div>
  <div v-if="moods.includes(look.bg)" class="desk-opt-group">
    <label class="check" title="Góra rysuje się kreską jak w tle aplikacji"><input :checked="look.draw !== false" type="checkbox" @change="look.draw = ($event.target as HTMLInputElement).checked"> Animacja rysowania</label>
  </div>
  <div v-if="look.bg === 'colors' || look.bg === 'image' || look.bg === 'camera'" class="desk-opt-group">
    <template v-if="look.bg === 'colors'">
      <small class="muted">Kolory</small>
      <label class="desk-color" title="Kolor z lewej u góry"><input v-model="look.c1" type="color" aria-label="Pierwszy kolor"></label>
      <label class="desk-color" title="Kolor z prawej u dołu"><input v-model="look.c2" type="color" aria-label="Drugi kolor"></label>
    </template>
    <select v-if="look.bg === 'image'" v-model="look.image" aria-label="Grafika na tło">
      <option value="">— wybierz grafikę z Biblioteki —</option>
      <option v-for="it in images" :key="it.id" :value="it.id">{{ label(it) }}</option>
    </select>
    <label v-if="look.bg !== 'colors'" class="desk-dim" title="Przyciemnienie tła — żeby napisy były czytelne">Przyciemnienie <input v-model.number="look.dim" type="range" min="0" max="80" step="5" aria-label="Przyciemnienie"> {{ look.dim }}%</label>
    <button v-if="look.bg === 'image' && !images.length" class="small" @click="deskTab = 'media'">Dodaj grafikę w Bibliotece…</button>
  </div>
</template>
