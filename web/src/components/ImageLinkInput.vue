<script lang="ts">
// @ts-nocheck
import { defineComponent, ref } from 'vue'
import { driveInfo, imageFromLink } from '@/services/church'

// Grafika z linku (np. z Dysku Google) zamiast wgrywania — plik zostaje na Dysku, u nas tylko adres.
// Przed wstawieniem sprawdza, czy obrazek się wczytuje (plik na Dysku musi być udostępniony „Każda osoba mająca link”).
export default defineComponent({
  props: { compact: Boolean }, // compact — przycisk „Wstaw” jako sama ikonka (wąskie miejsca)
  emits: ['pick'],
  setup(_, { emit }) {
    const url = ref(''), busy = ref(false), err = ref('')
    function apply() {
      const src = imageFromLink(url.value)
      err.value = ''
      if (!src) { err.value = driveInfo(url.value) ? 'To link do folderu albo dokumentu — wklej link do samego pliku z grafiką.' : 'To nie wygląda na link do grafiki.'; return }
      busy.value = true
      const img = new Image()
      img.onload = () => { busy.value = false; emit('pick', src); url.value = '' }
      img.onerror = () => { busy.value = false; err.value = 'Nie udało się wczytać grafiki. Na Dysku Google: „Udostępnij” → „Każda osoba mająca link”, i wklej link jeszcze raz.' }
      img.src = src
    }
    return { url, busy, err, apply }
  },
})
</script>

<template>
  <div class="img-link">
    <div class="row">
      <input v-model.trim="url" :placeholder="compact ? 'albo link z Dysku Google' : 'albo wklej link do grafiki (Google Dysk)'" inputmode="url" autocomplete="off" aria-label="Link do grafiki" @keydown.enter.prevent="apply">
      <button type="button" :disabled="!url || busy" :aria-label="compact ? 'Wstaw grafikę z linku' : null" :title="compact ? 'Wstaw grafikę z linku' : null" @click="apply"><svg class="i"><use href="#link"/></svg><template v-if="!compact">{{ busy ? 'Sprawdzam…' : 'Wstaw' }}</template></button>
    </div>
    <p v-if="err" class="error" style="margin:6px 0 0">{{ err }}</p>
  </div>
</template>

<style scoped>
.img-link { margin-top: 8px; }
.img-link .row { display: flex; gap: 8px; }
.img-link .row > input { flex: 1 1 auto; min-width: 0; }
.img-link .row > button { flex: 0 0 auto; }
</style>
