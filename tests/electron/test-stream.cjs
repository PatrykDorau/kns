// Test nadawania (src/main/streamer.ts): obraz testowy zamiast ATEM, lokalny serwer RTMP (sam FFmpeg) zamiast YouTube.
// Sprawdza: start, statystyki, podgląd MJPEG, napisy w pliku, zatrzymanie; nagranie z „YouTube” ma obraz H.264 i dźwięk AAC.
// node tests/electron/test-stream.cjs (koder procesorem — test działa także bez karty NVIDIA)
const assert = require('node:assert/strict')
const { spawn, execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { Streamer, ffmpegPath } = require('../../dist-electron/main/streamer.js')
const wait = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-'))
  const out = path.join(dir, 'odebrane.flv')
  // „YouTube”: FFmpeg słucha jako serwer RTMP i zapisuje to, co przyszło
  const sink = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-i', 'rtmp://127.0.0.1:19350/live2/klucz-testowy', '-c', 'copy', '-y', out], { windowsHide: true })
  await wait(800)

  const s = new Streamer({ dir: () => dir })
  let st = null
  s.on('state', x => { st = x })
  await assert.rejects(s.start({ url: '', key: '' }), /Brak adresu/)
  s.setLyrics('Wielki jest nasz Bóg\nchwała Mu na wieki') // napisy sprzed startu zostają
  await s.start({ url: 'rtmp://127.0.0.1:19350/live2/', key: 'klucz-testowy', testInput: true, encoder: 'x264', quality: '720' })
  assert.equal(fs.readFileSync(s.textFile(), 'utf8'), 'Wielki jest nasz Bóg\nchwała Mu na wieki')
  for (let i = 0; i < 40 && !st?.running; i++) await wait(250)
  assert.equal(st.running, true, 'nadawanie ruszyło: ' + st.error)
  assert.ok(st.previewUrl.startsWith('http://127.0.0.1:'))

  // podgląd: strumień obrazków JPEG
  const jpeg = await new Promise((resolve, reject) => {
    http.get(st.previewUrl, res => {
      let buf = Buffer.alloc(0)
      res.on('data', c => { buf = Buffer.concat([buf, c]); if (buf.indexOf(Buffer.from([0xff, 0xd8])) >= 0 && buf.length > 2000) { res.destroy(); resolve(buf) } })
    }).on('error', reject)
  })
  assert.ok(jpeg.includes('Content-type: image/jpeg') || jpeg.includes('Content-Type: image/jpeg'))

  await wait(3000)
  assert.ok(st.fps > 0); assert.ok(/kbits/.test(st.bitrate)); assert.match(st.time, /^\d\d:\d\d:\d\d/)
  s.setLyrics('')
  assert.equal(fs.readFileSync(s.textFile(), 'utf8'), '')
  s.stop()
  assert.equal(st.running, false)
  await new Promise(r => sink.on('exit', r))
  s.preview.server.close()

  // co dotarło do „YouTube”
  const info = await new Promise(r => execFile(ffmpegPath(), ['-hide_banner', '-i', out], (e, so, se) => r(String(se))))
  assert.match(info, /Video: h264/); assert.match(info, /Audio: aac/); assert.match(info, /1280x720/)
  console.log('stream: wszystkie testy OK')
})().catch(e => { console.error(e); process.exit(1) })
