// Nadawanie na YouTube prosto z aplikacji (bez OBS): FFmpeg bierze obraz i dźwięk z miksera ATEM po USB (urządzenie
// „Blackmagic Design” w Windows), nakłada napisy pieśni (tekst z pliku, odświeżany co klatkę, z miękkim cieniem),
// koduje kartą graficzną NVIDIA (NVENC; bez niej — procesorem w 720p) i wysyła po RTMP. Do tego mały podgląd MJPEG
// (http://127.0.0.1:<port>/podglad) i statystyki (kl./s, przepływność, zgubione klatki). Zerwane łącze → wznowienie.
import { spawn, execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

// FFmpeg z paczki ffmpeg-static (w instalatorze rozpakowany obok app.asar).
function ffmpegPath() {
  if (process.env.KNS_FFMPEG) return process.env.KNS_FFMPEG
  return require('ffmpeg-static').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
}

// Urządzenia DirectShow: [{ name, kind: 'video' | 'audio' }].
function listDevices() {
  return new Promise(resolve => {
    execFile(ffmpegPath(), ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { windowsHide: true }, (err, stdout, stderr) => {
      const out = { video: [], audio: [] }
      for (const m of String(stderr).matchAll(/"([^"]+)" \((video|audio|none)\)/g)) if (out[m[2]]) out[m[2]].push(m[1])
      resolve(out)
    })
  })
}

const QUALITY = {
  // przepływność wg zaleceń YouTube; przy 50/60 kl./s wyższa
  '1080': { w: 1920, h: 1080, nvenc: '6800k', x264: '4500k', nvenc60: '9000k', x264_60: '6000k' },
  '720': { w: 1280, h: 720, nvenc: '3500k', x264: '3000k', nvenc60: '5000k', x264_60: '4000k' },
}
// Napisy: trzy warstwy tego samego tekstu — dwie przezroczyste obwódki (miękki cień) i biały tekst z obrysem.
function lyricsFilter(file, h) {
  const k = h / 1080
  const esc = s => s.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
  const font = fs.existsSync('C:/Windows/Fonts/segoeuib.ttf') ? `fontfile='${esc('C:/Windows/Fonts/segoeuib.ttf')}':` : ''
  const base = `${font}textfile='${esc(file)}':reload=1:expansion=none:text_align=C:fontsize=${Math.round(64 * k)}:line_spacing=${Math.round(14 * k)}:x=(w-text_w)/2:y=h-text_h-${Math.round(80 * k)}`
  return [
    `drawtext=${base}:fontcolor=black@0:borderw=${Math.round(14 * k)}:bordercolor=black@0.14`,
    `drawtext=${base}:fontcolor=black@0:borderw=${Math.round(8 * k)}:bordercolor=black@0.22`,
    `drawtext=${base}:fontcolor=white:borderw=${Math.max(2, Math.round(3 * k))}:bordercolor=black@0.5:shadowx=0:shadowy=${Math.round(3 * k)}:shadowcolor=black@0.55`,
  ].join(',')
}

// Klatka kluczowa H.264 (Annex B): NAL typu 5 (IDR) albo 7 (SPS, idzie przed IDR).
function isKeyFrame(b) {
  for (let i = 0; i + 3 < b.length && i < 4096; i++) {
    if (b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 || (b[i + 2] === 0 && b[i + 3] === 1))) {
      const t = b[i + (b[i + 2] === 1 ? 3 : 4)] & 0x1f
      if (t === 5 || t === 7) return true
    }
  }
  return false
}
class Streamer extends EventEmitter {
  // proces FFmpeg, podgląd, napisy i stan nadawania
  dir: () => string; proc: any; want: any; state: any; preview: any; audio: any
  lastText: string; lastStats: number; statsTimer: any; skipped: number; choked: boolean; switching: any
  constructor({ dir }) {
    super()
    this.dir = dir
    this.proc = null
    this.want = null // ustawienia bieżącej transmisji (null = nie nadajemy)
    this.state = { running: false, starting: false, encoder: '', fps: 0, bitrate: '', time: '', drop: 0, speed: '', error: '', restarts: 0, previewUrl: '', backlog: 0, stalled: false, skipped: 0, target: 0 }
    this.lastText = null
    this.preview = { clients: new Set(), server: null, port: 0 }
  }
  textFile() { return path.join(this.dir(), 'napisy-stream.txt') }
  emitState(patch = {}) { Object.assign(this.state, patch); this.emit('state', { ...this.state }) }

  // Napisy: zapis przez plik tymczasowy i podmianę (FFmpeg nie przeczyta połowy tekstu).
  setLyrics(text) {
    text = String(text || '').replace(/\r/g, '').trim()
    if (text === this.lastText) return
    this.lastText = text
    const file = this.textFile(), tmp = file + '.tmp'
    try {
      fs.writeFileSync(tmp, text)
      for (let i = 0; i < 5; i++) { try { fs.renameSync(tmp, file); return } catch { /* FFmpeg właśnie czyta — za chwilę */ } }
      fs.writeFileSync(file, text)
    } catch { /* napisy nie mogą zatrzymać transmisji */ }
  }

  async startPreviewServer() {
    if (this.preview.server) return
    this.preview.server = http.createServer((req, res) => {
      if (!req.url.startsWith('/podglad')) { res.writeHead(404).end(); return }
      res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg', 'Cache-Control': 'no-store' })
      this.preview.clients.add(res)
      req.on('close', () => this.preview.clients.delete(res))
    })
    await new Promise(r => this.preview.server.listen(0, '127.0.0.1', r))
    this.preview.port = this.preview.server.address().port
  }

  args(o, encoder) {
    const q0 = QUALITY[o.quality] || QUALITY['1080']
    // klatki na sekundę — tyle, ile wysyła ATEM (Standard wideo w mikserze); 25, 30, 50 albo 60
    const fps = [25, 30, 50, 60].includes(+o.fps) ? +o.fps : 30
    let q = fps > 30 ? { ...q0, nvenc: q0.nvenc60, x264: q0.x264_60 } : q0
    // przepływność ustawiona ręcznie (kb/s) zamiast automatycznej
    if (+o.kbps >= 1000 && +o.kbps <= 20000) q = { ...q, nvenc: Math.round(+o.kbps) + 'k', x264: Math.round(+o.kbps) + 'k' }
    // Ekran (próba bez ATEM): „screen:x,y,w,h” w pikselach fizycznych pulpitu.
    const scr = String(o.video || '').match(/^screen:(-?\d+),(-?\d+),(\d+),(\d+)$/)
    const audioIn = o.audio ? ['-f', 'dshow', '-thread_queue_size', '1024', '-i', `audio=${o.audio}`] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
    const input = scr && !o.testInput
      ? ['-f', 'gdigrab', '-framerate', String(fps), '-offset_x', scr[1], '-offset_y', scr[2], '-video_size', scr[3] + 'x' + scr[4], '-draw_mouse', '0', '-thread_queue_size', '1024', '-i', 'desktop', ...audioIn]
      : o.testInput
      ? ['-re', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-re', '-f', 'lavfi', '-i', 'sine=f=440:r=48000']
      : o.audio
        ? ['-f', 'dshow', '-rtbufsize', '256M', '-thread_queue_size', '1024', '-i', `video=${o.video}:audio=${o.audio}`]
        : ['-f', 'dshow', '-rtbufsize', '256M', '-thread_queue_size', '1024', '-i', `video=${o.video}`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] // YouTube chce dźwięku — cisza
    const audioMap = o.testInput || !o.audio || scr ? '1:a' : '0:a'
    const scale = `scale=${q.w}:${q.h}:force_original_aspect_ratio=decrease,pad=${q.w}:${q.h}:(ow-iw)/2:(oh-ih)/2,fps=${fps},${lyricsFilter(this.textFile(), q.h)},format=yuv420p`
    const graph = `[0:v]${scale},split=2[out][pv];[pv]scale=960:-2,fps=15[pvo]`
    const rate = ['-b:v', q.nvenc, '-maxrate', q.nvenc, '-bufsize', String(parseInt(q.nvenc) * 2) + 'k', '-g', String(fps * 2)]
    const video = encoder === 'nvenc'
      ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'cbr', ...rate, '-bf', '2', '-profile:v', 'high']
      : encoder === 'amf'
      ? ['-c:v', 'h264_amf', '-usage', 'transcoding', '-quality', 'balanced', '-rc', 'cbr', '-filler_data', '1', '-enforce_hrd', '1', ...rate, '-profile:v', 'high'] // dopełnianie: stała przepływność także przy nieruchomym obrazie
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', q.x264, '-maxrate', q.x264, '-bufsize', String(parseInt(q.x264) * 2) + 'k', '-g', String(fps * 2), '-profile:v', 'main']
    return ['-hide_banner', '-loglevel', 'info', '-stats', '-stats_period', '1', ...input,
      '-filter_complex', graph,
      '-map', '[out]', '-map', audioMap, ...video, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-f', 'flv', o.url.replace(/\/$/, '') + '/' + o.key,
      '-map', '[pvo]', '-c:v', 'mjpeg', '-q:v', '4', '-f', 'mpjpeg', 'pipe:1'] // podgląd: 960 px, 15 kl./s — ostro, a lekko dla komputera
  }

  async start(o) {
    if (this.want) return this.state
    if (!o?.url || !o?.key) throw new Error('Brak adresu albo klucza transmisji YouTube.')
    if (!o.testInput && !o.video) throw new Error('Wybierz źródło obrazu (ATEM — „Blackmagic Design”).')
    this.want = { ...o }
    // bieżące napisy (mogły przyjść przed startem) — zapis od nowa
    const current = this.lastText || ''
    this.lastText = null
    this.setLyrics(current)
    await this.startPreviewServer()
    this.emitState({ starting: true, running: false, error: '', restarts: 0, drop: 0, previewUrl: `http://127.0.0.1:${this.preview.port}/podglad` })
    this.launch(o.encoder === 'x264' ? 'x264' : 'nvenc')
    return this.state
  }

  launch(encoder) {
    const o = this.want
    if (!o) return
    const quality = encoder === 'x264' && !o.testInput && o.quality === '1080' ? '720' : o.quality // procesorem — lżej
    let log = ''
    const proc = spawn(ffmpegPath(), this.args({ ...o, quality }, encoder), { windowsHide: true })
    this.proc = proc
    this.emitState({ encoder: { nvenc: 'karta graficzna NVIDIA', amf: 'karta graficzna AMD' }[encoder] || 'procesor (720p)' })
    // podgląd: strumień MJPEG prosto do okna aplikacji
    proc.stdout.on('data', chunk => { for (const c of this.preview.clients) c.write(chunk) })
    proc.stderr.on('data', chunk => {
      const text = chunk.toString()
      log = (log + text).slice(-4000)
      const m = text.match(/frame=\s*(\d+)\s+fps=\s*([\d.]+).*?time=(\S+)\s+bitrate=\s*(\S+).*?speed=\s*(\S+)/)
      if (m) {
        const drop = (text.match(/drop=\s*(\d+)/) || [])[1]
        const ok = v => (v && v !== 'N/A' ? v : '')
        // „na żywo” dopiero, gdy płynie obraz (na początku FFmpeg podaje „N/A”)
        if (ok(m[3])) this.emitState({ running: true, starting: false, error: '', fps: Math.round(+m[2]), time: m[3].replace(/\.\d+$/, ''), bitrate: ok(m[4]), speed: ok(m[5]), ...(drop ? { drop: +drop } : {}) })
      }
    })
    proc.on('exit', code => {
      if (this.proc === proc) this.proc = null
      if (!this.want) { this.emitState({ running: false, starting: false }); return }
      // zmiana źródła dźwięku w trakcie — od razu nowy FFmpeg z tym samym koderem (ok. 1–2 s przerwy)
      if (this.switching === proc) { this.switching = null; this.launch(encoder); return }
      // Koder karty niedostępny (inna karta, stary sterownik) → następny: NVIDIA → AMD → procesor (720p).
      if (encoder === 'nvenc' && /nvenc|nvcuda|CUDA|No capable devices|Driver does not support/i.test(log)) { this.launch('amf'); return }
      if (encoder === 'amf' && /amf|AMF|amfrt/i.test(log)) {
        this.emitState({ error: 'Karta graficzna nie przyjęła kodowania — nadaję procesorem w 720p. Pomoże aktualizacja sterownika karty.' })
        this.launch('x264')
        return
      }
      const reason = (log.match(/(Could not find|I\/O error|Connection|Error opening|Invalid data|Device or resource busy|Could not run graph)[^\n]*/i) || [])[0] || 'FFmpeg zakończył pracę (kod ' + code + ').'
      const busy = /Could not run graph|busy|Could not set video options/i.test(log)
      this.emitState({ running: false, starting: true, restarts: this.state.restarts + 1,
        error: busy ? 'Obraz z ATEM jest zajęty przez inny program (np. OBS albo ATEM Software Control z podglądem) — zamknij go.' : 'Przerwa w nadawaniu: ' + reason.trim() + ' — wznawiam za 3 s.' })
      // zerwane łącze, chwilowy błąd — wznowienie, dopóki transmisja ma trwać
      setTimeout(() => { if (this.want && !this.proc) this.launch(encoder) }, 3000)
    })
  }

  // Tryb prosty: dźwięk otwiera FFmpeg (DirectShow), więc zmiana źródła = krótki restart z nowym wejściem.
  // W studiu dźwięk miksuje aplikacja — tam zmiana jest bez przerwy (studio.js → setAudio).
  switchAudio(audio) {
    if (!this.want || this.want.studio) return this.state
    audio = String(audio || '')
    if (audio === (this.want.audio || '')) return this.state
    this.want.audio = audio
    const proc = this.proc
    if (proc) {
      this.switching = proc
      this.emitState({ starting: true, running: false, error: '' })
      try { proc.stdin.write('q') } catch { /* już zamknięty */ }
      setTimeout(() => { if (proc.exitCode == null) proc.kill() }, 2500)
    }
    return this.state
  }

  /* ---------- tryb studia: obraz składa i koduje aplikacja (karta graficzna), dźwięk miksuje aplikacja ---------- */
  // Wejścia FFmpeg: H.264 (gotowe klatki) przez stdin i PCM 48 kHz przez lokalne gniazdo TCP; obraz bez przerabiania,
  // dźwięk → AAC; oba ze znacznikami czasu „zegara ściennego”, więc zostają zgrane.
  async startStudio(o) {
    if (this.want) return this.state
    if (!o?.url || !o?.key) throw new Error('Brak adresu albo klucza transmisji YouTube.')
    this.want = { ...o, studio: true }
    this.skipped = 0; this.choked = false
    this.emitState({ starting: true, running: false, error: '', restarts: 0, drop: 0, previewUrl: '', encoder: 'karta graficzna (studio)', backlog: 0, stalled: false, skipped: 0, target: +o.kbps || 0 })
    await this.launchStudio()
    return this.state
  }
  async launchStudio() {
    const o = this.want
    if (!o) return
    const port = await new Promise<number>(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => r(p)) }) })
    let log = ''
    const fps = [25, 30, 50, 60].includes(+o.fps) ? +o.fps : 30
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'info', '-stats', '-stats_period', '1',
      '-thread_queue_size', '512', '-use_wallclock_as_timestamps', '1', '-probesize', '500000', '-analyzeduration', '0', '-framerate', String(fps), '-f', 'h264', '-i', 'pipe:0',
      '-thread_queue_size', '512', '-use_wallclock_as_timestamps', '1', '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', `tcp://127.0.0.1:${port}?listen=1`,
      '-map', '0:v', '-c:v', 'copy', '-map', '1:a', '-af', 'aresample=async=1000', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-f', 'flv', o.url.replace(/\/$/, '') + '/' + o.key], { windowsHide: true })
    this.proc = proc
    this.audio = { socket: null, queue: [] }
    proc.stdin.on('error', () => {})
    // dźwięk: łączymy się z FFmpeg, gdy otworzy gniazdo (po wczytaniu początku obrazu)
    const connect = (tries = 0) => {
      if (this.proc !== proc) return
      const sock = net.connect(port, '127.0.0.1')
      sock.on('connect', () => { this.audio.socket = sock; for (const b of this.audio.queue) sock.write(b); this.audio.queue = [] })
      sock.on('error', () => { if (!this.audio.socket && tries < 100) setTimeout(() => connect(tries + 1), 200) })
    }
    connect()
    this.emit('needKey')
    // co sekundę: ile obrazu czeka na wysłanie (internet nie nadąża → rośnie) i czy FFmpeg w ogóle coś wysyła
    this.lastStats = Date.now()
    clearInterval(this.statsTimer)
    this.statsTimer = setInterval(() => {
      if (this.proc !== proc) { clearInterval(this.statsTimer); return }
      const bytes = proc.stdin.writableLength || 0, kbps = +o.kbps || 6800
      this.emitState({ backlog: Math.round((bytes * 8) / (kbps * 1000) * 10) / 10, stalled: this.state.running && Date.now() - this.lastStats > 5000, skipped: this.skipped })
    }, 1000)
    proc.stderr.on('data', chunk => {
      const text = chunk.toString()
      log = (log + text).slice(-4000)
      const m = text.match(/frame=\s*(\d+)\s+fps=\s*([\d.]+).*?time=(\S+)\s+bitrate=\s*(\S+).*?speed=\s*(\S+)/)
      const ok = v => (v && v !== 'N/A' ? v : '')
      if (process.env.KNS_STREAM_DEBUG) process.stderr.write(text)
      // obraz bez przerabiania — FFmpeg nie podaje klatek, tylko czas i przepływność
      const tm = (text.match(/time=(\S+)/g) || []).pop()?.slice(5), br = (text.match(/bitrate=\s*(\S+)/g) || []).pop()?.replace(/bitrate=\s*/, '')
      if ((m && ok(m[3])) || ok(tm)) this.lastStats = Date.now()
      if (m && ok(m[3])) this.emitState({ running: true, starting: false, error: '', fps: Math.round(+m[2]), time: m[3].replace(/\.\d+$/, ''), bitrate: ok(m[4]), speed: ok(m[5]) })
      else if (ok(tm)) this.emitState({ running: true, starting: false, error: '', fps, time: tm.replace(/\.\d+$/, ''), bitrate: ok(br) })
    })
    proc.on('exit', code => {
      if (this.proc === proc) this.proc = null
      try { this.audio?.socket?.destroy() } catch { /* zamknięte */ }
      this.audio = null
      if (!this.want) { this.emitState({ running: false, starting: false }); return }
      const reason = (log.match(/(I\/O error|Connection|Error opening|Invalid data|Broken pipe)[^\n]*/i) || [])[0] || 'FFmpeg zakończył pracę (kod ' + code + ').'
      this.emitState({ running: false, starting: true, restarts: this.state.restarts + 1, error: 'Przerwa w nadawaniu: ' + reason.trim() + ' — wznawiam za 3 s.' })
      setTimeout(() => { if (this.want && !this.proc) this.launchStudio() }, 3000)
    })
  }
  // Obraz z karty graficznej → FFmpeg. Gdy internet długo nie nadąża (zaległość > ~48 MB), zamiast zapychać pamięć
  // pomijamy klatki do następnej kluczowej (krótkie „zacięcie” u widzów, ale transmisja wraca na bieżąco).
  writeVideo(buf) {
    const stdin = this.proc?.stdin
    if (!this.want?.studio || !stdin?.writable) return
    const b = Buffer.from(buf)
    if (stdin.writableLength > 48e6) { if (!this.choked) { this.choked = true; this.emit('needKey') } }
    if (this.choked) {
      if (stdin.writableLength > 4e6 || !isKeyFrame(b)) { this.skipped = (this.skipped || 0) + 1; if (this.skipped % 30 === 1) this.emit('needKey'); return }
      this.choked = false
    }
    stdin.write(b)
  }
  writeAudio(buf) {
    if (!this.want?.studio || !this.audio) return
    const b = Buffer.from(buf)
    if (this.audio.socket) this.audio.socket.write(b)
    else if (this.audio.queue.length < 400) this.audio.queue.push(b) // do ~2 s czekania na połączenie
  }

  stop() {
    this.want = null
    clearInterval(this.statsTimer)
    const proc = this.proc
    if (proc) {
      try { proc.stdin.write('q') } catch { /* już zamknięty */ }
      setTimeout(() => { if (!proc.killed && proc.exitCode == null) proc.kill() }, 4000)
    }
    for (const c of this.preview.clients) c.end()
    this.preview.clients.clear()
    this.emitState({ running: false, starting: false, fps: 0, bitrate: '', speed: '', error: '', backlog: 0, stalled: false })
    return this.state
  }
}

export { Streamer, listDevices, ffmpegPath, lyricsFilter, isKeyFrame }
