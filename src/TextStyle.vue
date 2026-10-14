<script setup>
import Icon from './Icon.vue'
import Thumb from './Thumb.vue'
import ColorAlpha from './ColorAlpha.vue'
import { pickBackground, setBackground } from './store.js'

// Wygląd tekstu — wspólny dla pojedynczych tekstów i dla wszystkich pieśni.
defineProps({ model: Object })
</script>

<template>
  <label>Największy rozmiar tekstu</label>
  <input v-model.number="model.fs" type="range" min="3" max="40" step="0.5" aria-label="Rozmiar tekstu">
  <p class="note">Dłuższy tekst zmniejszy się sam, żeby zmieścić się na ekranie.</p>

  <label>Kolor tekstu</label>
  <input v-model="model.color" type="color" aria-label="Kolor tekstu">
  <ColorAlpha :model="model" label="Kolor tła" :disabled="!!model.bgImage" />

  <label>Zdjęcie w tle</label>
  <div v-if="model.bgImage" class="bgpick">
    <Thumb :item="{ type: 'image', path: model.bgImage }" />
    <button @click="pickBackground(model)">Zmień</button>
    <button class="iconbtn danger" title="Usuń zdjęcie tła" aria-label="Usuń zdjęcie tła" @click="setBackground(model, null)"><Icon name="x" /></button>
  </div>
  <button v-else class="wide" @click="pickBackground(model)"><Icon name="image" />Wybierz zdjęcie tła</button>
  <template v-if="model.bgImage">
    <label>Przyciemnienie zdjęcia: {{ Math.round((model.dim ?? 0.45) * 100) }}%</label>
    <input :value="model.dim ?? 0.45" type="range" min="0" max="0.9" step="0.05" aria-label="Przyciemnienie zdjęcia"
           @input="model.dim = +$event.target.value">
  </template>

  <div class="row2">
    <div>
      <label>W poziomie</label>
      <select v-model="model.align" aria-label="Wyrównanie w poziomie">
        <option value="left">Do lewej</option>
        <option value="center">Do środka</option>
        <option value="right">Do prawej</option>
      </select>
    </div>
    <div>
      <label>W pionie</label>
      <select :value="model.valign || 'center'" aria-label="Położenie w pionie" @change="model.valign = $event.target.value">
        <option value="top">Od góry</option>
        <option value="center">Na środku</option>
        <option value="bottom">Na dole</option>
      </select>
    </div>
  </div>
  <label class="check"><input v-model="model.shadow" type="checkbox"> Cień pod literami (czytelniej na zdjęciu)</label>
  <template v-if="model.shadow">
    <label>Wyrazistość cienia: {{ Math.round((model.shadowLevel ?? 0.6) * 100) }}%</label>
    <input :value="model.shadowLevel ?? 0.6" type="range" min="0.05" max="1" step="0.05" aria-label="Wyrazistość cienia"
           @input="model.shadowLevel = +$event.target.value">
  </template>
</template>
