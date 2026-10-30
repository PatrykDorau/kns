// Zapis na dysk, start aplikacji (init) i wysyłanie tego, co „na żywo”, do okna rzutnika.
import { computed, ref, watch } from 'vue'
import { connectSharedDir, findSharedDir, refreshAccess } from './access'
import { setDisplays, stepBy, toggleHidden } from './display'
import { visibleItems } from './lists'
import { label, liveItem, liveView, loopPlaying, loopStep, lyricsNow, lyricsParts, streamPart, verses } from './live'
import { computerUser, mergeSameDay, now, nowCoarse } from './services'
import { BAZA, api, appUpdate, busy, cloud, confirmId, frozen, frozenAt, hidden, items, liveId, liveNonce, liveStart, liveStep, loaded, notice, output, previewIndex, remoteUrl, selectedId, services, settings, songIndex, songs, uid, video, volume } from './state'
import { SYNC_EVERY, markSynced, mergeTwinSongs, pushSoon, sharedAccount, songsChanged, syncIfStale, syncShared } from './sync'
import { projectorGraphics, purgeOldTrash, syncAnnouncements } from './library'

/* ---------- zapis ---------- */
// Przez IPC przechodzą tylko zwykłe obiekty, nie reaktywne — stąd kopia przez JSON.
export const plainCopy = data => JSON.parse(JSON.stringify(data))
export const savers = {
  library: () => api.saveStore('library', plainCopy(items.value.map(({ missing, webMax, ...rest }) => rest))),
  songs: () => api.saveStore('songs', plainCopy(songs.value)),
  settings: () => api.saveStore('settings', plainCopy(settings)),
  services: () => api.saveStore('services', plainCopy(services.value)),
}
export const timers = {}
export function saveSoon(name) {
  if (!loaded.value) return
  clearTimeout(timers[name])
  timers[name] = setTimeout(() => { delete timers[name]; savers[name]() }, 500)
}
// Zapisuje od razu wszystko, co czeka — przed kopią zapasową.
export async function flush() {
  for (const name of Object.keys(timers)) { clearTimeout(timers[name]); delete timers[name]; await savers[name]() }
}

export function migrate(it) {
  if (it.type !== 'scene') return it
  const { itemIds, ...rest } = it
  return {
    volume: 0.25, transition: 'fade', fadeMs: 350, ...rest,
    name: (it.name || '').replace(/^Scena( \d+)?$/, 'Pętla$1'),
    entries: it.entries || (itemIds || []).map(ref => ({ key: uid(), ref, seconds: null })),
  }
}

export let started = false
export async function init() {
  if (started) return
  started = true
  api.onDisplays(setDisplays)
  api.onOutputState(state => {
    output.value = state
    if (!state.open) hidden.value = frozen.value = false
    if (!state.open && !state.waiting) liveId.value = null
  })
  api.onVideoState(state => { video.value = state })
  api.onPptxProgress(p => { busy.value = `${p.name}: slajd ${p.done} z ${p.count}…` })
  api.updateState().then(s => { appUpdate.value = s })
  api.onUpdate(s => { appUpdate.value = { ...appUpdate.value, ...s } })
  api.onRemoteCmd(cmd => (cmd === 'hide' ? toggleHidden() : stepBy(cmd === 'next' ? 1 : -1, true)))
  wire()
  setInterval(() => { now.value = Date.now() }, 1000)
  setInterval(() => { nowCoarse.value = Date.now() }, 30000)
  setDisplays(await api.getDisplays())

  const saved = await api.loadStore('settings')
  if (saved) Object.assign(settings, saved, { songStyle: { ...settings.songStyle, ...saved.songStyle } })
  if (!settings.remoteToken) settings.remoteToken = uid()
  if (!settings.lyricsKey) settings.lyricsKey = uid() + uid() + uid()
  if (!settings.deviceId) settings.deviceId = uid() + uid() // ten komputer na liście rzutników
  items.value = ((await api.loadStore('library')) || []).map(migrate)
  // Rzutnik i Stream mają od teraz osobne biblioteki: napisy dodane w Stream (wygląd napisu z paska Streamu) przechodzą do Streamu,
  // reszta zostaje w Rzutniku.
  if (!settings.libSplit) {
    for (const it of items.value) if (it.type === 'text' && !it.hidden && it.fs === 9 && it.valign === 'bottom' && it.shadow && !it.countMode) it.lib = 'stream'
    settings.libSplit = true
  }
  syncAnnouncements()
  watch(projectorGraphics, syncAnnouncements)
  purgeOldTrash()
  songs.value = (await api.loadStore('songs')) || []
  services.value = (await api.loadStore('services')) || []
  computerUser.value = await api.userName()
  mergeTwinSongs()
  mergeSameDay()
  // Układ folderu wspólnego się zmienił (podfoldery „nabozenstwa” i „piesni”) — nabożeństwa z tego
  // komputera zostaną zapisane od nowa w nowym miejscu zamiast zniknąć jako „usunięte gdzie indziej”.
  if (settings.sharedLayout !== 2) {
    for (const svc of services.value) delete svc.shared
    settings.sharedLayout = 2
  }
  selectedId.value = visibleItems.value[0]?.id ?? null
  loaded.value = true

  watch(items, () => saveSoon('library'), { deep: true })
  watch(songs, () => { saveSoon('songs'); songsChanged() }, { deep: true })
  watch(services, () => { saveSoon('services'); pushSoon() }, { deep: true })
  // Komputery połączone dotąd z Dyskiem Google (albo folderem) przechodzą na bazę danych — tam są teraz nabożeństwa i pieśni.
  if (cloud && settings.sharedDir !== BAZA) connectSharedDir(BAZA)
  refreshAccess()
  findSharedDir()
  watch(() => settings.sharedDir, async dir => {
    sharedAccount.value = null
    syncShared()
    const account = dir === BAZA ? null : dir ? await api.sharedAccount(dir) : null
    if (settings.sharedDir === dir) sharedAccount.value = account
  }, { immediate: true })
  setInterval(() => { markSynced(); syncShared() }, SYNC_EVERY)
  // Powrót do okna: synchronizacja, a bez połączonego folderu — ponowne szukanie go (np. po dodaniu skrótu).
  window.addEventListener('focus', () => (settings.sharedDir ? syncIfStale() : findSharedDir()))
  watch(settings, () => saveSoon('settings'), { deep: true })
  // Napisy przez internet: bieżąca zwrotka pieśni (puste przy „Ukryj” i gdy nie ma pieśni); co 15 s powtórka,
  // żeby odbiorca nadrobił zgubioną wiadomość.
  const lyricsText = lyricsNow
  const lyricsOut = () => { if (!frozen.value) cloud?.lyrics(settings.lyricsOnline ? settings.lyricsKey : '', lyricsText.value) }
  watch([lyricsText, frozen, () => settings.lyricsOnline, () => settings.lyricsKey], lyricsOut, { immediate: true })
  setInterval(() => { if (settings.lyricsOnline) lyricsOut() }, 15000)
  watch(() => settings.remote, async on => {
    const res = await api.setRemote(on, settings.remoteToken)
    remoteUrl.value = res.url || ''
    if (res.error) { notice.value = 'Pilot: ' + res.error; settings.remote = false }
  }, { immediate: true })
}

// Każda zmiana tego, co jest „na żywo”, od razu trafia na rzutnik.
export const livePayload = computed(() => {
  if (!liveView.value) return null
  const { missing, ...rest } = liveView.value
  return JSON.stringify({ ...rest, nonce: liveNonce.value, startAt: liveStart.value, startStep: liveStep.value })
})
// Podpinane dopiero w init(): ten moduł ładuje też okno rzutnika, a ono nie może nic wysyłać.
export function wire() {
  const send = json => api.show(json ? { ...JSON.parse(json), volume: volume.value } : null)
  watch(livePayload, json => { if (!frozen.value) send(json) })
  watch(frozen, on => {
    frozenAt.value = on ? { id: liveId.value, index: songIndex.value, step: video.value.step || 0 } : null
    api.videoCmd({ type: 'freeze', value: on })
    if (!on) send(livePayload.value) // po odmrożeniu rzutnik dogania to, co zmieniło się w międzyczasie
  })
  watch(hidden, on => api.videoCmd({ type: 'blank', value: on }))
  watch([liveId, songIndex, liveNonce], () => { streamPart.value = 0 })
  let partTimer = 0
  watch([lyricsParts, streamPart, () => settings.streamPartMode, () => settings.streamLineSec, frozen], () => {
    clearTimeout(partTimer)
    const parts = lyricsParts.value
    if (settings.streamPartMode !== 'auto' || frozen.value || streamPart.value >= parts.length - 1) return
    const lines = parts[streamPart.value].split('\n').length
    partTimer = window.setTimeout(() => { if (streamPart.value < lyricsParts.value.length - 1) streamPart.value++ }, lines * Math.max(1, +settings.streamLineSec || 4) * 1000)
  })
  watch(liveId, id => { if (!id) hidden.value = frozen.value = false })
  watch([liveId, liveNonce], () => { video.value = { time: 0, duration: 0, paused: true, step: liveStep.value } })
  watch(selectedId, () => { previewIndex.value = 0; confirmId.value = null; loopStep.value = 0; loopPlaying.value = false })
  watch(volume, v => api.videoCmd({ type: 'volume', value: v }))
  watch(() => (liveItem.value?.type === 'scene' ? liveItem.value.volume : null), v => { if (v != null) volume.value = v })
  watch(() => {
    const it = liveItem.value
    if (!it) return 'Nic nie jest wyświetlane'
    if (hidden.value) return 'Ukryte: ' + label(it)
    return label(it) + (it.type === 'song' ? ` — ${songIndex.value + 1} / ${verses(it).length}` : '')
  }, title => api.remoteState({ title }), { immediate: true })
}
