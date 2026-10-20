<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Mój profil: imię i nazwisko, grupka
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <div class="profile-head">
    <span class="kh-av">{{ initials({ name: profile.name, email: me?.email || '' }) }}</span>
    <span><b>{{ me?.email }}</b><small>{{ myRanks || 'Członek' }}</small></span>
  </div>
  <label for="pfName">Imię i nazwisko <span class="req">*</span></label>
  <input id="pfName" v-model="profile.name" :class="{ invalid: !profile.name.trim() }" autocomplete="name">
  <label for="pfGroup">Grupka</label>
  <input id="pfGroup" v-model="profile.grupa" list="pf-groups" placeholder="np. Grupka domowa — Mokotów" autocomplete="off">
  <datalist id="pf-groups"><option v-for="g in groupNames" :key="g" :value="g"></option></datalist>
  <p class="note" style="margin-top:6px">Wybierz z listy albo wpisz nazwę. Dzięki grupce lider może wysłać powiadomienie całej grupce.</p>
  <label>Moje służby</label>
  <div class="mn-mine-list">
    <button v-for="m in serve.list.filter(m => m.mine || m.leader)" :key="m.id" type="button" class="mn-mine" :title="'Moja służba: ' + m.name" @click="m.mine === 'pending' ? openMinistry(m) : openServe('mine')"><b>{{ m.name }}</b><span :class="{ ok: m.leader || m.mine === 'active' }">{{ m.leader ? 'jesteś liderem' : m.mine === 'active' ? 'służysz' : 'czeka na akceptację lidera' }}</span><svg class="i chev"><use href="#chev"/></svg></button>
    <p v-if="!serve.busy && !serve.list.some(m => m.mine || m.leader)" class="note">Nie należysz jeszcze do żadnej służby.</p>
  </div>
  <button class="songsbtn" @click="openServe"><svg class="i"><use href="#serve"/></svg>Zgłoś się do służby<svg class="i chev"><use href="#chev"/></svg></button>
  <label>Powiadomienia i newsletter</label>
  <div v-if="push.supported" class="push-card" :class="{ on: push.on }">
    <div class="pc-head">
      <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
      <div class="pc-text">
        <b>Powiadomienia na tym urządzeniu {{ push.on ? '— włączone' : '' }}</b>
        <p v-if="push.on">Na ten telefon przychodzi wszystko z dzwonka: wiadomości od liderów, zgłoszenia, decyzje w służbach<template v-if="canEdit">, a także przypomnienie, gdy na niedzielę czegoś brakuje</template>.</p>
        <p v-else-if="push.otherBrowser">Ta przeglądarka ({{ push.otherBrowser }}) nie obsługuje powiadomień. Otwórz stronę w <b>Chrome</b> i zainstaluj aplikację stamtąd (menu ⋮ → „Zainstaluj aplikację”).</p>
        <p v-else-if="push.needsInstall">Na iPhonie najpierw zainstaluj aplikację (przycisk „Pobierz” wyżej) i otwórz ją z ekranu głównego.</p>
        <p v-else-if="push.denied">Powiadomienia są zablokowane w ustawieniach telefonu dla tej strony — odblokuj je tam i spróbuj ponownie.</p>
        <p v-else>Powiadomienia w aplikacji (dzwonek) są zawsze włączone. Włącz, żeby przychodziły też na ten telefon.</p>
      </div>
    </div>
    <div v-if="push.on && canEdit" class="pc-when">
      <span class="pc-label">Przypomnienie o brakach — kiedy</span>
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
  <div v-if="!push.supported" class="push-card">
    <div class="pc-head">
      <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
      <div class="pc-text"><b>Powiadomienia na telefon</b><p>Włącza się je na telefonie: otwórz tę stronę w telefonie (najlepiej zainstaluj aplikację), wejdź w Mój profil i kliknij „Włącz powiadomienia” — tam jest też „Wyślij próbne powiadomienie”. W aplikacji (dzwonek) powiadomienia są zawsze włączone.</p></div>
    </div>
  </div>
  <div v-if="api.enabled && me?.status === 'active'" class="newsletter">
    <span class="pc-icon"><svg class="i"><use href="#mail"/></svg></span>
    <div class="pc-text"><b>Newsletter e-mail</b><p>Co czwartek: kalendarz na dwa tygodnie i ogłoszenia — na {{ me.email }}.</p></div>
    <button class="switch" :class="{ on: me.newsletter }" role="switch" :aria-checked="!!me.newsletter" aria-label="Newsletter e-mail" :disabled="newsBusy" @click="toggleNewsletter"></button>
  </div>
  <div v-if="api.enabled && me?.status === 'active'" class="pc-actions mail-test">
    <button :disabled="mailTest.busy" title="Wysyła newsletter na Twój adres, żeby zobaczyć, jak wygląda" @click="testNewsletter">{{ mailTest.busy ? 'Wysyłam…' : 'Wyślij próbny e-mail' }}</button>
    <small v-if="mailTest.text" :class="{ 'pc-error': mailTest.bad }">{{ mailTest.text }}</small>
  </div>

  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div class="bar"><button class="primary" :disabled="busy || !profile.name.trim() || !profileDirty" @click="saveProfile"><svg v-if="!profileDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : profileDirty ? 'Zapisz' : 'Zapisane' }}</button></div>
</template>
