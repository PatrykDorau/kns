<script setup lang="ts">
import { computed } from 'vue'
import { label } from '@/stores'
import { END_DEFAULT } from '@/services/studio/cards'
import { useDesk } from '@/composables/stream/useStreamDesk'
import LookBg from './LookBg.vue'

// Wygląd sceny Koniec w presecie: układ, tło, napis i podpis.
const props = defineProps<{ en: any }>()
const { mediaList, addMediaFiles } = useDesk()
const END_LAYOUTS = [['cards', 'Karta z kafelkami', 'Jak grafiki ogłoszeń: karta, pod napisem kody QR obok siebie'], ['side', 'Napis obok kodów', 'Po lewej podziękowanie i najbliższe nabożeństwo, po prawej kody QR'], ['center', 'Duży napis', 'Duże podziękowanie na środku, kody QR małe u dołu'], ['image', 'Sama grafika', 'Tylko wybrana grafika (np. przygotowana plansza) na cały ekran']] as const
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
// grafika z dysku: dodaje do Biblioteki i od razu wybiera
async function addPic() { const before = new Set(mediaList.value.map(x => x.id)); if (await addMediaFiles()) { const n = mediaList.value.find(x => x.type === 'image' && !before.has(x.id)); if (n) props.en.pic = n.id } }
</script>

<template>
  <div class="desk-cd" role="group" aria-label="Wygląd końca">
    <div class="desk-opt-group">
      <small class="muted">Układ</small>
      <button v-for="[id, name, tip] in END_LAYOUTS" :key="id" :class="{ on: en.layout === id }" :aria-pressed="en.layout === id" :title="tip" @click="en.layout = id">{{ name }}</button>
    </div>
    <div v-if="en.layout === 'image'" class="desk-opt-group">
      <small class="muted">Grafika</small>
      <select v-model="en.pic" aria-label="Grafika na Koniec">
        <option value="">— wybierz grafikę —</option>
        <option v-for="it in images" :key="it.id" :value="it.id">{{ label(it) }}</option>
      </select>
      <button class="small" title="Grafika z dysku — trafi też do Biblioteki" @click="addPic">Z dysku…</button>
    </div>
    <LookBg v-if="en.layout !== 'image'" :look="en" />
    <div v-if="en.layout !== 'image'" class="desk-opt-group desk-cd-text">
      <label>Napis <input v-model="en.title" maxlength="60" :placeholder="END_DEFAULT.title"></label>
      <label>Podpis <input v-model="en.sub" maxlength="90" placeholder="np. Błogosławionego tygodnia!"></label>
      <button class="small" title="Przywróć domyślny wygląd" @click="Object.assign(en, END_DEFAULT)">Domyślny</button>
    </div>
  </div>
</template>
