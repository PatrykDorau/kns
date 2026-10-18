<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { api, cameraLock, listenLyrics, lyricsNow, prettyDate, serviceTime, servicePlace, settings } from './store.js'
import { SCENES, checkHardware, listCameras, pauseIdle, requestKeyFrame, setAudio, setCamera, setFps, setScene, startEncoding, stopEncoding, studio, studioCanvas, toggleLowerThird } from './studio.js'

// Pulpit streamu: ATEM przez sieć (która kamera na wizji, podgląd, Cut/Auto) i YouTube (stały klucz, transmisje
// z tytułem i opisem z nabożeństwa). Mikser zostaje sprzętowy — aplikacja tylko nim steruje.
const props = defineProps({ service: { type: Object, default: null } })

/* ---------- ATEM ---------- */
const atem = ref({ connected: false, address: '', inputs: [], program: null, preview: null, streaming: '', recording: '' })
const address = ref(settings.atemAddress || '')
const atemError = ref('')
const connecting = computed(() => !!atem.value.address && !atem.value.connected)
const cameras = computed(() => atem.value.inputs.filter(i => i.camera))
const others = computed(() => atem.value.inputs.filter(i => !i.camera && i.id === 0)) // czerń — „wyjście awaryjne”
let off = null
onMounted(async () => {
  off = api.onAtemState?.(s => { atem.value = s })
  const st = await api.atemState?.()
  if (st) atem.value = st
  if (settings.atemAddress && !st?.address) connect()
  loadYt()
  offLive = api.onStreamState?.(x => { live.value = x })
  const ls = await api.streamState?.()
  if (ls) { live.value = ls; if (ls.running || ls.starting) cameraLock.value = true }
  loadDevices()
  offKey = api.onStudioNeedKey?.(() => requestKeyFrame())
  await checkHardware()
  loadStudioDevices()
})
onBeforeUnmount(() => { off?.(); offLive?.(); offKey?.(); unlisten?.(); clearInterval(ytTimer); pauseIdle() })

/* ---------- studio (obraz składany w aplikacji) ---------- */
let offKey = null
const engine = computed(() => (settings.streamEngine === 'simple' || studio.hardware === false ? 'simple' : 'studio'))
const studioDevices = ref({ video: [], audio: [] })
const stageEl = ref(null)
watch([stageEl, engine], ([el, eng]) => { if (el && eng === 'studio') { setFps(settings.streamFps); el.appendChild(studioCanvas()) } }, { flush: 'post' })
async function loadStudioDevices() {
  studioDevices.value = await listCameras()
  const pick = (list, saved) => list.find(d => d.label === saved) || list.find(d => /blackmagic|atem/i.test(d.label)) || (saved === '' ? null : null)
  const cam = pick(studioDevices.value.video, settings.studioCamera) || studioDevices.value.video[0]
  if (cam) { settings.studioCamera = cam.label; setCamera(cam.deviceId) }
  const mic = pick(studioDevices.value.audio, settings.studioAudio)
  if (mic) { settings.studioAudio = mic.label; setAudio(mic.deviceId) }
}
function chooseCamera(label) { settings.studioCamera = label; const d = studioDevices.value.video.find(x => x.label === label); setCamera(d?.deviceId || '') }
function chooseAudio(label) { settings.studioAudio = label; const d = studioDevices.value.audio.find(x => x.label === label); setAudio(d?.deviceId || '') }
watch(() => settings.streamFps, f => setFps(f))
async function connect() {
  atemError.value = ''
  const ip = address.value.trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { atemError.value = 'Wpisz adres IP miksera, np. 192.168.1.240 (ATEM Software Control → Ustawienia → Sieć).'; return }
  settings.atemAddress = ip
  atem.value = await api.atemConnect(ip)
}
async function disconnect() { settings.atemAddress = ''; atem.value = await api.atemDisconnect() }
async function run(name, arg) {
  const res = await api.atemRun(name, arg)
  atemError.value = res?.error || ''
}
// Kliknięcie kamery: od razu na wizję (Cut) albo do podglądu (zielony), potem CUT/AUTO.
function pick(input) { run(settings.atemDirect ? 'program' : 'preview', input.id) }
const STREAM_LABEL = { idle: 'gotowy', connecting: 'łączy się…', streaming: 'NADAJE', stopping: 'kończy…' }

/* ---------- YouTube ---------- */
const yt = ref({ loggedIn: false })
const ytBusy = ref(false), ytError = ref(''), showKey = ref(false), copied = ref('')
let ytTimer = 0
async function loadYt() {
  const res = await api.ytOverview?.()
  if (!res) return
  if (res.error) {
    // zalogowane, ale YouTube zgłosił błąd (np. chwilowy po swojej stronie) — kanał zostaje, a komunikat mówi, co się nie udało
    ytError.value = res.error
    const st = res.needLogin ? { loggedIn: false } : await api.ytStatus()
    yt.value = { ...yt.value, ...st }
    clearInterval(ytTimer)
    if (st.loggedIn) ytTimer = setInterval(loadYt, 30000)
    return
  }
  ytError.value = ''
  yt.value = res
  clearInterval(ytTimer)
  if (res.loggedIn) ytTimer = setInterval(loadYt, 15000) // stan sygnału i transmisji
}
async function ytDo(job) {
  ytBusy.value = true; ytError.value = ''
  try {
    const res = await job()
    if (res?.error) ytError.value = res.error
    await loadYt()
    return res
  } finally { ytBusy.value = false }
}
const ytLogin = () => ytDo(() => api.ytLogin())
const ytLogout = () => { if (confirm('Odłączyć aplikację od kanału YouTube?')) ytDo(() => api.ytLogout()) }
async function copy(name, text) { await navigator.clipboard.writeText(text); copied.value = name; setTimeout(() => { if (copied.value === name) copied.value = '' }, 1500) }

// Tytuł i opis transmisji z nabożeństwa (jak dotychczasowe filmy: „Tytuł | Fragment | Mówca”).
const ytTitle = svc => [svc.sermonTitle, svc.passage, svc.speaker].map(x => (x || '').trim()).filter(Boolean).join(' | ') || 'Nabożeństwo ' + new Date(svc.date + 'T12:00').toLocaleDateString('pl')
function ytDescription(svc) {
  const lines = [`Nabożeństwo Kościoła Na Skale — ${prettyDate(svc.date)}, ${serviceTime(svc)}, ${servicePlace(svc)}.`]
  if (svc.sermonTitle || svc.passage) lines.push('', 'Kazanie: ' + [svc.sermonTitle, svc.passage && `(${svc.passage})`].filter(Boolean).join(' ') + (svc.speaker ? ' — ' + svc.speaker : ''))
  if (svc.songs?.length) lines.push('', 'Pieśni:', ...svc.songs.map((e, i) => `${i + 1}. ${e.title}`))
  if (svc.band) lines.push('', 'Zespół: ' + svc.band)
  return lines.join('\n')
}
const ytStart = svc => new Date(`${svc.date}T${serviceTime(svc)}`).toISOString()
// Transmisja na wybrane nabożeństwo: ta, która startuje tego dnia.
const forService = computed(() => (props.service && yt.value.broadcasts || []).find(b => b.start?.slice(0, 10) === props.service.date) || null)
const privacy = ref(settings.ytPrivacy || 'public')
watch(privacy, v => { settings.ytPrivacy = v })
async function createForService() {
  const svc = props.service
  if (!svc) return
  await ytDo(() => api.ytCreate({ title: ytTitle(svc), description: ytDescription(svc), start: ytStart(svc), privacy: privacy.value }))
}
async function refreshFromService(b) {
  const svc = props.service
  if (svc) await ytDo(() => api.ytUpdate({ id: b.id, title: ytTitle(svc), description: ytDescription(svc), start: ytStart(svc), privacy: b.privacy }))
}
/* ---------- nadawanie z aplikacji (bez OBS): obraz i dźwięk z ATEM po USB → napisy → YouTube ---------- */
const live = ref({ running: false, starting: false })
const liveOn = computed(() => live.value.running || live.value.starting)
const devices = ref({ video: [], audio: [], screens: [] })
const liveError = ref('')
let offLive = null
async function loadDevices() {
  devices.value = { screens: [], ...((await api.streamDevices?.()) || { video: [], audio: [] }) }
  // ATEM po USB to „Blackmagic Design” — wybierany sam
  const bm = list => list.find(n => /blackmagic|atem/i.test(n)) || ''
  const all = [...devices.value.video, ...devices.value.screens.map(s => s.value)]
  if (!all.includes(settings.streamVideo)) settings.streamVideo = bm(devices.value.video) || devices.value.video[0] || ''
  if (settings.streamAudio && !devices.value.audio.includes(settings.streamAudio)) settings.streamAudio = ''
  if (!settings.streamAudio) settings.streamAudio = bm(devices.value.audio)
}
// Którą transmisję wystartować: zaplanowaną (też z YouTube Studio) albo nową z wybranego nabożeństwa.
const upcoming = computed(() => (yt.value.broadcasts || []).filter(b => ['created', 'ready', 'testStarting', 'testing', 'liveStarting', 'live'].includes(b.status)))
const chosenId = ref('')
watch(upcoming, list => {
  if (chosenId.value === 'new' ? false : list.some(b => b.id === chosenId.value)) return
  chosenId.value = (forService.value || list[0])?.id || 'new'
}, { immediate: true })
const chosen = computed(() => upcoming.value.find(b => b.id === chosenId.value) || null)
const newTitle = computed(() => (props.service ? ytTitle(props.service) : 'Transmisja na żywo — Kościół Na Skale ' + new Date().toLocaleDateString('pl')))
const nextTitle = computed(() => chosen.value?.title || newTitle.value)
const when = b => (b.start ? new Date(b.start).toLocaleString('pl', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const liveBroadcast = ref(null) // transmisja, którą nadajemy (do ręcznego „na żywo” i tytułu w trakcie)
const hiFps = computed(() => +settings.streamFps > 30)
const videoLabel = computed(() => (engine.value === 'studio' ? settings.studioCamera || 'brak kamery' : devices.value.screens.find(x => x.value === settings.streamVideo)?.label || settings.streamVideo || 'brak obrazu'))
async function goLive() {
  liveError.value = ''
  if (!yt.value.stream) await loadYt()
  if (!yt.value.stream) { liveError.value = 'Nie mam klucza transmisji z YouTube — kliknij odśwież albo połącz kanał ponownie.'; return }
  let b = chosen.value
  if (b && b.streamId !== yt.value.stream.id) {
    // transmisja z YouTube Studio pod innym kluczem — przepinamy ją na stały klucz aplikacji
    const res = await ytDo(() => api.ytBind(b.id))
    if (!res || res.error) return
  }
  if (!b) {
    const svc = props.service
    const res = await ytDo(() => api.ytCreate({ title: newTitle.value, description: svc ? ytDescription(svc) : '', start: new Date(Date.now() + 60000).toISOString(), privacy: privacy.value }))
    if (!res || res.error) return
    b = res
    chosenId.value = res.id
  }
  liveBroadcast.value = b
  if (engine.value === 'studio') {
    // studio: obraz składa i koduje aplikacja (karta graficzna), FFmpeg tylko wysyła
    setFps(settings.streamFps)
    studio.bitrate = settings.streamQuality === '720' ? (hiFps.value ? 5000000 : 3500000) : (hiFps.value ? 9000000 : 6800000)
    const res = await api.streamStartStudio({ url: yt.value.stream.url, key: yt.value.stream.key, fps: settings.streamFps })
    if (res?.error) { liveError.value = res.error; return }
    await startEncoding()
    watchGoLive()
    return
  }
  cameraLock.value = true // podgląd kamer w Stream oddaje obraz z ATEM
  await new Promise(r => setTimeout(r, 800))
  const res = await api.streamStart({ url: yt.value.stream.url, key: yt.value.stream.key, video: settings.streamVideo, audio: settings.streamAudio, quality: settings.streamQuality, fps: settings.streamFps })
  if (res?.error) { liveError.value = res.error; cameraLock.value = false; return }
  feed(lyricsLast.value.text) // napisy od pierwszej klatki
  watchGoLive()
}
// Transmisja bez automatycznego startu (np. zaplanowana w YouTube Studio): gdy YouTube zobaczy obraz — „na żywo”.
let goLiveTimer = 0
function watchGoLive() {
  clearInterval(goLiveTimer)
  let tries = 0
  goLiveTimer = setInterval(async () => {
    if (!liveOn.value || ++tries > 40) { clearInterval(goLiveTimer); return }
    await loadYt()
    const b = upcoming.value.find(x => x.id === liveBroadcast.value?.id)
    if (!b || b.status === 'live') { if (b?.status === 'live') clearInterval(goLiveTimer); return }
    if (yt.value.stream?.status === 'active' && !b.autoStart && ['ready', 'created', 'testing'].includes(b.status)) {
      const res = await api.ytGoLive(b.id)
      if (res?.error) liveError.value = 'YouTube: ' + res.error
      else clearInterval(goLiveTimer)
    }
  }, 6000)
}
async function stopLive() {
  if (!confirm('Zakończyć transmisję? Na YouTube zakończy się sama po chwili od zatrzymania obrazu.')) return
  stopEncoding()
  live.value = await api.streamStop()
  cameraLock.value = false
  setTimeout(loadYt, 4000)
}
// Napisy: z rzutnika na tym komputerze, z innego komputera (kanał na żywo z adresu …/napisy?k=…) albo bez.
const lyricsKey = computed(() => { const raw = String(settings.streamLyricsKey || ''); const m = raw.match(/[?&]k=([\w-]+)/); return m ? m[1] : raw.trim().replace(/[^\w-]/g, '') })
const lyricsLast = ref({ text: '', at: 0 })
let unlisten = null
const feed = text => { lyricsLast.value = { text, at: Date.now() }; studio.lyrics = text; api.streamLyrics?.(text) }
watch([() => settings.streamLyrics, lyricsKey], () => {
  unlisten?.(); unlisten = null
  feed(settings.streamLyrics === 'local' ? lyricsNow.value : '')
  if (settings.streamLyrics === 'remote' && lyricsKey.value) unlisten = listenLyrics(lyricsKey.value, feed)
}, { immediate: true })
watch(lyricsNow, t => { if (settings.streamLyrics === 'local') feed(t) })
const lyricsInfo = computed(() => {
  if (settings.streamLyrics === 'off') return 'wyłączone'
  if (settings.streamLyrics === 'remote' && !lyricsKey.value) return 'wklej adres napisów z komputera z rzutnikiem'
  const t = lyricsLast.value.text.split('\n')[0]
  if (settings.streamLyrics === 'remote' && !lyricsLast.value.at) return 'czekam na rzutnik…'
  return t ? 'teraz: „' + t + (lyricsLast.value.text.includes('\n') ? '…' : '') + '”' : 'teraz bez tekstu (brak pieśni albo „Ukryj”)'
})
async function endBroadcast(b) { if (confirm('Zakończyć transmisję „' + b.title + '”? Widzowie zobaczą jej koniec.')) await ytDo(() => api.ytEnd(b.id)) }
const B_STATUS = { created: 'Zaplanowana', ready: 'Gotowa — czeka na obraz', testStarting: 'Test…', testing: 'Test', liveStarting: 'Startuje…', live: 'NA ŻYWO' }
const PRIVACY = { public: 'publiczna', unlisted: 'niepubliczna', private: 'prywatna' }
const HEALTH = { good: 'dobry', ok: 'w porządku', bad: 'słaby', noData: 'brak danych' }
const signal = computed(() => {
  const s = yt.value.stream
  if (!s) return { text: '', cls: '' }
  if (s.status !== 'active') return { text: 'brak sygnału', cls: 'idle' }
  return { text: 'sygnał ' + (HEALTH[s.health] || s.health), cls: s.health === 'bad' ? 'bad' : 'ok' }
})
function stopAtemStream() { if (confirm('Zatrzymać transmisję z ATEM?')) run('streaming', false) }
const sendKeyToAtem = () => run('streamService', { url: yt.value.stream.url, key: yt.value.stream.key })
</script>

<template>
  <div class="desk">
    <div class="desk-main">
      <div class="desk-left">
      <!-- Podgląd: przed startem obraz z kamer (ATEM po USB), w trakcie — dokładnie to, co widzą widzowie -->
      <section class="desk-stage">
        <div class="desk-stage-head">
          <h2>{{ liveOn ? 'To widzą widzowie' : 'Podgląd' }}</h2>
          <b v-if="liveOn" class="desk-onair" :class="live.running ? 'live' : 'wait'">{{ live.running ? '● NA ŻYWO' : 'Łączę z YouTube…' }}</b>
          <template v-if="liveOn">
            <span v-if="live.time" class="muted">{{ live.time }}</span>
            <span v-if="live.fps" class="muted">{{ live.fps }} kl./s</span>
            <span v-if="live.bitrate" class="muted">{{ live.bitrate.replace('kbits/s', ' kb/s') }}</span>
            <span v-if="live.drop" class="bad">zgubione klatki: {{ live.drop }}</span>
          </template>
          <span class="spacer"></span>
          <slot v-if="!liveOn && engine !== 'studio'" name="tools" />
          <small v-else class="muted">{{ live.encoder }}</small>
        </div>
        <div class="desk-screen">
          <div v-if="engine === 'studio'" ref="stageEl" class="studio-host"></div>
          <img v-else-if="liveOn && live.previewUrl" class="desk-preview" :src="live.previewUrl" alt="Podgląd — to widzą widzowie">
          <slot v-else name="preview" />
        </div>
        <div v-if="engine === 'studio'" class="desk-scenes" role="group" aria-label="Sceny transmisji">
          <button v-for="[id, name] in SCENES" :key="id" :class="{ on: studio.scene === id }" :aria-pressed="studio.scene === id" @click="setScene(id)">{{ name }}</button>
          <span class="spacer"></span>
          <button :class="{ on: studio.lyricsOn }" :aria-pressed="studio.lyricsOn" title="Napisy pieśni na obrazie" @click="studio.lyricsOn = !studio.lyricsOn">Napisy</button>
          <button :class="{ on: studio.lowerThird }" :aria-pressed="studio.lowerThird" title="Pasek z mówcą i tytułem kazania (na scenie Kamera)" @click="toggleLowerThird">Pasek mówcy</button>
        </div>
        <p v-if="engine === 'studio' && studio.error" class="note bad">{{ studio.error }}</p>
      </section>

      <!-- ATEM: przełączanie kamer z aplikacji (opcjonalnie, kabel sieciowy) -->
      <section class="desk-atem">
        <div class="desk-head">
          <h2>ATEM</h2>
          <span class="desk-dot" :class="atem.connected ? 'ok' : connecting ? 'wait' : 'off'"></span>
          <small class="muted">{{ atem.connected ? (atem.model || 'połączono') + ' · ' + atem.address : connecting ? 'łączę z ' + atem.address + '… (sprawdź kabel sieciowy i adres)' : 'przełączanie kamer z aplikacji — niepołączony' }}</small>
          <span class="spacer"></span>
          <template v-if="atem.connected || connecting">
            <label class="check" title="Kliknięcie kamery od razu wysyła ją na wizję (bez podglądu)"><input v-model="settings.atemDirect" type="checkbox"> Od razu na wizję</label>
            <button class="small" @click="disconnect">Rozłącz</button>
          </template>
          <template v-else>
            <input v-model="address" class="desk-ip" placeholder="np. 192.168.10.240" aria-label="Adres IP miksera ATEM" inputmode="decimal" @keydown.enter="connect">
            <button class="small primary" @click="connect">Połącz</button>
          </template>
        </div>
        <p v-if="atemError" class="note bad">{{ atemError }}</p>
        <details v-if="!atem.connected && !connecting" class="desk-help">
          <summary>Jak podłączyć (opcjonalnie — przyciski na mikserze działają bez tego)</summary>
          <ol>
            <li>Kabel sieciowy: gniazdo <b>ETHERNET</b> w ATEM ↔ gniazdo sieciowe laptopa (albo przejściówka USB → Ethernet). USB-C zostaje na obraz.</li>
            <li><b>ATEM Setup</b> (mikser po USB): Configure → Network → adres stały <b>192.168.10.240</b>, maska 255.255.255.0 → Save.</li>
            <li>Windows: Ustawienia → Sieć i internet → Ethernet → Przypisanie IP → Ręcznie → IPv4: <b>192.168.10.10</b>, maska 255.255.255.0 (bez bramy — internet dalej przez Wi-Fi).</li>
            <li>Tutaj wpisz <b>192.168.10.240</b> → Połącz.</li>
          </ol>
        </details>
        <div v-if="atem.connected" class="desk-cams" role="group" aria-label="Kamery w mikserze">
          <button v-for="i in cameras" :key="i.id" class="desk-cam" :class="{ pgm: atem.program === i.id, pvw: atem.preview === i.id }"
                  :aria-pressed="atem.program === i.id" :title="(atem.program === i.id ? 'Na wizji' : atem.preview === i.id ? 'W podglądzie' : settings.atemDirect ? 'Kliknij — na wizję' : 'Kliknij — do podglądu') + ' · ' + i.name" @click="pick(i)">
            <b>{{ i.short || i.id }}</b><span>{{ i.name }}</span>
            <em v-if="atem.program === i.id">NA WIZJI</em><em v-else-if="atem.preview === i.id">PODGLĄD</em>
          </button>
          <button v-for="i in others" :key="i.id" class="desk-cam black" :class="{ pgm: atem.program === i.id, pvw: atem.preview === i.id }" @click="pick(i)"><b>{{ i.short || 'BLK' }}</b><span>Czerń</span></button>
          <div class="desk-trans">
            <button class="desk-cut" title="Natychmiastowe przełączenie podglądu na wizję" @click="run('cut')">CUT</button>
            <button class="desk-auto" title="Płynne przejście podglądu na wizję" @click="run('auto')">AUTO</button>
          </div>
        </div>
      </section>
      </div>

      <!-- Transmisja na YouTube -->
      <section class="desk-ctrl">
        <div class="desk-head">
          <h2>YouTube</h2>
          <small v-if="yt.loggedIn" class="muted">{{ yt.channel }}</small>
          <span v-if="yt.loggedIn && signal.text" class="desk-badge" :class="signal.cls">{{ signal.text }}</span>
          <span class="spacer"></span>
          <button v-if="yt.loggedIn" class="small" :disabled="ytBusy" title="Odśwież" aria-label="Odśwież" @click="loadYt"><Icon name="refresh" /></button>
          <button v-if="yt.loggedIn && !liveOn" class="small" :disabled="ytBusy" title="Odłącz od kanału YouTube" aria-label="Odłącz od kanału YouTube" @click="ytLogout"><Icon name="logout" /></button>
        </div>
        <p v-if="ytError" class="note bad">{{ ytError }}</p>
        <template v-if="!yt.loggedIn">
          <p class="note">Połącz aplikację z kanałem kościoła — w przeglądarce wybierz konto (albo konto marki) kanału.</p>
          <button class="primary desk-yt-login" :disabled="ytBusy" @click="ytLogin"><Icon name="play" />{{ ytBusy ? 'Czekam na logowanie w przeglądarce…' : 'Połącz z YouTube' }}</button>
        </template>
        <template v-else>
          <template v-if="!liveOn">
            <label class="desk-field">Transmisja
              <select v-model="chosenId">
                <option v-for="b in upcoming" :key="b.id" :value="b.id">{{ b.title }}{{ when(b) ? ' — ' + when(b) : '' }} · {{ PRIVACY[b.privacy] || b.privacy }}</option>
                <option value="new">Nowa: „{{ newTitle }}”</option>
              </select>
            </label>
            <label v-if="chosenId === 'new'" class="desk-field">Widoczność
              <select v-model="privacy"><option value="public">Publiczna</option><option value="unlisted">Niepubliczna</option><option value="private">Prywatna</option></select>
            </label>
            <button class="desk-golive" :disabled="ytBusy || (engine === 'simple' && !settings.streamVideo)" @click="goLive"><i></i>Rozpocznij transmisję</button>
            <small class="muted desk-sub">Obraz: {{ videoLabel }} · napisy: {{ lyricsInfo }}</small>
            <p v-if="liveError" class="note bad">{{ liveError }}</p>
          </template>
          <template v-else>
            <p class="desk-title">„{{ liveBroadcast?.title || nextTitle }}”</p>
            <p v-if="live.error" class="note bad">{{ live.error }}</p>
            <small class="muted desk-sub">Napisy: {{ lyricsInfo }}</small>
            <button class="desk-stop" @click="stopLive">■ Zakończ transmisję</button>
          </template>

          <details class="desk-set" :open="!settings.streamVideo">
            <summary>Ustawienia nadawania</summary>
            <fieldset class="desk-grid" :disabled="liveOn">
              <label title="Studio: sceny, nakładki, okienko z kamerą — obraz koduje karta graficzna. Prosty: sam obraz z ATEM z napisami.">Tryb<select v-model="settings.streamEngine"><option value="studio" :disabled="studio.hardware === false">Studio (sceny i nakładki)</option><option value="simple">Prosty</option></select></label>
              <template v-if="engine === 'studio'">
                <label>Kamera<select :value="settings.studioCamera" @change="chooseCamera($event.target.value)"><option v-if="!studioDevices.video.length" value="">— brak —</option><option v-for="d in studioDevices.video" :key="d.deviceId" :value="d.label">{{ d.label || 'Kamera' }}</option></select></label>
                <label>Dźwięk<select :value="settings.studioAudio" @change="chooseAudio($event.target.value)"><option value="">bez dźwięku</option><option v-for="d in studioDevices.audio" :key="d.deviceId" :value="d.label">{{ d.label || 'Mikrofon' }}</option></select></label>
              </template>
              <label v-if="engine !== 'studio'">Obraz<select v-model="settings.streamVideo"><option v-if="!devices.video.length && !devices.screens.length" value="">— brak —</option><option v-for="d in devices.video" :key="d" :value="d">{{ d }}</option><optgroup v-if="devices.screens.length" label="Ekran (na próbę, bez ATEM)"><option v-for="d in devices.screens" :key="d.value" :value="d.value">{{ d.label }}</option></optgroup></select></label>
              <label v-if="engine !== 'studio'">Dźwięk<select v-model="settings.streamAudio"><option value="">bez dźwięku</option><option v-for="d in devices.audio" :key="d" :value="d">{{ d }}</option></select></label>
              <label>Jakość<select v-model="settings.streamQuality"><option value="1080">1080p · {{ hiFps ? '9' : '6,8' }} Mb/s</option><option value="720">720p · {{ hiFps ? '5' : '3,5' }} Mb/s (słabszy internet)</option></select></label>
              <label title="Tyle, ile wysyła ATEM: ATEM Software Control → Ustawienia → Standard wideo (np. 1080p50)">Klatki na sekundę<select v-model.number="settings.streamFps"><option :value="25">25</option><option :value="30">30</option><option :value="50">50</option><option :value="60">60</option></select></label>
              <label>Napisy pieśni<select v-model="settings.streamLyrics"><option value="local">z rzutnika na tym komputerze</option><option value="remote">z rzutnika na innym komputerze</option><option value="off">bez napisów</option></select></label>
            </fieldset>
            <input v-if="settings.streamLyrics === 'remote'" v-model="settings.streamLyricsKey" class="desk-lyr" placeholder="Adres napisów z drugiego komputera: Ustawienia aplikacji → Napisy → Przez internet → Kopiuj" aria-label="Adres napisów z drugiego komputera">
            <p class="note">Klatki na sekundę ustaw tak jak w ATEM (ATEM Software Control → Ustawienia → Standard wideo, np. 1080p50 → 50).</p>
            <p v-if="engine === 'simple' && !devices.video.length && !String(settings.streamVideo).startsWith('screen:')" class="note bad">Nie widzę obrazu z ATEM — podłącz mikser po USB-C i <button class="linkbtn" @click="loadDevices">odśwież listę</button>.</p>
          </details>

          <details class="desk-set">
            <summary>Zaplanowane transmisje ({{ upcoming.length }})</summary>
            <div class="desk-list">
              <div v-for="b in upcoming" :key="b.id" class="desk-bc" :class="{ live: b.status === 'live' }">
                <span class="desk-bc-text">
                  <b>{{ b.title }}</b>
                  <small>{{ [when(b), PRIVACY[b.privacy] || b.privacy].filter(Boolean).join(' · ') }} · <em>{{ B_STATUS[b.status] || b.status }}</em></small>
                </span>
                <button class="small" title="Kopiuj link do transmisji" @click="copy(b.id, b.url)"><Icon :name="copied === b.id ? 'check' : 'link'" /></button>
                <button v-if="service && b === forService && b.status !== 'live'" class="small" :disabled="ytBusy" title="Ustaw tytuł i opis z wybranego nabożeństwa" @click="refreshFromService(b)">Z nabożeństwa</button>
                <button v-if="['live', 'testing', 'liveStarting'].includes(b.status)" class="small danger" :disabled="ytBusy" @click="endBroadcast(b)">Zakończ</button>
              </div>
              <p v-if="!upcoming.length" class="note">Nie ma zaplanowanych transmisji.</p>
            </div>
            <div v-if="service && !forService" class="desk-new">
              <span><b>{{ ytTitle(service) }}</b><small class="muted">{{ prettyDate(service.date) }}, {{ serviceTime(service) }}</small></span>
              <button class="small" :disabled="ytBusy" title="Zaplanuj z wyprzedzeniem (widzowie zobaczą zapowiedź na kanale)" @click="createForService"><Icon name="plus" />Zaplanuj</button>
            </div>
          </details>

          <details class="desk-set">
            <summary>Zaawansowane: klucz transmisji (OBS albo nadawanie z ATEM)</summary>
            <div v-if="yt.stream" class="desk-key">
              <span><small class="muted">Serwer</small><code>{{ yt.stream.url }}</code></span>
              <button class="small" @click="copy('url', yt.stream.url)"><Icon :name="copied === 'url' ? 'check' : 'copy'" /></button>
              <span><small class="muted">Stały klucz (ten sam co tydzień)</small><code>{{ showKey ? yt.stream.key : '••••-••••-••••-••••' }}</code></span>
              <button class="small" :title="showKey ? 'Ukryj klucz' : 'Pokaż klucz'" @click="showKey = !showKey"><Icon :name="showKey ? 'eyeoff' : 'search'" /></button>
              <button class="small" @click="copy('key', yt.stream.key)"><Icon :name="copied === 'key' ? 'check' : 'copy'" />{{ copied === 'key' ? 'Skopiowano' : 'Kopiuj klucz' }}</button>
            </div>
            <div v-if="yt.stream && atem.connected" class="btnrow">
              <button class="small" title="Ustawia w ATEM serwer i klucz YouTube (transmisja prosto z miksera)" @click="sendKeyToAtem">Wyślij klucz do ATEM</button>
              <button v-if="atem.streaming !== 'streaming'" class="small" @click="run('streaming', true)">Start transmisji z ATEM</button>
              <button v-else class="small danger" @click="stopAtemStream">Stop transmisji z ATEM</button>
            </div>
            <p class="note">Tylko jeśli nadajecie innym programem: klucz wklej raz w OBS albo wyślij do ATEM (mikser z internetem po kablu sieciowym).</p>
          </details>
        </template>
      </section>
    </div>

  </div>
</template>
