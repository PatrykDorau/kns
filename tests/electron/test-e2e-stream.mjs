// Pełny test: ukryta aplikacja, kamera testowa, podstawiony YouTube, lokalny serwer RTMP, pośrednik do zerwania łącza.
// Wszystko klikane przez przyciski w interfejsie. Bez prawdziwych usług. Po npm run build: node tests/electron/test-e2e-stream.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const project = process.cwd()
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kns-e2e-'))
const dir = path.join(out, 'e2e-stream'), profile = path.join(dir, 'profil')
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
const ffmpeg = path.join(project, 'node_modules/ffmpeg-static/ffmpeg.exe')
const wait = ms => new Promise(r => setTimeout(r, ms))
const SINK = 19391, PROXY = 19392, YT = 19393
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log((cond ? 'OK   ' : 'BŁĄD ') + name + (extra ? ' — ' + extra : '')) }

/* ---------- podstawiony YouTube ---------- */
const calls = [], streams = [], broadcasts = []
let id = 0
const yt = http.createServer(async (req, res) => {
  let body = ''
  for await (const ch of req) body += ch
  const url = new URL(req.url, 'http://x')
  const send = (data, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
  if (url.pathname === '/token') return send({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 })
  const p = url.pathname.replace('/youtube/v3', '')
  calls.push(req.method + ' ' + p + (url.searchParams.get('broadcastStatus') ? ' ' + url.searchParams.get('broadcastStatus') : ''))
  if (p === '/channels') return send({ items: [{ id: 'UC1', snippet: { title: 'Kanał testowy' } }] })
  if (p === '/liveStreams' && req.method === 'POST') {
    const b = JSON.parse(body)
    const s = { id: 'S' + ++id, snippet: b.snippet, cdn: { ingestionInfo: { ingestionAddress: `rtmp://127.0.0.1:${PROXY}/live2`, streamName: 'k' } }, status: { streamStatus: 'inactive', healthStatus: { status: 'noData' } }, contentDetails: b.contentDetails }
    streams.push(s); return send(s)
  }
  if (p === '/liveStreams') {
    const act = upstream > 0 && !cut
    for (const s of streams) { s.status.streamStatus = act ? 'active' : 'inactive'; s.status.healthStatus.status = act ? 'good' : 'noData' }
    if (act) for (const b of broadcasts) if (b.contentDetails.enableAutoStart && b.status.lifeCycleStatus === 'ready') b.status.lifeCycleStatus = 'live'
    return send({ items: streams })
  }
  if (p === '/liveBroadcasts' && req.method === 'POST') { const b = JSON.parse(body); const x = { id: 'B' + ++id, snippet: b.snippet, status: { ...b.status, lifeCycleStatus: 'created' }, contentDetails: b.contentDetails }; broadcasts.push(x); return send(x) }
  if (p === '/liveBroadcasts/bind') { const x = broadcasts.find(b => b.id === url.searchParams.get('id')); x.contentDetails.boundStreamId = url.searchParams.get('streamId'); x.status.lifeCycleStatus = 'ready'; return send(x) }
  if (p === '/liveBroadcasts/transition') { const x = broadcasts.find(b => b.id === url.searchParams.get('id')); x.status.lifeCycleStatus = url.searchParams.get('broadcastStatus'); return send(x) }
  if (p === '/liveBroadcasts' && req.method === 'GET') {
    const of = { upcoming: ['created', 'ready', 'testing'], active: ['liveStarting', 'live'] }[url.searchParams.get('broadcastStatus')]
    return send({ items: broadcasts.filter(b => !of || of.includes(b.status.lifeCycleStatus)) })
  }
  if (p === '/videos') return send({ items: [] })
  send({ error: { message: 'nie ma ' + p } }, 404)
})
await new Promise(r => yt.listen(YT, '127.0.0.1', r))

/* ---------- RTMP i pośrednik ---------- */
let sink = null, parts = 0, cut = false, upstream = 0
const held = new Set()
function startSink() {
  const file = path.join(dir, 'czesc' + ++parts + '.flv')
  sink = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-i', `rtmp://127.0.0.1:${SINK}/live2/k`, '-c', 'copy', '-y', file], { windowsHide: true, stdio: 'ignore' })
  return file
}
const proxy = net.createServer(client => {
  client.on('error', () => {})
  if (cut) { client.pause(); held.add(client); return }
  const up = net.connect(SINK, '127.0.0.1')
  upstream++
  client.on('error', () => up.destroy()); up.on('error', () => client.destroy())
  const pipe = (from, to) => from.on('data', b => { if (cut) from.pause(); else to.write(b) })
  pipe(client, up); pipe(up, client)
  client.on('close', () => { up.destroy() }); up.on('close', () => { upstream = Math.max(0, upstream - 1); client.destroy() })
  held.add(client); held.add(up)
})
await new Promise(r => proxy.listen(PROXY, '127.0.0.1', r))
const parts0 = startSink()
await wait(800)

/* ---------- aplikacja ---------- */
const env = { ...process.env, RZUTNIK_HIDDEN: '1', KNS_CUE_BASE: 'http://127.0.0.1:9', KNS_YT_BASE: `http://127.0.0.1:${YT}` }
delete env.ELECTRON_RUN_AS_NODE
const proc = spawn(path.join(project, 'node_modules/electron/dist/electron.exe'), ['.', '--user-data-dir=' + profile, '--remote-debugging-port=9334', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], { cwd: project, env, stdio: 'ignore' })
let target
for (let i = 0; i < 40 && !target; i++) { await wait(500); try { target = (await (await fetch('http://127.0.0.1:9334/json')).json()).find(t => t.type === 'page' && !/output|stage/i.test(t.url)) } catch { /* startuje */ } }
if (!target) { proc.kill(); throw new Error('Brak okna') }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let n = 0
const pending = new Map(), errors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' ').slice(0, 300))
})
const send = (method, params = {}) => new Promise(r => { const i = ++n; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const HELP = `const w=ms=>new Promise(r=>setTimeout(r,ms));
const $$=s=>[...document.querySelectorAll(s)];
const byText=(t,s='button')=>$$(s).find(b=>b.innerText.trim()===t)||$$(s).find(b=>b.innerText.includes(t));
const clk=async(t,s)=>{const b=byText(t,s); if(!b) throw new Error('nie ma przycisku: '+t); b.click(); await w(250); return true};
const setv=async(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));await w(120)};
const st=window.rzutnikStream?.studio, s=window.rzutnik;`
const ev = async x => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${HELP}${x}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'błąd'); return r.result?.result?.value }
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(dir, name), Buffer.from(r.result.data, 'base64')) }
const until = async (x, ms = 20000) => { const e = Date.now() + ms; for (;;) { if (await ev(x)) return true; if (Date.now() > e) return false; await wait(300) } }
const answerYes = () => ev(`await w(250); const b=$$('.ask-panel button').find(x=>x.innerText.trim()==='Tak'); if(!b) throw new Error('brak okna pytania'); b.click(); await w(300); return 1`)

try {
  await wait(1500)
  await ev(`s.applyAccess({status:'active',roles:['admin'],edit:true,manage:true}); s.settings.streamEngine='studio'; s.settings.railFolded=false; s.settings.deskLayout='cols'; s.settings.cdLook={...(s.settings.cdLook||{}),title:'STARY NAPIS'}; s.settings.streamFps=30; s.settings.streamQuality='720'; s.role.value='stream'; await w(3000); return 1`)

  /* ---------- Studio bez konfiguracji ---------- */
  await ev(`await clk('Odliczanie','.desk-scenes button'); await w(400); return 1`)
  ok('Odliczanie: kafelki presetów', await ev(`return $$('.pz-card').length>=2`), await ev(`return $$('.pz-card').map(c=>c.innerText.replace(/\\s+/g,' ')).join(' | ')`))
  ok('Odliczanie: brak pól konfiguracji w Studio', await ev(`return !$$('.desk-stage-rest input').some(i=>/ZACZYNAMY/.test(i.placeholder))&&!$$('.desk-stage-rest .desk-layouts').length&&!$$('.desk-bgs').length`))
  ok('stary wygląd przeniesiony do presetu', await ev(`return s.settings.studioPresets.some(p=>p.kind==='cd'&&p.data.title==='STARY NAPIS')`))
  ok('zegar odliczania zostaje w Studio', await ev(`return !!byText('10 min','.desk-opt-group button')`))
  await ev(`await clk('Koniec','.desk-scenes button'); await w(300); return 1`)
  ok('Koniec: kafelki bez pól', await ev(`return $$('.pz-card').length>=2&&!$$('.desk-stage-rest .desk-bgs').length`))
  await ev(`await clk('Kamera','.desk-scenes button'); await clk('Baner','.ovl-btn'); await w(300); return 1`)
  ok('Baner: kafelki, bez edytora i bez czerwonego pytania', await ev(`return $$('.pz-card').length>=2&&!$$('.desk-banner').length&&!$$('.ovl-ask').length`))
  ok('Baner: włączenie nie idzie na wizję', await ev(`return st.preview.endOvl&&!st.program.endOvl`))
  await shot('1-studio-baner.png')
  await ev(`await clk('Baner','.ovl-btn'); await w(200); return 1`)

  /* ---------- Przygotowanie: po jednym nowym presecie każdego rodzaju ---------- */
  await ev(`await clk('Przygotowanie','.desk-mode button'); await w(500); return 1`)
  ok('Przygotowanie otwarte, sceny schowane', await ev(`return !!document.querySelector('.prep')&&!document.querySelector('.desk-scenes')`))
  const makers = [
    ['Odliczanie', 'Duży zegar test', 'Przed nabożeństwem', `await setv($$('.desk-cd-text input')[0],'TEST ZEGAR'); await clk('Duży zegar','.desk-layout'); await clk('Góry','.desk-bg');`],
    ['Koniec', 'Koniec kamera', 'Z kamerą w tle', `await clk('Duży napis','.desk-opt-group button'); await clk('Kamera','.desk-bg'); await setv($$('.desk-cd-text input')[0],'TEST KONIEC');`],
    ['Baner', 'Zbiórka test', 'Po kazaniu', `await setv($$('.desk-cd-text input')[0],'TEST BANER'); await clk('Pasek','.desk-opt-group button');`],
    ['Modlitwa', 'Modlitwa test', 'Czas modlitwy', `await setv($$('.desk-cd-text input')[1],'TEST MODLITWA');`],
    ['Pasek mówcy', 'Gość test', 'Gość z daleka', `await setv($$('.desk-cd-text input')[0],'TEST MÓWCA'); await setv($$('.desk-cd-text input')[1],'Gość specjalny');`],
  ]
  for (const [kind, name, desc, edit] of makers) {
    await ev(`await clk(${JSON.stringify(kind)},'.prep-kinds button'); await clk('Nowy preset','.prep-add'); await w(300); const f=$$('.prep-head input'); await setv(f[0],${JSON.stringify(name)}); await setv(f[1],${JSON.stringify(desc)}); ${edit} await w(300); return 1`)
    ok(`Przygotowanie: utworzony „${name}”`, await ev(`return s.settings.studioPresets.some(p=>p.name===${JSON.stringify(name)}&&p.desc===${JSON.stringify(desc)})`))
  }
  ok('edycja trafia do presetu, nie do ustawień', await ev(`const p=s.settings.studioPresets.find(x=>x.name==='Duży zegar test'); return p.data.title==='TEST ZEGAR'&&p.data.layout==='center'&&s.settings.cdLook.title==='ZACZYNAMY ZA'`))
  ok('duży podgląd presetu coś rysuje', await ev(`const c=document.querySelector('.prep-canvas'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let v=new Set(); for(let i=0;i<d.length;i+=4001)v.add(d[i]); return v.size>4`))
  await shot('2-przygotowanie.png')
  await ev(`await clk('Baner','.prep-kinds button'); await w(300); await clk('Duplikuj','.prep-head button'); await w(200); return 1`)
  ok('Duplikuj', await ev(`return s.settings.studioPresets.some(p=>/\\(kopia\\)/.test(p.name))`))
  await ev(`await clk('Usuń','.prep-head button'); return 1`); await answerYes()
  ok('Usuń (z pytaniem)', await ev(`await w(200); return !s.settings.studioPresets.some(p=>/\\(kopia\\)/.test(p.name))`))
  await ev(`await clk('Studio','.desk-mode button'); await w(500); return 1`)

  /* ---------- start przez przyciski ---------- */
  await ev(`await clk('Połącz z YouTube','button'); await w(1500); return 1`)
  ok('YouTube połączony', await until(`return !!byText('Rozpocznij','.desk-golive')`, 10000))
  ok('kamera testowa gra', await until(`return !st.error||!/kamer/i.test(st.error)`, 8000), await ev(`return st.camera?'wybrana':'brak'`))
  await ev(`await clk('Rozpocznij','.desk-golive'); return 1`)
  ok('transmisja ruszyła', await until(`return /NA ŻYWO/.test(document.querySelector('.desk-onair')?.innerText||'')`, 30000), await ev(`return (document.querySelector('.note.bad')?.innerText||'')+' '+(st.error||'')+' sprzęt:'+st.hardware`))
  ok('nowa transmisja bez auto-końca', broadcasts[0]?.contentDetails?.enableAutoStop === false)
  ok('YouTube przeszedł na żywo', await (async () => { for (let i = 0; i < 30; i++) { if (broadcasts[0]?.status.lifeCycleStatus === 'live') return true; await wait(1000) } return false })(), broadcasts[0]?.status.lifeCycleStatus)
  await wait(3000)

  /* ---------- przełączanie w trakcie: preset → podgląd → na wizję ---------- */
  await ev(`await clk('Odliczanie','.desk-scenes button'); await w(400); await clk('Duży zegar test','.pz-main'); await w(300); return 1`)
  ok('preset na podglądzie, wizja bez zmian', await ev(`return st.program.scene==='camera'&&s.settings.cdLook.title==='TEST ZEGAR'&&!!document.querySelector('.pz-card.on')`))
  ok('„Na wizję” gotowe', await ev(`return !byText('Na wizję','.desk-take button').disabled`))
  await ev(`await clk('Na wizję','.desk-take button'); await w(900); return 1`)
  ok('Odliczanie na wizji, kafelek czerwony', await ev(`return st.program.scene==='countdown'&&st.program.styles.cd.title==='TEST ZEGAR'&&!!document.querySelector('.pz-card.live')`))
  await wait(4000); await shot('3-odliczanie-na-wizji.png')
  await ev(`await clk('Koniec','.desk-scenes button'); await w(400); await clk('Koniec kamera','.pz-main'); await clk('Na wizję','.desk-take button'); await w(900); return 1`)
  ok('Koniec na wizji', await ev(`return st.program.scene==='end'&&st.program.styles.end.title==='TEST KONIEC'`))
  await wait(4000)
  await ev(`await clk('Kamera','.desk-scenes button'); await clk('Na wizję','.desk-take button'); await w(700); await clk('Baner','.ovl-btn'); await w(400); await clk('Zbiórka test','.pz-main'); await w(300); return 1`)
  ok('baner na podglądzie, nie na wizji', await ev(`return st.preview.endOvl&&!st.program.endOvl`))
  ok('„Na wizję” przy banerze gotowe', await ev(`const b=document.querySelector('.pz-acts .desk-send'); return !!b`))
  await ev(`document.querySelector('.pz-acts .desk-send').click(); await w(900); return 1`)
  ok('baner na wizji', await ev(`return st.program.endOvl&&st.program.banner.list[0].title==='TEST BANER'&&!!document.querySelector('.pz-card.live')`))
  await wait(4000)
  await ev(`const c=$$('.pz-card').find(x=>!x.classList.contains('live')); c.querySelector('.pz-main').click(); await w(400); return 1`)
  ok('inny baner: wizja stoi, przycisk gotowy', await ev(`return st.program.banner.list[0].title==='TEST BANER'&&!!document.querySelector('.pz-acts .desk-send')&&!$$('.ovl-ask').length`))
  await ev(`await clk('Baner','.ovl-btn'); await w(400); return 1`)
  ok('wyłączenie banera od razu', await ev(`return !st.program.endOvl&&!st.preview.endOvl`))
  await ev(`await clk('Pasek mówcy','.ovl-btn'); await w(400); await clk('Gość test','.pz-main'); await w(400); return 1`)
  ok('pasek mówcy na podglądzie, nie na wizji', await ev(`return st.preview.lowerThird&&!st.program.lowerThird`))
  await ev(`document.querySelector('.pz-acts .desk-send').click(); await w(900); return 1`)
  ok('pasek mówcy na wizji z kopią', await ev(`return st.program.lowerThird&&st.program.lowerLook.name==='TEST MÓWCA'&&!!document.querySelector('.pz-card.live')`))
  await wait(3000)
  await ev(`await clk('Pasek mówcy','.ovl-btn'); await w(400); return 1`)
  ok('wyłączenie paska od razu', await ev(`return !st.program.lowerThird&&!st.preview.lowerThird`))
  await ev(`await clk('Modlitwa','.ovl-btn'); await w(400); await clk('Modlitwa test','.pz-main'); await w(300); document.querySelector('.pz-acts .desk-send').click(); await w(900); return 1`)
  ok('modlitwa na wizji z kopią', await ev(`return st.program.prayer&&st.program.prayerLook.text==='TEST MODLITWA'`))
  await wait(4000); await shot('4-modlitwa-na-wizji.png')
  await ev(`const p=s.settings.studioPresets.find(x=>x.name==='Modlitwa test'); await clk('Przygotowanie','.desk-mode button'); await w(400); await clk('Modlitwa','.prep-kinds button'); await clk('Modlitwa test','.prep-list button'); await w(300); await setv($$('.desk-cd-text input')[1],'ZMIENIONA'); await w(300); await clk('Studio','.desk-mode button'); await w(400); return 1`)
  ok('edycja presetu na wizji nie rusza obrazu', await ev(`return st.program.prayerLook.text==='TEST MODLITWA'&&s.settings.prayerText==='ZMIENIONA'`))
  await ev(`await clk('Modlitwa','.ovl-btn'); await w(400); return 1`)

  /* ---------- zerwanie internetu w trakcie ---------- */
  cut = true
  const t0 = Date.now()
  ok('zerwanie wykryte', await until(`return /Nie ma połączenia z YouTube/.test(document.body.innerText)`, 25000), Math.round((Date.now() - t0) / 1000) + ' s')
  await shot('5-zerwane.png')
  await wait(45000) // dłużej niż minuta bez obrazu w sumie — auto-koniec by tu zamknął transmisję
  ok('transmisja na YouTube nadal trwa po przerwie', broadcasts[0].status.lifeCycleStatus === 'live', Math.round((Date.now() - t0) / 1000) + ' s przerwy')
  for (const c of held) c.destroy()
  held.clear(); upstream = 0
  try { sink.kill() } catch { /* zamknięty */ }
  await wait(600)
  startSink(); await wait(800)
  cut = false
  const t1 = Date.now()
  ok('nadawanie wróciło samo', await until(`return /NA ŻYWO/.test(document.querySelector('.desk-onair')?.innerText||'')&&!/Nie ma połączenia/.test(document.body.innerText)`, 40000), Math.round((Date.now() - t1) / 1000) + ' s')
  await wait(6000)
  await ev(`await clk('Odliczanie','.desk-scenes button'); await clk('Na wizję','.desk-take button'); await w(500); return 1`)
  await wait(4000)
  ok('statystyki po wznowieniu', await ev(`return /Wznowienia/.test(document.body.innerText)`))

  /* ---------- koniec ---------- */
  await ev(`await clk('Zakończ transmisję','.desk-stop'); return 1`); await answerYes()
  ok('koniec w aplikacji', await until(`return !document.querySelector('.desk-onair')`, 10000))
  ok('koniec na YouTube', await (async () => { for (let i = 0; i < 10; i++) { if (broadcasts[0].status.lifeCycleStatus === 'complete') return true; await wait(500) } return false })(), broadcasts[0].status.lifeCycleStatus)
  await shot('6-po-koncu.png')
  await wait(1500)
} catch (e) {
  ok('przebieg testu', false, e.message)
  await shot('blad.png').catch(() => {})
}
ok('brak błędów w konsoli aplikacji', !errors.length, errors.slice(0, 4).join(' || '))
fs.writeFileSync(path.join(dir, 'wynik.json'), JSON.stringify({ results, errors, calls: calls.filter(c => !/GET/.test(c)) }, null, 1))
const bad = results.filter(r => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} OK`)
ws.close(); proc.kill(); try { sink.kill() } catch { /* zamknięty */ }
proxy.close(); yt.close(); for (const c of held) c.destroy()
await wait(1500)
process.exit(bad.length ? 1 : 0)
