<script setup>
import { onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Brand from './Brand.vue'
import Control from './Control.vue'
import PlannerPanel from './PlannerPanel.vue'
import StreamPanel from './StreamPanel.vue'
import CalendarView from './CalendarView.vue'
import HomeBoard from './HomeBoard.vue'
import SyncButton from './SyncButton.vue'
import * as store from './store.js'
import { access, accessReason, canUse, refreshAccess, api, appUpdate, busy, init, planAlert, planReady, role, serviceModal, services, sharedStatus, googleExpired, googleError, loginGoogle, logoutGoogle } from './store.js'

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
      <span class="spacer"></span>
      <template v-if="ready && access.status === 'active'">
        <span class="home-account"><Icon :name="googleExpired ? 'missing' : 'database'" /><b>{{ access.email }}</b><template v-if="access.names.length"> · {{ access.names.join(', ') }}</template><template v-if="access.offline"> · bez internetu</template></span>
        <span v-if="sharedStatus" class="home-status">{{ sharedStatus }}</span>
        <button v-if="googleExpired" class="small primary" @click="loginGoogle">Zaloguj ponownie</button>
        <SyncButton v-else />
        <button class="small" @click="logoutGoogle">Wyloguj</button>
      </template>
      <template v-else-if="ready && access.status">
        <span class="home-account"><Icon name="missing" /><b>{{ access.email }}</b> — {{ access.status === 'pending' ? 'czeka na zatwierdzenie przez administratora (telefon → Więcej → Osoby)' : 'brak dostępu' }}</span>
        <button class="small" @click="refreshAccess">Sprawdź ponownie</button>
        <button class="small" @click="logoutGoogle">Wyloguj</button>
      </template>
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
.home-account { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.home-account b { color: var(--text); }
.home-account .icon { width: 16px; height: 16px; }
.home-status { font-size: 12px; }
.spacer { flex: 1; }
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
