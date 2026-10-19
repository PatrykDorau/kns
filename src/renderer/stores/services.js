// Nabożeństwa: daty, odliczanie, braki, tworzenie, łączenie, załączniki, wczytanie na rzutnik, przenoszenie.
import { computed, ref } from 'vue'
import { flash } from './display'
import { addFiles, addPassage, dropFile, loadBible } from './library'
import { serviceList } from './lists'
import { verses } from './live'
import { plainCopy } from './persist'
import { BAZA, api, busy, items, selectedId, serviceModal, services, settings, shared, songs, tab, uid } from './state'
import { sharedAccount, synced } from './sync'

/* ---------- nabożeństwa ---------- */
export const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const today = () => localDate(new Date())
// Najbliższa niedziela (dzisiejsza też się liczy).
export const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return localDate(d) }
// Informacje, bez których nabożeństwo nie jest gotowe (opcjonalny jest tylko skład zespołu).
export const REQUIRED = [['sermonTitle', 'tytułu kazania'], ['passage', 'fragmentu'], ['speaker', 'mówcy']]
export const missingInfo = svc => [
  ...REQUIRED.filter(([key]) => !String(svc[key] || '').trim()).map(([, name]) => name),
  ...(svc.songs?.length ? [] : ['pieśni']),
]
// Alarm: na najbliższą niedzielę nie ma nabożeństwa albo brakuje w nim wymaganych informacji.
export const planAlert = computed(() => {
  const date = nextSunday()
  const service = services.value.find(s => s.date === date) || null
  if (!service) return { date, service: null, text: `Nie ma nabożeństwa na niedzielę ${prettyDate(date).replace(/^niedziela, /, '')}.` }
  const missing = missingInfo(service)
  return missing.length ? { date, service, text: `Nabożeństwo na niedzielę nie ma: ${missing.join(', ')}.` } : null
})
// Godzina i miejsce: każde nabożeństwo ma je zapisane, a domyślnie zawsze 12:12 w Hotelu Forza.
export const DEFAULT_TIME = '12:12'
export const DEFAULT_PLACE = 'Hotel Forza'
export const serviceTime = svc => svc?.time || DEFAULT_TIME
export const servicePlace = svc => svc?.place || DEFAULT_PLACE
export const startsAt = svc => new Date(svc.date + 'T' + serviceTime(svc)).getTime()

export const RUNS = 3 * 3600e3 // tyle trwa nabożeństwo „w trakcie”
// Początek najbliższego nabożeństwa (także trwającego) — zegar co pół minuty wystarcza, a rzutnik nie dostaje zmian co sekundę.
export const nowCoarse = ref(Date.now())
export const nextServiceStart = computed(() => services.value
  .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date || '')).map(startsAt).filter(t => t + RUNS > nowCoarse.value).sort((a, b) => a - b)[0] || 0)

// Odliczanie do najbliższego nabożeństwa; przez 3 godziny od rozpoczęcia — „w trakcie”, potem do następnego.
export const now = ref(Date.now())
export const countdown = computed(() => {
  const next = services.value.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date || '') && startsAt(s) + RUNS > now.value)
    .sort((a, b) => startsAt(a) - startsAt(b))[0]
  if (!next) return null
  const left = Math.max(0, startsAt(next) - now.value)
  const sec = Math.floor(left / 1000)
  return {
    service: next, live: left === 0,
    days: Math.floor(sec / 86400), hours: Math.floor(sec / 3600) % 24, minutes: Math.floor(sec / 60) % 60, seconds: sec % 60,
    when: prettyDate(next.date) + ', ' + serviceTime(next), place: servicePlace(next),
  }
})
// „dziś”, „jutro”, „za 4 dni”, „wczoraj”, „3 dni temu” — przy nabożeństwach na listach.
export function relDay(date) {
  const days = Math.round((new Date(date + 'T12:00') - new Date(today() + 'T12:00')) / 86400000)
  if (days === 0) return 'dziś'
  if (days === 1) return 'jutro'
  if (days === -1) return 'wczoraj'
  return days > 0 ? `za ${days} dni` : `${-days} dni temu`
}
export const prettyDate = date => (date ? new Date(date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'bez daty')
export const sortedServices = computed(() => [...services.value].sort((a, b) => b.date.localeCompare(a.date)))
// Najbliższe nabożeństwo: dzisiejsze lub pierwsze przyszłe, a gdy takich nie ma — ostatnie.
export const nearestService = computed(() => {
  const upcoming = sortedServices.value.filter(s => s.date >= today())
  return upcoming.at(-1) || sortedServices.value[0] || null
})
export const activeService = computed(() => services.value.find(s => s.id === settings.activeService) || null)

// Potwierdzenie: nabożeństwo na najbliższą niedzielę istnieje i ma komplet wymaganych informacji.
export const planReady = computed(() => {
  if (planAlert.value) return null
  const service = services.value.find(s => s.date === nextSunday())
  return service ? { service, text: `Nabożeństwo na niedzielę ${prettyDate(service.date).replace(/^niedziela, /, '')} jest gotowe.` } : null
})

// Kto zmienia nabożeństwa na tym komputerze: konto Google, a bez niego użytkownik Windows i nazwa komputera.
export const computerUser = ref('')
export const me = () => sharedAccount.value?.email || computerUser.value || 'ten komputer'

// Na jeden dzień jest jedno nabożeństwo: „nowe” na zajęty dzień otwiera istniejące.
export function newService(date = today(), add = true) {
  const existing = services.value.find(s => s.date === date)
  if (existing) return existing
  const svc = { id: uid(), date, time: DEFAULT_TIME, place: DEFAULT_PLACE, sermonTitle: '', passage: '', speaker: '', band: '', notes: '', songs: [], files: [], createdBy: me() }
  if (add) services.value.push(svc)
  return svc
}

// Dwa nabożeństwa na ten sam dzień (np. utworzone niezależnie na komputerze i na telefonie) są łączone:
// zostaje nowsze, puste pola uzupełnia drugie, pieśni i załączniki są sumowane, a drugie znika wszędzie.
// Wybór jest taki sam na każdym komputerze, więc łączenie w kilku miejscach naraz daje ten sam wynik.
export function mergeSameDay() {
  const byDate = new Map()
  for (const svc of services.value) byDate.set(svc.date, [...(byDate.get(svc.date) || []), svc])
  let merged = 0
  for (const group of byDate.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => (b.updated || 0) - (a.updated || 0) || (a.id < b.id ? -1 : 1))
    const [keep, ...rest] = group
    for (const other of rest) {
      for (const key of ['sermonTitle', 'passage', 'speaker', 'band', 'notes', 'createdBy']) {
        if (!String(keep[key] || '').trim() && String(other[key] || '').trim()) keep[key] = other[key]
      }
      const sameSong = e => x => x.title === e.title && (x.number || '') === (e.number || '')
      for (const e of other.songs) if (!keep.songs.some(sameSong(e))) keep.songs.push(e)
      for (const f of other.files) if (!keep.files.some(x => x.name === f.name)) keep.files.push(f)
      if (settings.activeService === other.id) settings.activeService = keep.id
      services.value.splice(services.value.indexOf(other), 1)
      synced.delete(other.id)
      if (other.shared && settings.sharedDir) shared(settings.sharedDir).sharedRemove(settings.sharedDir, other.id)
      merged++
    }
  }
  if (merged) flash(merged === 1 ? 'Połączono dwa nabożeństwa z tego samego dnia.' : `Połączono nabożeństwa z tych samych dni (${merged}).`)
}
export function removeService(svc) {
  services.value.splice(services.value.indexOf(svc), 1)
  if (svc.shared && settings.sharedDir) shared(settings.sharedDir).sharedRemove(settings.sharedDir, svc.id)
  else for (const f of svc.files) dropFile(f.path)
  synced.delete(svc.id)
}
export async function attachToService(svc) {
  const paths = await api.pickFiles()
  if (!paths.length) return
  busy.value = 'Dodaję załącznik…'
  try {
    // 'all' — do biblioteki aplikacji trafia też sam PDF lub prezentacja, żeby załącznik nie zależał od pendrive'a.
    const files = await api.importFiles(paths, 'all')
    svc.files.push(...files.map(f => ({ key: uid(), path: f.path, name: f.name, type: f.type })))
  } finally {
    busy.value = ''
  }
}
export function detachFromService(svc, i) {
  const [f] = svc.files.splice(i, 1)
  dropFile(f.path)
}

// Rzutnik: lista pieśni i załączniki nabożeństwa trafiają do panelu wyświetlania.
// parts — co wczytać: pieśni (zastępują listę), załączniki (trafiają do materiałów) albo jedno i drugie.
export async function applyService(svc, parts = { songs: true, files: true }) {
  if (parts.songs) settings.service = svc.songs.filter(e => songs.value.some(x => x.id === e.songId)).map(e => ({ key: uid(), songId: e.songId }))
  settings.activeService = svc.id
  const files = parts.files ? svc.files : []
  // Przy logowaniu do Dysku Google załączniki pobierane są dopiero teraz, gdy są potrzebne.
  if ((settings.sharedDir === 'google' || settings.sharedDir === BAZA) && files.length) {
    busy.value = 'Pobieram załączniki z Dysku Google…'
    const got = await api.sharedEnsure(files.map(f => f.path))
    busy.value = ''
    if (got.error) flash(got.error)
  }
  for (const f of files) {
    const source = svc.id + ':' + f.key
    if (items.value.some(i => i.source === source)) continue // już wczytane wcześniej
    const before = items.value.length
    await addFiles([f.path])
    for (const it of items.value.slice(before)) it.source = source
  }
  // Fragment Biblii z nabożeństwa — gdy jest wczytana Biblia, trafia do materiałów jako pętla.
  let verses = false
  if (parts.files && svc.passage?.trim() && await loadBible() && !items.value.some(i => i.source === svc.id + ':bible')) {
    verses = !addPassage(svc.passage, 2, svc.id + ':bible').error
  }
  tab.value = parts.songs ? 'songs' : 'materials'
  if (parts.songs) selectedId.value = serviceList.value[0]?.song.id ?? selectedId.value
  serviceModal.value = false
  const missing = parts.songs ? svc.songs.length - settings.service.length : 0
  const what = [parts.songs && `pieśni ${settings.service.length}`, parts.files && `załączników ${files.length}`, verses && `fragment ${svc.passage}`].filter(Boolean).join(', ')
  flash(`Wczytano z nabożeństwa: ${what}.` + (missing ? ` Brak w bazie: ${missing}.` : ''))
}

// Nabożeństwo wędruje między komputerami razem z tekstami pieśni, bo każdy komputer ma własną
// bazę (i własne identyfikatory pieśni). Przy odbiorze pieśni są dopasowywane po numerze i tytule,
// a brakujące dopisywane do tutejszej bazy.
export function servicePayload(svc) {
  const copy = plainCopy(svc)
  const texts = copy.songs.map(e => songs.value.find(x => x.id === e.songId)).filter(Boolean).map(({ number, title, text }) => ({ number, title, text }))
  return { service: copy, songs: texts }
}
export function adoptService({ service, songs: texts }, id) {
  const entries = []
  for (const e of service.songs || []) {
    const same = x => x.title === e.title && (x.number || '') === (e.number || '')
    let own = songs.value.find(same)
    const text = (texts || []).find(same)
    if (!own && text) { own = { id: uid(), type: 'song', ...text }; songs.value.push(own) }
    entries.push({ key: e.key || uid(), songId: own?.id ?? null, title: e.title, number: e.number || '' })
  }
  return { band: '', notes: '', files: [], ...service, id, songs: entries }
}

// Ręczne przeniesienie: nabożeństwo jako folder (np. na pendrivie).
export const exportService = svc => api.exportService(servicePayload(svc))
export async function importService() {
  const res = await api.importService()
  if (!res.payload) return res
  const svc = adoptService(res.payload, uid())
  services.value.push(svc)
  return { service: svc }
}
