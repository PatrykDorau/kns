<script setup lang="ts">
import { SCENES, setScene, studio } from '@/services/studio'
import { SCENE_KEYS } from '@/composables/stream/useDeskKeys'
// co robi scena — w podpowiedzi przycisku (wcześniej ramka z tekstem pod scenami)
const SCENE_HELP: Record<string, string> = {
  camera: 'Obraz z kamery (ATEM po USB). Napisy, pasek mówcy, modlitwa, PIP (materiał w okienku), grafika i baner — niżej, w „Nakładkach”.',
  projector: 'Obraz z rzutnika (przez sieć z laptopa przy rzutniku). Kamerę w okienku włączysz niżej, w „Nakładkach”.',
  countdown: 'Plansza przed nabożeństwem: zegar, ogłoszenia w środku (które i jak często — zakładka „Ogłoszenia”), na końcu „Zaraz zaczynamy”.',
  media: 'Materiał z Biblioteki na cały ekran — wybierz go niżej w Bibliotece („Na ekran”).',
  life: 'Kamera i jadące obok ogłoszenia, do tego najbliższe wydarzenia i kod QR. Na czas, gdy kamerzysta chodzi między ludźmi.',
  end: 'Podziękowanie z kodami QR (wsparcie, YouTube, Spotify) — dane do wsparcia w „Plansza końcowa” w prawej kolumnie.',
}


// Przyciski scen transmisji: zaznaczona — na podglądzie, z czerwonym paskiem — na wizji.
</script>

<template>
  <div class="desk-scenes" role="group" aria-label="Sceny transmisji">
    <small class="desk-lbl desk-scenes-lbl">Sceny</small>
    <button v-for="([id, name], i) in SCENES" :key="id" :class="{ on: studio.preview.scene === id, live: studio.program.scene === id }" :aria-pressed="studio.preview.scene === id" :title="(studio.program.scene === id ? 'Na wizji · ' : '') + SCENE_HELP[id] + ' (klawisz ' + SCENE_KEYS[i] + ')'" @click="setScene(id)">{{ name }}<kbd class="scene-key">{{ SCENE_KEYS[i] }}</kbd></button>
  </div>
</template>
