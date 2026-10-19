// YouTube: kanał, stały klucz transmisji ze stanem sygnału, zaplanowane transmisje z tytułem i opisem z nabożeństwa.
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { api, prettyDate, servicePlace, serviceTime, settings } from '@/stores'
import type { Service, YtBroadcast, YtOverview } from '@/types'

export const B_STATUS = { created: 'Zaplanowana', ready: 'Gotowa — czeka na obraz', testStarting: 'Test…', testing: 'Test', liveStarting: 'Startuje…', live: 'NA ŻYWO' }
export const PRIVACY = { public: 'publiczna', unlisted: 'niepubliczna', private: 'prywatna' }
export const HEALTH = { good: 'dobry', ok: 'w porządku', bad: 'słaby', noData: 'brak danych' }

// Tytuł i opis transmisji z nabożeństwa (jak dotychczasowe filmy: „Tytuł | Fragment | Mówca”).
export const ytTitle = (svc: Service) => [svc.sermonTitle, svc.passage, svc.speaker].map(x => (x || '').trim()).filter(Boolean).join(' | ') || 'Nabożeństwo ' + new Date(svc.date + 'T12:00').toLocaleDateString('pl')
export function ytDescription(svc: Service) {
  const lines = [`Nabożeństwo Kościoła Na Skale — ${prettyDate(svc.date)}, ${serviceTime(svc)}, ${servicePlace(svc)}.`]
  if (svc.sermonTitle || svc.passage) lines.push('', 'Kazanie: ' + [svc.sermonTitle, svc.passage && `(${svc.passage})`].filter(Boolean).join(' ') + (svc.speaker ? ' — ' + svc.speaker : ''))
  if (svc.songs?.length) lines.push('', 'Pieśni:', ...svc.songs.map((e, i) => `${i + 1}. ${e.title}`))
  if (svc.band) lines.push('', 'Zespół: ' + svc.band)
  return lines.join('\n')
}
const ytStart = (svc: Service) => new Date(`${svc.date}T${serviceTime(svc)}`).toISOString()
export const when = (b: YtBroadcast) => (b.start ? new Date(b.start).toLocaleString('pl', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export function useYouTube(service: Ref<Service | null>) {
  const yt = ref<YtOverview>({ loggedIn: false })
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
      if (st.loggedIn) ytTimer = window.setInterval(loadYt, 30000)
      return
    }
    ytError.value = ''
    yt.value = res
    clearInterval(ytTimer)
    if (res.loggedIn) ytTimer = window.setInterval(loadYt, 15000) // stan sygnału i transmisji
  }
  async function ytDo(job: () => Promise<any>) {
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
  async function copy(name: string, text: string) { await navigator.clipboard.writeText(text); copied.value = name; setTimeout(() => { if (copied.value === name) copied.value = '' }, 1500) }

  // Transmisja na wybrane nabożeństwo: ta, która startuje tego dnia. YouTube planuje tylko przyszłe transmisje.
  const serviceStarted = computed(() => !!service.value && new Date(`${service.value.date}T${serviceTime(service.value)}`).getTime() < Date.now() + 60000)
  const forService = computed(() => (service.value && yt.value.broadcasts || []).find(b => b.start?.slice(0, 10) === service.value.date) || null)
  const privacy = ref(settings.ytPrivacy || 'public')
  watch(privacy, v => { settings.ytPrivacy = v })
  async function createForService() {
    const svc = service.value
    if (!svc) return
    await ytDo(() => api.ytCreate({ title: ytTitle(svc), description: ytDescription(svc), start: ytStart(svc), privacy: privacy.value }))
  }
  async function refreshFromService(b: YtBroadcast) {
    const svc = service.value
    if (svc) await ytDo(() => api.ytUpdate({ id: b.id, title: ytTitle(svc), description: ytDescription(svc), start: ytStart(svc), privacy: b.privacy }))
  }
  async function endBroadcast(b: YtBroadcast) { if (confirm('Zakończyć transmisję „' + b.title + '”? Widzowie zobaczą jej koniec.')) await ytDo(() => api.ytEnd(b.id)) }

  // Którą transmisję wystartować: zaplanowaną (też z YouTube Studio) albo nową z wybranego nabożeństwa.
  const upcoming = computed(() => (yt.value.broadcasts || []).filter(b => ['created', 'ready', 'testStarting', 'testing', 'liveStarting', 'live'].includes(b.status)))
  const chosenId = ref('')
  watch(upcoming, list => {
    if (chosenId.value === 'new' ? false : list.some(b => b.id === chosenId.value)) return
    chosenId.value = (forService.value || list[0])?.id || 'new'
  }, { immediate: true })
  const chosen = computed(() => upcoming.value.find(b => b.id === chosenId.value) || null)
  const newTitle = computed(() => (service.value ? ytTitle(service.value) : 'Transmisja na żywo — Kościół Na Skale ' + new Date().toLocaleDateString('pl')))
  const nextTitle = computed(() => chosen.value?.title || newTitle.value)

  const signal = computed(() => {
    const s = yt.value.stream
    if (!s) return { text: '', cls: '' }
    if (s.status !== 'active') return { text: 'brak sygnału', cls: 'idle' }
    return { text: 'sygnał ' + (HEALTH[s.health] || s.health), cls: s.health === 'bad' ? 'bad' : 'ok' }
  })

  onMounted(loadYt)
  onBeforeUnmount(() => clearInterval(ytTimer))

  return {
    yt, ytBusy, ytError, showKey, copied, loadYt, ytDo, ytLogin, ytLogout, copy,
    serviceStarted, forService, privacy, createForService, refreshFromService, endBroadcast,
    upcoming, chosenId, chosen, newTitle, nextTitle, signal,
  }
}
export type YouTube = ReturnType<typeof useYouTube>
