// Test YouTube (electron/youtube.cjs) z podstawionym serwerem Google: node electron/test-youtube.cjs
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const calls = []
const streams = [], broadcasts = []
let id = 0, fail = 0
const server = http.createServer(async (req, res) => {
  let body = ''
  for await (const ch of req) body += ch
  const url = new URL(req.url, 'http://x')
  calls.push(req.method + ' ' + url.pathname)
  const send = (data, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
  if (url.pathname === '/token') return send({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 })
  if (req.headers.authorization !== 'Bearer acc') return send({ error: { message: 'unauth' } }, 401)
  const p = url.pathname.replace('/youtube/v3', '')
  if (p === '/channels' && fail > 0) { fail--; return send({ error: { code: 500, message: 'Internal error encountered.', errors: [{ reason: 'backendError' }] } }, 500) }
  if (p === '/channels') return send({ items: [{ id: 'UC1', snippet: { title: 'Kościół Na Skale' } }] })
  if (p === '/liveStreams' && req.method === 'GET') {
    const list = url.searchParams.get('id') ? streams.filter(s => s.id === url.searchParams.get('id')) : streams
    return send({ items: list })
  }
  if (p === '/liveStreams' && req.method === 'POST') {
    const b = JSON.parse(body)
    const s = { id: 'S' + ++id, snippet: b.snippet, cdn: { ...b.cdn, ingestionInfo: { ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2', streamName: 'klucz-123' } }, status: { streamStatus: 'inactive', healthStatus: { status: 'noData' } }, contentDetails: b.contentDetails }
    streams.push(s); return send(s)
  }
  if (p === '/liveBroadcasts' && req.method === 'POST') {
    const b = JSON.parse(body)
    if (b.status.privacyStatus === 'zly') return send({ error: { errors: [{ reason: 'liveStreamingNotEnabled' }], message: 'x' } }, 403)
    const x = { id: 'B' + ++id, snippet: b.snippet, status: { ...b.status, lifeCycleStatus: 'created' }, contentDetails: b.contentDetails }
    broadcasts.push(x); return send(x)
  }
  if (p === '/liveBroadcasts/bind') { const x = broadcasts.find(b => b.id === url.searchParams.get('id')); x.contentDetails.boundStreamId = url.searchParams.get('streamId'); x.status.lifeCycleStatus = 'ready'; return send(x) }
  if (p === '/liveBroadcasts' && req.method === 'GET') return send({ items: broadcasts })
  if (p === '/liveBroadcasts' && req.method === 'PUT') { const b = JSON.parse(body); const x = broadcasts.find(y => y.id === b.id); Object.assign(x.snippet, b.snippet); return send(x) }
  if (p === '/liveBroadcasts/transition') { const x = broadcasts.find(b => b.id === url.searchParams.get('id')); x.status.lifeCycleStatus = 'complete'; return send(x) }
  send({ error: { message: 'nie ma ' + p } }, 404)
})

server.listen(0, '127.0.0.1', async () => {
  try {
    process.env.KNS_YT_BASE = 'http://127.0.0.1:' + server.address().port
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'))
    const createYouTube = require('./youtube.cjs')
    const yt = createYouTube({ dir: () => dir, open: () => {} })
    assert.deepEqual(yt.status(), { loggedIn: false, channel: '', channelId: '' })
    await assert.rejects(yt.broadcasts(), /Połącz aplikację z kanałem YouTube/)
    fail = 2 // błąd po stronie Google dwa razy — trzecia próba się udaje
    assert.equal((await yt.login()).channel, 'Kościół Na Skale')
    assert.match(fs.readFileSync(path.join(dir, 'youtube-bledy.txt'), 'utf8'), /channels 500 Internal error encountered/)

    // stały klucz: tworzony raz, potem ten sam
    const k1 = await yt.streamKey(), k2 = await yt.streamKey()
    assert.equal(k1.key, 'klucz-123'); assert.equal(k1.id, k2.id); assert.equal(streams.length, 1)
    assert.equal(streams[0].contentDetails.isReusable, true)
    // po ponownym uruchomieniu (nowy obiekt) — z zapisanego pliku, bez logowania
    const yt2 = createYouTube({ dir: () => dir, open: () => {} })
    assert.equal(yt2.status().channel, 'Kościół Na Skale')

    const b = await yt2.createBroadcast({ title: 'Nabożeństwo 25.10.2026 — Rodzina dla Pana', description: 'Pieśni: …', start: '2026-10-25T10:12:00.000Z', privacy: 'unlisted' })
    assert.equal(b.streamId, k1.id); assert.equal(b.status, 'ready'); assert.equal(b.url, 'https://youtu.be/' + b.id)
    assert.equal(broadcasts[0].contentDetails.enableAutoStart, true)
    const ov = await yt2.overview()
    assert.equal(ov.broadcasts.length, 1); assert.equal(ov.stream.key, 'klucz-123')
    assert.equal((await yt2.updateBroadcast({ ...b, title: 'Nowy tytuł' })).title, 'Nowy tytuł')
    assert.equal((await yt2.endBroadcast(b.id)).status, 'complete')
    assert.equal((await yt2.broadcasts()).length, 0) // zakończone znikają z listy
    await assert.rejects(yt2.createBroadcast({ title: 'x', start: '2026-10-25T10:00:00Z', privacy: 'zly' }), /nie są włączone transmisje na żywo/)
    yt2.logout()
    assert.equal(yt2.status().loggedIn, false)
    console.log('youtube: wszystkie testy OK')
    server.closeAllConnections(); server.close()
  } catch (e) { console.error(e); process.exit(1) }
})
