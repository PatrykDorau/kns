// Test napisów przez internet (src/cloud.js: lyrics / listenLyrics) na prawdziwym kanale Supabase Realtime:
// ten sam komputer (bez sieci), inny komputer, odbiorca przed nadawcą, zerwany kanał. node electron/test-napisy.cjs
const assert = require('node:assert/strict')
const wait = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { createCloud, CLOUD } = await import('../src/renderer/services/cloud.ts')
  const client = () => createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: false } })
  const sbA = client(), sbB = client()
  const A = createCloud({}, sbA), B = createCloud({}, sbB)
  const key = 'test-' + Math.random().toString(36).slice(2, 10)
  const until = async (fn, ms = 12000) => { for (let t = 0; t < ms; t += 100) { if (fn()) return true; await wait(100) } return false }

  // 1) ten sam komputer: rzutnik i stream w jednej aplikacji — od razu, bez czekania na sieć
  A.lyrics(key + 'a', 'Zwrotka 1')
  let local = []
  const offLocal = A.listenLyrics(key + 'a', t => local.push(t))
  assert.deepEqual(local, ['Zwrotka 1'])
  A.lyrics(key + 'a', 'Zwrotka 2')
  assert.equal(local.at(-1), 'Zwrotka 2')
  assert.equal(A.lyricsLink(key + 'a'), 'local')
  offLocal()

  // 2) inny komputer: odbiorca dostaje bieżącą zwrotkę po połączeniu i każdą zmianę
  A.lyrics(key, 'Pierwsza')
  let got = []
  const off = B.listenLyrics(key, t => got.push(t))
  assert.ok(await until(() => got.at(-1) === 'Pierwsza'), 'bieżąca zwrotka po połączeniu: ' + got)
  A.lyrics(key, 'Druga')
  assert.ok(await until(() => got.at(-1) === 'Druga'), 'zmiana zwrotki: ' + got)
  assert.equal(B.lyricsLink(key), 'ok')

  // 3) zerwany kanał u odbiorcy: otwiera się sam i dostaje bieżącą zwrotkę
  for (const ch of sbB.getChannels()) await ch.unsubscribe()
  A.lyrics(key, 'Po zerwaniu')
  assert.ok(await until(() => got.at(-1) === 'Po zerwaniu', 20000), 'po zerwaniu kanału: ' + got)

  // 4) odbiorca przed nadawcą
  const key2 = key + 'b'
  let got2 = []
  const off2 = B.listenLyrics(key2, t => got2.push(t))
  await wait(2500)
  A.lyrics(key2, 'Spóźniony rzutnik')
  assert.ok(await until(() => got2.at(-1) === 'Spóźniony rzutnik'), 'nadawca później: ' + got2)

  off(); off2(); A.lyrics('', '')
  await sbA.removeAllChannels(); await sbB.removeAllChannels()
  console.log('napisy: wszystkie testy OK')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
