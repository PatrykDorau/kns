<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import ChurchMaterials from '@/components/display/ChurchMaterials.vue'
import { ref } from 'vue'
import { busy, label } from '@/stores'
import { showMediaFull, showMediaOverlay } from '@/services/studio'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { mediaKind } from '@/composables/stream/useStudioMedia'

// Zakładka „Media”: zdjęcie, film, napis albo prezentacja z biblioteki — na ekran albo jako nakładka.
const { mediaList, pvFull, pvOver, onAirIds, pickMedia, addMediaFiles, newText, addMediaText, deskTab } = useDesk()
const showMats = ref(false) // lista „Materiałów” z aplikacji
async function addFiles() { if (await addMediaFiles()) deskTab.value = 'media' }
</script>

<template>
  <div class="desk-media-bar">
    <button class="small" :disabled="!!busy" title="Zdjęcie, film, PDF albo PowerPoint (prezentacja — jako slajdy)" @click="addFiles"><Icon name="plus" />{{ busy || 'Dodaj pliki' }}</button>
    <input v-model="newText" class="desk-media-txt" placeholder="Napis na transmisję, np. „Zbiórka na remont — BLIK 789 571 542”" aria-label="Nowy napis" @keydown.enter="addMediaText">
    <button class="small" :disabled="!newText.trim()" @click="addMediaText"><Icon name="text" />Dodaj napis</button>
    <button class="small" :aria-pressed="showMats" title="Pliki z „Materiałów” w aplikacji" @click="showMats = !showMats"><Icon name="folder" />Z materiałów</button>
  </div>
  <div v-if="showMats" class="desk-mats"><ChurchMaterials action="Do mediów" @added="showMats = false" /></div>
  <p class="desk-help"><b>Na ekran</b> — materiał zamiast obrazu z kamery (scena „Media”). <b>Nakładka</b> — na obrazie z kamery albo rzutnika: w rogu albo na całym kadrze (logo PNG, napis).</p>
  <div v-if="mediaList.length" class="desk-media-grid">
    <div v-for="it in mediaList" :key="it.id" class="desk-media-it" :class="{ on: pvFull?.id === it.id || pvOver?.id === it.id, live: onAirIds.includes(it.id) }">
      <button class="desk-media-pic" :title="'Podgląd: ' + label(it)" @click="pickMedia(it)"><Thumb :item="it" /></button>
      <span class="desk-media-meta"><b :title="label(it)">{{ label(it) }}</b><small>{{ mediaKind(it) }}<template v-if="it.type === 'scene'"> · {{ (it.entries || []).length }} slajdów</template></small></span>
      <span class="desk-media-act">
        <button :class="{ on: pvFull?.id === it.id }" title="Na cały ekran (scena Media)" @click="showMediaFull(it.id)">Na ekran</button>
        <button :class="{ on: pvOver?.id === it.id }" title="Nakładka na kamerze/rzutniku" @click="showMediaOverlay(it.id)">Nakładka</button>
      </span>
      <label v-if="it.type === 'scene'" class="desk-media-auto" title="Slajdy zmieniają się same, gdy prezentacja jest na wizji">
        <input type="checkbox" :checked="!!it.mAuto" @change="it.mAuto = ($event.target as HTMLInputElement).checked"> same co
        <select :value="it.mSec || 8" @change="it.mSec = +($event.target as HTMLSelectElement).value"><option v-for="v in [4, 6, 8, 10, 15, 20, 30]" :key="v" :value="v">{{ v }} s</option></select>
      </label>
      <em v-if="onAirIds.includes(it.id)">NA WIZJI</em><em v-else-if="pvFull?.id === it.id || pvOver?.id === it.id" class="pv">PODGLĄD</em>
    </div>
  </div>
  <p v-else class="note">Biblioteka jest pusta — dodaj pliki albo napis. To ta sama Biblioteka, co w Rzutniku.</p>
  <textarea v-if="(pvOver || pvFull)?.type === 'text'" v-model="(pvOver || pvFull).text" class="desk-media-edit" rows="2" aria-label="Treść napisu" title="Zmiany widać od razu (także na wizji)"></textarea>
</template>
