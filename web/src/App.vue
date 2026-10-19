<script lang="ts">
// @ts-nocheck — kod przeniesiony 1:1 z dawnego index.html; typy dochodzą stopniowo (podział na widoki i composables)
import { computed, defineComponent, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import { CONFIG } from '@/services/config'
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
const VERSION = '2.90 · 19.10.2026'

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
  setup() {
    const ready = ref(false), busy = ref(false), error = ref(''), status = ref('')
    // Zapamiętane logowanie: do wczytania danych szkielet strony zamiast ekranu logowania.
    const booting = ref(!demo && !!clientId && !!memberEmail())
    const services = ref([]), songs = ref([])
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
    const homeWide = computed(() => ready.value && !current.value && !song.value && !camera.value && !currentEvent.value && !tplView.value && !currentProto.value && !protoView.value && !currentAnn.value && !annView.value && !calView.value && !moreView.value && !songView.value && !peopleView.value && !gcalView.value && !profileView.value && !serveView.value && !listenView.value && !asbView.value && !goalsView.value && !votesView.value)
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
    function logout() {
      drive.signOut()
      ready.value = false; services.value = []; current.value = null
      gate.value = ''; me.value = null; people.value = []; peopleView.value = false; annView.value = false; currentAnn.value = null
      currentProto.value = null; protoView.value = false; currentEvent.value = null; tplView.value = false; tplType.value = null; calView.value = false
    }
    /* ---------- przeniesienie danych z Dysku do bazy (administrator, jednorazowo) ---------- */
    const migrating = ref(''), migrated = ref('')
    async function migrate() {
      if (!confirm('Przenieść dane z plików na Dysku Google do bazy? Google zapyta o konto z dostępem do folderu „Aplikacja KNS Nabo”.')) return
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
    const peopleGroups = computed(() => [
      { id: 'pending', title: 'Czekają na zatwierdzenie', list: people.value.filter(p => p.status === 'pending').sort((a, b) => b.requested - a.requested) },
      { id: 'active', title: 'Członkowie', list: people.value.filter(p => p.status === 'active').sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'pl')) },
      { id: 'rejected', title: 'Bez dostępu', list: people.value.filter(p => p.status === 'rejected') },
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
      if (status === 'rejected' && p.status === 'active' && !confirm(`Odebrać dostęp osobie ${p.name || p.email}? Straci dostęp do folderów aplikacji na Dysku.`)) return
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
    function back() {
      if (dirty.value && !confirm('Masz niezapisane zmiany. Wyjść bez zapisywania?')) return
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
    function closeAll() {
      if ((current.value && dirty.value) || (currentEvent.value && eventDirty.value) || (currentAnn.value && annDirty.value)) {
        if (!confirm('Masz niezapisane zmiany. Wyjść bez zapisywania?')) return false
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
    const HERO_ART = ['swit.svg', 'pole.svg', 'jezioro.svg', 'noc.svg']
    const heroArt = ref(0)
    setInterval(() => { if (!document.hidden) heroArt.value = (heroArt.value + 1) % HERO_ART.length }, 9000)
    const mapLink = place => (/^(online|zoom|teams|meet)\b/i.test(String(place).trim()) ? null : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place))
    const sideNav = computed(() => {
      const tech = canCamera.value
      return [
        { title: '', items: [
          { id: 'home', icon: 'church', name: 'Start' },
          { id: 'cal', icon: 'calendar', name: 'Kalendarz' },
          ...(canEdit.value ? [{ id: 'svc', icon: 'book', name: 'Nabożeństwa', badge: nextService.value && missing(nextService.value).length ? '!' : '' }] : []),
          { id: 'anns', icon: 'megaphone', name: 'Ogłoszenia', badge: activeAnns.value.filter(annIsNew).length || '' },
        ] },
        ...(api.enabled ? [{ title: 'Wspólnota', items: [
          { id: 'serve', icon: 'serve', name: 'Zaangażuj się' },
          { id: 'goals', icon: 'money', name: 'Cele wsparcia', badge: goalDue.value ? '!' : '' },
          { id: 'votes', icon: 'check', name: 'Głosowania', badge: votesOpen.value || '' },
          { id: 'listen', icon: 'music', name: 'Posłuchaj' },
          { id: 'asb', icon: 'users', name: 'ASB' },
        ] }] : []),
        { title: 'Narzędzia', items: [
          ...(inApp && tech ? [{ id: 'display', icon: 'monitor', name: 'Rzutnik' }, { id: 'stream', icon: 'camera', name: 'Stream' }] : []),
          { id: 'songs', icon: 'music', name: 'Pieśni' },
          { id: 'mats', icon: 'list', name: 'Materiały' },
          ...(canEdit.value ? [{ id: 'tpl', icon: 'file', name: 'Szablony' }] : []),
          ...(canManage.value ? [{ id: 'people', icon: 'user', name: 'Osoby', badge: pendingCount.value || '' }] : []),
          ...(canMsg.value ? [{ id: 'msg', icon: 'mail', name: 'Wyślij wiadomość' }] : []),
          ...(cueTopic && tech && !inApp ? [{ id: 'camera', icon: 'camera', name: 'Kamera (sygnały)' }] : []),
        ] },
      ]
    })
    function navOn(id) {
      const editor = current.value || currentEvent.value || currentAnn.value || currentProto.value || song.value || tplType.value
      const other = calView.value || gcalView.value || annView.value || protoView.value || tplView.value || songView.value || peopleView.value || profileView.value || serveView.value || listenView.value || asbView.value || goalsView.value || votesView.value || moreView.value
      return {
        home: !editor && !other, cal: !!currentEvent.value || calView.value || gcalView.value, svc: !!current.value, anns: annView.value || !!currentAnn.value,
        serve: serveView.value, goals: goalsView.value, votes: votesView.value, listen: listenView.value, asb: asbView.value,
        songs: songView.value || !!song.value, mats: (protoView.value || !!currentProto.value) && !currentEvent.value, tpl: tplView.value || !!tplType.value, people: peopleView.value, profile: profileView.value,
      }[id] || false
    }
    function navTo(id) {
      if (id === 'display' || id === 'stream') { window.knsDesktop?.open(id); return }
      if (id === 'msg') { openMsg(); return }
      if (id === 'camera') { openCamera(); return }
      if (!closeAll()) return
      resetViews()
      if (id === 'cal') openCalendar()
      else if (id === 'svc') nextService.value ? open(nextService.value) : create(planSunday.value)
      else if (id === 'anns') openAnns()
      else if (id === 'serve') openServe()
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
    function showServices() { serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; votesView.value = false; profileView.value = false; songView.value = false; peopleView.value = false; calView.value = false; moreView.value = false; gcalView.value = false; scrollTo(0, 0) }
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
    function closeSong() {
      if (songDirty.value && song.value.title.trim() && !confirm('Masz niezapisane zmiany w pieśni. Wyjść bez zapisywania?')) return
      song.value = null
    }
    const saveSong = (force = false) => guard(async () => {
      const { isNew, ...data } = song.value
      data.number = data.number.trim(); data.title = data.title.trim()
      try {
        songs.value = await drive.saveSongs({ song: data }, songBase, force === true)
      } catch (e) {
        if (!e.conflict) throw e
        if (!confirm('Ktoś inny zmienił tę pieśń, odkąd ją otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowszą wersję.')) { openSong(e.remote); status.value = 'Wczytano najnowszą wersję'; return }
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
          !confirm('Na ten dzień jest już inne nabożeństwo. Zapisać mimo to? Komputer połączy je w jedno.')) return
      svc.updatedBy = drive.account() || 'telefon'
      // Teksty pieśni jadą razem z nabożeństwem — komputer, który ich nie ma, dopisze je do swojej bazy.
      const texts = svc.songs.map(e => songs.value.find(sameSong(e))).filter(Boolean).map(({ number, title, text }) => ({ number: number || '', title, text }))
      const payload = { service: { ...JSON.parse(JSON.stringify(svc)), updated: Date.now(), shared: true }, songs: texts }
      try {
        await drive.save(payload, base, force === true)
      } catch (e) {
        if (!e.conflict) throw e
        // Ktoś (inny telefon albo komputer) zapisał to nabożeństwo, odkąd je otwarto.
        if (confirm('Ktoś inny zmienił to nabożeństwo, odkąd je otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowszą wersję.')) {
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
    function fillProgram(target, typeId) {
      if (target.program.length && !confirm('Zastąpić obecny program programem z szablonu?')) return
      target.program.splice(0, target.program.length, ...programFrom(typeOf(typeId), uid))
    }
    // Jeden kalendarz: nabożeństwa i pozostałe wydarzenia.
    const calItems = computed(() => [
      ...services.value.filter(s => s.date).map(s => ({ kind: 'service', id: s.id, type: 'nabozenstwo', date: s.date, time: s.time || DEFAULT_TIME, place: s.place || DEFAULT_PLACE, title: s.sermonTitle ? 'Nabożeństwo: ' + s.sermonTitle : 'Nabożeństwo', ref: s })),
      ...events.value.filter(e => e.date).map(e => ({ kind: 'event', id: e.id, type: e.type, date: e.date, time: e.time || '', place: e.place || '', title: e.title || typeOf(e.type).name, ref: e })),
    ].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00'))))
    let hiddenSaved = []
    try { hiddenSaved = JSON.parse(localStorage.getItem('kns-cal-hidden') || '[]') } catch { /* brak zapisu */ }
    const hidden = ref(hiddenSaved)
    function toggleType(id) {
      hidden.value = hidden.value.includes(id) ? hidden.value.filter(x => x !== id) : [...hidden.value, id]
      try { localStorage.setItem('kns-cal-hidden', JSON.stringify(hidden.value)) } catch { /* tryb prywatny */ }
    }
    const visibleItems = computed(() => calItems.value.filter(it => !hidden.value.includes(it.type)))
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
    // Pod kalendarzem: wybrany dzień albo najbliższe 60 dni.
    const agenda = computed(() => {
      if (selDay.value) return visibleItems.value.filter(it => it.date === selDay.value)
      const until = localDate(new Date(Date.now() + 60 * 86400000))
      return visibleItems.value.filter(it => it.date >= todayStr.value && it.date <= until).slice(0, 30)
    })
    let fromCal = false // nabożeństwo otwarte z kalendarza wraca do kalendarza
    function openCalendar() { serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; votesView.value = false; profileView.value = false; songView.value = false; peopleView.value = false; moreView.value = false; gcalView.value = false; calView.value = true; scrollTo(0, 0) }
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
    const signupLeave = () => { if (confirm('Wypisać się z tego wydarzenia?')) guard(async () => { await api.call('signupLeave', { id: currentEvent.value.id }); api.call('pushInbox').catch(() => {}); await loadSignup(); status.value = 'Wypisano.' }) }
    function signupDecide(p, decision) {
      if (decision === 'remove' && !confirm('Usunąć ' + p.name + ' z zapisów?')) return
      guard(async () => { await api.call('signupDecide', { id: currentEvent.value.id, who: p.id, decision }); api.call('pushInbox').catch(() => {}); await loadSignup() })
    }
    const eventSavedOnce = computed(() => !!currentEvent.value && [...events.value, ...pendingEvents.value].some(x => x.id === currentEvent.value.id))
    function openEvent(ev) {
      currentEvent.value = { type: 'inne', title: '', date: today(), time: '', place: '', description: '', program: [], ...JSON.parse(JSON.stringify(ev)) }
      if (['czlonkowskie', 'rada'].includes(currentEvent.value.type) && api.enabled) loadProtocols()
      if (api.enabled) loadVotes() // głosowania podpięte pod to spotkanie
      eventSaved = JSON.stringify(currentEvent.value); eventBase = ev.updated || 0; eventType = currentEvent.value.type
      eventEditing.value = false
      loadSignup()
      notify.ids = []
      status.value = ''; confirmDelete.value = false; scrollTo(0, 0)
    }
    // „Zaproś kościół”: kalendarz z wyborem rodzaju nowego wydarzenia
    function inviteEvent() { if (!calView.value) openCalendar(); pickType.value = true; nextTick(() => document.querySelector('.cal-actions')?.scrollIntoView({ block: 'center', behavior: 'smooth' })) }
    function newEvent(typeId) {
      pickType.value = false
      if (typeId === 'nabozenstwo') { create(selDay.value || undefined); fromCal = true; return }
      const t = typeOf(typeId)
      openEvent({ id: uid(), type: typeId, title: t.name, date: selDay.value || today(), time: t.time || '', place: t.place || '', description: '', program: programFrom(t, uid), createdBy: me.value?.name || drive.account() || 'telefon' })
      eventSaved = '' // nowe wydarzenie od razu jest „do zapisania”
      eventEditing.value = true
    }
    // Zmiana rodzaju: podpowiedzi z szablonu zastępują tylko to, czego nikt jeszcze nie zmienił.
    function typeChanged() {
      const ev = currentEvent.value, old = typeOf(eventType), t = typeOf(ev.type)
      if (!ev.title.trim() || ev.title === old.name) ev.title = t.name
      if (!ev.place || ev.place === old.place) ev.place = t.place || ''
      if (!ev.time || ev.time === old.time) ev.time = t.time || ''
      if (!ev.program.length) ev.program = programFrom(t, uid)
      eventType = ev.type
    }
    function closeEvent() {
      if (eventDirty.value && eventSavedOnce.value && !confirm('Masz niezapisane zmiany. Wyjść bez zapisywania?')) return
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
        if (!confirm('Ktoś inny zmienił to wydarzenie, odkąd je otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowszą wersję.')) {
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
    function closeType() {
      if (tplDirty.value && tplType.value.name.trim() && !confirm('Masz niezapisane zmiany w szablonie. Wyjść bez zapisywania?')) return
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
        if (!confirm('Ktoś inny zmienił szablony w międzyczasie. Zapisać mimo to i zastąpić jego zmiany?\n\nAnuluj — wczytam najnowsze szablony.')) { await fetchAll(); tplType.value = null; return false }
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
    function closeProto() {
      if (protoEditing.value && protoDirty.value && protoSavedOnce.value && !confirm('Masz niezapisane zmiany. Wyjść bez zapisywania?')) return
      if (protoEditing.value && protoSavedOnce.value) { const p = protocolsRaw.value.find(x => x.id === currentProto.value.id); if (p) { openProto(p); return } }
      currentProto.value = null
    }
    const saveProto = () => guard(async () => {
      const p = currentProto.value, f = protoFile.value, old = p.file
      const data = { ...JSON.parse(JSON.stringify(p)), title: p.title.trim(), status: 'zatwierdzony', updated: Date.now(), updatedBy: me.value?.name || drive.account() || 'telefon' }
      if (f) Object.assign(data, { file: await drive.uploadProtocolFile(f), fileName: f.name, fileType: f.type, size: f.size })
      try { await drive.saveProtocol(data, protoBase) } catch (e) {
        if (!e.conflict) throw e
        if (!confirm('Ktoś inny zmienił ten materiał, odkąd go otworzyłeś. Zapisać mimo to?')) return
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
    function rejectEvent() { if (confirm('Odrzucić to zgłoszenie? Zostanie usunięte.')) removeEvent() }
    function rejectAnn() { if (confirm('Odrzucić to zgłoszenie? Zostanie usunięte.')) removeAnn() }
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
    function closeAnn() {
      if (annDirty.value && annSavedOnce.value && !confirm('Masz niezapisane zmiany w ogłoszeniu. Wyjść bez zapisywania?')) return
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
        if (!confirm('Ktoś inny zmienił to ogłoszenie, odkąd je otworzyłeś. Zapisać mimo to i zastąpić jego zmiany?')) return
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
        openServe(); linkedMinistry.value = mId || ''
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
    async function loadServe() {
      if (!api.enabled) return
      serve.busy = true; serve.error = ''
      try { serve.list = (await api.call('ministries')) || [] } catch (e) { serve.error = e.message } finally { serve.busy = false }
    }
    function openServe() {
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
    function removeFromMinistry(m, p) { if (confirm('Usunąć ' + p.name + ' ze służby „' + m.name + '”?')) serveCall('decideMinistry', { id: m.id, who: p.id, accept: false }) }
    const joinMinistry = m => serveCall('joinMinistry', { id: m.id })
    function leaveMinistry(m) { if (confirm(m.mine === 'active' ? `Zrezygnować ze służby „${m.name}”?` : 'Wycofać zgłoszenie?')) serveCall('leaveMinistry', { id: m.id }) }
    const decideMinistry = (m, p, accept) => serveCall('decideMinistry', { id: m.id, who: p.id, accept })
    function editMinistry(m = null) {
      mEdit.value = m ? { id: m.id, name: m.name, description: m.description, seeking: m.seeking, leaders: m.leaders.map(l => l.id), isNew: false, full: !!m.full }
        : { id: uid(), name: '', description: '', seeking: true, leaders: [], isNew: true, full: true }
      if (mEdit.value.full && !memberNames.value.length) api.call('memberNames').then(r => { memberNames.value = r.people || [] }, () => {})
    }
    function toggleLeader(id) { const l = mEdit.value.leaders; mEdit.value.leaders = l.includes(id) ? l.filter(x => x !== id) : [...l, id] }
    const saveMinistry = () => guard(async () => { const m = mEdit.value; await api.call('saveMinistry', m.full ? { ...m, leaders: m.leaders.filter(id => memberNames.value.some(p => p.id === id)) } : m); mEdit.value = null; await loadServe() })
    function deleteMinistry() { if (confirm('Usunąć tę służbę razem z listą osób?')) guard(async () => { await api.call('deleteMinistry', { id: mEdit.value.id }); mEdit.value = null; await loadServe() }) }
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
      serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; votesView.value = false; profileView.value = true; scrollTo(0, 0); loadServe()
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
    // Próbny newsletter: prośba w bazie, wysyła skrypt Google (co minutę); sprawdzamy, kiedy wyszedł.
    const mailTest = reactive({ busy: false, text: '', bad: false })
    async function testNewsletter() {
      mailTest.busy = true; mailTest.text = ''; mailTest.bad = false
      try {
        const { id } = await api.call('testNewsletter')
        mailTest.text = 'Wysłano prośbę — e-mail przyjdzie na ' + me.value.email + ' w ciągu 1–2 minut.'
        for (let i = 0; i < 18; i++) {
          await new Promise(r => setTimeout(r, 10000))
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
    const asbView = ref(false), asbForm = ref(null)
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
    const asbRemind = () => {
      if (!confirm('Wysłać przypomnienie o tym spotkaniu wszystkim z rangą ASB? (Najpierw zapiszę zmiany.)')) return
      guard(async () => {
        await asbPersist()
        const n = await api.call('asbRemind', { id: asbForm.value.id })
        asbForm.value.reminded = new Date().toISOString()
        showToast(n ? 'Wysłano przypomnienie do ' + n + (n === 1 ? ' osoby' : ' osób') : 'Nikt poza Tobą nie ma rangi ASB — nie było do kogo wysłać.')
        loadAsb()
      })
    }
    const asbAddFile = e => {
      const f = e.target.files?.[0]; e.target.value = ''
      if (!f) return
      if (f.size > 25 * 1024 * 1024) { error.value = 'Plik jest za duży (najwyżej 25 MB).'; return }
      guard(async () => { const path = await drive.uploadAsbFile(f); asbForm.value?.files.push({ name: f.name, path }) })
    }
    function asbRemoveFile(f) {
      if (!confirm('Usunąć załącznik „' + f.name + '”? (Zniknie po zapisaniu spotkania.)')) return
      asbForm.value.files = asbForm.value.files.filter(x => x.path !== f.path); asbForm.value._removed.push(f.path)
    }
    function asbOpenFile(f) {
      const w = window.open('', '_blank')
      guard(async () => { const u = await drive.asbFileUrl(f.path); if (w) w.location.href = u; else location.href = u })
    }
    function asbDelete() {
      if (!confirm('Usunąć to spotkanie z grafiku? Zniknie też z kalendarza kościelnego.')) return
      guard(async () => {
        const m = asbForm.value
        await api.call('asbDelete', { id: m.id })
        for (const p of [...m.files.map(f => f.path), ...m._removed]) drive.removeAsbFile?.(p)
        asbForm.value = null; await loadAsb()
      })
    }
    const asbIdeaAdd = () => { if (asb.ideaTopic.trim()) guard(async () => { await api.call('asbIdea', { id: uid(), topic: asb.ideaTopic.trim(), author: asb.ideaAuthor.trim() || me.value?.name?.split(' ')[0] || '' }); asb.ideaTopic = ''; asb.ideaAuthor = ''; await loadAsb() }) }
    function asbIdeaDelete(i) { if (confirm('Usunąć pomysł „' + i.topic + '”?')) guard(async () => { await api.call('asbIdeaDelete', { id: i.id }); await loadAsb() }) }

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
    const goalProjAmount = g => g.confirmed + Math.max(0, g.monthly * g.months_left - g.confirmed_now)
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
      goalsView.value = true; goals.open = id; goals.edit = null; goals.reduce = null; scrollTo(0, 0)
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
    function withdraw(g) { if (confirm('Wycofać deklarację na „' + g.title + '”? To, co już potwierdziłeś, zostaje w zebranej kwocie.')) { goals.amount[g.id] = 0; savePledge(g) } }
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
    function newGoal() { goals.edit = { id: uid(), title: '', description: '', target: '', ends: '', image: '', closed: false, _new: true }; scrollTo(0, 0) }
    function editGoal(g) { goals.edit = { id: g.id, title: g.title, description: g.description, target: g.target, ends: String(g.ends).slice(0, 10), image: g.image, closed: !!g.closed }; scrollTo(0, 0) }
    const saveGoal = () => guard(async () => {
      const e = goals.edit
      if (e._new && e.ends < todayStr.value) throw new Error('Termin nie może być w przeszłości.')
      await api.call('saveGoal', { goal: { ...e, title: e.title.trim(), target: Math.round(+e.target) } })
      goals.edit = null
      await loadGoals()
      showToast('Zapisano cel.')
    })
    const removeGoal = g => { if (confirm('Usunąć cel „' + g.title + '” razem z deklaracjami i potwierdzeniami? Tego nie da się cofnąć.')) guard(async () => { await api.call('removeGoal', { id: g.id }); goals.edit = null; await loadGoals() }) }
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
    const votesView = ref(false)
    const votes = reactive({ list: [], canRun: false, busy: false, error: '', edit: null, people: [], pick: {}, ballot: {}, open: '' })
    const votesOpen = computed(() => votes.list.filter(e => e.status === 'voting' && !e.voted).length)
    const VOTE_STATUS = { nominations: 'Zgłaszanie kandydatów', ready: 'Przygotowane', voting: 'Głosowanie trwa', paused: 'Wstrzymane', closed: 'Zakończone' }
    const eventOf = e => (e.event_id ? events.value.find(x => x.id === e.event_id) || null : null)
    // spotkania do podpięcia: od tygodnia wstecz, najpierw członkowskie i rady
    const voteEvents = computed(() => events.value.filter(ev => ev.date >= localDate(new Date(Date.now() - 7 * 864e5)))
      .sort((a, b) => (['czlonkowskie', 'rada'].includes(b.type) - ['czlonkowskie', 'rada'].includes(a.type)) || a.date.localeCompare(b.date)).slice(0, 60))
    // głosowania podpięte pod otwarte wydarzenie
    const eventVotes = computed(() => (currentEvent.value ? votes.list.filter(e => e.event_id === currentEvent.value.id) : []))
    function newVoteFor(id) { openVotes().then(() => newElection(id)) }
    function goToVote(e) { openVotes().then(() => { votes.open = e.id; nextTick(() => document.querySelector('.vote.focus')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }) }
    async function loadVotes() {
      if (!api.enabled || !ready.value) return
      votes.busy = true; votes.error = ''
      try { const [list, can] = await Promise.all([api.call('elections'), api.call('canElections')]); votes.list = list || []; votes.canRun = !!can }
      catch (e) { votes.error = e.message || String(e) } finally { votes.busy = false }
    }
    async function loadElectionPeople() { if (!votes.people.length) try { votes.people = (await api.call('electionPeople')) || [] } catch (e) { votes.error = e.message } }
    function openVotes() {
      resetViews(); votesView.value = true; votes.edit = null; scrollTo(0, 0)
      return loadVotes().then(() => { if (votes.list.some(e => e.status === 'nominations' && e.kind === 'people')) loadElectionPeople() })
    }
    const optionsOf = e => String(e.optionsText || '').split('\n').map(x => x.trim()).filter(Boolean)
    function newElection(eventId = '') { votes.edit = { _new: true, id: '', title: '', description: '', kind: 'people', max_choices: 1, results_public: true, optionsText: 'Za\nPrzeciw\nWstrzymuję się', status: 'nominations', event_id: typeof eventId === 'string' ? eventId : '' }; scrollTo(0, 0) }
    function editElection(e) { votes.edit = { id: e.id, title: e.title, description: e.description, kind: e.kind, max_choices: e.max_choices, results_public: e.results_public, status: e.status, event_id: e.event_id || '', optionsText: e.kind === 'options' ? e.candidates.map(c => c.label).join('\n') : '' }; scrollTo(0, 0) }
    const saveElection = () => guard(async () => {
      const e = votes.edit
      await api.call('electionSave', { e: { id: e.id || undefined, title: e.title.trim(), description: e.description || '', kind: e.kind, max_choices: Math.max(1, +e.max_choices || 1), results_public: !!e.results_public, event_id: e.event_id || '', ...(e.kind === 'options' ? { options: optionsOf(e) } : {}) } })
      votes.edit = null
      await loadVotes()
      showToast('Zapisano głosowanie.')
    })
    const removeElection = e => { if (confirm('Usunąć „' + e.title + '” razem ze zgłoszeniami i głosami? Tego nie da się cofnąć.')) guard(async () => { await api.call('electionRemove', { e: e.id }); votes.edit = null; await loadVotes() }) }
    const nominate = (e, who = votes.pick[e.id], withdraw = false) => guard(async () => {
      await api.call('electionNominate', { e: e.id, who, withdraw })
      votes.pick[e.id] = ''
      await loadVotes()
      showToast(withdraw ? 'Wycofano zgłoszenie.' : 'Zgłoszono kandydata — rada zdecyduje, kto bierze udział.')
    })
    const reviewCand = (c, ok) => guard(async () => { await api.call('electionReview', { c: c.id, ok }); await loadVotes() })
    const setElectionStatus = (e, s) => {
      const ask = s === 'voting' && e.status === 'nominations' ? 'Rozpocząć głosowanie? Lista kandydatów zostanie zamknięta, a członkowie dostaną powiadomienie.' : s === 'closed' ? 'Zakończyć głosowanie? Potem nie da się już oddać głosu.' : ''
      if (!ask || confirm(ask)) guard(async () => { await api.call('electionStatus', { e: e.id, s }); await loadVotes(); if (s !== 'closed') showToast(s === 'paused' ? 'Głosowanie wstrzymane.' : 'Głosowanie aktywne.') })
    }
    function toggleBallot(e, c) {
      const cur = votes.ballot[e.id] || []
      votes.ballot[e.id] = e.max_choices === 1 ? (cur[0] === c.id ? [] : [c.id]) : cur.includes(c.id) ? cur.filter(x => x !== c.id) : cur.length < e.max_choices ? [...cur, c.id] : cur
    }
    const castVote = e => {
      const chosen = (votes.ballot[e.id] || []).map(id => e.candidates.find(c => c.id === id)?.label).filter(Boolean)
      if (!confirm('Oddać głos na: ' + chosen.join(', ') + '?\n\nGłos jest tajny i ostateczny — nie da się go zmienić.')) return
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
      annView.value = false; protoView.value = false; tplView.value = false; serveView.value = false; asbView.value = false; goalsView.value = false; votesView.value = false
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
    function renewGcal() { if (confirm('Utworzyć nowy adres? Kalendarze dodane ze starym adresem przestaną się uzupełniać.')) loadGcal(true) }
    async function copyGcal() { try { await navigator.clipboard.writeText(gcal.url); gcal.copied = true; setTimeout(() => { gcal.copied = false }, 1500) } catch { /* zaznacz ręcznie */ } }
    function openMore() { loadMsgOpts(); openMoreView() }
    function openMoreView() { serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; votesView.value = false; profileView.value = false; gcalView.value = false; songView.value = false; peopleView.value = false; calView.value = false; annView.value = false; protoView.value = false; tplView.value = false; moreView.value = true; scrollTo(0, 0) }
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
    watch(ready, ok => { if (ok && api.enabled && innerWidth >= 1024) { loadGoals(); loadServe() } }, { immediate: true })
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
      // Tylko telefony i tablety — na komputerze przypomnienia przychodzą mailem.
      supported: !!pushUrl && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) && ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window || ios),
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
      push.on = !!(await reg.pushManager.getSubscription()) && Notification.permission === 'granted'
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
        push.on = true
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
      } catch (e) { push.error = e.message || String(e) } finally { push.busy = false }
    }
    checkPush().catch(() => {})

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
      if (asbView.value) return asbForm.value && !asbForm.value._new ? '/asb/' + encodeURIComponent(asbForm.value.id) : asb.tab === 'ideas' ? '/asb/pomysly' : '/asb'
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
      peopleView.value = false; gcalView.value = false; profileView.value = false; serveView.value = false; listenView.value = false; asbView.value = false; goalsView.value = false; votesView.value = false; asbForm.value = null; fromCal = false
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
        else if (view === 'cele' || view === 'cel') openGoals(view === 'cel' ? id : '')
        else if (view === 'glosowania') openVotes()
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
    window.addEventListener('popstate', () => {
      if (!ready.value || camera.value) return
      if (anyDirty() && !confirm('Masz niezapisane zmiany. Wyjść bez zapisywania?')) { history.pushState(null, '', routePath.value); return }
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
      el.classList.toggle('has-side', ready.value)
      el.classList.toggle('narrow', !!(current.value || song.value || currentEvent.value || currentProto.value || currentAnn.value || tplType.value || peopleView.value || gcalView.value || profileView.value || serveView.value || listenView.value || asbView.value || goalsView.value || votesView.value || annView.value || protoView.value || tplView.value || songView.value))
    })
    return {
      votesView, votes, votesOpen, openVotes, VOTE_STATUS, eventOf, voteEvents, eventVotes, goToVote, newVoteFor, loadElectionPeople, optionsOf, newElection, editElection, saveElection, removeElection, nominate, reviewCand, setElectionStatus, toggleBallot, castVote,
      sideNav, navOn, navTo, inApp, mapLink, theme, toggleTheme, HERO_ART, heroArt, asDate, boardAll,
      events, types, typeOf, eventTypes, fillProgram, hidden, toggleType, calView, month0, selDay, pickType, WEEK, todayStr, monthLabel, shiftMonth, calDays, agenda,
      openCalendar, openItem, currentEvent, eventDirty, eventSavedOnce, openEvent, newEvent, typeChanged, closeEvent, saveEvent, removeEvent,
      tplView, tplType, tplDirty, openTemplates, openType, newType, closeType, saveTemplate, removeType, COLORS, cameFromCal: () => fromCal,
      AUDIENCE, announcements, canAnnounce, shortDate, activeAnns, oldAnns, importantAnns, homeAnns, annView, currentAnn, annDirty, annSavedOnce, annEditable,
      asb, asbView, asbForm, canAsb, asbSeasons, asbList, asbGroups, asbNext, asbAvg, asbPlaces, openAsb, asbEdit, asbAutoMonth, asbSave, asbDelete, asbIdeaAdd, asbIdeaDelete,
      booting, annIsNew, newAnnCount, annQuery, annHintsOpen, shownActiveAnns, shownOldAnns, annHints, hintParts, pickHint, isActive,
      ASB_KINDS, asbWhen, asbKindName, asbMissing, asbMissingCount, asbLeaderHints, asbPubUpcoming, asbPubShown, asbPubGroups,
      msg, msgRanks, msgMinistries, canMsg, openMsg, msgToggle, sendMsg,
      bulk, annFromImages,
      MAT_TYPES, MAT_PLURAL, MAT_COLOR, matType, protoAudience, protoTypeChanged, INSTRUMENTS, bandPick, bandPickList, openBandPick, bandAdd, bandPickFree, asbPause, asbTitle, asbCalNote, asbRemind, asbAddFile, asbRemoveFile, asbOpenFile, openAsbMeeting,
      goalsView, goals, shownMonths, zl, thisMonth, prevMonth, monthName, monthShort, itemsSum, goalDue, goalPct, goalProj, goalProjAmount, openGoals, savePledge, withdraw,
      startReduce, askConfirm, confirmMonth, support, supportEdit, saveSupport, transferTitle, copiedWhat, copyText, monthLocked, nextMonthStart, newGoal, editGoal, saveGoal, removeGoal, toggleGoalPeople, pickGoalImage,
      listen, listenView, listenEdit, listenYt, listenSp, listenLatest, isChannelLink, openListen, saveListen, youtubeEmbed, spotifyEmbed,
      shareLink, shareTarget, qr, openQr, toast, pendingLink, LINK_KIND, LINK_LABEL, linkedMinistry,
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
      peopleView, people, peopleBusy, peopleGroups, pendingCount, ranks, initials, ago, rolesChanged, toggleRank, loadPeople, openPeople, setPerson,
      showTabs, countdown, wd, relDay, DEFAULT_TIME, DEFAULT_PLACE, push, enablePush, disablePush, testPush, mailTest, testNewsletter, saveSchedule, DAYS, HOURS,
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
    }
  },
})
</script>

<template>
  <!-- Szeroki ekran: stały boczny pasek — wszystkie części aplikacji, konto na dole. -->
  <aside v-if="ready" class="side" aria-label="Nawigacja">
    <div class="side-top">
      <button class="side-brand" title="Strona startowa" @click="navTo('home')"><img src="znak.png" alt=""><span><b>Kościół Na Skale</b><small>KNS Nabo</small></span></button>
      <button v-if="api.enabled" class="side-ib" :class="{ on: inboxOpen }" title="Powiadomienia" aria-label="Powiadomienia" @click="openInbox"><svg class="i"><use href="#bell"/></svg><span v-if="unread" class="side-dot">{{ unread }}</span></button>
      <button class="side-ib" :class="{ spin: busy }" :disabled="busy" title="Odśwież" aria-label="Odśwież" @click="reload()"><svg class="i"><use href="#refresh"/></svg></button>
    </div>
    <nav class="side-nav">
      <template v-for="grp in sideNav" :key="grp.title">
        <small v-if="grp.title" class="side-sec">{{ grp.title }}</small>
        <button v-for="it in grp.items" :key="it.id" class="side-it" :class="{ on: navOn(it.id) }" :aria-current="navOn(it.id) ? 'page' : null" @click="navTo(it.id)">
          <svg class="i"><use :href="'#' + it.icon"/></svg><span>{{ it.name }}</span><em v-if="it.badge" class="side-badge">{{ it.badge }}</em>
        </button>
      </template>
    </nav>
    <div v-if="desktop && !inApp && canCamera && desktopApp.url" class="side-app">
      <b>Rzutnik i Stream</b><small>aplikacja na komputer</small>
      <a class="button" :href="desktopApp.url"><svg class="i"><use href="#download"/></svg>Pobierz</a>
    </div>
    <div v-if="me" class="side-me">
      <button class="side-me-btn" :class="{ on: profileView }" title="Mój profil" @click="navTo('profile')">
        <span class="kh-av">{{ initials(me) }}</span>
        <span class="side-me-text"><b>{{ me.name || me.email }}</b><small>{{ myRanks || 'Członek' }}</small></span>
        <svg v-if="needsName" class="i kh-warn" aria-label="Uzupełnij imię i nazwisko"><use href="#warn"/></svg>
      </button>
      <button class="side-ib theme-btn" :title="theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny'" :aria-label="theme === 'dark' ? 'Włącz tryb jasny' : 'Włącz tryb ciemny'" @click="toggleTheme"><svg class="i"><use :href="theme === 'dark' ? '#sun' : '#moon'"/></svg></button>
      <button class="side-ib" title="Wyloguj" aria-label="Wyloguj" @click="logout"><svg class="i"><use href="#logout"/></svg></button>
    </div>
  </aside>
  <!-- Szeroki ekran: pasek konta na górze każdego widoku (jak w aplikacji na komputer). -->
  <div v-if="ready" class="kh kh-bar">
      <div class="kh-top">
        <button class="kh-brand" title="Strona startowa" @click="showServices(); closeAll()"><img class="kh-mark" src="znak.png" alt=""><span class="kh-name">Kościół Na Skale</span></button>
        <span class="kh-spacer"></span>
        <button v-if="api.enabled" class="kh-ib" title="Powiadomienia" aria-label="Powiadomienia" :class="{ on: inboxOpen }" @click="openInbox"><svg class="i"><use href="#bell"/></svg><span v-if="unread" class="kh-count">{{ unread }}</span></button>
        <button class="kh-ib" :class="{ spin: busy }" :disabled="busy" title="Odśwież" aria-label="Odśwież" @click="reload()"><svg class="i"><use href="#refresh"/></svg></button>
        <button class="kh-ib" title="Więcej: pieśni, ogłoszenia, protokoły, osoby…" aria-label="Więcej" :class="{ on: moreView }" @click="openMore"><svg class="i"><use href="#menu"/></svg><span v-if="canManage && pendingCount" class="kh-count">{{ pendingCount }}</span></button>
        <span v-if="me" class="kh-me kh-me-btn" role="button" tabindex="0" title="Mój profil" @click="openProfile" @keydown.enter="openProfile">
          <span class="kh-av">{{ initials(me) }}</span>
          <span class="kh-me-text"><b>{{ me.name || me.email }}</b><small>{{ myRanks || 'Członek' }}</small></span>
          <svg v-if="needsName" class="i kh-warn" aria-label="Uzupełnij imię i nazwisko"><title>Uzupełnij imię i nazwisko w profilu</title><use href="#warn"/></svg>
        </span>
        <button v-if="me" class="kh-ib" title="Wyloguj" aria-label="Wyloguj" @click="logout"><svg class="i"><use href="#logout"/></svg></button>
      </div>
  </div>
  <header>
    <img src="znak.png" alt="">
    <h1>{{ current ? (svcEditing && canEdit ? 'Edycja nabożeństwa' : 'Nabożeństwo') : currentAnn ? (annEditing ? (annSavedOnce ? 'Edycja ogłoszenia' : 'Nowe ogłoszenie') : 'Ogłoszenie') : annView ? 'Ogłoszenia' : currentProto ? (protoEditing ? (protoSavedOnce ? 'Edycja materiału' : 'Nowy materiał') : MAT_TYPES[matType(currentProto)]) : currentEvent ? (eventEditing && eventEditable ? (eventSavedOnce ? 'Edycja wydarzenia' : 'Nowe wydarzenie') : 'Wydarzenie') : protoView ? 'Materiały' : tplType ? (tplType.name || 'Nowy rodzaj') : tplView ? 'Szablony' : calView ? 'Kalendarz' : song ? (song.isNew ? 'Nowa pieśń' : 'Pieśń') : songView ? 'Baza pieśni' : peopleView ? 'Osoby' : gcalView ? 'Kalendarz Google' : profileView ? 'Mój profil' : serveView ? 'Zaangażuj się' : listenView ? 'Posłuchaj' : asbView ? 'ASB' : goalsView ? 'Cele wsparcia' : votesView ? 'Głosowania' : moreView ? 'Więcej' : 'KNS Nabo' }}</h1>
    <button v-if="current" class="ghost back" @click="back"><svg class="i"><use href="#back"/></svg>{{ svcEditing && services.some(x => x.id === current.id) ? 'Podgląd' : cameFromCal() ? 'Kalendarz' : 'Lista' }}</button>
    <button v-else-if="currentAnn" class="ghost back" @click="closeAnn"><svg class="i"><use href="#back"/></svg>{{ annView ? 'Ogłoszenia' : 'Wstecz' }}</button>
    <button v-else-if="annView" class="ghost back to-start" @click="annView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
    <button v-else-if="currentProto" class="ghost back" @click="closeProto"><svg class="i"><use href="#back"/></svg>{{ currentEvent ? 'Wydarzenie' : 'Materiały' }}</button>
    <button v-else-if="currentEvent" class="ghost back" @click="closeEvent"><svg class="i"><use href="#back"/></svg>{{ eventEditing && eventSavedOnce ? 'Podgląd' : 'Kalendarz' }}</button>
    <button v-else-if="tplType" class="ghost back" @click="closeType"><svg class="i"><use href="#back"/></svg>Szablony</button>
    <button v-else-if="tplView" class="ghost back to-start" @click="tplView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
    <button v-else-if="protoView" class="ghost back to-start" @click="protoView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
    <button v-else-if="song" class="ghost back" @click="closeSong"><svg class="i"><use href="#back"/></svg>Pieśni</button>
    <button v-else-if="profileView" class="ghost back to-start" @click="profileView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
    <button v-else-if="serveView || listenView || asbView || goalsView || votesView" class="ghost wide-only back to-start" @click="showServices"><svg class="i"><use href="#back"/></svg>Start</button>
    <button v-else-if="gcalView" class="ghost back" @click="gcalView = false; calView = true"><svg class="i"><use href="#back"/></svg>Kalendarz</button>
    <button v-else-if="songView || peopleView" class="ghost back to-start" @click="songView = false; peopleView = false"><svg class="i"><use href="#back"/></svg>Więcej</button>
    <template v-else>
      <button v-if="ready && (calView || moreView)" class="ghost wide-only back to-start" @click="showServices"><svg class="i"><use href="#back"/></svg>Start</button>
      <button v-if="ready" class="ghost" :class="{ 'narrow-only': !peopleView }" :disabled="busy || peopleBusy" aria-label="Odśwież" title="Odśwież" @click="peopleView ? loadPeople() : reload()"><svg class="i"><use href="#refresh"/></svg></button>
    </template>
    <button v-if="ready && api.enabled && !current && !currentEvent && !currentAnn && !currentProto && !song && !tplType" class="ghost bell narrow-only" aria-label="Powiadomienia" title="Powiadomienia" @click="openInbox"><svg class="i"><use href="#bell"/></svg><span v-if="unread" class="count">{{ unread }}</span></button>
    <button v-if="shareTarget && shareTarget[0] !== 'nabozenstwo'" class="ghost share-btn" title="Kod QR — do pobrania i wstawienia na grafikę" aria-label="Kod QR" @click="openQr(...shareTarget)"><svg class="i"><use href="#qr"/></svg><span>QR</span></button>
    <button v-if="shareTarget" class="ghost share-btn" title="Kopiuj link — można go komuś wysłać" aria-label="Kopiuj link" @click="shareLink(...shareTarget)"><svg class="i"><use href="#link"/></svg><span>Link</span></button>
  </header>
  <div v-if="toast" class="toast" role="status">{{ toast }}</div>

  <!-- Kamera: sygnały od operatora streamu (przez internet), z dźwiękiem w słuchawce i wibracją. -->
  <div v-if="camera" class="camera" :class="cue.state" role="status" aria-live="assertive">
    <button class="ghost close" @click="closeCamera"><svg class="i"><use href="#back"/></svg>Zamknij</button>
    <div class="big">{{ cueText[cue.state] }}</div>
    <button v-if="!cue.sound" class="start" @click="enableSound">Dotknij, aby włączyć dźwięk</button>
    <p class="net" :class="{ on: cue.online }">{{ cue.net }}</p>
    <p class="hint">Na wizji — dwa krótkie wysokie · Przygotuj się — jeden średni · Poza wizją — jeden długi niski.
      Ekran zostaje włączony; nie wychodź z aplikacji.</p>
  </div>

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
  <template v-else-if="song">
    <p v-if="!canEdit" class="note readonly"><svg class="i"><use href="#eye"/></svg>Tylko podgląd — pieśni zmieniają osoby z rangą z prawem edycji.</p>
    <fieldset class="plain" :disabled="!canEdit">
    <div class="row">
      <div style="flex:0 0 96px"><label for="sNum">Numer</label><input id="sNum" v-model="song.number" inputmode="numeric" autocomplete="off"></div>
      <div><label for="sTitle">Tytuł <span class="req">*</span></label><input id="sTitle" v-model="song.title" :class="{ invalid: !song.title.trim() }" autocomplete="off"></div>
    </div>
    <p v-if="numberTaken" class="note error">Numer {{ song.number }} ma już pieśń „{{ numberTaken.title }}”.</p>
    <label for="sText">Tekst</label>
    <textarea id="sText" v-model="song.text" class="songtext" spellcheck="false" placeholder="Pierwsza zwrotka…&#10;&#10;Refren…"></textarea>
    </fieldset>
    <p class="note">Pusta linia = nowy slajd ({{ slideCount }}). Na początku slajdu można wpisać skrót, np. <b>[R]</b> — na rzutniku pokaże go klawisz.</p>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <div v-if="canEdit" class="bar">
      <template v-if="!song.isNew">
        <button v-if="confirmDelete" class="danger" :disabled="busy" @click="deleteSong">Na pewno usuń</button>
        <button v-else :disabled="busy" aria-label="Usuń pieśń" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
      </template>
      <button class="primary" :disabled="busy || !songDirty || !song.title.trim()" @click="saveSong()">
        <svg v-if="!songDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : songDirty ? 'Zapisz' : 'Zapisane' }}
      </button>
    </div>
  </template>

  <!-- ogłoszenie -->
  <template v-else-if="currentAnn">
    <!-- podgląd ogłoszenia (dla wszystkich); edycja dopiero po „Edytuj” (osoby z prawem edycji) -->
    <article v-if="!annEditing" class="ann-view">
      <p v-if="currentAnn.status === 'pending'" class="pending-note"><svg class="i"><use href="#bell"/></svg>{{ canReview ? 'Zgłoszenie czeka na Twoje zatwierdzenie' + (currentAnn.author ? ' — od: ' + currentAnn.author : '') + '.' : 'Czeka na zatwierdzenie — po zatwierdzeniu zobaczą je wszyscy.' }}</p>
      <div v-if="canReview && currentAnn.status === 'pending'" class="approve-row">
        <button :disabled="busy" @click="rejectAnn"><svg class="i"><use href="#x"/></svg>Odrzuć</button>
        <button class="primary" :disabled="busy" @click="approveAnn"><svg class="i"><use href="#check"/></svg>Zatwierdź i opublikuj</button>
      </div>
      <img v-if="currentAnn.image" class="ann-hero" :src="currentAnn.image" alt="">
      <div class="ann-tags">
        <span v-if="currentAnn.pinned" class="ann-tag pin"><svg class="i"><use href="#pin"/></svg>Przypięte</span>
        <span v-if="currentAnn.important" class="ann-tag imp"><svg class="i"><use href="#alert"/></svg>Komunikat rady zboru</span>
        <span class="ann-tag">{{ AUDIENCE[currentAnn.audience] }}</span>
        <span v-if="currentAnn.until" class="ann-tag">ważne do {{ shortDate(currentAnn.until) }}</span>
        <span v-if="currentAnn.projector && currentAnn.image" class="ann-tag"><svg class="i"><use href="#monitor"/></svg>Na rzutniku</span>
      </div>
      <h2 class="ann-view-title">{{ currentAnn.title }}</h2>
      <p class="ann-view-meta"><template v-if="currentAnn.author">{{ currentAnn.author }} · </template>{{ shortDate(currentAnn.date || currentAnn.updated) }}</p>
      <div v-if="currentAnn.text" class="ann-view-text">{{ currentAnn.text }}</div>
      <div v-if="videoInfo(currentAnn.video)" class="ann-video">
        <video v-if="videoInfo(currentAnn.video).kind === 'file'" :src="videoInfo(currentAnn.video).src" controls playsinline preload="metadata"></video>
        <iframe v-else :src="videoInfo(currentAnn.video).embed" title="Film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
      </div>
      <a v-if="currentAnn.link" class="button ann-link" :href="currentAnn.link" target="_blank" rel="noopener"><svg class="i"><use href="#link"/></svg>{{ currentAnn.linkText || 'Otwórz link' }}<svg class="i chev"><use href="#chev"/></svg></a>
      <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
      <button v-if="annEditable" class="ann-edit-btn" @click="annEditing = true"><svg class="i"><use href="#pencil"/></svg>Edytuj ogłoszenie</button>
    </article>
    <template v-else>
    <p v-if="!annSavedOnce && !canEdit && !canReview" class="pending-note"><svg class="i"><use href="#bell"/></svg>Ogłoszenie pojawi się po zatwierdzeniu przez lidera newslettera, radę zboru albo administratora.</p>
    <fieldset class="plain" :disabled="!annEditable">
      <div v-if="!currentAnn.image && drive.uploadImage" class="ann-tip">
        <svg class="i"><use href="#monitor"/></svg>
        <span><b>Ma się wyświetlać na nabożeństwie?</b><small>Na rzutniku i na transmisji pokazują się tylko grafiki — najpierw dodaj grafikę z ogłoszeniem (co, kiedy, gdzie), potem tytuł i treść.</small></span>
        <button type="button" class="small" :disabled="imgBusy" @click="$refs.annImg.click()"><svg class="i"><use href="#image"/></svg>{{ imgBusy ? 'Wysyłam…' : 'Dodaj grafikę' }}</button>
      </div>
      <label for="anTitle">Tytuł <span class="req">*</span></label>
      <input id="anTitle" v-model="currentAnn.title" :class="{ invalid: !currentAnn.title.trim() }" autocomplete="off">
      <label for="anText">Treść</label>
      <textarea id="anText" v-model="currentAnn.text" class="ann-text"></textarea>
      <template v-if="drive.uploadImage || currentAnn.image">
        <label>Grafika (opcjonalnie)</label>
        <img v-if="currentAnn.image" class="ann-img edit" :src="currentAnn.image" alt="">
        <div v-if="drive.uploadImage && annEditable" class="row">
          <button type="button" :disabled="imgBusy" @click="$refs.annImg.click()"><svg class="i"><use href="#plus"/></svg>{{ imgBusy ? 'Wysyłam…' : currentAnn.image ? 'Zmień grafikę' : 'Dodaj grafikę' }}</button>
          <button v-if="currentAnn.image" type="button" :disabled="imgBusy" @click="currentAnn.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
        </div>
        <input ref="annImg" type="file" accept="image/*" hidden @change="pickAnnImage">
        <label v-if="currentAnn.image" class="check"><input v-model="currentAnn.projector" type="checkbox">Pokaż na nabożeństwie — ta grafika w pętli ogłoszeń na rzutniku (przed i po)</label>
        <p v-if="currentAnn.image" class="note">Na rzutniku pokazują się tylko grafiki — umieść na niej wszystkie ważne informacje (co, kiedy, gdzie).</p>
      </template>
      <label for="anVideo">Film (opcjonalnie)</label>
      <div v-if="videoInfo(currentAnn.video)" class="ann-video">
          <video v-if="videoInfo(currentAnn.video).kind === 'file'" :src="videoInfo(currentAnn.video).src" controls playsinline preload="metadata"></video>
          <iframe v-else :src="videoInfo(currentAnn.video).embed" title="Film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
        </div>
      <template v-if="annEditable">
        <input v-if="!/\/ogloszenia\//.test(currentAnn.video || '')" id="anVideo" v-model.trim="currentAnn.video" placeholder="Link do YouTube lub Vimeo" autocomplete="off" inputmode="url">
        <p v-if="currentAnn.video && !videoInfo(currentAnn.video)" class="error" style="margin:6px 0 0">To nie wygląda na link do filmu (YouTube, Vimeo).</p>
        <div class="row" style="margin-top:8px">
          <button v-if="drive.uploadFile" type="button" :disabled="vidBusy" @click="$refs.annVid.click()"><svg class="i"><use href="#plus"/></svg>{{ vidBusy ? 'Wysyłam film…' : 'Wgraj film (do 50 MB)' }}</button>
          <button v-if="currentAnn.video" type="button" :disabled="vidBusy" @click="currentAnn.video = ''"><svg class="i"><use href="#trash"/></svg>Usuń film</button>
        </div>
        <input ref="annVid" type="file" accept="video/mp4,video/webm,video/quicktime" hidden @change="pickAnnVideo">
      </template>
      <label for="anLink">Link (opcjonalnie)</label>
      <input id="anLink" v-model.trim="currentAnn.link" placeholder="np. formularz zapisów, strona wydarzenia" autocomplete="off" inputmode="url">
      <input v-if="currentAnn.link" v-model="currentAnn.linkText" placeholder="Tekst przycisku, np. „Zapisz się”" autocomplete="off" style="margin-top:8px">
      <label for="anAud">Kto widzi</label>
      <select id="anAud" v-model="currentAnn.audience" class="field">
        <option value="public">Wszyscy — także goście bez konta</option>
        <option value="members">Członkowie (zatwierdzeni)</option>
        <option v-if="hasCouncil || currentAnn.audience === 'council'" value="council">Tylko rada zboru</option>
      </select>
      <label v-if="hasCouncil && currentAnn.audience !== 'council'" class="check"><input v-model="currentAnn.important" type="checkbox">Komunikat rady zboru — na górze strony głównej</label>
      <label v-if="canEdit || canReview" class="check"><input v-model="currentAnn.pinned" type="checkbox">Przypnij — zawsze nad innymi ogłoszeniami</label>
      <label for="anUntil">Ważne do (opcjonalnie)</label>
      <input id="anUntil" v-model="currentAnn.until" type="date">
      <p class="note" style="margin-top:4px">Po tej dacie ogłoszenie znika ze strony głównej (zostaje w archiwum).</p>
    </fieldset>
    <p v-if="currentAnn.author" class="note who">Autor: {{ currentAnn.author }}<template v-if="currentAnn.updated > 1">, {{ dateTime(currentAnn.updated) }}</template></p>
    <div v-if="canNotify && annEditable" class="notify-box">
      <label>Powiadom osoby (opcjonalnie)</label>
      <button type="button" class="songsbtn" :disabled="busy" @click="openNotify"><svg class="i"><use href="#bell"/></svg>{{ notify.ids.length ? 'Powiadomię: ' + notifySummary : 'Wybierz, kogo powiadomić' }}<svg class="i chev"><use href="#chev"/></svg></button>
      <p class="note" style="margin:6px 0 0">Po zapisaniu powiadomienie pojawi się w aplikacji (dzwonek), a dodatkowo na telefonach osób, które je włączyły.</p>
    </div>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <div v-if="annEditable" class="bar">
      <template v-if="annSavedOnce">
        <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeAnn">Na pewno usuń</button>
        <button v-else :disabled="busy" aria-label="Usuń ogłoszenie" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
      </template>
      <button class="primary" :disabled="busy || (!annDirty && !notify.ids.length) || !currentAnn.title.trim()" @click="saveAnn()">
        <svg v-if="!annDirty && !notify.ids.length && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : annDirty ? 'Zapisz' : notify.ids.length ? 'Wyślij powiadomienie' : 'Zapisane' }}
      </button>
    </div>
    </template>
  </template>

  <!-- wszystkie ogłoszenia -->
  <template v-else-if="annView">
    <div v-if="canAnnounce" class="ann-new-row">
      <button class="primary" @click="newAnn"><svg class="i"><use href="#plus"/></svg>Nowe ogłoszenie</button>
      <button v-if="canEdit && drive.uploadImage" :disabled="bulk.busy" title="Wybierz grafikę — otworzy się nowe ogłoszenie z nią (do uzupełnienia i zapisania)" @click="$refs.annBulk.click()"><svg class="i"><use href="#image"/></svg>{{ bulk.busy ? 'Wgrywam grafikę…' : 'Z grafiki' }}</button>
      <input ref="annBulk" type="file" accept="image/*" hidden @change="annFromImages">
    </div>
    <div v-if="announcements.length" class="ann-search">
      <svg class="i"><use href="#search"/></svg>
      <input v-model="annQuery" type="search" placeholder="Szukaj w ogłoszeniach…" aria-label="Szukaj w ogłoszeniach" autocomplete="off"
             @focus="annHintsOpen = true" @input="annHintsOpen = true" @blur="annHintsOpen = false" @keydown.esc="annHintsOpen = false">
      <ul v-if="annHintsOpen && annHints.length" class="ann-hints" role="listbox">
        <li v-for="a in annHints" :key="a.id"><button type="button" @mousedown.prevent="pickHint(a)">
          <span><template v-for="(p, i) in hintParts(a.title)" :key="i"><mark v-if="p.hit">{{ p.s }}</mark><template v-else>{{ p.s }}</template></template></span>
          <small>{{ isActive(a) ? shortDate(a.date) : 'archiwum' }}</small>
        </button></li>
      </ul>
    </div>
    <p v-if="!activeAnns.length" class="note">Nie ma aktualnych ogłoszeń.</p>
    <p v-else-if="annQuery.trim() && !shownActiveAnns.length && !shownOldAnns.length" class="note">Nic nie znaleziono dla „{{ annQuery.trim() }}”.</p>
    <button v-for="a in shownActiveAnns" :key="a.id" class="ann" :class="{ important: a.important, fresh: annIsNew(a) }" @click="openAnn(a)">
      <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
      <span class="ann-tags"><span v-if="annIsNew(a)" class="ann-tag kh-new">Nowe</span><span v-if="a.pinned" class="ann-tag pin"><svg class="i"><use href="#pin"/></svg>Przypięte</span><span v-if="a.video" class="ann-tag vid">▶ Film</span><span v-if="a.important" class="ann-tag imp"><svg class="i"><use href="#alert"/></svg>Komunikat rady</span><span class="ann-tag">{{ AUDIENCE[a.audience] }}</span><span v-if="a.until" class="ann-tag">do {{ shortDate(a.until) }}</span></span>
      <b>{{ a.title }}</b>
      <span class="ann-body">{{ a.text }}</span>
    </button>
    <template v-if="shownOldAnns.length">
      <div class="section"><h2>Archiwum · {{ shownOldAnns.length }}</h2></div>
      <button v-for="a in shownOldAnns" :key="a.id" class="ann old" @click="openAnn(a)">
        <span class="ann-tags"><span class="ann-tag">{{ AUDIENCE[a.audience] }}</span><span class="ann-tag">do {{ shortDate(a.until) }}</span></span>
        <b>{{ a.title }}</b>
      </button>
    </template>
  </template>

  <!-- materiał (protokół, instrukcja, plik pomocniczy): podgląd (otwarcie pliku) albo edycja -->
  <template v-else-if="currentProto">
    <article v-if="!protoEditing" class="ann-view">
      <div class="ann-tags">
        <span class="ann-tag mat-tag" :class="'t-' + matType(currentProto)">{{ MAT_TYPES[matType(currentProto)] }}</span>
        <span class="ann-tag" :class="{ imp: currentProto.kind === 'rada' }">{{ VISIBILITY[currentProto.kind] }}</span>
        <span v-if="currentProto.eventId && eventTitle(currentProto.eventId)" class="ann-tag">{{ eventTitle(currentProto.eventId) }}</span>
      </div>
      <h2 class="ann-view-title">{{ currentProto.title }}</h2>
      <p class="ann-view-meta">{{ pretty(currentProto.date) }}<template v-if="currentProto.updatedBy"> · dodał(a) {{ currentProto.updatedBy }}</template></p>
      <div v-if="currentProto.note" class="ann-view-text">{{ currentProto.note }}</div>
      <a v-if="protoUrl" class="button ann-link" :href="protoUrl" target="_blank" rel="noopener"><svg class="i"><use href="#file"/></svg>Otwórz plik<small class="proto-fname">{{ currentProto.fileName }}</small><svg class="i chev"><use href="#chev"/></svg></a>
      <p v-else-if="currentProto.file" class="note">Przygotowuję plik…</p>
      <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
      <button v-if="protoEditable" class="ann-edit-btn" @click="protoEditing = true"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
    </article>
    <template v-else>
      <label for="prType">Rodzaj</label>
      <select id="prType" v-model="currentProto.type" class="field" @change="protoTypeChanged">
        <option v-if="canWriteProto('czlonkowskie') || hasCouncil" value="protokol">Protokół spotkania</option>
        <option value="instrukcja">Instrukcja (np. obsługa rzutnika)</option>
        <option value="plik">Plik pomocniczy</option>
      </select>
      <label>Plik <span class="req">*</span></label>
      <div class="proto-file">
        <svg class="i"><use href="#list"/></svg>
        <span>{{ protoFile ? protoFile.name : currentProto.fileName || 'Nie wybrano pliku (PDF, Word, PowerPoint, Excel, zdjęcie)' }}</span>
        <button type="button" :disabled="busy" @click="$refs.protoFileIn.click()">{{ currentProto.file || protoFile ? 'Zmień' : 'Wybierz plik' }}</button>
      </div>
      <input ref="protoFileIn" type="file" accept=".pdf,.doc,.docx,.odt,.txt,.ppt,.pptx,.odp,.xls,.xlsx,.ods,image/*" hidden @change="pickProtoFile">
      <label for="prTitle">Tytuł <span class="req">*</span></label>
      <input id="prTitle" v-model="currentProto.title" :class="{ invalid: !currentProto.title.trim() }" autocomplete="off">
      <label for="prDate">{{ currentProto.type === 'protokol' ? 'Data spotkania' : 'Data' }}</label>
      <input id="prDate" v-model="currentProto.date" type="date">
      <label for="prKind">Kto widzi</label>
      <select id="prKind" :value="currentProto.kind === 'rada' ? 'rada' : 'all'" class="field" @change="protoAudience($event.target.value)">
        <option value="all">Wszyscy członkowie</option>
        <option v-if="hasCouncil" value="rada">Tylko rada zboru</option>
      </select>
      <label v-if="currentProto.type === 'protokol'" for="prEvent">Spotkanie (opcjonalnie)</label>
      <select v-if="currentProto.type === 'protokol'" id="prEvent" v-model="currentProto.eventId" class="field">
        <option value="">— bez spotkania (tylko biblioteka) —</option>
        <option v-for="e in meetingEvents.filter(e => currentProto.kind === 'rada' || e.type !== 'rada')" :key="e.id" :value="e.id">{{ (e.title || typeOf(e.type).name) + ' · ' + shortDate(e.date) }}</option>
      </select>
      <label for="prNote">Notatka (opcjonalnie)</label>
      <textarea id="prNote" v-model="currentProto.note" :placeholder="currentProto.type === 'protokol' ? 'np. najważniejsze ustalenia' : 'np. do czego służy, dla kogo'"></textarea>
      <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
      <div class="bar">
        <template v-if="protoSavedOnce">
          <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeProto">Na pewno usuń</button>
          <button v-else :disabled="busy" aria-label="Usuń materiał" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
        </template>
        <button class="primary" :disabled="busy || !protoDirty || !currentProto.title.trim() || (!currentProto.file && !protoFile)" @click="saveProto()">
          <svg v-if="!protoDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : protoDirty ? 'Zapisz' : 'Zapisane' }}
        </button>
      </div>
    </template>
  </template>

  <!-- materiały: protokoły, instrukcje i pliki pomocnicze -->
  <template v-else-if="protoView">
    <div class="notify-groups">
      <button class="chipbtn" :class="{ on: protoKind === 'all' }" @click="protoKind = 'all'">Wszystkie</button>
      <button v-for="(name, id) in MAT_PLURAL" :key="id" class="chipbtn" :class="{ on: protoKind === id }" @click="protoKind = id">{{ name }}</button>
      <button v-if="hasCouncil" class="chipbtn" :class="{ on: protoKind === 'rada' }" @click="protoKind = 'rada'">Rada zboru</button>
    </div>
    <button v-if="canAddProto" class="primary" style="width:100%;margin-bottom:12px" @click="newProto()"><svg class="i"><use href="#plus"/></svg>Dodaj materiał</button>
    <div v-if="protoBusy && !protocols.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 4" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="protoError" class="error">{{ protoError }}</p>
    <p v-else-if="!protocols.length" class="note">{{ protoKind === 'all' ? 'W materiałach nie ma jeszcze nic.' : 'Nic tu jeszcze nie ma.' }}</p>
    <button v-for="p in protocols" :key="p.id" class="ev" :style="{ '--c': MAT_COLOR[matType(p)] }" @click="openProto(p)">
      <span class="when"><small>{{ wd(p.date) }}</small><b>{{ day(p.date) }}</b><small>{{ month(p.date) }}</small></span>
      <span class="body"><b>{{ p.title }}</b><small>{{ MAT_TYPES[matType(p)] }} · {{ VISIBILITY[p.kind] }}<template v-if="p.eventId && eventTitle(p.eventId)"> · {{ eventTitle(p.eventId) }}</template></small></span>
      <svg class="i chev"><use href="#chev"/></svg>
    </button>
  </template>

  <template v-else-if="currentEvent">
    <p v-if="currentEvent.status === 'pending'" class="pending-note"><svg class="i"><use href="#bell"/></svg>{{ canReview ? 'Zgłoszenie czeka na Twoje zatwierdzenie' + (currentEvent.createdBy ? ' — od: ' + currentEvent.createdBy : '') + '.' : 'Czeka na zatwierdzenie — po zatwierdzeniu zobaczą je wszyscy.' }}</p>
    <p v-else-if="!eventSavedOnce && !canEdit && !canReview" class="pending-note"><svg class="i"><use href="#bell"/></svg>Wydarzenie pojawi się w kalendarzu po zatwierdzeniu przez lidera newslettera, radę zboru albo administratora.</p>
    <!-- podgląd wydarzenia (zawsze najpierw; edycja po „Edytuj”) -->
    <article v-if="!eventEditable || !eventEditing" class="ann-view ev-view">
      <img v-if="currentEvent.image" class="ann-hero" :src="currentEvent.image" alt="">
      <div class="ann-tags"><span class="ann-tag" :style="{ background: 'color-mix(in srgb, ' + typeOf(currentEvent.type).color + ' 22%, transparent)', color: typeOf(currentEvent.type).color }">{{ typeOf(currentEvent.type).name }}</span></div>
      <h2 class="ann-view-title">{{ currentEvent.title || typeOf(currentEvent.type).name }}</h2>
      <p v-if="typeOf(currentEvent.type).community" class="ev-community"><svg class="i"><use href="#users"/></svg>Inicjatywa członków kościoła{{ currentEvent.createdBy ? ' — organizuje: ' + currentEvent.createdBy : '' }}</p>
      <div class="facts">
        <span class="fact"><svg class="i"><use href="#calendar"/></svg><span><small>Kiedy</small><b>{{ pretty(currentEvent.date).replace(/^./, c => c.toUpperCase()) }}<template v-if="currentEvent.time">, {{ currentEvent.time }}</template></b></span></span>
        <a v-if="currentEvent.place" class="fact" :href="mapLink(currentEvent.place)" target="_blank" rel="noopener"><svg class="i"><use href="#pin"/></svg><span><small>Gdzie · mapa</small><b>{{ currentEvent.place }}</b></span></a>
      </div>
      <div v-if="currentEvent.description" class="ann-view-text">{{ currentEvent.description }}</div>
      <template v-if="(currentEvent.people || []).length">
        <h3 class="view-h">Biorą udział</h3>
        <div class="ev-people"><span v-for="p in currentEvent.people" :key="p.id" class="ev-person"><svg class="i"><use href="#user"/></svg>{{ p.name }}</span></div>
      </template>
      <template v-if="(currentEvent.program || []).length">
        <h3 class="view-h">Program</h3>
        <program-editor :items="currentEvent.program" :start="currentEvent.time || '00:00'" readonly></program-editor>
      </template>
      <template v-if="api.enabled && (eventVotes.length || (votes.canRun && ['czlonkowskie', 'rada'].includes(currentEvent.type)))">
        <h3 class="view-h">Głosowania</h3>
        <div class="ev-votes">
          <div v-for="e in eventVotes" :key="e.id" class="ev-vote" :class="e.status">
            <span class="vote-status" :class="e.status">{{ VOTE_STATUS[e.status === 'nominations' && e.kind === 'options' ? 'ready' : e.status] }}</span>
            <b>{{ e.title }}</b>
            <template v-if="votes.canRun">
              <button v-if="e.status === 'nominations' || e.status === 'paused'" class="small primary" :disabled="busy || !e.candidates.some(c => c.accepted)" :title="e.candidates.some(c => c.accepted) ? '' : 'Najpierw zatwierdź kandydatów'" @click="setElectionStatus(e, 'voting')">{{ e.status === 'paused' ? 'Wznów' : 'Aktywuj' }}</button>
              <button v-if="e.status === 'voting'" class="small" :disabled="busy" @click="setElectionStatus(e, 'paused')">Wstrzymaj</button>
              <button v-if="e.status === 'voting' || e.status === 'paused'" class="small danger" :disabled="busy" @click="setElectionStatus(e, 'closed')">Zakończ</button>
            </template>
            <button class="small" @click="goToVote(e)">{{ e.status === 'voting' && !e.voted ? 'Głosuj' : e.status === 'closed' ? 'Wyniki' : 'Otwórz' }}<svg class="i"><use href="#chev"/></svg></button>
          </div>
          <button v-if="votes.canRun" class="small ev-vote-add" @click="newVoteFor(currentEvent.id)"><svg class="i"><use href="#plus"/></svg>Nowe głosowanie na tym spotkaniu</button>
        </div>
      </template>
      <template v-if="['czlonkowskie', 'rada'].includes(currentEvent.type) && eventProtocols.length">
        <h3 class="view-h">Protokoły</h3>
        <button v-for="p in eventProtocols" :key="p.id" class="songsbtn" @click="openProto(p)"><svg class="i"><use href="#list"/></svg>{{ p.title }}<svg class="i chev"><use href="#chev"/></svg></button>
      </template>
      <section v-if="signup.board" class="signup-card">
        <div class="su-head">
          <b>Zapisy</b>
          <span class="su-count">{{ signup.board.taken }}<template v-if="signup.board.max"> / {{ signup.board.max }}</template> {{ signup.board.max ? 'miejsc zajętych' : 'zapisanych' }}</span>
        </div>
        <div v-if="signup.board.max" class="su-bar"><span :style="{ width: Math.min(100, signup.board.taken / signup.board.max * 100) + '%' }"></span></div>
        <p class="note su-info"><template v-if="signup.board.reserve">Lista rezerwowa: {{ signup.board.reserve }} · </template><template v-if="signup.board.manage && signup.board.pending">Do zatwierdzenia: {{ signup.board.pending }} · </template>{{ signup.board.open ? 'zapisy do ' + pretty(signup.board.until) : 'zapisy zamknięte' }}</p>
        <div v-if="signup.board.mine" class="su-mine" :class="signup.board.mine.status">
          <svg class="i"><use :href="signup.board.mine.status === 'confirmed' ? '#check' : '#bell'"/></svg>
          <span>{{ SIGNUP_STATUS[signup.board.mine.status] }} · {{ seatsText(signup.board.mine) }}</span>
        </div>
        <template v-if="signup.board.open">
          <div class="su-form">
            <div><label>Dorośli</label><div class="stepper"><button type="button" aria-label="Mniej dorosłych" @click="signup.adults = Math.max(0, signup.adults - 1)">−</button><b>{{ signup.adults }}</b><button type="button" aria-label="Więcej dorosłych" @click="signup.adults++">+</button></div></div>
            <div v-if="signup.board.kids"><label>Dzieci</label><div class="stepper"><button type="button" aria-label="Mniej dzieci" @click="signup.children = Math.max(0, signup.children - 1)">−</button><b>{{ signup.children }}</b><button type="button" aria-label="Więcej dzieci" @click="signup.children++">+</button></div></div>
          </div>
          <input v-model="signup.note" placeholder="Uwagi (np. wiek dzieci, dieta) — opcjonalnie" autocomplete="off">
          <div class="su-actions">
            <button class="primary" :disabled="busy || signup.adults + signup.children < 1" @click="signupJoin">{{ signup.board.mine ? 'Zmień zapis' : signup.board.max && signup.board.taken + signup.adults + signup.children > signup.board.max && !signup.board.approval ? 'Zapisz na listę rezerwową' : 'Zapisz się' }}</button>
            <button v-if="signup.board.mine" :disabled="busy" @click="signupLeave">Wypisz się</button>
          </div>
        </template>
        <!-- twórca wydarzenia / prawo edycji: lista zapisanych -->
        <div v-if="signup.board.manage && signup.board.list.length" class="su-list">
          <template v-for="g in signupGroups" :key="g.id">
            <small>{{ g.title }} ({{ g.list.reduce((n, p) => n + p.adults + p.children, 0) }})</small>
            <div v-for="p in g.list" :key="p.id" class="mn-person">
              <span><b>{{ p.name }}</b><small>{{ seatsText(p) }}<template v-if="p.grupa"> · {{ p.grupa }}</template><template v-if="p.note"> · {{ p.note }}</template></small></span>
              <button v-if="p.status !== 'confirmed'" class="primary" :disabled="busy" @click="signupDecide(p, 'confirm')">Potwierdź</button>
              <button v-if="p.status === 'pending'" :disabled="busy" @click="signupDecide(p, 'reserve')">Rezerwa</button>
              <button class="icon" :disabled="busy" :aria-label="'Usuń ' + p.name + ' z zapisów'" title="Usuń z zapisów" @click="signupDecide(p, 'remove')"><svg class="i"><use href="#x"/></svg></button>
            </div>
          </template>
        </div>
      </section>
      <div v-if="canReview && currentEvent.status === 'pending'" class="approve-row">
        <button :disabled="busy" @click="rejectEvent"><svg class="i"><use href="#x"/></svg>Odrzuć</button>
        <button class="primary" :disabled="busy" @click="approveEvent"><svg class="i"><use href="#check"/></svg>Zatwierdź i opublikuj</button>
      </div>
      <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
      <button v-if="eventEditable" class="ann-edit-btn" @click="eventEditing = true"><svg class="i"><use href="#pencil"/></svg>Edytuj wydarzenie</button>
      <template v-if="currentEvent.asb">
        <p class="note">Spotkanie z grafiku ASB — zmienia się je w zakładce ASB, kalendarz aktualizuje się sam.</p>
        <button v-if="canAsb" class="ann-edit-btn" @click="openAsbMeeting(currentEvent.asb)"><svg class="i"><use href="#users"/></svg>Otwórz w ASB</button>
      </template>
    </article>
    <template v-else>
    <fieldset class="plain" :disabled="!eventEditable">
      <label for="evType">Rodzaj</label>
      <select id="evType" v-model="currentEvent.type" class="field" @change="typeChanged">
        <option v-for="t in eventTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <label for="evTitle">Nazwa <span class="req">*</span></label>
      <input id="evTitle" v-model="currentEvent.title" :class="{ invalid: !currentEvent.title.trim() }" autocomplete="off">
      <div class="row">
        <div><label for="evDate">Data <span class="req">*</span></label><input id="evDate" v-model="currentEvent.date" type="date" :class="{ invalid: !currentEvent.date }"></div>
        <div><label for="evTime">Godzina</label><input id="evTime" v-model="currentEvent.time" type="time"></div>
      </div>
      <label for="evPlace">Miejsce</label>
      <input id="evPlace" v-model="currentEvent.place" autocomplete="off">
      <label for="evDesc">Opis</label>
      <textarea id="evDesc" v-model="currentEvent.description" placeholder="Co, dla kogo, co przygotować…"></textarea>
      <template v-if="canNotify">
        <label>Osoby biorące udział (opcjonalnie)</label>
        <div v-if="(currentEvent.people || []).length" class="ev-people edit">
          <span v-for="p in currentEvent.people" :key="p.id" class="ev-person">{{ p.name }}<button type="button" :aria-label="'Usuń ' + p.name" @click="currentEvent.people = currentEvent.people.filter(x => x.id !== p.id)"><svg class="i"><use href="#x"/></svg></button></span>
        </div>
        <button type="button" class="songsbtn" :disabled="busy" @click="openNotify('people')"><svg class="i"><use href="#users"/></svg>{{ (currentEvent.people || []).length ? 'Zmień osoby (' + currentEvent.people.length + ')' : 'Dodaj osoby' }}<svg class="i chev"><use href="#chev"/></svg></button>
        <p class="note" style="margin:6px 0 0">Nowo dodane osoby po zapisaniu dostaną powiadomienie (dzwonek i telefon), a w wydarzeniu widać, kto bierze udział.</p>
      </template>
      <template v-if="drive.uploadImage || currentEvent.image">
        <label>Grafika (opcjonalnie)</label>
        <img v-if="currentEvent.image" class="ann-img edit" :src="currentEvent.image" alt="">
        <div v-if="drive.uploadImage" class="row">
          <button type="button" :disabled="imgBusy" @click="$refs.evImg.click()"><svg class="i"><use href="#plus"/></svg>{{ imgBusy ? 'Wysyłam…' : currentEvent.image ? 'Zmień grafikę' : 'Dodaj grafikę' }}</button>
          <button v-if="currentEvent.image" type="button" :disabled="imgBusy" @click="currentEvent.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
        </div>
        <input ref="evImg" type="file" accept="image/*" hidden @change="pickEventImage">
        <label v-if="currentEvent.image" class="check"><input v-model="currentEvent.projector" type="checkbox">Pokaż na nabożeństwie — ta grafika w pętli ogłoszeń na rzutniku (przed i po)</label>
      </template>
      <label v-if="api.enabled" class="check"><input type="checkbox" :checked="eventIsPublic(currentEvent)" @change="currentEvent.public = $event.target.checked">Widoczne dla gości (bez konta)</label>
      <!-- Zapisy: limit miejsc (dorośli + dzieci), dzieci, zatwierdzanie przez twórcę, termin; brak miejsc → lista rezerwowa -->
      <template v-if="api.enabled">
        <label class="check"><input type="checkbox" :checked="!!currentEvent.signup?.enabled" @change="toggleSignup($event.target.checked)">Zapisy na to wydarzenie</label>
        <div v-if="currentEvent.signup?.enabled" class="signup-set">
          <div class="row">
            <div><label for="suMax">Limit miejsc</label><input id="suMax" v-model.number="currentEvent.signup.max" type="number" min="1" inputmode="numeric" placeholder="bez limitu"></div>
            <div><label for="suUntil">Zapisy do</label><input id="suUntil" v-model="currentEvent.signup.until" type="date" :max="currentEvent.date"></div>
          </div>
          <label class="check"><input v-model="currentEvent.signup.kids" type="checkbox">Można zapisać dzieci (liczą się do limitu)</label>
          <label class="check"><input v-model="currentEvent.signup.approval" type="checkbox">Zapisy zatwierdza twórca wydarzenia</label>
          <p class="note" style="margin:4px 0 0">{{ currentEvent.signup.approval ? 'Każdy zapis czeka na Twoje potwierdzenie (dostaniesz powiadomienie). Gdy brak miejsc — potwierdzony trafia na listę rezerwową.' : 'Zapis od razu na listę; gdy brak miejsc — na listę rezerwową, a po zwolnieniu miejsca wchodzi sam.' }}<template v-if="!currentEvent.signup.until"> Bez daty — zapisy do dnia wydarzenia.</template></p>
        </div>
      </template>
    </fieldset>
    <label>Program</label>
    <program-editor :items="currentEvent.program" :start="currentEvent.time || '00:00'" :readonly="!eventEditable" :template="typeOf(currentEvent.type).program" @fill="fillProgram(currentEvent, currentEvent.type)"></program-editor>
    <template v-if="['czlonkowskie', 'rada'].includes(currentEvent.type) && eventSavedOnce">
      <label>Protokoły</label>
      <button v-for="p in eventProtocols" :key="p.id" class="songsbtn" @click="openProto(p)"><svg class="i"><use href="#list"/></svg>{{ p.title }}<svg class="i chev"><use href="#chev"/></svg></button>
      <p v-if="!eventProtocols.length" class="note" style="margin:0 0 8px">Do tego spotkania nie dołączono jeszcze protokołu.</p>
      <button v-if="canWriteProto(currentEvent.type === 'rada' ? 'rada' : 'czlonkowskie')" class="songsbtn" @click="protoForEvent(currentEvent)"><svg class="i"><use href="#plus"/></svg>Dołącz protokół<svg class="i chev"><use href="#chev"/></svg></button>
    </template>
    <p v-if="currentEvent.createdBy || currentEvent.updatedBy" class="note who">
      <template v-if="currentEvent.createdBy">Utworzył(a): {{ currentEvent.createdBy }}</template>
      <template v-if="currentEvent.updatedBy"><br>Ostatnia zmiana: {{ currentEvent.updatedBy }}<template v-if="currentEvent.updated">, {{ new Date(currentEvent.updated).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</template></template>
    </p>
    <div v-if="canNotify" class="notify-box">
      <label>Powiadom osoby (opcjonalnie)</label>
      <button type="button" class="songsbtn" :disabled="busy" @click="openNotify"><svg class="i"><use href="#bell"/></svg>{{ notify.ids.length ? 'Powiadomię: ' + notifySummary : 'Wybierz, kogo powiadomić' }}<svg class="i chev"><use href="#chev"/></svg></button>
      <p class="note" style="margin:6px 0 0">Po zapisaniu powiadomienie pojawi się w aplikacji (dzwonek), a dodatkowo na telefonach osób, które je włączyły.</p>
    </div>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <div v-if="canReview && currentEvent.status === 'pending'" class="approve-row">
      <button :disabled="busy" @click="rejectEvent"><svg class="i"><use href="#x"/></svg>Odrzuć</button>
      <button class="primary" :disabled="busy" @click="approveEvent"><svg class="i"><use href="#check"/></svg>Zatwierdź i opublikuj</button>
    </div>
    <div v-if="eventEditable" class="bar">
      <template v-if="eventSavedOnce">
        <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeEvent">Na pewno usuń</button>
        <button v-else :disabled="busy" aria-label="Usuń wydarzenie" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
      </template>
      <button class="primary" :disabled="busy || (!eventDirty && !notify.ids.length) || !currentEvent.title.trim() || !currentEvent.date" @click="saveEvent()">
        <svg v-if="!eventDirty && !notify.ids.length && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : eventDirty ? 'Zapisz' : notify.ids.length ? 'Wyślij powiadomienie' : 'Zapisane' }}
      </button>
    </div>
    </template>
  </template>

  <!-- szablon jednego rodzaju wydarzeń -->
  <template v-else-if="tplType">
    <label for="tName">Nazwa <span class="req">*</span></label>
    <input id="tName" v-model="tplType.name" :class="{ invalid: !tplType.name.trim() }" :disabled="tplType.id === 'nabozenstwo'" autocomplete="off">
    <label>Kolor w kalendarzu</label>
    <div class="swatches" role="group" aria-label="Kolor">
      <button v-for="c in COLORS" :key="c" type="button" :class="{ on: tplType.color === c }" :style="{ '--c': c }" :aria-label="'Kolor ' + c" :aria-pressed="tplType.color === c" @click="tplType.color = c"></button>
    </div>
    <div class="row">
      <div><label for="tTime">Domyślna godzina</label><input id="tTime" v-model="tplType.time" type="time"></div>
      <div><label for="tPlace">Domyślne miejsce</label><input id="tPlace" v-model="tplType.place" autocomplete="off"></div>
    </div>
    <label>Program</label>
    <p class="note" style="margin-top:0">Godziny punktów są liczone od godziny rozpoczęcia — gdy wydarzenie zacznie się o innej porze, cały program przesunie się razem z nią.</p>
    <program-editor :items="tplType.program" :start="tplType.time || '00:00'"></program-editor>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <div class="bar">
      <template v-if="tplType.id !== 'nabozenstwo' && types.some(t => t.id === tplType.id)">
        <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeType">Na pewno usuń</button>
        <button v-else :disabled="busy" aria-label="Usuń ten rodzaj" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
      </template>
      <button class="primary" :disabled="busy || !tplDirty || !tplType.name.trim()" @click="saveTemplate">
        <svg v-if="!tplDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : tplDirty ? 'Zapisz' : 'Zapisane' }}
      </button>
    </div>
  </template>

  <!-- lista szablonów -->
  <template v-else-if="tplView">
    <p class="note" style="margin-top:0">Szablon podpowiada godzinę, miejsce i program nowego wydarzenia danego rodzaju. Zmiany widzą wszyscy.</p>
    <button v-for="t in types" :key="t.id" class="ev" :style="{ '--c': t.color }" @click="openType(t)">
      <span class="body"><b>{{ t.name }}</b><small>{{ t.time || 'bez godziny' }}<template v-if="t.place"> · {{ t.place }}</template> · punktów programu: {{ t.program.length }}</small></span>
      <svg class="i chev"><use href="#chev"/></svg>
    </button>
    <button class="primary" style="width:100%;margin-top:6px" @click="newType"><svg class="i"><use href="#plus"/></svg>Nowy rodzaj wydarzenia</button>
  </template>

  <!-- kalendarz życia kościoła -->
  <template v-else-if="calView">
    <div class="cal-head">
      <button class="icon" aria-label="Poprzedni miesiąc" @click="shiftMonth(-1)"><svg class="i"><use href="#back"/></svg></button>
      <b>{{ monthLabel }}</b>
      <button class="icon" aria-label="Następny miesiąc" @click="shiftMonth(1)"><svg class="i"><use href="#chev"/></svg></button>
    </div>
    <div class="cal-grid">
      <span v-for="d in WEEK" :key="d" class="wd">{{ d }}</span>
      <button v-for="c in calDays" :key="c.date" class="cal-day" :class="{ out: !c.inMonth, today: c.date === todayStr, sel: c.date === selDay }"
              :aria-label="pretty(c.date) + (c.items.length ? ', wydarzeń: ' + c.items.length : '')" :aria-pressed="c.date === selDay" @click="selDay = selDay === c.date ? '' : c.date">
        {{ c.day }}
        <span class="cal-dots"><i v-for="(it, k) in c.items.slice(0, 4)" :key="k" :style="{ background: typeOf(it.type).color }"></i></span>
      </button>
    </div>
    <div class="filters" role="group" aria-label="Pokazywane rodzaje wydarzeń">
      <button v-for="t in types" :key="t.id" class="filter" :class="{ on: !hidden.includes(t.id) }" :aria-pressed="!hidden.includes(t.id)" @click="toggleType(t.id)"><i :style="{ background: t.color }"></i>{{ t.name }}</button>
    </div>
    <div v-if="canSubmit" class="invite invite-cal"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
    <div class="cal-actions">
      <!-- nowe wydarzenie: przycisk w karcie zaproszenia powyżej -->
      <button v-if="drive.backend === 'supabase' || drive.demo" @click="openGcal"><svg class="i"><use href="#calendar"/></svg>Dodaj do swojego kalendarza</button>
      <button v-if="canEdit" @click="openTemplates">Szablony</button>
    </div>
    <div class="section"><h2>{{ selDay ? pretty(selDay) : 'Najbliższe' }}</h2><button v-if="selDay" class="ghost" @click="selDay = ''">Wszystkie</button></div>
    <p v-if="!agenda.length" class="note">{{ selDay ? 'Tego dnia nic nie zaplanowano.' : 'Na najbliższe tygodnie nic nie zaplanowano.' }}</p>
    <button v-for="it in agenda" :key="it.kind + it.id" class="ev" :style="{ '--c': typeOf(it.type).color }" @click="openItem(it)">
      <span class="when"><small>{{ wd(it.date) }}</small><b>{{ day(it.date) }}</b><small>{{ month(it.date) }}</small></span>
      <span class="body"><b>{{ it.title }}</b><small>{{ it.time || 'cały dzień' }}<template v-if="it.place"> · {{ it.place }}</template></small><span class="tag">{{ typeOf(it.type).name }}</span></span>
      <svg class="i chev"><use href="#chev"/></svg>
    </button>
    <!-- wybór rodzaju nowego wydarzenia -->
    <div v-if="pickType" class="sheet">
      <div class="head">
        <button class="ghost" aria-label="Zamknij" @click="pickType = false"><svg class="i"><use href="#back"/></svg></button>
        <b>{{ canEdit || canReview ? 'Nowe wydarzenie' : 'Zgłoś wydarzenie' }}{{ selDay ? ' — ' + pretty(selDay) : '' }}</b>
      </div>
      <div class="typepick">
        <button v-for="t in types.filter(t => canEdit || canReview || !['nabozenstwo', 'rada', 'czlonkowskie'].includes(t.id))" :key="t.id" @click="newEvent(t.id)"><i :style="{ background: t.color }"></i>{{ t.name }}<small>{{ t.time }}</small></button>
      </div>
    </div>
  </template>

  <!-- osoby i rangi (administrator) -->
  <template v-else-if="peopleView">
    <div v-if="peopleBusy && !people.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 6" :key="n" class="skel skel-row"></div></div>
    <template v-for="group in peopleGroups" :key="group.id">
      <div class="section"><h2>{{ group.title }} · {{ group.list.length }}</h2></div>
      <div v-for="p in group.list" :key="p.email" class="person" :class="p.status">
        <div class="p-head">
          <span class="avatar">{{ initials(p) }}</span>
          <span class="meta"><b>{{ p.name || p.email }}</b><small>{{ p.email }}<template v-if="p.status === 'pending' && p.requested"> · {{ ago(p.requested) }}</template></small></span>
        </div>
        <div v-if="p.status !== 'rejected'" class="ranks" role="group" :aria-label="'Rangi: ' + (p.name || p.email)">
          <button v-for="r in ranks" :key="r.id" class="rank" :class="{ on: p.draft.includes(r.id) }" :aria-pressed="p.draft.includes(r.id)" :disabled="p.busy" @click="toggleRank(p, r.id)">{{ r.name }}</button>
        </div>
        <p v-if="p.error" class="p-error">{{ p.error }}</p>
        <div class="p-actions">
          <template v-if="p.status === 'pending'">
            <button :disabled="p.busy" @click="setPerson(p, 'rejected')">Odrzuć</button>
            <button class="primary" :disabled="p.busy" @click="setPerson(p, 'active')">{{ p.busy ? 'Zapisuję…' : 'Zatwierdź' }}</button>
          </template>
          <button v-else-if="p.status === 'rejected'" :disabled="p.busy" @click="setPerson(p, 'active')">{{ p.busy ? 'Zapisuję…' : 'Przywróć dostęp' }}</button>
          <template v-else>
            <button v-if="p.email !== me?.email" class="ghost" :disabled="p.busy" @click="setPerson(p, 'rejected')">Odbierz dostęp</button>
            <button class="primary" :disabled="p.busy || !rolesChanged(p)" @click="setPerson(p)">{{ p.busy ? 'Zapisuję…' : rolesChanged(p) ? 'Zapisz rangi' : 'Zapisane' }}</button>
          </template>
        </div>
      </div>
    </template>
    <div v-if="drive.backend === 'supabase'" class="newsletter migrate">
      <span class="pc-icon"><svg class="i"><use href="#drive"/></svg></span>
      <div class="pc-text"><b>Dane z Dysku Google</b><p>Jednorazowo: nabożeństwa, pieśni, kalendarz, szablony, ogłoszenia i protokoły z plików na Dysku do bazy. To, co w bazie jest nowsze, zostaje.</p>
        <p v-if="migrated" class="pc-saved">{{ migrated }}</p></div>
      <button :disabled="!!migrating" @click="migrate">{{ migrating || 'Przenieś' }}</button>
    </div>
    <p v-if="drive.backend !== 'supabase'" class="note" style="margin-top:18px">Zatwierdzenie od razu udostępnia foldery na Dysku Google: wszyscy widzą folder aplikacji i protokoły ze spotkań członkowskich;
      lider, organizator, technika, rada i pastor mogą zmieniać nabożeństwa i pieśni; protokolant pisze protokoły; rada i pastor mają folder rady.</p>
  </template>

  <!-- baza pieśni: lista -->
  <template v-else-if="songView">
    <div class="searchbox">
      <svg class="i"><use href="#search"/></svg>
      <input v-model="songQuery" type="search" :placeholder="`Szukaj: numer, tytuł, tekst (${songs.length})`" autocomplete="off">
    </div>
    <button v-if="canEdit" class="primary" style="width:100%;margin-top:12px" @click="newSong"><svg class="i"><use href="#plus"/></svg>Nowa pieśń</button>
    <div class="songs">
      <p v-if="!songResults.length" class="note">{{ songs.length ? 'Nie ma takiej pieśni.' : 'Baza pieśni jest pusta.' }}</p>
      <button v-for="s in songResults" :key="s.id" class="song pickable" @click="openSong(s)">
        <span class="pos">{{ s.number || '♪' }}</span>
        <span class="meta"><b>{{ s.title }}</b><small>{{ lines(s.text) }}</small></span>
        <svg class="i chev"><use href="#chev"/></svg>
      </button>
    </div>
  </template>

  <!-- Kalendarz kościoła w Kalendarzu Google (subskrypcja) -->
  <template v-else-if="gcalView && !current">
    <div class="gcal">
      <p>Nabożeństwa i wydarzenia z aplikacji pojawią się w Twoim Kalendarzu Google (albo w kalendarzu iPhone'a) i będą się same uzupełniać.</p>
      <p class="note">Google odświeża subskrybowane kalendarze sam — zwykle co kilka godzin, więc nowe wydarzenie trafi tam z opóźnieniem (w aplikacji od razu).</p>
      <p v-if="gcal.error" class="error">{{ gcal.error }}</p>
      <p v-if="!gcal.url" class="note">{{ gcal.busy ? 'Przygotowuję adres…' : '' }}</p>
      <template v-else>
        <a class="button primary" :href="gcal.google" target="_blank" rel="noopener"><svg class="i"><use href="#calendar"/></svg>Dodaj do Kalendarza Google</a>
        <a class="button" :href="gcal.webcal"><svg class="i"><use href="#calendar"/></svg>iPhone, Outlook i inne</a>
        <label for="gcalUrl">Adres kalendarza (prywatny — nie udostępniaj go)</label>
        <div class="gcal-url"><input id="gcalUrl" :value="gcal.url" readonly @focus="$event.target.select()"><button @click="copyGcal">{{ gcal.copied ? 'Skopiowano' : 'Kopiuj' }}</button></div>
        <p class="note">Na komputerze: Kalendarz Google → „Inne kalendarze” → <b>+</b> → „Z adresu URL” → wklej adres.</p>
        <button class="ghost" :disabled="gcal.busy" @click="renewGcal">Utwórz nowy adres (stary przestanie działać)</button>
      </template>
    </div>
  </template>

  <!-- Więcej: wszystko poza Startem i Kalendarzem (tylko to, do czego dana ranga ma dostęp) -->
  <!-- Zaangażuj się: służby szukające chętnych, zgłoszenia, akceptacja przez lidera -->
  <template v-else-if="serveView && !current">
    <p class="note" style="margin-top:0">Wybierz służbę i zgłoś się — lider służby potwierdzi zgłoszenie.</p>
    <button v-if="canCreateMinistry" class="primary" style="width:100%;margin-bottom:12px" @click="editMinistry()"><svg class="i"><use href="#plus"/></svg>Nowa służba</button>
    <div v-if="serve.busy && !serve.list.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 4" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="serve.error" class="error">{{ serve.error }}</p>
    <p v-else-if="!serve.list.length" class="note">Nie ma jeszcze żadnych służb{{ canCreateMinistry ? ' — dodaj pierwszą.' : '.' }}</p>
    <template v-for="sec in serveSections" :key="sec.id">
    <h2 class="mn-sec">{{ sec.title }}</h2>
    <article v-for="m in sec.list" :key="m.id" :id="'sluzba-' + m.id" class="ministry" :class="{ seeking: m.seeking, linked: linkedMinistry === m.id }">
      <div class="mn-head">
        <span class="mn-ic"><svg class="i"><use href="#users"/></svg></span>
        <b>{{ m.name }}</b>
        <span v-if="m.seeking" class="ann-tag pin">Szukamy chętnych</span>
        <span class="kh-spacer"></span>
        <button class="icon" aria-label="Kopiuj link do służby" title="Kopiuj link do służby" @click="shareLink('sluzba', m.id, m.name)"><svg class="i"><use href="#link"/></svg></button>
        <button v-if="m.lead" class="icon" aria-label="Edytuj służbę" title="Edytuj służbę" @click="editMinistry(m)"><svg class="i"><use href="#pencil"/></svg></button>
      </div>
      <p v-if="m.description" class="mn-desc">{{ m.description }}</p>
      <p class="mn-meta"><template v-if="m.leaders.length">Lider: {{ m.leaders.map(l => l.name).join(', ') }}</template><template v-if="!m.lead"><template v-if="m.leaders.length"> · </template>{{ m.members.length ? 'Służą: ' + m.members.join(', ') : 'Nikt jeszcze nie służy' }}</template></p>
      <!-- lider: osoby w służbie — dodawanie i usuwanie -->
      <div v-if="m.lead" class="mn-team">
        <small>Służą ({{ m.people.length }})</small>
        <div v-for="p in m.people" :key="p.id" class="mn-person">
          <span><b>{{ p.name }}</b></span>
          <button class="icon" :disabled="busy" :aria-label="'Usuń ' + p.name + ' ze służby'" title="Usuń ze służby" @click="removeFromMinistry(m, p)"><svg class="i"><use href="#x"/></svg></button>
        </div>
        <button class="ghost mn-add" :disabled="busy" @click="openAddPerson(m)"><svg class="i"><use href="#plus"/></svg>Dodaj osobę</button>
      </div>
      <div v-if="!m.leader" class="mn-actions">
        <button v-if="!m.mine" :class="{ primary: m.seeking }" :disabled="busy" @click="joinMinistry(m)">Chcę się zaangażować</button>
        <template v-else-if="m.mine === 'pending'"><span class="mn-state">Zgłoszono — czeka na lidera</span><button class="ghost" :disabled="busy" @click="leaveMinistry(m)">Wycofaj</button></template>
        <template v-else><span class="mn-state ok"><svg class="i"><use href="#check"/></svg>Służysz tutaj</span><button class="ghost" :disabled="busy" @click="leaveMinistry(m)">Zrezygnuj</button></template>
      </div>
      <div v-if="m.pending.length" class="mn-pending">
        <small>Zgłoszenia do akceptacji</small>
        <div v-for="p in m.pending" :key="p.id" class="mn-person">
          <span><b>{{ p.name }}</b><small v-if="p.grupa">{{ p.grupa }}</small></span>
          <button :disabled="busy" @click="decideMinistry(m, p, false)">Odrzuć</button>
          <button class="primary" :disabled="busy" @click="decideMinistry(m, p, true)">Akceptuj</button>
        </div>
      </div>
    </article>
    </template>
  </template>

  <!-- ASB: grafik spotkań studenckich (dawniej arkusz „ASB | GRAFIK”) i osobno lista pomysłów -->
  <template v-else-if="asbView && !current && !canAsb">
    <p class="listen-intro">Terminarz spotkań studenckich (ASB). Grafik z prowadzącymi i notatkami widzą osoby z rangą ASB.</p>
    <div v-if="asb.busy && !asb.pub.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 5" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="asb.error" class="error">{{ asb.error }}</p>
    <p v-else-if="!asbPubUpcoming.length" class="note">Na razie nie ma zaplanowanych spotkań.</p>
    <template v-for="g in asbPubGroups" :key="g.month">
      <h2 class="mn-sec">{{ g.month }}</h2>
      <div v-for="m in g.list" :key="m.id" class="asb-row" :class="['k-' + m.kind, { past: m.date < todayStr }]">
        <span class="asb-date"><small>{{ wd(m.date) }}</small><b>{{ day(m.date) }}</b><small>{{ month(m.date) }}</small></span>
        <span class="asb-body">
          <span v-if="m.kind !== 'cykliczne'" class="asb-badge">{{ asbKindName(m.kind) }}</span>
          <b>{{ m.topic || 'Spotkanie ASB' }}</b>
          <small v-if="m.time || m.place">{{ [m.time, m.place].filter(Boolean).join(' · ') }}</small>
        </span>
      </div>
    </template>
  </template>
  <template v-else-if="asbView && !current">
    <div class="seg asb-tabs" role="tablist" aria-label="ASB">
      <button role="tab" :aria-selected="asb.tab === 'plan'" :class="{ on: asb.tab === 'plan' }" @click="asb.tab = 'plan'">Grafik</button>
      <button role="tab" :aria-selected="asb.tab === 'ideas'" :class="{ on: asb.tab === 'ideas' }" @click="asb.tab = 'ideas'">Pomysły<template v-if="asb.ideas.length"> ({{ asb.ideas.length }})</template></button>
    </div>
    <div v-if="asb.busy && !asb.meetings.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 6" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="asb.error" class="error">{{ asb.error }}</p>
    <template v-else-if="asb.tab === 'ideas'">
      <div class="asb-idea-add">
        <input v-model="asb.ideaTopic" placeholder="Nowy pomysł — temat" aria-label="Temat pomysłu" autocomplete="off" @keydown.enter="asbIdeaAdd">
        <input v-model="asb.ideaAuthor" placeholder="Pomysłodawca" aria-label="Pomysłodawca" autocomplete="off" @keydown.enter="asbIdeaAdd">
        <button :disabled="busy || !asb.ideaTopic.trim()" @click="asbIdeaAdd"><svg class="i"><use href="#plus"/></svg>Dodaj</button>
      </div>
      <p v-if="!asb.ideas.length" class="note">Na razie nie ma pomysłów — dopisz pierwszy.</p>
      <div v-for="i in asb.ideas" :key="i.id" class="mn-person asb-idea">
        <span><b>{{ i.topic }}</b><small v-if="i.author">{{ i.author }}</small></span>
        <button :disabled="busy" title="Nowe spotkanie z tym tematem" @click="asbEdit(null, i)"><svg class="i"><use href="#calendar"/></svg><span>Zaplanuj</span></button>
        <button class="icon" :disabled="busy" aria-label="Usuń pomysł" title="Usuń pomysł" @click="asbIdeaDelete(i)"><svg class="i"><use href="#x"/></svg></button>
      </div>
    </template>
    <template v-else>
      <div class="asb-seasons" role="tablist" aria-label="Rok akademicki">
        <button v-for="se in asbSeasons" :key="se" class="chipbtn" :class="{ on: asb.season === se }" @click="asb.season = se">{{ se }}</button>
      </div>
      <div class="asb-stats">
        <span><b>{{ asbList.filter(m => m.date && m.topic).length }}</b> spotkań z tematem</span>
        <span v-if="asbAvg"><b>{{ asbAvg }}</b> średnia frekwencja</span>
        <span v-if="asbNext"><b>{{ shortDate(asbNext.date) }}</b> najbliższe</span>
      </div>
      <div class="asb-kinds" role="group" aria-label="Rodzaj spotkań">
        <button class="chipbtn" :class="{ on: !asb.kind }" @click="asb.kind = ''">Wszystkie</button>
        <button v-for="k in ASB_KINDS" :key="k.id" class="chipbtn" :class="['k-' + k.id, { on: asb.kind === k.id }]" @click="asb.kind = asb.kind === k.id ? '' : k.id"><i></i>{{ k.plural }} · {{ asbList.filter(m => m.kind === k.id && !asbPause(m)).length }}</button>
        <button v-if="asbMissingCount" class="chipbtn miss" :class="{ on: asb.kind === 'braki' }" title="Najbliższe spotkania bez tematu, prowadzącego albo miejsca" @click="asb.kind = asb.kind === 'braki' ? '' : 'braki'"><svg class="i"><use href="#warn"/></svg>Do uzupełnienia · {{ asbMissingCount }}</button>
      </div>
      <div class="asb-tools">
        <button class="primary asb-add" @click="asbEdit()"><svg class="i"><use href="#plus"/></svg>Dodaj spotkanie</button>
        <button v-if="msgRanks.some(r => r.id === 'asb')" title="Powiadomienie dla wszystkich z rangą ASB" @click="openMsg({ ranks: ['asb'] })"><svg class="i"><use href="#megaphone"/></svg>Wiadomość</button>
      </div>
      <p v-if="!asbGroups.length" class="note">W tym roku nie ma jeszcze takich spotkań.</p>
      <template v-for="g in asbGroups" :key="g.month">
        <h2 class="mn-sec">{{ g.month }}</h2>
        <template v-for="m in g.list" :key="m.id">
          <p v-if="m.conceptStart" class="asb-concept">{{ m.concept }}</p>
          <button class="asb-row" :class="['k-' + m.kind, { past: m.date && m.date < todayStr, next: asbNext && m.id === asbNext.id, pause: asbPause(m), incomplete: asbMissing(m).length }]" @click="asbEdit(m)">
            <span class="asb-date"><small>{{ m.date ? wd(m.date) : '' }}</small><b>{{ m.date ? day(m.date) : '—' }}</b><small>{{ m.date ? month(m.date) : '' }}</small></span>
            <span class="asb-body">
              <span v-if="m.kind !== 'cykliczne'" class="asb-badge">{{ asbKindName(m.kind) }}</span>
              <b>{{ asbTitle(m) }}</b>
              <small v-if="asbMissing(m).length" class="asb-miss"><svg class="i"><use href="#warn"/></svg>Brakuje: {{ asbMissing(m).join(', ') }}</small>
              <small v-if="m.leader && !asbPause(m)">Prowadzi: {{ m.leader }}<template v-if="m.helper && m.helper !== m.leader"> · pomaga: {{ m.helper }}</template></small>
              <small v-if="(m.kind !== 'cykliczne' && m.time) || m.place">{{ [m.kind !== 'cykliczne' ? m.time : '', m.place].filter(Boolean).join(' · ') }}</small>
              <small v-if="m.int_idea || m.int_date || m.int_organizer" class="asb-int">Integracja: {{ [m.int_idea, m.int_date, m.int_organizer].filter(Boolean).join(' · ') }}</small>
              <small v-if="m.note || m.study || (m.files || []).length" class="asb-meta">
                <span v-if="m.note"><svg class="i"><use href="#pencil"/></svg>Notatka</span>
                <span v-if="m.study || (m.files || []).length"><svg class="i"><use href="#file"/></svg>Rozważanie<template v-if="(m.files || []).length"> · {{ m.files.length }} {{ m.files.length === 1 ? 'plik' : m.files.length < 5 ? 'pliki' : 'plików' }}</template></span>
              </small>
            </span>
            <span v-if="m.attendance != null" class="asb-att" title="Frekwencja">{{ m.attendance }}</span>
          </button>
        </template>
      </template>
    </template>
  </template>

  <!-- Posłuchaj: YouTube i Spotify (linki ustawia administrator) -->
  <!-- Cele wsparcia: deklaracje z dziesięciny, potwierdzanie miesięcy, pasek postępu; rada — cele i kto ile -->
  <!-- Wybory i głosowania: zgłoszenia → rada zatwierdza → tajne głosowanie (można kilka) → wyniki -->
  <template v-else-if="votesView && !current">
    <p class="goals-intro">Wybory (np. rady zboru) i głosowania na spotkaniach członkowskich. Najpierw członkowie zgłaszają kandydatów, rada zatwierdza listę, potem każdy członek oddaje <b>tajny</b> głos — można wybrać kilka osób, jeśli wybory na to pozwalają.</p>
    <p v-if="votes.error" class="error">{{ votes.error }}</p>
    <div class="section"><h2>Głosowania</h2><button v-if="votes.canRun && !votes.edit" class="small" @click="newElection"><svg class="i"><use href="#plus"/></svg>Nowe</button></div>

    <!-- formularz (rada) -->
    <section v-if="votes.edit" class="goal-form vote-form">
      <h2>{{ votes.edit._new ? 'Nowe głosowanie' : 'Edycja głosowania' }}</h2>
      <label for="vTitle">Tytuł <span class="req">*</span></label>
      <input id="vTitle" v-model="votes.edit.title" maxlength="160" placeholder="np. Wybory rady zboru 2027, Uchwała o zakupie nagłośnienia" autocomplete="off">
      <label for="vDesc">Opis (zasady, ile osób wybieramy, do kiedy)</label>
      <textarea id="vDesc" v-model="votes.edit.description" class="ann-text"></textarea>
      <template v-if="votes.edit._new || votes.edit.status === 'nominations'">
        <label>Na kogo / na co głosujemy</label>
        <div class="vote-seg" role="group" aria-label="Rodzaj">
          <button type="button" :class="{ on: votes.edit.kind === 'people' }" @click="votes.edit.kind = 'people'"><b>Na osoby</b><small>członkowie zgłaszają kandydatów, rada zatwierdza</small></button>
          <button type="button" :class="{ on: votes.edit.kind === 'options' }" @click="votes.edit.kind = 'options'"><b>Na odpowiedzi</b><small>np. Za / Przeciw / Wstrzymuję się</small></button>
        </div>
        <template v-if="votes.edit.kind === 'options'">
          <label for="vOpts">Odpowiedzi — każda w osobnej linii</label>
          <textarea id="vOpts" v-model="votes.edit.optionsText" class="ann-text" placeholder="Za&#10;Przeciw&#10;Wstrzymuję się"></textarea>
        </template>
        <label for="vMax">Ile można wybrać na jednej karcie</label>
        <input id="vMax" v-model.number="votes.edit.max_choices" type="number" min="1" max="50" inputmode="numeric" style="max-width:140px">
      </template>
      <label for="vEvent">Spotkanie (opcjonalnie) — głosowanie widać w wydarzeniu w kalendarzu</label>
      <select id="vEvent" v-model="votes.edit.event_id" class="vote-select">
        <option value="">— bez spotkania —</option>
        <option v-for="ev in voteEvents" :key="ev.id" :value="ev.id">{{ shortDate(ev.date) }} · {{ ev.title || typeOf(ev.type).name }}</option>
      </select>
      <label class="check"><input v-model="votes.edit.results_public" type="checkbox">Wyniki widzą wszyscy członkowie (inaczej tylko rada)</label>
      <div class="bar">
        <button class="primary" :disabled="busy || !votes.edit.title.trim() || (votes.edit.kind === 'options' && optionsOf(votes.edit).length < 2)" @click="saveElection">Zapisz</button>
        <button :disabled="busy" @click="votes.edit = null">Anuluj</button>
        <button v-if="!votes.edit._new" class="danger" :disabled="busy" @click="removeElection(votes.edit)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
      </div>
    </section>

    <template v-else>
      <div v-if="votes.busy && !votes.list.length" class="skel-list" aria-busy="true"><div v-for="n in 2" :key="n" class="skel skel-row"></div></div>
      <p v-else-if="!votes.list.length" class="note">Nie ma jeszcze głosowań.{{ votes.canRun ? ' Utwórz pierwsze — „Nowe”.' : ' Ogłasza je rada zboru.' }}</p>
      <article v-for="e in votes.list" :key="e.id" class="vote" :class="['st-' + e.status, { focus: votes.open === e.id }]">
        <div class="vote-h">
          <span class="vote-status" :class="e.status">{{ VOTE_STATUS[e.status === 'nominations' && e.kind === 'options' ? 'ready' : e.status] }}</span>
          <b>{{ e.title }}</b>
          <button v-if="votes.canRun && e.status !== 'closed'" class="icon" title="Edytuj" aria-label="Edytuj głosowanie" @click="editElection(e)"><svg class="i"><use href="#pencil"/></svg></button>
        </div>
        <p v-if="e.description" class="vote-desc">{{ e.description }}</p>
        <p class="vote-meta">{{ e.kind === 'people' ? 'Na osoby' : 'Na odpowiedzi' }} · {{ e.max_choices === 1 ? 'jeden wybór' : 'do ' + e.max_choices + ' wyborów' }} · głos tajny</p>
        <button v-if="eventOf(e)" class="vote-event" @click="openEvent(eventOf(e))"><svg class="i"><use href="#calendar"/></svg>{{ eventOf(e).title || typeOf(eventOf(e).type).name }} · {{ shortDate(eventOf(e).date) }}<svg class="i chev"><use href="#chev"/></svg></button>

        <!-- 1. zgłaszanie kandydatów -->
        <template v-if="e.status === 'nominations'">
          <div v-if="e.kind === 'people'" class="vote-nominate">
            <label :for="'vn' + e.id">Zgłoś kandydata</label>
            <div class="row">
              <select :id="'vn' + e.id" :value="votes.pick[e.id] || ''" @focus="loadElectionPeople" @change="votes.pick[e.id] = $event.target.value">
                <option value="">— wybierz osobę —</option>
                <option v-for="p in votes.people.filter(p => !e.candidates.some(c => c.person === p.id && c.mine))" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <button class="primary" :disabled="busy || !votes.pick[e.id]" @click="nominate(e)">Zgłoś</button>
            </div>
            <div v-if="e.candidates.some(c => c.mine)" class="vote-chips">
              <small>Twoje zgłoszenia:</small>
              <span v-for="c in e.candidates.filter(c => c.mine)" :key="c.id" class="vote-chip">{{ c.label }}<button class="icon" :aria-label="'Wycofaj zgłoszenie: ' + c.label" title="Wycofaj zgłoszenie" @click="nominate(e, c.person, true)"><svg class="i"><use href="#x"/></svg></button></span>
            </div>
          </div>
          <!-- rada: kto bierze udział -->
          <div v-if="votes.canRun" class="vote-review">
            <small class="vote-lbl">{{ e.kind === 'people' ? 'Zgłoszeni — kto bierze udział (decyduje rada)' : 'Odpowiedzi' }}</small>
            <div v-for="c in e.candidates" :key="c.id" class="vote-cand" :class="{ ok: c.accepted === true, no: c.accepted === false }">
              <span><b>{{ c.label }}</b><small v-if="e.kind === 'people'">{{ c.nominations }} {{ c.nominations === 1 ? 'zgłoszenie' : c.nominations < 5 ? 'zgłoszenia' : 'zgłoszeń' }}</small></span>
              <template v-if="e.kind === 'people'">
                <button class="small" :class="{ primary: c.accepted === true }" :disabled="busy" @click="reviewCand(c, c.accepted === true ? null : true)"><svg class="i"><use href="#check"/></svg>{{ c.accepted === true ? 'Bierze udział' : 'Zatwierdź' }}</button>
                <button class="small" :class="{ danger: c.accepted === false }" :disabled="busy" @click="reviewCand(c, c.accepted === false ? null : false)"><svg class="i"><use href="#x"/></svg>{{ c.accepted === false ? 'Odrzucony' : 'Odrzuć' }}</button>
              </template>
            </div>
            <p v-if="!e.candidates.length" class="note">Nikt jeszcze nie został zgłoszony.</p>
            <button class="primary vote-start" :disabled="busy || !e.candidates.some(c => c.accepted)" @click="setElectionStatus(e, 'voting')"><svg class="i"><use href="#check"/></svg>Rozpocznij głosowanie ({{ e.candidates.filter(c => c.accepted).length }})</button>
          </div>
        </template>

        <!-- 2. głosowanie -->
        <template v-else-if="e.status === 'voting' || e.status === 'paused'">
          <p v-if="e.voted" class="vote-done"><svg class="i"><use href="#check"/></svg>Twój głos został oddany. Dziękujemy!</p>
          <p v-else-if="e.status === 'paused'" class="vote-paused"><svg class="i"><use href="#info"/></svg>Głosowanie jest wstrzymane — prowadzący włączy je w odpowiednim momencie.</p>
          <template v-else>
            <small class="vote-lbl">{{ e.max_choices === 1 ? 'Wybierz jedną odpowiedź' : 'Wybierz do ' + e.max_choices }} · wybrano {{ (votes.ballot[e.id] || []).length }}</small>
            <button v-for="c in e.candidates" :key="c.id" class="vote-opt" :class="{ on: (votes.ballot[e.id] || []).includes(c.id) }" :aria-pressed="(votes.ballot[e.id] || []).includes(c.id)" :disabled="!(votes.ballot[e.id] || []).includes(c.id) && e.max_choices > 1 && (votes.ballot[e.id] || []).length >= e.max_choices" @click="toggleBallot(e, c)">
              <span class="vote-box" :class="{ radio: e.max_choices === 1 }"><svg class="i"><use href="#check"/></svg></span><b>{{ c.label }}</b>
            </button>
            <button class="primary vote-send" :disabled="busy || !(votes.ballot[e.id] || []).length" @click="castVote(e)">Oddaj głos</button>
            <p class="note">Głos jest tajny — nikt nie zobaczy, na kogo głosowałeś(-aś). Oddanego głosu nie da się zmienić.</p>
          </template>
          <div v-if="votes.canRun" class="vote-review">
            <small class="vote-lbl">Frekwencja: {{ e.turnout }} z {{ e.eligible }} członków</small>
            <div class="goal-bar"><i class="done" :style="{ width: Math.round(e.turnout / Math.max(1, e.eligible) * 100) + '%' }"></i></div>
            <div class="row vote-ctl">
              <button v-if="e.status === 'voting'" :disabled="busy" title="Nikt nie odda głosu, dopóki nie wznowisz — oddane głosy zostają" @click="setElectionStatus(e, 'paused')"><svg class="i"><use href="#x"/></svg>Wstrzymaj</button>
              <button v-else class="primary" :disabled="busy" @click="setElectionStatus(e, 'voting')"><svg class="i"><use href="#check"/></svg>Wznów głosowanie</button>
              <button class="danger" :disabled="busy" @click="setElectionStatus(e, 'closed')">Zakończ i policz</button>
            </div>
          </div>
        </template>

        <!-- 3. wyniki -->
        <template v-else>
          <template v-if="e.candidates.some(c => c.votes != null)">
            <small class="vote-lbl">Wyniki · głosowało {{ e.turnout }} z {{ e.eligible }}</small>
            <div v-for="(c, i) in [...e.candidates].filter(c => c.accepted).sort((a, b) => b.votes - a.votes)" :key="c.id" class="vote-res" :class="{ top: i < e.max_choices && c.votes > 0 }">
              <span><b>{{ c.label }}</b><em>{{ c.votes }} {{ c.votes === 1 ? 'głos' : c.votes % 10 >= 2 && c.votes % 10 <= 4 && (c.votes % 100 < 10 || c.votes % 100 >= 20) ? 'głosy' : 'głosów' }}</em></span>
              <div class="goal-bar"><i class="done" :style="{ width: Math.round(c.votes / Math.max(1, e.turnout) * 100) + '%' }"></i></div>
            </div>
          </template>
          <p v-else class="note">Wyniki zna rada zboru.</p>
        </template>
      </article>
    </template>
  </template>

  <template v-else-if="goalsView && !current">
    <p class="goals-intro">Część swojej dziesięciny możesz przeznaczyć na wybrany cel. Deklarujesz kwotę <b>miesięcznie</b>, a po każdym miesiącu potwierdzasz, że Twoja dziesięcina wyniosła co najmniej sumę deklaracji — jeśli nie, zmniejszasz je. Twoje kwoty widzisz Ty i rada zboru, pozostali — tylko pasek postępu.</p>
    <p v-if="goals.error" class="error">{{ goals.error }}</p>

    <section v-for="m in shownMonths" :key="m.month" class="goal-confirm" :class="{ done: m.confirmed, due: !m.confirmed && m.month < thisMonth, later: !m.confirmed && m.month >= thisMonth && goals.expand !== m.month }">
      <div class="gc-h"><svg class="i"><use :href="m.confirmed ? '#check' : '#heart'"/></svg><b>{{ monthName(m.month) }}</b><span class="ann-tag">{{ m.confirmed ? 'potwierdzone · ' + zl(m.total) : m.month < thisMonth ? 'do potwierdzenia' : 'bieżący miesiąc' }}</span></div>
      <!-- bieżący miesiąc: potwierdza się razem z przelewem — do tego czasu krótka informacja -->
      <div v-if="!m.confirmed && m.month >= thisMonth && goals.expand !== m.month" class="gc-later">
        <span>Potwierdzisz, gdy wyślesz dziesięcinę za {{ monthName(m.month).split(' ')[0] }} — co najmniej <b>{{ zl(itemsSum(m)) }}</b>.</span>
        <button class="small" @click="goals.expand = m.month">Wysyłam teraz</button>
      </div>
      <template v-else-if="!m.confirmed">
        <p>Czy Twoja dziesięcina {{ m.month < thisMonth ? 'w tym miesiącu wyniosła' : 'w tym miesiącu wynosi' }} co najmniej <b>{{ zl(itemsSum(m)) }}</b>?</p>
        <ul class="gc-items"><li v-for="it in m.items || []" :key="it.goal"><span>{{ it.title }}</span><b>{{ zl(it.amount) }}</b></li></ul>
        <template v-if="goals.reduce?.month === m.month">
          <p class="note">Wpisz, ile faktycznie poszło na każdy cel — deklaracje zmniejszą się do tych kwot (na kolejne miesiące też).</p>
          <div v-for="it in goals.reduce.items" :key="it.goal" class="gc-reduce"><label :for="'gr' + it.goal">{{ it.title }}</label><input :id="'gr' + it.goal" v-model.number="it.value" type="number" min="0" :max="it.amount" step="10" inputmode="numeric"><small>z {{ zl(it.amount) }}</small></div>
          <div v-if="goals.confirming?.month !== m.month" class="row"><button class="primary" :disabled="busy" @click="askConfirm(m, true)">Dalej — z tymi kwotami</button><button :disabled="busy" @click="goals.reduce = null">Anuluj</button></div>
        </template>
        <div v-else-if="goals.confirming?.month !== m.month" class="row"><button class="primary" :disabled="busy" @click="askConfirm(m)"><svg class="i"><use href="#check"/></svg>Tak, potwierdzam</button><button :disabled="busy" @click="startReduce(m)">Nie — zmniejszam deklaracje</button></div>
        <!-- drugi krok: przelew i ostateczne potwierdzenie -->
        <div v-if="goals.confirming?.month === m.month" class="gc-final">
          <b>Wyślij przelew dziesięciny — co najmniej {{ zl(goals.confirming.total) }}</b>
          <dl v-if="support.account || support.blik" class="gc-transfer">
            <template v-if="support.account"><dt>Konto</dt><dd><code>{{ support.account }}</code><button class="small" @click="copyText(support.account.replace(/\s/g, ''), 'konto')">{{ copiedWhat === 'konto' ? 'Skopiowano' : 'Kopiuj' }}</button></dd></template>
            <template v-if="support.name"><dt>Odbiorca</dt><dd>{{ support.name }}</dd></template>
            <dt>Tytuł</dt><dd><code>{{ transferTitle(m) }}</code><button class="small" @click="copyText(transferTitle(m), 'tytul')">{{ copiedWhat === 'tytul' ? 'Skopiowano' : 'Kopiuj' }}</button></dd>
            <template v-if="support.blik"><dt>BLIK</dt><dd>na numer <code>{{ support.blik }}</code><button class="small" @click="copyText(support.blik.replace(/\s/g, ''), 'blik')">{{ copiedWhat === 'blik' ? 'Skopiowano' : 'Kopiuj' }}</button></dd></template>
          </dl>
          <p v-else class="note">Dane do przelewu ustawia administrator (na tej stronie, pod listą celów).</p>
          <p class="gc-warn"><svg class="i"><use href="#alert"/></svg><span>Potwierdzenie jest ostateczne. Do {{ nextMonthStart }} nie zmienisz też swoich deklaracji (nowa deklaracja na inny cel będzie liczona od {{ nextMonthStart }}).</span></p>
          <label class="check"><input v-model="goals.sent" type="checkbox">Wysłałem(-am) przelew dziesięciny — co najmniej {{ zl(goals.confirming.total) }}</label>
          <div class="row"><button class="primary" :disabled="busy || !goals.sent" @click="confirmMonth(m)"><svg class="i"><use href="#check"/></svg>Potwierdzam ostatecznie</button><button :disabled="busy" @click="goals.confirming = null">Wróć</button></div>
        </div>
      </template>
    </section>

    <!-- formularz celu (rada zboru, pastor, administrator) -->
    <section v-if="goals.edit" class="goal-form">
      <h2>{{ goals.edit._new ? 'Nowy cel' : 'Edycja celu' }}</h2>
      <label for="gTitle">Nazwa celu</label>
      <input id="gTitle" v-model="goals.edit.title" maxlength="120" :class="{ invalid: !goals.edit.title.trim() }" placeholder="np. Remont sali, Wyjazd młodzieży, Misja w …" autocomplete="off">
      <label for="gDesc">Opis (na co, dlaczego)</label>
      <textarea id="gDesc" v-model="goals.edit.description" class="ann-text"></textarea>
      <div class="goal-form-row">
        <span><label for="gTarget">Kwota łącznie (zł)</label><input id="gTarget" v-model.number="goals.edit.target" type="number" min="1" step="100" inputmode="numeric" :class="{ invalid: !(goals.edit.target > 0) }"></span>
        <span><label for="gEnds">Termin</label><input id="gEnds" v-model="goals.edit.ends" type="date" :min="todayStr" :class="{ invalid: !goals.edit.ends }"></span>
      </div>
      <label>Grafika (opcjonalnie)</label>
      <img v-if="goals.edit.image" class="ann-img edit" :src="goals.edit.image" alt="">
      <div v-if="drive.uploadImage" class="row">
        <button type="button" :disabled="imgBusy" @click="$refs.goalImg.click()"><svg class="i"><use href="#plus"/></svg>{{ imgBusy ? 'Wysyłam…' : goals.edit.image ? 'Zmień grafikę' : 'Dodaj grafikę' }}</button>
        <button v-if="goals.edit.image" type="button" @click="goals.edit.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
      </div>
      <input ref="goalImg" type="file" accept="image/*" hidden @change="pickGoalImage">
      <label v-if="!goals.edit._new" class="check"><input v-model="goals.edit.closed" type="checkbox">Zakończony — nowych deklaracji już nie przyjmuje</label>
      <div class="bar">
        <button class="primary" :disabled="busy || !goals.edit.title.trim() || !(goals.edit.target > 0) || !goals.edit.ends" @click="saveGoal">Zapisz cel</button>
        <button :disabled="busy" @click="goals.edit = null">Anuluj</button>
        <button v-if="!goals.edit._new" class="danger" :disabled="busy" @click="removeGoal(goals.edit)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
      </div>
    </section>

    <template v-else>
      <div class="section"><h2>Cele</h2><button v-if="goals.canManage" class="small" @click="newGoal"><svg class="i"><use href="#plus"/></svg>Nowy cel</button></div>
      <p v-if="goals.status.monthly" class="note">Razem deklarujesz <b>{{ zl(goals.status.monthly) }}</b> miesięcznie ze swojej dziesięciny.</p>
      <div v-if="goals.busy && !goals.list.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 3" :key="n" class="skel skel-row"></div></div>
      <p v-else-if="!goals.list.length" class="note">Nie ma jeszcze celów.{{ goals.canManage ? ' Dodaj pierwszy — „Nowy cel”.' : ' Ogłasza je rada zboru.' }}</p>
      <details v-if="canManage" class="goal-support">
        <summary>Dane do przelewu dziesięciny (widzą je członkowie przy potwierdzaniu)</summary>
        <label for="spAcc">Numer konta</label><input id="spAcc" v-model="supportEdit.account" inputmode="numeric" placeholder="np. 12 1020 …" autocomplete="off">
        <label for="spName">Odbiorca</label><input id="spName" v-model="supportEdit.name" placeholder="Kościół Na Skale" autocomplete="off">
        <label for="spTitle">Tytuł przelewu (miesiąc i imię dopiszą się same)</label><input id="spTitle" v-model="supportEdit.title" placeholder="Dziesięcina" autocomplete="off">
        <label for="spBlik">Telefon do BLIK</label><input id="spBlik" v-model="supportEdit.blik" inputmode="tel" placeholder="np. 789 571 542" autocomplete="off">
        <div class="row"><button class="primary" :disabled="busy" @click="saveSupport">Zapisz dane</button></div>
      </details>
      <article v-for="g in goals.list" :key="g.id" class="goal" :class="{ closed: g.closed, focus: goals.open === g.id }">
        <img v-if="g.image" class="goal-img" :src="g.image" alt="" loading="lazy">
        <div class="goal-h"><b>{{ g.title }}</b><span class="ann-tag">{{ g.closed ? 'zakończony' : 'do ' + shortDate(g.ends) }}</span></div>
        <p v-if="g.description" class="goal-desc">{{ g.description }}</p>
        <div class="goal-bar" role="progressbar" :aria-valuenow="goalPct(g)" aria-valuemin="0" aria-valuemax="100" :title="'Zebrano ' + goalPct(g) + '% · z deklaracjami do terminu ' + goalProj(g) + '%'">
          <i class="proj" :style="{ width: goalProj(g) + '%' }"></i><i class="done" :style="{ width: goalPct(g) + '%' }"></i>
        </div>
        <div class="goal-nums"><span><b>{{ zl(g.confirmed) }}</b> z {{ zl(g.target) }} · {{ goalPct(g) }}%</span><span>{{ g.people }} {{ g.people === 1 ? 'osoba' : g.people % 10 >= 2 && g.people % 10 <= 4 && (g.people % 100 < 10 || g.people % 100 >= 20) ? 'osoby' : 'osób' }} · {{ zl(g.monthly) }} / mies.</span></div>
        <small v-if="!g.closed" class="goal-legend"><i class="lg-done"></i>potwierdzone <i class="lg-proj"></i>z deklaracjami do terminu: {{ zl(goalProjAmount(g)) }}</small>
        <p v-if="monthLocked && g.mine" class="note goal-locked"><svg class="i"><use href="#check"/></svg><span>Twoja deklaracja: <b>{{ zl(g.mine) }}</b> miesięcznie. Dziesięcina w tym miesiącu już potwierdzona — zmienisz ją od {{ nextMonthStart }}.</span></p>
        <p v-else-if="goalDue && g.mine" class="note goal-locked"><svg class="i"><use href="#heart"/></svg><span>Twoja deklaracja: <b>{{ zl(g.mine) }}</b> miesięcznie. Najpierw potwierdź {{ monthName(goalDue.month).split(' ')[0] }} (u góry) — potem ją zmienisz.</span></p>
        <div v-else class="goal-mine">
          <p v-if="monthLocked && !g.mine" class="note">W tym miesiącu dziesięcina jest już potwierdzona — nowa deklaracja będzie liczona od {{ nextMonthStart }}.</p>
          <label :for="'gm' + g.id">{{ g.mine ? 'Twoja deklaracja' : 'Ile z dziesięciny co miesiąc?' }} <small>(zł miesięcznie)</small></label>
          <div class="row">
            <input :id="'gm' + g.id" v-model.number="goals.amount[g.id]" type="number" min="0" step="10" inputmode="numeric" :disabled="g.closed && !g.mine" placeholder="np. 100">
            <button class="primary" :disabled="busy || !(+goals.amount[g.id] >= 0) || +goals.amount[g.id] === g.mine || (!g.mine && !+goals.amount[g.id]) || (g.closed && +goals.amount[g.id] > g.mine)" @click="savePledge(g)">{{ g.mine ? 'Zmień' : 'Deklaruję' }}</button>
            <button v-if="g.mine" :disabled="busy" @click="withdraw(g)">Wycofaj</button>
          </div>
        </div>
        <div v-if="goals.canManage" class="goal-admin">
          <button class="small" @click="editGoal(g)"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
          <button class="small" @click="toggleGoalPeople(g)"><svg class="i"><use href="#users"/></svg>{{ goals.people[g.id] ? 'Ukryj osoby' : 'Kto deklaruje' }}</button>
        </div>
        <table v-if="goals.people[g.id]" class="goal-people">
          <thead><tr><th>Osoba</th><th>/ mies.</th><th>razem</th><th>{{ monthShort(prevMonth) }}</th><th>{{ monthShort(thisMonth) }}</th></tr></thead>
          <tbody>
            <tr v-for="p in goals.people[g.id]" :key="p.name"><td>{{ p.name }}</td><td>{{ zl(p.amount) }}</td><td>{{ zl(p.given) }}</td><td :class="{ miss: p.prev == null && p.since < thisMonth }">{{ p.prev == null ? (p.since < thisMonth ? 'brak' : '—') : '✓ ' + zl(p.prev) }}</td><td>{{ p.now == null ? '—' : '✓ ' + zl(p.now) }}</td></tr>
            <tr v-if="!goals.people[g.id].length"><td colspan="5" class="muted">Nikt jeszcze nie zadeklarował.</td></tr>
          </tbody>
        </table>
      </article>
    </template>
  </template>

  <template v-else-if="listenView && !current">
    <p class="listen-intro">Chciałbyś poznać bliżej to, czym żyjemy? Kazania i uwielbienie — do obejrzenia i posłuchania.</p>
    <div class="listen-grid">
      <section v-if="listenYt || isChannelLink(listen.youtube)" class="listen-card">
        <div class="lc-head"><b>YouTube</b><a v-if="listen.youtubeMore || listen.youtube" class="lc-more" :href="listen.youtubeMore || listen.youtube" target="_blank" rel="noopener">więcej</a></div>
        <p v-if="listenLatest" class="lc-title">Najnowsze: {{ listenLatest.title }}</p>
        <div v-if="listenYt" class="lc-video"><iframe :src="listenYt" title="YouTube — Kościół Na Skale" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
      </section>
      <section v-if="listenSp" class="listen-card">
        <div class="lc-head"><b>Spotify</b><a class="lc-more" :href="listen.spotify" target="_blank" rel="noopener">więcej</a></div>
        <iframe class="lc-spotify" :src="listenSp" title="Spotify — Kościół Na Skale" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
      </section>
    </div>
    <p v-if="!listenYt && !listenSp" class="note">{{ canManage ? 'Wklej poniżej linki do kanału YouTube i podcastu na Spotify.' : 'Wkrótce tutaj kazania z YouTube i Spotify.' }}</p>
    <details v-if="canManage" class="listen-set" :open="!listenYt && !listenSp">
      <summary>Ustaw linki (administrator)</summary>
      <label for="lsYt">YouTube — adres kanału</label>
      <input id="lsYt" v-model="listenEdit.youtube" placeholder="np. https://www.youtube.com/@koscionaskale" autocomplete="off">
      <p class="note" style="margin:4px 0 0">Adres kanału — strona sama pokazuje zawsze najnowsze kazanie. Można też wkleić konkretny film albo playlistę.</p>
      <label for="lsSp">Spotify — link do podcastu (zawsze najnowszy odcinek)</label>
      <input id="lsSp" v-model="listenEdit.spotify" placeholder="np. https://open.spotify.com/show/…" autocomplete="off">
      <p v-if="listenEdit.youtube && !youtubeEmbed(listenEdit.youtube) && !/youtube\.com\/(@|c\/|user\/)/.test(listenEdit.youtube)" class="error">To nie wygląda na link YouTube — wklej adres kanału, film albo playlistę.</p>
      <p v-if="listenEdit.spotify && !spotifyEmbed(listenEdit.spotify)" class="error">To nie wygląda na link Spotify (open.spotify.com/show/…).</p>
      <button class="primary" style="margin-top:12px" :disabled="busy" @click="saveListen">Zapisz linki</button>
    </details>
  </template>

  <!-- Mój profil: imię i nazwisko, grupka -->
  <template v-else-if="profileView && !current">
    <div class="profile-head">
      <span class="kh-av">{{ initials({ name: profile.name, email: me?.email || '' }) }}</span>
      <span><b>{{ me?.email }}</b><small>{{ myRanks || 'Członek' }}</small></span>
    </div>
    <label for="pfName">Imię i nazwisko <span class="req">*</span></label>
    <input id="pfName" v-model="profile.name" :class="{ invalid: !profile.name.trim() }" autocomplete="name">
    <label for="pfGroup">Grupka</label>
    <input id="pfGroup" v-model="profile.grupa" list="pf-groups" placeholder="np. Grupka domowa — Mokotów" autocomplete="off">
    <datalist id="pf-groups"><option v-for="g in groupNames" :key="g" :value="g"></option></datalist>
    <p class="note" style="margin-top:6px">Wybierz z listy albo wpisz nazwę. Dzięki grupce lider może wysłać powiadomienie całej grupce.</p>
    <label>Moje służby</label>
    <div class="mn-mine-list">
      <div v-for="m in serve.list.filter(m => m.mine || m.leader)" :key="m.id" class="mn-mine"><b>{{ m.name }}</b><span :class="{ ok: m.leader || m.mine === 'active' }">{{ m.leader ? 'jesteś liderem' : m.mine === 'active' ? 'służysz' : 'czeka na akceptację lidera' }}</span></div>
      <p v-if="!serve.busy && !serve.list.some(m => m.mine || m.leader)" class="note">Nie należysz jeszcze do żadnej służby.</p>
    </div>
    <button class="songsbtn" @click="openServe"><svg class="i"><use href="#serve"/></svg>Zgłoś się do służby<svg class="i chev"><use href="#chev"/></svg></button>
    <label>Powiadomienia i newsletter</label>
    <div v-if="push.supported" class="push-card" :class="{ on: push.on }">
      <div class="pc-head">
        <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
        <div class="pc-text">
          <b>Powiadomienia na telefon {{ push.on ? '— włączone' : '' }}</b>
          <p v-if="push.on">Na ten telefon przychodzi wszystko z dzwonka: wiadomości od liderów, zgłoszenia, decyzje w służbach<template v-if="canEdit">, a także przypomnienie, gdy na niedzielę czegoś brakuje</template>.</p>
          <p v-else-if="push.otherBrowser">Ta przeglądarka ({{ push.otherBrowser }}) nie obsługuje powiadomień. Otwórz stronę w <b>Chrome</b> i zainstaluj aplikację stamtąd (menu ⋮ → „Zainstaluj aplikację”).</p>
          <p v-else-if="push.needsInstall">Na iPhonie najpierw zainstaluj aplikację (przycisk „Pobierz” wyżej) i otwórz ją z ekranu głównego.</p>
          <p v-else-if="push.denied">Powiadomienia są zablokowane w ustawieniach telefonu dla tej strony — odblokuj je tam i spróbuj ponownie.</p>
          <p v-else>Powiadomienia w aplikacji (dzwonek) są zawsze włączone. Włącz, żeby przychodziły też na ten telefon.</p>
        </div>
      </div>
      <div v-if="push.on && canEdit" class="pc-when">
        <span class="pc-label">Przypomnienie o brakach — kiedy</span>
        <div class="pc-row">
          <select v-model.number="push.day" aria-label="Dzień przypomnienia" :disabled="push.busy" @change="saveSchedule"><option v-for="(name, i) in DAYS" :key="i" :value="i">{{ name }}</option></select>
          <span>o</span>
          <select v-model.number="push.hour" aria-label="Godzina przypomnienia" :disabled="push.busy" @change="saveSchedule"><option v-for="h in HOURS" :key="h" :value="h">{{ h }}:00</option></select>
        </div>
        <small v-if="push.saved" class="pc-saved">Zapisano ✓</small>
      </div>
      <p v-if="push.error" class="pc-error">{{ push.error }}</p>
      <p v-else-if="push.slow" class="pc-slow">{{ push.slow }}</p>
      <div v-if="push.on" class="pc-actions two">
        <button :disabled="push.busy" title="Wysyła powiadomienie na ten telefon, żeby zobaczyć, jak wygląda" @click="testPush">{{ push.busy ? 'Wysyłam…' : 'Wyślij próbne powiadomienie' }}</button>
        <button :disabled="push.busy" @click="disablePush">Wyłącz</button>
      </div>
      <div v-else-if="push.otherBrowser" class="pc-actions"><a class="button primary" :href="chromeLink">Otwórz w Chrome</a></div>
      <div v-else-if="!push.needsInstall" class="pc-actions"><button class="primary" :disabled="push.busy" @click="enablePush">{{ push.busy ? 'Włączam…' : 'Włącz powiadomienia' }}</button></div>
    </div>
    <div v-if="!push.supported" class="push-card">
      <div class="pc-head">
        <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
        <div class="pc-text"><b>Powiadomienia na telefon</b><p>Włącza się je na telefonie: otwórz tę stronę w telefonie (najlepiej zainstaluj aplikację), wejdź w Mój profil i kliknij „Włącz powiadomienia” — tam jest też „Wyślij próbne powiadomienie”. W aplikacji (dzwonek) powiadomienia są zawsze włączone.</p></div>
      </div>
    </div>
    <div v-if="api.enabled && me?.status === 'active'" class="newsletter">
      <span class="pc-icon"><svg class="i"><use href="#mail"/></svg></span>
      <div class="pc-text"><b>Newsletter e-mail</b><p>Co czwartek: kalendarz na dwa tygodnie i ogłoszenia — na {{ me.email }}.</p></div>
      <button class="switch" :class="{ on: me.newsletter }" role="switch" :aria-checked="!!me.newsletter" aria-label="Newsletter e-mail" :disabled="newsBusy" @click="toggleNewsletter"></button>
    </div>
    <div v-if="api.enabled && me?.status === 'active'" class="pc-actions mail-test">
      <button :disabled="mailTest.busy" title="Wysyła newsletter na Twój adres, żeby zobaczyć, jak wygląda" @click="testNewsletter">{{ mailTest.busy ? 'Wysyłam…' : 'Wyślij próbny e-mail' }}</button>
      <small v-if="mailTest.text" :class="{ 'pc-error': mailTest.bad }">{{ mailTest.text }}</small>
    </div>

    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <div class="bar"><button class="primary" :disabled="busy || !profile.name.trim() || !profileDirty" @click="saveProfile"><svg v-if="!profileDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : profileDirty ? 'Zapisz' : 'Zapisane' }}</button></div>
  </template>

  <template v-else-if="moreView && !current">
    <nav class="more-list" aria-label="Więcej">
      <button v-if="canMsg" @click="openMsg()"><svg class="i"><use href="#megaphone"/></svg><span>Wyślij wiadomość</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="api.enabled" @click="openAsb"><svg class="i"><use href="#users"/></svg><span>{{ canAsb ? 'ASB — grafik spotkań' : 'ASB — terminarz spotkań' }}</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="api.enabled" @click="openListen"><svg class="i"><use href="#music"/></svg><span>Posłuchaj</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="api.enabled" @click="openVotes()"><svg class="i"><use href="#check"/></svg><span>Głosowania</span><small v-if="votesOpen" class="count-pill">{{ votesOpen }}</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="api.enabled" @click="openGoals()"><svg class="i"><use href="#money"/></svg><span>Cele wsparcia</span><small v-if="goalDue" class="count-pill">!</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button @click="openSongs"><svg class="i"><use href="#music"/></svg><span>Pieśni</span><small>{{ songs.length }}</small><svg class="i chev"><use href="#chev"/></svg></button>
      <button @click="openAnns"><svg class="i"><use href="#megaphone"/></svg><span>Ogłoszenia</span><small>{{ activeAnns.length || '' }}</small><svg class="i chev"><use href="#chev"/></svg></button>
      <button @click="openProtocols"><svg class="i"><use href="#list"/></svg><span>Materiały</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="canManage" @click="openPeople"><svg class="i"><use href="#users"/></svg><span>Osoby</span><small v-if="pendingCount" class="count-pill">{{ pendingCount }}</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="canEdit" @click="openTemplates"><svg class="i"><use href="#calendar"/></svg><span>Szablony wydarzeń</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="cueTopic && canCamera" @click="openCamera"><svg class="i"><use href="#camera"/></svg><span>Kamera (sygnały)</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
      <button class="theme-btn" @click="toggleTheme"><svg class="i"><use :href="theme === 'dark' ? '#sun' : '#moon'"/></svg><span>{{ theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny' }}</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    </nav>
    <div v-if="desktop" class="getapp more-getapp">
      <img src="icon-192.png" alt="">
      <span class="ga-text"><b>Aplikacja na komputer — dla służby technicznej</b><small>{{ desktopApp.error || 'Rzutnik, stream i organizacja nabożeństw · Windows' + (desktopApp.version ? ' · wersja ' + desktopApp.version : '') + (desktopApp.size ? ' · ' + desktopApp.size + ', ' + desktopApp.installed : '') }}</small></span>
      <a v-if="desktopApp.url" class="button primary" :href="desktopApp.url"><svg class="i"><use href="#download"/></svg>Pobierz</a>
    </div>
    <div v-if="push.supported && !api.enabled" class="push-card" :class="{ on: push.on }">
      <div class="pc-head">
        <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
        <div class="pc-text">
          <b>{{ push.on ? 'Powiadomienia włączone' : 'Powiadomienia o brakach' }}</b>
          <p v-if="push.on">Dostaniesz powiadomienie, gdy na najbliższą niedzielę czegoś brakuje.</p>
          <p v-else-if="push.otherBrowser">Ta przeglądarka ({{ push.otherBrowser }}) nie obsługuje powiadomień. Otwórz stronę w <b>Chrome</b> i zainstaluj aplikację stamtąd (menu ⋮ → „Zainstaluj aplikację”).</p>
          <p v-else-if="push.needsInstall">Na iPhonie najpierw zainstaluj aplikację (przycisk „Pobierz” wyżej) i otwórz ją z ekranu głównego.</p>
          <p v-else-if="push.denied">Powiadomienia są zablokowane w ustawieniach telefonu dla tej strony — odblokuj je tam i spróbuj ponownie.</p>
          <p v-else>Przypomnienie, gdy na niedzielę czegoś brakuje. Dzień i godzinę wybierzesz po włączeniu.</p>
        </div>
      </div>
      <div v-if="push.on" class="pc-when">
        <span class="pc-label">Kiedy przypominać</span>
        <div class="pc-row">
          <select v-model.number="push.day" aria-label="Dzień przypomnienia" :disabled="push.busy" @change="saveSchedule"><option v-for="(name, i) in DAYS" :key="i" :value="i">{{ name }}</option></select>
          <span>o</span>
          <select v-model.number="push.hour" aria-label="Godzina przypomnienia" :disabled="push.busy" @change="saveSchedule"><option v-for="h in HOURS" :key="h" :value="h">{{ h }}:00</option></select>
        </div>
        <small v-if="push.saved" class="pc-saved">Zapisano ✓</small>
      </div>
      <p v-if="push.error" class="pc-error">{{ push.error }}</p>
      <p v-else-if="push.slow" class="pc-slow">{{ push.slow }}</p>
      <div v-if="push.on" class="pc-actions two">
        <button :disabled="push.busy" title="Wysyła powiadomienie na ten telefon, żeby zobaczyć, jak wygląda" @click="testPush">{{ push.busy ? 'Wysyłam…' : 'Wyślij próbne powiadomienie' }}</button>
        <button :disabled="push.busy" @click="disablePush">Wyłącz</button>
      </div>
      <div v-else-if="push.otherBrowser" class="pc-actions"><a class="button primary" :href="chromeLink">Otwórz w Chrome</a></div>
      <div v-else-if="!push.needsInstall" class="pc-actions"><button class="primary" :disabled="push.busy" @click="enablePush">{{ push.busy ? 'Włączam…' : 'Włącz powiadomienia' }}</button></div>
    </div>
    <button v-if="api.enabled && me" class="songsbtn" @click="openProfile"><svg class="i" :class="{ 'kh-warn': needsName }"><use :href="needsName ? '#warn' : '#user'"/></svg>Mój profil — {{ needsName ? 'uzupełnij imię i nazwisko' : me.name }}{{ me.grupa ? ' · ' + me.grupa : '' }}<svg class="i chev"><use href="#chev"/></svg></button>
    <div class="account">
      <svg class="i"><use href="#user"/></svg><span>{{ me?.email || drive.account() || 'Zalogowano' }}<template v-if="myRanks"> · <span class="roles">{{ myRanks }}</span></template></span>
      <button v-if="!drive.demo" class="ghost" @click="logout"><svg class="i"><use href="#logout"/></svg>Wyloguj</button>
      <small class="acc-ver">wersja {{ version }}</small>
    </div>
  </template>

  <!-- Start: powitanie, najbliższe nabożeństwo i komunikaty rady, ten tydzień, kartki z newslettera.
       Na szerokim ekranie (przeglądarka na komputerze) — układ jak w aplikacji na komputer. -->
  <template v-else-if="!current">
    <!-- Szeroki ekran (przeglądarka na komputerze): ten sam układ i te same style co w aplikacji na komputer (home.css). -->
    <div class="kh kh-web">
      <div class="kh-hello">
        <h1>{{ greeting }}{{ firstName ? ', ' + firstName : '' }}</h1>
        <p>Oto co dzieje się w kościele.</p>
      </div>
      <button v-if="goalDue" class="goal-banner" @click="openGoals()"><svg class="i"><use href="#money"/></svg><span><b>Potwierdź cele wsparcia za {{ monthName(goalDue.month) }}</b><small>Czy Twoja dziesięcina wyniosła co najmniej {{ zl(itemsSum(goalDue)) }}?</small></span><svg class="i chev"><use href="#chev"/></svg></button>
      <section v-if="lastSermon && thoughtList(lastSermon).length" class="kh-panel kh-thoughts">
        <div class="kh-panel-h"><h2>Myśli z kazania</h2><span class="kh-muted">{{ shortDate(lastSermon.date) }}</span><span class="kh-spacer"></span><button v-if="canEdit" class="kh-link" @click="open(lastSermon)">Edytuj</button></div>
        <p class="kh-th-sermon"><b>{{ lastSermon.sermonTitle || 'Kazanie' }}</b><template v-if="lastSermon.passage"> · {{ lastSermon.passage }}</template><template v-if="lastSermon.speaker"> — {{ lastSermon.speaker }}</template></p>
        <ul class="kh-th-list"><li v-for="(t, i) in thoughtList(lastSermon)" :key="i">{{ t }}</li></ul>
      </section>

      <!-- komunikaty rady: baner na górze -->
      <button v-for="a in importantAnns" :key="a.id" class="hw-banner" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
        <span class="hw-banner-ic"><svg class="i"><use href="#megaphone"/></svg></span>
        <span class="hw-banner-text"><small>Komunikat rady zboru<em v-if="annIsNew(a)" class="kh-new">Nowe</em></small><b>{{ a.title }}</b><span>{{ a.text }}</span></span>
        <span class="hw-go">Czytaj<svg class="i"><use href="#chev"/></svg></span>
      </button>

      <!-- najbliższe nabożeństwo: duża karta (data po lewej, szczegóły i przycisk po prawej) -->
      <article class="hw-feature">
        <div class="hw-visual">
          <span v-for="(a, i) in HERO_ART" :key="a" class="hw-art" :class="{ on: i === heroArt }" :style="{ backgroundImage: 'url(' + a + ')' }" aria-hidden="true"></span>
          <span class="hw-step">1</span><span class="hw-kicker">Najbliższe nabożeństwo</span>
          <template v-if="nextService">
            <div class="hw-date"><b>{{ asDate(nextService.date).getDate() }}</b><span>{{ asDate(nextService.date).toLocaleDateString('pl', { month: 'long' }) }}<small>{{ asDate(nextService.date).toLocaleDateString('pl', { weekday: 'long' }) }}</small></span></div>
            <span class="hw-until" :class="{ live: countdown?.live }"><i></i>{{ countdown?.live ? 'Trwa teraz' : untilText }}</span>
          </template>
          <div v-else class="hw-date hw-date-empty"><span>Termin wkrótce<small>{{ canEdit ? 'zaplanuj nabożeństwo obok' : 'pojawi się tutaj, gdy zostanie zaplanowane' }}</small></span></div>
        </div>
        <div class="hw-info">
          <template v-if="nextService">
            <h2>{{ nextService.sermonTitle || 'Nabożeństwo' }}</h2>
            <p>{{ [nextService.passage, nextService.speaker].filter(Boolean).join(' — ') || 'Temat kazania pojawi się wkrótce.' }}</p>
            <dl class="hw-rows">
              <div><dt>Godzina</dt><dd>{{ nextService.time || DEFAULT_TIME }}</dd></div>
              <div><dt>Miejsce</dt><dd>{{ nextService.place || DEFAULT_PLACE }}</dd></div>
              <div v-if="(nextService.songs || []).length"><dt>Pieśni</dt><dd>{{ nextService.songs.length }}</dd></div>
              <div v-if="canEdit"><dt>Przygotowanie</dt><dd :class="missing(nextService).length ? 'bad' : 'ok'">{{ missing(nextService).length ? 'brakuje: ' + missing(nextService).join(', ') : 'komplet' }}</dd></div>
            </dl>
            <button class="primary hw-cta" @click="open(nextService)">{{ canEdit && missing(nextService).length ? 'Uzupełnij nabożeństwo' : 'Zobacz nabożeństwo' }}<svg class="i"><use href="#chev"/></svg></button>
          </template>
          <template v-else>
            <h2>Jeszcze nie zaplanowane</h2>
            <p>Następne nabożeństwo czeka na wypełnienie{{ canEdit ? ' — dodaj datę, kazanie i pieśni.' : '.' }}</p>
            <button v-if="canEdit" class="primary hw-cta" @click="create(planSunday)"><svg class="i"><use href="#plus"/></svg>Zaplanuj na {{ shortDate(planSunday) }}</button>
          </template>
        </div>
      </article>

      <section v-if="reviewItems.length" class="kh-panel kh-review">
        <div class="kh-panel-h"><h2>{{ canReview ? 'Do zatwierdzenia' : 'Twoje zgłoszenia' }}</h2><span class="kh-muted">{{ canReview ? 'czekają na Twoją decyzję' : 'czekają na zatwierdzenie' }}</span></div>
        <div class="kh-anns">
          <button v-for="it in reviewItems" :key="it.kind + it.id" class="kh-ann" @click="it.kind === 'event' ? openEvent(it.ref) : openAnn(it.ref)">
            <span class="kh-ann-ic"><svg class="i"><use :href="it.kind === 'event' ? '#calendar' : '#megaphone'"/></svg></span>
            <span class="kh-ann-text"><b>{{ it.title }}</b><span>{{ it.sub }}</span></span>
            <small class="kh-wait">czeka</small>
          </button>
        </div>
      </section>

      <!-- trzy kolumny: ogłoszenia, tydzień, wspólnota -->
      <div class="hw-cols">
        <section class="hw-col">
          <h3 class="hw-h"><span class="hw-step">2</span>Ogłoszenia<small v-if="newAnnCount">{{ newAnnCount }} {{ newAnnCount === 1 ? 'nowe' : 'nowych' }}</small></h3>
          <button v-for="a in boardNews.slice(0, 5)" :key="a.id" class="hw-row" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
            <img v-if="a.image" class="hw-thumb" :src="a.image" alt="" loading="lazy"><span v-else class="hw-thumb">{{ a.title.trim()[0]?.toUpperCase() }}</span>
            <span class="hw-row-text"><b>{{ a.title }}</b><small>{{ shortDate(a.date) }}<template v-if="annIsNew(a)"> · <em>nowe</em></template></small></span>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
          <p v-if="!boardNews.length" class="hw-none">Nie ma nowych ogłoszeń.</p>
          <button class="hw-link" @click="openAnns">Wszystkie ogłoszenia<template v-if="boardMore.n"> ({{ boardAll.length }})</template><svg class="i"><use href="#chev"/></svg></button>
        </section>
        <section class="hw-col">
          <h3 class="hw-h"><span class="hw-step">3</span>Ten tydzień<small>{{ weekRange }}</small></h3>
          <template v-for="d in weekDays" :key="d.date">
            <button v-for="it in d.items" :key="it.kind + it.id" class="hw-row hw-ev" :class="{ today: d.date === todayStr }" :style="{ '--c': typeOf(it.type).color }" @click="openItem(it)">
              <span class="hw-day"><small>{{ d.date === todayStr ? 'dziś' : d.wd }}</small><b>{{ d.n }}</b></span>
              <span class="hw-row-text"><b>{{ it.kind === 'service' ? 'Nabożeństwo' : it.title }}</b><small><i></i>{{ it.time || 'cały dzień' }} · {{ typeOf(it.type).name }}</small></span>
              <svg class="i hw-arr"><use href="#chev"/></svg>
            </button>
          </template>
          <p v-if="!weekDays.some(d => d.items.length)" class="hw-none">Spokojny tydzień — nic nie zaplanowano.</p>
          <div class="hw-links">
            <button class="hw-link" @click="openCalendar">Kalendarz<svg class="i"><use href="#chev"/></svg></button>
            <button v-if="canSubmit" class="hw-link" title="Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie." @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>Zaproś na swoje wydarzenie</button>
          </div>
        </section>
        <section v-if="api.enabled" class="hw-col">
          <h3 class="hw-h"><span class="hw-step">4</span>Wspólnota</h3>
          <button v-for="e in votes.list.filter(x => x.status === 'voting' && !x.voted)" :key="e.id" class="hw-row hw-due" @click="openVotes()">
            <span class="hw-thumb"><svg class="i"><use href="#check"/></svg></span>
            <span class="hw-row-text"><b>Głosowanie: {{ e.title }}</b><small>oddaj tajny głos</small></span>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
          <button v-if="goalDue" class="hw-row hw-due" @click="openGoals()">
            <span class="hw-thumb"><svg class="i"><use href="#money"/></svg></span>
            <span class="hw-row-text"><b>Potwierdź {{ monthName(goalDue.month).split(' ')[0] }}</b><small>dziesięcina co najmniej {{ zl(itemsSum(goalDue)) }}</small></span>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
          <button v-for="g in goals.list.filter(x => !x.closed).slice(0, 2)" :key="g.id" class="hw-row hw-goal" @click="openGoals(g.id)">
            <span class="hw-row-text"><b>{{ g.title }}</b><span class="hw-bar"><i :style="{ width: goalPct(g) + '%' }"></i></span><small>{{ zl(g.confirmed) }} z {{ zl(g.target) }} · {{ goalPct(g) }}%</small></span>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
          <button v-if="serve.list.some(m => m.seeking)" class="hw-row" @click="openServe">
            <span class="hw-thumb"><svg class="i"><use href="#serve"/></svg></span>
            <span class="hw-row-text"><b>Szukają chętnych</b><small>{{ serve.list.filter(m => m.seeking).map(m => m.name).join(', ') }}</small></span>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
          <div class="hw-links">
            <button class="hw-link" @click="openGoals()">Cele wsparcia<svg class="i"><use href="#chev"/></svg></button>
            <button class="hw-link" @click="openServe">Zaangażuj się<svg class="i"><use href="#chev"/></svg></button>
          </div>
        </section>
      </div>
      <div class="kh-panels hw-old">
        <section class="kh-panel">
          <div class="kh-panel-h"><h2>Ogłoszenia</h2><span class="kh-muted">z newslettera</span><span class="kh-spacer"></span><button class="kh-link" @click="openAnns">Wszystkie</button></div>
          <div v-if="boardNews.length" class="kh-anns">
            <button v-for="a in boardNews" :key="a.id" class="kh-ann" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
              <img v-if="a.image" class="kh-ann-ic kh-ann-img" :src="a.image" alt="" loading="lazy">
              <span v-else class="kh-ann-ic">{{ a.title.trim()[0]?.toUpperCase() }}</span>
              <span class="kh-ann-text"><b><svg v-if="a.pinned" class="i kh-pin"><use href="#pin"/></svg><span class="kh-ann-t">{{ a.title }}</span><em v-if="annIsNew(a)" class="kh-new">Nowe</em><em v-if="a.video" class="kh-film">▶ Film</em></b><span>{{ a.text }}</span></span>
              <small>{{ shortDate(a.date) }}</small>
            </button>
          </div>
          <button v-if="boardMore.n" class="kh-more" @click="openAnns">Jeszcze {{ boardMore.n }} {{ boardMore.n === 1 ? 'ogłoszenie' : boardMore.n < 5 ? 'ogłoszenia' : 'ogłoszeń' }}<em v-if="boardMore.fresh" class="kh-new">{{ boardMore.fresh }} {{ boardMore.fresh === 1 ? 'nowe' : 'nowych' }}</em><svg class="i"><use href="#chev"/></svg></button>
          <p v-else class="kh-none">Nie ma nowych ogłoszeń.</p>
        </section>

        <section class="kh-panel">
          <div class="kh-panel-h"><h2>Tydzień</h2><span class="kh-muted">{{ weekRange }}</span><span class="kh-spacer"></span><button class="kh-link" @click="openCalendar">Kalendarz</button></div>
          <div class="kh-week">
            <div v-for="d in weekDays" :key="d.date" class="kh-day" :class="{ today: d.date === todayStr }">
              <span class="kh-wd">{{ d.wd }}</span>
              <span class="kh-n">{{ d.n }}</span>
              <button v-for="it in d.items" :key="it.kind + it.id" class="kh-ev" :style="{ '--c': typeOf(it.type).color }" :title="(it.time ? it.time + ' ' : '') + it.title" @click="openItem(it)">
                <small v-if="it.time">{{ it.time }}</small>{{ it.kind === 'service' ? 'Nabożeństwo' : it.title }}
              </button>
            </div>
          </div>
          <div v-if="canSubmit" class="invite invite-week"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
        </section>
      </div>
    </div>

    <div class="phone-home">
    <div class="hello">
      <h1>{{ greeting }}{{ firstName ? ', ' + firstName : '' }}</h1>
      <p>Oto co dzieje się w kościele.</p>
    </div>
    <button v-if="goalDue" class="goal-banner" @click="openGoals()"><svg class="i"><use href="#money"/></svg><span><b>Potwierdź cele wsparcia za {{ monthName(goalDue.month) }}</b><small>Czy Twoja dziesięcina wyniosła co najmniej {{ zl(itemsSum(goalDue)) }}?</small></span><svg class="i chev"><use href="#chev"/></svg></button>
    <section v-if="lastSermon && thoughtList(lastSermon).length" class="kh-panel kh-thoughts phone-thoughts">
      <div class="kh-panel-h"><h2>Myśli z kazania</h2><span class="kh-muted">{{ shortDate(lastSermon.date) }}</span><span class="kh-spacer"></span><button v-if="canEdit" class="kh-link" @click="open(lastSermon)">Edytuj</button></div>
      <p class="kh-th-sermon"><b>{{ lastSermon.sermonTitle || 'Kazanie' }}</b><template v-if="lastSermon.passage"> · {{ lastSermon.passage }}</template><template v-if="lastSermon.speaker"> — {{ lastSermon.speaker }}</template></p>
      <ul class="kh-th-list"><li v-for="(t, i) in thoughtList(lastSermon)" :key="i">{{ t }}</li></ul>
    </section>
    <section v-if="reviewItems.length" class="kh-panel kh-review phone-thoughts">
      <div class="kh-panel-h"><h2>{{ canReview ? 'Do zatwierdzenia' : 'Twoje zgłoszenia' }}</h2><span class="kh-muted">{{ canReview ? 'czekają na Twoją decyzję' : 'czekają na zatwierdzenie' }}</span></div>
      <div class="kh-anns">
        <button v-for="it in reviewItems" :key="it.kind + it.id" class="kh-ann" @click="it.kind === 'event' ? openEvent(it.ref) : openAnn(it.ref)">
          <span class="kh-ann-ic"><svg class="i"><use :href="it.kind === 'event' ? '#calendar' : '#megaphone'"/></svg></span>
          <span class="kh-ann-text"><b>{{ it.title }}</b><span>{{ it.sub }}</span></span>
          <small class="kh-wait">czeka</small>
        </button>
      </div>
    </section>

    <div class="start-top">
      <button v-if="nextService" class="hero" :class="{ live: countdown?.live }" @click="open(nextService)">
        <span class="hero-top">
          <span v-if="countdown?.live" class="cd-live"><i class="cd-dot"></i>W TRAKCIE</span>
          <span v-else class="hero-cd">Najbliższe nabożeństwo · {{ untilText }}</span>
        </span>
        <b class="hero-when">{{ pretty(nextService.date).replace(/ \d{4}$/, '').replace(/^./, c => c.toUpperCase()) }}, {{ nextService.time || DEFAULT_TIME }}</b>
        <span class="hero-place">{{ nextService.place || DEFAULT_PLACE }}</span>
        <span v-if="nextService.sermonTitle || nextService.passage" class="hero-sermon">{{ [nextService.sermonTitle, nextService.passage].filter(Boolean).join(' · ') }}<template v-if="nextService.speaker"> — {{ nextService.speaker }}</template></span>
        <span v-if="canEdit" class="chips">
          <span v-if="!missing(nextService).length" class="chip good"><svg class="i"><use href="#check"/></svg>Komplet</span>
          <span v-for="m in missing(nextService)" :key="m" class="chip"><svg class="i"><use href="#warn"/></svg>brak: {{ m }}</span>
        </span>
      </button>
      <div v-else-if="canEdit" class="hero empty-hero">
        <b>Nie ma zaplanowanego nabożeństwa</b>
        <span class="hero-place">Na niedzielę {{ pretty(planSunday).replace(/^niedziela, /, '') }} nic jeszcze nie ma.</span>
        <button class="primary" @click="create(planSunday)"><svg class="i"><use href="#plus"/></svg>Utwórz nabożeństwo</button>
      </div>

      <div v-if="importantAnns.length" class="notices" :class="{ single: importantAnns.length === 1 }" aria-label="Komunikaty rady zboru">
        <button v-for="a in importantAnns" :key="a.id" class="notice" @click="openAnn(a)">
          <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
          <span class="notice-tag"><svg class="i"><use href="#megaphone"/></svg>Komunikat rady zboru<em v-if="annIsNew(a)" class="kh-new">Nowe</em><em v-if="a.video" class="kh-film">▶ Film</em></span>
          <b>{{ a.title }}</b>
          <span class="notice-text">{{ a.text }}</span>
        </button>
      </div>
    </div>

    <div class="start-panels">
      <section class="sp-week">
        <div class="section"><h2>Ten tydzień</h2><button class="ghost" @click="openCalendar">Kalendarz</button></div>
        <!-- telefon: lista -->
        <p v-if="!weekItems.length" class="note week-list-only">W najbliższych dniach nic nie zaplanowano.</p>
        <div v-else class="week week-list-only">
          <button v-for="it in weekItems" :key="it.kind + it.id" class="week-row" @click="openItem(it)">
            <span class="week-day" :class="{ today: it.date === todayStr }">{{ dayLabel(it.date) }}</span>
            <i class="week-dot" :style="{ background: typeOf(it.type).color }"></i>
            <span class="week-title">{{ it.title }}</span>
            <span class="week-time">{{ it.time }}</span>
          </button>
        </div>
        <div v-if="canSubmit" class="invite invite-week"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
      </section>


      <section class="sp-news">
        <div class="section"><h2>Z newslettera</h2><button class="ghost" @click="openAnns">{{ canAnnounce ? 'Wszystkie / dodaj' : 'Wszystkie' }}</button></div>
        <p v-if="!homeAnns.length" class="note">Nie ma nowych ogłoszeń.</p>
        <div v-else class="news-grid">
          <button v-for="a in homeAnns" :key="a.id" class="news-card" @click="openAnn(a)">
            <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
            <b><svg v-if="a.pinned" class="i kh-pin"><use href="#pin"/></svg>{{ a.title }}<em v-if="a.video" class="kh-film">▶ Film</em></b>
            <span>{{ a.text }}</span>
            <small>{{ shortDate(a.date) }}</small>
          </button>
        </div>
      </section>
    </div>
    </div>
  </template>

  <!-- edycja -->
  <template v-else>
    <!-- podgląd nabożeństwa (bez prawa edycji) -->
    <article v-if="!canEdit || !svcEditing" class="ann-view svc-view">
      <div class="dv-hero">
        <div class="ann-tags"><span class="ann-tag pin">Nabożeństwo</span><span v-if="canEdit" class="ann-tag" :class="missing(current).length ? 'dv-bad' : 'dv-ok'">{{ missing(current).length ? 'Braki: ' + missing(current).length : 'Komplet' }}</span></div>
        <h2 class="ann-view-title">{{ pretty(current.date).replace(/ \d{4}$/, '').replace(/^./, c => c.toUpperCase()) }}</h2>
        <div class="facts">
          <span class="fact"><svg class="i"><use href="#calendar"/></svg><span><small>Godzina</small><b>{{ current.time || DEFAULT_TIME }}</b></span></span>
          <a class="fact" :href="mapLink(current.place || DEFAULT_PLACE)" target="_blank" rel="noopener"><svg class="i"><use href="#pin"/></svg><span><small>Miejsce · mapa</small><b>{{ current.place || DEFAULT_PLACE }}</b></span></a>
          <span v-if="current.speaker" class="fact"><svg class="i"><use href="#mic"/></svg><span><small>Kazanie</small><b>{{ current.speaker }}</b></span></span>
        </div>
      </div>
      <div class="dv-grid">
      <div class="dv-main">
      <template v-if="(current.program || []).length">
        <h3 class="view-h">Harmonogram</h3>
        <program-editor :items="current.program" :start="current.time || DEFAULT_TIME" readonly :sermon="{ title: current.sermonTitle, passage: current.passage, speaker: current.speaker }">
          <template #item="{ item }"><span v-if="songSlots.includes(item.key)" class="view-songs"><span v-for="e in songsIn(item.key)" :key="e.key">♪ {{ songTitle(e) }}</span></span></template>
        </program-editor>
      </template>
      <template v-else-if="current.songs.length">
        <h3 class="view-h">Pieśni</h3>
        <span class="view-songs"><span v-for="e in current.songs" :key="e.key">♪ {{ songTitle(e) }}</span></span>
      </template>
      </div>
      <aside class="dv-side">
        <p v-if="canEdit && missing(current).length" class="pending-note"><svg class="i"><use href="#warn"/></svg>Brakuje: {{ missing(current).join(', ') }}</p>
        <div v-if="current.sermonTitle || current.passage || current.speaker" class="view-card">
          <small>Kazanie</small>
          <b>{{ current.sermonTitle || 'Bez tytułu' }}</b>
          <span>{{ [current.passage, current.speaker].filter(Boolean).join(' — ') }}</span>
          <ul v-if="thoughtList(current).length" class="kh-th-list"><li v-for="(t, i) in thoughtList(current)" :key="i">{{ t }}</li></ul>
        </div>
        <div v-if="current.band" class="dv-card">
          <small class="dv-card-h">Zespół</small>
          <ul v-if="(current.bandList || []).length" class="dv-people"><li v-for="b in current.bandList" :key="b.key"><span class="dv-av">{{ initials({ name: b.name, email: b.name }) }}</span><span><b>{{ b.name }}</b><small v-if="b.instrument">{{ b.instrument }}</small></span></li></ul>
          <div v-else class="ann-view-text">{{ current.band }}</div>
        </div>
        <div v-if="current.notes" class="dv-card"><small class="dv-card-h">Informacje</small><div class="ann-view-text">{{ current.notes }}</div></div>
        <button v-if="canEdit" class="ann-edit-btn" :class="{ primary: missing(current).length }" @click="svcEditing = true"><svg class="i"><use href="#pencil"/></svg>{{ missing(current).length ? 'Uzupełnij nabożeństwo' : 'Edytuj nabożeństwo' }}</button>
      </aside>
      </div>
      <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    </article>
    <template v-else>
    <fieldset class="plain" :disabled="!canEdit">
    <div class="row">
      <div><label for="date">Data <span class="req">*</span></label><input id="date" v-model="current.date" type="date"></div>
      <div><label for="time">Godzina</label><input id="time" v-model="current.time" type="time"></div>
    </div>
    <label for="place">Miejsce</label>
    <input id="place" v-model="current.place" autocomplete="off">
    </fieldset>

    <!-- Harmonogram: kazanie i pieśni uzupełnia się w punktach programu. -->
    <label>Harmonogram nabożeństwa</label>
    <program-editor :items="current.program" :start="current.time || DEFAULT_TIME" :readonly="!canEdit" :template="typeOf('nabozenstwo').program"
                    :sermon="{ title: current.sermonTitle, passage: current.passage, speaker: current.speaker }" @fill="fillProgram(current, 'nabozenstwo')">
      <template #item="{ item }">
        <div v-if="item.key === sermonSlot" class="pg-extra">
          <template v-if="canEdit">
            <div class="row">
              <div><label>Mówca <span class="req">*</span></label><input v-model="current.speaker" :class="{ invalid: !current.speaker.trim() }" autocomplete="off"></div>
              <div><label>Fragment <span class="req">*</span></label><input v-model="current.passage" :class="{ invalid: !current.passage.trim() }" placeholder="np. J 3,16–21" autocomplete="off"></div>
            </div>
            <label>Tytuł kazania <span class="req">*</span></label>
            <input v-model="current.sermonTitle" :class="{ invalid: !current.sermonTitle.trim() }" autocomplete="off">
            <label>Myśli z kazania</label>
            <thoughts-editor v-model="current.thoughts"></thoughts-editor>
          </template>
          <p v-else class="pg-sermon">{{ [current.sermonTitle, current.passage, current.speaker].filter(Boolean).join(' · ') || 'Kazanie nie jest jeszcze uzupełnione.' }}</p>
        </div>
        <div v-else-if="songSlots.includes(item.key)" class="pg-extra">
          <div v-for="entry in songsIn(item.key)" :key="entry.key" class="song">
            <span class="pos"><svg class="i"><use href="#music"/></svg></span>
            <div class="meta"><b>{{ songTitle(entry) }}</b><small :class="{ missing: !inBase(entry) }">{{ firstLine(entry) }}</small></div>
            <template v-if="canEdit">
              <button class="icon" aria-label="Wyżej" @click="moveIn(item.key, entry, -1)"><svg class="i"><use href="#up"/></svg></button>
              <button class="icon" aria-label="Usuń pieśń z nabożeństwa" @click="removeSong(entry)"><svg class="i"><use href="#x"/></svg></button>
            </template>
          </div>
          <p v-if="!songsIn(item.key).length && !canEdit" class="pg-sermon">Pieśni nie są jeszcze wybrane.</p>
          <button v-if="canEdit" type="button" class="pg-addsong" @click="pickSongsFor(item.key)"><svg class="i"><use href="#plus"/></svg>Dodaj pieśń</button>
        </div>
      </template>
    </program-editor>
    <fieldset class="plain" :disabled="!canEdit">
    <!-- Bez punktu „Kazanie” w programie — pola kazania tutaj. -->
    <template v-if="!sermonSlot">
      <div class="row">
        <div><label for="speaker">Mówca <span class="req">*</span></label><input id="speaker" v-model="current.speaker" :class="{ invalid: !current.speaker.trim() }" autocomplete="off"></div>
        <div><label for="passage">Fragment <span class="req">*</span></label><input id="passage" v-model="current.passage" :class="{ invalid: !current.passage.trim() }" placeholder="np. J 3,16–21" autocomplete="off"></div>
      </div>
      <label for="title">Tytuł kazania <span class="req">*</span></label>
      <input id="title" v-model="current.sermonTitle" :class="{ invalid: !current.sermonTitle.trim() }" autocomplete="off">
      <label>Myśli z kazania</label>
      <thoughts-editor v-model="current.thoughts"></thoughts-editor>
    </template>

    <!-- Wybór pieśni (do punktu uwielbienia albo — bez takiego punktu — do całego nabożeństwa). -->
    <div v-if="songSheet" class="sheet">
      <div class="head">
        <button class="ghost" aria-label="Zamknij" @click="songSheet = false"><svg class="i"><use href="#back"/></svg></button>
        <b>Dodaj pieśń</b>
        <button class="primary" @click="songSheet = false">Gotowe</button>
      </div>
      <div class="searchbox">
        <svg class="i"><use href="#search"/></svg>
        <input v-model="query" type="search" :placeholder="`Szukaj: numer, tytuł, tekst (${songs.length})`" autocomplete="off">
      </div>
      <div class="found">
        <button v-for="song in results" :key="song.id" :class="{ chosen: chosen(song) }" :aria-pressed="!!chosen(song)" @click="addSong(song, songSheetSlot)">
          <span class="ph">{{ song.number || '♪' }}</span>
          <span class="meta"><b>{{ song.title }}</b><small>{{ lines(song.text) }}</small></span>
          <span v-if="chosen(song)" class="chosen-mark"><svg class="i"><use href="#check"/></svg>Wybrana</span>
          <svg v-else class="i"><use href="#plus"/></svg>
        </button>
      </div>
    </div>

    <!-- Pieśni wybiera się tylko w punktach „Uwielbienie” harmonogramu. -->
    <template v-if="!songSlots.length">
    <label>Pieśni <span class="req">*</span></label>
    <p class="note" style="margin-top:0">Pieśni dodaje się w harmonogramie — w punkcie „Uwielbienie”. Dodaj taki punkt (albo wstaw program z szablonu), żeby wybrać pieśni.</p>
    <div v-if="current.songs.length" class="songs">
      <div v-for="(entry, i) in current.songs" :key="entry.key" class="song">
        <span class="pos">{{ i + 1 }}</span>
        <div class="meta"><b>{{ songTitle(entry) }}</b><small :class="{ missing: !inBase(entry) }">{{ firstLine(entry) }}</small></div>
        <button class="icon" aria-label="Usuń pieśń z nabożeństwa" @click="current.songs.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
      </div>
    </div>
    </template>

    <label>Skład zespołu</label>
    <div class="band">
      <div v-for="(b, i) in current.bandList" :key="b.key" class="band-row">
        <b>{{ b.name }}</b>
        <select v-model="b.instrument" class="field" :class="{ empty: !b.instrument }" :aria-label="'Instrument — ' + b.name" :data-band="b.key">
          <option value="">Wybierz instrument…</option>
          <option v-for="x in INSTRUMENTS" :key="x" :value="x">{{ x }}</option>
          <option v-if="b.instrument && !INSTRUMENTS.includes(b.instrument)" :value="b.instrument">{{ b.instrument }}</option>
        </select>
        <button type="button" class="icon" :aria-label="'Usuń ' + b.name + ' ze składu'" title="Usuń ze składu" @click="current.bandList.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
      </div>
      <button type="button" class="songsbtn" @click="openBandPick"><svg class="i"><use href="#plus"/></svg>Dodaj osobę<svg class="i chev"><use href="#chev"/></svg></button>
    </div>
    <label for="notes">Dodatkowe informacje</label>
    <textarea id="notes" v-model="current.notes" placeholder="np. chrzest po kazaniu, błogosławieństwo dzieci, rocznica…"></textarea>
    <label>Załączniki dla rzutnika</label>
    <p class="note" style="margin-top:0">Np. prezentacja kaznodziei, PDF, zdjęcia, filmy. Rzutnik dostanie je razem z pieśniami.</p>
    <div v-for="(f, i) in current.files" :key="f.key" class="song file">
      <span class="pos">{{ KIND[f.type] || 'Plik' }}</span>
      <div class="meta"><b>{{ f.name }}</b></div>
      <button class="icon" :disabled="!!uploading" aria-label="Usuń załącznik" @click="current.files.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
    </div>
    <template v-if="uploading">
      <p class="note" style="margin-bottom:0">{{ uploading }}</p>
      <div class="progress"><i :style="{ width: Math.round(progress * 100) + '%' }"></i></div>
    </template>
    <div class="attach">
      <button :disabled="!!uploading || offline" @click="$refs.phoneFile.click()"><svg class="i"><use href="#clip"/></svg>Z urządzenia</button>
      <button :disabled="!!uploading || offline" @click="openPicker"><svg class="i"><use href="#drive"/></svg>Z Dysku Google</button>
    </div>
    <input ref="phoneFile" type="file" multiple :accept="ACCEPT" hidden @change="fromPhone">
    <p v-if="current.createdBy || current.updatedBy" class="note who">
      <template v-if="current.createdBy">Utworzył(a): {{ current.createdBy }}</template>
      <template v-if="current.updatedBy"><br>Ostatnia zmiana: {{ current.updatedBy }}<template v-if="current.updated">, {{ new Date(current.updated).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</template></template>
    </p>


    <!-- wybór pliku z Dysku Google -->
    <div v-if="picker" class="sheet">
      <div class="head">
        <button class="ghost" @click="picker = false"><svg class="i"><use href="#back"/></svg></button>
        <b>Plik z Dysku Google</b>
      </div>
      <div class="searchbox">
        <svg class="i"><use href="#search"/></svg>
        <input v-model="pickQuery" type="search" placeholder="Nazwa pliku" autocomplete="off" @input="searchSoon">
      </div>
      <div class="found">
        <p v-if="pickBusy" class="note">Szukam…</p>
        <p v-else-if="!pickFound.length" class="note">Nic nie znaleziono. Szukane są zdjęcia, filmy, PDF i prezentacje (także Prezentacje Google).</p>
        <button v-for="f in pickFound" :key="f.id" @click="fromDrive(f)">
          <img v-if="f.thumbnailLink" :src="f.thumbnailLink" alt="" referrerpolicy="no-referrer">
          <span v-else class="ph">{{ KIND[fileType(f.mimeType, f.name)] }}</span>
          <span class="meta"><b>{{ f.name }}</b><small>{{ KIND[fileType(f.mimeType, f.name)] }}<template v-if="f.modifiedTime"> · {{ new Date(f.modifiedTime).toLocaleDateString('pl') }}</template></small></span>
        </button>
      </div>
    </div>

    </fieldset>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <div v-if="canEdit" class="bar">
      <button v-if="confirmDelete" class="danger" :disabled="busy" @click="remove">Na pewno usuń</button>
      <button v-else :disabled="busy" aria-label="Usuń nabożeństwo" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
      <button class="primary" :disabled="busy || !dirty" @click="save">
        <svg v-if="!dirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : dirty ? 'Zapisz' : 'Zapisane' }}
      </button>
    </div>
    </template>
  </template>

  <!-- Strona dla gości (bez konta albo przed zatwierdzeniem): tylko „Posłuchaj — odkryj nas”. -->
  <section v-if="!ready && !booting && !embedded && (listenYt || listenSp || isChannelLink(listen.youtube))" class="public">
    <div class="section"><h2>Posłuchaj — odkryj nas</h2></div>
      <p class="listen-intro">Chciałbyś poznać bliżej to, czym żyjemy? Kazania i uwielbienie — do obejrzenia i posłuchania.</p>
      <div class="listen-grid">
        <section v-if="listenYt || isChannelLink(listen.youtube)" class="listen-card">
          <div class="lc-head"><b>YouTube</b><a v-if="listen.youtubeMore || listen.youtube" class="lc-more" :href="listen.youtubeMore || listen.youtube" target="_blank" rel="noopener">więcej</a></div>
          <p v-if="listenLatest" class="lc-title">Najnowsze: {{ listenLatest.title }}</p>
        <div v-if="listenYt" class="lc-video"><iframe :src="listenYt" title="YouTube — Kościół Na Skale" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
        </section>
        <section v-if="listenSp" class="listen-card">
          <div class="lc-head"><b>Spotify</b><a class="lc-more" :href="listen.spotify" target="_blank" rel="noopener">więcej</a></div>
          <iframe class="lc-spotify" :src="listenSp" title="Spotify — Kościół Na Skale" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </section>
      </div>
  </section>

  <!-- Strona dla gości: terminarz ASB (spotkania studenckie; bez spotkań wewnętrznych, prowadzących i notatek) -->
  <section v-if="!ready && !booting && !embedded && asbPubShown.length" id="asb-terminarz" class="public">
    <div class="section"><h2>ASB — spotkania studenckie</h2></div>
    <p class="listen-intro">Terminy, tematy i miejsca najbliższych spotkań studenckich.</p>
    <template v-for="g in asbPubGroups" :key="g.month">
      <h2 class="mn-sec">{{ g.month }}</h2>
      <div v-for="m in g.list" :key="m.id" class="asb-row" :class="['k-' + m.kind, { past: m.date < todayStr }]">
        <span class="asb-date"><small>{{ wd(m.date) }}</small><b>{{ day(m.date) }}</b><small>{{ month(m.date) }}</small></span>
        <span class="asb-body">
          <span v-if="m.kind !== 'cykliczne'" class="asb-badge">{{ asbKindName(m.kind) }}</span>
          <b>{{ m.topic || 'Spotkanie ASB' }}</b>
          <small v-if="m.time || m.place">{{ [m.time, m.place].filter(Boolean).join(' · ') }}</small>
        </span>
      </div>
    </template>
    <button v-if="!asb.pubAll && asbPubShown.length < asbPubUpcoming.length" class="ghost asb-pub-more" @click="asb.pubAll = true">Cały terminarz ({{ asbPubUpcoming.length }})</button>
  </section>

  <!-- Skład zespołu: wybór osoby ze służby muzycznej (instrument wybiera się potem w wierszu) -->
  <div v-if="bandPick.open" class="np-overlay band-pick" @click.self="bandPick.open = false">
    <div class="np-panel" role="dialog" aria-label="Dodaj osobę do składu">
      <div class="np-head"><b>Dodaj osobę do składu</b><button class="icon" aria-label="Zamknij" @click="bandPick.open = false"><svg class="i"><use href="#x"/></svg></button></div>
      <div class="searchbox"><svg class="i"><use href="#search"/></svg><input v-model="bandPick.query" type="search" placeholder="Szukaj albo wpisz imię i nazwisko" autocomplete="off" @keydown.enter="bandPickFree"></div>
      <div class="np-list">
        <div v-if="bandPick.busy" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 4" :key="n" class="skel skel-row"></div></div>
        <p v-else-if="bandPick.error" class="error">{{ bandPick.error }}</p>
        <button v-for="p in bandPickList" :key="p.id" type="button" @click="bandAdd(p.name)"><svg class="i"><use href="#user"/></svg>{{ p.name }}</button>
        <p v-if="!bandPick.busy && !bandPick.people.length && !bandPick.error" class="note">Nie znalazłem służby muzycznej z osobami (nazwa z „muzy”, „uwielb” albo „zesp”). Wpisz imię i nazwisko wyżej.</p>
        <button v-if="bandPick.query.trim() && !bandPickList.some(p => p.name.toLowerCase() === bandPick.query.trim().toLowerCase())" type="button" @click="bandPickFree"><svg class="i"><use href="#plus"/></svg>Dodaj „{{ bandPick.query.trim() }}”</button>
      </div>
    </div>
  </div>

  <!-- Dodawanie osoby do służby (lider) -->
  <div v-if="addTo" class="np-overlay" @click.self="addTo = null">
    <div class="np-panel" role="dialog" :aria-label="'Dodaj osobę: ' + addTo.name">
      <div class="np-head"><b>Dodaj do: {{ addTo.name }}</b><button class="icon" aria-label="Zamknij" @click="addTo = null"><svg class="i"><use href="#x"/></svg></button></div>
      <div class="searchbox"><svg class="i"><use href="#search"/></svg><input v-model="addQuery" type="search" placeholder="Szukaj osoby albo grupki" autocomplete="off"></div>
      <div class="np-list">
        <p v-if="!addCandidates.length" class="note">{{ addPeople.length ? 'Nikogo takiego nie ma (albo już służy).' : 'Wczytuję…' }}</p>
        <button v-for="p in addCandidates" :key="p.id" class="inbox-item" :disabled="busy" @click="addPerson(p)">
          <span class="inbox-text"><b>{{ p.name }}</b><span v-if="p.grupa">{{ p.grupa }}</span></span>
          <svg class="i"><use href="#plus"/></svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Kod QR do wydarzenia / ogłoszenia: podgląd, pobranie PNG -->
  <div v-if="qr" class="np-overlay" @click.self="qr = null">
    <div class="np-panel qr-panel" role="dialog" aria-label="Kod QR">
      <div class="np-head"><b>Kod QR</b><button class="icon" aria-label="Zamknij" @click="qr = null"><svg class="i"><use href="#x"/></svg></button></div>
      <p class="note" style="margin-top:0">{{ qr.title }} — po zeskanowaniu otworzy się {{ qr.kind === 'wydarzenie' ? 'to wydarzenie' : 'to ogłoszenie' }} (po zalogowaniu).</p>
      <img v-if="qr.png" class="qr-img" :src="qr.png" alt="Kod QR">
      <p v-else class="note">{{ qr.error || 'Przygotowuję…' }}</p>
      <small class="qr-url">{{ qr.url }}</small>
      <div class="np-foot qr-actions">
        <button @click="shareLink(qr.kind, qr.id, qr.title)"><svg class="i"><use href="#link"/></svg>Kopiuj link</button>
        <a v-if="qr.png" class="button primary" :href="qr.png" :download="qr.file"><svg class="i"><use href="#download"/></svg>Pobierz PNG</a>
      </div>
    </div>
  </div>

  <!-- Wiadomość do rang i służb (pastor, rada, administrator; lider ASB → ASB; lider służby → jego służba) -->
  <div v-if="msg.open" class="np-overlay" @click.self="msg.open = false">
    <div class="np-panel" role="dialog" aria-label="Wiadomość">
      <div class="np-head"><b>Wiadomość</b><button class="icon" aria-label="Zamknij" @click="msg.open = false"><svg class="i"><use href="#x"/></svg></button></div>
      <div class="np-list">
        <label style="margin-top:0">Do kogo</label>
        <div class="msg-targets" role="group" aria-label="Odbiorcy">
          <button v-for="r in msgRanks" :key="'r' + r.id" type="button" class="chipbtn" :class="{ on: msg.ranks.includes(r.id) }" :aria-pressed="msg.ranks.includes(r.id)" @click="msgToggle('ranks', r.id)">{{ r.name }} · {{ r.count }}</button>
          <button v-for="m in msgMinistries" :key="'m' + m.id" type="button" class="chipbtn" :class="{ on: msg.ministries.includes(m.id) }" :aria-pressed="msg.ministries.includes(m.id)" @click="msgToggle('ministries', m.id)">Służba: {{ m.name }} · {{ m.count }}</button>
        </div>
        <label for="msgTitle">Tytuł</label>
        <input id="msgTitle" v-model="msg.title" maxlength="120" placeholder="np. Modlitwa w czwartek o 19:00" autocomplete="off">
        <label for="msgBody">Treść</label>
        <textarea id="msgBody" v-model="msg.body" maxlength="340" placeholder="Co chcesz przekazać?"></textarea>
        <p class="note">Przyjdzie w aplikacji (dzwonek), a kto włączył powiadomienia — także na telefon. Na końcu dopiszę Twoje imię.</p>
        <p v-if="msg.error" class="error">{{ msg.error }}</p>
      </div>
      <div class="np-foot"><button class="primary" :disabled="msg.busy || !msg.title.trim() || !(msg.ranks.length + msg.ministries.length)" @click="sendMsg"><svg class="i"><use href="#megaphone"/></svg>{{ msg.busy ? 'Wysyłam…' : 'Wyślij' }}</button></div>
    </div>
  </div>

  <!-- ASB: edycja spotkania -->
  <div v-if="asbForm" class="np-overlay" @click.self="asbForm = null">
    <div class="np-panel" role="dialog" aria-label="Spotkanie ASB">
      <div class="np-head"><b>{{ asbForm._new ? 'Nowe spotkanie' : 'Spotkanie ASB' }}</b><button class="icon" aria-label="Zamknij" @click="asbForm = null"><svg class="i"><use href="#x"/></svg></button></div>
      <div class="np-list">
        <label style="margin-top:0">Rodzaj</label>
        <div class="asb-kind-pick" role="radiogroup" aria-label="Rodzaj spotkania">
          <button v-for="k in ASB_KINDS" :key="k.id" type="button" role="radio" :aria-checked="asbForm.kind === k.id" :class="['k-' + k.id, { on: asbForm.kind === k.id }]" @click="asbForm.kind = k.id">{{ k.name }}</button>
        </div>
        <div class="row">
          <div><label for="asDate">Data</label><input id="asDate" v-model="asbForm.date" type="date" @change="asbAutoMonth"></div>
          <div><label for="asTime">Godzina</label><input id="asTime" v-model="asbForm.time" type="time"></div>
        </div>
        <label for="asTopic">Temat</label>
        <input id="asTopic" v-model="asbForm.topic" list="asb-ideas" :placeholder="asbForm.kind === 'wewnetrzne' ? 'np. Spotkanie organizacyjne — plan semestru' : asbForm.kind === 'ewangelizacyjne' ? 'np. Pytania o wiarę na kampusie' : 'np. Czy chrześcijaństwo ma sens? Dzieje 17:16-34'" autocomplete="off">
        <datalist id="asb-ideas"><option v-for="i in asb.ideas" :key="i.id" :value="i.topic"></option></datalist>
        <div class="row">
          <div><label for="asLeader">Prowadzący</label><input id="asLeader" v-model="asbForm.leader" list="asb-names" autocomplete="off"></div>
          <div><label for="asHelper">Prowadzący pomocniczy</label><input id="asHelper" v-model="asbForm.helper" list="asb-names" autocomplete="off"></div>
        </div>
        <datalist id="asb-names"><option v-for="p in asb.people" :key="p.id" :value="p.name"></option></datalist>
        <p v-for="h in asbLeaderHints" :key="h.text" class="note asb-cal asb-hint" :class="{ bad: h.bad }"><svg class="i"><use :href="h.bad ? '#warn' : '#bell'"/></svg><span>{{ h.text }}</span></p>
        <div class="row">
          <div><label for="asPlace">Miejsce</label><input id="asPlace" v-model="asbForm.place" list="asb-places" autocomplete="off"></div>
          <div><label for="asAtt">Frekwencja</label><input id="asAtt" v-model.number="asbForm.attendance" type="number" min="0" inputmode="numeric" placeholder="—"></div>
        </div>
        <datalist id="asb-places"><option v-for="p in asbPlaces" :key="p" :value="p"></option></datalist>
        <label for="asNote">Notatka</label>
        <textarea id="asNote" v-model="asbForm.note" class="short" placeholder="Ustalenia, co przygotować, kto przynosi…"></textarea>
        <label for="asStudy">Rozważanie dla prowadzącego</label>
        <textarea id="asStudy" v-model="asbForm.study" placeholder="Fragment Biblii, myśli, pytania do dyskusji…"></textarea>
        <div class="asb-files">
          <div v-for="f in asbForm.files" :key="f.path" class="mn-person">
            <span><b>{{ f.name }}</b></span>
            <button :disabled="busy" @click="asbOpenFile(f)">Otwórz</button>
            <button class="icon" :disabled="busy" :aria-label="'Usuń załącznik ' + f.name" title="Usuń załącznik" @click="asbRemoveFile(f)"><svg class="i"><use href="#x"/></svg></button>
          </div>
          <input ref="asbFileInput" type="file" hidden @change="asbAddFile">
          <button type="button" :disabled="busy" @click="$refs.asbFileInput.click()"><svg class="i"><use href="#plus"/></svg>Załącz plik z rozważaniem</button>
        </div>
        <template v-if="asbForm.kind === 'cykliczne'">
          <label for="asConcept">Koncepcja okresu — co i po co robimy</label>
          <textarea id="asConcept" v-model="asbForm.concept" class="short"></textarea>
          <label>Integracja (opcjonalnie)</label>
          <div class="row">
            <div><input v-model="asbForm.int_idea" placeholder="Pomysł, np. Planszówki" aria-label="Pomysł na integrację" autocomplete="off"></div>
            <div><input v-model="asbForm.int_date" placeholder="Kiedy, np. 28.02" aria-label="Data integracji" autocomplete="off"></div>
          </div>
          <input v-model="asbForm.int_organizer" placeholder="Organizator" aria-label="Organizator integracji" autocomplete="off">
        </template>
        <label for="asSeason">Rok akademicki</label>
        <input id="asSeason" v-model="asbForm.season" list="asb-seasons" placeholder="2026/2027" autocomplete="off">
        <datalist id="asb-seasons"><option v-for="se in asbSeasons" :key="se" :value="se"></option></datalist>
        <p class="note asb-cal"><svg class="i"><use href="#calendar"/></svg><span>{{ asbCalNote }}</span></p>
        <p v-if="asbForm.reminded" class="note asb-cal"><svg class="i"><use href="#bell"/></svg><span>Przypomnienie wysłano {{ asbWhen(asbForm.reminded) }}.</span></p>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
      <div class="np-foot mn-foot">
        <button v-if="!asbForm._new" class="danger" :disabled="busy" @click="asbDelete">Usuń</button>
        <button :disabled="busy || !asbForm.season.trim() || !asbForm.date" title="Powiadomienie w aplikacji dla wszystkich z rangą ASB" @click="asbRemind"><svg class="i"><use href="#bell"/></svg>Przypomnij</button>
        <button class="primary" :disabled="busy || !asbForm.season.trim()" @click="asbSave">Zapisz</button>
      </div>
    </div>
  </div>

  <!-- Powiadomienia w aplikacji (zawsze włączone; telefon i e-mail — dodatkowo, w ustawieniach) -->
  <div v-if="inboxOpen" class="np-overlay" @click.self="inboxOpen = false">
    <div class="np-panel" role="dialog" aria-label="Powiadomienia">
      <div class="np-head"><b>Powiadomienia</b><button class="icon" aria-label="Zamknij" @click="inboxOpen = false"><svg class="i"><use href="#x"/></svg></button></div>
      <div class="np-list">
        <p v-if="!inbox.length" class="note">Nie masz powiadomień. Tutaj pojawią się zgłoszenia do zatwierdzenia, zgłoszenia do służby i wiadomości od liderów.</p>
        <button v-for="n in inbox" :key="n.id" class="inbox-item" :class="{ unread: !n.read }" @click="openNotice(n)">
          <span class="inbox-dot"></span>
          <span class="inbox-text"><b>{{ n.title }}</b><span v-if="n.body">{{ n.body }}</span></span>
          <small>{{ agoText(n.created) }}</small>
        </button>
      </div>
      <div v-if="unread" class="np-foot"><button class="ghost" @click="readAll">Oznacz wszystkie jako przeczytane</button></div>
    </div>
  </div>

  <!-- Służba: edycja (administrator — wszystko; lider — opis i „szukamy chętnych”) -->
  <div v-if="mEdit" class="np-overlay" @click.self="mEdit = null">
    <div class="np-panel" role="dialog" aria-label="Służba">
      <div class="np-head"><b>{{ mEdit.isNew ? 'Nowa służba' : mEdit.name }}</b><button class="icon" aria-label="Zamknij" @click="mEdit = null"><svg class="i"><use href="#x"/></svg></button></div>
      <div class="np-list">
        <template v-if="mEdit.full">
          <label for="mnName" style="margin-top:0">Nazwa <span class="req">*</span></label>
          <input id="mnName" v-model="mEdit.name" placeholder="np. Zespół uwielbienia" autocomplete="off">
        </template>
        <label for="mnDesc">Opis</label>
        <textarea id="mnDesc" v-model="mEdit.description" placeholder="Czym się zajmujecie, kogo szukacie, ile czasu to zajmuje"></textarea>
        <label class="check"><input v-model="mEdit.seeking" type="checkbox">Szukamy nowych chętnych</label>
        <template v-if="mEdit.full">
          <label>Liderzy (akceptują zgłoszenia) — osoby z rangą Lider</label>
          <p v-if="!memberNames.length" class="note" style="margin-top:0">Nikt nie ma jeszcze rangi Lider — nadaj ją w Więcej → Osoby.</p>
          <div class="notify-groups"><button v-for="p in memberNames" :key="p.id" type="button" class="chipbtn" :class="{ on: mEdit.leaders.includes(p.id) }" @click="toggleLeader(p.id)">{{ p.name }}</button></div>
        </template>
      </div>
      <div class="np-foot mn-foot">
        <button v-if="mEdit.full && !mEdit.isNew" class="danger" :disabled="busy" @click="deleteMinistry">Usuń</button>
        <button class="primary" :disabled="busy || (mEdit.full && !mEdit.name.trim())" @click="saveMinistry">Zapisz</button>
      </div>
    </div>
  </div>

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
  <nav v-if="showTabs" class="tabbar" aria-label="Części aplikacji">
    <button :class="{ on: !calView && !moreView && !songView && !peopleView && !serveView && !profileView }" :aria-current="!calView && !moreView && !songView && !peopleView && !serveView ? 'page' : null" @click="showServices"><svg class="i"><use href="#church"/></svg>Start</button>
    <button :class="{ on: calView }" :aria-current="calView ? 'page' : null" @click="openCalendar"><svg class="i"><use href="#calendar"/></svg>Kalendarz</button>
    <button :class="{ on: serveView }" :aria-current="serveView ? 'page' : null" @click="openServe"><svg class="i"><use href="#serve"/></svg>Zaangażuj się</button>
    <button :class="{ on: moreView || songView || peopleView }" :aria-current="moreView || songView || peopleView ? 'page' : null" @click="openMore"><svg class="i"><use href="#menu"/></svg>Więcej<span v-if="canManage && pendingCount" class="count">{{ pendingCount }}</span></button>
  </nav>
</template>
