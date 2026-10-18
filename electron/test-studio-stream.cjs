// Test wysyłki w trybie studia (electron/streamer.cjs → startStudio): gotowy H.264 (jak z WebCodecs) przez stdin,
// dźwięk PCM 48 kHz przez gniazdo, lokalny serwer RTMP zamiast YouTube. node electron/test-studio-stream.cjs
const assert = require('node:assert/strict')
const { spawn, execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Streamer, ffmpegPath } = require('./streamer.cjs')
const wait = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'))
  const out = path.join(dir, 'odebrane.flv')
  const sink = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-i', 'rtmp://127.0.0.1:19360/live2/k', '-c', 'copy', '-y', out], { windowsHide: true })
  await wait(800)
  const s = new Streamer({ dir: () => dir })
  let st = null, keys = 0
  s.on('state', x => { st = x })
  s.on('needKey', () => keys++)
  await s.startStudio({ url: 'rtmp://127.0.0.1:19360/live2', key: 'k', fps: 30 })
  assert.equal(keys, 1) // prośba o klatkę kluczową przy starcie
  // „karta graficzna”: H.264 Annex B w czasie rzeczywistym (jak z WebCodecs), dźwięk — cisza
  const enc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30', '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '60', '-bf', '0', '-f', 'h264', 'pipe:1'], { windowsHide: true })
  enc.stdout.on('data', b => s.writeVideo(b))
  const pcm = setInterval(() => s.writeAudio(new Uint8Array(48000 * 4 / 50)), 20)
  for (let i = 0; i < 40 && !st?.running; i++) await wait(250)
  assert.equal(st.running, true, 'nadawanie ruszyło: ' + st.error)
  await wait(2500)
  assert.ok(st.fps > 0); assert.match(st.time, /^\d\d:\d\d:\d\d/)
  await new Promise(r => enc.on('exit', r))
  clearInterval(pcm)
  s.stop()
  await new Promise(r => sink.on('exit', r))
  const info = await new Promise(r => execFile(ffmpegPath(), ['-hide_banner', '-i', out], (e, so, se) => r(String(se))))
  assert.match(info, /Video: h264/); assert.match(info, /Audio: aac/); assert.match(info, /1920x1080/)
  console.log('studio: wszystkie testy OK')
})().catch(e => { console.error(e); process.exit(1) })

// Zatkany internet: zaległość > 48 MB → pomijanie klatek do najbliższej kluczowej, potem znów normalnie.
;(() => {
  const { isKeyFrame } = require('./streamer.cjs')
  const key = Buffer.from([0, 0, 0, 1, 0x67, 1, 2, 0, 0, 0, 1, 0x65, 9])
  const delta = Buffer.from([0, 0, 0, 1, 0x41, 1, 2, 3])
  assert.equal(isKeyFrame(key), true); assert.equal(isKeyFrame(delta), false)
  const s = new Streamer({ dir: () => os.tmpdir() })
  let writes = 0, keys = 0
  s.on('needKey', () => keys++)
  s.want = { studio: true }
  s.proc = { stdin: { writable: true, writableLength: 50e6, write() { writes++ } } }
  s.writeVideo(delta); assert.equal(writes, 0) // zatkane — pominięta
  s.proc.stdin.writableLength = 1e6
  s.writeVideo(delta); assert.equal(writes, 0) // czekamy na kluczową
  s.writeVideo(key); assert.equal(writes, 1) // wraca
  s.writeVideo(delta); assert.equal(writes, 2)
  assert.ok(keys >= 1, 'prośba o klatkę kluczową')
  assert.equal(s.skipped, 2)
  console.log('studio (zatkany internet): OK')
})()
