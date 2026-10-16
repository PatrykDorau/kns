<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Brand from './Brand.vue'
import Control from './Control.vue'
import PlannerPanel from './PlannerPanel.vue'
import StreamPanel from './StreamPanel.vue'
import CalendarView from './CalendarView.vue'
import HomeBoard from './HomeBoard.vue'
import SyncButton from './SyncButton.vue'
import * as store from './store.js'
import { access, accessReason, canUse, refreshAccess, api, appUpdate, busy, init, planAlert, planReady, role, serviceModal, services, sharedStatus, syncShared, syncing, googleExpired, googleError, loginGoogle, logoutGoogle } from './store.js'

// Strona startowa: konto, cztery służby (według rang) i tablica — komunikaty rady, newsletter,
// najbliższe nabożeństwo i ten tydzień. Bez zalogowania wszystko jest zablokowane.
const ready = ref(false)
onMounted(async () => {
  window.rzutnik = store // uchwyt do podglądania stanu z konsoli i w testach
  await init()
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
const TILES = [
  ['display', 'monitor', 'Rzutnik', 'Pieśni, zdjęcia, filmy i teksty'],
  ['stream', 'camera', 'Stream', 'Kamery i sygnały dla kamerzysty'],
  ['planner', 'pencil', 'Nabożeństwa', 'Kazanie, pieśni, program'],
  ['calendar', 'calendar', 'Kalendarz', 'Wszystkie wydarzenia'],
]
</script>

<template>
  <div v-if="!role" class="home">
    <div class="home-top">
      <Brand />
      <span class="home-name">Kościół Na Skale</span>
      <span class="spacer"></span>
      <template v-if="ready && access.status === 'active'">
        <button v-if="googleExpired" class="small primary" @click="loginGoogle">Zaloguj ponownie</button>
        <button v-else class="iconbtn sync-ic" :class="{ spin: syncing }" :disabled="syncing" :title="(access.offline ? 'Bez internetu — ostatnie sprawdzenie. ' : '') + (sharedStatus || 'Synchronizuj z bazą danych')" aria-label="Synchronizuj" @click="syncShared"><Icon name="refresh" /></button>
        <span class="me-chip" :title="access.email">
          <span class="me-av">{{ initials }}</span>
          <span class="me-text"><b>{{ access.name || access.email }}</b><small>{{ access.names.filter(n => n !== 'Członek').join(', ') || 'Członek' }}</small></span>
        </span>
        <button class="iconbtn" title="Wyloguj" aria-label="Wyloguj" @click="logoutGoogle"><Icon name="logout" /></button>
      </template>
      <template v-else-if="ready && access.status">
        <span class="me-chip warn"><span class="me-av">{{ initials }}</span><span class="me-text"><b>{{ access.email }}</b>
          <small>{{ access.status === 'pending' ? 'czeka na zatwierdzenie (telefon → Więcej → Osoby)' : 'brak dostępu' }}</small></span></span>
        <button class="small" @click="refreshAccess">Sprawdź ponownie</button>
        <button class="iconbtn" title="Wyloguj" aria-label="Wyloguj" @click="logoutGoogle"><Icon name="logout" /></button>
      </template>
    </div>

    <div v-if="ready && access.status === 'active'" class="hello">
      <h1>{{ greeting }}{{ firstName ? ', ' + firstName : '' }}</h1>
      <p>Oto co dzieje się w kościele.</p>
    </div>

    <div v-if="ready && !access.status" class="login-card">
      <Brand full />
      <p>Zaloguj się kontem Google, żeby korzystać z aplikacji. Rzutnik i Stream są dla służby technicznej, Nabożeństwa — dla osób z prawem edycji;
        rangi nadaje administrator w aplikacji na telefon.</p>
      <button class="primary" @click="loginGoogle"><Icon name="check" />Zaloguj kontem Google</button>
      <p v-if="googleError || access.error" class="bad">{{ googleError || access.error }}</p>
    </div>

    <div class="tiles">
      <button v-for="[id, icon, name, desc] in TILES" :key="id" class="tile" :disabled="!ready || !canUse(id)" :title="accessReason(id)" @click="choose(id)">
        <span class="tile-ic"><Icon :name="icon" /></span>
        <span class="tile-text">
          <span class="tile-name">{{ name }}
            <em v-if="id === 'planner' && ready && canUse(id) && planAlert" class="pill bad">Braki</em>
            <em v-else-if="id === 'planner' && ready && canUse(id) && planReady" class="pill ok">Komplet</em></span>
          <span class="tile-desc">{{ ready && accessReason(id) ? accessReason(id) : desc }}</span>
        </span>
        <Icon v-if="ready && canUse(id)" name="right" class="tile-go" />
        <Icon v-else name="missing" class="tile-go" />
      </button>
    </div>

    <HomeBoard v-if="ready && access.status === 'active'" />
    <p v-if="appUpdate.current" class="app-version">wersja {{ appUpdate.current }}</p>
  </div>
  <Control v-else-if="role === 'display'" />
  <StreamPanel v-else-if="role === 'stream'" />
  <CalendarView v-else-if="role === 'calendar'" />
  <PlannerPanel v-else />

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
.home { height: 100%; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 16px 24px 24px; }
.home-top { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 1180px; font-size: 13px; color: var(--muted); }
.home-name { font: 600 16px Georgia, 'Times New Roman', serif; color: var(--text); }
.me-chip { display: inline-flex; align-items: center; gap: 10px; padding: 4px 12px 4px 4px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); min-width: 0; max-width: 420px; }
.me-chip.warn { border-color: rgba(245, 185, 66, .5); }
.me-av { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 13px; }
.me-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.me-text b { color: var(--text); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.me-text small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-top .iconbtn .icon { width: 18px; height: 18px; }
.sync-ic.spin .icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.spacer { flex: 1; }
.hello { width: 100%; max-width: 1180px; text-align: left; }
.hello h1 { margin: 0; font: 600 30px/1.2 Georgia, 'Times New Roman', serif; letter-spacing: -.01em; text-transform: none; }
.hello p { margin: 4px 0 0; color: var(--muted); }
.login-card { display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 560px; padding: 24px; border-radius: 18px; background: var(--panel); text-align: center; }
.login-card p { margin: 0; color: var(--muted); }
.login-card .bad { color: #ff8a82; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; width: 100%; max-width: 1180px; }
.tile { display: grid; grid-template-columns: 44px minmax(0, 1fr) 18px; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); text-align: left; }
.tile:hover:not(:disabled) { border-color: var(--accent); background: var(--panel2); }
.tile:disabled { opacity: 1; }
.tile:disabled .tile-ic, .tile:disabled .tile-name { opacity: .45; }
.tile-ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); }
.tile-ic .icon { width: 22px; height: 22px; }
.tile-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tile-name { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
.tile-desc { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile:disabled .tile-desc { color: var(--warn); }
.tile-go { width: 16px; height: 16px; color: var(--muted); }
.tile:disabled .tile-go { color: var(--warn); }
.pill { font-style: normal; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; }
.pill.bad { background: rgba(240, 72, 62, .16); color: #ff8a82; }
.pill.ok { background: rgba(61, 220, 151, .14); color: var(--ok); }
.app-version { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
</style>
