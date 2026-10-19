// Pętla rysowania: co klatkę wizja (pełna rozdzielczość — to idzie na YouTube) z przenikaniem po „Na wizję”,
// co drugą — podgląd w połowie rozdzielczości (słabszy komputer); klatka wizji idzie do kodera.
// Działa niezależnie od otwartego widoku (moduł), żeby wyjście z ekranu Stream nie przerwało transmisji.
import type { Look } from '@/types'
import { H, W, studio } from './state'
import { paintOn } from './paint'
import { countdownLeft } from './cards'
import { syncVideos } from './media'
import { fade } from './look'
import { SCENE_DRAW } from './scenes'
import { encodeFrame } from './encoder'

let canvas: HTMLCanvasElement = null, main: CanvasRenderingContext2D = null, timer = 0
let pvCanvas: HTMLCanvasElement = null, pv: CanvasRenderingContext2D = null, frameNo2 = 0
const PV = 0.5
let scratch: HTMLCanvasElement = null
function getScratch() { if (!scratch) { scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H } return scratch }

// Rysuje wygląd L na płótnie ctx (scena; nieznana — jak Kamera), potem wraca do wizji na głównym płótnie.
function draw(ctx: CanvasRenderingContext2D, L: Look, t: number) {
  paintOn(ctx, L)
  try { (SCENE_DRAW[L.scene] || SCENE_DRAW.camera)(t) } finally { paintOn(main, studio.program) }
}

function frame() {
  const t = performance.now()
  if (studio.program.scene === 'countdown' || studio.preview.scene === 'countdown') { const l = countdownLeft(); if (l !== studio.left) studio.left = l }
  syncVideos()
  draw(main, studio.program, t)
  if (fade.from && t - fade.at < 500) {
    // przenikanie: poprzedni wygląd wizji znika
    const tmp = getScratch()
    draw(tmp.getContext('2d'), fade.from, t)
    main.save(); main.globalAlpha = 1 - (t - fade.at) / 500; main.drawImage(tmp, 0, 0); main.restore()
  } else fade.from = null
  // podgląd: co drugą klatkę, w połowie rozdzielczości
  if (pvCanvas?.isConnected && !studio.direct && frameNo2++ % 2 === 0) {
    pv.setTransform(PV, 0, 0, PV, 0, 0)
    try { draw(pv, studio.preview, t) } finally { pv.setTransform(1, 0, 0, 1, 0, 0) }
  }
  encodeFrame(canvas, t)
}

export function previewCanvas() {
  if (!pvCanvas) {
    pvCanvas = document.createElement('canvas')
    pvCanvas.width = W * PV; pvCanvas.height = H * PV
    pvCanvas.className = 'studio-canvas'
    pv = pvCanvas.getContext('2d', { alpha: false })
  }
  return pvCanvas
}

// Płótno studia (podgląd w oknie — ten sam obraz, który idzie na YouTube).
export function studioCanvas() {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    canvas.className = 'studio-canvas'
    main = canvas.getContext('2d', { alpha: false })
  }
  if (!timer) timer = window.setInterval(frame, 1000 / studio.fps)
  return canvas
}
export function pauseIdle() { if (!studio.live && timer) { clearInterval(timer); timer = 0 } }
export function setFps(fps) {
  studio.fps = [25, 30, 50, 60].includes(+fps) ? +fps : 30
  if (timer) { clearInterval(timer); timer = window.setInterval(frame, 1000 / studio.fps) }
}
