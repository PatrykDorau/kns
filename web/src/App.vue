<script lang="ts">
// @ts-nocheck — kod przeniesiony 1:1 z dawnego index.html; typy dochodzą stopniowo (podział na widoki i composables)
import { computed, defineComponent, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import { CONFIG } from '@/services/config'
import { provideApp } from '@/composables/useApp'
import BugsView from '@/views/BugsView.vue'
import BugReportDialog from '@/components/dialogs/BugReportDialog.vue'
import SideNav from '@/components/SideNav.vue'
import AccountBar from '@/components/AccountBar.vue'
import AppHeader from '@/components/AppHeader.vue'
import CameraCue from '@/components/CameraCue.vue'
import SongEditView from '@/views/SongEditView.vue'
import AnnouncementView from '@/views/AnnouncementView.vue'
import AnnouncementsView from '@/views/AnnouncementsView.vue'
import MaterialView from '@/views/MaterialView.vue'
import MaterialsView from '@/views/MaterialsView.vue'
import EventView from '@/views/EventView.vue'
import TemplateView from '@/views/TemplateView.vue'
import TemplatesView from '@/views/TemplatesView.vue'
import CalendarView from '@/views/CalendarView.vue'
import PeopleView from '@/views/PeopleView.vue'
import SongsView from '@/views/SongsView.vue'
import GoogleCalendarView from '@/views/GoogleCalendarView.vue'
import ServeView from '@/views/ServeView.vue'
import AsbPublicView from '@/views/AsbPublicView.vue'
import AsbView from '@/views/AsbView.vue'
import VotesView from '@/views/VotesView.vue'
import AskDialog from '@/components/dialogs/AskDialog.vue'
import { ask } from '@/utils/ask'
import { startUpdateCheck, updateReady } from '@/utils/updateCheck'
import ServicesView from '@/views/ServicesView.vue'
import AsbPreviewDialog from '@/components/dialogs/AsbPreviewDialog.vue'
import LiveEvent from '@/components/LiveEvent.vue'
import GoalsView from '@/views/GoalsView.vue'
import ListenView from '@/views/ListenView.vue'
import ProfileView from '@/views/ProfileView.vue'
import MoreView from '@/views/MoreView.vue'
import HomeView from '@/views/HomeView.vue'
import ServiceEditView from '@/views/ServiceEditView.vue'
import PublicListen from '@/components/PublicListen.vue'
import BandPickDialog from '@/components/dialogs/BandPickDialog.vue'
import AddPersonDialog from '@/components/dialogs/AddPersonDialog.vue'
import QrDialog from '@/components/dialogs/QrDialog.vue'
import MessageDialog from '@/components/dialogs/MessageDialog.vue'
import AsbMeetingDialog from '@/components/dialogs/AsbMeetingDialog.vue'
import InboxDialog from '@/components/dialogs/InboxDialog.vue'
import MinistryDialog from '@/components/dialogs/MinistryDialog.vue'
import TabBar from '@/components/TabBar.vue'
import { ACCEPT, createDemo, createDrive, fileType, uid } from '@/services/drive'
import { createApi, createDemoApi } from '@/services/api'
import { createSupa } from '@/services/supa'
import { CATEGORIES, COLORS, DEFAULT_TYPES, addMinutes, category, categoryName, setCategory, mergeTypes, offsetOf, programFrom, videoInfo, youtubeEmbed, spotifyEmbed } from '@/services/church'
const KIND = { image: 'Zdjęcie', video: 'Film', pdf: 'PDF', pptx: 'Prezentacja' }


const demo = new URLSearchParams(location.search).has('demo')
const clientId = CONFIG.clientId || ''
// Dane: baza Supabase (gdy wpisana w config.js) albo — jak dawniej — pliki na Dysku Google.
const CFG = CONFIG
const useSupa = !demo && !!CFG.supabaseUrl
const drive = demo ? createDemo() : useSupa ? createSupa(CFG) : createDrive(CFG)
// Konta (zatwierdzanie, rangi): baza albo serwer kont; bez żadnego z nich dostępu pilnuje sam Dysk.
const api = demo ? createDemoApi() : useSupa ? drive.api : createApi(CFG, drive)
// Zatwierdzony członek: następne logowanie od razu prosi też o Dysk (bez dodatkowego kroku).
const MEMBER_KEY = 'kns-member'
const isMember = email => { try { return !!email && localStorage.getItem(MEMBER_KEY) === email } catch { return false } }
const memberEmail = () => { try { return localStorage.getItem(MEMBER_KEY) || '' } catch { return '' } }
const setMember = email => { try { email ? localStorage.setItem(MEMBER_KEY, email) : localStorage.removeItem(MEMBER_KEY) } catch { /* tryb prywatny */ } }
const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')
const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const today = () => localDate(new Date())
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return localDate(d) }
const lines = text => String(text || '').replace(/^\[[^\]\s]{1,3}\]\s*/, '').trim().split('\n').filter(l => l.trim()).slice(0, 2).join(' / ')
const asDate = date => new Date((date || today()) + 'T12:00')
// Widoczna w stopce — po każdej zmianie strony rośnie, żeby było widać, że telefon ma nową wersję.
const VERSION = '3.01 · 19.10.2026'

/* ---------- Kamera ---------- */
// Operator streamu wysyła stan przez ntfy.sh (temat z config.js); telefon gra sygnał i potwierdza odbiór,
// żeby na komputerze było widać, ile telefonów ma aktualny sygnał.
const CUE_TEXT = { live: 'NA WIZJI', ready: 'PRZYGOTUJ SIĘ', off: 'POZA WIZJĄ' }
const TONES = { live: [[880, 0, .14], [880, .22, .14]], ready: [[660, 0, .28]], off: [[330, 0, .55]] }
const BUZZ = { live: [120, 80, 120], ready: [250], off: [500] }
const cueTopic = CONFIG.cueTopic || ''
const CUE_URL = 'https://ntfy.sh/' + cueTopic
let phoneId = ''
try { phoneId = localStorage.getItem('kns-phone') || ''; if (!phoneId) { phoneId = uid(); localStorage.setItem('kns-phone', phoneId) } } catch { phoneId = uid() }

function createCamera() {
  const cue = reactive({ state: 'off', net: '', online: false, sound: false })
  let source = null, audio = null, wake = null, ackTimer = 0
  const seen = new Set()
  function beep(freq, at, len) {
    const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime
    osc.frequency.value = freq
    gain.gain.setValueAtTime(.0001, t + at)
    gain.gain.exponentialRampToValueAtTime(.6, t + at + .02)
    gain.gain.exponentialRampToValueAtTime(.0001, t + at + len)
    osc.connect(gain).connect(audio.destination)
    osc.start(t + at); osc.stop(t + at + len + .05)
  }
  function signal(state) {
    if (audio) { audio.resume(); for (const t of TONES[state] || []) beep(...t) }
    if (navigator.vibrate) navigator.vibrate(BUZZ[state] || 0)
  }
  // Potwierdzenie tylko ostatniego odebranego sygnału (po połączeniu przychodzi naraz kilka starszych).
  function ack(id) {
    clearTimeout(ackTimer)
    ackTimer = setTimeout(() => fetch(CUE_URL + '-ok', { method: 'POST', body: JSON.stringify({ id, phone: phoneId }) }).catch(() => {}), 400)
  }
  function connect() {
    source?.close()
    cue.net = 'Łączenie…'; cue.online = false
    // since=1h: od razu przychodzi ostatni stan wysłany przez operatora.
    source = new EventSource(CUE_URL + '/sse?since=1h')
    source.onopen = () => { cue.net = 'Połączono — czekam na sygnał'; cue.online = true }
    source.onerror = () => { cue.net = navigator.onLine ? 'Brak połączenia — próbuję ponownie…' : 'Brak internetu — próbuję ponownie…'; cue.online = false }
    source.onmessage = e => {
      let msg, body
      try { msg = JSON.parse(e.data) } catch { return }
      const tags = msg.tags || []
      body = { state: tags.find(t => CUE_TEXT[t]), quiet: tags.includes('quiet') }
      if (msg.event !== 'message' || seen.has(msg.id) || !CUE_TEXT[body.state]) return
      seen.add(msg.id)
      cue.state = body.state
      cue.online = true
      cue.net = 'Połączono · ostatni sygnał o ' + new Date(msg.time * 1000).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
      // Starsze (odtworzone po połączeniu) i „ciche” zmiany tylko widać, bez dźwięku.
      if (!body.quiet && Date.now() / 1000 - msg.time < 15) signal(body.state)
      ack(msg.id)
    }
  }
  async function keepAwake() { try { wake = await navigator.wakeLock?.request('screen') } catch { /* niedostępne */ } }
  function open() {
    if (!cueTopic) return
    document.body.classList.add('locked')
    connect()
    keepAwake()
  }
  function close() {
    // Komputer przestaje liczyć ten telefon.
    if (source) fetch(CUE_URL + '-ok', { method: 'POST', body: JSON.stringify({ phone: phoneId, bye: true }) }).catch(() => {})
    source?.close(); source = null
    wake?.release().catch(() => {}); wake = null
    document.body.classList.remove('locked')
  }
  function enableSound() {
    audio = new (window.AudioContext || window.webkitAudioContext)()
    beep(660, 0, .12)
    cue.sound = true
    keepAwake()
  }
  // Po powrocie do aplikacji: ekran znów nie gaśnie, a zerwane połączenie wraca.
  function resume() {
    if (!source) return
    keepAwake()
    if (source.readyState === EventSource.CLOSED) connect()
  }
  return { cue, open, close, enableSound, resume }
}
// Godzina i miejsce nabożeństwa — domyślnie zawsze 12:12, Hotel Forza (tak samo jak na komputerze).
const DEFAULT_TIME = '12:12', DEFAULT_PLACE = 'Hotel Forza'
const startsAt = s => new Date(s.date + 'T' + (s.time || DEFAULT_TIME)).getTime()
const two = n => String(n).padStart(2, '0')
const byNumber = (a, b) => ((+a.number || 1e9) - (+b.number || 1e9)) || a.title.localeCompare(b.title, 'pl')

export default defineComponent({
  components: { BugsView, BugReportDialog, SideNav, AccountBar, AppHeader, CameraCue, SongEditView, AnnouncementView, AnnouncementsView, MaterialView, MaterialsView, EventView, TemplateView, TemplatesView, CalendarView, PeopleView, SongsView, GoogleCalendarView, ServeView, AsbPublicView, AsbView, VotesView, ServicesView, GoalsView, ListenView, ProfileView, MoreView, HomeView, ServiceEditView, PublicListen, BandPickDialog, AddPersonDialog, QrDialog, MessageDialog, AsbMeetingDialog, AsbPreviewDialog, LiveEvent, AskDialog, InboxDialog, MinistryDialog, TabBar },
  setup() {
    const ready = ref(false), busy = ref(false), error = ref(''), status = ref('')
    // Zapamiętane logowanie: do wczytania danych szkielet strony zamiast ekranu logowania.
    const booting = ref(!demo && !!clientId && !!memberEmail())
    const services = ref([]), songs = ref([])
    const svcListView = ref(false) // lista nabożeństw (zaplanowane, wolne niedziele, minione)
    const current = ref(null), saved = ref(''), query = ref(''), picking = ref(false), confirmDelete = ref(false)
    const showPast = ref(false), offline = ref(!navigator.onLine)
    const cam = createCamera()
    const camera = ref(false)
    function openCamera() {
      if (!canCamera.value) return
      camera.value = true
      history.replaceState(null, '', '#kamera')
      cam.open()
    }
    function closeCamera() {
      camera.value = false
      history.replaceState(null, '', location.pathname + location.search)
      cam.close()
    }
    // Skrót „Kamera” (przytrzymanie ikony aplikacji) otwiera ten ekran od razu po zalogowaniu (tylko służba techniczna).
    watch(ready, on => { if (on && location.hash === '#kamera' && cueTopic) openCamera() })
    let base = 0 // znacznik wersji nabożeństwa w chwili otwarcia — do wykrywania równoczesnej edycji

    const pretty = date => (date ? asDate(date).toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'bez daty')
    const day = date => asDate(date).getDate()
    const month = date => asDate(date).toLocaleDateString('pl', { month: 'short' }).replace('.', '')
    const weekday = date => asDate(date).toLocaleDateString('pl', { weekday: 'long' })
    const wd = date => asDate(date).toLocaleDateString('pl', { weekday: 'short' }).replace('.', '')
    const relDay = date => {
      const days = Math.round((asDate(date) - asDate(today())) / 86400000)
      return days === 0 ? 'dziś' : days === 1 ? 'jutro' : days === -1 ? 'wczoraj' : days > 0 ? `za ${days} dni` : `${-days} dni temu`
    }
    const missing = svc => [
      ...[['sermonTitle', 'tytuł kazania'], ['passage', 'fragment'], ['speaker', 'mówca']].filter(([k]) => !String(svc[k] || '').trim()).map(([, n]) => n),
      ...(svc.songs?.length ? [] : ['pieśni']),
    ]
    const upcoming = svc => svc.date >= today()
    // Nadchodzące od najbliższego; wcześniejsze schowane, od najnowszego.
    const coming = computed(() => services.value.filter(upcoming).sort((a, b) => a.date.localeCompare(b.date)))
    const past = computed(() => services.value.filter(s => !upcoming(s)).sort((a, b) => b.date.localeCompare(a.date)))
    const shown = computed(() => (showPast.value ? [...coming.value, ...past.value] : coming.value))
    // Stan najbliższej niedzieli — na samej górze listy.
    const alert = computed(() => {
      const date = nextSunday(), short = pretty(date).replace(/^niedziela, /, '')
      const service = services.value.find(s => s.date === date)
      if (!service) return { date, title: 'Brak nabożeństwa', text: `Na niedzielę ${short} nic jeszcze nie zaplanowano.` }
      const m = missing(service)
      return m.length
        ? { service, title: 'Nabożeństwo niekompletne', text: `Niedziela ${short} — brakuje:`, missing: m }
        : { good: true, title: 'Wszystko gotowe', text: `Nabożeństwo na niedzielę ${short} jest kompletne.` }
    })
    const dirty = computed(() => !!current.value && JSON.stringify(current.value) !== saved.value)
    // Odliczanie do najbliższego nabożeństwa (do 2 godzin po rozpoczęciu — „trwa”).
    // Strona startowa (na szerokim ekranie — układ aplikacji na komputer).
    const homeWide = computed(() => ready.value && !current.value && !song.value && !camera.value && !currentEvent.value && !tplView.value && !currentProto.value && !protoView.value && !currentAnn.value && !annView.value && !calView.value && !moreView.value && !songView.value && !peopleView.value && !gcalView.value && !profileView.value && !serveView.value && !listenView.value && !asbView.value && !goalsView.value && !votesView.value && !svcListView.value)
    const showTabs = computed(() => (demo || !!clientId || useSupa) && !current.value && !song.value && !camera.value && !currentEvent.value && !tplView.value && !currentProto.value && !protoView.value && !currentAnn.value && !annView.value && ready.value)
    const now = ref(Date.now())
    setInterval(() => { now.value = Date.now() }, 1000)
    let cachedTimes = []
    try { cachedTimes = JSON.parse(localStorage.getItem('kns-times') || '[]') } catch { /* brak zapisu */ }
    const countdown = computed(() => {
      const sunday = d => { const x = asDate(d); x.setDate(x.getDate() + 7); return localDate(x) }
      const times = services.value.length ? services.value : cachedTimes.length ? cachedTimes
        : [{ date: nextSunday() }, { date: sunday(nextSunday()) }]
      const next = times.filter(s => s.date && startsAt(s) + 3 * 3600e3 > now.value).sort((a, b) => startsAt(a) - startsAt(b))[0]
      if (!next) return null
      const sec = Math.floor(Math.max(0, startsAt(next) - now.value) / 1000)
      return { live: sec === 0, days: Math.floor(sec / 86400), hours: two(Math.floor(sec / 3600) % 24), minutes: two(Math.floor(sec / 60) % 60), seconds: two(sec % 60),
        when: pretty(next.date) + ', ' + (next.time || DEFAULT_TIME), place: next.place || DEFAULT_PLACE }
    })
    const songTitle = s => (s.number ? s.number + '. ' : '') + s.title
    const sameSong = e => s => s.title === e.title && (s.number || '') === (e.number || '')
    const inBase = entry => songs.value.some(sameSong(entry))
    const firstLine = entry => lines(songs.value.find(sameSong(entry))?.text) || 'Tej pieśni nie ma w bazie'
    const chosen = song => current.value?.songs.some(sameSong(song))
    // Podpowiedzi: bez wpisanego tekstu cała baza po numerach, z tekstem — najpierw numer i tytuł, potem treść.
    const results = computed(() => {
      const q = plain(query.value.trim())
      const all = [...songs.value].sort(byNumber)
      if (!q) return all
      const byTitle = all.filter(s => s.number === q || plain(s.title).includes(q))
      return [...byTitle, ...all.filter(s => !byTitle.includes(s) && plain(s.text).includes(q))]
    })

    async function guard(job) {
      busy.value = true; error.value = ''
      try { await job() } catch (e) {
        error.value = e.message || String(e)
        if (e.auth) { ready.value = false; current.value = null; gate.value = '' }
      } finally { busy.value = false }
    }
    /* ---------- konto i rangi ---------- */
    // gate: '' (w aplikacji albo niezalogowany), 'pending', 'rejected', 'approved' (zatwierdzony, brak dostępu do Dysku)
    const me = ref(null), ranks = ref([]), gate = ref('')
    const hasFlag = flag => !api.enabled || (me.value?.roles || []).some(r => ranks.value.some(x => x.id === r && x[flag]))
    const canEdit = computed(() => hasFlag('edit'))
    const canManage = computed(() => api.enabled && hasFlag('manage'))
    // Kamera (sygnały dla kamerzysty) — tylko służba techniczna i administrator.
    const canCamera = computed(() => !api.enabled || (me.value?.status === 'active' && ((me.value.roles || []).includes('technika') || hasFlag('manage'))))
    const myRanks = computed(() => (me.value?.roles || []).map(r => ranks.value.find(x => x.id === r)?.name).filter(Boolean).join(', '))
    // Po zalogowaniu: kim jestem dla serwera; zatwierdzony z dostępem do Dysku od razu wchodzi do aplikacji.
    async function enter() {
      const data = drive.hasDrive() ? fetchAll().then(() => null, e => e) : null
      const res = await api.call('me')
      me.value = res.person; ranks.value = res.ranks || []
      if (res.person.status !== 'active') { setMember(''); gate.value = res.person.status === 'rejected' ? 'rejected' : 'pending'; ready.value = false; return }
      setMember(res.person.email)
      if (!data) { gate.value = 'approved'; return }
      const failed = await data
      if (failed) throw failed
      gate.value = ''; ready.value = true
      if (canManage.value) loadPeople()
    }
    const recheck = () => guard(enter)
    const continueToDrive = () => guard(async () => { await drive.signIn(false, 'drive'); await enter() })
    const fetchAll = async () => {
      const data = await drive.load()
      services.value = data.services.map(s => withBand({ band: '', notes: '', songs: [], files: [], ...s }))
      // Terminy na odliczanie przed zalogowaniem (ekran logowania).
      try { localStorage.setItem('kns-times', JSON.stringify(services.value.filter(s => s.date >= today()).map(({ date, time, place }) => ({ date, time, place })))) } catch { /* tryb prywatny */ }
      songs.value = data.songs
      const allEvents = (data.events || []).map(e => ({ type: 'inne', title: '', time: '', place: '', description: '', program: [], ...e }))
      events.value = allEvents.filter(e => e.status !== 'pending'); pendingEvents.value = allEvents.filter(e => e.status === 'pending')
      types.value = mergeTypes(data.templates); typesBase = data.templatesUpdated || 0
      announcements.value = (data.announcements || []).filter(a => a.status !== 'pending'); pendingAnns.value = (data.announcements || []).filter(a => a.status === 'pending')
      if (api.enabled) { setTimeout(loadInbox); setTimeout(loadSeenAnns); setTimeout(loadGoals) } // po ustawieniu „ready”
    }
    // Z serwerem kont nowa osoba loguje się najpierw samą tożsamością — o Dysk pytamy dopiero po zatwierdzeniu.
    const start = (choose = false) => guard(async () => {
      if (choose) drive.forget()
      if (!api.enabled) { await drive.signIn(choose); await fetchAll(); ready.value = true; return }
      // Po wylogowaniu adres konta jest zapomniany — wtedy liczy się, czy na tym telefonie był już zatwierdzony członek.
      const member = drive.account() ? isMember(drive.account()) : !!memberEmail()
      await drive.signIn(choose, member && !choose ? 'drive' : 'identity')
      await enter()
    })
    // Konto bez dostępu do folderu: zapominamy je i od razu pokazujemy wybór konta.
    const otherAccount = () => { gate.value = ''; me.value = null; return start(true) }
    const appUrl = CONFIG.appUrl || 'https://kns-nabo.netlify.app'
    const origin = location.origin
    // Logowanie przez bazę (Supabase) działa też pod innymi dozwolonymi adresami — ostrzeżenie tylko dla logowania wprost przez Google.
    const wrongOrigin = !demo && !useSupa && origin !== new URL(appUrl).origin
    const reload = () => guard(fetchAll)
    async function logout() {
      // telefon przestaje dostawać powiadomienia dla tego konta (po zalogowaniu na inne — przejdzie na nie)
      if (push.on && api.enabled && drive.removePush) await Promise.race([drive.removePush(pushId).catch(() => {}), new Promise(r => setTimeout(r, 1500))])
      drive.signOut()
      ready.value = false; services.value = []; current.value = null
      gate.value = ''; me.value = null; people.value = []; try { localStorage.removeItem('kns-photos') } catch { /* bez pamięci */ } peopleView.value = false; annView.value = false; currentAnn.value = null
      currentProto.value = null; protoView.value = false; currentEvent.value = null; tplView.value = false; tplType.value = null; calView.value = false
    }
    /* ---------- przeniesienie danych z Dysku do bazy (administrator, jednorazowo) ---------- */
    const migrating = ref(''), migrated = ref('')
    async function migrate() {
      if (!(await ask('Przenieść dane z plików na Dysku Google do bazy? Google zapyta o konto z dostępem do folderu „Aplikacja KNS Nabo”.'))) return
      migrating.value = 'Łączę…'; migrated.value = ''; error.value = ''
      try {
        const c = await drive.migrateFromDrive(step => { migrating.value = step })
        migrated.value = `Przeniesiono: nabożeństwa ${c.services}, pieśni ${c.songs}, wydarzenia ${c.events}, szablony ${c.templates}, ogłoszenia ${c.announcements}, protokoły ${c.protocols}.`
        await fetchAll()
      } catch (e) { error.value = e.message } finally { migrating.value = '' }
    }
    /* ---------- osoby (administrator) ---------- */
    const peopleView = ref(false), people = ref([]), peopleBusy = ref(false)
    const withDraft = p => ({ ...p, draft: p.status === 'pending' && !p.roles.length ? ['czlonek'] : [...p.roles], busy: false, error: '' })
    // wyszukiwanie osób (imię, e-mail), filtr rangi; edycja rang jednej osoby naraz (lista z wyszukiwaniem)
    const peopleUi = reactive({ query: '', rank: '', open: '', rankQuery: '' })
    const peopleMatch = p => {
      const q = plain(peopleUi.query.trim())
      return (!q || plain((p.name || '') + ' ' + p.email).includes(q)) && (!peopleUi.rank || p.roles.includes(peopleUi.rank))
    }
    const rankName = id => ranks.value.find(r => r.id === id)?.name || id
    const ranksShown = computed(() => { const q = plain(peopleUi.rankQuery.trim()); return ranks.value.filter(r => !q || plain(r.name).includes(q)) })
    function openRanks(p) { peopleUi.open = peopleUi.open === p.email ? '' : p.email; peopleUi.rankQuery = '' }
    function cancelRanks(p) { p.draft = [...p.roles]; peopleUi.open = '' }
    const peopleGroups = computed(() => [
      { id: 'pending', title: 'Czekają na zatwierdzenie', list: people.value.filter(p => p.status === 'pending' && peopleMatch(p)).sort((a, b) => b.requested - a.requested) },
      { id: 'active', title: 'Członkowie', list: people.value.filter(p => p.status === 'active' && peopleMatch(p)).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'pl')) },
      { id: 'rejected', title: 'Bez dostępu', list: people.value.filter(p => p.status === 'rejected' && peopleMatch(p)) },
    ].filter(g => g.list.length))
    const pendingCount = computed(() => people.value.filter(p => p.status === 'pending').length)
    const initials = p => (p.name || p.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    const ago = t => { const h = Math.round((Date.now() - t) / 3600e3); return h < 1 ? 'przed chwilą' : h < 24 ? h + ' godz. temu' : Math.round(h / 24) + ' dni temu' }
    const rolesChanged = p => [...p.draft].sort().join() !== [...p.roles].sort().join()
    function toggleRank(p, id) { p.draft = p.draft.includes(id) ? p.draft.filter(r => r !== id) : [...p.draft, id] }
    async function loadPeople() {
      peopleBusy.value = true
      try { const res = await api.call('people'); people.value = res.people.map(withDraft); ranks.value = res.ranks || ranks.value } catch (e) { error.value = e.message } finally { peopleBusy.value = false }
    }
    function openPeople() { songView.value = false; calView.value = false; peopleView.value = true; scrollTo(0, 0); loadPeople() }
    async function setPerson(p, status) {
      if (status === 'rejected' && p.status === 'active' && !(await ask(`Odebrać dostęp osobie ${p.name || p.email}? Straci dostęp do folderów aplikacji na Dysku.`))) return
      p.busy = true; p.error = ''
      try {
        const res = await api.call('setPerson', { email: p.email, ...(status ? { status } : {}), roles: status === 'rejected' ? p.roles : p.draft })
        Object.assign(p, withDraft(res.person))
        if (p.email === me.value?.email) me.value = res.person
      } catch (e) { p.error = e.message } finally { p.busy = false }
    }

    function open(svc) {
      songView.value = false; peopleView.value = false; calView.value = false; song.value = null; fromCal = false
      current.value = { time: DEFAULT_TIME, place: DEFAULT_PLACE, program: [], ...JSON.parse(JSON.stringify(svc)) }
      if (!current.value.program.length) current.value.program = programFrom(typeOf('nabozenstwo'), uid) // program od razu z szablonu
      saved.value = JSON.stringify(current.value)
      base = svc.updated || 0
      query.value = ''; status.value = ''; confirmDelete.value = false; picking.value = false
      svcEditing.value = false
      scrollTo(0, 0)
    }
    const svcEditing = ref(false) // podgląd albo edycja otwartego nabożeństwa
    // Na jeden dzień jest jedno nabożeństwo: „nowe” na zajęty dzień otwiera istniejące.
    function create(date) {
      const day = typeof date === 'string' ? date : nextSunday()
      const existing = services.value.find(s => s.date === day)
      if (existing) { open(existing); status.value = 'Na ten dzień jest już nabożeństwo — otwarto je.'; return }
      const tpl = typeOf('nabozenstwo')
      open({ id: uid(), date: day, time: tpl.time || DEFAULT_TIME, place: tpl.place || DEFAULT_PLACE, program: programFrom(tpl, uid), sermonTitle: '', passage: '', speaker: '', band: '', bandList: [], notes: '', songs: [], files: [], createdBy: drive.account() || 'telefon' })
      saved.value = '' // nowe nabożeństwo od razu jest „do zapisania”
      svcEditing.value = true
    }
    const fix = () => { if (alert.value.service) { open(alert.value.service); svcEditing.value = true } else create(alert.value.date) }
    async function back() {
      if (dirty.value && !(await ask('Masz niezapisane zmiany. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return
      // z edycji zapisanego nabożeństwa — wracamy do podglądu
      const savedSvc = svcEditing.value && services.value.find(x => x.id === current.value.id)
      if (savedSvc) { const cal = fromCal; open(savedSvc); fromCal = cal; return }
      current.value = null
      if (fromCal) { fromCal = false; calView.value = true }
    }
    /* ---------- baza pieśni ---------- */
    const songView = ref(false), song = ref(null), songQuery = ref('')
    let songSaved = '', songBase = 0
    const songResults = computed(() => {
      const q = plain(songQuery.value.trim())
      const all = [...songs.value].sort(byNumber)
      if (!q) return all
      const byTitle = all.filter(s => s.number === q || plain(s.title).includes(q))
      return [...byTitle, ...all.filter(s => !byTitle.includes(s) && plain(s.text).includes(q))]
    })
    const songDirty = computed(() => !!song.value && JSON.stringify(song.value) !== songSaved)
    const slideCount = computed(() => String(song.value?.text || '').split(/\n\s*\n/).filter(x => x.trim()).length)
    const numberTaken = computed(() => song.value?.number?.trim() && songs.value.find(s => s.id !== song.value.id && s.number === song.value.number.trim()))
    // Pasek konta → strona startowa: zamyka otwarte edytory i listy (z pytaniem o niezapisane zmiany).
    async function closeAll() {
      if ((current.value && dirty.value) || (currentEvent.value && eventDirty.value) || (currentAnn.value && annDirty.value)) {
        if (!(await ask('Masz niezapisane zmiany. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return false
      }
      current.value = null; song.value = null; currentEvent.value = null; currentProto.value = null; currentAnn.value = null
      tplType.value = null; tplView.value = false; protoView.value = false; annView.value = false
      return true
    }
    // Boczny pasek (szeroki ekran): części aplikacji w grupach; aktywna — podświetlona.
    // Tryb jasny/ciemny (domyślnie ciemny) — zapamiętany na tym urządzeniu.
    const theme = ref(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
    function toggleTheme() {
      theme.value = theme.value === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = theme.value
      try { localStorage.setItem('kns-theme', theme.value) } catch { /* tryb prywatny */ }
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.value === 'light' ? '#f5efe6' : '#0f1013')
    }
    if (theme.value === 'light') document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#f5efe6')
    // Ilustracje w karcie najbliższego nabożeństwa — zmieniają się co 9 s (płynnie).
    // Karta najbliższego nabożeństwa: zdjęcia z ostatniego nabożeństwa (z Dysku, przez skrypt Google), a bez nich — ilustracje.
    const ILLUSTRATIONS = ['swit.svg', 'pole.svg', 'jezioro.svg', 'noc.svg']
    // Lista zdjęć z linkami (ważne godzinę) zapamiętana na 50 minut — po odświeżeniu zdjęcia są od razu, bez mignięcia
    // ilustracji; bez zapamiętanej listy karta czeka chwilę na zdjęcia (najwyżej 3 s), zanim pokaże ilustracje.
    const PHOTOS_KEY = 'kns-photos'
    const cachedPhotos = (() => { try { const c = JSON.parse(localStorage.getItem(PHOTOS_KEY) || 'null'); return c && Date.now() - c.at < 50 * 60e3 ? c.data : null } catch { return null } })()
    const photos = ref(cachedPhotos) // { urls, date, count }
    const photosPending = ref(!cachedPhotos)
    setTimeout(() => { photosPending.value = false }, 3000)
    const HERO_ART = computed(() => (photos.value?.urls?.length ? photos.value.urls : photosPending.value ? [] : ILLUSTRATIONS))
    const heroIsPhoto = computed(() => !!photos.value?.urls?.length)
    async function loadPhotos() {
      if (!api.enabled || !drive.servicePhotos) { photosPending.value = false; return }
      try {
        const p = await drive.servicePhotos()
        const same = JSON.stringify(p?.files || null) === JSON.stringify(photos.value?.files || null)
        if (!same || !photos.value) { photos.value = p; heroArt.value = 0 } else photos.value = p
        try { localStorage.setItem(PHOTOS_KEY, JSON.stringify({ at: Date.now(), data: p })) } catch { /* bez zapamiętania */ }
      } catch { /* zostają ilustracje */ } finally { photosPending.value = false }
    }
    watch(ready, r => { if (r) loadPhotos() })
    setInterval(() => { if (ready.value) loadPhotos() }, 50 * 60e3) // linki ważne godzinę
    const heroArt = ref(0)
    let heroHold = 0 // po ręcznym przewinięciu chwila przerwy w automatycznej zmianie
    setInterval(() => { if (!document.hidden && Date.now() > heroHold) heroArt.value = (heroArt.value + 1) % HERO_ART.value.length }, 9000)
    function heroStep(d) { heroArt.value = (heroArt.value + d + HERO_ART.value.length) % HERO_ART.value.length; heroHold = Date.now() + 20000 }
    const mapLink = place => (/^(online|zoom|teams|meet)\b/i.test(String(place).trim()) ? null : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place))
    const sideNav = computed(() => {
      const tech = canCamera.value
      return [
        { title: '', items: [
          { id: 'home', icon: 'church', name: 'Start' },
          { id: 'cal', icon: 'calendar', name: 'Kalendarz' },
          { id: 'svc', icon: 'book', name: 'Nabożeństwa', badge: canEdit.value && nextService.value && missing(nextService.value).length ? '!' : '' }, // każdy członek: lista i podgląd; plan i edycja — z prawem edycji
          { id: 'anns', icon: 'megaphone', name: 'Ogłoszenia', badge: activeAnns.value.filter(annIsNew).length || '' },
        ] },
        ...(api.enabled ? [{ title: 'Wspólnota', items: [
          { id: 'serve', icon: 'serve', name: 'Zaangażuj się' },
          ...(serve.list.some(m => m.mine === 'active' || m.leader) || canManage.value || canAsb.value ? [{ id: 'myserve', icon: 'users', name: 'Moja służba' }] : []),
          { id: 'goals', icon: 'money', name: 'Cele wsparcia', badge: goalDue.value ? '!' : '' },
          { id: 'votes', icon: 'check', name: 'Głosowania', badge: votesOpen.value || '' },
          { id: 'listen', icon: 'music', name: 'Posłuchaj' },
        ] }] : []),
        { title: 'Narzędzia', items: [
          ...(inApp && tech ? [{ id: 'display', icon: 'monitor', name: 'Rzutnik' }, { id: 'stream', icon: 'camera', name: 'Stream' }] : []),
          { id: 'songs', icon: 'music', name: 'Pieśni' },
          { id: 'mats', icon: 'list', name: 'Materiały' },
          ...(canEdit.value ? [{ id: 'tpl', icon: 'file', name: 'Szablony' }] : []),
          ...(canManage.value ? [{ id: 'people', icon: 'user', name: 'Osoby', badge: pendingCount.value || '' }] : []),
          ...(canMsg.value ? [{ id: 'msg', icon: 'mail', name: 'Wyślij wiadomość' }] : []),
          ...(cueTopic && tech && !inApp ? [{ id: 'camera', icon: 'camera', name: 'Kamera (sygnały)' }] : []),
          { id: 'bugs', icon: 'alert', name: canManage.value || (me.value?.roles || []).includes('dev') ? 'Zgłoszenia (backlog)' : 'Moje zgłoszenia' },
        ] },
      ]
    })
    function navOn(id) {
      const editor = current.value || currentEvent.value || currentAnn.value || currentProto.value || song.value || tplType.value
      const other = calView.value || gcalView.value || annView.value || protoView.value || tplView.value || songView.value || peopleView.value || profileView.value || serveView.value || listenView.value || asbView.value || goalsView.value || votesView.value || svcListView.value || moreView.value
      return {
        home: !editor && !other, cal: (!!currentEvent.value || calView.value || gcalView.value) && !current.value, svc: !!current.value || (svcListView.value && !currentEvent.value), anns: annView.value || !!currentAnn.value,
        serve: (serveView.value && serveTab.value === 'all') || (asbView.value && !canAsb.value), myserve: (serveView.value && serveTab.value === 'mine') || (asbView.value && canAsb.value), goals: goalsView.value, votes: votesView.value, bugs: bugsView.value, listen: listenView.value, asb: asbView.value,
        songs: songView.value || !!song.value, mats: (protoView.value || !!currentProto.value) && !currentEvent.value, tpl: tplView.value || !!tplType.value, people: peopleView.value, profile: profileView.value,
      }[id] || false
    }
    async function navTo(id) {
      if (id === 'display' || id === 'stream') { window.knsDesktop?.open(id); return }
      if (id === 'msg') { openMsg(); return }
      if (id === 'camera') { openCamera(); return }
      if (id === 'bugs') { openBugs(); return }
      if (!(await closeAll())) return
      resetViews()
      if (id === 'cal') openCalendar()
      else if (id === 'svc') openServices()
      else if (id === 'anns') openAnns()
      else if (id === 'serve') openServe()
      else if (id === 'myserve') openServe('mine')
      else if (id === 'goals') openGoals()
      else if (id === 'votes') openVotes()
      else if (id === 'listen') openListen()
      else if (id === 'asb') openAsb()
      else if (id === 'songs') openSongs()
      else if (id === 'mats') openProtocols()
      else if (id === 'tpl') openTemplates()
      else if (id === 'people') openPeople()
      else if (id === 'profile') openProfile()
      else showServices()
      scrollTo(0, 0)
    }
    function showServices() { serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; svcListView.value = false; votesView.value = false; bugsView.value = false; profileView.value = false; songView.value = false; peopleView.value = false; calView.value = false; moreView.value = false; gcalView.value = false; scrollTo(0, 0) }
    function openSongs() { songView.value = true; peopleView.value = false; calView.value = false; songQuery.value = ''; scrollTo(0, 0) }
    function openSong(s) {
      song.value = { id: s.id, number: s.number || '', title: s.title, text: s.text || '' }
      songSaved = JSON.stringify(song.value); songBase = s.updated || 0
      status.value = ''; confirmDelete.value = false; scrollTo(0, 0)
    }
    function newSong() {
      song.value = { id: uid(), number: '', title: '', text: '', isNew: true }
      songSaved = ''; songBase = 0; status.value = ''; confirmDelete.value = false
    }
    async function closeSong() {
      if (songDirty.value && song.value.title.trim() && !(await ask('Masz niezapisane zmiany w pieśni. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return
      song.value = null
    }
    const saveSong = (force = false) => guard(async () => {
      const { isNew, ...data } = song.value
      data.number = data.number.trim(); data.title = data.title.trim()
      try {
        songs.value = await drive.saveSongs({ song: data }, songBase, force === true)
      } catch (e) {
        if (!e.conflict) throw e
        if (!(await ask('Ktoś inny zmienił tę pieśń, odkąd ją otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowszą wersję.'))) { openSong(e.remote); status.value = 'Wczytano najnowszą wersję'; return }
        songs.value = await drive.saveSongs({ song: data }, songBase, true)
      }
      const fresh = songs.value.find(s => s.id === data.id)
      openSong(fresh || data)
      status.value = 'Zapisano o ' + new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }) + ' — komputery pobiorą zmianę przy synchronizacji'
    })
    const deleteSong = () => guard(async () => {
      songs.value = await drive.saveSongs({ remove: song.value.id })
      song.value = null
    })

    // Dotknięcie pieśni dodaje ją albo — gdy już jest — zdejmuje; lista zostaje otwarta, żeby wybrać kilka.
    // Harmonogram: kazanie w pierwszym punkcie „Kazanie”, pieśni w punktach „Uwielbienie” (pieśń pamięta swój punkt).
    const programSorted = computed(() => [...(current.value?.program || [])].sort((a, b) => a.offset - b.offset))
    const sermonSlot = computed(() => programSorted.value.find(p => p.category === 'kazanie')?.key || '')
    const songSlots = computed(() => programSorted.value.filter(p => p.category === 'uwielbienie').map(p => p.key))
    const slotOf = entry => (songSlots.value.includes(entry.slot) ? entry.slot : songSlots.value[0])
    const songsIn = key => (current.value?.songs || []).filter(e => slotOf(e) === key)
    // Kolejność pieśni dla rzutnika = kolejność w harmonogramie.
    function orderSongs() {
      const rank = key => songSlots.value.indexOf(key)
      const list = current.value.songs
      const sorted = list.map((e, i) => [e, i]).sort((a, b) => rank(slotOf(a[0])) - rank(slotOf(b[0])) || a[1] - b[1]).map(x => x[0])
      list.splice(0, list.length, ...sorted)
    }
    const songSheet = ref(false), songSheetSlot = ref('')
    function pickSongsFor(key) { songSheetSlot.value = key; query.value = ''; songSheet.value = true }
    function addSong(song, slot = '') {
      const list = current.value.songs
      const at = list.findIndex(sameSong(song))
      if (at >= 0) list.splice(at, 1)
      else list.push({ key: uid(), songId: null, title: song.title, number: song.number || '', ...(slot ? { slot } : {}) })
      if (slot) orderSongs()
    }
    function removeSong(entry) { const list = current.value.songs; list.splice(list.indexOf(entry), 1) }
    function moveIn(key, entry, by) {
      const list = current.value.songs, inSlot = songsIn(key), i = inSlot.indexOf(entry), other = inSlot[i + by]
      if (!other) return
      const a = list.indexOf(entry), b = list.indexOf(other)
      list.splice(a, 1, other); list.splice(b, 1, entry)
    }
    function move(i, by) { const list = current.value.songs; list.splice(i + by, 0, ...list.splice(i, 1)) }

    const save = (force = false) => guard(async () => {
      const svc = current.value
      if (services.value.some(s => s.id !== svc.id && s.date === svc.date) &&
          !(await ask('Na ten dzień jest już inne nabożeństwo. Zapisać mimo to? Komputer połączy je w jedno.'))) return
      svc.updatedBy = drive.account() || 'telefon'
      // Teksty pieśni jadą razem z nabożeństwem — komputer, który ich nie ma, dopisze je do swojej bazy.
      const texts = svc.songs.map(e => songs.value.find(sameSong(e))).filter(Boolean).map(({ number, title, text }) => ({ number: number || '', title, text }))
      const payload = { service: { ...JSON.parse(JSON.stringify(svc)), updated: Date.now(), shared: true }, songs: texts }
      try {
        await drive.save(payload, base, force === true)
      } catch (e) {
        if (!e.conflict) throw e
        // Ktoś (inny telefon albo komputer) zapisał to nabożeństwo, odkąd je otwarto.
        if ((await ask('Ktoś inny zmienił to nabożeństwo, odkąd je otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowszą wersję.'))) {
          await drive.save(payload, base, true)
        } else {
          await fetchAll()
          const fresh = services.value.find(s => s.id === svc.id)
          if (fresh) open(fresh)
          status.value = 'Wczytano najnowszą wersję'
          return
        }
      }
      svc.updated = payload.service.updated
      svc.shared = true
      base = svc.updated
      const i = services.value.findIndex(s => s.id === svc.id)
      const copy = JSON.parse(JSON.stringify(svc))
      if (i >= 0) services.value[i] = copy
      else services.value.push(copy)
      saved.value = JSON.stringify(svc)
      status.value = 'Zapisano o ' + new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
    })
    // Załączniki: plik trafia od razu do folderu nabożeństwa na Dysku, a do nabożeństwa — po „Zapisz”.
    const uploading = ref(''), progress = ref(0)
    const picker = ref(false), pickQuery = ref(''), pickFound = ref([]), pickBusy = ref(false)
    async function attach(label, job) {
      uploading.value = label; progress.value = 0; error.value = ''
      try {
        const file = await job(p => { progress.value = p })
        current.value.files.push(file)
        status.value = 'Dodano załącznik — zapisz nabożeństwo'
      } catch (e) {
        error.value = e.message || String(e)
        if (e.auth) { ready.value = false; current.value = null }
      } finally { uploading.value = '' }
    }
    async function fromPhone(e) {
      const chosen = [...e.target.files]
      e.target.value = ''
      for (const f of chosen) {
        if (!fileType(f.type, f.name)) { error.value = `„${f.name}” — można dodać tylko zdjęcie, film, PDF albo prezentację.`; continue }
        const svc = current.value
        await attach(`Wysyłam „${f.name}”…`, onProgress => drive.attachFromPhone(svc, f, onProgress))
        if (!current.value) return
      }
    }
    let searchTimer = 0
    async function searchFiles() {
      pickBusy.value = true
      try { pickFound.value = await drive.searchFiles(pickQuery.value) } catch (e) { error.value = e.message; picker.value = false } finally { pickBusy.value = false }
    }
    function searchSoon() { clearTimeout(searchTimer); searchTimer = setTimeout(searchFiles, 350) }
    function openPicker() { picker.value = true; pickQuery.value = ''; searchFiles() }
    async function fromDrive(f) {
      picker.value = false
      const svc = current.value
      await attach(`Kopiuję „${f.name}”…`, onProgress => drive.attachFromDrive(svc, f, onProgress))
    }

    const remove = () => guard(async () => {
      await drive.remove(current.value.id)
      services.value = services.value.filter(s => s.id !== current.value.id)
      current.value = null
      if (fromCal) { fromCal = false; calView.value = true }
    })

    /* ---------- kalendarz, wydarzenia, szablony ---------- */
    const events = ref([]), types = ref(mergeTypes(null))
    const pendingEvents = ref([]), pendingAnns = ref([]) // zgłoszenia czekające na zatwierdzenie (moje albo do zatwierdzenia)
    let typesBase = 0
    const typeOf = id => types.value.find(t => t.id === id) || { id, name: 'Inne', color: '#8f98a8', time: '', place: '', program: [] }
    const eventTypes = computed(() => types.value.filter(t => t.id !== 'nabozenstwo'))
    const clockNow = () => new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
    async function fillProgram(target, typeId) {
      if (target.program.length && !(await ask('Zastąpić obecny program programem z szablonu?'))) return
      target.program.splice(0, target.program.length, ...programFrom(typeOf(typeId), uid))
    }
    // Jeden kalendarz: nabożeństwa i pozostałe wydarzenia.
    const calItems = computed(() => [
      ...services.value.filter(s => s.date).map(s => ({ kind: 'service', id: s.id, type: 'nabozenstwo', date: s.date, time: s.time || DEFAULT_TIME, place: s.place || DEFAULT_PLACE, title: s.sermonTitle ? 'Nabożeństwo: ' + s.sermonTitle : 'Nabożeństwo', ref: s })),
      ...events.value.filter(e => e.date).map(e => ({ kind: 'event', id: e.id, type: e.type, date: e.date, time: e.time || '', place: e.place || '', title: e.title || typeOf(e.type).name, ref: e })),
    ].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00'))))
    // Filtr kalendarza: nic nie zaznaczone = wszystko; gotowe zestawy dla każdego (Dla mnie — według rang),
    // pojedyncze rodzaje do doprecyzowania; wyszukiwanie po nazwie, miejscu i rodzaju. Zapamiętane na tym urządzeniu.
    let calSaved = []
    try { calSaved = JSON.parse(localStorage.getItem('kns-cal-types') || '[]') } catch { /* brak zapisu */ }
    const calSel = ref(calSaved), calQuery = ref('')
    const keepCal = () => { try { localStorage.setItem('kns-cal-types', JSON.stringify(calSel.value)) } catch { /* tryb prywatny */ } }
    function toggleType(id) { calSel.value = calSel.value.includes(id) ? calSel.value.filter(x => x !== id) : [...calSel.value, id]; keepCal() }
    const myCalTypes = computed(() => {
      const roles = me.value?.roles || []
      return types.value.map(t => t.id).filter(id => (id !== 'rada' || hasCouncil.value) && (id !== 'studenckie' || roles.includes('asb') || canManage.value) && id !== 'proba')
    })
    const CAL_PRESETS = computed(() => [
      { id: 'all', name: 'Wszystko', types: [] },
      { id: 'me', name: 'Dla mnie', types: myCalTypes.value },
      { id: 'services', name: 'Nabożeństwa', types: ['nabozenstwo'] },
      { id: 'meetings', name: 'Spotkania', types: ['czlonkowskie', 'rada', 'domowe', 'studenckie'].filter(id => myCalTypes.value.includes(id)) },
      { id: 'community', name: 'Wyjazdy i wydarzenia', types: types.value.filter(t => t.community).map(t => t.id) },
    ])
    const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x))
    const calPreset = computed(() => CAL_PRESETS.value.find(p => sameSet(p.types, calSel.value))?.id || '')
    function setCalPreset(p) { calSel.value = [...p.types]; keepCal(); selDay.value = '' }
    const calMatch = it => { const q = plain(calQuery.value.trim()); return !q || plain([it.title, it.place, typeOf(it.type).name].join(' ')).includes(q) }
    // „Dla mnie”: moje rodzaje wydarzeń i wszystko, co jest dla moich służb (np. próby zespołu, w którym służę)
    const myMinistryIds = computed(() => serve.list.filter(m => m.mine === 'active' || m.leader).map(m => m.id))
    const forMyMinistry = it => (it.ref?.ministries || []).some(id => myMinistryIds.value.includes(id))
    const visibleItems = computed(() => calItems.value.filter(it => (!calSel.value.length || calSel.value.includes(it.type) || (calPreset.value === 'me' && forMyMinistry(it))) && calMatch(it)))
    const calView = ref(false), month0 = ref(today().slice(0, 7)), selDay = ref(''), pickType = ref(false)
    const WEEK = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd']
    const todayStr = computed(() => { now.value; return today() })
    const monthLabel = computed(() => asDate(month0.value + '-01').toLocaleDateString('pl', { month: 'long', year: 'numeric' }))
    function shiftMonth(by) { const d = asDate(month0.value + '-01'); d.setMonth(d.getMonth() + by); month0.value = localDate(d).slice(0, 7); selDay.value = '' }
    // Siatka miesiąca od poniedziałku; dni z sąsiednich miesięcy wyszarzone.
    const calDays = computed(() => {
      const first = asDate(month0.value + '-01')
      const d = new Date(first); d.setDate(1 - ((first.getDay() + 6) % 7))
      const out = []
      do {
        for (let i = 0; i < 7; i++) {
          const date = localDate(d)
          out.push({ date, day: d.getDate(), inMonth: date.startsWith(month0.value), items: visibleItems.value.filter(it => it.date === date) })
          d.setDate(d.getDate() + 1)
        }
      } while (localDate(d).startsWith(month0.value))
      return out
    })
    // Pod kalendarzem: wybrany dzień albo najbliższe — bez filtra 60 dni (co najmniej 5 pozycji); z filtrem albo
    // wyszukiwaniem bez ograniczenia czasu (np. najbliższy wyjazd za pół roku też się pokaże).
    const agenda = computed(() => {
      if (selDay.value) return visibleItems.value.filter(it => it.date === selDay.value)
      const next = visibleItems.value.filter(it => it.date >= todayStr.value)
      if (calSel.value.length || calQuery.value.trim()) return next.slice(0, 30)
      const until = localDate(new Date(Date.now() + 60 * 86400000))
      const near = next.filter(it => it.date <= until)
      return (near.length >= 5 ? near : next.slice(0, 5)).slice(0, 30)
    })
    let fromCal = false // nabożeństwo otwarte z kalendarza wraca do kalendarza
    function openCalendar() { serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; svcListView.value = false; votesView.value = false; bugsView.value = false; profileView.value = false; songView.value = false; peopleView.value = false; moreView.value = false; gcalView.value = false; calView.value = true; scrollTo(0, 0) }
    function openItem(it) { if (it.kind === 'service') { open(it.ref); fromCal = true } else openEvent(it.ref) }

    const currentEvent = ref(null)
    let eventSaved = '', eventBase = 0, eventType = ''
    const eventEditable = computed(() => !!currentEvent.value && !currentEvent.value.asb && mayChange(currentEvent.value, eventSavedOnce.value))
    const eventDirty = computed(() => !!currentEvent.value && JSON.stringify(currentEvent.value) !== eventSaved)
    const eventEditing = ref(false) // podgląd albo edycja otwartego wydarzenia
    /* ---------- zapisy na wydarzenia ---------- */
    const SIGNUP_STATUS = { confirmed: 'Jesteś zapisany(a)', pending: 'Zapis czeka na potwierdzenie', reserve: 'Jesteś na liście rezerwowej' }
    const signup = reactive({ board: null, adults: 1, children: 0, note: '' })
    const seatsText = p => [p.adults ? p.adults + ' ' + (p.adults === 1 ? 'dorosły' : 'dorosłych') : '', p.children ? p.children + ' ' + (p.children === 1 ? 'dziecko' : 'dzieci') : ''].filter(Boolean).join(' + ')
    const signupGroups = computed(() => [
      { id: 'pending', title: 'Do zatwierdzenia', list: (signup.board?.list || []).filter(p => p.status === 'pending') },
      { id: 'confirmed', title: 'Zapisani', list: (signup.board?.list || []).filter(p => p.status === 'confirmed') },
      { id: 'reserve', title: 'Lista rezerwowa', list: (signup.board?.list || []).filter(p => p.status === 'reserve') },
    ].filter(g => g.list.length))
    async function loadSignup() {
      const ev = currentEvent.value
      signup.board = null
      if (!api.enabled || !ev?.signup?.enabled || ev.status === 'pending' || !events.value.some(x => x.id === ev.id)) return
      try {
        const b = await api.call('signupBoard', { id: ev.id })
        if (currentEvent.value?.id !== ev.id) return
        signup.board = b
        signup.adults = b?.mine?.adults ?? 1; signup.children = b?.mine?.children ?? 0; signup.note = b?.mine?.note || ''
      } catch (e) { error.value = e.message }
    }
    function toggleSignup(on) {
      currentEvent.value.signup = on ? { enabled: true, max: '', kids: false, approval: false, until: '', ...(currentEvent.value.signup || {}), ...{ enabled: true } } : { ...(currentEvent.value.signup || {}), enabled: false }
    }
    const SIGNUP_DONE = { confirmed: 'Zapisano — jesteś na liście.', pending: 'Zapis wysłany — czeka na potwierdzenie twórcy wydarzenia.', reserve: 'Brak miejsc — jesteś na liście rezerwowej. Damy znać, gdy zwolni się miejsce.' }
    const signupJoin = () => guard(async () => {
      const r = await api.call('signupJoin', { id: currentEvent.value.id, adults: signup.adults, children: signup.children, note: signup.note })
      api.call('pushInbox').catch(() => {})
      await loadSignup(); status.value = SIGNUP_DONE[r.status] || 'Zapisano.'
    })
    const signupLeave = async () => { if ((await ask('Wypisać się z tego wydarzenia?'))) guard(async () => { await api.call('signupLeave', { id: currentEvent.value.id }); api.call('pushInbox').catch(() => {}); await loadSignup(); status.value = 'Wypisano.' }) }
    async function signupDecide(p, decision) {
      if (decision === 'remove' && !(await ask('Usunąć ' + p.name + ' z zapisów?'))) return
      guard(async () => { await api.call('signupDecide', { id: currentEvent.value.id, who: p.id, decision }); api.call('pushInbox').catch(() => {}); await loadSignup() })
    }
    const eventSavedOnce = computed(() => !!currentEvent.value && [...events.value, ...pendingEvents.value].some(x => x.id === currentEvent.value.id))
    function openEvent(ev) {
      currentEvent.value = { type: 'inne', title: '', date: today(), time: '', place: '', description: '', program: [], ...JSON.parse(JSON.stringify(ev)) }
      if (['czlonkowskie', 'rada'].includes(currentEvent.value.type) && api.enabled) loadProtocols()
      if (api.enabled) loadVotes() // głosowania podpięte pod to spotkanie
      loadAttendance(currentEvent.value)
      eventSaved = JSON.stringify(currentEvent.value); eventBase = ev.updated || 0; eventType = currentEvent.value.type
      eventEditing.value = false
      loadSignup()
      notify.ids = []
      status.value = ''; confirmDelete.value = false; scrollTo(0, 0)
    }
    // „Dodaj wydarzenie”: od razu formularz (rodzaj wybiera się w nim, nie wcześniej)
    function inviteEvent() { if (!calView.value) openCalendar(); newEvent(canEdit.value || canReview.value ? 'inne' : 'inicjatywa') }
    // rodzaje do wyboru w formularzu: spotkania rady i członkowskie — tylko osoby z prawem edycji
    const eventTypesFor = computed(() => eventTypes.value.filter(t => canEdit.value || canReview.value || !['rada', 'czlonkowskie'].includes(t.id) || t.id === currentEvent.value?.type))
    let autoProgram = '' // program z szablonu (dopóki nikt go nie zmienił, zmiana rodzaju go podmienia)
    const programKey = list => JSON.stringify((list || []).map(p => [p.offset, p.category, p.title, p.person]))
    function newEvent(typeId) {
      pickType.value = false
      if (typeId === 'nabozenstwo') { create(selDay.value || undefined); fromCal = true; return }
      const t = typeOf(typeId)
      openEvent({ id: uid(), type: typeId, title: t.name, date: selDay.value || today(), time: t.time || '', place: t.place || '', description: '', program: programFrom(t, uid), createdBy: me.value?.name || drive.account() || 'telefon' })
      eventSaved = '' // nowe wydarzenie od razu jest „do zapisania”
      autoProgram = programKey(currentEvent.value.program)
      eventEditing.value = true
    }
    // Zmiana rodzaju: podpowiedzi z szablonu zastępują tylko to, czego nikt jeszcze nie zmienił.
    function typeChanged() {
      const ev = currentEvent.value, old = typeOf(eventType), t = typeOf(ev.type)
      if (!ev.title.trim() || ev.title === old.name) ev.title = t.name
      if (!ev.place || ev.place === old.place) ev.place = t.place || ''
      if (!ev.time || ev.time === old.time) ev.time = t.time || ''
      if (!ev.program.length || programKey(ev.program) === autoProgram) { ev.program = programFrom(t, uid); autoProgram = programKey(ev.program) }
      eventType = ev.type
    }
    async function closeEvent() {
      if (eventDirty.value && eventSavedOnce.value && !(await ask('Masz niezapisane zmiany. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return
      // z edycji zapisanego wydarzenia — wracamy do podglądu
      if (eventEditing.value && eventSavedOnce.value) {
        const e = [...events.value, ...pendingEvents.value].find(x => x.id === currentEvent.value.id)
        if (e) { openEvent(e); return }
      }
      currentEvent.value = null
    }
    const saveEvent = (force = false, approving = false) => guard(async () => {
      const ev = currentEvent.value
      ev.title = ev.title.trim()
      const data = { ...JSON.parse(JSON.stringify(ev)), updated: Date.now(), updatedBy: drive.account() || 'telefon' }
      const submitted = !canEdit.value && !canReview.value
      if (submitted) { data.status = 'pending'; data.mine = true; data.createdBy = data.createdBy || me.value?.name || drive.account() }
      try {
        await drive.saveEvent(data, eventBase, force === true)
      } catch (e) {
        if (!e.conflict) throw e
        if (!(await ask('Ktoś inny zmienił to wydarzenie, odkąd je otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowszą wersję.'))) {
          await fetchAll()
          const fresh = events.value.find(x => x.id === ev.id)
          if (fresh) openEvent(fresh)
          status.value = 'Wczytano najnowszą wersję'
          return
        }
        await drive.saveEvent(data, eventBase, true)
      }
      const wasNew = !eventSavedOnce.value
      // nowo dodane osoby biorące udział → powiadomienie razem z wybranymi odbiorcami (opublikowane wydarzenie)
      if (!submitted) {
        const before = new Set(((eventSaved ? JSON.parse(eventSaved) : {}).people || []).map(p => p.id))
        const added = (data.people || []).map(p => p.id).filter(id => !before.has(id))
        if (added.length) notify.ids = [...new Set([...notify.ids, ...added])]
      }
      place(events, pendingEvents, data)
      if (submitted && wasNew && api.enabled) api.call('pushInbox').catch(() => {})
      const sent = (submitted ? ' · czeka na zatwierdzenie' : approving ? ' · opublikowane' : '') + await sendNotify({ title: data.title || typeOf(data.type).name, body: [pretty(data.date) + (data.time ? ', ' + data.time : ''), data.place].filter(Boolean).join(' · '), url: './?wydarzenie=' + encodeURIComponent(data.id) })
      openEvent(data)
      status.value = 'Zapisano o ' + clockNow() + sent
    })
    const removeEvent = () => guard(async () => {
      const id = currentEvent.value.id
      await drive.removeEvent(id)
      events.value = events.value.filter(x => x.id !== id); pendingEvents.value = pendingEvents.value.filter(x => x.id !== id)
      currentEvent.value = null
    })

    const tplView = ref(false), tplType = ref(null)
    let tplSaved = ''
    const tplDirty = computed(() => !!tplType.value && JSON.stringify(tplType.value) !== tplSaved)
    function openTemplates() { tplView.value = true; scrollTo(0, 0) }
    function openType(t) {
      tplType.value = { ...JSON.parse(JSON.stringify(t)), program: (t.program || []).map(p => ({ key: uid(), person: '', note: '', ...p })) }
      tplSaved = JSON.stringify(tplType.value); status.value = ''; confirmDelete.value = false; scrollTo(0, 0)
    }
    function newType() {
      openType({ id: uid(), name: '', color: COLORS[types.value.length % COLORS.length], time: '18:00', place: '', program: [] })
      tplSaved = ''
    }
    async function closeType() {
      if (tplDirty.value && tplType.value.name.trim() && !(await ask('Masz niezapisane zmiany w szablonie. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return
      tplType.value = null
    }
    const strip = t => ({ ...t, program: t.program.map(({ offset, category, title, person }) => ({ offset, category, title: title || '', person: person || '' })) })
    // Zapis wszystkich szablonów; usunięte wbudowane rodzaje są zapamiętywane, żeby nie wróciły same.
    async function writeTypes(list) {
      const full = [...list, ...DEFAULT_TYPES.filter(d => !list.some(x => x.id === d.id)).map(d => ({ id: d.id, removed: true }))]
      try {
        typesBase = await drive.saveTemplates(full, typesBase)
      } catch (e) {
        if (!e.conflict) throw e
        if (!(await ask('Ktoś inny zmienił szablony w międzyczasie. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowsze szablony.'))) { await fetchAll(); tplType.value = null; return false }
        typesBase = await drive.saveTemplates(full, typesBase, true)
      }
      return true
    }
    const saveTemplate = () => guard(async () => {
      const t = strip(JSON.parse(JSON.stringify(tplType.value)))
      t.name = t.name.trim()
      const list = types.value.some(x => x.id === t.id) ? types.value.map(x => (x.id === t.id ? t : x)) : [...types.value, t]
      if (!(await writeTypes(list))) return
      types.value = list
      openType(t)
      status.value = 'Zapisano o ' + clockNow()
    })
    const removeType = () => guard(async () => {
      const list = types.value.filter(x => x.id !== tplType.value.id)
      if (!(await writeTypes(list))) return
      types.value = list
      tplType.value = null
    })
    /* ---------- protokoły: biblioteka plików ---------- */
    // Protokół spisuje ktoś poza aplikacją i wgrywa plik. Widoczność: wszyscy członkowie albo tylko rada (pilnuje baza);
    // opcjonalnie dołączony do spotkania członkowskiego albo rady. Dodają protokolant i rada zboru.
    const hasCouncil = computed(() => hasFlag('council'))
    const canApprove = computed(() => hasFlag('council'))
    // Materiały: protokoły (protokolant, rada) oraz instrukcje i pliki pomocnicze (też prawo edycji, technika, administrator).
    const canWriteMaterial = () => hasFlag('edit') || hasFlag('protocols') || hasFlag('council') || hasFlag('manage') || (me.value?.roles || []).includes('technika')
    const canWriteProto = kind => (kind === 'rada' ? hasFlag('council') : kind === 'material' ? canWriteMaterial() : hasFlag('protocols') || hasFlag('council'))
    const canAddProto = computed(() => !!drive.uploadProtocolFile && (canWriteProto('czlonkowskie') || canWriteProto('material')))
    const VISIBILITY = { czlonkowskie: 'Wszyscy członkowie', material: 'Wszyscy członkowie', rada: 'Tylko rada zboru' }
    const MAT_TYPES = { protokol: 'Protokół', instrukcja: 'Instrukcja', plik: 'Plik pomocniczy' }
    const MAT_PLURAL = { protokol: 'Protokoły', instrukcja: 'Instrukcje', plik: 'Pliki' }
    const MAT_COLOR = { protokol: '#a98bff', instrukcja: '#3ec7b0', plik: '#6ea8ff' }
    const matType = p => p?.type || (p?.kind === 'material' ? 'plik' : 'protokol')
    // Widoczność i rodzaj → kind w bazie: rada (tylko rada), czlonkowskie (protokół), material (instrukcja, plik).
    function protoAudience(v) { const p = currentProto.value; p.kind = v === 'rada' ? 'rada' : p.type === 'protokol' ? 'czlonkowskie' : 'material' }
    function protoTypeChanged() { const p = currentProto.value; if (p.kind !== 'rada') protoAudience('all'); if (p.type !== 'protokol') p.eventId = '' }
    const dateTime = t => new Date(t).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    const protoView = ref(false), protoKind = ref('all'), protocolsRaw = ref([]), protoBusy = ref(false), protoError = ref('')
    const protocols = computed(() => protocolsRaw.value.filter(p => protoKind.value === 'all' || (protoKind.value === 'rada' ? p.kind === 'rada' : matType(p) === protoKind.value)).sort((a, b) => (b.date || '').localeCompare(a.date || '')))
    let protoLoaded = false
    async function loadProtocols(force = false) {
      if (protoLoaded && !force) return
      protoBusy.value = true; protoError.value = ''
      try { protocolsRaw.value = await drive.loadProtocols(); protoLoaded = true } catch (e) { protoError.value = e.message } finally { protoBusy.value = false }
    }
    function loadProtoKind(kind) { protoKind.value = kind }
    function openProtocols() { protoView.value = true; scrollTo(0, 0); loadProtocols(true) }
    const meetingEvents = computed(() => events.value.filter(e => ['czlonkowskie', 'rada'].includes(e.type)).sort((a, b) => (b.date || '').localeCompare(a.date || '')))
    const eventTitle = id => { const e = events.value.find(x => x.id === id); return e ? (e.title || typeOf(e.type).name) + ' · ' + shortDate(e.date) : '' }
    const eventProtocols = computed(() => (currentEvent.value ? protocolsRaw.value.filter(p => p.eventId === currentEvent.value.id) : []))
    const currentProto = ref(null), protoEditing = ref(false), protoFile = ref(null), protoUrl = ref('')
    let protoSaved = '', protoBase = 0
    const protoDirty = computed(() => !!currentProto.value && (JSON.stringify(currentProto.value) !== protoSaved || !!protoFile.value))
    const protoSavedOnce = computed(() => !!currentProto.value && protocolsRaw.value.some(p => p.id === currentProto.value.id))
    const protoEditable = computed(() => !!currentProto.value && canWriteProto(currentProto.value.kind))
    function openProto(p) {
      currentProto.value = { title: '', date: today(), kind: 'czlonkowskie', eventId: '', note: '', file: '', fileName: '', ...JSON.parse(JSON.stringify(p)) }
      currentProto.value.type = matType(currentProto.value)
      protoSaved = JSON.stringify(currentProto.value); protoBase = p.updated || 0
      protoFile.value = null; protoEditing.value = false; protoUrl.value = ''
      status.value = ''; confirmDelete.value = false; scrollTo(0, 0)
      // adres pliku (prywatny, ważny godzinę) — od razu, żeby link otwierał się bez czekania
      if (p.file && drive.protocolUrl) drive.protocolUrl(p.file).then(u => { if (currentProto.value?.id === p.id) protoUrl.value = u }, e => { error.value = e.message })
    }
    function newProto(kind = null, ev = null) {
      // bez prawa do protokołów — od razu instrukcja (np. technika dodaje obsługę rzutnika)
      const proto = !!ev || canWriteProto('czlonkowskie') || hasCouncil.value
      kind = kind || (proto ? 'czlonkowskie' : 'material')
      openProto({ id: uid(), kind, type: kind === 'material' ? 'instrukcja' : 'protokol', eventId: ev?.id || '', title: ev ? 'Protokół — ' + (ev.title || typeOf(ev.type).name) : '', date: ev?.date || today() })
      protoSaved = ''; protoEditing.value = true
    }
    function protoForEvent(ev) { loadProtocols(); newProto(ev.type === 'rada' ? 'rada' : 'czlonkowskie', ev) }
    function pickProtoFile(e) {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (!f) return
      if (f.size > 25 * 1048576) { error.value = 'Plik ma ' + Math.round(f.size / 1048576) + ' MB — limit to 25 MB.'; return }
      protoFile.value = f
      if (!currentProto.value.title.trim()) currentProto.value.title = f.name.replace(/\.[^.]+$/, '')
    }
    async function closeProto() {
      if (protoEditing.value && protoDirty.value && protoSavedOnce.value && !(await ask('Masz niezapisane zmiany. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return
      if (protoEditing.value && protoSavedOnce.value) { const p = protocolsRaw.value.find(x => x.id === currentProto.value.id); if (p) { openProto(p); return } }
      currentProto.value = null
    }
    const saveProto = () => guard(async () => {
      const p = currentProto.value, f = protoFile.value, old = p.file
      const data = { ...JSON.parse(JSON.stringify(p)), title: p.title.trim(), status: 'zatwierdzony', updated: Date.now(), updatedBy: me.value?.name || drive.account() || 'telefon' }
      if (f) Object.assign(data, { file: await drive.uploadProtocolFile(f), fileName: f.name, fileType: f.type, size: f.size })
      try { await drive.saveProtocol(data, protoBase) } catch (e) {
        if (!e.conflict) throw e
        if (!(await ask('Ktoś inny zmienił ten materiał, odkąd go otworzyłeś. Zapisać mimo to?'))) return
        await drive.saveProtocol(data, protoBase, true)
      }
      if (f && old && old !== data.file) drive.removeProtocolFile?.(old)
      protocolsRaw.value = [...protocolsRaw.value.filter(x => x.id !== data.id), data]
      openProto(data)
      status.value = 'Zapisano o ' + clockNow()
    })
    const removeProto = () => guard(async () => {
      const p = currentProto.value
      await drive.removeProtocol(p.id)
      if (p.file) drive.removeProtocolFile?.(p.file)
      protocolsRaw.value = protocolsRaw.value.filter(x => x.id !== p.id)
      currentProto.value = null
    })
    /* ---------- ogłoszenia i komunikaty rady ---------- */
    const AUDIENCE = { public: 'Wszyscy', members: 'Członkowie', council: 'Rada zboru' }
    const announcements = ref([])
    // Każdy zatwierdzony członek może zgłosić wydarzenie albo ogłoszenie; publikują osoby z prawem edycji,
    // a zgłoszenia zatwierdzają lider newslettera, rada zboru i administrator (flaga approve).
    const canReview = computed(() => api.enabled && hasFlag('approve'))
    const canSubmit = computed(() => (api.enabled ? me.value?.status === 'active' : canEdit.value))
    const canAnnounce = canSubmit
    const mayChange = (item, savedOnce) => canEdit.value || canReview.value || !savedOnce || (item?.status === 'pending' && item?.mine)
    const reviewItems = computed(() => [
      ...pendingEvents.value.map(e => ({ kind: 'event', id: e.id, title: e.title || typeOf(e.type).name, sub: 'Wydarzenie · ' + shortDate(e.date) + (e.createdBy ? ' · ' + e.createdBy : ''), ref: e })),
      ...pendingAnns.value.map(a => ({ kind: 'ann', id: a.id, title: a.title, sub: 'Ogłoszenie' + (a.author ? ' · ' + a.author : ''), ref: a })),
    ])
    // Zapisane wydarzenie/ogłoszenie trafia do właściwej listy (opublikowane albo zgłoszenia).
    function place(list, pend, data) {
      list.value = list.value.filter(x => x.id !== data.id); pend.value = pend.value.filter(x => x.id !== data.id)
      ;(data.status === 'pending' ? pend : list).value.push(data)
    }
    const approveEvent = () => { currentEvent.value.status = 'published'; return saveEvent(false, true) }
    const approveAnn = () => { currentAnn.value.status = 'published'; return saveAnn(true) }
    async function rejectEvent() { if ((await ask('Odrzucić to zgłoszenie? Zostanie usunięte.'))) removeEvent() }
    async function rejectAnn() { if ((await ask('Odrzucić to zgłoszenie? Zostanie usunięte.'))) removeAnn() }
    const shortDate = d => (d ? new Date(typeof d === 'number' ? d : d + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'short' }) : '')
    const isActive = a => !a.until || a.until >= todayStr.value
    const byNewest = (a, b) => (b.date || 0) - (a.date || 0)
    // Kolejność: nowe (jeszcze nieotwarte) zawsze na górze, potem przypięte, komunikaty rady i od najnowszych.
    const activeAnns = computed(() => announcements.value.filter(isActive).sort((a, b) => (annIsNew(b) ? 1 : 0) - (annIsNew(a) ? 1 : 0) || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.important ? 1 : 0) - (a.important ? 1 : 0) || byNewest(a, b)))
    const oldAnns = computed(() => announcements.value.filter(a => !isActive(a)).sort((a, b) => (b.until || '').localeCompare(a.until || '')))
    const importantAnns = computed(() => activeAnns.value.filter(a => a.important && a.audience !== 'council'))
    // Myśli z kazania: z ostatniego nabożeństwa, które już się zaczęło — widoczne cały tydzień, do początku następnego.
    const lastSermon = computed(() => services.value.filter(s => s.date && startsAt(s) <= now.value).sort((a, b) => startsAt(b) - startsAt(a))[0] || null)
    const thoughtList = s => String(s?.thoughts || '').split('\n').map(t => t.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean)
    const homeAnns = computed(() => activeAnns.value.filter(a => !a.important).slice(0, 4))
    const annView = ref(false), currentAnn = ref(null), annEditing = ref(false)
    let annSaved = '', annBase = 0, annAudience = ''
    const annDirty = computed(() => !!currentAnn.value && JSON.stringify(currentAnn.value) !== annSaved)
    const annSavedOnce = computed(() => !!currentAnn.value && [...announcements.value, ...pendingAnns.value].some(x => x.id === currentAnn.value.id))
    // Zwykłe ogłoszenia — osoby z prawem edycji; komunikaty rady i ogłoszenia dla rady — rada i pastor.
    const annEditable = computed(() => !!currentAnn.value && mayChange(currentAnn.value, annSavedOnce.value) && (hasCouncil.value || (!currentAnn.value.important && currentAnn.value.audience !== 'council' && annAudience !== 'council')))
    function openAnns() { annView.value = true; annQuery.value = ''; scrollTo(0, 0) }
    // Wyszukiwanie w ogłoszeniach (tytuł, treść, autor — bez polskich znaków i wielkości liter) z podpowiedziami.
    const annQuery = ref(''), annHintsOpen = ref(false)
    const annMatch = a => { const q = plain(annQuery.value.trim()); return !q || plain([a.title, a.text, a.author].join(' ')).includes(q) }
    const shownActiveAnns = computed(() => activeAnns.value.filter(annMatch))
    const shownOldAnns = computed(() => oldAnns.value.filter(annMatch))
    // podpowiedzi: najpierw trafienia w tytule, najwyżej 6; tytuł z zaznaczonym fragmentem
    const annHints = computed(() => {
      const q = plain(annQuery.value.trim())
      if (!q) return []
      const all = [...activeAnns.value, ...oldAnns.value].filter(annMatch)
      return [...all.filter(a => plain(a.title).includes(q)), ...all.filter(a => !plain(a.title).includes(q))].slice(0, 6)
    })
    function hintParts(title) {
      const t = String(title || ''), q = plain(annQuery.value.trim()), at = plain(t).indexOf(q)
      if (!q || at < 0) return [{ s: t, hit: false }]
      return [{ s: t.slice(0, at), hit: false }, { s: t.slice(at, at + q.length), hit: true }, { s: t.slice(at + q.length), hit: false }]
    }
    function pickHint(a) { annHintsOpen.value = false; openAnn(a) }
    // „Nowe”: ogłoszenie z ostatnich 30 dni, którego ta osoba jeszcze nie otworzyła (otwarcie = przeczytane).
    // Pamięta KONTO (telefon, strona i komputer razem) — nie przeglądarka, więc inne konto na tym samym
    // urządzeniu ma własną listę. Bez połączenia z bazą (tryb próbny) — przeglądarka.
    const seenAnns = ref((() => { if (api.enabled) return []; try { return JSON.parse(localStorage.getItem('kns-seen-anns') || '[]') } catch { return [] } })())
    const seenReady = ref(!api.enabled) // do wczytania listy z konta nic nie jest „Nowe” (bez mignięcia)
    const annIsNew = a => seenReady.value && !seenAnns.value.includes(a.id) && Date.now() - (+a.date || 0) < 30 * 864e5
    const newAnnCount = computed(() => importantAnns.value.filter(annIsNew).length)
    const keepSeen = () => { if (api.enabled) return; try { localStorage.setItem('kns-seen-anns', JSON.stringify(seenAnns.value.slice(-300))) } catch { /* tryb prywatny */ } }
    function markAnnSeen(id) {
      if (!id || seenAnns.value.includes(id)) return
      seenAnns.value = [...seenAnns.value, id]
      keepSeen()
      if (api.enabled) api.call('markSeen', { ids: [id] }).catch(() => {})
    }
    // Po zalogowaniu: przeczytane tego konta (plus otwarte przed chwilą, zanim lista doszła).
    async function loadSeenAnns() {
      if (!api.enabled) return
      try { seenAnns.value = [...new Set([...((await api.call('seenAnns')) || []), ...seenAnns.value])]; seenReady.value = true } catch { /* bez sieci — bez „Nowe” */ }
    }
    function openAnn(a) {
      markAnnSeen(a?.id)
      currentAnn.value = { title: '', text: '', audience: 'members', important: false, until: '', ...JSON.parse(JSON.stringify(a)) }
      annSaved = JSON.stringify(currentAnn.value); annBase = a.updated || 0; annAudience = currentAnn.value.audience
      notify.ids = []
      status.value = ''; confirmDelete.value = false; scrollTo(0, 0)
      annEditing.value = false
    }
    function newAnn() {
      openAnn({ id: uid(), title: '', text: '', audience: 'members', important: false, until: '', author: me.value?.name || drive.account() || 'telefon' })
      annSaved = ''; annAudience = ''; annEditing.value = true
    }
    async function closeAnn() {
      if (annDirty.value && annSavedOnce.value && !(await ask('Masz niezapisane zmiany w ogłoszeniu. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return
      // z edycji zapisanego ogłoszenia — wracamy do podglądu
      if (annEditing.value && annSavedOnce.value) { const a = announcements.value.find(x => x.id === currentAnn.value.id); if (a) { openAnn(a); return } }
      currentAnn.value = null
    }
    const saveAnn = (approving = false) => guard(async () => {
      const a = currentAnn.value
      const submitted = !canEdit.value && !canReview.value
      const wasNew = !annSavedOnce.value
      if (a.audience === 'council') a.important = false
      const data = { ...JSON.parse(JSON.stringify(a)), title: a.title.trim(), date: a.date || Date.now(), updated: Date.now(), updatedBy: drive.account() || 'telefon' }
      if (data.link && !/^https?:\/\//i.test(data.link)) data.link = 'https://' + data.link
      if (!data.link) delete data.linkText
      if (submitted) { data.status = 'pending'; data.mine = true }
      try {
        await drive.saveAnnouncement(data, annBase, false, annAudience)
      } catch (e) {
        if (!e.conflict) throw e
        if (!(await ask('Ktoś inny zmienił to ogłoszenie, odkąd je otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?'))) return
        await drive.saveAnnouncement(data, annBase, true, annAudience)
      }
      // poprzednia grafika (zmieniona albo usunięta) znika z magazynu
      const prev = announcements.value.find(x => x.id === data.id)
      for (const k of ['image', 'video']) if (prev?.[k] && prev[k] !== data[k] && /\/ogloszenia\//.test(prev[k])) drive.removeImage?.(prev[k])
      place(announcements, pendingAnns, data)
      if (submitted && wasNew && api.enabled) api.call('pushInbox').catch(() => {})
      const sent = (submitted ? ' · czeka na zatwierdzenie' : approving === true ? ' · opublikowane' : '') + await sendNotify({ title: (data.important ? 'Komunikat rady zboru: ' : 'Ogłoszenie: ') + data.title, body: String(data.text || '').slice(0, 160), url: './?ogloszenie=' + encodeURIComponent(data.id) })
      openAnn(data)
      status.value = 'Zapisano o ' + clockNow() + sent
    })
    const removeAnn = () => guard(async () => {
      const a = currentAnn.value
      await drive.removeAnnouncement({ id: a.id, audience: annAudience || a.audience })
      const prev = announcements.value.find(x => x.id === a.id)
      for (const k of ['image', 'video']) if (/\/ogloszenia\//.test(prev?.[k] || '')) drive.removeImage?.(prev[k])
      announcements.value = announcements.value.filter(x => x.id !== a.id); pendingAnns.value = pendingAnns.value.filter(x => x.id !== a.id)
      currentAnn.value = null
    })

    // Grafika ogłoszenia: zdjęcie zmniejszone na urządzeniu (najdłuższy bok 1600 px, JPEG) — mało miejsca i szybkie wczytywanie.
    const imgBusy = ref(false)
    async function shrinkImage(file, max = 1600) {
      const bmp = await createImageBitmap(file)
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      return new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('Nie udało się przygotować grafiki.'))), 'image/jpeg', 0.82))
    }
    // Grafika wydarzenia (ta sama obsługa co w ogłoszeniach; większa — nadaje się na rzutnik).
    function pickEventImage(e) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !currentEvent.value) return
      imgBusy.value = true
      guard(async () => { currentEvent.value.image = await drive.uploadImage(await shrinkImage(file, 1920)) }).finally(() => { imgBusy.value = false })
    }
    function pickAnnImage(e) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !currentAnn.value) return
      imgBusy.value = true
      guard(async () => { const first = !currentAnn.value.image; currentAnn.value.image = await drive.uploadImage(await shrinkImage(file, 1920)); if (first && !annSavedOnce.value) currentAnn.value.projector = true }).finally(() => { imgBusy.value = false })
    }

    // Z grafiki → nowe ogłoszenie z tą grafiką (tytuł z nazwy pliku, „Pokaż na nabożeństwie”, dla wszystkich) —
    // otwarte do uzupełnienia; trafia do ogłoszeń dopiero po „Zapisz”.
    const bulk = reactive({ busy: false })
    async function annFromImages(e) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      bulk.busy = true
      await guard(async () => {
        const image = await drive.uploadImage(await shrinkImage(file, 1920))
        newAnn()
        Object.assign(currentAnn.value, { title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), audience: 'public', image, projector: true })
        annView.value = true
        nextTick(() => document.getElementById('anTitle')?.select())
      })
      bulk.busy = false
    }

    // Film: wgrany plik do 50 MB (limit bazy) — dłuższe lepiej wrzucić na YouTube i wkleić link.
    const vidBusy = ref(false)
    function pickAnnVideo(e) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !currentAnn.value) return
      if (file.size > 50 * 1048576) { error.value = 'Film ma ' + Math.round(file.size / 1048576) + ' MB — limit to 50 MB. Skróć go albo wrzuć na YouTube i wklej link.'; return }
      vidBusy.value = true
      guard(async () => { currentAnn.value.video = await drive.uploadFile(file, (file.name.match(/\.(\w+)$/) || [, 'mp4'])[1]) }).finally(() => { vidBusy.value = false })
    }

    /* ---------- powiadomienia w aplikacji (dzwonek) ---------- */
    const inbox = ref([]), inboxOpen = ref(false)
    const unread = computed(() => inbox.value.filter(n => !n.read).length)
    async function loadInbox() {
      if (!api.enabled || !ready.value || gate.value) return
      try { inbox.value = (await api.call('inbox')) || [] } catch { /* bez sieci — zostaje poprzednia lista */ }
    }
    function openInbox() { inboxOpen.value = true; loadInbox() }
    const agoText = t => {
      const min = Math.round((Date.now() - new Date(t).getTime()) / 60000)
      if (min < 1) return 'teraz'
      if (min < 60) return min + ' min'
      if (min < 24 * 60) return Math.round(min / 60) + ' godz'
      return new Date(t).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '')
    }
    function markRead(list) {
      const ids = list.filter(n => !n.read).map(n => n.id)
      list.forEach(n => { n.read = true })
      if (ids.length) api.call('inboxRead', { ids }).catch(() => {})
    }
    const readAll = () => markRead(inbox.value)
    function openNotice(n) {
      markRead([n]); inboxOpen.value = false
      openLink(new URL(n.url || './', location.href).searchParams)
    }
    // Linki do konkretnych rzeczy: ?ogloszenie=id, ?wydarzenie=id, ?nabozenstwo=id, ?sluzba=id (?sluzby=1 — lista służb).
    // Otwierają wskazaną rzecz (także zgłoszenie czekające na zatwierdzenie).
    const LINK_KIND = { ogloszenie: 'ogłoszenie', wydarzenie: 'wydarzenie', nabozenstwo: 'nabożeństwo', sluzba: 'służbę', sluzby: 'listę służb' }
    const linkedMinistry = ref('')
    function openLink(q) {
      const annId = q.get('ogloszenie'), evId = q.get('wydarzenie'), svcId = q.get('nabozenstwo'), mId = q.get('sluzba')
      const a = annId && [...announcements.value, ...pendingAnns.value].find(x => x.id === annId)
      const e = evId && [...events.value, ...pendingEvents.value].find(x => x.id === evId)
      const sv = svcId && services.value.find(x => x.id === svcId)
      if (a) openAnn(a)
      else if (e) openEvent(e)
      else if (sv) open(sv)
      else if (mId || q.get('sluzby')) {
        openServe(q.get('sluzby') === 'moja' ? 'mine' : 'all'); linkedMinistry.value = mId || ''
        if (mId) { const stop = watch(() => serve.list, () => { const el = document.getElementById('sluzba-' + mId); if (el) { stop(); nextTick(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' })) } }) }
      } else if (q.get('asb')) openAsbMeeting(q.get('asb'))
      else if (annId || evId || svcId) error.value = 'Nie znaleziono tej rzeczy — mogła zostać usunięta albo nie masz do niej dostępu.'
    }
    const toast = ref('')
    let toastTimer
    function showToast(t) { toast.value = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 2500) }
    // Adres do udostępnienia: /wydarzenie/<id>, /ogloszenie/<id>, /nabozenstwo/<id>; służba — lista z zaznaczeniem.
    const shareUrl = (kind, id) => location.origin + (kind === 'sluzba' ? '/zaangazuj-sie?sluzba=' : '/' + kind + '/') + encodeURIComponent(id)
    /* ---------- kod QR (biblioteka qrcode-generator, wczytywana dopiero przy pierwszym użyciu) ---------- */
    const qr = ref(null)
    let qrLib = null
    const loadQrLib = () => qrLib || (qrLib = new Promise((ok, bad) => {
      const el = document.createElement('script')
      el.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
      el.onload = () => ok(window.qrcode); el.onerror = () => { qrLib = null; bad(new Error('Nie udało się wczytać generatora kodów QR — sprawdź internet.')) }
      document.head.appendChild(el)
    }))
    // PNG 1200×1200: czarne moduły na białym tle z marginesem — dobrze się skanuje także z wydruku i rzutnika.
    function qrPng(text) {
      const code = window.qrcode(0, 'M'); code.addData(text); code.make()
      const n = code.getModuleCount(), quiet = 4, size = 1200, cell = Math.floor(size / (n + quiet * 2)), off = Math.floor((size - cell * n) / 2)
      const c = document.createElement('canvas'); c.width = c.height = size
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000'
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (code.isDark(r, k)) g.fillRect(off + k * cell, off + r * cell, cell, cell)
      return c.toDataURL('image/png')
    }
    async function openQr(kind, id, title) {
      const url = shareUrl(kind, id)
      const slug = String(title || kind).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
      qr.value = { kind, id, title: title || '', url, png: '', error: '', file: 'qr-' + (slug || kind) + '.png' }
      try { await loadQrLib(); if (qr.value?.url === url) qr.value.png = qrPng(url) } catch (e) { if (qr.value) qr.value.error = e.message }
    }
    // Udostępnienie: na telefonie systemowe „Udostępnij”, na komputerze — kopia do schowka.
    async function shareLink(kind, id, title) {
      const url = shareUrl(kind, id)
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) { try { await navigator.share({ title: title || 'KNS Nabo', url }); return } catch (e) { if (e.name === 'AbortError') return } }
      try { await navigator.clipboard.writeText(url); showToast('Skopiowano link — wklej go w wiadomości') } catch { prompt('Skopiuj link:', url) }
    }
    const shareTarget = computed(() => {
      if (!ready.value || !api.enabled) return null
      if (currentAnn.value && annSavedOnce.value) return ['ogloszenie', currentAnn.value.id, currentAnn.value.title]
      if (currentEvent.value && [...events.value, ...pendingEvents.value].some(x => x.id === currentEvent.value.id)) return ['wydarzenie', currentEvent.value.id, currentEvent.value.title]
      if (current.value && services.value.some(x => x.id === current.value.id)) return ['nabozenstwo', current.value.id, 'Nabożeństwo ' + pretty(current.value.date)]
      return null
    })
    setInterval(() => { if (document.visibilityState === 'visible') loadInbox() }, 60000)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadInbox() })

    /* ---------- służby („Zaangażuj się”) ---------- */
    const serveView = ref(false), mEdit = ref(null), memberNames = ref([])
    const serve = reactive({ list: [], busy: false, error: '' })
    const ministryNames = ids => (ids || []).map(id => serve.list.find(m => m.id === id)?.name || id).join(', ') // nazwy służb (widoczność)
    const serveTab = ref('all') // 'all' — wszystkie służby, 'mine' — moja służba (dyspozycyjność)
    // służby szukające chętnych na stronie startowej: dwie pierwsze i ile jeszcze
    const seekingAll = computed(() => serve.list.filter(m => m.seeking))
    function openMinistry(m) {
      openServe(); linkedMinistry.value = m.id
      nextTick(() => document.getElementById('sluzba-' + m.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }
    let retriedServe = false
    async function loadServe() {
      if (!api.enabled) return
      serve.busy = true; serve.error = ''
      try { serve.list = (await api.call('ministries')) || [] } catch (e) { serve.error = e.message } finally { serve.busy = false }
      if (!serve.list.length && !serve.error && !retriedServe) { retriedServe = true; setTimeout(loadServe, 2000) } // pierwsze wczytanie tuż po zalogowaniu bywa puste
    }
    async function openServices() { if (!(await closeAll())) return; resetViews(); svcListView.value = true; scrollTo(0, 0) }
    function openServe(tab = 'all') {
      svcListView.value = false
      serveTab.value = tab === 'mine' ? 'mine' : 'all'
      profileView.value = false; songView.value = false; peopleView.value = false; calView.value = false; moreView.value = false; gcalView.value = false
      annView.value = false; protoView.value = false; tplView.value = false
      serveView.value = true; scrollTo(0, 0); loadServe()
    }
    // Po każdej zmianie w służbach: powiadomienia (dzwonek) od razu też na telefony odbiorców.
    const serveCall = (action, data) => guard(async () => { await api.call(action, data); api.call('pushInbox').catch(() => {}); await loadServe() })
    // Sekcje: najpierw służby szukające chętnych, potem pozostałe.
    const serveSections = computed(() => [
      { id: 'seeking', title: 'Szukają chętnych', list: serve.list.filter(m => m.seeking) },
      { id: 'all', title: serve.list.some(m => m.seeking) ? 'Pozostałe służby' : 'Wszystkie służby', list: serve.list.filter(m => !m.seeking) },
    ].filter(x => x.list.length))
    const canCreateMinistry = computed(() => canManage.value || (me.value?.roles || []).includes('lider'))
    // Lider: dodawanie osób od razu (bez zgłoszenia) i usuwanie ze służby.
    const addTo = ref(null), addQuery = ref(''), addPeople = ref([])
    function openAddPerson(m) {
      addTo.value = m; addQuery.value = ''
      if (!addPeople.value.length) api.call('ministryPeople').then(r => { addPeople.value = r.people || [] }, e => { error.value = e.message })
    }
    const addCandidates = computed(() => {
      const q = addQuery.value.trim().toLowerCase(), m = addTo.value
      if (!m) return []
      return addPeople.value.filter(p => !m.people.some(x => x.id === p.id) && (!q || (p.name + ' ' + (p.grupa || '')).toLowerCase().includes(q)))
    })
    const addPerson = p => guard(async () => { const id = addTo.value.id; await api.call('addToMinistry', { id, who: p.id }); api.call('pushInbox').catch(() => {}); await loadServe(); addTo.value = serve.list.find(x => x.id === id) || null })
    async function removeFromMinistry(m, p) { if ((await ask('Usunąć ' + p.name + ' ze służby „' + m.name + '”?'))) serveCall('decideMinistry', { id: m.id, who: p.id, accept: false }) }
    const joinMinistry = m => serveCall('joinMinistry', { id: m.id })
    async function leaveMinistry(m) { if ((await ask(m.mine === 'active' ? `Zrezygnować ze służby „${m.name}”?` : 'Wycofać zgłoszenie?'))) serveCall('leaveMinistry', { id: m.id }) }
    const decideMinistry = (m, p, accept) => serveCall('decideMinistry', { id: m.id, who: p.id, accept })
    function editMinistry(m = null) {
      mEdit.value = m ? { id: m.id, name: m.name, description: m.description, seeking: m.seeking, leaders: m.leaders.map(l => l.id), isNew: false, full: !!m.full }
        : { id: uid(), name: '', description: '', seeking: true, leaders: [], isNew: true, full: true }
      if (mEdit.value.full && !memberNames.value.length) api.call('memberNames').then(r => { memberNames.value = r.people || [] }, () => {})
    }
    function toggleLeader(id) { const l = mEdit.value.leaders; mEdit.value.leaders = l.includes(id) ? l.filter(x => x !== id) : [...l, id] }
    const saveMinistry = () => guard(async () => { const m = mEdit.value; await api.call('saveMinistry', m.full ? { ...m, leaders: m.leaders.filter(id => memberNames.value.some(p => p.id === id)) } : m); mEdit.value = null; await loadServe() })
    async function deleteMinistry() { if ((await ask('Usunąć tę służbę razem z listą osób?'))) guard(async () => { await api.call('deleteMinistry', { id: mEdit.value.id }); mEdit.value = null; await loadServe() }) }
    // Konto bez imienia i nazwiska (jedno słowo albo puste) — ostrzeżenie przy koncie i w profilu.
    const needsName = computed(() => api.enabled && !!me.value && !/\S+\s+\S+/.test((me.value.name || '').trim()))

    /* ---------- mój profil ---------- */
    const profileView = ref(false), groupNames = ref([])
    const profile = reactive({ name: '', grupa: '' })
    const profileDirty = computed(() => profile.name.trim() !== (me.value?.name || '') || profile.grupa.trim() !== (me.value?.grupa || ''))
    function openProfile() {
      if (!api.enabled || !me.value) return
      profile.name = me.value.name || ''; profile.grupa = me.value.grupa || ''; status.value = ''
      current.value = null; currentEvent.value = null; currentAnn.value = null; currentProto.value = null
      songView.value = false; peopleView.value = false; calView.value = false; gcalView.value = false; annView.value = false; protoView.value = false; tplView.value = false
      serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; svcListView.value = false; votesView.value = false; bugsView.value = false; profileView.value = true; scrollTo(0, 0); loadServe()
      api.call('groups').then(r => { groupNames.value = r.groups || [] }, () => {})
    }
    const saveProfile = () => guard(async () => {
      me.value = (await api.call('setProfile', { name: profile.name.trim(), grupa: profile.grupa.trim() })).person
      status.value = 'Zapisano o ' + clockNow()
    })

    /* ---------- powiadomienia do wybranych osób ---------- */
    const canNotify = computed(() => api.enabled && useSupa && canEdit.value)
    const notify = reactive({ open: false, ids: [], error: '', query: '', mode: 'notify', keep: [] })
    const directory = ref([])
    // To samo okienko wybiera odbiorców powiadomienia albo osoby biorące udział w wydarzeniu (mode: 'people').
    function openNotify(mode = 'notify') {
      notify.mode = mode === 'people' ? 'people' : 'notify'
      if (notify.mode === 'people') { notify.keep = notify.ids; notify.ids = (currentEvent.value?.people || []).map(p => p.id) }
      notify.open = true; notify.error = ''; notify.query = ''
      if (!directory.value.length) api.call('directory').then(r => { directory.value = r.people || [] }, e => { notify.error = e.message })
    }
    function closeNotify() {
      notify.open = false
      if (notify.mode !== 'people') return
      const known = new Map((currentEvent.value?.people || []).map(p => [p.id, p.name]))
      if (currentEvent.value) currentEvent.value.people = notify.ids.map(id => ({ id, name: directory.value.find(p => p.id === id)?.name || known.get(id) || 'Osoba' }))
      notify.ids = notify.keep; notify.keep = []; notify.mode = 'notify'
    }
    // Grupy: wszyscy i każda ranga (z liczbą osób).
    const notifyGroups = computed(() => [
      { id: 'all', name: 'Wszyscy', ids: directory.value.map(p => p.id) },
      ...[...new Set(directory.value.map(p => p.grupa).filter(Boolean))].sort().map(n => ({ id: 'g:' + n, name: n, ids: directory.value.filter(p => p.grupa === n).map(p => p.id) })),
      ...ranks.value.map(r => ({ id: r.id, name: r.name, ids: directory.value.filter(p => (p.roles || []).includes(r.id)).map(p => p.id) })).filter(g => g.ids.length),
    ])
    // Wyszukiwarka w okienku: po imieniu, adresie i grupce; grupy — po nazwie.
    const directoryShown = computed(() => { const q = plain(notify.query.trim()); return q ? directory.value.filter(p => plain(p.name + ' ' + p.email + ' ' + (p.grupa || '')).includes(q)) : directory.value })
    const notifyGroupsShown = computed(() => { const q = plain(notify.query.trim()); return q ? notifyGroups.value.filter(g => plain(g.name).includes(q)) : notifyGroups.value })
    function toggleGroup(g) {
      const all = g.ids.every(id => notify.ids.includes(id))
      notify.ids = all ? notify.ids.filter(id => !g.ids.includes(id)) : [...new Set([...notify.ids, ...g.ids])]
    }
    const notifySummary = computed(() => {
      const names = directory.value.filter(p => notify.ids.includes(p.id)).map(p => p.name)
      return names.length > 3 ? names.slice(0, 2).join(', ') + ' i ' + (names.length - 2) + ' innych' : names.join(', ') || notify.ids.length + ' osób'
    })
    // Po zapisaniu: wysyłka do wybranych; zwraca dopisek do komunikatu „Zapisano…”.
    async function sendNotify(msg) {
      if (!notify.ids.length) return ''
      try {
        const r = await api.call('notify', { people: notify.ids, ...msg })
        notify.ids = []
        return ' · powiadomienie wysłane (' + (r.inApp || 0) + ' ' + ((r.inApp || 0) === 1 ? 'osoba' : 'os.') + ' w aplikacji' + (r.sent ? ', ' + r.sent + ' ' + (r.sent === 1 ? 'telefon' : 'telefony') : '') + ')'
      } catch (e) { return ' · powiadomienie nie wyszło: ' + e.message }
    }

    /* ---------- newsletter ---------- */
    const newsBusy = ref(false)
    // Próbny newsletter: prośba w bazie, wysyła skrypt Google (co 15 minut); sprawdzamy, kiedy wyszedł.
    const mailTest = reactive({ busy: false, text: '', bad: false })
    async function testNewsletter() {
      mailTest.busy = true; mailTest.text = ''; mailTest.bad = false
      try {
        const { id } = await api.call('testNewsletter')
        mailTest.text = 'Wysłano prośbę — e-mail przyjdzie na ' + me.value.email + ' w ciągu kwadransa.'
        for (let i = 0; i < 54; i++) {
          await new Promise(r => setTimeout(r, 20000))
          const st = await api.call('mailStatus', { id }).catch(() => null)
          if (st?.sent) { mailTest.text = 'E-mail wysłany na ' + me.value.email + ' — sprawdź skrzynkę (także Spam).'; return }
        }
        mailTest.text = canManage.value ? 'E-mail jeszcze nie wyszedł. Wysyła go skrypt Google (skrypty/baza.gs) — wklej jego nową wersję w Apps Script i raz uruchom „ustawNewsletterBazy”. Włączony newsletter nie jest potrzebny.'
          : 'E-mail jeszcze nie wyszedł — skrypt wysyłający (Google) nie jest jeszcze ustawiony. Daj znać administratorowi.'
        mailTest.bad = true
      } catch (e) { mailTest.text = e.message; mailTest.bad = true } finally { mailTest.busy = false }
    }
    async function toggleNewsletter() {
      newsBusy.value = true; error.value = ''
      try { me.value = (await api.call('setNewsletter', { on: !me.value?.newsletter })).person } catch (e) { error.value = e.message } finally { newsBusy.value = false }
    }

    /* ---------- podgląd publiczny (goście i osoby czekające na zatwierdzenie) ---------- */
    const pub = ref(null)
    const pubItems = computed(() => {
      if (!pub.value) return []
      const color = id => pub.value.types.find(t => t.id === id)?.color || typeOf(id).color
      const name = id => pub.value.types.find(t => t.id === id)?.name || typeOf(id).name
      return [
        ...pub.value.services.map((s, i) => ({ key: 's' + i, date: s.date, time: s.time || DEFAULT_TIME, place: s.place || DEFAULT_PLACE, title: 'Nabożeństwo' + (s.sermonTitle ? ': ' + s.sermonTitle : ''), sub: [s.passage, s.speaker].filter(Boolean).join(' · '), color: color('nabozenstwo') })),
        ...pub.value.events.map((e, i) => ({ key: 'e' + i, date: e.date, time: e.time, place: e.place, title: e.title || name(e.type), sub: e.description, color: color(e.type) })),
      ].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    })
    // Podgląd: najbliższe 7 dni jako kartki (jak tydzień na stronie głównej).
    const pubWeek = computed(() => Array.from({ length: 7 }, (_, i) => {
      const date = localDate(new Date(asDate(todayStr.value).getTime() + i * 86400000))
      return { date, wd: wd(date), n: day(date), items: pubItems.value.filter(it => it.date === date) }
    }))
    /* ---------- ASB: grafik spotkań i pomysły ---------- */
    const asbView = ref(false), asbForm = ref(null), asbPreview = ref(null) // asbPreview: podgląd spotkania (bez edycji)
    const asb = reactive({ meetings: [], ideas: [], people: [], pub: [], pubAll: false, season: '', tab: 'plan', kind: '', busy: false, error: '', ideaTopic: '', ideaAuthor: '' })
    const canAsb = computed(() => api.enabled && (canManage.value || (me.value?.roles || []).includes('asb')))
    // Rodzaje spotkań (kolory w CSS: .k-cykliczne, .k-wewnetrzne, .k-ewangelizacyjne).
    const ASB_KINDS = [{ id: 'cykliczne', name: 'Cykliczne', plural: 'Cykliczne' }, { id: 'wewnetrzne', name: 'Wewnętrzne', plural: 'Wewnętrzne' }, { id: 'ewangelizacyjne', name: 'Ewangelizacyjne', plural: 'Ewangelizacyjne' }]
    const asbKindName = k => ASB_KINDS.find(x => x.id === k)?.name || 'Cykliczne'
    const asbPause = m => /^(przerwa|brak)$/i.test(m.leader) && !m.topic
    const asbTitle = m => m.topic || (asbPause(m) ? 'Przerwa' : m.kind === 'wewnetrzne' ? 'Spotkanie wewnętrzne' : m.kind === 'ewangelizacyjne' ? 'Spotkanie ewangelizacyjne' : 'Temat do ustalenia')
    // Rok akademicki dla dzisiejszej daty: od września do sierpnia.
    const seasonOf = d => { const [y, m] = d.split('-').map(Number); return m >= 9 ? y + '/' + (y + 1) : (y - 1) + '/' + y }
    const asbSeasons = computed(() => [...new Set(asb.meetings.map(m => m.season))].sort().reverse())
    // Kolejność: według daty; wiersze bez daty (np. wakacyjne przerwy) zostają za poprzednim w grafiku.
    const asbList = computed(() => {
      let key = ''
      return asb.meetings.filter(m => m.season === asb.season).sort((a, b) => a.sort - b.sort)
        .map(m => ({ m, key: (key = m.date || key) })).sort((a, b) => a.key.localeCompare(b.key) || a.m.sort - b.m.sort).map(x => x.m)
    })
    const asbGroups = computed(() => {
      const out = []
      let prevConcept = null
      for (const m of asbList.value) {
        if (asb.kind === 'braki' ? !asbMissing(m).length : asb.kind && m.kind !== asb.kind) continue
        const key = m.month || 'Bez miesiąca'
        let g = out[out.length - 1]
        if (!g || g.month !== key) out.push(g = { month: key, list: [] })
        const cyc = m.kind === 'cykliczne'
        g.list.push({ ...m, conceptStart: cyc && !!m.concept && m.concept !== prevConcept })
        if (cyc) prevConcept = m.concept
      }
      return out
    })
    // Najbliższe spotkania (od dziś), którym czegoś brakuje.
    const asbMissing = m => (!m.date || m.date < todayStr.value || asbPause(m) ? [] : [!m.topic.trim() && 'tematu', !m.leader.trim() && 'prowadzącego', !m.place.trim() && 'miejsca'].filter(Boolean))
    const asbMissingCount = computed(() => asbList.value.filter(m => asbMissing(m).length).length)
    // Kto dostanie przypomnienie 3 dni przed (tak samo jak baza: imię i nazwisko albo jednoznaczne imię z rangą ASB).
    const asbWho = name => {
      const n = (name || '').trim().toLowerCase()
      if (!n) return null
      const full = asb.people.find(p => p.name.trim().toLowerCase() === n)
      if (full) return full
      const first = asb.people.filter(p => p.name.trim().toLowerCase().split(' ')[0] === n)
      return first.length === 1 ? first[0] : null
    }
    const asbLeaderHints = computed(() => {
      const m = asbForm.value
      if (!m || asbPause(m) || !asb.people.length) return []
      return [...new Set([m.leader, m.helper].map(x => (x || '').trim()).filter(Boolean))].map(x => {
        const p = asbWho(x)
        return p ? { text: p.name + ' dostanie przypomnienie 3 dni przed spotkaniem.' }
          : { bad: true, text: '„' + x + '” — brak osoby z rangą ASB o tym imieniu (albo jest kilka takich), więc przypomnienie nie dojdzie. Wpisz imię i nazwisko jak w aplikacji.' }
      })
    })
    // Terminarz publiczny (goście i osoby bez rangi ASB).
    const asbPubUpcoming = computed(() => asb.pub.filter(m => m.date >= todayStr.value))
    const asbPubShown = computed(() => (asb.pubAll ? asbPubUpcoming.value : asbPubUpcoming.value.slice(0, 4)))
    const asbPubGroups = computed(() => {
      const out = []
      for (const m of (canAsb.value || !ready.value ? asbPubShown.value : asbPubUpcoming.value)) {
        const key = MONTHS_UP[+m.date.slice(5, 7) - 1]
        let g = out[out.length - 1]
        if (!g || g.month !== key) out.push(g = { month: key, list: [] })
        g.list.push(m)
      }
      return out
    })
    async function loadAsbPublic() {
      try { asb.pub = ((await api.call('asbPublic')) || []).map(m => ({ ...m, date: String(m.date).slice(0, 10) })) } catch { /* dodatek */ }
    }
    const asbNext = computed(() => asbList.value.find(m => m.date && m.date >= todayStr.value && !asbPause(m)) || null)
    const asbAvg = computed(() => { const a = asbList.value.filter(m => m.attendance != null); return a.length ? Math.round(a.reduce((n, m) => n + m.attendance, 0) / a.length) : 0 })
    const asbPlaces = computed(() => [...new Set(asb.meetings.map(m => m.place).filter(Boolean))])
    const asbCalNote = computed(() => {
      const m = asbForm.value
      if (!m) return ''
      if (!m.date) return 'Bez daty — nie trafi do kalendarza kościelnego.'
      if (asbPause(m)) return 'Przerwa — nie trafia do kalendarza kościelnego.'
      return m.kind === 'wewnetrzne' ? 'Po zapisaniu pojawi się w kalendarzu kościelnym — tylko dla członków (goście go nie widzą). Notatka i rozważanie zostają w ASB.'
        : 'Po zapisaniu pojawi się w kalendarzu kościelnym (widzą je też goście). Notatka i rozważanie zostają w ASB.'
    })
    const MONTHS_UP = ['STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC', 'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ']
    async function loadAsb() {
      asb.busy = true; asb.error = ''
      try {
        if (!canAsb.value) { asb.tab = 'plan'; await loadAsbPublic(); return }
        api.call('asbPeople').then(p => { asb.people = p || [] }, () => {})
        const r = await api.call('asbLoad')
        asb.meetings = r.meetings.map(m => ({ ...m, kind: m.kind || 'cykliczne', time: m.time ?? '', files: Array.isArray(m.files) ? m.files : [] })); asb.ideas = r.ideas
        if (!asb.season || !asbSeasons.value.includes(asb.season)) asb.season = asbSeasons.value.includes(seasonOf(todayStr.value)) ? seasonOf(todayStr.value) : asbSeasons.value[0] || seasonOf(todayStr.value)
      } catch (e) { asb.error = e.message } finally { asb.busy = false }
    }
    function openAsb() {
      if (!api.enabled) return Promise.resolve()
      loadMsgOpts()
      profileView.value = false; songView.value = false; peopleView.value = false; calView.value = false; moreView.value = false; gcalView.value = false
      annView.value = false; protoView.value = false; tplView.value = false; serveView.value = false; listenView.value = false
      asbView.value = true; scrollTo(0, 0); return loadAsb()
    }
    // Konkretne spotkanie (link z przypomnienia ?asb=id albo „Otwórz w ASB” w kalendarzu).
    function asbOpenId(id) {
      const m = asb.meetings.find(x => x.id === id)
      if (!m) { if (canAsb.value) error.value = 'Nie znaleziono tego spotkania ASB — mogło zostać usunięte.'; return }
      asb.tab = 'plan'; asb.season = m.season; asbEdit(m)
    }
    function openAsbMeeting(id) { resetViews(); openAsb().then(() => asbOpenId(id)) }
    function asbEdit(m = null, idea = null) {
      error.value = ''
      if (m) { const { conceptStart, ...row } = m; asbForm.value = { ...row, files: [...(row.files || [])], _removed: [], attendance: row.attendance ?? '' }; return }
      const cyc = asbList.value.filter(x => x.date && x.kind === 'cykliczne')
      const last = cyc.at(-1)
      const kind = asb.kind || 'cykliczne'
      const next = last && kind === 'cykliczne' ? localDate(new Date(asDate(last.date).getTime() + 7 * 86400000)) : todayStr.value
      asbForm.value = { _new: true, _removed: [], id: uid(), kind, season: asb.season || seasonOf(next), sort: Math.max(0, ...asb.meetings.filter(x => x.season === asb.season).map(x => x.sort)) + 1, date: next, time: last?.time || '19:00', month: MONTHS_UP[+next.slice(5, 7) - 1],
        concept: kind === 'cykliczne' ? last?.concept || '' : '', leader: '', helper: '', topic: idea?.topic || '', place: last?.place || '', attendance: '', note: '', study: '', files: [], int_date: '', int_organizer: '', int_idea: '' }
    }
    const asbWhen = t => { const d = new Date(t); return pretty(localDate(d)) + ', ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) }
    function asbAutoMonth() { if (asbForm.value.date) asbForm.value.month = MONTHS_UP[+asbForm.value.date.slice(5, 7) - 1] }
    async function asbPersist() {
      const m = asbForm.value
      if (m.date) m.month = MONTHS_UP[+m.date.slice(5, 7) - 1]
      await api.call('asbSave', { ...m, season: m.season.trim(), date: m.date || null, concept: m.kind === 'cykliczne' ? m.concept : '', attendance: m.attendance === '' || m.attendance == null ? null : +m.attendance })
      for (const p of m._removed) drive.removeAsbFile?.(p)
      m._removed = []; m._new = false
    }
    const asbSave = () => guard(async () => {
      const season = asbForm.value.season.trim()
      await asbPersist(); asbForm.value = null; await loadAsb(); asb.season = season
    })
    const asbRemind = async () => {
      if (!(await ask('Wysłać przypomnienie o tym spotkaniu wszystkim z rangą ASB? (Najpierw zapiszę zmiany.)'))) return
      guard(async () => {
        await asbPersist()
        const n = await api.call('asbRemind', { id: asbForm.value.id })
        asbForm.value.reminded = new Date().toISOString()
        showToast(n ? 'Wysłano przypomnienie do ' + n + (n === 1 ? ' osoby' : ' osób') : 'Nikt poza Tobą nie ma rangi ASB — nie było do kogo wysłać.')
        loadAsb()
      })
    }
    // załączniki spotkania ASB (rozważanie, materiały, prezentacja) — kilka plików naraz
    const asbAddFile = e => {
      const list = [...(e.target.files || [])]; e.target.value = ''
      if (!list.length) return
      const big = list.find(f => f.size > 25 * 1024 * 1024)
      if (big) { error.value = 'Plik „' + big.name + '” jest za duży (najwyżej 25 MB).'; return }
      guard(async () => { for (const f of list) { const path = await drive.uploadAsbFile(f); asbForm.value?.files.push({ name: f.name, path }) } })
    }
    async function asbRemoveFile(f) {
      if (!(await ask('Usunąć załącznik „' + f.name + '”? (Zniknie po zapisaniu spotkania.)'))) return
      asbForm.value.files = asbForm.value.files.filter(x => x.path !== f.path); asbForm.value._removed.push(f.path)
    }
    function asbOpenFile(f) {
      const w = window.open('', '_blank')
      guard(async () => { const u = await drive.asbFileUrl(f.path); if (w) w.location.href = u; else location.href = u })
    }
    async function asbDelete() {
      if (!(await ask('Usunąć to spotkanie z grafiku? Zniknie też z kalendarza kościelnego.'))) return
      guard(async () => {
        const m = asbForm.value
        await api.call('asbDelete', { id: m.id })
        for (const p of [...m.files.map(f => f.path), ...m._removed]) drive.removeAsbFile?.(p)
        asbForm.value = null; await loadAsb()
      })
    }
    const asbIdeaAdd = () => { if (asb.ideaTopic.trim()) guard(async () => { await api.call('asbIdea', { id: uid(), topic: asb.ideaTopic.trim(), author: asb.ideaAuthor.trim() || me.value?.name?.split(' ')[0] || '' }); asb.ideaTopic = ''; asb.ideaAuthor = ''; await loadAsb() }) }
    async function asbIdeaDelete(i) { if ((await ask('Usunąć pomysł „' + i.topic + '”?'))) guard(async () => { await api.call('asbIdeaDelete', { id: i.id }); await loadAsb() }) }

    /* ---------- skład zespołu ---------- */
    const INSTRUMENTS = ['Wokal prowadzący', 'Wokal', 'Gitara akustyczna', 'Gitara elektryczna', 'Gitara basowa', 'Klawisze', 'Perkusja', 'Cajon', 'Skrzypce', 'Saksofon', 'Dźwięk (realizacja)']
    // Stary zapis tekstem („Ania — wokal, Marek — gitara”) → lista; lista → tekst (dla newslettera, streamu i aplikacji na komputer).
    function withBand(sv) {
      if (!Array.isArray(sv.bandList)) sv.bandList = String(sv.band || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)
        .map(x => { const [name, ...rest] = x.split(/\s+[—–-]\s+/); return { key: uid(), name: name.trim(), instrument: rest.join(' — ').trim() } })
      return sv
    }
    const bandText = list => list.map(b => b.name + (b.instrument ? ' — ' + b.instrument.toLowerCase() : '')).join(', ')
    // tylko zmiana tej samej listy (dodanie, usunięcie, instrument) — samo otwarcie nabożeństwa niczego nie zmienia
    watch(() => current.value?.bandList, (list, old) => { if (list && list === old && current.value) { const t = bandText(list); if (t !== current.value.band) current.value.band = t } }, { deep: true })
    const bandPick = reactive({ open: false, query: '', people: [], busy: false, error: '', loaded: false })
    const bandPickList = computed(() => {
      const q = plain(bandPick.query.trim()), taken = (current.value?.bandList || []).map(b => b.name.toLowerCase())
      return bandPick.people.filter(p => !taken.includes(p.name.toLowerCase()) && (!q || plain(p.name).includes(q)))
    })
    async function openBandPick() {
      Object.assign(bandPick, { open: true, query: '', error: '' })
      if (bandPick.loaded || !api.enabled) return
      bandPick.busy = true
      try { bandPick.people = (await api.call('bandPeople')) || []; bandPick.loaded = true } catch (e) { bandPick.error = e.message } finally { bandPick.busy = false }
    }
    function bandAdd(name) {
      const b = { key: uid(), name: name.trim(), instrument: '' }
      current.value.bandList.push(b)
      bandPick.open = false
      // od razu wybór instrumentu dla tej osoby
      nextTick(() => { const el = document.querySelector('[data-band="' + b.key + '"]'); el?.focus(); try { el?.showPicker?.() } catch { /* nie każda przeglądarka */ } })
    }
    function bandPickFree() { if (bandPick.query.trim()) bandAdd(bandPick.query) }

    /* ---------- wiadomości do rang i służb ---------- */
    const msg = reactive({ open: false, opts: null, title: '', body: '', ranks: [], ministries: [], busy: false, error: '' })
    const msgRanks = computed(() => msg.opts?.ranks || [])
    const msgMinistries = computed(() => msg.opts?.ministries || [])
    const canMsg = computed(() => !!(msgRanks.value.length || msgMinistries.value.length))
    let msgLoading = null
    function loadMsgOpts() {
      if (!api.enabled || !useSupa || me.value?.status !== 'active') return Promise.resolve()
      return msgLoading || (msgLoading = api.call('broadcastOptions').then(o => { msg.opts = o }, () => { msgLoading = null }))
    }
    async function openMsg(pre = {}) {
      Object.assign(msg, { open: true, title: '', body: '', ranks: pre.ranks || [], ministries: pre.ministries || [], error: '' })
      await loadMsgOpts()
    }
    function msgToggle(key, id) { msg[key] = msg[key].includes(id) ? msg[key].filter(x => x !== id) : [...msg[key], id] }
    async function sendMsg() {
      msg.busy = true; msg.error = ''
      try {
        const r = await api.call('broadcast', { title: msg.title.trim(), body: msg.body.trim(), ranks: msg.ranks, ministries: msg.ministries })
        msg.open = false
        showToast(r.count ? 'Wysłano do ' + r.count + (r.count === 1 ? ' osoby' : ' osób') + (r.sent ? ' · ' + r.sent + ' na telefon' : '') : 'Nikt poza Tobą nie jest w tej grupie.')
      } catch (e) { msg.error = e.message } finally { msg.busy = false }
    }

    /* ---------- Cele wsparcia ---------- */
    // Rada ogłasza cel (kwota, termin). Członek deklaruje, ile ze SWOJEJ dziesięciny przeznacza na cel co miesiąc,
    // a po miesiącu potwierdza, że jego dziesięcina pokryła wszystkie deklaracje — albo je zmniejsza (cele.sql).
    const goalsView = ref(false)
    const goals = reactive({ list: [], status: { months: [], monthly: 0 }, canManage: false, busy: false, error: '', open: '', edit: null, amount: {}, people: {}, reduce: null, confirming: null, sent: false, expand: '' })
    const support = ref({}), supportEdit = reactive({ account: '', name: '', title: '', blik: '' })
    async function loadSupport() { try { support.value = (await api.call('support')) || {}; Object.assign(supportEdit, { account: '', name: '', title: '', blik: '' }, support.value) } catch { /* bez danych */ } }
    const saveSupport = () => guard(async () => { await api.call('setSupport', { ...supportEdit }); await loadSupport(); showToast('Zapisano dane do przelewu.') })
    const transferTitle = m => [(support.value.title || 'Dziesięcina') + ' ' + String(m.month).slice(5, 7) + '/' + String(m.month).slice(0, 4), me.value?.name].filter(Boolean).join(' — ')
    const copiedWhat = ref('')
    async function copyText(t, what) { try { await navigator.clipboard.writeText(t); copiedWhat.value = what; setTimeout(() => { if (copiedWhat.value === what) copiedWhat.value = '' }, 1800) } catch { /* bez schowka */ } }
    const zl = n => (Math.round(+n || 0)).toLocaleString('pl') + ' zł'
    const thisMonth = computed(() => todayStr.value.slice(0, 7) + '-01')
    const prevMonth = computed(() => { const d = new Date(thisMonth.value + 'T12:00'); d.setMonth(d.getMonth() - 1); return localDate(d).slice(0, 7) + '-01' })
    const monthName = m => (m ? new Date(String(m).slice(0, 10) + 'T12:00').toLocaleDateString('pl', { month: 'long', year: 'numeric' }) : '')
    const monthShort = m => (m ? new Date(String(m).slice(0, 10) + 'T12:00').toLocaleDateString('pl', { month: 'short' }).replace('.', '') : '')
    const itemsSum = m => (m?.items || []).reduce((t, it) => t + (+it.amount || 0), 0)
    // do potwierdzenia: poprzedni miesiąc bez potwierdzenia
    const goalDue = computed(() => (goals.status.months || []).find(m => !m.confirmed && String(m.month).slice(0, 10) < thisMonth.value && itemsSum(m) > 0) || null)
    // po potwierdzeniu (za ten albo poprzedni miesiąc) deklaracje zamknięte do 1. dnia następnego miesiąca (cele.sql)
    const monthLocked = computed(() => !!goals.status.locked)
    // zaległy miesiąc najpierw — bieżący pokazuje się dopiero po nim (jedno pytanie naraz)
    const shownMonths = computed(() => (goals.status.months || []).filter(m => m.confirmed || !goalDue.value || String(m.month).slice(0, 10) < thisMonth.value))
    const nextMonthStart = computed(() => { const d = new Date(thisMonth.value + 'T12:00'); d.setMonth(d.getMonth() + 1); return d.toLocaleDateString('pl', { day: 'numeric', month: 'long' }) })
    const goalPct = g => Math.min(100, Math.round((g.confirmed / g.target) * 100) || 0)
    const goalProjAmount = g => (g.kind === 'once' ? Math.max(g.confirmed, g.monthly) : g.months_left == null ? g.confirmed : g.confirmed + Math.max(0, g.monthly * g.months_left - g.confirmed_now))
    const goalProj = g => Math.min(100, Math.round((goalProjAmount(g) / g.target) * 100) || 0)
    async function loadGoals() {
      if (!api.enabled || !ready.value) return
      goals.busy = true; goals.error = ''
      try {
        const [list, st, can] = await Promise.all([api.call('goals'), api.call('pledgeStatus'), api.call('canGoals')])
        goals.list = list || []; goals.status = { months: [], monthly: 0, ...(st || {}) }; goals.canManage = !!can
        for (const g of goals.list) goals.amount[g.id] = g.mine || ''
      } catch (e) { goals.error = e.message || String(e) } finally { goals.busy = false }
    }
    function openGoals(id = '') {
      profileView.value = false; songView.value = false; peopleView.value = false; calView.value = false; moreView.value = false; gcalView.value = false
      annView.value = false; protoView.value = false; tplView.value = false; serveView.value = false; listenView.value = false; asbView.value = false
      svcListView.value = false; goalsView.value = true; goals.open = id; goals.edit = null; goals.reduce = null; scrollTo(0, 0)
      loadSupport()
      return loadGoals().then(() => {
        if (id && goals.canManage) loadGoalPeople(id)
        if (id) nextTick(() => document.querySelector('.goal.focus')?.scrollIntoView({ block: 'start' }))
      })
    }
    const savePledge = g => guard(async () => {
      const amt = Math.max(0, Math.round(+goals.amount[g.id] || 0))
      await api.call('pledgeSet', { g: g.id, amt })
      await loadGoals()
      showToast(amt ? 'Deklaracja: ' + zl(amt) + ' miesięcznie na „' + g.title + '”' : 'Wycofano deklarację')
    })
    // cel jednorazowy: potwierdzenie wpłaty (raz, ostatecznie)
    const confirmOnce = async g => { if ((await ask('Potwierdzić wpłatę ' + zl(g.mine) + ' na „' + g.title + '”? Tego nie da się zmienić.'))) guard(async () => { await api.call('pledgeOnceDone', { g: g.id }); await loadGoals(); showToast('Dziękujemy — wpłata potwierdzona.') }) }
    async function withdraw(g) { if ((await ask('Wycofać deklarację na „' + g.title + '”? To, co już potwierdziłeś, zostaje w zebranej kwocie.'))) { goals.amount[g.id] = 0; savePledge(g) } }
    function startReduce(m) { goals.confirming = null; goals.reduce = { month: m.month, items: (m.items || []).map(it => ({ ...it, value: it.amount })) } }
    // Dwa kroki: „Tak” (albo mniejsze kwoty) → przelew i ostateczne potwierdzenie (bez zmian do nowego miesiąca).
    const reducedAmounts = () => Object.fromEntries(goals.reduce.items.map(it => [it.goal, Math.max(0, Math.min(it.amount, Math.round(+it.value || 0)))]))
    function askConfirm(m, reduced = false) {
      const amounts = reduced ? reducedAmounts() : {}
      goals.confirming = { month: m.month, total: reduced ? Object.values(amounts).reduce((a, b) => a + b, 0) : itemsSum(m), amounts }
      goals.sent = false
      loadSupport()
    }
    const confirmMonth = m => guard(async () => {
      const total = await api.call('confirmMonth', { m: String(m.month).slice(0, 10), amounts: goals.confirming?.amounts || {} })
      goals.reduce = null; goals.confirming = null; goals.sent = false; goals.expand = ''
      await loadGoals()
      showToast('Potwierdzono ' + monthName(m.month) + ': ' + zl(total))
    })
    function newGoal() { goals.edit = { id: uid(), title: '', description: '', target: '', ends: '', open: false, kind: 'monthly', image: '', closed: false, _new: true }; scrollTo(0, 0) }
    function editGoal(g) { goals.edit = { id: g.id, title: g.title, description: g.description, target: g.target, ends: g.ends ? String(g.ends).slice(0, 10) : '', open: !g.ends, kind: g.kind || 'monthly', image: g.image, closed: !!g.closed, people: g.people }; scrollTo(0, 0) }
    const saveGoal = () => guard(async () => {
      const e = goals.edit
      if (e._new && !e.open && e.ends < todayStr.value) throw new Error('Termin nie może być w przeszłości.')
      await api.call('saveGoal', { goal: { ...e, title: e.title.trim(), target: Math.round(+e.target), ends: e.open ? null : e.ends } })
      goals.edit = null
      await loadGoals()
      showToast('Zapisano cel.')
    })
    const removeGoal = async g => { if ((await ask('Usunąć cel „' + g.title + '” razem z deklaracjami i potwierdzeniami? Tego nie da się cofnąć.'))) guard(async () => { await api.call('removeGoal', { id: g.id }); goals.edit = null; await loadGoals() }) }
    async function loadGoalPeople(id) { try { goals.people[id] = (await api.call('goalPeople', { g: id })) || [] } catch (e) { goals.error = e.message || String(e) } }
    function toggleGoalPeople(g) { if (goals.people[g.id]) delete goals.people[g.id]; else loadGoalPeople(g.id) }
    function pickGoalImage(e) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !goals.edit) return
      imgBusy.value = true
      guard(async () => { goals.edit.image = await drive.uploadImage(await shrinkImage(file, 1600)) }).finally(() => { imgBusy.value = false })
    }

    /* ---------- Wybory i głosowania (wybory.sql) ---------- */
    const votesView = ref(false), bugsView = ref(false)
    /* ---------- zgłoś błąd / backlog (administrator i deweloperzy) ---------- */
    const BUG_STATUS = { new: 'Nowe', doing: 'W trakcie', done: 'Zrobione', rejected: 'Odrzucone' }
    const bugs = reactive({ list: [], backlog: false, busy: false, error: '', filter: 'open', people: [], open: 0, form: null })
    // formularz zgłoszenia (z każdego miejsca aplikacji): gdzie i na czym — dopisywane samo
    function reportBug() { bugs.form = { title: '', body: '', busy: false, error: '', sent: false } }
    async function sendBug() {
      const f = bugs.form
      if (!f.title.trim()) return
      f.busy = true; f.error = ''
      try {
        const device = [navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] || '', /android|iphone|ipad/i.test(navigator.userAgent) ? 'telefon' : 'komputer', innerWidth + '×' + innerHeight, 'wersja ' + VERSION, window.knsDesktop ? 'aplikacja na komputer' : ''].filter(Boolean).join(' · ')
        await api.call('bugReport', { title: f.title.trim(), body: f.body.trim(), page: location.pathname + location.search, device })
        api.call('pushInbox').catch(() => {})
        f.sent = true
        if (bugsView.value) loadBugs()
      } catch (e) { f.error = e.message } finally { f.busy = false }
    }
    async function loadBugs() {
      bugs.busy = true; bugs.error = ''
      try {
        const r = await api.call('bugsList'); bugs.list = r.list; bugs.backlog = r.backlog
        if (bugs.backlog && !bugs.people.length) bugs.people = await api.call('backlogPeople')
      } catch (e) { bugs.error = e.message } finally { bugs.busy = false }
    }
    async function openBugs() { if (!(await closeAll())) return; resetViews(); bugsView.value = true; scrollTo(0, 0); loadBugs() }
    const bugsShown = computed(() => bugs.list.filter(b => bugs.filter === 'all' || (bugs.filter === 'open' ? ['new', 'doing'].includes(b.status) : bugs.filter === 'mine' ? b.mine : b.status === bugs.filter)))
    const bugCounts = computed(() => ({ open: bugs.list.filter(b => ['new', 'doing'].includes(b.status)).length, done: bugs.list.filter(b => b.status === 'done').length }))
    async function updateBug(b, patch) {
      try { await api.call('bugUpdate', { id: b.id, ...patch }); api.call('pushInbox').catch(() => {}); await loadBugs() } catch (e) { error.value = e.message }
    }
    const votes = reactive({ list: [], canRun: false, busy: false, error: '', edit: null, people: [], propose: {}, ballot: {}, open: '' })
    const votesOpen = computed(() => votes.list.filter(e => e.status === 'voting' && !e.voted).length)
    const VOTE_STATUS = { nominations: 'Zgłoszenia', ready: 'Przygotowane', voting: 'Głosowanie trwa', paused: 'Wstrzymane', closed: 'Zakończone' }
    const eventOf = e => (e.event_id ? events.value.find(x => x.id === e.event_id) || null : null)
    // spotkania do podpięcia: od tygodnia wstecz, najpierw członkowskie i rady
    const voteEvents = computed(() => events.value.filter(ev => ev.date >= localDate(new Date(Date.now() - 7 * 864e5)))
      .sort((a, b) => (['czlonkowskie', 'rada'].includes(b.type) - ['czlonkowskie', 'rada'].includes(a.type)) || a.date.localeCompare(b.date)).slice(0, 60))
    // wybór spotkania w głosowaniu: wyszukiwanie i filtr (spotkania członkowskie, rada, wszystkie); od 30 dni wstecz
    const voteEv = reactive({ query: '', type: 'meetings' })
    const VOTE_EV_TYPES = [['meetings', 'Spotkania członkowskie i rada'], ['czlonkowskie', 'Członkowskie'], ['rada', 'Rada zboru'], ['all', 'Wszystkie']]
    const voteEventsShown = computed(() => {
      const q = plain(voteEv.query.trim()), from = localDate(new Date(Date.now() - 30 * 864e5))
      const typeOk = ev => voteEv.type === 'all' || (voteEv.type === 'meetings' ? ['czlonkowskie', 'rada'].includes(ev.type) : ev.type === voteEv.type)
      return events.value.filter(ev => (ev.date >= from || ev.id === votes.edit?.event_id) && typeOk(ev) && (!q || plain([ev.title, typeOf(ev.type).name, ev.place, ev.date].join(' ')).includes(q)))
        .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40)
    })
    // głosowania podpięte pod otwarte wydarzenie
    /* ---------- trwa teraz: wydarzenie, które właśnie się odbywa; obecność na spotkaniach ---------- */
    const MEETINGS = ['czlonkowskie', 'rada']
    const isMeeting = ev => !!ev && MEETINGS.includes(ev.type)
    const yesterdayStr = computed(() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDate(d) })
    // od 45 min przed początkiem do ok. 5 godz. po nim (bez godziny — cały dzień); najpierw spotkania
    const liveEvent = computed(() => {
      now.value
      const t = Date.now()
      return events.value.filter(e => e.date === todayStr.value || e.date === yesterdayStr.value).filter(e => {
        const start = new Date(e.date + 'T' + (e.time || '00:00')).getTime()
        return t >= start - 45 * 60e3 && t <= start + (e.time ? 5 : 24) * 3600e3
      }).sort((a, b) => Number(isMeeting(b)) - Number(isMeeting(a)) || (a.time || '').localeCompare(b.time || ''))[0] || null
    })
    const attendance = reactive({}) // id spotkania → { count, members, me, names }
    const checkinBusy = ref(false)
    const canCheckIn = ev => isMeeting(ev) && api.enabled && me.value?.status === 'active' && [todayStr.value, yesterdayStr.value].includes(ev.date) && (ev.type !== 'rada' || votes.canRun || hasCouncil.value)
    async function loadAttendance(ev) {
      if (!isMeeting(ev) || !api.enabled) return
      try { attendance[ev.id] = await api.call('attendance', { id: ev.id }) } catch { /* bez stanu obecności */ }
    }
    async function checkIn(ev, on = true) {
      checkinBusy.value = true
      try { await api.call('checkin', { id: ev.id, on }); await loadAttendance(ev); toast.value = on ? 'Zameldowano — dziękujemy!' : 'Wycofano zameldowanie'; setTimeout(() => { toast.value = '' }, 2500) }
      catch (e) { error.value = e.message } finally { checkinBusy.value = false }
    }
    const liveVotes = computed(() => (liveEvent.value ? votes.list.filter(v => v.event_id === liveEvent.value.id && v.status !== 'closed') : []))
    watch(liveEvent, ev => { if (ev && api.enabled) { loadAttendance(ev); if (isMeeting(ev)) loadVotes().catch(() => {}) } }, { immediate: false })
    watch(ready, r => { if (r && liveEvent.value) { loadAttendance(liveEvent.value); if (isMeeting(liveEvent.value) && api.enabled) loadVotes().catch(() => {}) } })
    const eventVotes = computed(() => (currentEvent.value ? votes.list.filter(e => e.event_id === currentEvent.value.id) : []))
    function newVoteFor(id) { openVotes().then(() => newElection(id)) }
    function goToVote(e) { openVotes().then(() => { votes.open = e.id; nextTick(() => document.querySelector('.vote.focus')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }) }
    async function loadVotes() {
      if (!api.enabled || !ready.value) return
      votes.busy = true; votes.error = ''
      try {
        await api.call('electionsTick').catch(() => {}) // otwarcie / zakończenie w terminie (z powiadomieniem) — przy pierwszym wejściu po czasie
        const [list, can] = await Promise.all([api.call('elections'), api.call('canElections')]); votes.list = list || []; votes.canRun = !!can
      }
      catch (e) { votes.error = e.message || String(e) } finally { votes.busy = false }
    }
    async function loadElectionPeople() { if (!votes.people.length) try { votes.people = (await api.call('electionPeople')) || [] } catch (e) { votes.error = e.message } }
    function openVotes() {
      resetViews(); votesView.value = true; votes.edit = null; scrollTo(0, 0)
      return loadVotes().then(() => { if (votes.canRun || votes.list.some(e => e.status === 'nominations')) loadElectionPeople() })
    }
    // Głosowanie: jedna lista do wyboru — osoby (z listy członków) i dowolne odpowiedzi (np. Za / Przeciw);
    // opcjonalnie zgłoszenia od członków do terminu; głosowanie otwierane ręcznie albo w terminie od–do.
    const pad2 = n => String(n).padStart(2, '0')
    const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }
    const fromLocalInput = v => (v ? new Date(v).toISOString() : null)
    const voteWhen = iso => new Date(iso).toLocaleString('pl', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    // terminy na karcie: „Zgłoszenia do …”, „Głosowanie od … do …”
    function voteSchedule(e) {
      const out = []
      if (e.allow_nominations && e.status === 'nominations') out.push(e.nominations_until ? 'Zgłoszenia do ' + voteWhen(e.nominations_until) : 'Zgłoszenia do otwarcia głosowania')
      if (e.status === 'closed') { if (e.closed) out.push('Zakończone ' + voteWhen(e.closed)) }
      else if (e.vote_start && e.status !== 'voting' && e.status !== 'paused') out.push('Głosowanie od ' + voteWhen(e.vote_start) + (e.vote_end ? ' do ' + voteWhen(e.vote_end) : ''))
      else if (e.vote_end) out.push('Głosowanie do ' + voteWhen(e.vote_end))
      else if (e.status !== 'voting' && e.status !== 'paused') out.push('Głosowanie otworzy prowadzący')
      return out.join(' · ')
    }
    const optionsOf = e => (e.opts || []).filter(o => o.person || String(o.label || '').trim())
    function addOption(at = votes.edit.opts.length) { votes.edit.opts.splice(at, 0, { label: '' }); nextTick(() => (document.querySelectorAll('.vote-item input')[at] as HTMLInputElement)?.focus()) }
    function addPersonOption(p) { if (!votes.edit.opts.some(o => o.person === p.id)) votes.edit.opts.push({ person: p.id, label: p.name }) }
    function addYesNo() { for (const l of ['Za', 'Przeciw', 'Wstrzymuję się']) if (!votes.edit.opts.some(o => !o.person && o.label === l)) votes.edit.opts.push({ label: l }) }
    function moveOption(i, d) { const o = votes.edit.opts, j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]] }
    function newElection(eventId = '') {
      votes.edit = { _new: true, id: '', title: '', description: '', max_choices: 1, results_public: true, opts: [], status: 'ready', event_id: typeof eventId === 'string' ? eventId : '',
        allow_nominations: false, nominations_until: '', timed: false, vote_start: '', vote_end: '', has_votes: false, pending: 0 }
      loadElectionPeople(); scrollTo(0, 0)
    }
    function editElection(e) {
      const running = e.status === 'voting' || e.status === 'paused'
      votes.edit = { id: e.id, title: e.title, description: e.description, max_choices: e.max_choices, results_public: e.results_public, status: e.status, event_id: e.event_id || '',
        opts: e.candidates.filter(c => c.accepted === true).map(c => (c.person ? { person: c.person, label: c.label } : { label: c.label })),
        allow_nominations: !!e.allow_nominations, nominations_until: toLocalInput(e.nominations_until), timed: running ? !!e.vote_end : !!(e.vote_start || e.vote_end),
        vote_start: toLocalInput(e.vote_start), vote_end: toLocalInput(e.vote_end), has_votes: !!e.has_votes, pending: e.candidates.filter(c => c.accepted == null).length }
      loadElectionPeople(); scrollTo(0, 0)
    }
    // co jest nie tak w formularzu (przycisk Zapisz nieaktywny, z podpowiedzią)
    const voteFormProblem = computed(() => {
      const e = votes.edit
      if (!e) return ''
      if (!e.title.trim()) return 'Wpisz tytuł.'
      if (!e.has_votes && !e.allow_nominations && optionsOf(e).length < 1) return 'Dodaj co najmniej jedną osobę albo odpowiedź — albo pozwól członkom zgłaszać.'
      if (e.timed && !e.vote_start && !e.vote_end) return 'Podaj początek albo koniec głosowania.'
      if (e.timed && e.vote_start && e.vote_end && e.vote_end <= e.vote_start) return 'Koniec głosowania musi być po początku.'
      if (e.allow_nominations && e.nominations_until && e.timed && e.vote_start && e.nominations_until > e.vote_start) return 'Zgłoszenia muszą się skończyć przed początkiem głosowania.'
      return ''
    })
    const saveElection = () => guard(async () => {
      const e = votes.edit, running = !e._new && (e.status === 'voting' || e.status === 'paused')
      await api.call('electionSave', { e: {
        id: e.id || undefined, title: e.title.trim(), description: e.description || '', max_choices: Math.max(1, +e.max_choices || 1), results_public: !!e.results_public, event_id: e.event_id || '',
        allow_nominations: !!e.allow_nominations, nominations_until: e.allow_nominations ? fromLocalInput(e.nominations_until) : null,
        // trwające głosowanie zachowuje swój początek; w terminie — daty z formularza
        vote_start: running ? votes.list.find(x => x.id === e.id)?.vote_start || null : e.timed ? fromLocalInput(e.vote_start) : null,
        vote_end: e.timed ? fromLocalInput(e.vote_end) : null,
        ...(e.has_votes ? {} : { options: optionsOf(e).map(o => (o.person ? { person: o.person } : { label: o.label.trim() })) }),
      } })
      votes.edit = null
      await loadVotes()
      showToast('Zapisano głosowanie.')
    })
    const removeElection = async e => { if ((await ask('Usunąć „' + e.title + '” razem ze zgłoszeniami i głosami? Tego nie da się cofnąć.'))) guard(async () => { await api.call('electionRemove', { e: e.id }); votes.edit = null; await loadVotes() }) }
    // zgłoszenie osoby albo propozycji tekstem (i wycofanie własnego)
    const nominate = (e, { who = null, label = null } = {}, withdraw = false) => guard(async () => {
      await api.call('electionNominate', { e: e.id, who, label, withdraw })
      if (label && !withdraw) votes.propose[e.id] = ''
      await loadVotes()
      showToast(withdraw ? 'Wycofano zgłoszenie.' : 'Zgłoszono — rada zdecyduje, co trafi na listę.')
    })
    const reviewCand = (c, ok) => guard(async () => { await api.call('electionReview', { c: c.id, ok }); await loadVotes() })
    const setElectionStatus = async (e, s) => {
      const question = s === 'voting' && ['nominations', 'ready'].includes(e.status) ? 'Otworzyć głosowanie teraz? ' + (e.status === 'nominations' ? 'Zgłoszenia zostaną zamknięte, a c' : 'C') + 'złonkowie dostaną powiadomienie.' : s === 'closed' ? 'Zakończyć głosowanie? Potem nie da się już oddać głosu.' : ''
      if (!question || (await ask(question))) guard(async () => { await api.call('electionStatus', { e: e.id, s }); await loadVotes(); if (s !== 'closed') showToast(s === 'paused' ? 'Głosowanie wstrzymane.' : 'Głosowanie aktywne.') })
    }
    function toggleBallot(e, c) {
      const cur = votes.ballot[e.id] || []
      votes.ballot[e.id] = e.max_choices === 1 ? (cur[0] === c.id ? [] : [c.id]) : cur.includes(c.id) ? cur.filter(x => x !== c.id) : cur.length < e.max_choices ? [...cur, c.id] : cur
    }
    const castVote = async e => {
      const chosen = (votes.ballot[e.id] || []).map(id => e.candidates.find(c => c.id === id)?.label).filter(Boolean)
      if (!(await ask('Oddać głos na: ' + chosen.join(', ') + '?\n\nGłos jest tajny i ostateczny — nie da się go zmienić.'))) return
      guard(async () => { await api.call('electionVote', { e: e.id, choices: votes.ballot[e.id] }); votes.ballot[e.id] = []; await loadVotes(); showToast('Głos oddany. Dziękujemy!') })
    }
    watch(ready, ok => { if (ok && api.enabled) loadVotes() }, { immediate: true })

    /* ---------- Posłuchaj ---------- */
    const listen = ref({}), listenView = ref(false)
    const listenEdit = reactive({ youtube: '', youtubeMore: '', spotify: '' })
    // Adres kanału (np. …/@nazwa) → zawsze najnowszy film (funkcja na serwerze czyta kanał RSS YouTube);
    // konkretny film albo playlista — bez zmian. Spotify: odtwarzacz podcastu sam zaczyna od najnowszego odcinka.
    const listenLatest = ref(null)
    const isChannelLink = u => !!u && !/[?&]list=/.test(u) && videoInfo(u)?.kind !== 'youtube'
    const listenYt = computed(() => listenLatest.value ? 'https://www.youtube-nocookie.com/embed/' + listenLatest.value.video : youtubeEmbed(listen.value.youtube))
    async function loadLatest() {
      const u = listen.value.youtube
      listenLatest.value = null
      if (!isChannelLink(u) || !location.protocol.startsWith('http')) return
      try {
        const r = await (await fetch('/api/najnowsze?yt=' + encodeURIComponent(u))).json()
        if (r.video && listen.value.youtube === u) listenLatest.value = r
      } catch { /* zostaje lista filmów kanału albo nic */ }
    }
    const listenSp = computed(() => spotifyEmbed(listen.value.spotify))
    async function loadListen() {
      if (!api.enabled) return
      try { listen.value = (await api.call('listen')) || {}; Object.assign(listenEdit, { youtube: '', youtubeMore: '', spotify: '' }, listen.value); loadLatest() } catch { /* dodatek */ }
    }
    function openListen() {
      profileView.value = false; songView.value = false; peopleView.value = false; calView.value = false; moreView.value = false; gcalView.value = false
      annView.value = false; protoView.value = false; tplView.value = false; serveView.value = false; asbView.value = false; goalsView.value = false; svcListView.value = false; votesView.value = false; bugsView.value = false
      listenView.value = true; scrollTo(0, 0); loadListen()
    }
    const saveListen = () => guard(async () => { await api.call('setListen', { ...listenEdit }); await loadListen(); status.value = 'Zapisano linki.' })
    loadListen()
    // Gość: terminarz ASB na stronie startowej; link /asb otwiera go w całości.
    loadAsbPublic().then(() => {
      if (!ready.value && /^\/asb/.test(location.pathname)) { asb.pubAll = true; nextTick(() => document.getElementById('asb-terminarz')?.scrollIntoView({ block: 'start' })) }
    })
    async function loadPublic() {
      if (!api.enabled || pub.value) return
      try { pub.value = await api.call('public') } catch { /* podgląd jest tylko dodatkiem */ }
    }
    loadPublic()
    const eventIsPublic = ev => (ev.public === undefined ? !['czlonkowskie', 'rada'].includes(ev.type) : !!ev.public)
    /* ---------- Start i Więcej ---------- */
    const moreView = ref(false)
    /* ---------- Kalendarz Google (subskrypcja iCal z prywatnym kluczem) ---------- */
    const gcalView = ref(false)
    const gcal = reactive({ url: '', google: '', webcal: '', busy: false, error: '', copied: false })
    async function loadGcal(renew = false) {
      gcal.busy = true; gcal.error = ''
      try {
        const { token } = await api.call('calendarToken', { renew })
        const host = (CONFIG.appUrl || location.origin).replace(/^https?:\/\//, '')
        gcal.url = 'https://' + host + '/api/kalendarz?t=' + token
        gcal.webcal = 'webcal://' + host + '/api/kalendarz?t=' + token
        gcal.google = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(gcal.webcal)
      } catch (e) { gcal.error = e.message } finally { gcal.busy = false }
    }
    function openGcal() { calView.value = false; moreView.value = false; gcalView.value = true; scrollTo(0, 0); if (!gcal.url) loadGcal() }
    async function renewGcal() { if ((await ask('Utworzyć nowy adres? Kalendarze dodane ze starym adresem przestaną się uzupełniać.'))) loadGcal(true) }
    async function copyGcal() { try { await navigator.clipboard.writeText(gcal.url); gcal.copied = true; setTimeout(() => { gcal.copied = false }, 1500) } catch { /* zaznacz ręcznie */ } }
    function openMore() { loadMsgOpts(); openMoreView() }
    function openMoreView() { serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; svcListView.value = false; votesView.value = false; bugsView.value = false; profileView.value = false; gcalView.value = false; songView.value = false; peopleView.value = false; calView.value = false; annView.value = false; protoView.value = false; tplView.value = false; moreView.value = true; scrollTo(0, 0) }
    // Najbliższe nabożeństwo (do 3 godzin po rozpoczęciu jest „w trakcie”).
    const nextService = computed(() => services.value.filter(sv => sv.date && startsAt(sv) + 3 * 3600e3 > now.value).sort((a, b) => startsAt(a) - startsAt(b))[0] || null)
    const nextSundayDate = nextSunday()
    const planSunday = computed(() => {
      let d = new Date(nextSundayDate + 'T12:00')
      const taken = date => services.value.some(s => s.date === date)
      const started = date => date === todayStr.value && new Date(`${date}T${DEFAULT_TIME}`).getTime() <= Date.now()
      for (let i = 0; i < 60 && (taken(localDate(d)) || started(localDate(d))); i++) d.setDate(d.getDate() + 7)
      return localDate(d)
    })
    const untilText = computed(() => {
      const c = countdown.value
      if (!c) return ''
      return c.days ? `za ${c.days} ${c.days === 1 ? 'dzień' : 'dni'} ${+c.hours} godz` : `za ${+c.hours} godz ${+c.minutes} min`
    })
    // Ten tydzień: wszystko z kalendarza na najbliższe 7 dni (także nabożeństwa).
    const weekItems = computed(() => {
      const until = localDate(new Date(Date.now() + 6 * 86400000))
      return calItems.value.filter(it => it.date >= todayStr.value && it.date <= until)
    })
    // Szeroki ekran: tydzień w 7 kolumnach.
    const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => {
      const date = localDate(new Date(asDate(todayStr.value).getTime() + i * 86400000))
      return { date, wd: wd(date), n: day(date), items: calItems.value.filter(it => it.date === date) }
    }))
    // Szeroki ekran: kafelki jak w aplikacji na komputer. Rzutnik i Stream działają tylko w aplikacji —
    // dla służby technicznej kafelek pobiera instalator.
    // W aplikacji na komputer (strona wbudowana) Rzutnik i Stream otwierają się od razu.
    const inApp = !!window.knsDesktop
    watch(() => ready.value && !!me.value, ok => { if (ok && api.enabled) { loadGoals(); loadServe() } }, { immediate: true }) // po zalogowaniu (cele i służby — strona startowa)
    const webTiles = computed(() => {
      const tech = canCamera.value
      const app = !tech ? 'Tylko dla służby technicznej' : inApp ? 'Otwórz w aplikacji' : desktopApp.url ? 'Pobierz na komputer' + (desktopApp.size ? ' · ' + desktopApp.size : '') : 'W aplikacji na komputer'
      const svc = nextService.value
      return [
        { id: 'display', icon: 'monitor', name: 'Rzutnik', desc: inApp ? 'Pieśni, zdjęcia, filmy i teksty' : app, locked: !tech, go: tech ? (inApp ? 'chev' : 'download') : 'warn' },
        { id: 'stream', icon: 'camera', name: 'Stream', desc: inApp ? 'Transmisja, kamery, sygnały' : app, locked: !tech, go: tech ? (inApp ? 'chev' : 'download') : 'warn' },
        { id: 'planner', icon: 'church', name: 'Nabożeństwa', desc: canEdit.value ? 'Kazanie, pieśni, program' : 'Dla osób z prawem edycji', locked: !canEdit.value, go: canEdit.value ? 'chev' : 'warn',
          pill: canEdit.value && svc ? (missing(svc).length ? 'Braki' : 'Komplet') : '' },
        { id: 'calendar', icon: 'calendar', name: 'Kalendarz', desc: 'Wszystkie wydarzenia', locked: false, go: 'chev' },
        ...(api.enabled ? [{ id: 'serve', icon: 'serve', name: 'Zaangażuj się', desc: 'Służby, które szukają chętnych', locked: false, go: 'chev' }] : []),
        ...(api.enabled ? [{ id: 'listen', icon: 'music', name: 'Posłuchaj', desc: 'Kazania na YouTube i Spotify', locked: false, go: 'chev' }] : []),
        ...(api.enabled ? [{ id: 'goals', icon: 'money', name: 'Cele wsparcia', desc: 'Część dziesięciny na wybrany cel', locked: false, go: 'chev', pill: goalDue.value ? 'Potwierdź' : '' }] : []),
        ...(api.enabled ? [{ id: 'asb', icon: 'users', name: 'ASB', desc: canAsb.value ? 'Grafik spotkań, przypomnienia i pomysły' : 'Terminarz spotkań studenckich', locked: false, go: 'chev' }] : []),
      ].filter(t => !t.locked) // bez uprawnień kafelek się nie pokazuje
    })
    function chooseTile(t) {
      if (t.locked) return
      if (t.id === 'calendar') openCalendar()
      else if (t.id === 'serve') openServe()
      else if (t.id === 'listen') openListen()
      else if (t.id === 'asb') openAsb()
      else if (t.id === 'goals') openGoals()
      else if (t.id === 'planner') nextService.value ? open(nextService.value) : create(planSunday.value)
      else if (inApp && (t.id === 'display' || t.id === 'stream')) window.knsDesktop.open(t.id)
      else if (desktopApp.url) location.href = desktopApp.url
    }
    // Start: 6 najnowszych ogłoszeń, reszta w „Wszystkie” (z liczbą i ile z nich nowych).
    const BOARD_MAX = 6
    const boardAll = computed(() => activeAnns.value.filter(a => !a.important))
    const boardNews = computed(() => boardAll.value.slice(0, BOARD_MAX))
    const boardMore = computed(() => { const rest = boardAll.value.slice(BOARD_MAX); return { n: rest.length, fresh: rest.filter(annIsNew).length } })
    const weekRange = computed(() => {
      const f = d => asDate(d).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '')
      return f(weekDays.value[0].date) + ' – ' + f(weekDays.value[6].date)
    })
    // Powitanie: przed 18 „Dzień dobry”, potem „Dobry wieczór”; imię z konta.
    const greeting = (h => (h >= 5 && h < 18 ? 'Dzień dobry' : 'Dobry wieczór'))(new Date().getHours())
    const firstName = computed(() => { const n = me.value?.name || ''; return n && !/tryb pokazowy/.test(n) ? n.split(/\s+/)[0] : '' })
    const dayLabel = d => {
      const t = todayStr.value, next = localDate(new Date(asDate(t).getTime() + 86400000))
      return d === t ? 'dziś' : d === next ? 'jutro' : wd(d) + ' ' + day(d)
    }
    // Chrome w trybie „wersja na komputer” udaje szeroki ekran — wtedy wszystko jest drobne.
    const desktopMode = screen.width < 600 && innerWidth > 800 && matchMedia('(pointer: coarse)').matches
    // Instalacja: Android/Chrome podaje gotowe okno instalacji, iPhone wymaga dodania ręcznie z Safari.
    const installed = ref(matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)
    // Komputer (Windows): zamiast instalacji strony — instalator aplikacji na komputer z najnowszego wydania na GitHubie.
    const desktop = !window.knsDesktop && !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) && /windows/i.test(navigator.userAgent) && !installed.value
    const desktopApp = reactive({ url: '', version: '', size: '', installed: '', error: '' })
    let desktopHidden = false
    try { desktopHidden = localStorage.getItem('kns-desktop-hidden') === '1' } catch { /* tryb prywatny */ }
    const hideDesktop = ref(desktopHidden)
    function dismissDesktop() { hideDesktop.value = true; try { localStorage.setItem('kns-desktop-hidden', '1') } catch { /* tryb prywatny */ } }
    if (desktop) {
      fetch('https://api.github.com/repos/PatrykDorau/kns/releases/latest').then(r => (r.ok ? r.json() : null)).then(rel => {
        const asset = rel?.assets?.find(a => /instalator.*\.exe$/i.test(a.name)) || rel?.assets?.find(a => /\.exe$/i.test(a.name))
        if (!asset) { desktopApp.error = 'Instalator nie jest jeszcze opublikowany — zajrzyj tu za jakiś czas.'; return }
        desktopApp.url = asset.browser_download_url
        // instalator jest spakowany — po instalacji aplikacja zajmuje ok. 3,4 raza więcej
        const mb = asset.size / 1048576
        desktopApp.size = asset.size ? 'instalator ' + Math.round(mb) + ' MB' : ''
        desktopApp.installed = asset.size ? 'po instalacji ok. ' + Math.round(mb * 3.4 / 10) * 10 + ' MB' : ''
        desktopApp.version = String(rel.tag_name || '').replace(/^v/, '')
      }).catch(() => { desktopApp.error = 'Nie udało się sprawdzić najnowszej wersji — sprawdź internet.' })
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    // Przeglądarki wbudowane w Messengera, Facebooka, Instagrama itp. — Google blokuje w nich logowanie.
    const embedded = ref(!demo && /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i.test(navigator.userAgent))
    const chromeLink = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end'
    let promptEvent = null
    const canPrompt = ref(false)
    // Zainstalowana aplikacja otwarta w zwykłej przeglądarce: pamiętamy instalację, a Chrome potrafi ją też wykryć.
    // Czy aplikacja jest zainstalowana — sprawdzane na bieżąco (bez zapamiętywania: po odinstalowaniu karta „Pobierz” wraca).
    try { localStorage.removeItem('kns-installed') } catch { /* tryb prywatny */ }
    const markInstalled = () => { installed.value = true }
    navigator.getInstalledRelatedApps?.().then(apps => { if (apps.length) markInstalled() }).catch(() => {})
    const showHelp = ref(false)
    // Chrome proponuje instalację tylko wtedy, gdy aplikacji nie ma na telefonie — wtedy karta zawsze się pokazuje.
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptEvent = e; canPrompt.value = true; if (!matchMedia('(display-mode: standalone)').matches) installed.value = false })
    addEventListener('appinstalled', markInstalled)
    async function install() {
      if (!promptEvent) { showHelp.value = true; return }
      promptEvent.prompt()
      const choice = await promptEvent.userChoice
      if (choice.outcome === 'accepted') markInstalled()
      promptEvent = null; canPrompt.value = false
    }
    // praca bez internetu i powiadomienia — tylko zbudowana strona (w podglądzie i testach bez)
    if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    /* ---------- powiadomienia (Web Push) ---------- */
    // Zgoda → subskrypcja w przeglądarce → zapis w folderze aplikacji na Dysku; resztę robi skrypt przypomnienia.
    const pushUrl = CONFIG.pushUrl || ''
    const push = reactive({
      // Telefony, tablety i przeglądarka na komputerze (nie aplikacja na komputer — tam nie ma usługi powiadomień).
      supported: !!pushUrl && !window.knsDesktop && ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window || ios),
      needsInstall: ios && !installed.value,
      // Android: aplikacja Google, przeglądarka Xiaomi, Samsung Internet i przeglądarki wbudowane w aplikacje nie obsługują powiadomień.
      otherBrowser: !/android/i.test(navigator.userAgent) ? '' : /GSA\//.test(navigator.userAgent) ? 'wyszukiwarka Google' : /MiuiBrowser|XiaoMi/i.test(navigator.userAgent) ? 'przeglądarka Xiaomi'
        : /; wv\)/.test(navigator.userAgent) ? 'przeglądarka wbudowana w aplikację' : '',
      denied: 'Notification' in window && Notification.permission === 'denied',
      on: false, busy: false, error: '', slow: '', day: 5, hour: 19, saved: false,
    })
    const DAYS = ['w niedzielę', 'w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę']
    const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6:00–22:00
    let when = { day: 5, hour: 19 }
    try { when = { ...when, ...JSON.parse(localStorage.getItem('kns-push-when') || '{}') } } catch { /* brak zapisu */ }
    push.day = when.day; push.hour = when.hour; push.saved = false
    let pushId = ''
    try { pushId = localStorage.getItem('kns-push-id') || ''; if (!pushId) { pushId = uid() + uid(); localStorage.setItem('kns-push-id', pushId) } } catch { pushId = uid() + uid() }
    const keyBytes = b64 => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0))
    async function checkPush() {
      if (!push.supported || push.needsInstall) return
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      push.on = !!sub && Notification.permission === 'granted'
      // telefon przypisany do zalogowanego konta (po zmianie konta powiadomienia idą do nowego)
      if (push.on && api.enabled && ready.value && drive.savePush) drive.savePush(pushId, pushRecord(sub)).catch(() => {})
    }
    async function enablePush() {
      push.busy = true; push.error = ''; push.slow = ''
      // Długie czekanie: przeglądarka pokazała pytanie po cichu (ikona dzwonka w pasku adresu) albo nie może połączyć się z usługą powiadomień.
      const slowTimer = setTimeout(() => {
        push.slow = Notification.permission === 'default'
          ? 'Przeglądarka czeka na zgodę — jeśli nie widzisz pytania, kliknij ikonę dzwonka po prawej stronie paska adresu i wybierz „Zezwalaj”.'
          : 'Łączę z usługą powiadomień… Jeśli to trwa długo, sieć może blokować usługi Google (spróbuj innej sieci, np. danych komórkowych).'
      }, 6000)
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') { push.denied = permission === 'denied'; return }
        const res = await fetch(pushUrl)
        const { publicKey, error } = await res.json().catch(() => ({}))
        if (!publicKey) throw new Error(error || 'Powiadomienia nie są jeszcze skonfigurowane na serwerze.')
        const reg = await navigator.serviceWorker.ready
        // Na Androidzie pierwsza próba tuż po zgodzie bywa odrzucana (usługa Google jeszcze się nie połączyła) — ponawiamy.
        const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }
        let sub = await reg.pushManager.getSubscription()
        for (let attempt = 0; !sub; attempt++) {
          try { sub = await reg.pushManager.subscribe(options) } catch (err) {
            if (attempt >= 2 || /denied|NotAllowed/i.test(err.name + err.message)) throw err
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
          }
        }
        await drive.savePush(pushId, pushRecord(sub))
        push.on = true; pushAsk.value = false
        try { localStorage.setItem('kns-push', 'on') } catch { /* tryb prywatny */ }
        reg.showNotification('Powiadomienia włączone', { body: 'Dam znać, jeśli na niedzielę czegoś brakuje. Termin przypomnienia zmienisz w aplikacji.', icon: 'icon-192.png', badge: 'badge.png' })
      } catch (e) {
        // Brave (i niektóre przeglądarki) domyślnie wyłącza usługę powiadomień — wtedy zapis kończy się tym błędem.
        const brave = !!navigator.brave
        const android = /android/i.test(navigator.userAgent)
        const raw = ((e.name && e.name !== 'Error' ? e.name + ': ' : '') + (e.message || String(e))).trim()
        let hint = ''
        if (brave) hint = android
          ? 'Brave blokuje powiadomienia. W Brave: Ustawienia → Prywatność i bezpieczeństwo (Brave Shields & privacy) → włącz „Use Google services for push messaging”, zamknij Brave i spróbuj ponownie. Albo zainstaluj aplikację z Chrome.'
          : 'Brave blokuje powiadomienia: otwórz brave://settings/privacy, włącz „Use Google services for push messaging”, uruchom Brave ponownie i spróbuj jeszcze raz.'
        else if (/denied|NotAllowed/i.test(raw)) hint = android
          ? 'Telefon blokuje powiadomienia Chrome. Ustawienia telefonu → Aplikacje → Chrome → Powiadomienia → włącz (także kategorię dla strony / KNS Nabo), potem spróbuj ponownie.'
          : 'Powiadomienia są zablokowane w ustawieniach przeglądarki albo systemu — odblokuj je i spróbuj ponownie.'
        else if (/push service|registration failed|AbortError/i.test(raw)) hint = android
          ? 'Telefon nie połączył się z usługą powiadomień Google. Sprawdź: 1) czy nie jest włączony prywatny DNS, VPN albo blokowanie reklam (Ustawienia → Połączenie i udostępnianie → Prywatny DNS → Wyłączony), 2) spróbuj na danych komórkowych zamiast Wi-Fi, 3) zaktualizuj „Usługi Google Play” i Chrome w Sklepie Play. Potem zamknij Chrome i spróbuj ponownie.'
          : 'Ta przeglądarka nie przyjęła zapisu na powiadomienia. Spróbuj w Chrome albo Edge.'
        push.error = hint ? hint + ' (szczegóły: ' + raw + ')' : raw
        if (e.auth) { ready.value = false; gate.value = '' }
      } finally { push.busy = false; clearTimeout(slowTimer); push.slow = '' }
    }
    // Próbne powiadomienie: prawdziwa wysyłka przez serwer, tylko na ten telefon.
    async function testPush() {
      push.busy = true; push.error = ''
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!sub) { push.on = false; return }
        const res = await fetch(pushUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, subscription: sub.toJSON() }) })
        const out = await res.json().catch(() => ({}))
        if (!res.ok || !out.sent) throw new Error(out.error || 'Nie udało się wysłać — spróbuj wyłączyć i włączyć powiadomienia.')
      } catch (e) { push.error = e.message || String(e) } finally { push.busy = false }
    }
    // Plik telefonu na Dysku: adres powiadomień i wybrany termin (skrypt przypomnienia sprawdza co godzinę).
    const pushRecord = sub => ({ subscription: sub.toJSON(), schedule: { day: push.day, hour: push.hour }, account: drive.account(), device: navigator.userAgent.slice(0, 120), updated: Date.now() })
    async function saveSchedule() {
      push.busy = true; push.error = ''; push.saved = false
      try {
        try { localStorage.setItem('kns-push-when', JSON.stringify({ day: push.day, hour: push.hour })) } catch { /* tryb prywatny */ }
        const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
        if (!sub) { push.on = false; return }
        await drive.savePush(pushId, pushRecord(sub))
        push.saved = true
        setTimeout(() => { push.saved = false }, 2500)
      } catch (e) { push.error = e.message || String(e) } finally { push.busy = false }
    }
    async function disablePush() {
      push.busy = true; push.error = ''
      try {
        const reg = await navigator.serviceWorker.ready
        await (await reg.pushManager.getSubscription())?.unsubscribe()
        await drive.removePush(pushId)
        push.on = false
        try { localStorage.setItem('kns-push', 'off') } catch { /* tryb prywatny */ } // wyłączone świadomie — bez ponownego pytania
      } catch (e) { push.error = e.message || String(e) } finally { push.busy = false }
    }
    checkPush().catch(() => {})
    // Powiadomienia domyślnie włączone: po zalogowaniu telefon zapisuje się sam (gdy pozwolenie już jest) albo
    // pokazuje kartę „Włącz powiadomienia” (pozwolenie wymaga dotknięcia). Wyłączone w profilu — nie pyta więcej;
    // „Nie teraz” — zapyta znowu za tydzień.
    const pushAsk = ref(false)
    const pushAskMode = ref('enable') // 'enable' — przycisk „Włącz”; 'install' — iPhone bez instalacji; 'browser' — przeglądarka bez powiadomień
    async function autoPush() {
      let pref = '', later = 0
      try { pref = localStorage.getItem('kns-push') || ''; later = +(localStorage.getItem('kns-push-later') || 0) } catch { /* tryb prywatny */ }
      if (!push.supported || push.denied || pref === 'off') return
      if (!push.needsInstall && !push.otherBrowser) { await checkPush(); if (push.on) return } // włączone — telefon przypisany do tego konta
      if (Date.now() - later < 2 * 864e5) return
      if (push.needsInstall || push.otherBrowser) { pushAskMode.value = push.needsInstall ? 'install' : 'browser'; pushAsk.value = true; return }
      if (Notification.permission === 'granted') { await enablePush(); return }
      pushAskMode.value = 'enable'; pushAsk.value = true
    }
    function pushLater() { pushAsk.value = false; try { localStorage.setItem('kns-push-later', String(Date.now())) } catch { /* tryb prywatny */ } }
    watch(ready, r => { if (r) setTimeout(() => autoPush().catch(() => {}), 1500) }, { immediate: true })

    // Zamknięcie karty z niezapisanymi zmianami wymaga potwierdzenia.
    addEventListener('beforeunload', e => { if (dirty.value || (eventDirty.value && eventSavedOnce.value) || tplDirty.value || (protoDirty.value && protoSavedOnce.value) || (annDirty.value && annSavedOnce.value)) e.preventDefault() })
    addEventListener('online', () => { offline.value = false })
    addEventListener('offline', () => { offline.value = true })
    // Powrót do aplikacji (np. z innej) odświeża listę — widać zmiany innych osób.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && camera.value) { cam.resume(); return }
      if (document.visibilityState === 'visible' && ready.value && !current.value && !currentEvent.value && !tplView.value && !currentProto.value && !protoView.value && !currentAnn.value && !annView.value && !busy.value && drive.signedIn()) reload()
    })
    // Zapamiętane logowanie: po przeładowaniu strony od razu wczytujemy dane.
    // Po powrocie z logowania Google baza najpierw odtwarza sesję (drive.ready).
    Promise.resolve(drive.ready).then(() => {
      if (demo) start()
      else if (clientId && drive.signedIn()) guard(async () => { if (api.enabled) await enter(); else { await fetchAll(); ready.value = true } }).finally(() => { booting.value = false })
      else booting.value = false
    })

    // Link z powiadomienia (?ogloszenie=id albo ?wydarzenie=id): po wczytaniu danych otwiera wskazaną rzecz.
    /* ---------- adresy podstron ---------- */
    // Każdy widok ma swój adres (/kalendarz, /wydarzenie/<id>, /ogloszenie/<id>/edycja…), więc „wstecz” w przeglądarce
    // wraca do poprzedniego widoku w aplikacji (a nie do logowania Google), a adres można komuś wysłać.
    // Stare linki (?wydarzenie=id, ?ogloszenie=id, ?sluzby=1…) dalej działają.
    const ROUTE_ITEM = { wydarzenie: 'wydarzenie', ogloszenie: 'ogloszenie', nabozenstwo: 'nabozenstwo' }
    const routePath = computed(() => {
      const ed = on => (on ? '/edycja' : '')
      if (current.value) return services.value.some(x => x.id === current.value.id) ? '/nabozenstwo/' + current.value.id + ed(svcEditing.value && canEdit.value) : '/nabozenstwo/nowe'
      if (currentEvent.value) return eventSavedOnce.value ? '/wydarzenie/' + currentEvent.value.id + ed(eventEditing.value && eventEditable.value) : '/wydarzenie/nowe'
      if (currentAnn.value) return annSavedOnce.value ? '/ogloszenie/' + currentAnn.value.id + ed(annEditing.value) : '/ogloszenie/nowe'
      if (currentProto.value) return protoSavedOnce.value ? '/material/' + currentProto.value.id : '/material/nowy'
      if (song.value) return song.value.isNew ? '/piesn/nowa' : '/piesn/' + song.value.id
      if (tplType.value || tplView.value) return '/szablony'
      if (annView.value) return '/ogloszenia'
      if (protoView.value) return '/materialy'
      if (songView.value) return '/piesni'
      if (peopleView.value) return '/osoby'
      if (gcalView.value) return '/kalendarz-google'
      if (profileView.value) return '/profil'
      if (serveView.value) return '/zaangazuj-sie'
      if (listenView.value) return '/posluchaj'
      if (goalsView.value) return goals.open ? '/cel/' + encodeURIComponent(goals.open) : '/cele'
      if (votesView.value) return '/glosowania'
      if (bugsView.value) return '/zgloszenia'
      if (asbView.value) return asbForm.value && !asbForm.value._new ? '/asb/' + encodeURIComponent(asbForm.value.id) : asb.tab === 'ideas' ? '/asb/pomysly' : '/asb'
      if (svcListView.value) return '/nabozenstwa'
      if (calView.value) return '/kalendarz'
      if (moreView.value) return '/wiecej'
      return '/'
    })
    // Adres z paska (albo stary link z parametrem) → ścieżka widoku.
    function linkToPath(loc) {
      const q = new URLSearchParams(loc.search)
      for (const k of Object.keys(ROUTE_ITEM)) if (q.get(k)) return '/' + k + '/' + encodeURIComponent(q.get(k))
      if (q.get('sluzba')) return '/zaangazuj-sie?sluzba=' + encodeURIComponent(q.get('sluzba'))
      if (q.get('sluzby')) return '/zaangazuj-sie'
      if (q.get('asb')) return '/asb/' + encodeURIComponent(q.get('asb'))
      return loc.pathname.replace(/\/+$/, '') || '/'
    }
    function resetViews() {
      current.value = null; song.value = null; currentEvent.value = null; currentProto.value = null; currentAnn.value = null; tplType.value = null
      tplView.value = false; protoView.value = false; annView.value = false; calView.value = false; moreView.value = false; songView.value = false
      peopleView.value = false; gcalView.value = false; profileView.value = false; serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; svcListView.value = false; votesView.value = false; bugsView.value = false; asbForm.value = null; fromCal = false
    }
    let routing = 0 // trwa przejście z paska — adres już jest właściwy, więc bez nowego wpisu w historii
    async function applyRoute(path) {
      routing++
      try {
        const [pathname, query = ''] = path.split('?')
        const [, view = '', rawId = '', mode = ''] = pathname.split('/')
        const id = decodeURIComponent(rawId), edit = mode === 'edycja'
        resetViews()
        if (view === 'kalendarz') openCalendar()
        else if (view === 'wydarzenie') {
          const e = [...events.value, ...pendingEvents.value].find(x => x.id === id)
          if (e) { calView.value = true; openEvent(e); if (edit && eventEditable.value) eventEditing.value = true } else if (id !== 'nowe') { openCalendar(); error.value = 'Nie znaleziono tego wydarzenia — mogło zostać usunięte albo nie masz do niego dostępu.' } else openCalendar()
        } else if (view === 'nabozenstwo') {
          const sv = services.value.find(x => x.id === id)
          if (sv) { open(sv); if (edit && canEdit.value) svcEditing.value = true }
        } else if (view === 'ogloszenia') openAnns()
        else if (view === 'ogloszenie') {
          annView.value = true
          const x = [...announcements.value, ...pendingAnns.value].find(y => y.id === id)
          if (x) { openAnn(x); if (edit && annEditable.value) annEditing.value = true } else if (id !== 'nowe') error.value = 'Nie znaleziono tego ogłoszenia — mogło zostać usunięte albo nie masz do niego dostępu.'
        } else if (view === 'zaangazuj-sie') openLink(new URLSearchParams(query.includes('sluzba=') ? query : 'sluzby=1'))
        else if (view === 'posluchaj') openListen()
        else if (view === 'asb') { asb.tab = id === 'pomysly' ? 'ideas' : 'plan'; await openAsb(); if (id && id !== 'pomysly') asbOpenId(id) }
        else if (view === 'nabozenstwa') openServices()
        else if (view === 'cele' || view === 'cel') openGoals(view === 'cel' ? id : '')
        else if (view === 'glosowania') openVotes()
        else if (view === 'zgloszenia') openBugs()
        else if (view === 'profil') openProfile()
        else if (view === 'wiecej') openMore()
        else if (view === 'piesni' || view === 'piesn') { moreView.value = true; openSongs(); const sg = view === 'piesn' && songs.value.find(x => x.id === id); if (sg) openSong(sg) }
        else if (view === 'osoby') { moreView.value = true; if (canManage.value) openPeople() }
        else if (['protokoly', 'protokol', 'materialy', 'material'].includes(view)) {
          moreView.value = true; openProtocols()
          if ((view === 'protokol' || view === 'material') && id !== 'nowy') { await loadProtocols(); const p = protocolsRaw.value.find(x => x.id === id); if (p) openProto(p) }
        } else if (view === 'szablony') { moreView.value = true; openTemplates() }
        else if (view === 'kalendarz-google') openGcal()
        await nextTick()
      } finally { routing-- }
    }
    // zmiana widoku → nowy wpis w historii (albo podmiana, gdy to przejście z paska)
    watch(routePath, p => {
      if (!ready.value || camera.value) return
      const now = location.pathname + location.search
      if (p === location.pathname && (!location.search || routing)) return
      if (routing) history.replaceState(null, '', p)
      else history.pushState(null, '', p)
    })
    const anyDirty = () => (current.value && dirty.value) || (currentEvent.value && eventDirty.value) || (currentAnn.value && annDirty.value) || (song.value && songDirty.value)
    startUpdateCheck(() => !anyDirty()) // nowa wersja strony: przeładowanie przy powrocie do aplikacji
    const reloadPage = () => location.reload()
    window.addEventListener('popstate', async () => {
      if (!ready.value || camera.value) return
      if (anyDirty()) {
        const target = linkToPath(location)
        history.pushState(null, '', routePath.value) // na razie zostajemy; po „Tak” przechodzimy dalej
        if (!(await ask('Masz niezapisane zmiany. Wyjść bez zapisywania?', { ok: 'Wyjdź', danger: true }))) return
        current.value = null; currentEvent.value = null; currentAnn.value = null; song.value = null // porzucone zmiany
        applyRoute(target); return
      }
      applyRoute(linkToPath(location))
    })
    // Adres przy wejściu (także link otwarty przed zalogowaniem): pamiętamy go, bo logowanie Google wraca na stronę główną.
    const LINK_LABEL = { wydarzenie: 'wydarzenie', ogloszenie: 'ogłoszenie', nabozenstwo: 'nabożeństwo', 'zaangazuj-sie': 'listę służb' }
    const startPath = linkToPath(location)
    if (startPath !== '/') {
      try { localStorage.setItem('kns-link', JSON.stringify({ path: startPath, at: Date.now() })) } catch { /* tryb prywatny */ }
    }
    const pendingLink = ref(null)
    try {
      const saved = JSON.parse(localStorage.getItem('kns-link') || 'null')
      if (saved?.path && Date.now() - saved.at < 3 * 3600e3) pendingLink.value = { ...saved, kind: saved.path.split('/')[1].split('?')[0] }
      else localStorage.removeItem('kns-link')
    } catch { /* tryb prywatny */ }
    const stopStart = watch(ready, ok => {
      if (!ok) return
      stopStart?.()
      const target = pendingLink.value?.path
      pendingLink.value = null
      try { localStorage.removeItem('kns-link') } catch { /* tryb prywatny */ }
      // pod linkiem strona główna — „wstecz” wraca do aplikacji, nie do logowania Google
      if (target) { history.replaceState(null, '', '/'); history.pushState(null, '', target.split('?')[0]); applyRoute(target) }
      else if (location.pathname !== '/' || location.search) history.replaceState(null, '', '/')
    }, { immediate: true })

    // Klasy na #app (kontener montowania — Vue nie kompiluje jego atrybutów): pasek zakładek, strona startowa, wąski widok.
    watchEffect(() => {
      const el = document.getElementById('app')
      el.classList.toggle('tabbed', showTabs.value)
      el.classList.toggle('home-wide', homeWide.value)
      el.classList.toggle('has-side', ready.value || booting.value)
      el.classList.toggle('narrow', !!(current.value || song.value || currentEvent.value || currentProto.value || currentAnn.value || tplType.value || peopleView.value || gcalView.value || profileView.value || serveView.value || listenView.value || asbView.value || goalsView.value || votesView.value || svcListView.value || annView.value || protoView.value || tplView.value || songView.value))
    })
    return provideApp({
      bugsView, bugs, BUG_STATUS, reportBug, sendBug, loadBugs, openBugs, bugsShown, bugCounts, updateBug, liveEvent, liveVotes, attendance, checkinBusy, canCheckIn, checkIn, isMeeting, votesView, votes, votesOpen, openVotes, VOTE_STATUS, eventOf, voteEvents, eventVotes, goToVote, newVoteFor, loadElectionPeople, optionsOf, addOption, addPersonOption, addYesNo, moveOption, voteSchedule, voteFormProblem, voteEv, VOTE_EV_TYPES, voteEventsShown, newElection, editElection, saveElection, removeElection, nominate, reviewCand, setElectionStatus, toggleBallot, castVote,
      sideNav, navOn, navTo, inApp, mapLink, theme, toggleTheme, HERO_ART, heroArt, heroStep, heroIsPhoto, photos, asDate, boardAll,
      events, types, typeOf, eventTypes, eventTypesFor, fillProgram, calSel, calQuery, CAL_PRESETS, calPreset, setCalPreset, toggleType, calView, month0, selDay, pickType, WEEK, todayStr, monthLabel, shiftMonth, calDays, agenda,
      openCalendar, openItem, currentEvent, eventDirty, eventSavedOnce, openEvent, newEvent, typeChanged, closeEvent, saveEvent, removeEvent,
      tplView, tplType, tplDirty, openTemplates, openType, newType, closeType, saveTemplate, removeType, COLORS, cameFromCal: () => fromCal,
      AUDIENCE, announcements, canAnnounce, shortDate, activeAnns, oldAnns, importantAnns, homeAnns, annView, currentAnn, annDirty, annSavedOnce, annEditable,
      asb, asbView, asbForm, asbPreview, canAsb, asbSeasons, asbList, asbGroups, asbNext, asbAvg, asbPlaces, openAsb, asbEdit, asbAutoMonth, asbSave, asbDelete, asbIdeaAdd, asbIdeaDelete,
      booting, annIsNew, newAnnCount, annQuery, annHintsOpen, shownActiveAnns, shownOldAnns, annHints, hintParts, pickHint, isActive,
      ASB_KINDS, asbWhen, asbKindName, asbMissing, asbMissingCount, asbLeaderHints, asbPubUpcoming, asbPubShown, asbPubGroups,
      msg, msgRanks, msgMinistries, canMsg, openMsg, msgToggle, sendMsg,
      bulk, annFromImages,
      MAT_TYPES, MAT_PLURAL, MAT_COLOR, matType, protoAudience, protoTypeChanged, INSTRUMENTS, bandPick, bandPickList, openBandPick, bandAdd, bandPickFree, asbPause, asbTitle, asbCalNote, asbRemind, asbAddFile, asbRemoveFile, asbOpenFile, openAsbMeeting,
      goalsView, goals, shownMonths, zl, thisMonth, prevMonth, monthName, monthShort, itemsSum, goalDue, goalPct, goalProj, goalProjAmount, openGoals, savePledge, withdraw,
      startReduce, askConfirm, confirmMonth, support, supportEdit, saveSupport, transferTitle, copiedWhat, copyText, monthLocked, nextMonthStart, newGoal, editGoal, saveGoal, confirmOnce, removeGoal, toggleGoalPeople, pickGoalImage,
      listen, listenView, listenEdit, listenYt, listenSp, listenLatest, isChannelLink, openListen, saveListen, youtubeEmbed, spotifyEmbed,
      shareLink, shareTarget, qr, openQr, toast, showToast, updateReady, reloadPage, ministryNames, svcListView, openServices, serveTab, seekingAll, openMinistry, loadServe, loadGoals, pendingLink, LINK_KIND, LINK_LABEL, linkedMinistry,
      serveSections, canCreateMinistry, addTo, addQuery, addPeople, openAddPerson, addCandidates, addPerson, removeFromMinistry,
      inbox, inboxOpen, unread, openInbox, agoText, readAll, openNotice,
      openAnns, openAnn, newAnn, closeAnn, saveAnn, removeAnn, serveView, serve, openServe, joinMinistry, leaveMinistry, decideMinistry, editMinistry, mEdit, memberNames, toggleLeader, saveMinistry, deleteMinistry, needsName, profileView, profile, profileDirty, openProfile, saveProfile, groupNames, directoryShown, notifyGroupsShown, sermonSlot, songSlots, songsIn, songSheet, songSheetSlot, pickSongsFor, removeSong, moveIn, canReview, canSubmit, reviewItems, approveEvent, approveAnn, rejectEvent, rejectAnn, eventEditable, eventEditing, svcEditing, signup, signupGroups, seatsText, SIGNUP_STATUS, toggleSignup, signupJoin, signupLeave, signupDecide, closeAll, lastSermon, thoughtList, annEditing, canNotify, notify, directory, openNotify, closeNotify, notifyGroups, toggleGroup, notifySummary, pubWeek, imgBusy, pickAnnImage, pickEventImage, vidBusy, pickAnnVideo, videoInfo, newsBusy, toggleNewsletter, pub, pubItems, eventIsPublic,
      hasCouncil, canApprove, canWriteProto, dateTime, protoView, protoKind, protocols, protoBusy, protoError, loadProtoKind, openProtocols,
      currentProto, protoDirty, protoSavedOnce, protoEditable, openProto, newProto, protoForEvent, closeProto, saveProto, removeProto,
      VISIBILITY, canAddProto, meetingEvents, eventTitle, eventProtocols, protoEditing, protoFile, pickProtoFile, protoUrl,
      migrating, migrated, migrate,
      gcalView, gcal, openGcal, renewGcal, copyGcal,
      weekDays, greeting, firstName, webTiles, chooseTile, boardNews, boardMore, weekRange,
      inviteEvent, moreView, openMore, nextService, nextSundayDate, planSunday, untilText, weekItems, dayLabel, desktopMode,
      api, me, gate, canEdit, canManage, canCamera, myRanks, recheck, continueToDrive,
      peopleView, people, peopleBusy, peopleGroups, peopleUi, rankName, ranksShown, openRanks, cancelRanks, pendingCount, ranks, initials, ago, rolesChanged, toggleRank, loadPeople, openPeople, setPerson,
      showTabs, countdown, wd, relDay, DEFAULT_TIME, DEFAULT_PLACE, push, enablePush, disablePush, pushAsk, pushAskMode, pushLater, testPush, mailTest, testNewsletter, saveSchedule, DAYS, HOURS,
      camera, cue: cam.cue, cueText: CUE_TEXT, cueTopic, openCamera, closeCamera, enableSound: cam.enableSound,
      embedded, chromeLink,
      installed, ios, canPrompt, showHelp, install, desktop, desktopApp, hideDesktop, dismissDesktop,
      version: VERSION, offline, showPast, coming, past, shown, logout,
      drive, configured: demo || !!clientId, ready, busy, error, status, services, songs, alert, current, dirty,
      query, picking, results, confirmDelete,
      pretty, day, month, weekday, missing, upcoming, songTitle, firstLine, inBase, chosen, lines,
      start, otherAccount, appUrl, origin, wrongOrigin, reload, open, create, fix, back, addSong, move, save, remove,
      showServices, songView, song, songQuery, songResults, songDirty, slideCount, numberTaken, openSongs, openSong, newSong, closeSong, saveSong, deleteSong,
      KIND, ACCEPT, fileType, uploading, progress, fromPhone, picker, pickQuery, pickFound, pickBusy, openPicker, searchSoon, fromDrive,
    })
  },
})
</script>

<template>
  <!-- Szeroki ekran: stały boczny pasek — wszystkie części aplikacji, konto na dole. -->
  <SideNav v-if="ready" />
  <!-- wczytywanie po odświeżeniu (zalogowany): od razu boczny pasek w szkielecie, bez skakania układu -->
  <aside v-else-if="booting" class="side side-skel" aria-hidden="true"><div class="side-top"><img src="znak.png" alt=""><span class="skel skel-line" style="width:60%"></span></div><span v-for="n in 9" :key="n" class="skel skel-line side-skel-it"></span></aside>
  <!-- Szeroki ekran: pasek konta na górze każdego widoku (jak w aplikacji na komputer). -->
  <AccountBar v-if="ready" />
  <AppHeader v-if="ready || !booting" />
  <div v-if="toast" class="toast" role="status">{{ toast }}</div>

  <!-- Kamera: sygnały od operatora streamu (przez internet), z dźwiękiem w słuchawce i wibracją. -->
  <CameraCue v-if="camera" />

  <!-- Instalacja na telefonie jako aplikacja (ikona na ekranie głównym, bez paska przeglądarki). -->
  <!-- Karta znika dopiero po zainstalowaniu aplikacji — nie da się jej zamknąć wcześniej. -->
  <!-- Komputer z Windows: pełna aplikacja (rzutnik, stream, organizacja) z GitHub Releases. -->
  <!-- Instalacja: jeden niski pasek — ikona, tytuł, „Pobierz”. -->
  <!-- Aplikacja na komputer (Windows) — w „Więcej”, nie na stronie głównej. -->
  <div v-if="!desktop && !installed && !current && !currentEvent && !tplView && !currentProto && !protoView && !currentAnn && !annView" class="getapp" :class="{ help: showHelp }">
    <img src="icon-192.png" alt="">
    <span class="ga-text"><b>Zainstaluj aplikację</b></span>
    <button class="primary" @click="install"><svg class="i"><use href="#download"/></svg>Pobierz</button>
    <!-- Instrukcja tylko wtedy, gdy instalacja jednym dotknięciem nie jest możliwa. -->
    <div v-if="showHelp" class="ga-help">
      <template v-if="ios">Na iPhonie w Safari: dotknij <b>≡</b> albo <b>⋯</b> obok adresu strony (w starszym Safari — kwadrat ze strzałką na dole) → <b>Udostępnij</b> → przewiń w dół → <b>Do ekranu początkowego</b> → <b>Dodaj</b>.</template>
      <template v-else>Przeglądarka jeszcze nie pozwala na instalację jednym dotknięciem. Otwórz tę stronę w Chrome, odczekaj chwilę i dotknij „Pobierz” ponownie (albo menu ⋮ → „Zainstaluj aplikację”).</template>
    </div>
  </div>
  <p v-if="desktopMode" class="desktop-mode">Telefon wyświetla tę stronę jako „wersję na komputer” — dlatego wszystko jest drobne. W Chrome: menu ⋮ → odznacz „Wersja na komputer”.</p>
  <div v-if="drive.demo" class="demo">Tryb pokazowy — dane są tylko w tej przeglądarce</div>
  <!-- powiadomienia na telefonie: domyślnie włączone — jedno dotknięcie (telefon wymaga zgody) -->
  <div v-if="ready && pushAsk && !push.on" class="push-ask" role="region" aria-label="Powiadomienia">
    <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
    <span v-if="pushAskMode === 'install'" class="pa-text"><b>Powiadomienia na iPhonie</b><small>Najpierw dodaj aplikację do ekranu: w Safari <b>Udostępnij</b> → <b>Do ekranu początkowego</b>, otwórz ją z ekranu i włącz powiadomienia.</small></span>
    <span v-else-if="pushAskMode === 'browser'" class="pa-text"><b>Powiadomienia</b><small>Ta przeglądarka ({{ push.otherBrowser }}) ich nie obsługuje — otwórz stronę w Chrome.</small></span>
    <span v-else class="pa-text"><b>Włącz powiadomienia na tym urządzeniu</b><small>Wiadomości od liderów, głosowania, zapisy i przypomnienia — od razu, także gdy aplikacja jest zamknięta. Wyłączysz je w Mój profil.</small></span>
    <span class="pa-btns"><button class="ghost" @click="pushLater">Nie teraz</button><a v-if="pushAskMode === 'browser'" class="button primary" :href="chromeLink">Otwórz w Chrome</a><button v-else-if="pushAskMode === 'enable'" class="primary" :disabled="push.busy" @click="enablePush">{{ push.busy ? 'Włączam…' : 'Włącz' }}</button></span>
    <small v-if="push.error" class="pa-err">{{ push.error }}</small>
  </div>
  <div v-if="updateReady" class="update-ready" role="status"><svg class="i"><use href="#refresh"/></svg><span>Jest nowa wersja aplikacji.</span><button class="primary small" @click="reloadPage">Odśwież</button></div>
  <div v-if="offline" class="offline"><svg class="i"><use href="#cloudoff"/></svg>Brak internetu — zmian nie da się teraz zapisać.</div>
  <p v-if="error" class="error" role="alert">{{ error }}
    <button v-if="/konta|konto/.test(error) && !drive.demo" class="ghost link" :disabled="busy" @click="otherAccount">Zaloguj innym kontem</button></p>

  <!-- brak konfiguracji / logowanie -->
  <div v-if="!configured" class="center">
    <img src="logo.png" alt="Kościół Na Skale">
    <p>Strona nie jest jeszcze skonfigurowana.</p>
    <p class="note">W pliku <code>config.js</code> trzeba wpisać identyfikator klienta Google.</p>
  </div>
  <div v-else-if="!ready && embedded" class="center">
    <img src="logo.png" alt="Kościół Na Skale">
    <p><b>Otwórz tę stronę w zwykłej przeglądarce.</b></p>
    <p class="note">Strona jest otwarta w przeglądarce wbudowanej w inną aplikację (np. Messenger, Facebook, Instagram) — Google nie pozwala się w niej zalogować.
      <template v-if="ios">Dotknij menu (⋯ lub ikona kompasu) i wybierz „Otwórz w Safari”.</template>
      <template v-else>Dotknij przycisku poniżej albo menu ⋯ → „Otwórz w Chrome”.</template></p>
    <a v-if="!ios" class="button primary" :href="chromeLink">Otwórz w Chrome</a>
    <p><button class="ghost" @click="embedded = false">Spróbuj mimo to</button></p>
  </div>
  <!-- Konto bez zatwierdzenia (albo zatwierdzone, ale bez dostępu do Dysku). -->
  <div v-else-if="!ready && gate && me" class="center gate">
    <img src="logo.png" alt="Kościół Na Skale">
    <template v-if="gate === 'pending'">
      <span class="gate-pending"><i></i>Prośba wysłana</span>
      <h2>Czekasz na zatwierdzenie</h2>
      <p class="note">Administrator kościoła musi zatwierdzić Twoje konto.</p>
    </template>
    <template v-else-if="gate === 'rejected'">
      <h2>Brak dostępu</h2>
      <p class="note">To konto nie ma dostępu do aplikacji. Jeśli to pomyłka, porozmawiaj z pastorem albo kimś z rady zboru.</p>
    </template>
    <template v-else>
      <h2>Dostęp zatwierdzony</h2>
      <p class="note">Ostatni krok: pozwól aplikacji korzystać z Dysku Google — tam są nabożeństwa i pieśni kościoła.</p>
    </template>
    <div class="whoami"><svg class="i"><use href="#user"/></svg><span><b>{{ me.name || me.email }}</b><small>{{ me.email }}</small></span></div>
    <button v-if="gate === 'approved'" class="primary" :disabled="busy" @click="continueToDrive">{{ busy ? 'Wczytuję…' : 'Wejdź do aplikacji' }}</button>
    <button v-else-if="gate === 'pending'" class="primary" :disabled="busy" @click="recheck">{{ busy ? 'Sprawdzam…' : 'Sprawdź ponownie' }}</button>
    <div class="gate-links">
      <button class="ghost" :disabled="busy" @click="otherAccount">Inne konto</button>
      <button class="ghost" :disabled="busy" @click="logout">Wyloguj</button>
    </div>
  </div>
  <div v-else-if="!ready && booting" class="boot" aria-busy="true" aria-label="Wczytywanie">
    <div class="skel skel-line" style="width:min(320px,60%);height:28px"></div>
    <div class="skel skel-line" style="width:min(220px,40%)"></div>
    <div class="boot-grid"><div class="skel skel-hero"></div><div class="skel skel-hero"></div></div>
    <div class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 5" :key="n" class="skel skel-row"></div></div>
  </div>
  <div v-else-if="!ready" class="center">
    <img src="logo.png" alt="Kościół Na Skale">
    <div v-if="countdown" class="countdown login-cd">
      <span v-if="countdown.live" class="cd-live"><i class="cd-dot"></i>W TRAKCIE</span>
      <span v-else class="cd-label">Do nabożeństwa</span>
      <span v-if="!countdown.live" class="cd-digits">
        <template v-if="countdown.days"><b>{{ countdown.days }}</b><small>{{ countdown.days === 1 ? 'dzień' : 'dni' }}</small></template>
        <b>{{ countdown.hours }}</b><small>godz</small><b>{{ countdown.minutes }}</b><small>min</small><b>{{ countdown.seconds }}</b><small>s</small>
      </span>
      <span class="cd-when">{{ countdown.when }} · {{ countdown.place }}</span>
    </div>
    <p v-if="pendingLink && pendingLink.kind" class="pending-note"><svg class="i"><use href="#link"/></svg>{{ LINK_LABEL[pendingLink.kind] ? 'Ktoś udostępnił Ci ' + LINK_LABEL[pendingLink.kind] : 'Otwierasz link do aplikacji' }} — po zalogowaniu od razu się otworzy.</p>
    <p class="note">{{ api.enabled ? 'Zaloguj się kontem Google. Nowe konto czeka na zatwierdzenie przez administratora kościoła.' : 'Zaloguj się kontem Google, które ma dostęp do folderu „Aplikacja KNS Nabo”.' }}</p>
    <!-- Logowanie Google działa tylko pod adresem zarejestrowanym w Google Cloud. -->
    <div v-if="wrongOrigin" class="origin-warn">
      <b>Ta strona jest otwarta pod innym adresem</b> ({{ origin }}) — Google nie pozwoli tu się zalogować.
      <a class="button primary" :href="appUrl">Otwórz {{ appUrl.replace('https://', '') }}</a>
    </div>
    <button class="primary" :disabled="busy" @click="start()">{{ busy ? 'Wczytuję…' : drive.account() ? 'Zaloguj ponownie' : 'Zaloguj kontem Google' }}</button>
    <p v-if="drive.account()" class="note">jako {{ drive.account() }} · <button class="ghost link" :disabled="busy" @click="otherAccount">inne konto</button></p>
  </div>

  <!-- lista -->
  <!-- baza pieśni: edycja pojedynczej pieśni -->
  <SongEditView v-else-if="song" />

  <!-- ogłoszenie -->
  <AnnouncementView v-else-if="currentAnn" />

  <!-- wszystkie ogłoszenia -->
  <AnnouncementsView v-else-if="annView" />

  <!-- materiał (protokół, instrukcja, plik pomocniczy): podgląd (otwarcie pliku) albo edycja -->
  <MaterialView v-else-if="currentProto" />

  <!-- materiały: protokoły, instrukcje i pliki pomocnicze -->
  <MaterialsView v-else-if="protoView" />

  <EventView v-else-if="currentEvent" />

  <!-- szablon jednego rodzaju wydarzeń -->
  <TemplateView v-else-if="tplType" />

  <!-- lista szablonów -->
  <TemplatesView v-else-if="tplView" />

  <!-- kalendarz życia kościoła -->
  <CalendarView v-else-if="calView" />

  <!-- osoby i rangi (administrator) -->
  <PeopleView v-else-if="peopleView" />

  <!-- baza pieśni: lista -->
  <SongsView v-else-if="songView" />

  <!-- Kalendarz kościoła w Kalendarzu Google (subskrypcja) -->
  <GoogleCalendarView v-else-if="gcalView && !current" />

  <!-- Więcej: wszystko poza Startem i Kalendarzem (tylko to, do czego dana ranga ma dostęp) -->
  <!-- Zaangażuj się: służby szukające chętnych, zgłoszenia, akceptacja przez lidera -->
  <ServeView v-else-if="serveView && !current" />

  <!-- ASB: grafik spotkań studenckich (dawniej arkusz „ASB | GRAFIK”) i osobno lista pomysłów -->
  <AsbPublicView v-else-if="asbView && !current && !canAsb" />
  <AsbView v-else-if="asbView && !current" />

  <!-- Posłuchaj: YouTube i Spotify (linki ustawia administrator) -->
  <!-- Cele wsparcia: deklaracje z dziesięciny, potwierdzanie miesięcy, pasek postępu; rada — cele i kto ile -->
  <!-- Wybory i głosowania: zgłoszenia → rada zatwierdza → tajne głosowanie (można kilka) → wyniki -->
  <VotesView v-else-if="votesView && !current" />
  <ServicesView v-else-if="svcListView && !current" />
  <BugsView v-else-if="bugsView && !current" />

  <GoalsView v-else-if="goalsView && !current" />

  <ListenView v-else-if="listenView && !current" />

  <!-- Mój profil: imię i nazwisko, grupka -->
  <ProfileView v-else-if="profileView && !current" />

  <MoreView v-else-if="moreView && !current" />

  <!-- Start: powitanie, najbliższe nabożeństwo i komunikaty rady, ten tydzień, kartki z newslettera.
       Na szerokim ekranie (przeglądarka na komputerze) — układ jak w aplikacji na komputer. -->
  <HomeView v-else-if="!current" />

  <!-- edycja -->
  <ServiceEditView v-else />

  <!-- Strona dla gości (bez konta albo przed zatwierdzeniem): tylko „Posłuchaj — odkryj nas”. -->
  <PublicListen v-if="!ready && !booting && !embedded && (listenYt || listenSp || isChannelLink(listen.youtube))" />


  <!-- Skład zespołu: wybór osoby ze służby muzycznej (instrument wybiera się potem w wierszu) -->
  <BandPickDialog v-if="bandPick.open" />

  <!-- Dodawanie osoby do służby (lider) -->
  <AddPersonDialog v-if="addTo" />

  <!-- Kod QR do wydarzenia / ogłoszenia: podgląd, pobranie PNG -->
  <QrDialog v-if="qr" />

  <!-- Wiadomość do rang i służb (pastor, rada, administrator; lider ASB → ASB; lider służby → jego służba) -->
  <MessageDialog v-if="msg.open" />

  <!-- ASB: edycja spotkania -->
  <AsbMeetingDialog v-if="asbForm" />
  <AsbPreviewDialog v-if="asbPreview && !asbForm" />

  <!-- Powiadomienia w aplikacji (zawsze włączone; telefon i e-mail — dodatkowo, w ustawieniach) -->
  <InboxDialog v-if="inboxOpen" />

  <!-- Służba: edycja (administrator — wszystko; lider — opis i „szukamy chętnych”) -->
  <MinistryDialog v-if="mEdit" />

  <!-- Wybór odbiorców powiadomienia: grupy (wszyscy, rangi) albo pojedyncze osoby. -->
  <div v-if="notify.open" class="np-overlay" @click.self="closeNotify">
  <div class="np-panel" role="dialog" :aria-label="notify.mode === 'people' ? 'Kto bierze udział' : 'Kogo powiadomić'">
    <div class="np-head"><b>{{ notify.mode === 'people' ? 'Kto bierze udział?' : 'Kogo powiadomić?' }}</b><button class="icon" aria-label="Zamknij" @click="closeNotify"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="searchbox"><svg class="i"><use href="#search"/></svg><input v-model="notify.query" type="search" placeholder="Szukaj osoby albo grupki" autocomplete="off"></div>
    <p v-if="notify.error" class="error">{{ notify.error }}</p>
    <div v-else-if="!directory.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 6" :key="n" class="skel skel-row"></div></div>
    <div class="notify-groups">
      <button v-for="g in notifyGroupsShown" :key="g.id" type="button" class="chipbtn" :class="{ on: g.ids.length && g.ids.every(id => notify.ids.includes(id)) }" @click="toggleGroup(g)">{{ g.name }} · {{ g.ids.length }}</button>
      <button v-if="notify.ids.length" type="button" class="chipbtn clear" @click="notify.ids = []">Wyczyść</button>
    </div>
    <div class="np-list">
      <label v-for="p in directoryShown" :key="p.id" class="check notify-person">
        <input v-model="notify.ids" type="checkbox" :value="p.id">
        <span><b>{{ p.name }}</b><small :class="{ off: !p.devices }">{{ p.grupa ? p.grupa + ' · ' : '' }}{{ p.devices ? 'w aplikacji i na telefonie' : 'w aplikacji' }}</small></span>
      </label>
      <p v-if="directory.length && !directoryShown.length" class="note">Nikogo takiego nie ma.</p>
    </div>
    <div class="np-foot"><button class="primary" @click="closeNotify"><svg class="i"><use href="#check"/></svg>Gotowe · wybrano {{ notify.ids.length }}</button></div>
  </div>
  </div>




  <!-- Dolny pasek: główne części aplikacji (chowa się przy edycji, żeby nie zasłaniał „Zapisz”). -->
  <BugReportDialog v-if="bugs.form" />
  <LiveEvent v-if="ready" :class="{ tabbed: showTabs }" />
  <TabBar v-if="showTabs" />
  <AskDialog />
</template>
