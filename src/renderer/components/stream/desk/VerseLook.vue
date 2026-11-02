<script setup lang="ts">
import { VERSE_DEFAULT } from '@/services/studio/cards'
import LookBg from './LookBg.vue'

// Werset w presecie: miejsce na obrazie; w okienku także tło (te same co na planszach) i kamera obok.
const props = defineProps<{ look: { place: string, camera: boolean, ink?: string, bg: string, draw?: boolean, c1: string, c2: string, image: string, dim: number } }>()
for (const [k, v] of Object.entries(VERSE_DEFAULT)) if (props.look[k] === undefined) props.look[k] = v // nowe pola po aktualizacji
const PLACES = [['bottom', 'Na dole', 'Pas u dołu obrazu, na 1–2 wersety'], ['left', 'Z lewej', 'Pas na całą wysokość, na kilka wersetów'], ['right', 'Z prawej', 'Pas na całą wysokość, na kilka wersetów'], ['window', 'Okienko', 'Werset w małym oknie, w tle wybrane tło']] as const
</script>

<template>
  <div class="desk-cd">
    <div class="desk-opt-group">
      <small class="muted">Miejsce</small>
      <button v-for="[id, name, tip] in PLACES" :key="id" :class="{ on: look.place === id }" :aria-pressed="look.place === id" :title="tip" @click="look.place = id">{{ name }}</button>
    </div>
    <template v-if="look.place === 'window'">
      <div class="desk-opt-group">
        <small class="muted">Kamera</small>
        <button :class="{ on: look.camera }" :aria-pressed="look.camera" title="Kamera w dużym oknie, werset nachodzi na nią z prawej" @click="look.camera = true">W dużym oknie</button>
        <button :class="{ on: !look.camera }" :aria-pressed="!look.camera" title="Sam werset na środku tła" @click="look.camera = false">Bez kamery</button>
      </div>
      <LookBg :look="look" />
    </template>
  </div>
</template>
