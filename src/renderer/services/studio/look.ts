// Podgląd → wizja: zmiany (scena, pasek mówcy, okienko, materiały) najpierw na podglądzie, na wizję po „Na wizję”
// (z przenikaniem) — chyba że włączone „Od razu na wizję”.
import { itemById, settings } from '@/stores'
import type { Look } from '@/types'
import { studio } from './state'
import { CD_DEFAULT, END_DEFAULT, LOWER_DEFAULT, bannerSet } from './cards'

// Bieżący wygląd plansz z ustawień (kopia) — wizja dostaje go przy „Na wizję”, podgląd zawsze rysuje z ustawień.
const copy = x => (x == null ? x : JSON.parse(JSON.stringify(x)))
export const liveStyles = () => ({ cd: { ...CD_DEFAULT, ...copy(settings.cdLook || {}) }, end: { ...END_DEFAULT, ...copy(settings.endLook || {}) } }) // plansze; nakładki działają od razu
// wygląd planszy liczy się tylko, gdy ta plansza jest na podglądzie albo na wizji — inaczej nie ma czego wysyłać
const sameStyles = (a, b) => {
  const x = a.styles || liveStyles(), y = b.styles || liveStyles(), shown = scene => a.scene === scene || b.scene === scene
  return (!shown('countdown') || JSON.stringify(x.cd) === JSON.stringify(y.cd)) && (!shown('end') || JSON.stringify(x.end) === JSON.stringify(y.end))
}
// przejście na wizji: poprzedni wygląd znika przez pół sekundy
export const fade: { from: Look | null; at: number } = { from: null, at: 0 }
const snap = l => ({ ...l, pip: { ...l.pip }, mpos: { ...l.mpos }, styles: l.styles ? copy(l.styles) : l.styles })
const same = (a, b) => a.scene === b.scene && a.lowerThird === b.lowerThird && a.pip.corner === b.pip.corner && a.pip.size === b.pip.size && !!a.pip.on === !!b.pip.on
  && !!a.endOvl === !!b.endOvl && !!a.prayer === !!b.prayer && sameStyles(a, b) && a.media === b.media && a.omedia === b.omedia && a.ovl === b.ovl && a.mpos.corner === b.mpos.corner && a.mpos.size === b.mpos.size
export const differs = () => !same(studio.preview, studio.program) || bannerPending() || prayerPending() || lowerPending()
export function toProgram(fn) {
  const before = snap(studio.program)
  fn(studio.program)
  if (studio.program.lowerThird && !before.lowerThird) studio.program.lowerAt = performance.now()
  if (!studio.program.lowerThird && before.lowerThird) studio.program.lowerOff = performance.now()
  // sam pasek mówcy wjeżdża/wyjeżdża — bez przenikania całego obrazu
  const swapped = JSON.stringify(before.banner?.list) !== JSON.stringify(studio.program.banner?.list) || JSON.stringify(before.prayerLook) !== JSON.stringify(studio.program.prayerLook)
  if (swapped || !same({ ...before, lowerThird: studio.program.lowerThird }, studio.program)) { fade.from = before; fade.at = performance.now() }
}
// Zmiana idzie na podgląd; przy „Od razu na wizję” — też na wizję.
export function change(fn) {
  fn(studio.preview)
  if (studio.preview.lowerThird) studio.preview.lowerAt = studio.preview.lowerAt || performance.now()
  if (studio.direct) toProgram(fn)
}
export function setScene(id) { change(l => { l.scene = id }) }
// Nakładki (pasek mówcy, modlitwa, baner, napis na cały kadr) — od razu na wizji i podglądzie (pulpit pyta wcześniej
// o potwierdzenie); wyłączenie — od razu. PIP (kamera, materiał w rogu) — najpierw na podgląd, na wizję przyciskiem
// „Na wizję” przy PIP (albo całym „Na wizję”); wyłączenie PIP — od razu z wizji i podglądu.
function both(fn) { fn(studio.preview); toProgram(fn) }
// wyjazd tylko tam, gdzie pasek był — schowanie z samego podglądu nie gra animacji na wizji
const lt = v => l => { if (v) l.lowerAt = performance.now(); else if (l.lowerThird) l.lowerOff = performance.now(); l.lowerThird = v }
export function setLowerThird(v: boolean) {
  both(lt(v))
  if (v) { studio.program.lowerLook = lowerSet(); onAirPreset('lower') }
}
// pasek mówcy: wizja dostaje kopię z chwili wysłania
const lowerSet = () => JSON.parse(JSON.stringify({ ...LOWER_DEFAULT, ...(settings.lowerLook || {}) }))
export const lowerPending = () => !!studio.program.lowerThird && JSON.stringify(studio.program.lowerLook || null) !== JSON.stringify(lowerSet())
// tylko podgląd — nakładka czeka na potwierdzenie (ustawienia widać pod paskiem nakładek)
export function previewOverlay(key: 'lowerThird' | 'prayer' | 'endOvl', v: boolean) { change(key === 'lowerThird' ? lt(v) : l => { l[key] = v }) }
export function clearPreviewMedia() { change(l => { l.ovl = 'off' }) }
export function toggleLyrics() { const on = !studio.program.lyricsOn; studio.preview.lyricsOn = on; studio.program.lyricsOn = on }
// modlitwa: wizja dostaje kopię napisów z chwili wysłania
const prayerSet = () => ({ style: settings.prayerStyle, head: settings.prayerHead, text: settings.prayerText, sub: settings.prayerSub, link: settings.prayerLink, label: settings.prayerLinkLabel })
// który preset poszedł na wizję (kafelek „Na wizji”)
export const onAirPreset = (...kinds: string[]) => { for (const k of kinds) studio.airPreset[k] = settings.presetOn?.[k] || '' }
export function setPrayer(v: boolean) {
  studio.preview.prayer = v
  toProgram(l => { l.prayer = v; l.prayerLook = v ? prayerSet() : null })
  if (v) onAirPreset('prayer')
}
export const prayerPending = () => !!studio.program.prayer && JSON.stringify(studio.program.prayerLook || null) !== JSON.stringify(prayerSet())
// baner: wizja dostaje kopię ustawień z chwili wysłania (kolejne zmiany — najpierw na podglądzie, potem bannerToProgram)
// „at”: kolejka na wizji zawsze rusza od pierwszego banera
const bannerCopy = () => ({ ...copy(bannerSet()), at: performance.now() })
export function setEndOverlay(v: boolean) { studio.preview.endOvl = v; toProgram(l => { l.endOvl = v; l.banner = v ? bannerCopy() : null }); if (v) onAirPreset('banner') }
export function bannerToProgram() { if (studio.program.endOvl) studio.program.banner = bannerCopy() }
// czy baner na wizji różni się od ustawień (zmiany czekają na podglądzie)
export const bannerPending = () => { const b = studio.program.banner; return !!studio.program.endOvl && JSON.stringify(b ? { list: b.list, sec: b.sec } : null) !== JSON.stringify(bannerSet()) }
export function setPip(p) { if (p.on === false) both(l => { l.pip = { ...l.pip, on: false } }); else change(l => { l.pip = { ...l.pip, ...p } }) }
// PIP z podglądu na wizję (tylko PIP — reszta wizji bez zmian)
export function pipToProgram() { const p = { ...studio.preview.pip }; toProgram(l => { l.pip = p }) }
export function mediaPipToProgram() { const { omedia, ovl } = studio.preview, mpos = { ...studio.preview.mpos }; toProgram(l => { l.omedia = omedia; l.ovl = ovl; l.mpos = mpos }) }
// „Na wizję”: podgląd przechodzi na wizję (przenikanie), podgląd zostaje bez zmian.
// (napisy mają jeden przełącznik dla podglądu i wizji — „Na wizję” ich nie zmienia)
export function take() { const p = snap(studio.preview); toProgram(l => { Object.assign(l, { scene: p.scene, lowerThird: p.lowerThird, lowerLook: p.lowerThird ? lowerSet() : l.lowerLook, endOvl: p.endOvl, banner: p.endOvl ? bannerCopy() : null, prayer: p.prayer, prayerLook: p.prayer ? prayerSet() : null, styles: studio.direct ? null : liveStyles(), pip: p.pip, media: p.media, omedia: p.omedia, ovl: p.ovl, mpos: p.mpos }) }); onAirPreset('cd', 'end', 'banner', 'prayer', 'lower') }
export function setDirect(v) { studio.direct = !!v; if (v) take(); else studio.program.styles = liveStyles() }
// Wygląd na start (zapamiętane okienko): ten sam na podglądzie i wizji.
export function initLook(pip) { for (const l of [studio.preview, studio.program]) l.pip = { ...l.pip, ...pip }; studio.program.styles = studio.direct ? null : liveStyles() }
// Wybór materiału — jak inne zmiany: najpierw podgląd, na wizję po „Na wizję”.
// „Na ekran”: scena Media z tym materiałem. „Nakładka”: ten materiał na kamerze/rzutniku (napis — na cały kadr, reszta — w rogu).
export function showMediaFull(id) { change(l => { l.media = id; l.scene = 'media' }) }
// live — napis na cały kadr od razu na wizji (po potwierdzeniu na pulpicie); bez — PIP w rogu na podgląd
export function showMediaOverlay(id, live = false) {
  const it = itemById(id), mode = it?.type === 'text' ? 'full' : 'corner'
  const fn = l => { l.omedia = id; l.ovl = mode }
  if (live) { fn(studio.preview); if (studio.preview.scene === 'media') change(l => { l.scene = 'camera' }); toProgram(fn) }
  else change(l => { fn(l); if (l.scene === 'media') l.scene = 'camera' })
}
export function setOverlayMode(mode) { if (mode === 'off') both(l => { l.ovl = 'off' }); else change(l => { l.ovl = mode }) }
export function setMediaPos(p) { change(l => { l.mpos = { ...l.mpos, ...p } }) }
