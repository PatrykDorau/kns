// Udawany mikser ATEM do testów (UDP, ten sam protokół): po „hello” wysyła stan — model, wersję, topologię,
// trzy kamery i czerń, program, podgląd, stan transmisji — i zapisuje komendy, które dostał. Używa go
// electron/test-atem.cjs (bez prawdziwego urządzenia).
const dgram = require('node:dgram')

function cmd(name, payload) {
  const b = Buffer.alloc(8 + payload.length)
  b.writeUInt16BE(b.length, 0)
  b.write(name, 4, 4, 'ascii')
  payload.copy(b, 8)
  return b
}
function inputProps(id, name, short, internal) {
  const d = Buffer.alloc(36)
  d.writeUInt16BE(id, 0)
  d.write(name, 2, 20, 'utf8')
  d.write(short, 22, 4, 'utf8')
  d.writeUInt8(0, 26)
  d.writeUInt16BE(1, 28) // HDMI
  d.writeUInt16BE(1, 30)
  d.writeUInt8(internal, 32)
  d.writeUInt8(0xff, 34)
  d.writeUInt8(0xff, 35)
  return cmd('InPr', d)
}
const meSource = (name, source) => { const d = Buffer.alloc(name === 'PrvI' ? 8 : 4); d.writeUInt16BE(source, 2); return cmd(name, d) }
function u(name, ...bytes) { return cmd(name, Buffer.from(bytes)) }

function startFakeAtem(port = 9911) {
  const sock = dgram.createSocket('udp4')
  const received = []
  let client = null, session = 0x8123, nextId = 1
  const send = buf => client && sock.send(buf, client.port, client.address)
  function packet(commands) {
    const payload = Buffer.concat(commands)
    const b = Buffer.alloc(12 + payload.length)
    b.writeUInt16BE((0x01 << 11) | b.length, 0) // prośba o potwierdzenie
    b.writeUInt16BE(session, 2)
    b.writeUInt16BE(nextId++, 10)
    payload.copy(b, 12)
    send(b)
  }
  const ver = Buffer.alloc(4); ver.writeUInt32BE(131102, 0) // protokół 8.1.1
  const pin = Buffer.alloc(44); pin.write('ATEM Mini Extreme', 0); pin.writeUInt8(0x10, 40)
  const top = Buffer.alloc(24); top.writeUInt8(1, 0); top.writeUInt8(5, 1)
  const strs = Buffer.alloc(4); strs.writeUInt16BE(1, 0) // bezczynny
  function sendState() {
    packet([cmd('_ver', ver), cmd('_pin', pin), cmd('_top', top)])
    packet([inputProps(0, 'Black', 'BLK', 1), inputProps(1, 'Kamera ambona', 'CAM1', 0), inputProps(2, 'Kamera sala', 'CAM2', 0), inputProps(3, 'Kamera zespół', 'CAM3', 0)])
    packet([meSource('PrgI', 1), meSource('PrvI', 2), cmd('StRS', strs)])
    packet([u('InCm', 1, 0, 0, 0)])
  }
  sock.on('message', (msg, rinfo) => {
    const flags = msg.readUInt8(0) >> 3
    if (flags & 0x02) { // hello → nowa sesja, potem stan
      client = rinfo; nextId = 1
      const hello = Buffer.alloc(20)
      hello.writeUInt16BE((0x02 << 11) | 20, 0)
      hello.writeUInt16BE(0x1337, 2)
      hello.writeUInt8(0x02, 12)
      send(hello)
      setTimeout(sendState, 20)
      return
    }
    if (flags & 0x01) { // komendy od klienta: zapis i potwierdzenie
      let buf = msg.subarray(12)
      while (buf.length >= 8) {
        const len = buf.readUInt16BE(0)
        received.push({ name: buf.toString('ascii', 4, 8), hex: buf.subarray(8, len).toString('hex') })
        buf = buf.subarray(len)
      }
      const ack = Buffer.alloc(12)
      ack.writeUInt16BE((0x10 << 11) | 12, 0)
      ack.writeUInt16BE(session, 2)
      ack.writeUInt16BE(msg.readUInt16BE(10), 4)
      send(ack)
    }
  })
  return new Promise(resolve => sock.bind(port, '127.0.0.1', () => resolve({
    received,
    // zmiana na mikserze (np. ktoś nacisnął przycisk): nowy program
    setProgram: source => packet([meSource('PrgI', source)]),
    setStreaming: raw => { const d = Buffer.alloc(4); d.writeUInt16BE(raw, 0); packet([cmd('StRS', d)]) },
    close: () => new Promise(r => sock.close(r)),
  })))
}

module.exports = { startFakeAtem }
