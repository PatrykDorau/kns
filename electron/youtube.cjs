// YouTube dla pulpitu streamu: logowanie kontem kanału kościoła (osobno od Dysku — kanał bywa na innym koncie
// albo koncie marki), stały klucz transmisji (jeden „strumień” wielokrotnego użytku — w OBS albo ATEM ustawia się go
// raz), transmisje (tworzenie z tytułem i opisem z nabożeństwa, zmiana, zakończenie) i stan sygnału.
// Interfejs: YouTube Data API v3 (w Google Cloud musi być włączony dla projektu klienta z google-config.cjs).
// Zależności z zewnątrz (dir, open, encrypt/decrypt), żeby test działał bez Electrona; KNS_YT_BASE — podstawiony serwer.
const http = require('node:http')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const CONFIG = require('./google-config.cjs')

const TEST_BASE = process.env.KNS_YT_BASE || ''
const API = (TEST_BASE || 'https://www.googleapis.com') + '/youtube/v3'
const TOKEN = TEST_BASE ? TEST_BASE + '/token' : 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/youtube'
const STREAM_TITLE = 'KNS Nabo — stały klucz'

// Który krok się nie udał (do komunikatu i dziennika).
const STEP = { channels: 'odczyt kanału', liveStreams: 'klucz transmisji', liveBroadcasts: 'transmisje' }
const stepOf = p => STEP[(p.match(/^\/(\w+)/) || [])[1]] || 'YouTube'
// Błędy YouTube po ludzku (najczęstsze przy pierwszym ustawianiu).
function explain(status, data) {
  const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || ''
  const msg = data?.error?.message || ''
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + msg)) return 'W Google Cloud (projekt aplikacji) nie jest włączony „YouTube Data API v3” — włącz go i spróbuj ponownie.'
  if (/liveStreamingNotEnabled/i.test(reason)) return 'Na tym kanale nie są włączone transmisje na żywo — YouTube Studio → Transmisja na żywo (pierwsze włączenie trwa do 24 godzin).'
  if (/youtubeSignupRequired|noChannel/i.test(reason)) return 'To konto Google nie ma kanału YouTube — zaloguj się kontem (albo kontem marki) kanału kościoła.'
  if (/insufficientPermissions|forbidden/i.test(reason) || status === 403) return 'Brak uprawnień do tego kanału — zaloguj się kontem właściciela albo menedżera kanału.'
  if (/invalidScheduledStartTime/i.test(reason)) return 'YouTube planuje transmisje tylko na przyszłość — godzina tego nabożeństwa już minęła (albo jest za daleko). Do nadawania teraz użyj „Rozpocznij transmisję”.'
  if (/quotaExceeded|rateLimitExceeded/i.test(reason)) return 'Dzienny limit zapytań do YouTube się wyczerpał — spróbuj jutro.'
  if (status >= 500) return 'YouTube zgłosił błąd po swojej stronie („' + (msg || 'Internal error') + '”). Spróbuj ponownie za chwilę.'
  return msg || `YouTube odpowiedział błędem ${status}.`
}

module.exports = function createYouTube({ dir, open, encrypt = s => Buffer.from(s), decrypt = b => b.toString() }) {
  const file = () => path.join(dir(), 'youtube-auth.bin')
  let auth = null // { refresh, access, expires, channel, channelId, streamId }
  try { auth = JSON.parse(decrypt(fs.readFileSync(file()))) } catch { auth = null }
  const save = () => fs.writeFileSync(file(), encrypt(JSON.stringify(auth)))
  // Dziennik błędów (bez tokenów i kluczy): youtube-bledy.txt w folderze danych aplikacji — do diagnozy.
  function logError(line) {
    try {
      const f = path.join(dir(), 'youtube-bledy.txt')
      const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').slice(-80).join('\n') : ''
      fs.writeFileSync(f, old + new Date().toISOString() + ' ' + line + '\n')
    } catch { /* dziennik nie jest konieczny */ }
  }
  const needLogin = () => Object.assign(new Error('Połącz aplikację z kanałem YouTube (logowanie wygasło albo nie było go).'), { needLogin: true })

  async function tokenRequest(params) {
    const res = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CONFIG.clientId, client_secret: CONFIG.clientSecret || '', ...params }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || 'Logowanie nie powiodło się.'), { code: data.error })
    return data
  }
  async function accessToken() {
    if (!auth?.refresh) throw needLogin()
    if (auth.access && auth.expires > Date.now() + 60000) return auth.access
    let data
    try { data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh }) } catch (e) {
      if (e.code === 'invalid_grant') { auth = null; fs.rmSync(file(), { force: true }); throw needLogin() }
      throw e
    }
    auth.access = data.access_token
    auth.expires = Date.now() + (Number(data.expires_in) || 3600) * 1000
    save()
    return auth.access
  }
  // Zapytanie do YouTube: 401 → nowy token; błąd po stronie Google (5xx) → do dwóch powtórek.
  async function call(method, pathAndQuery, body, attempt = 0) {
    const token = await accessToken()
    const res = await fetch(API + pathAndQuery, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    if (res.status === 401 && attempt === 0) { auth.access = ''; return call(method, pathAndQuery, body, 1) }
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
    if (res.status >= 500 && attempt < 2) {
      logError(`${method} ${pathAndQuery.split('?')[0]} ${res.status} ${data?.error?.message || ''} — powtarzam`)
      await new Promise(r => setTimeout(r, TEST_BASE ? 10 : 800 * (attempt + 1)))
      return call(method, pathAndQuery, body, attempt + 1)
    }
    if (!res.ok) {
      const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || ''
      logError(`${method} ${pathAndQuery.split('?')[0]} ${res.status} ${reason} ${data?.error?.message || ''}`)
      throw new Error(stepOf(pathAndQuery) + ': ' + explain(res.status, data))
    }
    return data
  }
  // Nazwa kanału (po zalogowaniu; błąd po stronie Google nie przekreśla logowania — spróbujemy później).
  async function loadChannel() {
    const ch = (await call('GET', '/channels?part=snippet&mine=true')).items?.[0]
    if (!ch) throw new Error('To konto Google nie ma kanału YouTube — wybierz konto (albo konto marki) kanału kościoła.')
    auth.channel = ch.snippet?.title || ''
    auth.channelId = ch.id
    save()
  }

  // Logowanie w przeglądarce (jak Dysk): zgoda Google → powrót na chwilowy adres 127.0.0.1.
  async function login() {
    let code = 'test', redirect = 'http://127.0.0.1', verifier = 'test'
    if (!TEST_BASE) {
      const b64 = buf => buf.toString('base64url')
      verifier = b64(crypto.randomBytes(32))
      const challenge = b64(crypto.createHash('sha256').update(verifier).digest())
      const state = b64(crypto.randomBytes(16))
      ;({ code, redirect } = await new Promise((resolve, reject) => {
        let port = 0, done = false
        const server = http.createServer((req, res) => {
          const url = new URL(req.url, 'http://127.0.0.1')
          if (url.pathname !== '/' || done) { res.writeHead(404).end(); return }
          done = true
          const ok = url.searchParams.get('state') === state && url.searchParams.get('code')
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>Kościół Na Skale</title>
<body style="font:18px system-ui;background:#0f1013;color:#f4eee6;display:grid;place-items:center;height:90vh;text-align:center">
<div>${ok ? '<h2>Połączono z YouTube ✓</h2><p>Możesz zamknąć tę kartę i wrócić do aplikacji.</p>' : '<h2>Logowanie przerwane</h2><p>Wróć do aplikacji i spróbuj ponownie.</p>'}</div>`)
          clearTimeout(timer)
          server.close()
          ok ? resolve({ code: url.searchParams.get('code'), redirect: `http://127.0.0.1:${port}` })
            : reject(new Error(url.searchParams.get('error') === 'access_denied' ? 'Logowanie anulowane.' : 'Logowanie przerwane.'))
        })
        const timer = setTimeout(() => { server.close(); reject(new Error('Logowanie nie zostało dokończone w ciągu 5 minut.')) }, 5 * 60000)
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port
          open('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
            client_id: CONFIG.clientId, redirect_uri: `http://127.0.0.1:${port}`, response_type: 'code', scope: SCOPE,
            code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account', state,
          }))
        })
      }))
    }
    let data
    try { data = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect }) } catch (e) { logError('token ' + (e.code || '') + ' ' + e.message); throw e }
    auth = { refresh: data.refresh_token, access: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 }
    save()
    try { await loadChannel() } catch (e) {
      if (/nie ma kanału/.test(e.message)) { logout(); throw e }
      throw e // zalogowane — nazwa kanału dojdzie przy następnym odświeżeniu
    }
    return status()
  }
  function logout() { auth = null; fs.rmSync(file(), { force: true }) }
  const status = () => ({ loggedIn: !!auth?.refresh, channel: auth?.channel || '', channelId: auth?.channelId || '' })

  // Stały klucz: strumień wielokrotnego użytku — ten sam w każdą niedzielę.
  const mapStream = s => ({ id: s.id, url: s.cdn?.ingestionInfo?.ingestionAddress || '', key: s.cdn?.ingestionInfo?.streamName || '',
    backupUrl: s.cdn?.ingestionInfo?.backupIngestionAddress || '', status: s.status?.streamStatus || '', health: s.status?.healthStatus?.status || '' })
  async function streamKey() {
    if (auth?.streamId) {
      const s = (await call('GET', '/liveStreams?part=id,snippet,cdn,status&id=' + auth.streamId)).items?.[0]
      if (s) return mapStream(s)
    }
    const list = (await call('GET', '/liveStreams?part=id,snippet,cdn,status,contentDetails&mine=true&maxResults=50')).items || []
    let s = list.find(x => x.snippet?.title === STREAM_TITLE)
    if (!s) {
      s = await call('POST', '/liveStreams?part=id,snippet,cdn,status,contentDetails', {
        snippet: { title: STREAM_TITLE, description: 'Klucz transmisji aplikacji Kościoła Na Skale (OBS albo ATEM). Nie usuwaj.' },
        cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
        contentDetails: { isReusable: true },
      })
    }
    auth.streamId = s.id
    save()
    return mapStream(s)
  }

  const mapBroadcast = b => ({ id: b.id, title: b.snippet?.title || '', description: b.snippet?.description || '', start: b.snippet?.scheduledStartTime || '',
    status: b.status?.lifeCycleStatus || '', privacy: b.status?.privacyStatus || '', streamId: b.contentDetails?.boundStreamId || '', url: 'https://youtu.be/' + b.id,
    autoStart: !!b.contentDetails?.enableAutoStart, monitor: !!b.contentDetails?.monitorStream?.enableMonitorStream })
  // Zaplanowane i trwające transmisje kanału (najbliższe na górze).
  async function broadcasts() {
    const items = (await call('GET', '/liveBroadcasts?part=id,snippet,status,contentDetails&mine=true&maxResults=25')).items || []
    return items.map(mapBroadcast).filter(b => ['created', 'ready', 'testStarting', 'testing', 'liveStarting', 'live'].includes(b.status))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  }
  // Nowa transmisja od razu połączona ze stałym kluczem; sama startuje, gdy przyjdzie obraz, i kończy się po nim.
  async function createBroadcast({ title, description, start, privacy }) {
    const b = await call('POST', '/liveBroadcasts?part=id,snippet,status,contentDetails', {
      snippet: { title: String(title).slice(0, 100), description: String(description || '').slice(0, 5000), scheduledStartTime: start },
      status: { privacyStatus: privacy || 'public', selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: true, enableAutoStop: true, enableDvr: true, latencyPreference: 'normal', monitorStream: { enableMonitorStream: false } },
    })
    const s = await streamKey()
    const bound = await call('POST', `/liveBroadcasts/bind?part=id,snippet,status,contentDetails&id=${b.id}&streamId=${s.id}`)
    return mapBroadcast(bound)
  }
  async function updateBroadcast({ id, title, description, start, privacy }) {
    const b = await call('PUT', '/liveBroadcasts?part=id,snippet,status', {
      id, snippet: { title: String(title).slice(0, 100), description: String(description || '').slice(0, 5000), scheduledStartTime: start },
      status: { privacyStatus: privacy || 'public' },
    })
    return mapBroadcast(b)
  }
  // Transmisja z YouTube Studio bywa podpięta pod inny klucz — przed nadawaniem przepinamy ją na stały klucz aplikacji.
  async function bindToKey(id) {
    const s = await streamKey()
    return mapBroadcast(await call('POST', `/liveBroadcasts/bind?part=id,snippet,status,contentDetails&id=${id}&streamId=${s.id}`))
  }
  // Ręczne „na żywo” (transmisje bez automatycznego startu): gdy YouTube widzi obraz — przez „test”, jeśli ma podgląd.
  async function goLive(id) {
    const get = async () => mapBroadcast((await call('GET', '/liveBroadcasts?part=id,snippet,status,contentDetails&id=' + id)).items?.[0] || {})
    let b = await get()
    if (b.status === 'live' || b.status === 'liveStarting') return b
    if (b.monitor && !['testing', 'testStarting'].includes(b.status)) {
      await call('POST', `/liveBroadcasts/transition?part=status&broadcastStatus=testing&id=${id}`)
      for (let i = 0; i < 20 && (b = await get()).status !== 'testing'; i++) await new Promise(r => setTimeout(r, TEST_BASE ? 10 : 2000))
    }
    return mapBroadcast(await call('POST', `/liveBroadcasts/transition?part=id,snippet,status,contentDetails&broadcastStatus=live&id=${id}`))
  }
  async function endBroadcast(id) { return mapBroadcast(await call('POST', `/liveBroadcasts/transition?part=id,snippet,status,contentDetails&broadcastStatus=complete&id=${id}`)) }
  async function deleteBroadcast(id) { await call('DELETE', '/liveBroadcasts?id=' + id); return { ok: true } }

  // Wszystko dla pulpitu naraz: kanał, klucz ze stanem sygnału, transmisje.
  async function overview() {
    if (!auth?.refresh) return { ...status() }
    if (!auth.channelId) await loadChannel()
    const [stream, list] = await Promise.all([streamKey(), broadcasts()])
    return { ...status(), stream, broadcasts: list }
  }

  return { login, logout, status, streamKey, broadcasts, createBroadcast, updateBroadcast, endBroadcast, deleteBroadcast, overview, bindToKey, goLive }
}
