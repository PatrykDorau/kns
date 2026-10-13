import { init } from 'pptx-preview'

// Działa w osobnym, niewidocznym oknie: rysuje slajdy prezentacji .pptx jeden po drugim,
// a proces główny robi każdemu „zdjęcie” i zapisuje je jako obraz do biblioteki.
const W = 1920, H = 1080
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Czekamy, aż slajd się ustabilizuje: dociągną się obrazki i czcionki.
async function settle(root) {
  await Promise.all([...root.querySelectorAll('img')].map(img => (img.complete ? null : new Promise(done => { img.onload = img.onerror = done }))))
  await document.fonts.ready
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
  await sleep(120)
}

export async function renderPptx() {
  const api = window.api
  try {
    document.body.className = 'pptx-render'
    const host = document.getElementById('app')
    const bytes = await api.pptxData()
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const viewer = init(host, { width: W, height: H, mode: 'slide' })
    await viewer.load(buffer.slice(0))
    // Biblioteka dopasowuje slajd do szerokości; dla formatu 4:3 zwężamy go, żeby zmieścił się w pionie.
    const fit = Math.min(W, Math.round((H * viewer.pptx.width) / viewer.pptx.height))
    if (fit !== W) {
      viewer.options.width = fit
      viewer.wrapper.style.width = fit + 'px'
      await viewer.load(buffer.slice(0))
    }
    const height = Math.round((fit * viewer.pptx.height) / viewer.pptx.width)
    viewer.wrapper.style.height = height + 'px'
    const count = viewer.slideCount
    for (let i = 0; i < count; i++) {
      viewer.renderSingleSlide(i)
      await settle(viewer.wrapper)
      const r = viewer.wrapper.getBoundingClientRect()
      await api.pptxSlide(i, count, { x: Math.round(r.left), y: Math.round(r.top), width: fit, height })
    }
    api.pptxDone(count ? '' : 'Prezentacja nie ma slajdów.')
  } catch (e) {
    api.pptxDone('Nie udało się odczytać prezentacji: ' + (e?.message || e))
  }
}
