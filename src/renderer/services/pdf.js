import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Każda strona PDF-a staje się obrazem PNG o szerokości Full HD.
export async function pdfToImages(data, onPage) {
  const doc = await pdfjs.getDocument({ data }).promise
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 1920 / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    // intent 'print': rysowanie bez czekania na klatki ekranu — inaczej w zasłoniętym lub
    // zminimalizowanym oknie każda strona trwałaby sekundy.
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    await onPage(n, doc.numPages, new Uint8Array(await blob.arrayBuffer()))
  }
}
