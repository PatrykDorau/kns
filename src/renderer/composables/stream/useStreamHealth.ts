// Stan transmisji w trakcie: wysyłanie (z wykresem z ostatniej minuty), opóźnienie/tempo, klatki, internet,
// ocena YouTube, dźwięk, wznowienia — i jedna podpowiedź przy najważniejszym problemie.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { settings } from '@/stores'
import { studio } from '@/services/studio'
import { HEALTH, type YouTube } from './useYouTube'
import type { Broadcast } from './useBroadcast'
import type { StreamDevices } from './useStreamDevices'

export interface HealthChip { id: string; label: string; value: string; cls: string; tip?: string }

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
    let alert: { cls: string; text: string } | null = null
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

  return { online, rateHistory, sparkPoints, sparkTarget, liveBc, health }
}
