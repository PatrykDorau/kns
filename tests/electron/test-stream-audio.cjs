// Test zmiany źródła dźwięku w trakcie transmisji w trybie prostym (src/main/streamer.ts → switchAudio):
// nadawanie wraca samo po krótkim restarcie, bez liczenia jako „wznowienie” po awarii. node tests/electron/test-stream-audio.cjs
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Streamer, ffmpegPath } = require('../../dist-electron/main/streamer.js')
const wait = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'))
  // serwer RTMP przyjmuje kolejne połączenia (po restarcie FFmpeg łączy się od nowa)
  const sink = () => spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-i', 'rtmp://127.0.0.1:19364/live2/k', '-f', 'null', '-'], { windowsHide: true })
  let sk = sink()
  sk.on('exit', () => { sk = sink() })
  await wait(800)
  const s = new Streamer({ dir: () => dir })
  let st = null
  s.on('state', x => { st = x })
  await s.start({ url: 'rtmp://127.0.0.1:19364/live2', key: 'k', testInput: true, encoder: 'x264', quality: '720', fps: 30 })
  for (let i = 0; i < 40 && !st?.running; i++) await wait(250)
  assert.equal(st.running, true, 'nadawanie ruszyło: ' + st.error)
  const first = s.proc
  s.switchAudio('Mikrofon testowy')
  assert.equal(s.want.audio, 'Mikrofon testowy')
  assert.equal(st.running, false) // na chwilę „łączy”
  for (let i = 0; i < 60 && !(st.running && s.proc && s.proc !== first); i++) await wait(250)
  assert.equal(st.running, true, 'nadawanie wróciło: ' + st.error)
  assert.notEqual(s.proc, first)
  assert.equal(st.restarts, 0) // zamierzona zmiana — nie awaria
  assert.equal(s.switchAudio('Mikrofon testowy'), s.state) // to samo źródło — bez restartu
  s.stop()
  await wait(1500)
  sk.removeAllListeners('exit'); sk.kill()
  console.log('OK: zmiana dźwięku w trakcie (tryb prosty)')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
