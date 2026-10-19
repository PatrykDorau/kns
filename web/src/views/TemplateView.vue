<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// szablon jednego rodzaju wydarzeń
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <label for="tName">Nazwa <span class="req">*</span></label>
  <input id="tName" v-model="tplType.name" :class="{ invalid: !tplType.name.trim() }" :disabled="tplType.id === 'nabozenstwo'" autocomplete="off">
  <label>Kolor w kalendarzu</label>
  <div class="swatches" role="group" aria-label="Kolor">
    <button v-for="c in COLORS" :key="c" type="button" :class="{ on: tplType.color === c }" :style="{ '--c': c }" :aria-label="'Kolor ' + c" :aria-pressed="tplType.color === c" @click="tplType.color = c"></button>
  </div>
  <div class="row">
    <div><label for="tTime">Domyślna godzina</label><input id="tTime" v-model="tplType.time" type="time"></div>
    <div><label for="tPlace">Domyślne miejsce</label><input id="tPlace" v-model="tplType.place" autocomplete="off"></div>
  </div>
  <label>Program</label>
  <p class="note" style="margin-top:0">Godziny punktów są liczone od godziny rozpoczęcia — gdy wydarzenie zacznie się o innej porze, cały program przesunie się razem z nią.</p>
  <program-editor :items="tplType.program" :start="tplType.time || '00:00'"></program-editor>
  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div class="bar">
    <template v-if="tplType.id !== 'nabozenstwo' && types.some(t => t.id === tplType.id)">
      <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeType">Na pewno usuń</button>
      <button v-else :disabled="busy" aria-label="Usuń ten rodzaj" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
    </template>
    <button class="primary" :disabled="busy || !tplDirty || !tplType.name.trim()" @click="saveTemplate">
      <svg v-if="!tplDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : tplDirty ? 'Zapisz' : 'Zapisane' }}
    </button>
  </div>
</template>
