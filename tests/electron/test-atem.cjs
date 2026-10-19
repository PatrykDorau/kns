// Test sterowania ATEM (src/main/atem.ts) z udawanym mikserem (tests/electron/fake-atem.cjs): node tests/electron/test-atem.cjs
// Format ramek sprawdzono też krzyżowo z biblioteką atem-connection (te same bajty komend, ten sam odczytany stan).
const assert = require('node:assert/strict')
const { Atem } = require('../../dist-electron/main/atem.js')
const { startFakeAtem } = require('./fake-atem.cjs')
const wait = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const fake = await startFakeAtem(9912)
  const atem = new Atem(9912)
  let st = null
  atem.on('state', s => { st = s })
  assert.throws(() => atem.run('cut'), /Brak połączenia/)
  atem.connect('127.0.0.1')
  for (let i = 0; i < 60 && !st?.connected; i++) await wait(50)
  assert.equal(st.connected, true)
  assert.equal(st.model, 'ATEM Mini Extreme')
  assert.deepEqual(st.inputs.filter(i => i.camera).map(i => [i.id, i.name, i.short]), [[1, 'Kamera ambona', 'CAM1'], [2, 'Kamera sala', 'CAM2'], [3, 'Kamera zespół', 'CAM3']])
  assert.equal(st.program, 1); assert.equal(st.preview, 2); assert.equal(st.streaming, 'idle')

  atem.run('program', 3); atem.run('preview', 1); atem.run('cut'); atem.run('auto')
  atem.run('streamService', { url: 'rtmp://a.rtmp.youtube.com/live2', key: 'abcd-1234' }); atem.run('streaming', true)
  await wait(200)
  const got = fake.received.map(c => c.name + ':' + c.hex.slice(0, 8))
  assert.deepEqual(got.slice(0, 4), ['CPgI:00000003', 'CPvI:00000001', 'DCut:00000000', 'DAut:00000000'])
  const crss = fake.received.find(c => c.name === 'CRSS')
  const buf = Buffer.from(crss.hex, 'hex')
  assert.equal(buf.length, 1100); assert.equal(buf[0], 6) // maska: adres i klucz
  assert.equal(buf.subarray(65, 65 + 31).toString(), 'rtmp://a.rtmp.youtube.com/live2'); assert.equal(buf.subarray(577, 586).toString(), 'abcd-1234')
  assert.equal(fake.received.find(c => c.name === 'StrR').hex, '01000000')
  assert.equal(atem.inFlight.length, 0) // wszystko potwierdzone

  // zmiany na samym mikserze (przyciski) od razu w stanie
  fake.setProgram(2); fake.setStreaming(4)
  await wait(150)
  assert.equal(st.program, 2); assert.equal(st.streaming, 'streaming')

  atem.disconnect()
  assert.equal(st.connected, false)
  await fake.close()
  console.log('atem: wszystkie testy OK')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
