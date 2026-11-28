// Stan transmisji w trakcie: wysyłanie (z wykresem z ostatniej minuty), opóźnienie/tempo, klatki, internet,
// ocena YouTube, dźwięk, wznowienia — i jedna podpowiedź przy najważniejszym problemie.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { settings } from '@/stores'
import { gpuName, studio } from '@/services/studio'

// karta, na której naprawdę działa aplikacja (raz — WebGL) — w podpowiedziach przy zgubionych klatkach
let gpuCache: string | null = null
const onGpu = () => { if (gpuCache == null) gpuCache = gpuName(); return gpuCache ? ' Aplikacja działa teraz na: ' + gpuCache + (/intel|uhd|iris/i.test(gpuCache) ? ' (zintegrowana) — w „Jakości” przełącz na NVIDIA.' : '.') : '' }
import { HEALTH, type YouTube } from './useYouTube'
import type { Broadcast } from './useBroadcast'
import type { StreamDevices } from './useStreamDevices'

export interface HealthChip { id: string; label: string; value: string; cls: string; tip?: string; reasons?: { label: string; n: number; hint: string }[] }

// ikonki komórek paska (ścieżki SVG 24×24)
export const DH_ICON = {
  rate: ['M12 19V5', 'm5 12 7-7 7 7'],
  lag: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  fps: ['M4 6h16v12H4z', 'M8 6v12', 'M16 6v12'],
  net: ['M2 9a15 15 0 0 1 20 0', 'M5 12.5a10 10 0 0 1 14 0', 'M8.5 16a5 5 0 0 1 7 0', 'M12 19.5h.01'],
  yt: ['M3 8.5C3 6.6 4.6 5 6.5 5h11C19.4 5 21 6.6 21 8.5v7c0 1.9-1.6 3.5-3.5 3.5h-11C4.6 19 3 17.4 3 15.5Z', 'm10 9 5 3-5 3Z'],
  audio: ['M11 5 6 9H3v6h3l5 4Z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
  rs: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
}

export function useStreamHealth(youtube: YouTube, bc: Broadcast, dev: StreamDevices) {
  const { yt } = youtube
  const { live, liveOn, liveBroadcast, kbps } = bc
  const { engine } = dev

  const online = ref(navigator.onLine)
  let lostLog: { s: number, n: number }[] = [] // zgubione klatki co sekundę transmisji (do „ostatniej minuty”); bez reaktywności — tylko pamięć licznika
  const onNet = () => { online.value = navigator.onLine }
  window.addEventListener('online', onNet); window.addEventListener('offline', onNet)
  onBeforeUnmount(() => { window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet) })

  const kbpsNow = computed(() => parseFloat(String(live.value.bitrate || '').replace(',', '.')) || 0)
  // przepływność z ostatnich 60 s (wykres)
  const rateHistory = ref<number[]>([])
  watch(() => live.value.time, () => { if (!liveOn.value) { rateHistory.value = []; return } rateHistory.value = [...rateHistory.value, kbpsNow.value].slice(-60) })
  const sparkMax = computed(() => Math.max(kbps.value * 1.3, ...rateHistory.value, 1))
  const sparkPoints = computed(() => {
    const h = rateHistory.value
    return h.map((v, i) => (i / Math.max(1, h.length - 1)) * 60 + ',' + (19 - (v / sparkMax.value) * 17).toFixed(1)).join(' ')
  })
  const sparkTarget = computed(() => (19 - (kbps.value / sparkMax.value) * 17).toFixed(1)) // przerywana linia: cel

  const liveBc = computed(() => (yt.value.broadcasts || []).find(b => b.id === liveBroadcast.value?.id) || (yt.value.broadcasts || []).find(b => b.status === 'live') || null)
  // transmisja, którą lista YouTube już pokazała (świeżo utworzona może się jeszcze nie pojawić)
  const seenId = ref('')
  watch(() => yt.value.broadcasts, list => { const id = liveBroadcast.value?.id; if (id && list?.some(b => b.id === id)) seenId.value = id })
  const health = computed(() => {
    const L = live.value, chips: HealthChip[] = [], target = kbps.value
    const rateRatio = target ? kbpsNow.value / target : 1
    const slow = engine.value === 'studio' ? (L.backlog || 0) > 2 : (parseFloat(L.speed) || 1) < 0.95
    // wysyłanie
    chips.push({ id: 'rate', label: 'Wysyłanie', value: kbpsNow.value ? (kbpsNow.value / 1000).toLocaleString('pl', { maximumFractionDigits: 1 }) + ' Mb/s' : '—',
      cls: !kbpsNow.value ? '' : rateRatio < 0.6 ? 'bad' : rateRatio < 0.85 ? 'warn' : 'ok', tip: 'Ile danych idzie teraz do YouTube (cel: ' + (target / 1000).toLocaleString('pl') + ' Mb/s). Przy obrazie bez ruchu bywa mniej — to normalne.' })
    // zaległość (studio) albo tempo (tryb prosty)
    if (engine.value === 'studio') chips.push({ id: 'lag', label: 'Opóźnienie wysyłania', value: (L.backlog || 0).toLocaleString('pl') + ' s', cls: (L.backlog || 0) > 5 ? 'bad' : (L.backlog || 0) > 2 ? 'warn' : 'ok', tip: 'Ile obrazu czeka na wysłanie. Rośnie, gdy internet nie nadąża.' })
    else chips.push({ id: 'lag', label: 'Tempo', value: L.speed || '—', cls: slow ? 'warn' : 'ok', tip: 'Poniżej 1x — komputer albo internet nie nadąża.' })
    // klatki
    const ff = engine.value === 'studio' && (settings.streamEncoder || 'gpu') !== 'gpu'
    const reasons = engine.value === 'studio' ? [
      { label: 'Komputer nie zdążył narysować klatki', n: studio.late, hint: 'Procesor albo karta zajęte czymś innym (inne programy, przeglądarka). Zamknij zbędne programy; laptop podłącz do zasilania (na baterii zwalnia).' + onGpu() },
      { label: ff ? 'Kopiowanie obrazu z karty nie nadąża' : 'Karta nie nadąża z kodowaniem', n: studio.skipped, hint: (ff ? 'Odczyt obrazu z karty nie nadąża — spróbuj kodera „Karta graficzna — przez przeglądarkę”, 30 kl./s albo 720p.' : 'Koder karty ma kolejkę — pomaga 30 kl./s albo 720p.') + onGpu() },
      { label: ff ? 'FFmpeg (koder albo internet) nie nadąża' : 'Internet nie nadąża — pominięte przed wysłaniem', n: L.skipped || 0, hint: ff ? 'Koder nie wyrabia albo wysyłanie stoi — sprawdź „Opóźnienie wysyłania”.' : 'Zmniejsz przepływność w „Jakości”.' },
      { label: 'Pominięte przez FFmpeg', n: L.drop || 0, hint: '' },
    ] : [{ label: 'Pominięte przez FFmpeg (komputer albo internet)', n: L.drop || 0, hint: '' }]
    const lost = reasons.reduce((a, r) => a + r.n, 0)
    // procent: wobec klatek, które powinny wyjść (czas × klatki na sekundę) — z ostatniej minuty i od startu
    const fpsSet = +settings.streamFps || 30
    const secs = String(L.time || '').split(':').reduce((t, x) => t * 60 + (+x || 0), 0), expected = secs * fpsSet
    const lostPct = expected ? Math.min(100, (lost / expected) * 100) : 0
    lostLog = [...lostLog.filter(p => p.s > secs - 61 && p.s <= secs), { s: secs, n: lost }].slice(-70)
    const first = lostLog[0], span = secs - first.s
    const minutePct = span >= 5 ? Math.min(100, ((lost - first.n) / (span * fpsSet)) * 100) : lostPct
    const pct = (x: number) => x.toLocaleString('pl', { maximumFractionDigits: x < 1 ? 2 : 1 })
    chips.push({ id: 'fps', label: 'Klatki', value: (L.fps || 0) + '/s · ' + pct(minutePct) + '% zgub.', cls: minutePct > 5 ? 'bad' : minutePct > 1 ? 'warn' : 'ok',
      tip: 'Zgubione w ostatniej minucie: ' + pct(minutePct) + '%; od startu: ' + pct(lostPct) + '% (' + lost + ' klatek). Do 1% niezauważalne.', reasons: reasons.filter(r => r.n > 0) })
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
    let alert: { cls: string; text: string } | null = null
    // trwająca transmisja zniknęła z listy YouTube — wysyłamy obraz w próżnię
    if (liveOn.value && seenId.value && seenId.value === liveBroadcast.value?.id && !(yt.value.broadcasts || []).some(b => b.id === seenId.value)) alert = { cls: 'bad', text: 'YouTube zakończył tę transmisję — widzowie nie dostają już obrazu. Zakończ i uruchom nową.' }
    else if (!online.value) alert = { cls: 'bad', text: 'Brak internetu w komputerze. Transmisja wznowi się sama, gdy wróci połączenie — nawet po dłuższej przerwie (obraz z tego czasu przepadnie).' }
    else if (L.error) alert = { cls: 'bad', text: L.error }
    else if (L.stalled) alert = { cls: 'bad', text: 'Od kilku sekund nic nie wychodzi do YouTube — sprawdź internet. Aplikacja próbuje dalej.' }
    else if ((L.backlog || 0) > 5) alert = { cls: 'bad', text: 'Internet nie nadąża (opóźnienie ' + L.backlog.toLocaleString('pl') + ' s). Zmniejsz przepływność albo jakość w „Ustawieniach nadawania” przy następnym starcie; przy dużym zatkaniu aplikacja pomija klatki, żeby wrócić na bieżąco.' }
    else if (slow) alert = { cls: 'warn', text: 'Wysyłanie zwalnia — internet albo komputer na granicy możliwości.' }
    else if (st && st.status === 'active' && st.health === 'bad') alert = { cls: 'warn', text: 'YouTube ocenia sygnał jako słaby' + ((st.issues || []).length ? ': ' + st.issues.map(i => i.text || i.reason).join(' · ') : '.') }
    else if (engine.value === 'studio' && settings.studioAudio && studio.silentFor > 10) alert = { cls: 'warn', text: 'Od ' + studio.silentFor + ' s nie ma dźwięku — sprawdź mikser (ATEM) i kabel USB.' }
    else if (engine.value === 'studio' && live.value.running && studio.paintMs > 800 / (+settings.streamFps || 30)) alert = { cls: 'warn', text: 'Komputer ledwo nadąża z rysowaniem obrazu (' + studio.paintMs.toLocaleString('pl') + ' ms na klatkę, limit ' + Math.round(1000 / (+settings.streamFps || 30)) + ' ms) — zamknij inne programy; pomaga też scena bez ruchomego tła.' }
    else if (engine.value === 'studio' && studio.skipped > 50 && live.value.running) alert = { cls: 'warn', text: 'Karta graficzna nie nadąża z kodowaniem' + (settings.streamQuality !== '720' ? ' — po tej transmisji ustaw 720p' : +settings.streamFps > 30 ? ' — po tej transmisji ustaw 30 kl./s' : ' — zamknij inne programy') + ' (Ustawienia nadawania → Jakość → „Sprawdź”).' }
    const level = chips.some(c => c.cls === 'bad') || alert?.cls === 'bad' ? 'bad' : chips.some(c => c.cls === 'warn') || alert ? 'warn' : L.running ? 'ok' : 'wait'
    const title = { bad: 'Problem z transmisją', warn: 'Uwaga', ok: 'Transmisja stabilna', wait: 'Łączę z YouTube…' }[level]
    return { chips: chips.filter(c => c.id !== 'view'), alert, level, title } // widzowie — w podsumowaniu
  })

  return { online, rateHistory, sparkPoints, sparkTarget, liveBc, health }
}
