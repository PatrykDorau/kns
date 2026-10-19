// Podgląd → wizja: zmiany (scena, pasek mówcy, okienko, materiały) najpierw na podglądzie, na wizję po „Na wizję”
// (z przenikaniem) — chyba że włączone „Od razu na wizję”.
import { itemById } from '@/stores'
import type { Look } from '@/types'
import { studio } from './state'

// przejście na wizji: poprzedni wygląd znika przez pół sekundy
export const fade: { from: Look | null; at: number } = { from: null, at: 0 }
const snap = l => ({ ...l, pip: { ...l.pip }, mpos: { ...l.mpos } })
const same = (a, b) => a.scene === b.scene && a.lowerThird === b.lowerThird && a.pip.corner === b.pip.corner && a.pip.size === b.pip.size && !!a.pip.on === !!b.pip.on
  && a.media === b.media && a.omedia === b.omedia && a.ovl === b.ovl && a.mpos.corner === b.mpos.corner && a.mpos.size === b.mpos.size
export const differs = () => !same(studio.preview, studio.program)
export function toProgram(fn) {
  const before = snap(studio.program)
  fn(studio.program)
  if (studio.program.lowerThird && !before.lowerThird) studio.program.lowerAt = performance.now()
  if (!studio.program.lowerThird && before.lowerThird) studio.program.lowerOff = performance.now()
  // sam pasek mówcy wjeżdża/wyjeżdża — bez przenikania całego obrazu
  if (!same({ ...before, lowerThird: studio.program.lowerThird }, studio.program)) { fade.from = before; fade.at = performance.now() }
}
// Zmiana idzie na podgląd; przy „Od razu na wizję” — też na wizję.
export function change(fn) {
  fn(studio.preview)
  if (studio.preview.lowerThird) studio.preview.lowerAt = studio.preview.lowerAt || performance.now()
  if (studio.direct) toProgram(fn)
}
export function setScene(id) { change(l => { l.scene = id }) }
export function toggleLowerThird() { change(l => { l.lowerThird = !l.lowerThird; l[l.lowerThird ? 'lowerAt' : 'lowerOff'] = performance.now() }) }
export function toggleLyrics() { const on = !studio.program.lyricsOn; studio.preview.lyricsOn = on; studio.program.lyricsOn = on }
export function setPip(p) { change(l => { l.pip = { ...l.pip, ...p } }) }
// „Na wizję”: podgląd przechodzi na wizję (przenikanie), podgląd zostaje bez zmian.
// (napisy mają jeden przełącznik dla podglądu i wizji — „Na wizję” ich nie zmienia)
export function take() { const p = snap(studio.preview); toProgram(l => { Object.assign(l, { scene: p.scene, lowerThird: p.lowerThird, pip: p.pip, media: p.media, omedia: p.omedia, ovl: p.ovl, mpos: p.mpos }) }) }
export function setDirect(v) { studio.direct = !!v; if (v) take() }
// Wygląd na start (zapamiętane okienko): ten sam na podglądzie i wizji.
export function initLook(pip) { for (const l of [studio.preview, studio.program]) l.pip = { ...l.pip, ...pip } }
// Wybór materiału — jak inne zmiany: najpierw podgląd, na wizję po „Na wizję”.
// „Na ekran”: scena Media z tym materiałem. „Nakładka”: ten materiał na kamerze/rzutniku (napis — na cały kadr, reszta — w rogu).
export function showMediaFull(id) { change(l => { l.media = id; l.scene = 'media' }) }
export function showMediaOverlay(id) {
  const it = itemById(id)
  change(l => { l.omedia = id; if (l.ovl === 'off') l.ovl = it?.type === 'text' ? 'full' : 'corner'; if (l.scene === 'media') l.scene = 'camera' })
}
export function setOverlayMode(mode) { change(l => { l.ovl = mode }) }
export function setMediaPos(p) { change(l => { l.mpos = { ...l.mpos, ...p } }) }
