<script setup>
import { onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Brand from './Brand.vue'
import Control from './Control.vue'
import PlannerPanel from './PlannerPanel.vue'
import StreamPanel from './StreamPanel.vue'
import SyncButton from './SyncButton.vue'
import * as store from './store.js'
import { busy, init, leaveSharedDir, nearestService, planAlert, planReady, pickSharedDir, prettyDate, role, serviceModal, services, settings, sharedAccount, sharedStatus } from './store.js'

// Na starcie użytkownik wybiera służbę — każda ma swój widok, a łączy je wspólne nabożeństwo.
const ready = ref(false)
onMounted(async () => {
  window.rzutnik = store // uchwyt do podglądania stanu z konsoli i w testach
  await init()
  ready.value = true
})

function choose(next) {
  role.value = next
  // Służba rzutnika zaczyna od propozycji wczytania zaplanowanego nabożeństwa.
  if (next === 'display' && services.value.length) serviceModal.value = true
}
</script>

<template>
  <div v-if="!role" class="roles">
    <Brand full />
    <p v-if="ready && nearestService" class="next">
      Najbliższe nabożeństwo: <b>{{ prettyDate(nearestService.date) }}</b>
      <template v-if="nearestService.sermonTitle"> · {{ nearestService.sermonTitle }}</template>
    </p>
    <div class="role-cards">
      <button :disabled="!ready" @click="choose('display')">
        <Icon name="monitor" />
        <b>Rzutnik</b>
        <span>Pieśni, zdjęcia, filmy i teksty na rzutniku</span>
      </button>
      <button :disabled="!ready" @click="choose('stream')">
        <Icon name="camera" />
        <b>Stream</b>
        <span>Podgląd kamer i informacje o nabożeństwie</span>
      </button>
      <button :disabled="!ready" :class="{ danger: ready && planAlert, success: ready && planReady }" @click="choose('planner')">
        <span v-if="ready && planAlert" class="alert-badge" aria-hidden="true"><Icon name="missing" /></span>
        <span v-else-if="ready && planReady" class="alert-badge ok" aria-hidden="true"><Icon name="check" /></span>
        <Icon name="calendar" />
        <b>Organizacja nabożeństw</b>
        <span>Plan: kazanie, mówca, zespół, pieśni, załączniki</span>
        <span v-if="ready && planAlert" class="alert-text" role="status">{{ planAlert.text }}</span>
        <span v-else-if="ready && planReady" class="alert-text ok" role="status">{{ planReady.text }}</span>
      </button>
    </div>
    <div v-if="ready" class="shared">
      <template v-if="settings.sharedDir">
        <Icon name="folder" />
        <span>Folder wspólny: <b>{{ settings.sharedDir }}</b><template v-if="sharedAccount"> · {{ sharedAccount.provider }}, konto <b>{{ sharedAccount.email }}</b></template><template v-if="sharedStatus"> · {{ sharedStatus }}</template></span>
        <SyncButton />
        <button class="small" @click="pickSharedDir">Zmień</button>
        <button class="small" @click="leaveSharedDir">Odłącz</button>
      </template>
      <template v-else>
        <Icon name="missing" />
        <span>Nabożeństwa są widoczne tylko na tym komputerze. Wskaż folder wspólny (OneDrive, Dysk Google, dysk sieciowy), żeby widziały je wszystkie służby.</span>
        <button class="small" @click="pickSharedDir">Ustaw folder wspólny</button>
      </template>
    </div>
  </div>
  <Control v-else-if="role === 'display'" />
  <StreamPanel v-else-if="role === 'stream'" />
  <PlannerPanel v-else />

  <!-- Komunikat o trwającej pracy (np. import prezentacji) — widoczny w każdej służbie. -->
  <div v-if="busy" class="toast" role="status"><span class="spinner" aria-hidden="true"></span>{{ busy }}</div>
</template>
