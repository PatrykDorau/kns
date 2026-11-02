<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings, uid } from '@/stores'
import { showSlide, studio, upcomingService } from '@/services/studio'
import { cardPic, currentSpeaker, hasSermon, moveSlide, setCardPic } from '@/services/studio/cards'
import PhotoPicker from './PhotoPicker.vue'

// Zakładka „Ogłoszenia”: pętla ogłoszeń w odliczaniu — które są w pętli, co ile sekund, pokaż teraz.
const props = defineProps<{ slides: { id: string; title: string; image?: string; text?: string; service?: boolean; sermon?: boolean; own?: boolean }[] }>()
function toggleSlide(id: string) { const h = new Set(settings.studioHidden || []); h.has(id) ? h.delete(id) : h.add(id); settings.studioHidden = [...h] }
// własne ogłoszenia: grafika albo tekst, tylko na transmisję
const writing = ref(false), newTitle = ref(''), newText = ref('')
const extra = (x: { title: string; pic?: string; text?: string }) => { settings.studioExtra = [...(settings.studioExtra || []), { id: 'x' + uid(), ...x }] }
function addText() { extra({ title: newTitle.value.trim(), text: newText.value.trim() }); newTitle.value = ''; newText.value = ''; writing.value = false }
function dropExtra(id: string) { settings.studioExtra = (settings.studioExtra || []).filter(x => x.id !== id) }
// przeciąganie kafelków i strzałki
const dragged = ref(''), over = ref('')
function drop(to: string) { if (dragged.value) moveSlide(dragged.value, to); dragged.value = ''; over.value = '' }
function step(id: string, by: number) { const i = props.slides.findIndex(x => x.id === id), to = props.slides[i + by]; if (to) moveSlide(id, to.id) }
</script>

<template>
  <div class="desk-slide-bar">
    <label>Zmiana co <select v-model.number="settings.studioSlideSec"><option v-for="v in [5, 8, 10, 15, 20]" :key="v" :value="v">{{ v }} s</option></select></label>
    <small class="muted">Kliknij grafikę — pokaże się teraz. Oko — w pętli albo pominięte. Tylko „dla wszystkich” z „Pokaż na nabożeństwie”.</small>
  </div>
  <div class="desk-slide-add">
    <PhotoPicker text="Dodaj grafikę…" @pick="(pic, title) => extra({ title, pic })" />
    <button class="small" :class="{ on: writing }" :aria-expanded="writing" @click="writing = !writing"><Icon name="text" />Dodaj tekst</button>
    <small class="muted">Przeciągnij kafelek, żeby zmienić kolejność.</small>
  </div>
  <div v-if="currentSpeaker()" class="desk-slide-add">
    <small class="muted">Zdjęcie na kartę kazania: {{ currentSpeaker() }}</small>
    <PhotoPicker :model-value="cardPic(currentSpeaker())" @update:model-value="setCardPic(currentSpeaker(), $event)" />
    <button v-if="cardPic(currentSpeaker())" class="small" @click="setCardPic(currentSpeaker(), '')">Bez zdjęcia</button>
  </div>
  <form v-if="writing" class="desk-slide-form" @submit.prevent="addText">
    <input v-model="newTitle" placeholder="Tytuł" aria-label="Tytuł ogłoszenia" maxlength="80">
    <input v-model="newText" placeholder="Treść (opcjonalnie)" aria-label="Treść ogłoszenia" maxlength="240">
    <button class="primary small" :disabled="!newTitle.trim()">Dodaj</button>
  </form>
  <div class="desk-slide-grid">
    <div v-for="sl in slides" :key="sl.id" class="desk-slide" :class="{ off: studio.hidden.includes(sl.id), now: studio.slideId === sl.id && !studio.hidden.includes(sl.id), over: over === sl.id && dragged !== sl.id }"
         draggable="true" @dragstart="dragged = sl.id" @dragover.prevent="over = sl.id" @dragleave="over === sl.id && (over = '')" @drop.prevent="drop(sl.id)" @dragend="dragged = ''; over = ''">
      <button class="desk-slide-pic" :disabled="studio.hidden.includes(sl.id) || (sl.sermon && !hasSermon())" :title="sl.sermon && !hasSermon() ? 'W planie nabożeństwa nie ma kazania ani mówcy' : 'Pokaż teraz: ' + sl.title" @click="showSlide(sl.id)">
        <img v-if="sl.image" :src="sl.image" alt="" loading="lazy">
        <span v-else class="desk-slide-txt"><b>{{ sl.title }}</b><small v-if="sl.text">{{ sl.text }}</small><small v-if="sl.sermon">{{ !hasSermon() ? '⚠ brak kazania i mówcy — uzupełnij w Organizacji' : cardPic(currentSpeaker()) ? 'tytuł, fragment i zdjęcie kaznodziei' : '⚠ bez zdjęcia: ' + (currentSpeaker() || 'brak mówcy') + ' — dodaj powyżej' }}</small><small v-if="sl.service">{{ upcomingService() ? 'data, miejsce i kazanie' : '⚠ brak zaplanowanego — uzupełnij w Organizacji' }}</small></span>
        <em v-if="studio.slideId === sl.id && !studio.hidden.includes(sl.id)">TERAZ</em>
      </button>
      <span class="desk-slide-name" :title="sl.title">{{ sl.title }}</span>
      <button class="desk-slide-eye" title="Wcześniej" :aria-label="'Wcześniej: ' + sl.title" @click="step(sl.id, -1)"><Icon name="left" /></button>
      <button class="desk-slide-eye" title="Później" :aria-label="'Później: ' + sl.title" @click="step(sl.id, 1)"><Icon name="right" /></button>
      <button v-if="sl.own" class="desk-slide-eye" title="Usuń to ogłoszenie" :aria-label="'Usuń: ' + sl.title" @click="dropExtra(sl.id)"><Icon name="x" /></button>
      <button class="desk-slide-eye" :title="studio.hidden.includes(sl.id) ? 'Włącz do pętli' : 'Pomiń w pętli'" :aria-label="studio.hidden.includes(sl.id) ? 'Włącz do pętli' : 'Pomiń w pętli'" @click="toggleSlide(sl.id)"><Icon :name="studio.hidden.includes(sl.id) ? 'eyeoff' : 'eye'" /></button>
    </div>
  </div>
  <p class="note">Ta pętla gra w Odliczaniu i na scenie Materiał (Biblioteka → „Ogłoszenia w pętli” → Na ekran). Pętla „Ogłoszenia — grafiki” z Rzutnika to osobna, stała kopia — tej listy nie słucha. Inne ogłoszenia dodasz albo wyłączysz w Ogłoszeniach („Pokaż na nabożeństwie”, „Dla wszystkich”). Lista zmienia się sama.</p>
</template>
