<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Thumb from './Thumb.vue'
import { TEXT_STYLE, api, busy, cameraLock, items, label, loadListen, pickFiles, prettyDate, serviceTime, servicePlace, settings, uid } from './store.js'
import { lyricsFeed, lyricsKey, refeedLyrics, startLyricsFeed } from './lyricsFeed.js'
import { remote as remoteScreen } from './screenShare.js'
import { OVERLAYS, SCENES, mediaCtl, mediaSlide, setMedia, setMediaMode, setMediaPos, addCountdown, checkHardware, differs, initLook, listCameras, pauseIdle, previewCanvas, requestKeyFrame, setAudio, setCamera, setCountdown, setDirect, setFps, setPip, setScene, showSlide, slideCandidates, upcomingService, startEncoding, stopEncoding, studio, studioCanvas, take, toggleLowerThird, toggleLyrics } from './studio.js'

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
onBeforeUnmount(() => { off?.(); offLive?.(); offKey?.(); clearInterval(ytTimer); pauseIdle() })

/* ---------- studio (obraz składany w aplikacji) ---------- */
let offKey = null
const engine = computed(() => (settings.streamEngine === 'simple' || studio.hardware === false ? 'simple' : 'studio'))
const studioDevices = ref({ video: [], audio: [] })
const stageEl = ref(null)
const pvEl = ref(null)
watch([stageEl, engine], ([el, eng]) => { if (el && eng === 'studio') { setFps(settings.streamFps); el.appendChild(studioCanvas()) } }, { flush: 'post' })
watch(pvEl, el => { if (el) el.appendChild(previewCanvas()) }, { flush: 'post' })
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
// ustawienia scen zapamiętane między uruchomieniami
if (!studio.live) { initLook({ corner: settings.pipCorner || 'br', size: settings.pipSize || 'small' }); studio.direct = !!settings.studioDirect }
if (!settings.donateInit) { if (!settings.donatePhone) settings.donatePhone = '789 571 542'; settings.donateInit = true }
// ikonka w zwiniętej kolumnie: rozwija kolumnę i daną sekcję
function unrail(which) { settings.railFolded = false; settings[{ yt: 'ytFolded', cue: 'cueFolded', svc: 'svcFolded' }[which]] = false }
function pip(p) { setPip(p); if (p.corner) settings.pipCorner = p.corner; if (p.size) settings.pipSize = p.size }
function direct(v) { settings.studioDirect = v; setDirect(v) }
// ogłoszenia na transmisji: które są w pętli i co ile sekund
const slideList = computed(() => slideCandidates())
watch(() => [settings.studioHidden, settings.studioSlideSec], () => { studio.hidden = [...(settings.studioHidden || ['svc'])]; studio.slideEvery = +settings.studioSlideSec || 8 }, { immediate: true, deep: true })
function toggleSlide(id) { const h = new Set(settings.studioHidden || []); h.has(id) ? h.delete(id) : h.add(id); settings.studioHidden = [...h] }
const shownSlides = computed(() => slideList.value.filter(x => !studio.hidden.includes(x.id)).length)
const pending = computed(() => !studio.direct && differs())
const SCENE_NAME = Object.fromEntries(SCENES)
watch(() => [settings.studioAutoCamera, settings.donateAccount, settings.donatePhone, settings.donateName, settings.donateTitle], () => {
  studio.autoCamera = !!settings.studioAutoCamera
  Object.assign(studio.end, { account: settings.donateAccount, phone: settings.donatePhone, name: settings.donateName || 'Kościół Na Skale', title: settings.donateTitle || 'Darowizna' })
}, { immediate: true })
// YouTube i Spotify na planszę końcową — te same linki co „Posłuchaj” na stronie
loadListen().then(v => { if (v && !v.error) Object.assign(studio.end, { youtube: v.youtube || v.youtubeMore || '', spotify: v.spotify || '' }) })
const clock = sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') }
const countdownInfo = computed(() => (studio.left ? 'zostało ' + clock(studio.left) : 'na planszy: „Zaraz zaczynamy”') + (studio.countdownTo ? '' : ' · do nabożeństwa'))
const CORNERS = [['tl', '↖', 'Lewy górny róg'], ['tr', '↗', 'Prawy górny róg'], ['bl', '↙', 'Lewy dolny róg'], ['br', '↘', 'Prawy dolny róg']]
const autoKbps = computed(() => (settings.streamQuality === '720' ? (hiFps.value ? 5000 : 3500) : (hiFps.value ? 9000 : 6800)))
const kbps = computed(() => +settings.streamKbps || autoKbps.value)
const bankOk = computed(() => !settings.donateAccount || String(settings.donateAccount).replace(/\D/g, '').length === 26)
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

/* ---------- Media: materiały z biblioteki (te same co w Rzutniku) na transmisji ---------- */
// Zdjęcie, film, napis albo prezentacja — na cały ekran (scena „Media”) albo jako nakładka na kamerze/rzutniku.
const mediaList = computed(() => items.value.filter(it => !it.hidden && !it.missing && ['image', 'video', 'text', 'scene'].includes(it.type)))
const mediaKind = it => ({ image: 'Zdjęcie', video: 'Film', text: 'Napis', scene: 'Prezentacja' })[it.type] || ''
const mediaPicked = computed(() => items.value.find(x => x.id === studio.preview.media) || null)
const mediaAir = computed(() => (studio.program.scene === 'media' || studio.program.ovl !== 'off') ? items.value.find(x => x.id === studio.program.media) || null : null)
const airSlide = computed(() => (mediaAir.value ? mediaSlide(mediaAir.value.id) : null))
const mediaMode = computed(() => (studio.preview.scene === 'media' ? 'scene' : studio.preview.ovl))
function pickMedia(it) { setMedia(it.id); if (studio.preview.scene !== 'media' && studio.preview.ovl === 'off') setMediaMode(it.type === 'text' ? 'full' : 'scene') }
async function addMediaFiles() { const before = new Set(items.value.map(x => x.id)); await pickFiles(null); const added = items.value.filter(x => !before.has(x.id) && !x.hidden).at(-1); if (added) pickMedia(added) }
const newText = ref('')
function addMediaText() {
  const text = newText.value.trim()
  if (!text) return
  const it = { ...TEXT_STYLE, id: uid(), type: 'text', name: text.split('\n')[0].slice(0, 40), text, fs: 9, valign: 'bottom', shadow: true }
  items.value.push(it); newText.value = ''
  pickMedia(it)
}
const mmss = sec => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0')

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
    await loadYt()
    if (res?.error) ytError.value = res.error // po odświeżeniu, żeby komunikat nie zniknął
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
// YouTube planuje tylko przyszłe transmisje
const serviceStarted = computed(() => !!props.service && new Date(`${props.service.date}T${serviceTime(props.service)}`).getTime() < Date.now() + 60000)
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
/* ---------- stan transmisji ---------- */
const online = ref(navigator.onLine)
const onNet = () => { online.value = navigator.onLine }
window.addEventListener('online', onNet); window.addEventListener('offline', onNet)
onBeforeUnmount(() => { window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet) })
const kbpsNow = computed(() => parseFloat(String(live.value.bitrate || '').replace(',', '.')) || 0)
// przepływność z ostatnich 60 s (wykres)
const rateHistory = ref([])
watch(() => live.value.time, () => { if (!liveOn.value) { rateHistory.value = []; return } rateHistory.value = [...rateHistory.value, kbpsNow.value].slice(-60) })
const sparkMax = computed(() => Math.max(kbps.value * 1.3, ...rateHistory.value, 1))
const sparkPoints = computed(() => {
  const h = rateHistory.value
  return h.map((v, i) => (i / Math.max(1, h.length - 1)) * 60 + ',' + (19 - (v / sparkMax.value) * 17).toFixed(1)).join(' ')
})
const sparkTarget = computed(() => (19 - (kbps.value / sparkMax.value) * 17).toFixed(1)) // przerywana linia: cel
const DH_ICON = {
  rate: ['M12 19V5', 'm5 12 7-7 7 7'],
  lag: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  fps: ['M4 6h16v12H4z', 'M8 6v12', 'M16 6v12'],
  net: ['M2 9a15 15 0 0 1 20 0', 'M5 12.5a10 10 0 0 1 14 0', 'M8.5 16a5 5 0 0 1 7 0', 'M12 19.5h.01'],
  yt: ['M3 8.5C3 6.6 4.6 5 6.5 5h11C19.4 5 21 6.6 21 8.5v7c0 1.9-1.6 3.5-3.5 3.5h-11C4.6 19 3 17.4 3 15.5Z', 'm10 9 5 3-5 3Z'],
  audio: ['M11 5 6 9H3v6h3l5 4Z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
  rs: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
}
// Tryb prosty: dźwięk otwiera FFmpeg — zmiana w trakcie to restart nadawania na 1–2 s.
async function switchSimpleAudio(e) {
  const v = e.target.value
  if (live.value.running && !confirm('W trybie prostym zmiana dźwięku przerywa nadawanie na 1–2 sekundy. Zmienić?')) { e.target.value = settings.streamAudio; return }
  settings.streamAudio = v
  if (liveOn.value) await api.streamAudio?.(v)
}
const liveBc = computed(() => (yt.value.broadcasts || []).find(b => b.id === liveBroadcast.value?.id) || (yt.value.broadcasts || []).find(b => b.status === 'live') || null)
const health = computed(() => {
  const L = live.value, chips = [], target = kbps.value
  const rateRatio = target ? kbpsNow.value / target : 1
  const slow = engine.value === 'studio' ? (L.backlog || 0) > 2 : (parseFloat(L.speed) || 1) < 0.95
  // wysyłanie
  chips.push({ id: 'rate', label: 'Wysyłanie', value: kbpsNow.value ? (kbpsNow.value / 1000).toLocaleString('pl', { maximumFractionDigits: 1 }) + ' Mb/s' : '—',
    cls: !kbpsNow.value ? '' : rateRatio < 0.6 ? 'bad' : rateRatio < 0.85 ? 'warn' : 'ok', tip: 'Ile danych idzie teraz do YouTube (cel: ' + (target / 1000).toLocaleString('pl') + ' Mb/s). Przy obrazie bez ruchu bywa mniej — to normalne.' })
  // zaległość (studio) albo tempo (tryb prosty)
  if (engine.value === 'studio') chips.push({ id: 'lag', label: 'Opóźnienie wysyłania', value: (L.backlog || 0).toLocaleString('pl') + ' s', cls: (L.backlog || 0) > 5 ? 'bad' : (L.backlog || 0) > 2 ? 'warn' : 'ok', tip: 'Ile obrazu czeka na wysłanie. Rośnie, gdy internet nie nadąża.' })
  else chips.push({ id: 'lag', label: 'Tempo', value: L.speed || '—', cls: slow ? 'warn' : 'ok', tip: 'Poniżej 1x — komputer albo internet nie nadąża.' })
  // klatki
  const lost = (L.drop || 0) + (L.skipped || 0) + (engine.value === 'studio' ? studio.skipped : 0)
  chips.push({ id: 'fps', label: 'Klatki', value: (L.fps || 0) + '/s' + (lost > 10 ? ' · zgubione ' + lost : ''), cls: lost > 50 ? 'warn' : 'ok', tip: 'Klatki na sekundę; zgubione: pominięte przez kartę graficzną albo przy zatkanym internecie.' })
  // internet
  chips.push({ id: 'net', label: 'Internet', value: !online.value ? 'brak' : L.stalled ? 'stoi' : slow ? 'wolny' : 'OK', cls: !online.value || L.stalled ? 'bad' : slow ? 'warn' : 'ok' })
  // YouTube
  const st = yt.value.stream
  if (st) chips.push({ id: 'yt', label: 'YouTube odbiera', value: st.status !== 'active' ? 'brak obrazu' : (HEALTH[st.health] || st.health || '—'), cls: st.status !== 'active' ? 'bad' : st.health === 'bad' ? 'bad' : st.health === 'ok' ? 'warn' : 'ok', tip: (st.issues || []).map(i => i.text || i.reason).join(' · ') || 'Ocena YouTube (odświeżana co 15 s).' })
  if (liveBc.value?.viewers != null) chips.push({ id: 'view', label: 'Widzowie', value: String(liveBc.value.viewers), cls: '' })
  // dźwięk (studio)
  if (engine.value === 'studio') chips.push({ id: 'audio', label: 'Dźwięk', value: !settings.studioAudio ? 'wyłączony' : studio.silentFor > 10 ? 'cisza ' + studio.silentFor + ' s' : studio.audioDb > -1 ? 'przester' : 'jest', cls: !settings.studioAudio || studio.silentFor > 10 ? 'warn' : studio.audioDb > -1 ? 'warn' : 'ok', tip: 'Poziom dźwięku z miksera (ATEM po USB). Źródło można zmienić w trakcie — bez przerwy w transmisji.' })
  else chips.push({ id: 'audio', label: 'Dźwięk', value: settings.streamAudio ? 'z urządzenia' : 'wyłączony', cls: settings.streamAudio ? 'ok' : 'warn', tip: 'Źródło dźwięku. W trybie prostym zmiana w trakcie przerywa nadawanie na 1–2 s.' })
  if (L.restarts) chips.push({ id: 'rs', label: 'Wznowienia', value: String(L.restarts), cls: 'warn', tip: 'Ile razy połączenie z YouTube zerwało się i wróciło samo.' })
  // podpowiedź — najważniejszy problem
  let alert = null
  if (!online.value) alert = { cls: 'bad', text: 'Brak internetu w komputerze. Transmisja wznowi się sama, gdy wróci połączenie (obraz z tego czasu przepadnie).' }
  else if (L.error) alert = { cls: 'bad', text: L.error }
  else if (L.stalled) alert = { cls: 'bad', text: 'Od kilku sekund nic nie wychodzi do YouTube — sprawdź internet. Aplikacja próbuje dalej.' }
  else if ((L.backlog || 0) > 5) alert = { cls: 'bad', text: 'Internet nie nadąża (opóźnienie ' + L.backlog.toLocaleString('pl') + ' s). Zmniejsz przepływność albo jakość w „Ustawieniach nadawania” przy następnym starcie; przy dużym zatkaniu aplikacja pomija klatki, żeby wrócić na bieżąco.' }
  else if (slow) alert = { cls: 'warn', text: 'Wysyłanie zwalnia — internet albo komputer na granicy możliwości.' }
  else if (st && st.status === 'active' && st.health === 'bad') alert = { cls: 'warn', text: 'YouTube ocenia sygnał jako słaby' + ((st.issues || []).length ? ': ' + st.issues.map(i => i.text || i.reason).join(' · ') : '.') }
  else if (engine.value === 'studio' && settings.studioAudio && studio.silentFor > 10) alert = { cls: 'warn', text: 'Od ' + studio.silentFor + ' s nie ma dźwięku — sprawdź mikser (ATEM) i kabel USB.' }
  else if (engine.value === 'studio' && studio.skipped > 50 && live.value.running) alert = { cls: 'warn', text: 'Karta graficzna nie nadąża z kodowaniem — spróbuj 30 kl./s albo 720p.' }
  const level = chips.some(c => c.cls === 'bad') || alert?.cls === 'bad' ? 'bad' : chips.some(c => c.cls === 'warn') || alert ? 'warn' : L.running ? 'ok' : 'wait'
  const title = { bad: 'Problem z transmisją', warn: 'Uwaga', ok: 'Transmisja stabilna', wait: 'Łączę z YouTube…' }[level]
  return { chips: chips.filter(c => c.id !== 'view'), alert, level, title } // widzowie — w podsumowaniu
})
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
    studio.bitrate = kbps.value * 1000
    const res = await api.streamStartStudio({ url: yt.value.stream.url, key: yt.value.stream.key, fps: settings.streamFps, kbps: kbps.value })
    if (res?.error) { liveError.value = res.error; return }
    await startEncoding()
    watchGoLive()
    return
  }
  cameraLock.value = true // podgląd kamer w Stream oddaje obraz z ATEM
  await new Promise(r => setTimeout(r, 800))
  const res = await api.streamStart({ url: yt.value.stream.url, key: yt.value.stream.key, video: settings.streamVideo, audio: settings.streamAudio, quality: settings.streamQuality, fps: settings.streamFps, kbps: +settings.streamKbps || 0 })
  if (res?.error) { liveError.value = res.error; cameraLock.value = false; return }
  refeedLyrics() // napisy od pierwszej klatki
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
// Napisy podaje moduł lyricsFeed (działa też przy otwartym Rzutniku) — tu tylko stan.
startLyricsFeed()
const lyricsInfo = computed(() => {
  if (settings.streamLyrics === 'off') return 'wyłączone'
  if (settings.streamLyrics === 'remote' && !lyricsKey.value) return 'wklej adres napisów z komputera z rzutnikiem'
  const t = lyricsFeed.text.split('\n')[0]
  const link = settings.streamLyrics === 'remote' ? (lyricsFeed.link === 'local' ? ' (rzutnik na tym komputerze)' : lyricsFeed.link === 'connecting' ? ' · łączę ponownie…' : '') : ''
  if (settings.streamLyrics === 'remote' && !lyricsFeed.at) return (lyricsFeed.link === 'connecting' ? 'łączę z rzutnikiem…' : 'czekam na rzutnik…')
  return (t ? 'teraz: „' + t + (lyricsFeed.text.includes('\n') ? '…' : '') + '”' : 'teraz bez tekstu (brak pieśni albo „Ukryj”)') + link
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
          <span v-if="liveOn && live.time" class="desk-clock">{{ live.time }}</span>
          <span class="spacer"></span>
          <slot v-if="!liveOn && engine !== 'studio'" name="tools" />
          <small v-else class="muted">{{ live.encoder }}</small>
        </div>
        <!-- stan transmisji: ogólna ocena, wysyłanie (wykres), opóźnienie, klatki, internet, YouTube, dźwięk
             (miernik i zmiana źródła w trakcie); na dole podpowiedź przy najważniejszym problemie -->
        <div v-if="liveOn" class="dh" :class="'dh-' + health.level">
          <div class="dh-row">
            <div class="dh-sum">
              <i class="dh-led"></i>
              <span><b>{{ health.title }}</b><small>{{ live.time || 'łączę…' }}{{ liveBc?.viewers != null ? ' · ' + liveBc.viewers + ' ogląda' : '' }}</small></span>
            </div>
            <div v-for="c in health.chips" :key="c.id" class="dh-cell" :class="['s-' + (c.cls || 'none'), 'dh-' + c.id]" :title="c.tip">
              <svg class="dh-ic" viewBox="0 0 24 24" aria-hidden="true"><path v-for="(d, k) in DH_ICON[c.id]" :key="k" :d="d" /></svg>
              <!-- dźwięk: poziom, stan i wybór źródła (zmiana także w trakcie transmisji) -->
              <span v-if="c.id === 'audio'" class="dh-txt">
                <small>Dźwięk · <em>{{ c.value }}</em></small>
                <select v-if="engine === 'studio'" :value="settings.studioAudio" aria-label="Źródło dźwięku" title="Źródło dźwięku — zmiana w trakcie bez przerwy" @change="chooseAudio($event.target.value)"><option value="">bez dźwięku</option><option v-for="d in studioDevices.audio" :key="d.deviceId" :value="d.label">{{ d.label || 'Mikrofon' }}</option></select>
                <select v-else :value="settings.streamAudio" aria-label="Źródło dźwięku" title="Źródło dźwięku — zmiana w trakcie przerywa nadawanie na 1–2 s" @change="switchSimpleAudio($event)"><option value="">bez dźwięku</option><option v-for="d in devices.audio" :key="d" :value="d">{{ d }}</option></select>
                <i v-if="engine === 'studio'" class="dh-meter" aria-hidden="true"><i :style="{ width: Math.max(0, Math.min(100, (studio.audioDb + 60) / 60 * 100)) + '%' }"></i></i>
              </span>
              <span v-else class="dh-txt"><small>{{ c.label }}</small><b>{{ c.value }}</b></span>
              <svg v-if="c.id === 'rate' && rateHistory.length > 1" class="dh-spark" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" x2="60" :y1="sparkTarget" :y2="sparkTarget" class="dh-target" />
                <polygon :points="'0,20 ' + sparkPoints + ' 60,20'" /><polyline :points="sparkPoints" />
              </svg>
            </div>
          </div>
          <p v-if="health.alert" class="dh-alert" :class="health.alert.cls" role="status"><svg class="i" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>{{ health.alert.text }}</p>
        </div>
        <div v-if="engine === 'studio'" class="studio-mons" :class="{ single: studio.direct }">
          <figure v-if="!studio.direct" class="mon pvw">
            <figcaption>Podgląd <small>{{ SCENE_NAME[studio.preview.scene] }}</small></figcaption>
            <div class="mon-scr"><div ref="pvEl" class="studio-host"></div></div>
          </figure>
          <figure class="mon pgm">
            <figcaption>Na wizji <small>{{ SCENE_NAME[studio.program.scene] }}</small></figcaption>
            <div class="mon-scr"><div ref="stageEl" class="studio-host"></div></div>
          </figure>
        </div>
        <div v-else class="desk-screen">
          <img v-if="liveOn && live.previewUrl" class="desk-preview" :src="live.previewUrl" alt="Podgląd — to widzą widzowie">
          <slot v-else name="preview" />
        </div>
        <template v-if="engine === 'studio'">
          <div class="desk-take">
            <button class="desk-take-btn" :class="{ ready: pending }" :disabled="studio.direct || !pending" title="Podgląd przechodzi na wizję (płynnie)" @click="take">Na wizję ▸</button>
            <small class="muted">{{ studio.direct ? 'Zmiany idą od razu na wizję' : pending ? 'Podgląd różni się od wizji — sprawdź i kliknij „Na wizję”' : 'Podgląd = wizja' }}</small>
            <span class="spacer"></span>
            <label class="check" title="Bez podglądu: kliknięcie sceny albo nakładki od razu zmienia obraz na YouTube"><input :checked="studio.direct" type="checkbox" @change="direct($event.target.checked)"> Od razu na wizję</label>
          </div>
          <div class="desk-scenes" role="group" aria-label="Sceny transmisji">
            <button v-for="[id, name] in SCENES" :key="id" :class="{ on: studio.preview.scene === id, live: studio.program.scene === id }" :aria-pressed="studio.preview.scene === id" :title="studio.program.scene === id ? 'Na wizji' : ''" @click="setScene(id)">{{ name }}</button>
          </div>
          <div class="desk-opts">
            <span class="desk-opt-group">
              <button :class="{ on: studio.program.lyricsOn, live: studio.program.lyricsOn, idle: !OVERLAYS.lyrics.includes(studio.program.scene) }" :aria-pressed="studio.program.lyricsOn"
                      :title="'Napisy pieśni — włączają się i wyłączają od razu na wizji. Widać je na scenach: Kamera, Rzutnik, Rzutnik + kamera' + (OVERLAYS.lyrics.includes(studio.program.scene) ? '' : ' (na tej scenie wizji ich nie ma)')" @click="toggleLyrics">Napisy {{ studio.program.lyricsOn ? 'wł.' : 'wył.' }}</button>
              <button :class="{ on: studio.preview.lowerThird, live: studio.program.lowerThird, idle: !OVERLAYS.lowerThird.includes(studio.preview.scene) }" :aria-pressed="studio.preview.lowerThird"
                      :title="'Pasek z mówcą — najpierw na podglądzie, na wizję po „Na wizję”. Widać go na scenach: Kamera, Rzutnik + kamera' + (OVERLAYS.lowerThird.includes(studio.preview.scene) ? '' : ' (na tej scenie go nie ma)')" @click="toggleLowerThird">Pasek mówcy</button>
              <small v-if="['projector', 'projectorPip'].includes(studio.preview.scene)" class="desk-ov-note" :class="remoteScreen.state === 'on' ? 'ok' : 'muted'">{{ remoteScreen.state === 'on' ? '● obraz z rzutnika przez sieć' : remoteScreen.state === 'connecting' ? 'czekam na obraz z laptopa przy rzutniku…' : studio.projector.kind !== 'none' ? 'Rzutnik na tym komputerze' : 'Rzutnik nic nie pokazuje — włącz udostępnianie obrazu na laptopie przy rzutniku' }}</small>
              <small v-if="!OVERLAYS.lyrics.includes(studio.preview.scene)" class="muted desk-ov-note">Na tej scenie bez napisów i paska mówcy</small>
              <small v-else-if="!OVERLAYS.lowerThird.includes(studio.preview.scene)" class="muted desk-ov-note">Na tej scenie bez paska mówcy</small>
            </span>
            <span v-if="studio.preview.scene === 'countdown' || studio.program.scene === 'countdown'" class="desk-opt-group" role="group" aria-label="Odliczanie">
              <small class="muted">Timer</small>
              <button :class="{ on: !studio.countdownTo }" title="Odliczanie do godziny nabożeństwa" @click="setCountdown(0)">do nabożeństwa</button>
              <button v-for="m in [5, 10, 15]" :key="m" @click="setCountdown(m)">{{ m }} min</button>
              <button title="Dodaj minutę" @click="addCountdown(1)">+1</button>
              <small class="desk-left-time">{{ countdownInfo }}</small>
              <label class="check" title="Po zerze 3 s „Zaraz zaczynamy”, potem sama przełącza na Kamerę"><input v-model="settings.studioAutoCamera" type="checkbox"> po zerze Kamera</label>
            </span>
            <span v-if="studio.preview.scene === 'projectorPip'" class="desk-opt-group" role="group" aria-label="Okienko z kamerą">
              <small class="muted">Okienko</small>
              <button v-for="[id, arrow, label] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.pip.corner === id }" :title="label" :aria-label="label" @click="pip({ corner: id })">{{ arrow }}</button>
              <button :class="{ on: studio.preview.pip.size !== 'large' }" @click="pip({ size: 'small' })">Małe</button>
              <button :class="{ on: studio.preview.pip.size === 'large' }" @click="pip({ size: 'large' })">Duże</button>
            </span>
          </div>
          <!-- Media: zdjęcia, filmy, napisy, prezentacje na transmisji (bez ATEM i drugiego laptopa) -->
          <details class="desk-slides desk-media" :open="settings.mediaOpen !== false" @toggle="settings.mediaOpen = $event.target.open">
            <summary>Media <small class="muted">zdjęcia, filmy, napisy, prezentacje — na cały ekran albo jako nakładka{{ mediaAir ? ' · na wizji: ' + label(mediaAir) : '' }}</small></summary>
            <div class="desk-media-bar">
              <button class="small" :disabled="!!busy" title="Zdjęcie, film, PDF albo PowerPoint (prezentacja — jako slajdy)" @click="addMediaFiles"><Icon name="plus" />{{ busy || 'Dodaj pliki' }}</button>
              <input v-model="newText" class="desk-media-txt" placeholder="Napis na transmisję, np. „Zbiórka na remont — BLIK 789 571 542”" aria-label="Nowy napis" @keydown.enter="addMediaText">
              <button class="small" :disabled="!newText.trim()" @click="addMediaText"><Icon name="text" />Dodaj napis</button>
            </div>
            <div v-if="mediaList.length" class="desk-media-grid">
              <button v-for="it in mediaList" :key="it.id" class="desk-media-it" :class="{ on: studio.preview.media === it.id, live: mediaAir?.id === it.id }" :title="label(it)" @click="pickMedia(it)">
                <Thumb :item="it" />
                <span><b>{{ label(it) }}</b><small>{{ mediaKind(it) }}</small></span>
                <em v-if="mediaAir?.id === it.id">NA WIZJI</em>
              </button>
            </div>
            <p v-else class="note">Biblioteka jest pusta — dodaj pliki albo napis. To te same materiały, co w Rzutniku.</p>
            <div v-if="mediaPicked" class="desk-media-mode">
              <small class="muted">Pokaż „{{ label(mediaPicked) }}”:</small>
              <span class="desk-opt-group" role="group" aria-label="Jak pokazać">
                <button :class="{ on: mediaMode === 'scene' }" title="Na cały ekran (scena Media) — z paskiem mówcy i napisami pieśni" @click="setMediaMode('scene')">Cały ekran</button>
                <button :class="{ on: mediaMode === 'full' }" title="Na kamerze/rzutniku, cały kadr: grafika PNG z przezroczystym tłem albo napis bez tła" @click="setMediaMode('full')">Nakładka</button>
                <button :class="{ on: mediaMode === 'corner' }" title="Okienko w rogu na kamerze/rzutniku" @click="setMediaMode('corner')">W rogu</button>
                <button :class="{ on: mediaMode === 'off' && studio.preview.scene !== 'media' }" @click="setMediaMode('off')">Ukryj</button>
              </span>
              <span v-if="mediaMode === 'corner'" class="desk-opt-group" role="group" aria-label="Róg">
                <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.mpos.corner === id }" :title="lbl" :aria-label="lbl" @click="setMediaPos({ corner: id })">{{ arrow }}</button>
                <button :class="{ on: studio.preview.mpos.size !== 'large' }" @click="setMediaPos({ size: 'small' })">Małe</button>
                <button :class="{ on: studio.preview.mpos.size === 'large' }" @click="setMediaPos({ size: 'large' })">Duże</button>
              </span>
              <textarea v-if="mediaPicked.type === 'text'" v-model="mediaPicked.text" class="desk-media-edit" rows="2" aria-label="Treść napisu" title="Zmiany widać od razu (także na wizji)"></textarea>
            </div>
            <!-- sterowanie tym, co jest na wizji: film i slajdy działają od razu -->
            <div v-if="airSlide && (airSlide.type === 'video' || airSlide.deckOf)" class="desk-media-ctl">
              <b class="live-dot">Na wizji</b>
              <template v-if="airSlide.deckOf">
                <button class="small" title="Poprzedni slajd" @click="mediaCtl('slide', { id: airSlide.deckOf, d: -1 })">◀</button>
                <span>slajd {{ airSlide.slideNo }} z {{ airSlide.slideCount }}</span>
                <button class="small" title="Następny slajd" @click="mediaCtl('slide', { id: airSlide.deckOf, d: 1 })">▶</button>
              </template>
              <template v-if="airSlide.type === 'video'">
                <button class="small" @click="mediaCtl('play')"><Icon :name="studio.mplay.playing ? 'pause' : 'play'" />{{ studio.mplay.playing ? 'Pauza' : 'Graj' }}</button>
                <button class="small" title="Od początku" @click="mediaCtl('restart')"><Icon name="undo" /></button>
                <input class="desk-media-seek" type="range" min="0" :max="studio.mplay.duration || 1" step="0.5" :value="studio.mplay.time" aria-label="Pozycja filmu" @change="mediaCtl('seek', +$event.target.value)">
                <small class="muted">{{ mmss(studio.mplay.time) }} / {{ mmss(studio.mplay.duration) }}</small>
                <label class="check"><input type="checkbox" :checked="studio.mplay.loop" @change="mediaCtl('loop')"> pętla</label>
                <label class="desk-media-vol" title="Głośność filmu w transmisji"><Icon name="volume" /><input type="range" min="0" max="1" step="0.05" :value="studio.mplay.volume" @input="mediaCtl('volume', $event.target.value)"></label>
              </template>
            </div>
          </details>
          <details class="desk-slides" :open="['countdown', 'announcements'].includes(studio.preview.scene) || ['countdown', 'announcements'].includes(studio.program.scene)">
            <summary>Ogłoszenia na transmisji <small class="muted">{{ shownSlides }} z {{ slideList.length }} · tylko „dla wszystkich” z „Pokaż na nabożeństwie”</small></summary>
            <div class="desk-slide-bar">
              <label>Zmiana co <select v-model.number="settings.studioSlideSec"><option v-for="v in [5, 8, 10, 15, 20]" :key="v" :value="v">{{ v }} s</option></select></label>
              <small class="muted">Kliknij grafikę — pokaże się teraz. Oko — w pętli albo pominięte.</small>
            </div>
            <div class="desk-slide-grid">
              <div v-for="sl in slideList" :key="sl.id" class="desk-slide" :class="{ off: studio.hidden.includes(sl.id), now: studio.slideId === sl.id && !studio.hidden.includes(sl.id) }">
                <button class="desk-slide-pic" :disabled="studio.hidden.includes(sl.id)" :title="'Pokaż teraz: ' + sl.title" @click="showSlide(sl.id)">
                  <img v-if="sl.image" :src="sl.image" alt="" loading="lazy">
                  <span v-else class="desk-slide-txt"><b>{{ sl.title }}</b><small v-if="sl.text">{{ sl.text }}</small><small v-if="sl.service">{{ upcomingService() ? 'data, miejsce i kazanie' : '⚠ brak zaplanowanego — uzupełnij w Organizacji' }}</small></span>
                  <em v-if="studio.slideId === sl.id && !studio.hidden.includes(sl.id)">TERAZ</em>
                </button>
                <span class="desk-slide-name">{{ sl.title }}</span>
                <button class="desk-slide-eye" :title="studio.hidden.includes(sl.id) ? 'Włącz do pętli' : 'Pomiń w pętli'" :aria-label="studio.hidden.includes(sl.id) ? 'Włącz do pętli' : 'Pomiń w pętli'" @click="toggleSlide(sl.id)"><Icon :name="studio.hidden.includes(sl.id) ? 'eyeoff' : 'eye'" /></button>
              </div>
            </div>
            <p class="note">Inne ogłoszenia dodasz albo wyłączysz w Ogłoszeniach („Pokaż na nabożeństwie”, „Dla wszystkich”). Lista zmienia się sama.</p>
          </details>
        </template>
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

      <!-- Prawa kolumna: YouTube i (ze Stream) sygnały dla kamerzysty — obie sekcje zwijane -->
      <div class="desk-right" :class="{ rail: settings.railFolded }">
      <!-- zwinięta kolumna: same ikonki (transmisja, sygnały, nabożeństwo) — podgląd i wizja na całą szerokość -->
      <nav v-if="settings.railFolded" class="desk-rail" aria-label="Zwinięta kolumna">
        <button class="rail-btn rail-toggle" title="Rozwiń kolumnę" aria-label="Rozwiń kolumnę" @click="settings.railFolded = false"><Icon name="left" /></button>
        <button class="rail-btn" :class="{ live: liveOn }" :title="liveOn ? 'YouTube — NA ŻYWO' : 'YouTube'" aria-label="YouTube" @click="unrail('yt')"><Icon name="play" /><i v-if="liveOn" class="rail-dot"></i></button>
        <slot name="rail" :open="unrail" />
      </nav>
      <template v-else>
      <button class="rail-fold" title="Zwiń kolumnę do ikonek — więcej miejsca na podgląd i wizję" @click="settings.railFolded = true"><Icon name="right" />Zwiń kolumnę</button>
      <section class="desk-ctrl" :class="{ folded: settings.ytFolded }">
        <div class="desk-head">
          <button class="desk-fold" :aria-expanded="!settings.ytFolded" :title="settings.ytFolded ? 'Rozwiń' : 'Zwiń'" @click="settings.ytFolded = !settings.ytFolded"><Icon :name="settings.ytFolded ? 'right' : 'down'" /></button>
          <h2 class="desk-fold-title" @click="settings.ytFolded = !settings.ytFolded">YouTube</h2>
          <small v-if="yt.loggedIn" class="muted">{{ yt.channel }}</small>
          <span v-if="yt.loggedIn && signal.text" class="desk-badge" :class="signal.cls">{{ signal.text }}</span>
          <span class="spacer"></span>
          <button v-if="yt.loggedIn" class="small" :disabled="ytBusy" title="Odśwież" aria-label="Odśwież" @click="loadYt"><Icon name="refresh" /></button>
          <button v-if="yt.loggedIn && !liveOn" class="small" :disabled="ytBusy" title="Odłącz od kanału YouTube" aria-label="Odłącz od kanału YouTube" @click="ytLogout"><Icon name="logout" /></button>
        </div>
        <p v-if="ytError" class="note bad">{{ ytError }}</p>
        <!-- zwinięte: zostaje tylko start albo koniec transmisji -->
        <template v-if="settings.ytFolded && yt.loggedIn">
          <button v-if="liveOn" class="desk-stop" @click="stopLive">■ Zakończ transmisję</button>
          <button v-else class="desk-golive" :disabled="ytBusy || (engine === 'simple' && !settings.streamVideo)" @click="goLive"><i></i>Rozpocznij: {{ nextTitle }}</button>
        </template>
        <template v-else-if="!yt.loggedIn">
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
              <label title="Przepływność (bitrate) — ile danych na sekundę idzie do YouTube. Więcej = ostrzejszy obraz przy ruchu, ale potrzeba szybszego internetu (wysyłanie co najmniej 1,5× tyle).">Przepływność<select v-model.number="settings.streamKbps"><option :value="0">automatycznie ({{ (autoKbps / 1000).toLocaleString('pl') }} Mb/s)</option><option v-for="v in [3000, 4500, 6000, 8000, 10000, 12000]" :key="v" :value="v">{{ (v / 1000).toLocaleString('pl') }} Mb/s</option></select></label>
              <label>Jakość<select v-model="settings.streamQuality"><option value="1080">1080p · {{ hiFps ? '9' : '6,8' }} Mb/s</option><option value="720">720p · {{ hiFps ? '5' : '3,5' }} Mb/s (słabszy internet)</option></select></label>
              <label title="Tyle, ile wysyła ATEM: ATEM Software Control → Ustawienia → Standard wideo (np. 1080p50)">Klatki na sekundę<select v-model.number="settings.streamFps"><option :value="25">25</option><option :value="30">30</option><option :value="50">50</option><option :value="60">60</option></select></label>
              <label>Napisy pieśni<select v-model="settings.streamLyrics"><option value="local">z rzutnika na tym komputerze</option><option value="remote">z rzutnika na innym komputerze</option><option value="off">bez napisów</option></select></label>
            </fieldset>
            <label v-if="settings.streamLyrics === 'remote'" class="check" title="Cały ekran rzutnika z drugiego laptopa (sam obraz) — scena „Rzutnik” i „Rzutnik + kamera”. Na laptopie przy rzutniku: Ustawienia aplikacji → „Udostępniaj obraz rzutnika”."><input v-model="settings.screenRemote" type="checkbox"> Obraz rzutnika z tego komputera (przez sieć)</label>
            <input v-if="settings.streamLyrics === 'remote'" v-model="settings.streamLyricsKey" class="desk-lyr" placeholder="Adres napisów z drugiego komputera: Ustawienia aplikacji → Napisy → Przez internet → Kopiuj" aria-label="Adres napisów z drugiego komputera">
            <p v-if="liveOn" class="note">W trakcie transmisji ustawienia są zablokowane — źródło dźwięku zmienisz na pasku stanu nad podglądem.</p>
            <p class="note">Przepływność: YouTube zaleca dla 1080p 4,5–9 Mb/s (przy 50/60 kl./s górna część). Internet w kościele musi wysyłać ok. 1,5× tyle — sprawdź na speedtest.net („Upload”). Gdy YouTube pokazuje „słaby sygnał”, zmniejsz.</p>
            <p class="note">Klatki na sekundę ustaw tak jak w ATEM (ATEM Software Control → Ustawienia → Standard wideo, np. 1080p50 → 50).</p>
            <p v-if="engine === 'simple' && !devices.video.length && !String(settings.streamVideo).startsWith('screen:')" class="note bad">Nie widzę obrazu z ATEM — podłącz mikser po USB-C i <button class="linkbtn" @click="loadDevices">odśwież listę</button>.</p>
          </details>

          <details v-if="engine === 'studio'" class="desk-set">
            <summary>Plansza końcowa: wsparcie, YouTube, Spotify</summary>
            <div class="desk-grid">
              <label>Numer konta (26 cyfr)<input v-model="settings.donateAccount" inputmode="numeric" placeholder="np. 12 3456 7890 …" autocomplete="off"></label>
              <label>Telefon do BLIK<input v-model="settings.donatePhone" inputmode="tel" placeholder="np. 600 100 200" autocomplete="off"></label>
              <label>Odbiorca przelewu<input v-model="settings.donateName" autocomplete="off"></label>
              <label>Tytuł przelewu<input v-model="settings.donateTitle" autocomplete="off"></label>
            </div>
            <p v-if="!bankOk" class="note bad">Numer konta powinien mieć 26 cyfr (bez „PL”).</p>
            <p class="note">Z numerem konta na planszy jest kod QR przelewu — aplikacja banku po zeskanowaniu sama wypełnia odbiorcę, konto i tytuł (kwotę wpisuje osoba). BLIK na telefon nie ma kodu QR — numer telefonu jest pokazany dużym napisem. YouTube i Spotify: kody QR z linków „Posłuchaj” ze strony{{ studio.end.youtube || studio.end.spotify ? '' : ' (na stronie nie ma jeszcze linków)' }}.</p>
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
              <button class="small" :disabled="ytBusy || serviceStarted" :title="serviceStarted ? 'Godzina nabożeństwa już minęła — YouTube planuje tylko przyszłe transmisje' : 'Tworzy na kanale zapowiedź transmisji (YouTube Studio → Transmisje na żywo → Zaplanowane)'" @click="createForService"><Icon name="plus" />Zaplanuj</button>
            </div>
            <p class="note">„Zaplanuj” tworzy na kanale zapowiedź transmisji z tytułem i opisem z nabożeństwa — widzowie widzą ją wcześniej i mogą ustawić przypomnienie. W dniu nabożeństwa wybierasz ją w polu „Transmisja” i klikasz „Rozpocznij”.<template v-if="service && serviceStarted"> Godzina wybranego nabożeństwa już minęła, więc nie da się go zaplanować.</template></p>
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
      <slot name="side" />
      </template>
      </div>
    </div>

  </div>
</template>
