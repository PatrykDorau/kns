<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Kamera: sygnały od operatora streamu (przez internet), z dźwiękiem w słuchawce i wibracją.
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="camera" :class="cue.state" role="status" aria-live="assertive">
  <button class="ghost close" @click="closeCamera"><svg class="i"><use href="#back"/></svg>Zamknij</button>
  <div class="big">{{ cueText[cue.state] }}</div>
  <button v-if="!cue.sound" class="start" @click="enableSound">Dotknij, aby włączyć dźwięk</button>
  <p class="net" :class="{ on: cue.online }">{{ cue.net }}</p>
  <p class="hint">Na wizji — dwa krótkie wysokie · Przygotuj się — jeden średni · Poza wizją — jeden długi niski.
    Ekran zostaje włączony; nie wychodź z aplikacji.</p>
</div>
</template>
