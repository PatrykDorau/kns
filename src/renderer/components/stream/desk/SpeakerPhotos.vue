<script setup lang="ts">
import { computed, ref } from 'vue'
import { label, settings, uid } from '@/stores'
import { choosePhoto, currentSpeaker, photosOf } from '@/services/studio/cards'
import { mediaSlide, mediaUrl } from '@/services/studio/media'
import { useDesk } from '@/composables/stream/useStreamDesk'

// Zdjęcia mówców: galeria przypisana do imienia. Pasek mówcy i karta kazania biorą wybrane zdjęcie mówcy z nabożeństwa.
// quick: w Studio tylko szybki wybór zdjęcia dzisiejszego mówcy.
defineProps<{ quick?: boolean }>()
const { mediaList, addMediaFiles } = useDesk()
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
const src = p => { const it = mediaSlide(p.pic); return it?.type === 'image' ? mediaUrl(it.path) : '' }
const speaker = computed(() => currentSpeaker())
const mine = computed(() => photosOf(speaker.value).filter(src))
const chosenOf = list => list.find(p => p.on) || list[0]
const people = computed(() => {
  const groups = new Map<string, any[]>()
  for (const p of settings.speakerPhotos || []) { const key = p.name.toLowerCase(); groups.set(key, [...(groups.get(key) || []), p]) }
  return [...groups.values()]
})
const who = ref(speaker.value)
const add = (pic: string) => { if (!settings.speakerPhotos) settings.speakerPhotos = []; settings.speakerPhotos.push({ id: uid(), name: who.value.trim(), pic }) }
function fromLibrary(e: Event) { const sel = e.target as HTMLSelectElement; if (sel.value) add(sel.value); sel.value = '' }
// zdjęcie z dysku: dodaje do Biblioteki i od razu do galerii
async function fromDisk() { const before = new Set(mediaList.value.map(x => x.id)); if (await addMediaFiles()) { const n = mediaList.value.find(x => x.type === 'image' && !before.has(x.id)); if (n) add(n.id) } }
const drop = p => { settings.speakerPhotos = settings.speakerPhotos.filter(x => x.id !== p.id) }
</script>

<template>
  <div v-if="quick && mine.length > 1" class="sp-quick" role="group" :aria-label="'Zdjęcie: ' + speaker">
    <small class="muted">Zdjęcie: {{ speaker }}</small>
    <button v-for="p in mine" :key="p.id" class="sp-pic" :class="{ on: chosenOf(mine).id === p.id }" :aria-pressed="chosenOf(mine).id === p.id" title="Pokaż to zdjęcie" @click="choosePhoto(p)"><img :src="src(p)" alt=""></button>
  </div>
  <div v-else-if="!quick" class="sp" role="group" aria-label="Zdjęcia mówców">
    <div class="desk-opt-group">
      <small class="muted">Zdjęcia mówców</small>
      <label class="sp-who">Mówca <input v-model="who" maxlength="60" aria-label="Imię mówcy" placeholder="np. Piotr Gruchała"></label>
      <select :disabled="!who.trim()" aria-label="Dodaj zdjęcie z Biblioteki" @change="fromLibrary">
        <option value="">+ z Biblioteki</option>
        <option v-for="it in images" :key="it.id" :value="it.id">{{ label(it) }}</option>
      </select>
      <button class="small" :disabled="!who.trim()" title="Zdjęcie z dysku — trafi też do Biblioteki" @click="fromDisk">Z dysku…</button>
    </div>
    <div v-for="list in people" :key="list[0].id" class="sp-person">
      <b>{{ list[0].name }}</b>
      <span v-for="p in list" :key="p.id" class="sp-item">
        <button class="sp-pic" :class="{ on: chosenOf(list).id === p.id }" :aria-pressed="chosenOf(list).id === p.id" title="Pokazuj to zdjęcie" @click="choosePhoto(p)"><img v-if="src(p)" :src="src(p)" alt=""></button>
        <button class="sp-del" title="Usuń z galerii" :aria-label="'Usuń zdjęcie: ' + p.name" @click="drop(p)">×</button>
      </span>
    </div>
  </div>
</template>
