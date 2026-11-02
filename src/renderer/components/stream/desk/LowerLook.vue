<script setup lang="ts">
import { LOWER_DEFAULT } from '@/services/studio/cards'
import PhotoPicker from './PhotoPicker.vue'
import SpeakerPhotos from './SpeakerPhotos.vue'
import TextColor from './TextColor.vue'

// Pasek mówcy w presecie: napisy, kolor, logo i zdjęcie mówcy.
const props = defineProps<{ look: { ink?: string, photo?: string, style?: string, name: string, sub: string, color: string, logo: boolean, photoSize?: string } }>()
if (props.look.photo === undefined) props.look.photo = LOWER_DEFAULT.photo // nowe pole po aktualizacji
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
      <button :class="{ on: look.photo === '@speaker' }" :aria-pressed="look.photo === '@speaker'" title="Zdjęcie z galerii poniżej, według mówcy z planu nabożeństwa" @click="look.photo = '@speaker'">Mówca z nabożeństwa</button>
      <button :class="{ on: look.photo === '' }" :aria-pressed="look.photo === ''" @click="look.photo = ''">Bez zdjęcia</button>
      <PhotoPicker v-model="look.photo" text="Stałe zdjęcie…" />
    </div>
    <div v-if="look.photo !== ''" class="desk-opt-group">
      <small class="muted">Wielkość zdjęcia</small>
      <button v-for="[id, name] in [['s', 'Mała'], ['m', 'Średnia'], ['l', 'Duża']]" :key="id" :class="{ on: (look.photoSize || 'm') === id }" :aria-pressed="(look.photoSize || 'm') === id" @click="look.photoSize = id">{{ name }}</button>
    </div>
    <SpeakerPhotos />
    <div class="desk-opt-group">
      <small class="muted">Kolor</small>
      <label class="desk-color" title="Kolor paska"><input v-model="look.color" type="color" aria-label="Kolor paska"></label>
      <button v-for="c in ['#f6a836', '#f5e532', '#e5484d', '#4f8ef7', '#ffffff']" :key="c" class="desk-swatch" :class="{ on: look.color === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor ' + c" @click="look.color = c"></button>
      <label class="check"><input v-model="look.logo" type="checkbox"> Logo kościoła</label>
      <button class="small" title="Przywróć domyślny pasek" @click="Object.assign(look, LOWER_DEFAULT)">Domyślny</button>
    </div>
    <p class="desk-help">Puste pole nic nie pokazuje. {mówca} i {kazanie} wstawiają dane z najbliższego nabożeństwa. PNG z wyciętym tłem stoi na pasku i wychodzi nad niego, a logo przechodzi na prawy koniec paska. Gdy mówca ma kilka zdjęć, kliknij to, które ma się pokazać — także w Studio.</p>
  </div>
</template>
