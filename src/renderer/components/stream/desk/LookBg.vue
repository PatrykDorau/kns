<script setup lang="ts">
import { computed } from 'vue'
import { label } from '@/stores'
import { bgThumb } from '@/services/studio/cards'
import { PALETTES } from '@/services/studio/clean'
import { useDesk } from '@/composables/stream/useStreamDesk'

// Wybór tła planszy (Odliczanie, Koniec): miniatury gotowych teł, dwa kolory, grafika z Biblioteki albo kamera na żywo.
const props = defineProps<{ look: { ink?: string, bg: string, draw?: boolean, c1: string, c2: string, image: string, dim: number } }>()
const { mediaList, deskTab } = useDesk()
// Góra to jeden kafelek; pora dnia to jej motyw, wybierany pod spodem.
const PEAKS = [['szczyt', 'Szczyt'], ['swit', 'Świt'], ['noc', 'Noc'], ['zar', 'Żar']] as const
const isPeak = computed(() => PEAKS.some(([id]) => id === props.look.bg))
const BGS = [['gora', 'Góra'], ['krem', 'Krem'], ['piasek', 'Piasek'], ['czern', 'Czerń'], ['paper', 'Papier'], ['sketch', 'Szkic'], ['colors', 'Kolory'], ['image', 'Grafika'], ['camera', 'Kamera']] as const
const palettes = computed(() => PALETTES[props.look.bg] || [])
const isOn = ([ink, accent]) => (props.look as any).accent === accent && props.look.ink === ink
function usePalette([ink, accent]) { props.look.ink = ink; (props.look as any).accent = accent }
// nowe tło od razu z dobranymi kolorami
function pick(id: string) { if (id === 'gora') { if (isPeak.value) return; id = 'szczyt' } props.look.bg = id; if (PALETTES[id]) usePalette(PALETTES[id][0]); else { props.look.ink = ''; (props.look as any).accent = '#f6a836' } }
const moods = ['szczyt', 'swit', 'noc', 'zar', 'krem', 'piasek', 'czern']
const thumbs = Object.fromEntries([...BGS.filter(([id]) => !['gora', 'colors', 'image', 'camera'].includes(id)), ...PEAKS].map(([id]) => [id, bgThumb(id)]))
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
const shown = (id: string) => (id === 'gora' ? isPeak.value : props.look.bg === id)
const swatch = (id: string) => id === 'gora' ? { backgroundImage: `url(${thumbs[isPeak.value ? props.look.bg : 'szczyt']})` } : id === 'colors' ? { background: `linear-gradient(135deg, ${props.look.c1}, ${props.look.c2})` } : thumbs[id] ? { backgroundImage: `url(${thumbs[id]})` } : {}
</script>

<template>
  <div class="desk-opt-group desk-bgs" role="group" aria-label="Tło">
    <small class="muted">Tło</small>
    <div class="desk-bg-list">
      <button v-for="[id, name] in BGS" :key="id" class="desk-bg" :class="{ on: shown(id) }" :aria-pressed="shown(id)" :title="name" @click="pick(id)">
        <span class="desk-bg-pic" :class="'bg-' + id" :style="swatch(id)"></span>{{ name }}
      </button>
    </div>
  </div>
  <div v-if="isPeak" class="desk-opt-group desk-motif" role="group" aria-label="Motyw">
    <small class="muted">Motyw</small>
    <button v-for="[id, name] in PEAKS" :key="id" :class="{ on: look.bg === id }" :aria-pressed="look.bg === id" @click="pick(id)"><img :src="thumbs[id]" alt="">{{ name }}</button>
  </div>
  <div v-if="palettes.length" class="desk-opt-group">
    <small class="muted">Kolory</small>
    <button v-for="(p, i) in palettes" :key="i" class="desk-pal" :class="{ on: isOn(p) }" :aria-label="'Zestaw kolorów ' + (i + 1)" :title="'Zestaw kolorów ' + (i + 1)" @click="usePalette(p)"><i :style="{ background: p[0] }"></i><i :style="{ background: p[1] }"></i></button>
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
