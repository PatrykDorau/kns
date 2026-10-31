// Presety plansz i nakładek (Odliczanie, Koniec, Baner, Modlitwa): tworzone w zakładce „Przygotowanie”, w „Studio” tylko
// wybierane. Wybrany preset trafia do ustawień, z których rysuje podgląd — na wizję idzie dopiero przyciskiem „Na wizję”.
import { settings, uid } from '@/stores'
import type { Preset, PresetKind } from '@/types'
import { BANNER_DEFAULT, CD_DEFAULT, END_DEFAULT, prayerLook } from './cards'
import { H, W, studio } from './state'
import { onAirPreset, previewOverlay, setEndOverlay, setPrayer } from './look'
import { drawPreset } from './scenes'

export const PRESET_KINDS: [PresetKind, string, string][] = [
  ['cd', 'Odliczanie', 'Plansza przed nabożeństwem'],
  ['end', 'Koniec', 'Plansza po nabożeństwie'],
  ['banner', 'Baner', 'Napis i kod QR na obrazie'],
  ['prayer', 'Modlitwa', 'Spokojny napis na czas modlitwy'],
]
const copy = x => JSON.parse(JSON.stringify(x))
const BLANK_PRAYER = { text: 'Zachęcamy do modlitwy', sub: '', link: '', label: '' }

// bieżący wygląd z ustawień (nowy preset, przeniesienie dotychczasowych ustawień)
function readLook(kind: PresetKind) {
  if (kind === 'cd') return copy({ ...CD_DEFAULT, ...(settings.cdLook || {}) })
  if (kind === 'end') return copy({ ...END_DEFAULT, ...(settings.endLook || {}) })
  if (kind === 'prayer') return copy({ ...BLANK_PRAYER, ...JSON.parse(JSON.stringify(prayerLook(), (k, v) => (v === undefined || v === '' ? undefined : v))) })
  return { banner: copy({ ...BANNER_DEFAULT, ...(settings.banner || {}) }), queue: [], cycle: false, sec: 10 }
}
function writeLook(kind: PresetKind, data) {
  const d = copy(data)
  if (kind === 'cd') settings.cdLook = { ...CD_DEFAULT, ...d }
  else if (kind === 'end') settings.endLook = { ...END_DEFAULT, ...d }
  else if (kind === 'prayer') Object.assign(settings, { prayerText: d.text, prayerSub: d.sub, prayerLink: d.link, prayerLinkLabel: d.label })
  else Object.assign(settings, { banner: { ...BANNER_DEFAULT, ...d.banner }, bannerQueue: d.queue, bannerCycle: d.cycle, bannerSec: d.sec })
}

// Dotychczasowe ustawienia stają się pierwszymi presetami — nic nie ginie, a Studio od razu ma co pokazać.
export function ensurePresets() {
  if (!settings.studioPresets) settings.studioPresets = []
  if (!settings.presetOn) settings.presetOn = {}
  for (const [kind, name] of PRESET_KINDS) {
    if (settings.studioPresets.some(p => p.kind === kind)) continue
    const first: Preset = { id: uid(), kind, name, desc: '', data: readLook(kind) }
    settings.studioPresets.push(first)
    settings.presetOn[kind] = first.id
    if (kind === 'banner' && settings.bannerQueue?.length) settings.studioPresets.push({ id: uid(), kind, name: 'Kolejka banerów', desc: 'Banery w kółko', data: { ...readLook(kind), queue: copy(settings.bannerQueue), cycle: !!settings.bannerCycle, sec: +settings.bannerSec || 10 } })
  }
}
export const presetsOf = (kind: PresetKind) => (settings.studioPresets || []).filter(p => p.kind === kind)
export const blankPreset = (kind: PresetKind): Preset => ({
  id: uid(), kind, name: 'Nowy preset', desc: '',
  data: kind === 'cd' ? { ...CD_DEFAULT } : kind === 'end' ? { ...END_DEFAULT } : kind === 'prayer' ? { ...BLANK_PRAYER } : { banner: { ...BANNER_DEFAULT }, queue: [], cycle: false, sec: 10 },
})

// Studio: kliknięty preset — na podgląd (przy „Od razu na wizję” — też na wizję)
export function pickPreset(p: Preset) {
  writeLook(p.kind, p.data)
  settings.presetOn = { ...settings.presetOn, [p.kind]: p.id }
  if (p.kind === 'banner') previewOverlay('endOvl', true)
  if (p.kind === 'prayer') previewOverlay('prayer', true)
  if (studio.direct) { sendOverlay(p.kind); onAirPreset(p.kind) }
}
// nakładka na wizję — sama, reszta wizji bez zmian
export function sendOverlay(kind: PresetKind) {
  if (kind === 'banner') setEndOverlay(true)
  if (kind === 'prayer') setPrayer(true)
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
