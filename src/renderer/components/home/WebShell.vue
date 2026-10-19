<script setup>
import { onMounted, ref, watch } from 'vue'
import { api } from '../../stores/store.js'

// Ekran startowy aplikacji na komputer = strona kns-nabo (dokładnie to samo co w przeglądarce), zalogowana tym
// samym kontem Google. Rzutnik i Stream otwierają się z kafelków strony jako ekrany aplikacji.
// Bez internetu (albo w testach bez adresu) — dotychczasowy ekran startowy aplikacji (slot „fallback”).
const emit = defineEmits(['open', 'login', 'logout'])
const url = ref('')
const failed = ref(false)
const loading = ref(true)
const wv = ref(null)
onMounted(async () => { url.value = (await api.webUrl?.()) || '' ; if (!url.value) failed.value = true })
watch(wv, el => {
  if (!el) return
  el.addEventListener('ipc-message', e => {
    if (e.channel === 'kns:open') emit('open', e.args[0])
    else if (e.channel === 'kns:login') emit('login')
    else if (e.channel === 'kns:logout') emit('logout')
  })
  el.addEventListener('did-stop-loading', () => { loading.value = false })
  el.addEventListener('did-fail-load', e => { if (e.isMainFrame && e.errorCode !== -3) failed.value = true })
})
function retry() { failed.value = false; loading.value = true }
defineExpose({ reload: () => { if (failed.value) retry(); else wv.value?.reload() } })
</script>

<template>
  <div class="web-shell">
    <webview v-if="url && !failed" ref="wv" :src="url" partition="persist:kns-web" class="web-view"></webview>
    <div v-if="url && !failed && loading" class="web-loading" aria-busy="true"><span class="spinner" aria-hidden="true"></span></div>
    <template v-if="failed">
      <div v-if="url" class="web-offline" role="status">Bez połączenia ze stroną — wersja uproszczona. <button class="small" @click="retry">Spróbuj ponownie</button></div>
      <slot name="fallback" />
    </template>
  </div>
</template>

<style scoped>
.web-shell { position: relative; height: 100%; display: flex; flex-direction: column; }
.web-view { flex: 1; width: 100%; height: 100%; border: 0; background: #0f1013; }
.web-loading { position: absolute; inset: 0; display: grid; place-items: center; background: #0f1013; }
.web-offline { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 8px; font-size: 13px; color: var(--muted); background: var(--panel2); border-bottom: 1px solid var(--line); }
.web-shell > :deep(.home) { flex: 1; min-height: 0; }
</style>
