<script setup>
import { onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Brand from './Brand.vue'
import Control from './Control.vue'
import PlannerPanel from './PlannerPanel.vue'
import Countdown from './Countdown.vue'
import StreamPanel from './StreamPanel.vue'
import SyncButton from './SyncButton.vue'
import * as store from './store.js'
import { BAZA, access, accessReason, canUse, refreshAccess, api, appUpdate, busy, init, leaveSharedDir, nearestService, planAlert, planReady, pickSharedDir, prettyDate, role, serviceModal, services, settings, sharedAccount, sharedStatus, sharedSuggestions, connectSharedDir, googleExpired, googleError, loginGoogle, logoutGoogle } from './store.js'

// Na starcie użytkownik wybiera służbę — każda ma swój widok, a łączy je wspólne nabożeństwo.
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
</script>

<template>
  <div v-if="!role" class="roles">
    <Brand full />
    <Countdown v-if="ready" />
    <div class="role-cards">
      <button :disabled="!ready || !canUse('display')" :title="accessReason('display')" @click="choose('display')">
        <Icon name="monitor" />
        <b>Rzutnik</b>
        <span>Pieśni, zdjęcia, filmy i teksty na rzutniku</span>
        <small v-if="ready && accessReason('display')" class="locked"><Icon name="missing" />{{ accessReason('display') }}</small>
      </button>
      <button :disabled="!ready || !canUse('stream')" :title="accessReason('stream')" @click="choose('stream')">
        <Icon name="camera" />
        <b>Stream</b>
        <span>Podgląd kamer i informacje o nabożeństwie</span>
        <small v-if="ready && accessReason('stream')" class="locked"><Icon name="missing" />{{ accessReason('stream') }}</small>
      </button>
      <button :disabled="!ready || !canUse('planner')" :title="accessReason('planner')" :class="{ danger: ready && planAlert, success: ready && planReady }" @click="choose('planner')">
        <span v-if="ready && planAlert" class="alert-badge" aria-hidden="true"><Icon name="missing" /></span>
        <span v-else-if="ready && planReady" class="alert-badge ok" aria-hidden="true"><Icon name="check" /></span>
        <Icon name="calendar" />
        <b>Organizacja nabożeństw</b>
        <span>Plan: kazanie, mówca, zespół, pieśni, załączniki</span>
        <span v-if="ready && planAlert" class="alert-text" role="status">{{ planAlert.text }}</span>
        <span v-else-if="ready && planReady" class="alert-text ok" role="status">{{ planReady.text }}</span>
        <small v-if="ready && accessReason('planner')" class="locked"><Icon name="missing" />{{ accessReason('planner') }}</small>
      </button>
    </div>
    <div v-if="ready" class="shared">
      <template v-if="settings.sharedDir === BAZA && !access.status">
        <Icon name="missing" />
        <span><b>Zaloguj się kontem Google</b> — bez tego aplikacja jest zablokowana. Rzutnik i Stream są dla służby technicznej, Organizacja — dla osób z prawem edycji
          (rangi nadaje administrator w aplikacji na telefon → Osoby).<b v-if="googleError || access.error" class="bad"><br>{{ googleError || access.error }}</b></span>
        <button class="small primary" @click="loginGoogle">Zaloguj kontem Google</button>
      </template>
      <template v-else-if="settings.sharedDir === BAZA && access.status !== 'active'">
        <Icon name="missing" />
        <span><b>{{ access.email }}</b> — {{ access.status === 'pending' ? 'konto czeka na zatwierdzenie przez administratora (telefon → Osoby).' : 'to konto nie ma dostępu.' }}</span>
        <button class="small" @click="refreshAccess">Sprawdź ponownie</button>
        <button class="small" @click="logoutGoogle">Wyloguj</button>
      </template>
      <template v-else-if="settings.sharedDir === BAZA">
        <Icon :name="googleExpired ? 'missing' : 'database'" />
        <span><b>{{ access.email }}</b><template v-if="access.names.length"> · {{ access.names.join(', ') }}</template><template v-if="access.offline"> · bez internetu (ostatnie sprawdzenie)</template><template v-if="sharedStatus"> · {{ sharedStatus }}</template></span>
        <button v-if="googleExpired" class="small primary" @click="loginGoogle">Zaloguj ponownie</button>
        <SyncButton v-else />
        <button class="small" @click="logoutGoogle">Wyloguj</button>
      </template>
      <template v-else-if="settings.sharedDir === 'google'">
        <Icon :name="googleExpired ? 'missing' : 'folder'" />
        <span v-if="googleExpired"><b>{{ settings.sharedDir === BAZA ? 'Zaloguj się kontem Google, żeby połączyć z bazą danych kościoła.' : 'Logowanie do Dysku Google wygasło.' }}</b> Zmiany zapisują się na tym komputerze i zostaną wysłane po zalogowaniu.</span>
        <span v-else>{{ settings.sharedDir === BAZA ? 'Baza danych' : 'Dysk Google' }}: <b>{{ sharedAccount?.email || 'zalogowano' }}</b><template v-if="sharedStatus"> · {{ sharedStatus }}</template></span>
        <button v-if="googleExpired" class="small primary" @click="loginGoogle">Zaloguj ponownie</button>
        <SyncButton v-else />
        <button class="small" @click="logoutGoogle">Wyloguj</button>
      </template>
      <template v-else-if="settings.sharedDir">
        <Icon name="folder" />
        <span>Folder wspólny: <b>{{ settings.sharedDir }}</b><template v-if="sharedAccount"> · {{ sharedAccount.provider }}, konto <b>{{ sharedAccount.email }}</b></template><template v-if="sharedStatus"> · {{ sharedStatus }}</template></span>
        <SyncButton />
        <button class="small" @click="pickSharedDir">Zmień</button>
        <button class="small" @click="leaveSharedDir">Odłącz</button>
      </template>
      <template v-else-if="sharedSuggestions.length">
        <Icon name="folder" />
        <span><b>Znaleziono folder aplikacji na Dysku Google:</b> {{ sharedSuggestions[0] }}<br>Połącz, żeby ten komputer widział wspólne nabożeństwa i pieśni.</span>
        <button class="small primary" @click="connectSharedDir(sharedSuggestions[0])">Połącz</button>
        <button class="small" @click="pickSharedDir">Wybierz inny…</button>
      </template>
      <template v-else>
        <Icon name="missing" />
        <span><b>Ten komputer nie jest połączony z danymi kościoła.</b> Nabożeństwa i pieśni zapisują się tylko tutaj.
          Zaloguj się kontem Google, które ma dostęp do folderu „Aplikacja KNS Nabo” — będą wspólne dla wszystkich komputerów i telefonów.
          <b v-if="googleError" class="bad"><br>{{ googleError }}</b></span>
        <button class="small primary" @click="loginGoogle">Zaloguj kontem Google</button>
        <button class="small" title="Dla komputera z programem „Dysk Google na komputer”" @click="pickSharedDir">lub wskaż folder…</button>
      </template>
    </div>
    <p v-if="appUpdate.current" class="app-version">wersja {{ appUpdate.current }}</p>
  </div>
  <Control v-else-if="role === 'display'" />
  <StreamPanel v-else-if="role === 'stream'" />
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
