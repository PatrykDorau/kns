<script setup lang="ts">
import { computed, ref } from 'vue'
import { cloud, settings, uid } from '@/stores'
import { libraryItem, materialToLibrary } from '@/services/materials'
import { choosePhoto, currentSpeaker, photosOf } from '@/services/studio/cards'
import { mediaSlide, mediaUrl } from '@/services/studio/media'
import PhotoPicker from './PhotoPicker.vue'

// Zdjęcia mówców: galeria przypisana do imienia. Pasek mówcy i karta kazania biorą wybrane zdjęcie mówcy z nabożeństwa.
// quick: w Studio tylko szybki wybór zdjęcia dzisiejszego mówcy.
defineProps<{ quick?: boolean }>()
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
const note = ref(''), importing = ref(false)
const add = (pic: string, name: string) => {
  if (!settings.speakerPhotos) settings.speakerPhotos = []
  if (!settings.speakerPhotos.some(p => p.pic === pic && p.name === name)) settings.speakerPhotos.push({ id: uid(), name, pic })
}
// „Zdjęcia mówców wycięte – Piotr Gruchała 2” → „Piotr Gruchała”
const nameFrom = (title: string) => (/[–—-]/.test(title) ? title.split(/\s[–—-]\s/).pop().replace(/\s*\d+$/, '').trim() : '')
function picked(id: string, title: string, fallback = who.value) {
  const name = fallback.trim() || nameFrom(title)
  if (name) add(id, name); else note.value = 'Wpisz, kogo jest to zdjęcie.'
}
// wszystkie zdjęcia z Materiałów o tytule „Zdjęcia mówców…” naraz, mówca z tytułu
async function importAll() {
  importing.value = true; note.value = ''
  try {
    const list = (await cloud.materials()).filter(m => /zdj[eę]cia m[oó]wc[oó]w/i.test(m.title) && nameFrom(m.title))
    const fresh = list.filter(m => { const it = libraryItem(m, 'stream'); return !it || !settings.speakerPhotos?.some(p => p.pic === it.id) })
    for (const m of fresh) { const it = await materialToLibrary(m, 'stream'); if (it) add(it.id, nameFrom(m.title)) }
    note.value = list.length ? `Dodano ${fresh.length} z ${list.length} zdjęć.` : 'W Materiałach nie ma zdjęć z tytułem „Zdjęcia mówców – Imię Nazwisko”.'
  } catch (e) { note.value = e.message || String(e) } finally { importing.value = false }
}
const drop = p => { settings.speakerPhotos = settings.speakerPhotos.filter(x => x.id !== p.id) }
</script>

<template>
  <div v-if="quick && speaker" class="sp-quick" role="group" :aria-label="'Zdjęcie: ' + speaker">
    <small class="muted">Zdjęcie: {{ speaker }}</small>
    <PhotoPicker v-if="!mine.length" text="Dodaj zdjęcie…" @pick="(id, title) => picked(id, title, speaker)" />
    <template v-if="mine.length > 1"><button v-for="p in mine" :key="p.id" class="sp-pic" :class="{ on: chosenOf(mine).id === p.id }" :aria-pressed="chosenOf(mine).id === p.id" title="Pokaż to zdjęcie" @click="choosePhoto(p)"><img :src="src(p)" alt=""></button></template>
  </div>
  <div v-else-if="!quick" class="sp" role="group" aria-label="Zdjęcia mówców">
    <div class="desk-opt-group">
      <small class="muted">Zdjęcia mówców</small>
      <label class="sp-who">Mówca <input v-model="who" maxlength="60" aria-label="Imię mówcy" placeholder="np. Piotr Gruchała"></label>
      <PhotoPicker text="Dodaj zdjęcie…" @pick="(id, title) => picked(id, title)" />
      <button class="small" :disabled="importing" title="Dodaje do galerii wszystkie zdjęcia z Materiałów o tytule „Zdjęcia mówców – Imię Nazwisko”" @click="importAll">{{ importing ? 'Pobieram…' : 'Wszystkie z Materiałów' }}</button>
    </div>
    <p v-if="note" class="desk-help">{{ note }}</p>
    <div v-for="list in people" :key="list[0].id" class="sp-person">
      <b>{{ list[0].name }}</b>
      <span v-for="p in list" :key="p.id" class="sp-item">
        <button class="sp-pic" :class="{ on: chosenOf(list).id === p.id }" :aria-pressed="chosenOf(list).id === p.id" title="Pokazuj to zdjęcie" @click="choosePhoto(p)"><img v-if="src(p)" :src="src(p)" alt=""></button>
        <button class="sp-del" title="Usuń z galerii" :aria-label="'Usuń zdjęcie: ' + p.name" @click="drop(p)">×</button>
      </span>
    </div>
  </div>
</template>
