<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import SyncButton from './SyncButton.vue'
import Brand from './Brand.vue'
import { api, nearestService, prettyDate, role, services, settings, songs, sortedServices, uid } from './store.js'

// Stream: podgląd wszystkich kamer podłączonych do komputera i dane nabożeństwa pod ręką.
const cams = ref([]) // { id, label, stream | error }
const status = ref('Szukam kamer…')
const focusId = ref(null)
const serviceId = ref(nearestService.value?.id ?? null)
const service = computed(() => services.value.find(s => s.id === serviceId.value) || null)
const copied = ref('')
const showInfo = ref(true) // boczny panel z danymi nabożeństwa można schować, żeby kamery miały całe okno

// Sygnały dla kamerzysty: jego telefon (ze słuchawką) ma otwarty ekran „Kamera” w aplikacji na telefon
// (przez internet) albo stronę z tego komputera (ta sama sieć) i dostaje sygnał dźwiękowy przy każdej zmianie stanu.
const CUES = [['live', 'NA WIZJI', '1'], ['ready', 'PRZYGOTUJ SIĘ', '2'], ['off', 'POZA WIZJĄ', '3']]
const cueUrl = ref('')
const cueError = ref('')
const cueClients = ref(0)
const cueRemote = ref({ phones: 0, got: 0, error: '' })
// Strona w sieci lokalnej nie potwierdza odbioru — jej telefony liczą się jako „mają sygnał”.
const phones = computed(() => cueRemote.value.phones + cueClients.value)
const got = computed(() => cueRemote.value.got + cueClients.value)
const cueState = ref('off')
let offCue = null
async function applyCue() {
  if (!settings.cueToken) settings.cueToken = uid()
  const res = await api.setCue(settings.cue, settings.cueToken)
  cueUrl.value = res.url || ''
  cueError.value = res.error || ''
  cueState.value = 'off'
  cueRemote.value = { phones: 0, got: 0, error: '' }
}
async function sendCue(state) {
  if (!settings.cue) return
  cueState.value = state
  await api.sendCue(state)
}
function onCueKey(e) {
  if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.altKey || e.metaKey) return
  const hit = CUES.find(c => c[2] === e.key)
  if (hit && settings.cue) { e.preventDefault(); sendCue(hit[0]) }
}

const stop = cam => cam.stream?.getTracks().forEach(t => t.stop())

async function refresh() {
  try {
    // Bez jednorazowej zgody na kamerę system nie podaje nazw urządzeń.
    if (!cams.value.some(c => c.stream)) (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach(t => t.stop())
  } catch { /* brak kamer albo brak zgody — lista poniżej to pokaże */ }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
  for (const cam of cams.value) if (!devices.some(d => d.deviceId === cam.id)) stop(cam)
  const next = []
  for (const [i, d] of devices.entries()) {
    let cam = cams.value.find(c => c.id === d.deviceId && c.stream)
    if (!cam) {
      const label = d.label || `Kamera ${i + 1}`
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: d.deviceId }, width: { ideal: 1280 } } })
        cam = { id: d.deviceId, label, stream: markRaw(stream) }
      } catch {
        cam = { id: d.deviceId, label, error: 'Brak obrazu — kamera może być zajęta przez inny program.' }
      }
    }
    next.push(cam)
  }
  cams.value = next
  status.value = next.length ? '' : 'Nie znaleziono żadnej kamery. Podłącz kamerę — pojawi się tu sama.'
}

const attach = (el, cam) => { if (el && cam.stream && el.srcObject !== cam.stream) el.srcObject = cam.stream }

async function copy(name, text) {
  await navigator.clipboard.writeText(text)
  copied.value = name
  setTimeout(() => { if (copied.value === name) copied.value = '' }, 1500)
}

const fields = computed(() => {
  const s = service.value
  if (!s) return []
  const list = s.songs.map((e, i) => `${i + 1}. ${e.number ? e.number + '. ' : ''}${e.title}`).join('\n')
  return [
    ['Tytuł kazania', s.sermonTitle], ['Fragment', s.passage], ['Mówca', s.speaker],
    ['Skład zespołu', s.band], ['Dodatkowe informacje', s.notes], ['Pieśni', list],
  ].filter(([, value]) => value && value.trim())
})

onMounted(() => {
  const offClients = api.onCueClients(n => { cueClients.value = n })
  const offRemote = api.onCueRemote(r => { cueRemote.value = r })
  offCue = () => { offClients(); offRemote() }
  window.addEventListener('keydown', onCueKey)
  if (settings.cue) applyCue()
  refresh()
  navigator.mediaDevices.addEventListener('devicechange', refresh)
})
onBeforeUnmount(() => {
  offCue?.()
  window.removeEventListener('keydown', onCueKey)
  api.setCue(false, '')
  navigator.mediaDevices.removeEventListener('devicechange', refresh)
  cams.value.forEach(stop)
})
</script>

<template>
  <div class="app">
    <header>
      <button class="iconbtn" title="Zmień służbę" aria-label="Zmień służbę" @click="role = null"><Icon name="left" /></button>
      <Brand />
      <h1>Stream</h1>
      <span class="spacer"></span>
      <button @click="refresh"><Icon name="camera" />Odśwież kamery</button>
      <button :aria-pressed="showInfo" :title="showInfo ? 'Chowa panel z danymi nabożeństwa' : 'Pokazuje panel z danymi nabożeństwa'" @click="showInfo = !showInfo">
        <Icon :name="showInfo ? 'right' : 'left'" />{{ showInfo ? 'Schowaj panel' : 'Pokaż panel' }}
      </button>
    </header>

    <main class="stream" :class="{ wide: !showInfo }">
      <section>
        <div class="cue">
          <div class="cue-head">
            <h2>Sygnały dla kamerzysty</h2>
            <label class="check"><input v-model="settings.cue" type="checkbox" @change="applyCue"> Włączone</label>
            <!-- Instrukcja dla kamerzysty — tylko po najechaniu (albo kliknięciu) na ikonkę. -->
            <span class="cue-info" tabindex="0" aria-label="Jak połączyć telefon kamerzysty">
              <Icon name="info" />
              <span class="cue-tip" role="tooltip">
                Na telefonie kamerzysty: aplikacja <b>Nabożeństwa</b> → <b>Kamera</b> (działa w każdej sieci, przez internet).
                <template v-if="cueUrl"><br>Albo w tej samej sieci Wi-Fi: <b>{{ cueUrl }}</b></template>
                <br>Sygnały: na wizji — dwa krótkie wysokie, przygotuj się — jeden średni, poza wizją — jeden długi niski.
              </span>
            </span>
            <span v-if="settings.cue" class="cue-clients" :class="{ none: !phones || got < phones }">
              <template v-if="!phones">Żaden telefon nie jest połączony</template>
              <template v-else>Telefony: {{ phones }} · {{ got === phones ? 'sygnał odebrany ✓' : 'odebrało ' + got + ' z ' + phones + '…' }}</template>
            </span>
          </div>
          <p v-if="cueRemote.error" class="note bad">{{ cueRemote.error }}</p>
          <template v-if="settings.cue">
            <div class="cue-buttons">
              <button v-for="[state, text, key] in CUES" :key="state" :class="[state, { current: cueState === state }]" :aria-pressed="cueState === state" @click="sendCue(state)">
                {{ text }}<kbd>{{ key }}</kbd>
              </button>
            </div>
          </template>
          <p v-else class="note">Kamerzysta zakłada słuchawkę podłączoną do telefonu. Gdy zmienisz tu stan, usłyszy sygnał: dwa krótkie wysokie — na wizji, jeden średni — przygotuj się, jeden długi niski — poza wizją.</p>
        </div>

        <h2>Kamery <span v-if="cams.length" class="pill">{{ cams.length }}</span></h2>
        <div v-if="status" class="empty">{{ status }}</div>
        <div class="cams" :class="{ focused: focusId && cams.some(c => c.id === focusId) }">
          <button v-for="cam in cams" :key="cam.id" class="cam" :class="{ big: cam.id === focusId }"
                  :title="cam.id === focusId ? 'Kliknij, aby wrócić do siatki' : 'Kliknij, aby powiększyć'" @click="focusId = cam.id === focusId ? null : cam.id">
            <video v-if="cam.stream" :ref="el => attach(el, cam)" autoplay muted playsinline></video>
            <span v-else class="placeholder">{{ cam.error }}</span>
            <span class="cam-label">{{ cam.label }}</span>
          </button>
        </div>
      </section>

      <section v-if="showInfo" class="props">
        <div class="panel-head"><h2>Nabożeństwo</h2><SyncButton status /></div>
        <div v-if="!services.length" class="empty">Nie ma zaplanowanego nabożeństwa. Tworzy je służba „Organizacja nabożeństw”.</div>
        <template v-else>
          <select v-model="serviceId" aria-label="Nabożeństwo">
            <option v-for="s in sortedServices" :key="s.id" :value="s.id">{{ prettyDate(s.date) }}{{ s.sermonTitle ? ' · ' + s.sermonTitle : '' }}</option>
          </select>
          <div v-if="!fields.length" class="empty">To nabożeństwo nie ma jeszcze wpisanych informacji.</div>
          <div v-for="[name, value] in fields" :key="name" class="info">
            <div class="labelrow">
              <label>{{ name }}</label>
              <button class="small" @click="copy(name, value)"><Icon :name="copied === name ? 'check' : 'copy'" />{{ copied === name ? 'Skopiowano' : 'Kopiuj' }}</button>
            </div>
            <p>{{ value }}</p>
          </div>
        </template>
      </section>
    </main>
  </div>
</template>
