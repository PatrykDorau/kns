<script setup lang="ts">
import { computed } from 'vue'
import { settings } from '@/stores'
import { studio } from '@/services/studio'

// Plansza końcowa transmisji: dane do wsparcia (konto, BLIK) i kody QR do YouTube i Spotify.
const bankOk = computed(() => !settings.donateAccount || String(settings.donateAccount).replace(/\D/g, '').length === 26)
</script>

<template>
  <details class="desk-set">
    <summary>Plansza końcowa: wsparcie, YouTube, Spotify</summary>
    <div class="desk-grid">
      <label>Numer konta (26 cyfr)<input v-model="settings.donateAccount" inputmode="numeric" placeholder="np. 12 3456 7890 …" autocomplete="off"></label>
      <label>Telefon do BLIK<input v-model="settings.donatePhone" inputmode="tel" placeholder="np. 600 100 200" autocomplete="off"></label>
      <label>Odbiorca przelewu<input v-model="settings.donateName" autocomplete="off"></label>
      <label>Tytuł przelewu<input v-model="settings.donateTitle" autocomplete="off"></label>
    </div>
    <p v-if="!bankOk" class="note bad">Numer konta powinien mieć 26 cyfr (bez „PL”).</p>
    <p class="note">Z numerem konta na planszy jest kod QR przelewu — aplikacja banku po zeskanowaniu sama wypełnia odbiorcę, konto i tytuł (kwotę wpisuje osoba). BLIK na telefon nie ma kodu QR — numer telefonu jest pokazany dużym napisem. YouTube i Spotify: kody QR z linków „Posłuchaj” ze strony{{ studio.end.youtube || studio.end.spotify ? '' : ' (na stronie nie ma jeszcze linków)' }}.</p>
  </details>
</template>
