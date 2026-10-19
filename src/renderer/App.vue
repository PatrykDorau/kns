<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from './components/common/Icon.vue'
import Brand from './components/common/Brand.vue'
import Control from './components/display/Control.vue'
import PlannerPanel from './components/planner/PlannerPanel.vue'
import StreamPanel from './components/stream/StreamPanel.vue'
import CalendarView from './components/planner/CalendarView.vue'
import PeopleView from './components/planner/PeopleView.vue'
import HomeBoard from './components/home/HomeBoard.vue'
import WebShell from './components/home/WebShell.vue'
import { lyricsFeed, startLyricsFeed } from './services/lyricsFeed.js'
import { startProjectorFeed } from './services/projectorFeed.js'
import { audioInfo, startEncoding, stopEncoding, studio } from './services/studio.js'
import SermonThoughts from './components/home/SermonThoughts.vue'
import GuestBoard from './components/home/GuestBoard.vue'
import InboxBell from './components/common/InboxBell.vue'
import SyncButton from './components/common/SyncButton.vue'
import * as store from './stores/store.js'
import { access, accessReason, canUse, refreshAccess, api, appUpdate, busy, init, planAlert, planReady, role, serviceModal, services, sharedStatus, syncShared, syncing, googleExpired, googleError, loginGoogle, logoutGoogle } from './stores/store.js'

// Strona startowa: konto, cztery służby (według rang) i tablica — komunikaty rady, newsletter,
// najbliższe nabożeństwo i ten tydzień. Bez zalogowania wszystko jest zablokowane.
const ready = ref(false)
onMounted(async () => {
  window.rzutnik = store // uchwyt do podglądania stanu z konsoli i w testach
  window.rzutnikStream = { studio, lyricsFeed, startEncoding, stopEncoding, audioInfo }
  await init()
  startLyricsFeed() // napisy na stream niezależnie od otwartego ekranu
  startProjectorFeed() // scena „Rzutnik”: to, co pokazuje rzutnik na tym komputerze
  ready.value = true
})

function choose(next) {
  if (!canUse(next)) return
  role.value = next
  // Służba rzutnika zaczyna od propozycji wczytania zaplanowanego nabożeństwa.
  if (next === 'display' && services.value.length) serviceModal.value = true
}
// Powitanie jak na pulpicie: pora dnia i imię z konta.
const hour = new Date().getHours()
const greeting = hour >= 5 && hour < 18 ? 'Dzień dobry' : 'Dobry wieczór'
const firstName = computed(() => (access.name || access.email.split('@')[0] || '').split(/\s+/)[0])
const initials = computed(() => (access.name || access.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''))
// Kafelki tylko z tym, do czego jest dostęp (bez uprawnień — w ogóle się nie pokazują).
const visibleTiles = computed(() => TILES.filter(([id]) => ready.value && canUse(id)))
// Ekran startowy = strona kns-nabo; z jej kafelków — Rzutnik i Stream (ekrany aplikacji).
const shell = ref(null)
function openNative(next) { if (['display', 'stream'].includes(next)) choose(next) }
async function webLogin() { await loginGoogle(); shell.value?.reload() }
async function webLogout() { await logoutGoogle(); shell.value?.reload() }
const TILES = [
  ['display', 'monitor', 'Rzutnik', 'Pieśni, zdjęcia, filmy i teksty'],
  ['stream', 'camera', 'Stream', 'Kamery i sygnały dla kamerzysty'],
  ['planner', 'pencil', 'Nabożeństwa', 'Kazanie, pieśni, program'],
  ['calendar', 'calendar', 'Kalendarz', 'Wszystkie wydarzenia'],
]
</script>

<template>
  <WebShell v-show="!role" ref="shell" class="app-web" @open="openNative" @login="webLogin" @logout="webLogout">
  <template #fallback>
  <div class="home">
    <div class="kh">
      <div class="kh-top">
        <Brand :title="appUpdate.current ? 'Kościół Na Skale — wersja ' + appUpdate.current : ''" />
        <span class="kh-name">Kościół Na Skale</span>
        <span class="kh-spacer"></span>
        <template v-if="ready && access.status === 'active'">
          <button v-if="googleExpired" class="small primary" @click="loginGoogle">Zaloguj ponownie</button>
          <button v-else class="kh-ib" :class="{ spin: syncing }" :disabled="syncing" :title="(access.offline ? 'Bez internetu — ostatnie sprawdzenie. ' : '') + (sharedStatus || 'Synchronizuj z bazą danych')" aria-label="Synchronizuj" @click="syncShared"><Icon name="refresh" /></button>
          <InboxBell />
          <button v-if="access.manage" class="kh-ib" title="Osoby — zatwierdzanie kont i rangi" aria-label="Osoby" @click="role = 'people'"><Icon name="users" /></button>
          <span class="kh-me" :title="access.email">
            <span class="kh-av">{{ initials }}</span>
            <span class="kh-me-text"><b>{{ access.name || access.email }}</b><small>{{ access.names.filter(n => n !== 'Członek').join(', ') || 'Członek' }}</small></span>
            <Icon v-if="!/\S+\s+\S+/.test((access.name || '').trim())" name="missing" class="kh-warn" title="Uzupełnij imię i nazwisko w aplikacji na telefon (Mój profil)" />
          </span>
          <button class="kh-ib" title="Wyloguj" aria-label="Wyloguj" @click="logoutGoogle"><Icon name="logout" /></button>
        </template>
        <template v-else-if="ready && access.status">
          <span class="kh-me warn"><span class="kh-av">{{ initials }}</span><span class="kh-me-text"><b>{{ access.email }}</b>
            <small>{{ access.status === 'pending' ? 'czeka na zatwierdzenie (telefon → Więcej → Osoby)' : 'brak dostępu' }}</small></span></span>
          <button class="small" @click="refreshAccess">Sprawdź ponownie</button>
          <button class="kh-ib" title="Wyloguj" aria-label="Wyloguj" @click="logoutGoogle"><Icon name="logout" /></button>
        </template>
      </div>

      <div v-if="ready && access.status === 'active'" class="kh-hello">
        <h1>{{ greeting }}{{ firstName ? ', ' + firstName : '' }}</h1>
        <p>Oto co dzieje się w kościele.</p>
      </div>
      <SermonThoughts v-if="ready && access.status === 'active'" />

      <div v-if="ready && !access.status" class="login-card">
        <Brand full />
        <p>Zaloguj się kontem Google, żeby korzystać z aplikacji. Rzutnik i Stream są dla służby technicznej, Nabożeństwa — dla osób z prawem edycji;
          rangi nadaje administrator w aplikacji na telefon.</p>
        <button class="primary" @click="loginGoogle"><Icon name="check" />Zaloguj kontem Google</button>
        <p v-if="googleError || access.error" class="bad">{{ googleError || access.error }}</p>
      </div>

      <GuestBoard v-if="ready && access.status !== 'active'" />
      <div class="kh-tiles">
        <button v-for="[id, icon, name, desc] in visibleTiles" :key="id" class="kh-tile" :class="{ locked: ready && !canUse(id) }" :disabled="!ready || !canUse(id)" :title="accessReason(id)" @click="choose(id)">
          <span class="kh-tile-ic"><Icon :name="icon" /></span>
          <span class="kh-tile-text">
            <span class="kh-tile-name">{{ name }}
              <em v-if="id === 'planner' && ready && canUse(id) && planAlert" class="kh-pill bad">Braki</em>
              <em v-else-if="id === 'planner' && ready && canUse(id) && planReady" class="kh-pill ok">Komplet</em></span>
            <span class="kh-tile-desc">{{ ready && accessReason(id) ? accessReason(id) : desc }}</span>
          </span>
          <Icon v-if="ready && canUse(id)" name="right" class="kh-tile-go" />
          <Icon v-else name="missing" class="kh-tile-go" />
        </button>
      </div>

      <HomeBoard v-if="ready && access.status === 'active'" />
    </div>
  </div>
  </template>
  </WebShell>
  <Control v-if="role === 'display'" />
  <StreamPanel v-else-if="role === 'stream'" />
  <CalendarView v-else-if="role === 'calendar'" />
  <PeopleView v-else-if="role === 'people'" />
  <PlannerPanel v-else-if="role" />

  <!-- Nowa wersja aplikacji: pobrana w tle (instalator) albo do pobrania (wersja przenośna). -->
  <div v-if="appUpdate.version" class="update-bar" role="status">
    <Icon name="import" />
    <span>Nowa wersja <b>{{ appUpdate.version }}</b>{{ appUpdate.ready ? ' jest gotowa.' : ' jest dostępna.' }}</span>
    <button class="small primary" @click="api.installUpdate()">{{ appUpdate.ready ? 'Uruchom ponownie i zaktualizuj' : 'Pobierz' }}</button>
  </div>

  <!-- Komunikat o trwającej pracy (np. import prezentacji) — widoczny w każdej służbie. -->
  <div v-if="busy" class="toast" role="status"><span class="spinner" aria-hidden="true"></span>{{ busy }}</div>
</template>

<style scoped>
.app-web { height: 100%; }
.home { height: 100%; overflow-y: auto; display: flex; flex-direction: column; padding: 16px 28px 14px;
  background: var(--kh-scene) center bottom / max(100%, 1200px) auto no-repeat fixed; }
.home > .kh { flex: 1 0 auto; }
.login-card { display: flex; flex-direction: column; align-items: center; gap: 12px; align-self: center; max-width: 560px; padding: 24px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); text-align: center; }
.login-card p { margin: 0; color: var(--muted); }
.login-card .bad { color: #ff8a82; }
</style>
