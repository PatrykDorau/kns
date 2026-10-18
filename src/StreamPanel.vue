<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import SyncButton from './SyncButton.vue'
import Brand from './Brand.vue'
import Countdown from './Countdown.vue'
import StreamDesk from './StreamDesk.vue'
import { api, cameraLock, servicePlace, serviceTime, nearestService, now, prettyDate, role, services, settings, songs, sortedServices, uid, today, DEFAULT_TIME } from './store.js'
import { addMinutes, categoryName } from '../mobile/church.js'

// Stream: podgląd wszystkich kamer podłączonych do komputera i dane nabożeństwa pod ręką.
const cams = ref([]) // { id, label, stream | error }
const status = ref('Szukam kamer…')
const focusId = ref(null)
const serviceId = ref(nearestService.value?.id ?? null)
const service = computed(() => services.value.find(s => s.id === serviceId.value) || null)
const copied = ref('')
const showInfo = ref(true) // boczny panel z danymi nabożeństwa można schować, żeby kamery miały całe okno

// Układy kamer. Główna kamera (do układów „duża + małe” i „jedna”) to kliknięta albo pierwsza.
const LAYOUTS = [['grid', 'grid', 'Siatka'], ['big', 'layoutBig', 'Duża + małe'], ['row', 'layoutRow', 'Obok siebie'], ['column', 'layoutColumn', 'Jedna pod drugą'], ['one', 'layoutOne', 'Tylko jedna']]
const mainId = computed(() => (cams.value.some(c => c.id === focusId.value) ? focusId.value : cams.value[0]?.id))
const shown = computed(() => {
  if (settings.camLayout === 'one') return cams.value.filter(c => c.id === mainId.value)
  if (settings.camLayout === 'big') return [...cams.value].sort((a, b) => (b.id === mainId.value) - (a.id === mainId.value))
  return cams.value
})
const cols = computed(() => Math.ceil(Math.sqrt(shown.value.length || 1)))
let before = null // układ sprzed powiększenia kamery kliknięciem
function clickCam(cam) {
  const zoomed = settings.camLayout === 'big' || settings.camLayout === 'one'
  if (!zoomed) { before = settings.camLayout; focusId.value = cam.id; settings.camLayout = 'big'; return }
  if (cam.id !== mainId.value) { focusId.value = cam.id; return }
  if (before) { settings.camLayout = before; before = null }
}
function setLayout(id) { settings.camLayout = id; before = null }

// Nakładka: samo okno z kamerami, małe — do przechwycenia w OBS („Przechwytywanie okna”).
const overlay = ref(false)
function toggleOverlay() {
  overlay.value = !overlay.value
  api.setCompact(overlay.value)
}
// Pasek sygnałów w nakładce; pierwsze włączenie od razu uruchamia sygnały.
function toggleCueBar() {
  if (!settings.cue) { settings.cue = true; settings.camCueBar = true; applyCue(); return }
  settings.camCueBar = !settings.camCueBar
}
function toggleOnTop() {
  settings.camOnTop = !settings.camOnTop
  api.setOnTop(settings.camOnTop)
}

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
const quota = ref(null) // { used, limit, left } — darmowy limit wiadomości ntfy na dziś
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
let retryTimer = 0
watch(cameraLock, () => refresh())
const anyBusy = computed(() => cams.value.some(c => c.busy))

async function refresh() {
  if (cameraLock.value) { for (const c of cams.value) stop(c); cams.value = []; status.value = 'Obraz z ATEM idzie teraz w transmisji — podgląd tego, co widzą widzowie, jest w pulpicie u góry.'; return }
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
      } catch (e) {
        // NotReadableError / AbortError: urządzenie trzyma inny program (np. OBS) — Windows daje obraz tylko jednemu.
        const busy = ['NotReadableError', 'AbortError', 'TrackStartError'].includes(e?.name)
        cam = { id: d.deviceId, label, busy, error: busy ? 'Kamera zajęta przez inny program (np. OBS). Spróbuję ponownie sam.' : 'Brak obrazu z tej kamery.' }
      }
    }
    next.push(cam)
  }
  cams.value = next
  // Zajęta kamera: co 10 s kolejna próba — gdy drugi program ją zwolni, obraz pojawi się sam.
  clearTimeout(retryTimer)
  if (next.some(c => c.busy)) retryTimer = setTimeout(refresh, 10000)
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
  const list = s.songs.map((e, i) => `${i + 1}. ${e.title}${e.number ? ` (nr ${e.number})` : ''}`).join('\n')
  return [
    ['Godzina i miejsce', serviceTime(s) + ', ' + servicePlace(s)],
    ['Tytuł kazania', s.sermonTitle], ['Fragment', s.passage], ['Mówca', s.speaker],
    ['Skład zespołu', s.band], ['Dodatkowe informacje', s.notes], ['Pieśni', list],
  ].filter(([, value]) => value && value.trim())
})

// Program nabożeństwa; w dniu nabożeństwa zaznaczony jest punkt, który właśnie trwa.
const program = computed(() => {
  const s = service.value
  if (!s?.program?.length) return []
  const list = [...s.program].sort((a, b) => a.offset - b.offset).map(p => {
    const time = addMinutes(s.time || DEFAULT_TIME, p.offset)
    const sermon = p.category === 'kazanie' ? [p.title || s.sermonTitle, s.passage].filter(Boolean).join(', ') : p.title
    return { key: p.key, time, name: categoryName(p), detail: [sermon, p.person || (p.category === 'kazanie' ? s.speaker : '')].filter(Boolean).join(' — ') }
  })
  if (s.date === today()) {
    const t = new Date(now.value).toTimeString().slice(0, 5)
    let cur = -1
    list.forEach((p, i) => { if (p.time <= t) cur = i })
    list.forEach((p, i) => { p.now = i === cur; p.done = i < cur })
  }
  return list
})
const programText = computed(() => program.value.map(p => p.time + ' ' + p.name + (p.detail ? ' — ' + p.detail : '')).join('\n'))

onMounted(() => {
  const offClients = api.onCueClients(n => { cueClients.value = n })
  const offRemote = api.onCueRemote(r => { cueRemote.value = r })
  const offQuota = api.onCueQuota(q => { quota.value = q })
  offCue = () => { offClients(); offRemote(); offQuota() }
  window.addEventListener('keydown', onCueKey)
  if (settings.cue) applyCue()
  if (settings.camOnTop) api.setOnTop(true)
  refresh()
  navigator.mediaDevices.addEventListener('devicechange', refresh)
})
onBeforeUnmount(() => {
  offCue?.()
  window.removeEventListener('keydown', onCueKey)
  api.setCue(false, '')
  // Poza streamem okno wraca do zwykłego rozmiaru i zwykłego zachowania.
  if (overlay.value) api.setCompact(false)
  api.setOnTop(false)
  navigator.mediaDevices.removeEventListener('devicechange', refresh)
  clearTimeout(retryTimer)
  cams.value.forEach(stop)
})
</script>

<template>
  <div class="app" :class="{ 'overlay-mode': overlay }">
    <!-- W trybie nakładki: tylko kamery, a przyciski pojawiają się po najechaniu myszką. -->
    <div v-if="overlay" class="ov-tools">
      <button v-for="[id, icon, name] in LAYOUTS" :key="id" class="iconbtn" :class="{ on: settings.camLayout === id }" :title="name" :aria-label="name" :aria-pressed="settings.camLayout === id" @click="setLayout(id)"><Icon :name="icon" /></button>
      <span class="sep"></span>
      <button class="iconbtn" :class="{ on: settings.camLabels }" title="Podpisy kamer" aria-label="Podpisy kamer" :aria-pressed="settings.camLabels" @click="settings.camLabels = !settings.camLabels"><Icon name="tag" /></button>
      <button class="iconbtn" :class="{ on: settings.cue && settings.camCueBar }" title="Sygnały dla kamerzysty (klawisze 1, 2, 3)" aria-label="Sygnały dla kamerzysty" :aria-pressed="settings.cue && settings.camCueBar" @click="toggleCueBar"><Icon name="volume" /></button>
      <button class="iconbtn" :class="{ on: settings.camOnTop }" :title="settings.camOnTop ? 'Zawsze na wierzchu — włączone' : 'Zawsze na wierzchu'" aria-label="Zawsze na wierzchu" :aria-pressed="settings.camOnTop" @click="toggleOnTop"><Icon name="pin" /></button>
      <button class="iconbtn" title="Wyjdź z trybu nakładki" aria-label="Wyjdź z trybu nakładki" @click="toggleOverlay"><Icon name="expand" /></button>
    </div>
    <header v-if="!overlay">
      <button class="iconbtn" title="Zmień służbę" aria-label="Zmień służbę" @click="role = null"><Icon name="left" /></button>
      <Brand />
      <h1>Stream</h1>
      <span class="spacer"></span>
      <button :class="{ on: settings.camOnTop }" :aria-pressed="settings.camOnTop" title="Okno zawsze nad innymi programami (np. nad OBS)" @click="toggleOnTop"><Icon name="pin" />Zawsze na wierzchu</button>
      <button title="Małe okno z samymi kamerami — do ustawienia w OBS jako nakładka" @click="toggleOverlay"><Icon name="shrink" />Tryb nakładki</button>
      <button @click="refresh"><Icon name="camera" />Odśwież kamery</button>
      <button :aria-pressed="showInfo" :title="showInfo ? 'Chowa panel z danymi nabożeństwa' : 'Pokazuje panel z danymi nabożeństwa'" @click="showInfo = !showInfo">
        <Icon :name="showInfo ? 'right' : 'left'" />{{ showInfo ? 'Schowaj nabożeństwo' : 'Pokaż nabożeństwo' }}
      </button>
    </header>

    <main class="stream" :class="{ wide: !showInfo || overlay }">
      <section>
        <StreamDesk v-if="!overlay" :service="service">
          <template #tools>
            <div class="seg" role="group" aria-label="Układ kamer">
              <button v-for="[id, icon, name] in LAYOUTS" :key="id" :class="{ on: settings.camLayout === id }" :title="name" :aria-label="name" :aria-pressed="settings.camLayout === id" @click="setLayout(id)"><Icon :name="icon" /></button>
            </div>
            <label class="check"><input v-model="settings.camLabels" type="checkbox"> Podpisy</label>
          </template>
          <template #preview>
            <div v-if="status" class="empty desk-empty">{{ status }}</div>
            <div v-else class="cams" :class="'l-' + settings.camLayout" :style="{ '--cols': cols, '--n': Math.max(shown.length - 1, 1) }">
              <button v-for="cam in shown" :key="cam.id" class="cam" :class="{ main: cam.id === mainId }"
                      :title="settings.camLayout === 'big' || settings.camLayout === 'one' ? (cam.id === mainId ? 'Kliknij, aby wrócić do poprzedniego układu' : 'Kliknij, aby ta kamera była duża') : 'Kliknij, aby powiększyć'" @click="clickCam(cam)">
                <video v-if="cam.stream" :ref="el => attach(el, cam)" autoplay muted playsinline></video>
                <span v-else class="placeholder">{{ cam.error }}</span>
                <span v-if="settings.camLabels" class="cam-label">{{ cam.label }}</span>
              </button>
            </div>
          </template>
          <template #side>
          <div class="cue" :class="{ folded: settings.cueFolded }">
            <div class="cue-head">
              <button class="desk-fold" :aria-expanded="!settings.cueFolded" :title="settings.cueFolded ? 'Rozwiń' : 'Zwiń'" @click="settings.cueFolded = !settings.cueFolded"><Icon :name="settings.cueFolded ? 'right' : 'down'" /></button>
              <h2 class="desk-fold-title" @click="settings.cueFolded = !settings.cueFolded">Sygnały dla kamerzysty</h2>
              <label class="check"><input v-model="settings.cue" type="checkbox" @change="applyCue"> Włączone</label>
              <!-- Instrukcja dla kamerzysty — tylko po najechaniu (albo kliknięciu) na ikonkę. -->
              <span class="cue-info" tabindex="0" aria-label="Jak połączyć telefon kamerzysty">
                <Icon name="info" />
                <span class="cue-tip" role="tooltip">
                  Na telefonie kamerzysty: aplikacja <b>KNS Nabo</b> → <b>Kamera</b> (działa w każdej sieci, przez internet).
                  <template v-if="cueUrl"><br>Albo w tej samej sieci Wi-Fi: <b>{{ cueUrl }}</b></template>
                  <br>Sygnały: na wizji — dwa krótkie wysokie, przygotuj się — jeden średni, poza wizją — jeden długi niski.
                </span>
              </span>
              <span v-if="settings.cue && quota?.limit && !settings.cueFolded" class="cue-quota" :class="{ low: quota.left < 30 }"
                    title="Darmowa usługa przesyłania sygnałów (ntfy) ma dzienny limit wiadomości na jedno łącze internetowe. Liczą się sygnały i potwierdzenia z telefonów w tej samej sieci.">
                Wysłane dziś: {{ quota.used }} / {{ quota.limit }} · zostało {{ quota.left }}
              </span>
              <span v-if="settings.cue" class="cue-clients" :class="{ none: !phones || got < phones }">
                <template v-if="!phones">Żaden telefon nie jest połączony</template>
                <template v-else>Telefony: {{ phones }} · {{ got === phones ? 'sygnał odebrany ✓' : 'odebrało ' + got + ' z ' + phones + '…' }}</template>
              </span>
            </div>
            <template v-if="!settings.cueFolded">
            <p v-if="cueRemote.error" class="note bad">{{ cueRemote.error }}</p>
            <template v-if="settings.cue">
              <div class="cue-buttons">
                <button v-for="[state, text, key] in CUES" :key="state" :class="[state, { current: cueState === state }]" :aria-pressed="cueState === state" @click="sendCue(state)">
                  {{ text }}<kbd>{{ key }}</kbd>
                </button>
              </div>
            </template>
            <p v-else class="note">Kamerzysta zakłada słuchawkę podłączoną do telefonu. Gdy zmienisz tu stan, usłyszy sygnał: dwa krótkie wysokie — na wizji, jeden średni — przygotuj się, jeden długi niski — poza wizją.</p>
            </template>
          </div>
          </template>
        </StreamDesk>
        <!-- Tryb nakładki: same kamery na całe okno -->
        <div v-if="overlay" class="cams" :class="'l-' + settings.camLayout" :style="{ '--cols': cols, '--n': Math.max(shown.length - 1, 1) }">
          <button v-for="cam in shown" :key="cam.id" class="cam" :class="{ main: cam.id === mainId }" @click="clickCam(cam)">
            <video v-if="cam.stream" :ref="el => attach(el, cam)" autoplay muted playsinline></video>
            <span v-else class="placeholder">{{ cam.error }}</span>
            <span v-if="settings.camLabels" class="cam-label">{{ cam.label }}</span>
          </button>
        </div>
        <div v-if="anyBusy && !overlay" class="busy-tip">
          <b>Kamera zajęta?</b> Windows zwykle daje obraz z kamery (także z ATEM Mini po USB) tylko jednemu programowi naraz. Co możesz zrobić:
          <ul>
            <li>Windows 11: Ustawienia → Bluetooth i urządzenia → Kamery → wybierz kamerę (np. Blackmagic Design) → włącz „Zezwalaj wielu aplikacjom na jednoczesne używanie kamery”, potem uruchom OBS ponownie.</li>
            <li>Albo w OBS kliknij „Uruchom wirtualną kamerę” i odśwież kamery tutaj — pojawi się „OBS Virtual Camera” z obrazem z OBS.</li>
          </ul>
          ATEM Mini wysyła przez USB jeden obraz (to, co jest na wyjściu programu), nie osobno każdą kamerę.
        </div>
        <!-- Nakładka: pasek sygnałów pod kamerami (w OBS można go przyciąć). -->
        <div v-if="overlay && settings.cue && settings.camCueBar" class="ov-cues">
          <button v-for="[state, text, key] in CUES" :key="state" :class="[state, { current: cueState === state }]" :aria-pressed="cueState === state" @click="sendCue(state)">
            {{ text }}<kbd>{{ key }}</kbd>
          </button>
          <span class="ov-phones" :class="{ none: !phones || got < phones }" :title="'Telefony: ' + phones + ', odebrało: ' + got">{{ got }}/{{ phones }}</span>
        </div>
      </section>

      <section v-if="showInfo && !overlay" class="props">
        <div class="panel-head"><h2>Nabożeństwo</h2><SyncButton status /></div>
        <Countdown compact />
        <div v-if="!services.length" class="empty">Nie ma zaplanowanego nabożeństwa. Tworzy je służba „Organizacja nabożeństw”.</div>
        <template v-else>
          <select v-model="serviceId" aria-label="Nabożeństwo">
            <option v-for="s in sortedServices" :key="s.id" :value="s.id">{{ prettyDate(s.date) }}{{ s.sermonTitle ? ' · ' + s.sermonTitle : '' }}</option>
          </select>
          <div v-if="!fields.length && !program.length" class="empty">To nabożeństwo nie ma jeszcze wpisanych informacji.</div>
          <div v-if="program.length" class="info">
            <div class="labelrow">
              <label>Program</label>
              <button class="small" @click="copy('Program', programText)"><Icon :name="copied === 'Program' ? 'check' : 'copy'" />{{ copied === 'Program' ? 'Skopiowano' : 'Kopiuj' }}</button>
            </div>
            <ol class="prog">
              <li v-for="p in program" :key="p.key" :class="{ now: p.now, done: p.done }"><b>{{ p.time }}</b><span>{{ p.name }}<small v-if="p.detail">{{ p.detail }}</small></span><em v-if="p.now">TERAZ</em></li>
            </ol>
          </div>
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
