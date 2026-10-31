<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { ask } from '@/utils/ask'
import { fetchAllProjFiles, fetchProjFile, projFiles, wipeProjFiles, type ProjFile } from '@/services/projectorMirror'
import { studio } from '@/services/studio'

// Zakładka „Z rzutnika”: pliki, które rzutnik z innego komputera przesłał przez Dysk Google — co jest gotowe, co się
// pobiera (pasek postępu), ponawianie po błędzie i decyzja o pobraniu w trakcie transmisji.
const list = computed(() => projFiles.list)
const done = computed(() => list.value.filter(f => f.state === 'done').length)
const open = computed(() => list.value.filter(f => f.state === 'new' || f.state === 'error'))
const mb = (n: number) => (n >= 1e9 ? (n / 1e9).toLocaleString('pl', { maximumFractionDigits: 1 }) + ' GB' : Math.max(1, Math.round(n / 1e6)) + ' MB')
const KIND = { image: 'Zdjęcie', video: 'Film' }
const size = (f: ProjFile) => f.total || f.size
const pct = (f: ProjFile) => (size(f) ? Math.min(100, Math.round((f.got / size(f)) * 100)) : 0)
const STATE = { new: 'czeka na decyzję', queued: 'w kolejce', done: 'gotowy' }
const status = (f: ProjFile) => (f.state === 'loading' ? 'pobieram ' + pct(f) + '%' : f.state === 'error' ? f.error : STATE[f.state])
const message = ref('')
async function wipe() {
  if (!(await ask('Usunąć pliki przesłane przez rzutnik z Dysku Google i z tego komputera? To, co jest teraz na wizji, zostanie. Rzutnik wyśle ponownie tylko to, co pokaże.'))) return
  const r = await wipeProjFiles()
  message.value = r?.error ? 'Nie udało się usunąć z Dysku: ' + r.error : 'Usunięto z Dysku: ' + (r?.removed || 0) + ' plików.'
  setTimeout(() => { message.value = '' }, 6000)
}
</script>

<template>
  <div class="desk-media-bar">
    <button class="small" :disabled="!open.length" @click="fetchAllProjFiles"><Icon name="import" />Pobierz wszystkie<template v-if="open.length"> ({{ open.length }})</template></button>
    <label class="check" title="Pobieranie zajmuje internet — w trakcie transmisji domyślnie czeka na Twoją decyzję i jest przycięte do 2 MB/s"><input v-model="settings.mirrorLive" type="checkbox"> Pobieraj sam także w trakcie transmisji</label>
    <button class="small" title="Po nabożeństwie: usuwa pliki z Dysku Google i z tego komputera" :disabled="!list.length" @click="wipe"><Icon name="trash" />Usuń pliki po nabożeństwie</button>
  </div>
  <p v-if="message" class="desk-help" role="status">{{ message }}</p>
  <p v-if="projFiles.sending" class="desk-help" role="status"><b>Rzutnik wysyła:</b> {{ projFiles.sending.label }}<template v-if="projFiles.sending.left > 1"> (i {{ projFiles.sending.left - 1 }} więcej)</template></p>
  <p v-if="studio.live && open.length && !settings.mirrorLive" class="desk-help">Trwa transmisja — nowe pliki czekają, aż je pobierzesz. Po jej zakończeniu pobiorą się same.</p>
  <p v-if="!list.length" class="desk-help">{{ settings.streamLyrics === 'remote' ? 'Rzutnik nic jeszcze nie przesłał. Pliki pojawią się tu, gdy na komputerze z rzutnikiem będą włączone „Materiały dla Streamu”.' : 'Ta lista działa, gdy rzutnik jest na innym komputerze: Ustawienia nadawania → Rzutnik jest: Inny laptop.' }}</p>
  <p v-else class="desk-help">Gotowe: {{ done }} z {{ list.length }}.</p>
  <ul v-if="list.length" class="desk-pfiles">
    <li v-for="f in list" :key="f.name" :class="f.state">
      <span class="pf-name"><b>{{ f.label }}</b><small>{{ [KIND[f.kind], size(f) ? mb(size(f)) : ''].filter(Boolean).join(' · ') }}</small></span>
      <span class="pf-state" role="status">{{ status(f) }}</span>
      <button v-if="f.state === 'new'" class="small" @click="fetchProjFile(f.name, true)"><Icon name="import" />Pobierz</button>
      <button v-else-if="f.state === 'error'" class="small" @click="fetchProjFile(f.name, true)"><Icon name="refresh" />Ponów</button>
      <span v-if="f.state === 'loading'" class="pf-bar" role="progressbar" :aria-valuenow="pct(f)" aria-valuemin="0" aria-valuemax="100" :aria-label="'Pobieranie: ' + f.label"><i :style="{ width: pct(f) + '%' }"></i></span>
    </li>
  </ul>
</template>
