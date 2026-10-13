<script setup>
import { ref } from 'vue'
import Icon from './Icon.vue'
import { api, flush, notice, remoteUrl, removeAllSongs, settings, songs } from './store.js'

const emit = defineEmits(['close'])
const confirmSongs = ref(false)
const message = ref('')

async function exportBackup() {
  await flush()
  const res = await api.exportBackup()
  if (res.dir) message.value = 'Kopia zapisana w: ' + res.dir
}
async function importBackup() {
  await flush()
  const res = await api.importBackup()
  if (res.error) message.value = res.error
  // Dane na dysku zostały podmienione — wczytujemy aplikację od nowa.
  else if (res.ok) location.reload()
}
function deleteSongs() {
  removeAllSongs()
  confirmSongs.value = false
  notice.value = 'Usunięto wszystkie pieśni.'
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Ustawienia aplikacji">
      <div class="modal-head">
        <h3>Ustawienia aplikacji</h3>
        <button class="iconbtn" aria-label="Zamknij" :ref="el => el?.focus()" @click="emit('close')"><Icon name="x" /></button>
      </div>

      <h4>Przejścia</h4>
      <label class="check"><input type="checkbox" :checked="settings.fadeMs > 0" @change="settings.fadeMs = $event.target.checked ? 350 : 0"> Płynne przenikanie przy zmianie obrazu</label>
      <template v-if="settings.fadeMs > 0">
        <label for="gFade">Czas przejścia: {{ (settings.fadeMs / 1000).toLocaleString('pl') }} s</label>
        <input id="gFade" v-model.number="settings.fadeMs" type="range" min="100" max="3000" step="50">
      </template>
      <p class="note">Pętle mają własne ustawienie przejścia.</p>

      <h4>Pliki</h4>
      <label class="check"><input v-model="settings.copyFiles" type="checkbox"> Kopiuj dodawane pliki do biblioteki aplikacji</label>
      <p class="note">Dzięki temu materiały nie znikną po wyjęciu pendrive'a. Dotyczy plików dodawanych od teraz.</p>

      <h4>Pilot w telefonie</h4>
      <label class="check"><input v-model="settings.remote" type="checkbox"> Włącz sterowanie z telefonu (ta sama sieć Wi-Fi)</label>
      <p v-if="remoteUrl" class="url">Otwórz w telefonie: <b>{{ remoteUrl }}</b></p>
      <p class="note">Przyciski „Dalej”, „Wstecz” i „Ukryj”. Każdy, kto zna ten adres, może sterować obrazem.</p>

      <h4>Kopia biblioteki</h4>
      <div class="btnrow">
        <button @click="exportBackup"><Icon name="folder" />Zapisz kopię…</button>
        <button @click="importBackup"><Icon name="import" />Wczytaj kopię…</button>
      </div>
      <p class="note">Kopia to folder z materiałami, pieśniami i ustawieniami — do przeniesienia na inny komputer.</p>
      <p v-if="message" class="url">{{ message }}</p>

      <h4>Pieśni</h4>
      <div v-if="confirmSongs" class="btnrow">
        <button class="del-yes" @click="deleteSongs">Tak, usuń {{ songs.length }} pieśni</button>
        <button @click="confirmSongs = false">Nie</button>
      </div>
      <button v-else :disabled="!songs.length" @click="confirmSongs = true"><Icon name="trash" />Usuń wszystkie pieśni ({{ songs.length }})</button>
    </div>
  </div>
</template>
