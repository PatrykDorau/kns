<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent, ref } from 'vue'
import { useApp } from '@/composables/useApp'

// Kamera: sygnały od operatora streamu (przez internet), z dźwiękiem w słuchawce, wibracją i głosem.
// Na zegarku: aplikacja ntfy na telefonie (te same sygnały jako powiadomienia — też przy zablokowanym ekranie).
export default defineComponent({
  setup() {
    const app = useApp()
    const watchOpen = ref(false)
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const store = ios ? 'https://apps.apple.com/app/ntfy/id1625396347' : 'https://play.google.com/store/apps/details?id=io.heckel.ntfy'
    const subscribe = 'ntfy://ntfy.sh/' + app.cueTopic
    const copied = ref(false)
    async function copyTopic() { try { await navigator.clipboard.writeText(app.cueTopic); copied.value = true; setTimeout(() => { copied.value = false }, 1800) } catch { /* bez schowka */ } }
    return { ...app, watchOpen, ios, store, subscribe, copied, copyTopic }
  },
})
</script>

<template>
<div class="camera" :class="cue.state" role="status" aria-live="assertive">
  <button class="ghost close" @click="closeCamera"><svg class="i"><use href="#back"/></svg>Zamknij</button>
  <button class="ghost cam-watch-btn" :aria-expanded="watchOpen" @click="watchOpen = !watchOpen">⌚ Na zegarku</button>
  <div class="big">{{ cueText[cue.state] }}</div>
  <button v-if="!cue.sound" class="start" @click="enableSound">Dotknij, aby włączyć dźwięk i głos</button>
  <label v-else class="cam-voice"><input v-model="cue.voice" type="checkbox" @change="cue.voice && cueSay('Głos włączony')">Mów sygnały na głos</label>
  <p class="net" :class="{ on: cue.online }">{{ cue.net }}</p>
  <div v-if="watchOpen" class="cam-watch" role="dialog" aria-label="Sygnały na zegarku">
    <b>Sygnały na zegarku i przy zablokowanym telefonie</b>
    <ol>
      <li>Zainstaluj darmową aplikację <b>ntfy</b> na telefonie. <a class="button small" :href="store" target="_blank" rel="noopener">Pobierz ntfy</a></li>
      <li>Dodaj sygnały kamery w ntfy. <a class="button small primary" :href="subscribe">Subskrybuj sygnały</a>
        <small>Jeśli przycisk nie zadziała: w ntfy „+” → temat <code>{{ cueTopic }}</code> <button class="small" @click="copyTopic">{{ copied ? 'Skopiowano' : 'Kopiuj' }}</button></small></li>
      <li>Włącz powiadomienia z ntfy na zegarku (aplikacja zegarka na telefonie, np. Wear OS albo Watch na iPhonie). Sygnał „Na wizji” ma najwyższy priorytet — mocna wibracja.</li>
    </ol>
    <small class="cam-watch-note">Ten ekran może być wtedy zamknięty, a telefon zablokowany. Zegarek pokazuje powiadomienia z telefonu, zwykle gdy telefon jest zablokowany.</small>
    <button class="small" @click="watchOpen = false">Zamknij</button>
  </div>
  <p class="hint">Na wizji — dwa krótkie wysokie · Przygotuj się — jeden średni · Poza wizją — jeden długi niski{{ cue.sound && cue.voice ? ' · i na głos' : '' }}.
    Ekran zostaje włączony; nie wychodź z aplikacji.</p>
</div>
</template>
