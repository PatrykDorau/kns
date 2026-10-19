<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import SongSlides from '@/components/SongSlides.vue'

// lista baza pieśni: edycja pojedynczej pieśni
export default defineComponent({ components: { SongSlides }, setup: () => useApp() })
</script>

<template>
  <p v-if="!canEdit" class="note readonly"><svg class="i"><use href="#eye"/></svg>Tylko podgląd — pieśni zmieniają osoby z rangą z prawem edycji.</p>
  <fieldset class="plain" :disabled="!canEdit">
  <div class="row">
    <div style="flex:0 0 96px"><label for="sNum">Numer</label><input id="sNum" v-model="song.number" inputmode="numeric" autocomplete="off"></div>
    <div><label for="sTitle">Tytuł <span class="req">*</span></label><input id="sTitle" v-model="song.title" :class="{ invalid: !song.title.trim() }" autocomplete="off"></div>
  </div>
  <p v-if="numberTaken" class="note error">Numer {{ song.number }} ma już pieśń „{{ numberTaken.title }}”.</p>
  <label>Tekst — slajdy na rzutniku</label>
  <SongSlides v-model="song.text" :disabled="!canEdit" />
  </fieldset>
  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div v-if="canEdit" class="bar">
    <template v-if="!song.isNew">
      <button v-if="confirmDelete" class="danger" :disabled="busy" @click="deleteSong">Na pewno usuń</button>
      <button v-else :disabled="busy" aria-label="Usuń pieśń" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
    </template>
    <button class="primary" :disabled="busy || !songDirty || !song.title.trim()" @click="saveSong()">
      <svg v-if="!songDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : songDirty ? 'Zapisz' : 'Zapisane' }}
    </button>
  </div>
</template>
