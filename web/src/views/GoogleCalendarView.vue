<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Kalendarz kościoła w Kalendarzu Google (subskrypcja)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <div class="gcal">
    <p>Nabożeństwa i wydarzenia z aplikacji pojawią się w Twoim Kalendarzu Google (albo w kalendarzu iPhone'a) i będą się same uzupełniać.</p>
    <p class="note">Google odświeża subskrybowane kalendarze sam — zwykle co kilka godzin, więc nowe wydarzenie trafi tam z opóźnieniem (w aplikacji od razu).</p>
    <p v-if="gcal.error" class="error">{{ gcal.error }}</p>
    <p v-if="!gcal.url" class="note">{{ gcal.busy ? 'Przygotowuję adres…' : '' }}</p>
    <template v-else>
      <a class="button primary" :href="gcal.google" target="_blank" rel="noopener"><svg class="i"><use href="#calendar"/></svg>Dodaj do Kalendarza Google</a>
      <a class="button" :href="gcal.webcal"><svg class="i"><use href="#calendar"/></svg>iPhone, Outlook i inne</a>
      <label for="gcalUrl">Adres kalendarza (prywatny — nie udostępniaj go)</label>
      <div class="gcal-url"><input id="gcalUrl" :value="gcal.url" readonly @focus="$event.target.select()"><button @click="copyGcal">{{ gcal.copied ? 'Skopiowano' : 'Kopiuj' }}</button></div>
      <p class="note">Na komputerze: Kalendarz Google → „Inne kalendarze” → <b>+</b> → „Z adresu URL” → wklej adres.</p>
      <button class="ghost" :disabled="gcal.busy" @click="renewGcal">Utwórz nowy adres (stary przestanie działać)</button>
    </template>
  </div>
</template>
