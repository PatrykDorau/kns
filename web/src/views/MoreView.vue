<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// MoreView
const TAB_IDS = ['home', 'cal', 'serve'] // są w dolnym pasku
export default defineComponent({ setup: () => ({ ...useApp(), TAB_IDS }) })
</script>

<template>
  <!-- te same grupy i pozycje co w bocznym pasku na komputerze (bez tych z dolnego paska) -->
  <template v-for="grp in sideNav" :key="grp.title">
    <template v-if="grp.items.some(it => !TAB_IDS.includes(it.id))">
      <h2 v-if="grp.title" class="more-sec">{{ grp.title }}</h2>
      <nav class="more-list" :aria-label="grp.title || 'Więcej'">
        <button v-for="it in grp.items.filter(it => !TAB_IDS.includes(it.id))" :key="it.id" @click="navTo(it.id)"><svg class="i"><use :href="'#' + it.icon"/></svg><span>{{ it.name }}<small v-if="it.beta" class="beta-tag">beta</small></span><small v-if="it.badge" class="count-pill">{{ it.badge }}</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
      </nav>
    </template>
  </template>
  <h2 class="more-sec">Inne</h2>
  <nav class="more-list" aria-label="Inne">
    <button v-if="api.enabled" @click="reportBug"><svg class="i"><use href="#alert"/></svg><span>Zgłoś błąd albo pomysł</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button class="theme-btn" @click="toggleTheme"><svg class="i"><use :href="theme === 'dark' ? '#sun' : '#moon'"/></svg><span>{{ theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny' }}</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
  </nav>
  <div v-if="desktop" class="getapp more-getapp">
    <img src="icon-192.png" alt="">
    <span class="ga-text"><b>Aplikacja na komputer — dla służby technicznej</b><small>{{ desktopApp.error || 'Rzutnik, stream i organizacja nabożeństw · Windows' + (desktopApp.version ? ' · wersja ' + desktopApp.version : '') + (desktopApp.size ? ' · ' + desktopApp.size + ', ' + desktopApp.installed : '') }}</small></span>
    <a v-if="desktopApp.url" class="button primary" :href="desktopApp.url"><svg class="i"><use href="#download"/></svg>Pobierz</a>
  </div>
  <div v-if="push.supported && !api.enabled" class="push-card" :class="{ on: push.on }">
    <div class="pc-head">
      <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
      <div class="pc-text">
        <b>{{ push.on ? 'Powiadomienia włączone' : 'Powiadomienia o brakach' }}</b>
        <p v-if="push.on">Dostaniesz powiadomienie, gdy na najbliższą niedzielę czegoś brakuje.</p>
        <p v-else-if="push.otherBrowser">Ta przeglądarka ({{ push.otherBrowser }}) nie obsługuje powiadomień. Otwórz stronę w <b>Chrome</b> i zainstaluj aplikację stamtąd (menu ⋮ → „Zainstaluj aplikację”).</p>
        <p v-else-if="push.needsInstall">Na iPhonie najpierw zainstaluj aplikację (przycisk „Pobierz” wyżej) i otwórz ją z ekranu głównego.</p>
        <p v-else-if="push.denied">Powiadomienia są zablokowane w ustawieniach telefonu dla tej strony — odblokuj je tam i spróbuj ponownie.</p>
        <p v-else>Przypomnienie, gdy na niedzielę czegoś brakuje. Dzień i godzinę wybierzesz po włączeniu.</p>
      </div>
    </div>
    <div v-if="push.on" class="pc-when">
      <span class="pc-label">Kiedy przypominać</span>
      <div class="pc-row">
        <UiSelect v-model="push.day" compact label="Dzień przypomnienia" :disabled="push.busy" :options="DAYS.map((name, i) => ({ value: i, label: name }))" @change="saveSchedule" />
        <span>o</span>
        <UiSelect v-model="push.hour" compact label="Godzina przypomnienia" :disabled="push.busy" :options="HOURS.map(h => ({ value: h, label: h + ':00' }))" @change="saveSchedule" />
      </div>
      <small v-if="push.saved" class="pc-saved">Zapisano ✓</small>
    </div>
    <p v-if="push.error" class="pc-error">{{ push.error }}</p>
    <p v-else-if="push.slow" class="pc-slow">{{ push.slow }}</p>
    <div v-if="push.on" class="pc-actions two">
      <button :disabled="push.busy" title="Wysyła powiadomienie na ten telefon, żeby zobaczyć, jak wygląda" @click="testPush">{{ push.busy ? 'Wysyłam…' : 'Wyślij próbne powiadomienie' }}</button>
      <button :disabled="push.busy" @click="disablePush">Wyłącz</button>
    </div>
    <div v-else-if="push.otherBrowser" class="pc-actions"><a class="button primary" :href="chromeLink">Otwórz w Chrome</a></div>
    <div v-else-if="!push.needsInstall" class="pc-actions"><button class="primary" :disabled="push.busy" @click="enablePush">{{ push.busy ? 'Włączam…' : 'Włącz powiadomienia' }}</button></div>
  </div>
  <button v-if="api.enabled && me" class="songsbtn" @click="openProfile"><svg class="i" :class="{ 'kh-warn': needsName }"><use :href="needsName ? '#warn' : '#user'"/></svg>Mój profil — {{ needsName ? 'uzupełnij imię i nazwisko' : me.name }}{{ me.grupa ? ' · ' + me.grupa : '' }}<svg class="i chev"><use href="#chev"/></svg></button>
  <div class="account">
    <svg class="i"><use href="#user"/></svg><span>{{ me?.email || drive.account() || 'Zalogowano' }}<template v-if="myRanks"> · <span class="roles">{{ myRanks }}</span></template></span>
    <button v-if="!drive.demo" class="ghost" @click="logout"><svg class="i"><use href="#logout"/></svg>Wyloguj</button>
    <small class="acc-ver">wersja {{ version }}</small>
  </div>
</template>
