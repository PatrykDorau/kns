<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import Brand from '@/components/common/Brand.vue'
import { access, accessReason, appUpdate, canUse, googleError, loginGoogle, logoutGoogle, refreshAccess, settings } from '@/stores'

// Jak uruchomić aplikację: sam Stream, sam Rzutnik albo całość (ze stroną startową i wszystkimi służbami).
// Sam Stream / sam Rzutnik są lżejsze: bez strony startowej w tle, a Rzutnik nie zajmuje kamery ATEM.
// „Zapamiętaj” — przy następnym starcie od razu ten tryb (wrócić tutaj można strzałką „wstecz”).
const emit = defineEmits<{ (e: 'pick', mode: 'stream' | 'display' | 'full'): void }>()
const remember = ref(!!settings.launchMode)
const MODES = [
  ['stream', 'camera', 'Stream', 'Sam pulpit transmisji — najlżej dla komputera ze streamem.'],
  ['display', 'monitor', 'Rzutnik', 'Sam rzutnik — bez kamery i bez strony startowej.'],
  ['full', 'grid', 'Cała aplikacja', 'Strona startowa, Rzutnik, Stream, Nabożeństwa i Kalendarz.'],
] as const
function pick(mode: 'stream' | 'display' | 'full') {
  if (mode !== 'full' && !canUse(mode)) return
  settings.launchMode = remember.value ? mode : ''
  emit('pick', mode)
}
</script>

<template>
  <div class="launch">
    <div class="launch-box">
      <Brand full />
      <h1>Jak uruchomić aplikację?</h1>
      <div v-if="!access.status" class="launch-login">
        <p>Zaloguj się kontem Google, żeby korzystać z Rzutnika i Streamu.</p>
        <button class="primary" @click="loginGoogle"><Icon name="check" />Zaloguj kontem Google</button>
        <p v-if="googleError || access.error" class="bad">{{ googleError || access.error }}</p>
      </div>
      <div v-else-if="access.status !== 'active'" class="launch-login">
        <p>{{ access.email }} — {{ access.status === 'pending' ? 'konto czeka na zatwierdzenie (telefon → Więcej → Osoby).' : 'brak dostępu.' }}</p>
        <button class="small" @click="refreshAccess">Sprawdź ponownie</button>
      </div>
      <div class="launch-modes">
        <button v-for="[id, icon, name, desc] in MODES" :key="id" class="launch-mode" :class="{ on: settings.launchMode === id }" :disabled="id !== 'full' && !canUse(id)" :title="id !== 'full' ? accessReason(id) : ''" @click="pick(id)">
          <span class="launch-ic"><Icon :name="icon" /></span>
          <b>{{ name }}</b>
          <small>{{ id !== 'full' && accessReason(id) ? accessReason(id) : desc }}</small>
        </button>
      </div>
      <label class="check launch-remember"><input v-model="remember" type="checkbox"> Zapamiętaj na tym komputerze — przy starcie od razu wybrany tryb</label>
      <p class="launch-foot">
        <span v-if="access.status">{{ access.email }} · <button class="linkbtn" @click="logoutGoogle">Wyloguj</button></span>
        <span v-if="appUpdate.current">wersja {{ appUpdate.current }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.launch { display: grid; place-items: center; min-height: 100vh; padding: 24px; background: var(--bg); }
.launch-box { display: grid; justify-items: center; gap: 16px; width: min(760px, 100%); text-align: center; }
h1 { margin: 6px 0 0; font-size: 26px; }
.launch-login { display: grid; justify-items: center; gap: 8px; }
.launch-login p { margin: 0; color: var(--muted); }
.launch-modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; width: 100%; }
.launch-mode { display: grid; justify-items: center; align-content: start; gap: 8px; min-height: 170px; padding: 22px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); color: var(--text); text-align: center; }
.launch-mode:hover:not(:disabled) { border-color: var(--accent); }
.launch-mode.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
.launch-mode:disabled { opacity: .5; }
.launch-mode b { font-size: 19px; }
.launch-mode small { color: var(--muted); line-height: 1.4; }
.launch-ic { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: var(--panel2); }
.launch-ic :deep(svg) { width: 26px; height: 26px; }
.launch-remember { color: var(--muted); }
.launch-foot { display: flex; gap: 14px; margin: 0; color: var(--muted); font-size: 12.5px; }
.bad { color: #e5484d; }
@media (max-width: 640px) { .launch-modes { grid-template-columns: 1fr; } }
</style>
