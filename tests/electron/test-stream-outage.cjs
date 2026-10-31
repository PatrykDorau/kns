// Zerwany internet w trakcie transmisji (src/main/streamer.ts): między FFmpeg a lokalnym serwerem RTMP stoi pośrednik,
// który nagle przestaje przekazywać dane (połączenie nie pada, po prostu nic nie idzie — jak odcięty internet),
// a po chwili znowu działa. Nadawanie ma wrócić samo. node tests/electron/test-stream-outage.cjs
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { Streamer, ffmpegPath } = require('../../dist-electron/main/streamer.js')
const wait = ms => new Promise(r => setTimeout(r, ms))
const SINK = 19371, PROXY = 19372

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outage-'))
let sink = null, parts = 0
function startSink() {
  const file = path.join(dir, 'czesc' + ++parts + '.flv')
  sink = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-i', `rtmp://127.0.0.1:${SINK}/live2/k`, '-c', 'copy', '-y', file], { windowsHide: true })
  return file
}
let cut = false
const held = new Set()
const proxy = net.createServer(client => {
  if (cut) { client.pause(); client.on('error', () => {}); held.add(client); return } // połączenie wisi, nic nie odpowiada
  const up = net.connect(SINK, '127.0.0.1')
  client.on('error', () => up.destroy()); up.on('error', () => client.destroy())
  // przy odcięciu przestajemy czytać: bufory się zapełniają i FFmpeg nie ma gdzie pisać, jak bez internetu
  const pipe = (from, to) => from.on('data', b => { if (cut) from.pause(); else to.write(b) })
  pipe(client, up); pipe(up, client)
  client.on('close', () => up.destroy()); up.on('close', () => client.destroy())
  held.add(client); held.add(up)
})

;(async () => {
  await new Promise(r => proxy.listen(PROXY, '127.0.0.1', r))
  const first = startSink()
  await wait(800)
  const s = new Streamer({ dir: () => dir })
  let st = null
  const errors = []
  s.on('state', x => { st = x; if (x.error && errors.at(-1) !== x.error) errors.push(x.error) })
  await s.startStudio({ url: `rtmp://127.0.0.1:${PROXY}/live2`, key: 'k', fps: 30 })
  const enc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-t', '90', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-bf', '0', '-f', 'h264', 'pipe:1'], { windowsHide: true })
  enc.stdout.on('data', b => s.writeVideo(b))
  enc.on('error', () => {})
  const pcm = setInterval(() => s.writeAudio(new Uint8Array(48000 * 4 / 50)), 20)
  try {
    for (let i = 0; i < 60 && !st?.running; i++) await wait(250)
    assert.equal(st.running, true, 'nadawanie ruszyło: ' + st.error)
    await wait(2500)
    assert.equal(st.restarts, 0)

    // internet znika
    cut = true
    const t0 = Date.now()
    for (let i = 0; i < 100 && !st.restarts; i++) await wait(250)
    assert.ok(st.restarts >= 1, 'po zerwaniu FFmpeg nie został zrestartowany (czekałem ' + Math.round((Date.now() - t0) / 1000) + ' s)')
    console.log('zerwanie wykryte po', Math.round((Date.now() - t0) / 1000), 's:', st.error)
    assert.equal(st.running, false)

    // internet wraca
    for (const c of held) c.destroy()
    held.clear()
    try { sink.kill() } catch { /* już zamknięty */ }
    await wait(500)
    const second = startSink()
    await wait(800)
    cut = false
    const t1 = Date.now()
    for (let i = 0; i < 120 && !st.running; i++) await wait(250)
    assert.equal(st.running, true, 'nadawanie nie wróciło: ' + st.error)
    console.log('nadawanie wróciło po', Math.round((Date.now() - t1) / 1000), 's')
    assert.equal(st.error, '')
    await wait(3000)
    assert.equal(st.running, true)
    assert.ok(fs.statSync(first).size > 0, 'dane przed przerwą')
    assert.ok(fs.statSync(second).size > 0, 'dane po przerwie')
    console.log('zerwanie internetu: OK')
  } finally {
    clearInterval(pcm)
    try { enc.kill() } catch { /* już zamknięty */ }
    s.stop()
    try { s.proc?.kill() } catch { /* już zamknięty */ }
    try { sink.kill() } catch { /* już zamknięty */ }
    proxy.close()
    for (const c of held) c.destroy()
    await wait(500)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* pliki jeszcze otwarte */ }
  }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
