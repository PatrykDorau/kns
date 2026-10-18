// Sterowanie mikserem Blackmagic ATEM (np. ATEM Mini Extreme) przez sieć — protokół ATEM po UDP (port 9910),
// bez dodatkowych bibliotek. Tylko to, czego potrzebuje pulpit streamu:
//   stan: model, wejścia (nazwy), program, podgląd, transmisja i nagrywanie w ATEM,
//   komendy: program, podgląd, Cut, Auto, usługa transmisji (adres i klucz), start/stop transmisji.
// Format ramek i komend jak w bibliotece atem-connection (MIT) — zgodność sprawdza test electron/test-atem.mjs.
const dgram = require('node:dgram')
const { EventEmitter } = require('node:events')

const PORT = 9910
const HELLO = Buffer.from([0x10, 0x14, 0x53, 0xab, 0, 0, 0, 0, 0, 0x3a, 0, 0, 0x01, 0, 0, 0, 0, 0, 0, 0])
const FLAG = { ackRequest: 0x01, newSession: 0x02, retransmitRequest: 0x08, ackReply: 0x10 }
const MAX_ID = 1 << 15 // ATEM liczy pakiety na 15 bitach
const TIMEOUT = 5000 // bez wiadomości od ATEM tak długo — łączymy od nowa
const STREAM = { 1: 'idle', 2: 'connecting', 4: 'streaming', 32: 'stopping' }
const RECORD = { 0: 'idle', 1: 'recording', 128: 'stopping' }

const text = (buf, start, len) => { const s = buf.subarray(start, start + len); const end = s.indexOf(0); return s.subarray(0, end < 0 ? s.length : end).toString('utf8') }
// Komenda w pakiecie: długość (8 + dane), 2 bajty zera, nazwa (4 znaki ASCII), dane.
function command(name, payload) {
  const buf = Buffer.alloc(8 + payload.length)
  buf.writeUInt16BE(buf.length, 0)
  buf.write(name, 4, 4, 'ascii')
  payload.copy(buf, 8)
  return buf
}
const me = (source = 0) => { const b = Buffer.alloc(4); b.writeUInt8(0, 0); b.writeUInt16BE(source, 2); return b }
function streamService({ url, key }) {
  const b = Buffer.alloc(1100)
  b.writeUInt8((url != null ? 2 : 0) | (key != null ? 4 : 0), 0) // maska: które pola zmieniamy (url, klucz)
  if (url != null) b.write(String(url), 65, 512, 'utf8')
  if (key != null) b.write(String(key), 577, 512, 'utf8')
  return b
}
const onOff = on => { const b = Buffer.alloc(4); b.writeUInt8(on ? 1 : 0, 0); return b }
const COMMANDS = {
  program: source => command('CPgI', me(source)),
  preview: source => command('CPvI', me(source)),
  cut: () => command('DCut', me()),
  auto: () => command('DAut', me()),
  streamService: opts => command('CRSS', streamService(opts)),
  streaming: on => command('StrR', onOff(on)),
  recording: on => command('RcTM', onOff(on)),
}

class Atem extends EventEmitter {
  constructor(port = PORT) {
    super()
    this.port = port
    this.address = ''
    this.socket = null
    this.reset()
  }
  reset() {
    this.session = 0
    this.nextId = 1
    this.lastRemoteId = 0
    this.lastHeard = 0
    this.inFlight = []
    this.ready = false
    this.state = { connected: false, address: this.address, model: '', inputs: [], program: null, preview: null, streaming: '', recording: '', service: null }
  }
  emitState() { this.emit('state', { ...this.state, address: this.address }) }

  connect(address) {
    this.disconnect(true)
    this.address = String(address || '').trim()
    if (!this.address) { this.emitState(); return }
    this.socket = dgram.createSocket('udp4')
    this.socket.on('message', (msg, rinfo) => this.receive(msg, rinfo))
    this.socket.on('error', () => this.restart())
    this.socket.bind()
    this.restart()
    // brak odpowiedzi przez 5 s → ponowne łączenie (np. ATEM wyłączony albo zmienił się kabel)
    this.timer = setInterval(() => {
      if (Date.now() - this.lastHeard > TIMEOUT) this.restart()
      this.retransmit()
    }, 1000)
    this.emitState()
  }
  disconnect(silent = false) {
    clearInterval(this.timer)
    if (this.socket) { try { this.socket.close() } catch { /* już zamknięty */ } }
    this.socket = null
    this.address = ''
    this.reset()
    if (!silent) this.emitState()
  }
  restart() {
    const was = this.state.connected
    this.reset()
    this.lastHeard = Date.now()
    if (was) this.emitState()
    this.send(HELLO)
  }
  send(buf) { if (this.socket) this.socket.send(buf, 0, buf.length, this.port, this.address) }
  sendAck(id) {
    const b = Buffer.alloc(12)
    b.writeUInt16BE((FLAG.ackReply << 11) | 12, 0)
    b.writeUInt16BE(this.session, 2)
    b.writeUInt16BE(id, 4)
    this.send(b)
  }
  receive(packet, rinfo) {
    if (packet.length < 12) return
    const length = packet.readUInt16BE(0) & 0x07ff
    if (length !== rinfo.size) return
    this.lastHeard = Date.now()
    const flags = packet.readUInt8(0) >> 3
    this.session = packet.readUInt16BE(2)
    const remoteId = packet.readUInt16BE(10)
    if (flags & FLAG.newSession) { this.lastRemoteId = remoteId; this.sendAck(remoteId); return }
    if (flags & FLAG.retransmitRequest) {
      const from = packet.readUInt16BE(6) % MAX_ID
      for (const p of this.inFlight) if (p.id >= from) this.send(p.buf)
    }
    if (flags & FLAG.ackRequest) {
      if (remoteId === (this.lastRemoteId + 1) % MAX_ID) {
        this.lastRemoteId = remoteId
        this.sendAck(remoteId)
        if (length > 12) this.parse(packet.subarray(12, length))
      } else this.sendAck(this.lastRemoteId) // powtórka czegoś, co już mamy
    }
    if (flags & FLAG.ackReply) {
      const acked = packet.readUInt16BE(4)
      this.inFlight = this.inFlight.filter(p => !(p.id === acked || (p.id < acked && acked - p.id < MAX_ID / 2) || (p.id > acked && p.id - acked > MAX_ID / 2)))
    }
  }
  parse(buf) {
    let changed = false
    while (buf.length >= 8) {
      const len = buf.readUInt16BE(0)
      if (len < 8 || len > buf.length) break
      const name = buf.toString('ascii', 4, 8), d = buf.subarray(8, len)
      buf = buf.subarray(len)
      const s = this.state
      if (name === '_pin') s.model = text(d, 0, 40)
      else if (name === 'InPr' && d.length >= 33) {
        const input = { id: d.readUInt16BE(0), name: text(d, 2, 20), short: text(d, 22, 4), camera: d.readUInt8(32) === 0 }
        s.inputs = [...s.inputs.filter(i => i.id !== input.id), input].sort((a, b) => a.id - b.id)
      } else if (name === 'PrgI' && d.readUInt8(0) === 0) s.program = d.readUInt16BE(2)
      else if (name === 'PrvI' && d.readUInt8(0) === 0) s.preview = d.readUInt16BE(2)
      else if (name === 'StRS') { const raw = d.readUInt16BE(0); s.streaming = STREAM[[4, 32, 2, 1].find(f => raw & f)] || 'idle' }
      else if (name === 'RTMS') { const raw = d.readUInt16BE(0); s.recording = raw & 128 ? 'stopping' : raw & 1 ? 'recording' : 'idle' }
      else if (name === 'SRSU') s.service = { name: text(d, 0, 64), url: text(d, 64, 512), hasKey: !!text(d, 576, 512) }
      else if (name === 'InCm') { this.ready = true; s.connected = true }
      else continue
      changed = true
    }
    if (changed && this.ready) this.emitState()
  }
  // Komenda do ATEM (pakiet z prośbą o potwierdzenie; bez potwierdzenia — powtórka co sekundę, do 10 razy).
  run(name, arg) {
    if (!this.state.connected) throw new Error('Brak połączenia z ATEM.')
    const make = COMMANDS[name]
    if (!make) throw new Error('Nieznana komenda ATEM: ' + name)
    const payload = make(arg)
    const id = this.nextId
    this.nextId = (this.nextId + 1) % MAX_ID
    const buf = Buffer.alloc(12 + payload.length)
    buf.writeUInt16BE((FLAG.ackRequest << 11) | buf.length, 0)
    buf.writeUInt16BE(this.session, 2)
    buf.writeUInt16BE(id, 10)
    payload.copy(buf, 12)
    this.send(buf)
    this.inFlight.push({ id, buf, tries: 0 })
  }
  retransmit() {
    this.inFlight = this.inFlight.filter(p => p.tries++ < 10)
    for (const p of this.inFlight) if (p.tries > 1) this.send(p.buf)
  }
}

module.exports = { Atem, COMMANDS, PORT, STREAM, RECORD }
