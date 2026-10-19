<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// MoreView
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <nav class="more-list" aria-label="Więcej">
    <button v-if="canMsg" @click="openMsg()"><svg class="i"><use href="#megaphone"/></svg><span>Wyślij wiadomość</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button v-if="api.enabled" @click="openAsb"><svg class="i"><use href="#users"/></svg><span>{{ canAsb ? 'ASB — grafik spotkań' : 'ASB — terminarz spotkań' }}</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button v-if="api.enabled" @click="openListen"><svg class="i"><use href="#music"/></svg><span>Posłuchaj</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button v-if="api.enabled" @click="openVotes()"><svg class="i"><use href="#check"/></svg><span>Głosowania</span><small v-if="votesOpen" class="count-pill">{{ votesOpen }}</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button v-if="api.enabled" @click="openGoals()"><svg class="i"><use href="#money"/></svg><span>Cele wsparcia</span><small v-if="goalDue" class="count-pill">!</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button @click="openSongs"><svg class="i"><use href="#music"/></svg><span>Pieśni</span><small>{{ songs.length }}</small><svg class="i chev"><use href="#chev"/></svg></button>
    <button @click="openAnns"><svg class="i"><use href="#megaphone"/></svg><span>Ogłoszenia</span><small>{{ activeAnns.length || '' }}</small><svg class="i chev"><use href="#chev"/></svg></button>
    <button @click="openProtocols"><svg class="i"><use href="#list"/></svg><span>Materiały</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button v-if="canManage" @click="openPeople"><svg class="i"><use href="#users"/></svg><span>Osoby</span><small v-if="pendingCount" class="count-pill">{{ pendingCount }}</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button v-if="canEdit" @click="openTemplates"><svg class="i"><use href="#calendar"/></svg><span>Szablony wydarzeń</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button v-if="cueTopic && canCamera" @click="openCamera"><svg class="i"><use href="#camera"/></svg><span>Kamera (sygnały)</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
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
        <select v-model.number="push.day" aria-label="Dzień przypomnienia" :disabled="push.busy" @change="saveSchedule"><option v-for="(name, i) in DAYS" :key="i" :value="i">{{ name }}</option></select>
        <span>o</span>
        <select v-model.number="push.hour" aria-label="Godzina przypomnienia" :disabled="push.busy" @change="saveSchedule"><option v-for="h in HOURS" :key="h" :value="h">{{ h }}:00</option></select>
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
