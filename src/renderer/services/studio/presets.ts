// Presety plansz i nakładek (Odliczanie, Koniec, Baner, Modlitwa): tworzone w zakładce „Przygotowanie”, w „Studio” tylko
// wybierane. Wybrany preset trafia do ustawień, z których rysuje podgląd — na wizję idzie dopiero przyciskiem „Na wizję”.
import { settings, uid } from '@/stores'
import type { Preset, PresetKind } from '@/types'
import { BANNER_DEFAULT, CD_DEFAULT, END_DEFAULT, LOWER_DEFAULT, prayerLook } from './cards'
import { H, W, studio } from './state'
import { onAirPreset, previewOverlay, setEndOverlay, setLowerThird, setPrayer } from './look'
import { drawPreset } from './scenes'

export const PRESET_KINDS: [PresetKind, string, string][] = [
  ['cd', 'Odliczanie', 'Plansza przed nabożeństwem'],
  ['end', 'Koniec', 'Plansza po nabożeństwie'],
  ['banner', 'Baner', 'Napis i kod QR na obrazie'],
  ['prayer', 'Modlitwa', 'Spokojny napis na czas modlitwy'],
  ['lower', 'Pasek mówcy', 'Imię i podpis u dołu obrazu'],
]
const copy = x => JSON.parse(JSON.stringify(x))
const BLANK_PRAYER = { style: 'rock', head: 'CZAS MODLITWY', text: 'Zachęcamy do modlitwy', sub: '', link: '', label: 'Prośby modlitewne' }

// bieżący wygląd z ustawień (nowy preset, przeniesienie dotychczasowych ustawień)
function readLook(kind: PresetKind) {
  if (kind === 'cd') return copy({ ...CD_DEFAULT, ...(settings.cdLook || {}) })
  if (kind === 'end') return copy({ ...END_DEFAULT, ...(settings.endLook || {}) })
  if (kind === 'lower') return copy({ ...LOWER_DEFAULT, ...(settings.lowerLook || {}) })
  if (kind === 'prayer') return copy({ ...BLANK_PRAYER, ...copy(prayerLook()) })
  return { banner: copy({ ...BANNER_DEFAULT, ...(settings.banner || {}) }), queue: [], cycle: false, sec: 10 }
}
function writeLook(kind: PresetKind, data) {
  const d = copy(data)
  if (kind === 'cd') settings.cdLook = { ...CD_DEFAULT, ...d }
  else if (kind === 'end') settings.endLook = { ...END_DEFAULT, ...d }
  else if (kind === 'lower') settings.lowerLook = { ...LOWER_DEFAULT, ...d }
  else if (kind === 'prayer') Object.assign(settings, { prayerStyle: d.style, prayerHead: d.head, prayerText: d.text, prayerSub: d.sub, prayerLink: d.link, prayerLinkLabel: d.label })
  else Object.assign(settings, { banner: { ...BANNER_DEFAULT, ...d.banner }, bannerQueue: d.queue, bannerCycle: d.cycle, bannerSec: d.sec })
}

// Gotowe presety: namalowana góra z kreską, chropowate napisy.
const starter = (kind: PresetKind, name: string, desc: string, data): Preset => ({ id: uid(), kind, name, desc, data })
const banner = (title: string, sub: string, qr: string) => ({ banner: { ...BANNER_DEFAULT, title, sub, qr }, queue: [], cycle: false, sec: 10 })
const STARTERS = (): Preset[] => [
  starter('cd', 'Szczyt', 'Zegar z ogłoszeniami, góra się rysuje', { ...CD_DEFAULT }),
  starter('cd', 'Noc', 'Spokojnie, na wieczorne spotkania', { ...CD_DEFAULT, bg: 'noc' }),
  starter('cd', 'Świt', 'Duży zegar na środku', { ...CD_DEFAULT, bg: 'swit', layout: 'center', timer: 'plain' }),
  starter('end', 'Podziękowanie', 'Napis i kody QR', { ...END_DEFAULT }),
  starter('end', 'Żar', 'Mocne zakończenie', { ...END_DEFAULT, bg: 'zar' }),
  starter('banner', 'Podziękowanie', 'Wszystkie kody QR', banner('Dziękujemy, że byliście z nami!', BANNER_DEFAULT.sub, 'all')),
  starter('banner', 'Wsparcie', 'Przelew i BLIK', banner('Buduj razem z nami', 'Twoje wsparcie ma znaczenie', 'bank')),
  starter('banner', 'YouTube', 'Zaproszenie na kanał', banner('Subskrybuj nasz kanał', 'Kazania i transmisje co tydzień', 'youtube')),
  starter('banner', 'Podcast', 'Kazania na Spotify', banner('Słuchaj kazań w drodze', 'Kazania jako podcast na Spotify', 'spotify')),
]
// Czyste presety: kremowe plansze z elegancką typografią i linią gór
const CLEAN_STARTERS = (): Preset[] => [
  starter('cd', 'Krem', 'Czysto, niebieska typografia', { ...CD_DEFAULT, bg: 'krem', layout: 'edit', title: 'Zaczynamy za', done: 'Zaraz zaczynamy' }),
  starter('cd', 'Piasek', 'Czysto, ciepłe kolory', { ...CD_DEFAULT, bg: 'piasek', layout: 'edit', title: 'Zaczynamy za', done: 'Zaraz zaczynamy' }),
  starter('cd', 'Uwielbienie', 'Czarno-żółty, na wieczory', { ...CD_DEFAULT, bg: 'czern', layout: 'edit', title: 'Wieczór uwielbienia', done: 'Zaraz zaczynamy' }),
  starter('end', 'Krem', 'Czysto, kody QR obok', { ...END_DEFAULT, bg: 'krem', layout: 'edit', title: 'Dziękujemy, że byliście z nami' }),
  starter('end', 'Piasek', 'Czysto, ciepłe kolory', { ...END_DEFAULT, bg: 'piasek', layout: 'edit', title: 'Do zobaczenia' }),
  starter('banner', 'Czysty', 'Kremowy pas', { banner: { ...BANNER_DEFAULT, style: 'edit', color: '#1a2a9a' }, queue: [], cycle: false, sec: 10 }),
  starter('prayer', 'Czysty', 'Kremowy pas', { ...BLANK_PRAYER, style: 'edit' }),
  starter('lower', 'Czysty', 'Kremowa plakietka', { ...LOWER_DEFAULT, style: 'edit' }),
]
// Stare presety: puste pola znaczyły „z nabożeństwa” — teraz pusto znaczy pusto, więc dostają wpisane pola.
function upgrade(p: Preset) {
  const d = p.data, empty = (o, k, v) => { if (!o[k]) o[k] = v }
  if (p.kind === 'end') empty(d, 'sub', END_DEFAULT.sub)
  if (p.kind === 'lower') { empty(d, 'name', LOWER_DEFAULT.name); empty(d, 'sub', LOWER_DEFAULT.sub) }
  if (p.kind === 'prayer') { empty(d, 'head', BLANK_PRAYER.head); empty(d, 'text', BLANK_PRAYER.text); empty(d, 'label', BLANK_PRAYER.label) }
  if (p.kind === 'banner') for (const b of [d.banner, ...(d.queue || [])]) { empty(b, 'sub', BANNER_DEFAULT.sub); empty(b, 'note', '{opis kodu}') }
}
// Dotychczasowe ustawienia stają się pierwszymi presetami — nic nie ginie, a Studio od razu ma co pokazać.
export function ensurePresets() {
  if (!settings.studioPresets) settings.studioPresets = []
  if (!settings.presetOn) settings.presetOn = {}
  if ((settings.presetsV || 0) < 2) {
    settings.presetsV = 2
    settings.studioPresets.forEach(upgrade)
    const fresh = STARTERS()
    settings.studioPresets.unshift(...fresh)
    for (const p of fresh) if (fresh.find(x => x.kind === p.kind) === p) { settings.presetOn[p.kind] = p.id; writeLook(p.kind, p.data) }
  }
  if (settings.presetsV < 3) { settings.presetsV = 3; settings.studioPresets.push(...CLEAN_STARTERS()) }
  for (const [kind, name] of PRESET_KINDS) {
    if (settings.studioPresets.some(p => p.kind === kind)) continue
    const first: Preset = { id: uid(), kind, name: kind === 'lower' ? 'Z nabożeństwa' : name, desc: kind === 'lower' ? 'Mówca i kazanie z planu' : '', data: readLook(kind) }
    settings.studioPresets.push(first)
    settings.presetOn[kind] = first.id
    if (kind === 'banner' && settings.bannerQueue?.length) settings.studioPresets.push({ id: uid(), kind, name: 'Kolejka banerów', desc: 'Banery w kółko', data: { ...readLook(kind), queue: copy(settings.bannerQueue), cycle: !!settings.bannerCycle, sec: +settings.bannerSec || 10 } })
  }
}
export const presetsOf = (kind: PresetKind) => (settings.studioPresets || []).filter(p => p.kind === kind)
export const blankPreset = (kind: PresetKind): Preset => ({
  id: uid(), kind, name: 'Nowy preset', desc: '',
  data: kind === 'cd' ? { ...CD_DEFAULT } : kind === 'end' ? { ...END_DEFAULT } : kind === 'prayer' ? { ...BLANK_PRAYER } : kind === 'lower' ? { ...LOWER_DEFAULT } : { banner: { ...BANNER_DEFAULT }, queue: [], cycle: false, sec: 10 },
})

// Studio: kliknięty preset — na podgląd (przy „Od razu na wizję” — też na wizję)
export function pickPreset(p: Preset) {
  writeLook(p.kind, p.data)
  if (p.kind === 'banner') studio.bannerPv = 0
  settings.presetOn = { ...settings.presetOn, [p.kind]: p.id }
  if (p.kind === 'banner') previewOverlay('endOvl', true)
  if (p.kind === 'prayer') previewOverlay('prayer', true)
  if (p.kind === 'lower') previewOverlay('lowerThird', true)
  if (studio.direct) { sendOverlay(p.kind); onAirPreset(p.kind) }
}
export function stepBanner(d: number) { studio.bannerPv += d }
// nakładka na wizję — sama, reszta wizji bez zmian
export function sendOverlay(kind: PresetKind) {
  if (kind === 'banner') setEndOverlay(true)
  if (kind === 'prayer') setPrayer(true)
  if (kind === 'lower') setLowerThird(true)
}
// Przygotowanie: zmiany wybranego presetu od razu widać na podglądzie w Studio (wizja stoi na swojej kopii)
export function presetEdited(p: Preset) { if (settings.presetOn?.[p.kind] === p.id && !studio.direct) writeLook(p.kind, p.data) }
export function dropPreset(p: Preset) {
  settings.studioPresets = settings.studioPresets.filter(x => x.id !== p.id)
  if (settings.presetOn?.[p.kind] === p.id) settings.presetOn = { ...settings.presetOn, [p.kind]: '' }
}

// Miniatura presetu (kafelek w Studio), 480×270.
export function presetThumb(p: Preset) {
  const c = document.createElement('canvas'); c.width = 480; c.height = 270
  const ctx = c.getContext('2d'); ctx.scale(480 / W, 270 / H)
  try { drawPreset(ctx, p.kind, p.data, 4000) } catch { /* bez miniatury */ }
  return c.toDataURL('image/jpeg', 0.85)
}
