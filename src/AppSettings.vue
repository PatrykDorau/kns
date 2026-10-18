<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { api, flush, overlayUrl, remoteUrl, settings, uid } from './store.js'

const emit = defineEmits(['close'])
const message = ref('')
// Adres napisów z wybraną pozycją i rozmiarem (parametry czyta sama strona).
const lyricsQuery = () => {
  const q = new URLSearchParams()
  if (settings.lyricsPos && settings.lyricsPos !== 'dol') q.set('pozycja', settings.lyricsPos)
  if (settings.lyricsSize && settings.lyricsSize !== 6) q.set('rozmiar', settings.lyricsSize)
  if (settings.lyricsBar) q.set('pasek', '1')
  return q
}
// Przez internet: strona na kns-nabo z kluczem tego komputera (OBS na laptopie od streamu, w dowolnej sieci).
const onlineLink = computed(() => {
  const q = lyricsQuery()
  q.set('k', settings.lyricsKey)
  return 'https://kns-nabo.netlify.app/napisy?' + q
})
function newLyricsKey() {
  if (confirm('Nowy klucz — stary adres w OBS przestanie działać i trzeba będzie wkleić nowy. Kontynuować?')) settings.lyricsKey = uid() + uid() + uid()
}
const lyricsLink = computed(() => {
  if (!overlayUrl.value) return ''
  const q = new URLSearchParams()
  if (settings.lyricsPos && settings.lyricsPos !== 'dol') q.set('pozycja', settings.lyricsPos)
  if (settings.lyricsSize && settings.lyricsSize !== 6) q.set('rozmiar', settings.lyricsSize)
  if (settings.lyricsBar) q.set('pasek', '1')
  return overlayUrl.value + (q.toString() ? '?' + q : '')
})
const copied = ref(false)
async function copyLyrics(text) { await navigator.clipboard.writeText(text); copied.value = text; setTimeout(() => { if (copied.value === text) copied.value = false }, 1500) }

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

      <h4>Napisy pieśni dla OBS (przezroczyste tło, z cieniem)</h4>
      <p class="note">Bieżąca zwrotka z rzutnika, bez tła — w OBS źródło „Przeglądarka” nad kamerą. Nie trzeba kluczowania lumą w ATEM (luma wycina też cień).</p>
      <label class="check"><input v-model="settings.lyricsOnline" type="checkbox"> Przez internet — OBS na innym komputerze, w dowolnej sieci</label>
      <p v-if="settings.lyricsOnline" class="url">Adres: <b>{{ onlineLink }}</b> <button class="small" @click="copyLyrics(onlineLink)">{{ copied === onlineLink ? 'Skopiowano' : 'Kopiuj' }}</button> <button class="small" title="Nowy adres — stary przestanie działać" @click="newLyricsKey">Nowy klucz</button></p>
      <label class="check"><input v-model="settings.lyrics" type="checkbox"> Na tym komputerze albo w tej samej sieci (bez internetu)</label>
      <p v-if="settings.lyrics && overlayUrl" class="url">Adres: <b>{{ lyricsLink }}</b> <button class="small" @click="copyLyrics(lyricsLink)">{{ copied === lyricsLink ? 'Skopiowano' : 'Kopiuj' }}</button></p>
      <template v-if="settings.lyricsOnline || (settings.lyrics && overlayUrl)">
        <div class="btnrow">
          <label class="inline">Pozycja <select v-model="settings.lyricsPos"><option value="dol">na dole</option><option value="srodek">na środku</option><option value="gora">na górze</option></select></label>
          <label class="inline">Rozmiar <select v-model.number="settings.lyricsSize"><option :value="4">mały</option><option :value="6">średni</option><option :value="8">duży</option></select></label>
          <label class="check"><input v-model="settings.lyricsBar" type="checkbox"> Ciemny pasek pod tekstem</label>
        </div>
      </template>
      <p class="note">W OBS: Źródła → + → „Przeglądarka” → wklej adres, szerokość 1920, wysokość 1080 → ustaw to źródło nad kamerą. „Ukryj” chowa też napisy. Po zmianie pozycji lub rozmiaru wklej adres w OBS ponownie. Kto zna adres przez internet, widzi napisy — nie publikuj go.</p>

      <h4>Kopia biblioteki</h4>
      <div class="btnrow">
        <button @click="exportBackup"><Icon name="folder" />Zapisz kopię…</button>
        <button @click="importBackup"><Icon name="import" />Wczytaj kopię…</button>
      </div>
      <p class="note">Kopia to folder z materiałami, pieśniami i ustawieniami — do przeniesienia na inny komputer.</p>
      <p v-if="message" class="url">{{ message }}</p>

    </div>
  </div>
</template>
