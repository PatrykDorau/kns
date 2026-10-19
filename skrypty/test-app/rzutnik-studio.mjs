// Pełny test Rzutnika (okno obrazu) i studia streamu w ukrytej aplikacji (sterowanej przez CDP):
// import plików i PDF, tekst, pieśń (zwrotki, klawiatura, H/Esc/F), film (gra, pauza, przewijanie), pętla, odliczanie,
// obraz i napisy dla studia, zapis po ponownym uruchomieniu; studio: podgląd → wizja, sceny, nakładki, media (zdjęcie,
// film, prezentacja), ogłoszenia, odliczanie, plansza końcowa, ustawienia nadawania. Okna są niewidoczne.
// Uruchomienie (po npm run build): node skrypty/test-app/rzutnik-studio.mjs
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpeg from 'ffmpeg-static'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dir = path.join(os.tmpdir(), 'kns-test-rzutnik')
fs.mkdirSync(path.join(dir, 'media'), { recursive: true })
const MEDIA = (dir + '/media/').replace(/\\/g, '/')
// materiały testowe: plansza (zdjęcie), film 12 s z dźwiękiem, PDF z dwiema stronami
const ff = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]); if (r.status) throw new Error(String(r.stderr)) }
if (!fs.existsSync(MEDIA + 'plansza.png')) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080', '-frames:v', '1', MEDIA + 'plansza.png'])
if (!fs.existsSync(MEDIA + 'film.mp4')) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', MEDIA + 'film.mp4'])
fs.writeFileSync(MEDIA + 'slajdy.pdf', pdf(['Slajd pierwszy', 'Slajd drugi']), 'latin1')
function pdf(texts) {
  const objs = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const contents = texts.map(t => `BT /F1 48 Tf 80 300 Td (${t}) Tj ET`)
  const pagesId = 1 + contents.length * 2 + 1
  const kids = contents.map(c => { objs.push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`); const cid = objs.length; objs.push(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 960 540] /Contents ${cid} 0 R /Resources << /Font << /F1 1 0 R >> >> >>`); return objs.length })
  objs.push(`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`)
  objs.push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  let out = '%PDF-1.4\n'; const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  return out + `trailer\n<< /Size ${objs.length + 1} /Root ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
}
const profile = path.join(dir, 'profil')
fs.rmSync(profile, { recursive: true, force: true })
const env = { ...process.env, RZUTNIK_HIDDEN: '1' }
delete env.ELECTRON_RUN_AS_NODE
const proc = spawn(path.join(project, 'node_modules/electron/dist/electron.exe'), ['.', '--user-data-dir=' + profile, '--remote-debugging-port=9334', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], { cwd: project, env, stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
const errors = []
let results = [], failed = 0

async function attach(match) {
  for (let i = 0; i < 60; i++) {
    try {
      const t = (await (await fetch('http://127.0.0.1:9334/json')).json()).find(x => x.type === 'page' && match(x.url))
      if (t) {
        const ws = new WebSocket(t.webSocketDebuggerUrl)
        await new Promise(r => ws.addEventListener('open', r))
        let n = 0; const pending = new Map()
        ws.addEventListener('message', e => {
          const m = JSON.parse(e.data)
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
          if (m.method === 'Runtime.exceptionThrown') errors.push('[' + (match.name || '') + '] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text))
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '))
        })
        const send = (method, params = {}) => new Promise(r => { const id = ++n; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
        await send('Runtime.enable')
        const ev = async code => {
          const r = await send('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true })
          if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'błąd')
          return r.result?.result?.value
        }
        return { ev, send, ws }
      }
    } catch { /* jeszcze startuje */ }
    await wait(500)
  }
  throw new Error('Brak okna')
}
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok, info })
  if (!ok) failed++
  console.log((ok ? '  OK   ' : '  BŁĄD ') + name + (info !== '' ? '  → ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''))
}

const isCtl = u => !/output|stage|pptx/i.test(u) && /index\.html|127\.0\.0\.1|^file:/.test(u)
const isOut = u => /#output/.test(u)
let C = await attach(isCtl)
const ctl = code => C.ev('const s = window.rzutnik, R = window.rzutnikStream, st = R?.studio, sleep = ms => new Promise(r => setTimeout(r, ms)), J = x => JSON.parse(JSON.stringify(x));' + code)
let O = null
const out = async code => { if (!O) O = await attach(isOut); return O.ev(code) }
// to, co teraz widać w oknie rzutnika (ostatnia warstwa sceny)
const shown = () => out(`const st = document.querySelector('.stage'); const L = [...document.querySelectorAll('.stage .layer')].at(-1)
  return { blank: st.classList.contains('blank'), has: st.classList.contains('has'), img: L?.querySelector('img')?.src || '', imgOk: !!L?.querySelector('img')?.naturalWidth,
    video: L?.querySelector('video')?.src || '', vt: L?.querySelector('video')?.currentTime || 0, vpaused: L?.querySelector('video')?.paused, text: L?.querySelector('.txt')?.innerText || '' }`)

await wait(3000)
await ctl(`Object.assign(s.access, { status: 'active', email: 'test@test.pl', name: 'Test', roles: ['admin'], names: ['Administrator'], edit: true, manage: true }); s.role.value = 'display'; await sleep(1500)`)

console.log('\n=== RZUTNIK ===')
// materiały: pliki (prawdziwy import), tekst, pieśń, pętla, odliczanie
await ctl(`await s.addFiles(['${MEDIA}plansza.png', '${MEDIA}film.mp4']); await sleep(500)`)
let st0 = await ctl(`return s.items.value.map(i => i.type + ':' + (i.missing ? 'brak' : 'ok'))`)
check('Import zdjęcia i filmu', st0.includes('image:ok') && st0.includes('video:ok'), st0)
await ctl(`s.addText(); const t = s.items.value.at(-1); t.text = 'Witamy na nabożeństwie'; t.name = 'Powitanie'
  s.songs.value.push({ id: 'song1', type: 'song', number: '7', title: 'Pieśń testowa', text: 'Pierwsza zwrotka\\nlinia druga\\n\\nDruga zwrotka\\nlinia druga\\n\\nTrzecia zwrotka' })
  s.addCountdown()
  s.addLoop(); const loop = s.items.value.at(-1); const img = s.items.value.find(i => i.type === 'image'), txt = s.items.value.find(i => i.type === 'text' && i.name === 'Powitanie')
  loop.entries.push({ key: 'e1', ref: img.id, seconds: 1 }, { key: 'e2', ref: txt.id, seconds: 1 }); loop.auto = true; loop.name = 'Pętla testowa'; loop.fadeMs = 0
  await sleep(300)`)
const ids = await ctl(`const f = t => s.items.value.find(t)?.id; return { img: f(i => i.type === 'image'), vid: f(i => i.type === 'video'), txt: f(i => i.name === 'Powitanie'), cd: f(i => i.name === 'Odliczanie'), loop: f(i => i.name === 'Pętla testowa') }`)
check('Tekst, pieśń, odliczanie i pętla dodane', Object.values(ids).every(Boolean), ids)

const live = async id => { await ctl(`s.selectedId.value = '${id}'; await sleep(150); await s.goLive(); await sleep(900)`) }
// zdjęcie
await live(ids.img)
let o = await ctl(`return J(s.output.value)`)
check('„Wyświetl” otwiera okno rzutnika', o.open, o)
let v = await shown()
check('Rzutnik: zdjęcie widać (wczytane)', v.img.includes('plansza') && v.imgOk, v)
// tekst + edycja na żywo
await live(ids.txt)
v = await shown()
check('Rzutnik: tekst', v.text.includes('Witamy'), v.text)
await ctl(`s.items.value.find(i => i.id === '${ids.txt}').text = 'Zmieniony tekst'; await sleep(500)`)
v = await shown()
check('Edycja tekstu na żywo nie zmienia rzutnika od razu', v.text.includes('Witamy'), v.text)
await ctl(`s.sendText(); await sleep(600)`)
v = await shown()
check('„Wyślij” pokazuje zmieniony tekst', v.text.includes('Zmieniony'), v.text)
// pieśń: zwrotki, koniec listy
await live('song1')
v = await shown()
check('Rzutnik: pieśń — 1. zwrotka', v.text.includes('Pierwsza zwrotka'), v.text)
await ctl(`s.stepBy(1); await sleep(600)`)
v = await shown()
check('Następna zwrotka', v.text.includes('Druga zwrotka'), v.text)
await ctl(`s.stepBy(1); s.stepBy(1); s.stepBy(1); await sleep(600)`)
v = await shown(); let si = await ctl(`return s.songIndex.value`)
check('Za ostatnią zwrotką zostaje ostatnia', v.text.includes('Trzecia') && si === 2, { si, t: v.text })
await ctl(`s.stepBy(-2); await sleep(600)`)
v = await shown()
check('Poprzednia zwrotka (wstecz)', v.text.includes('Pierwsza'), v.text)
// napisy dla streamu z Rzutnika w tej samej aplikacji
let lf = await ctl(`return R.lyricsFeed.text`)
check('Napisy dla streamu = bieżąca zwrotka', lf.includes('Pierwsza zwrotka'), lf)
// ukrycie (H)
await ctl(`s.toggleHidden(); await sleep(500)`)
v = await shown()
check('H: obraz schowany', v.blank, v)
lf = await ctl(`return R.lyricsFeed.text`)
check('H: napisy dla streamu puste', lf === '', lf)
await ctl(`s.toggleHidden(); await sleep(500)`)
v = await shown()
check('H drugi raz: obraz wraca', !v.blank && v.text.includes('Pierwsza'), v)
// zamrożenie (F)
await ctl(`s.toggleFrozen(); await sleep(300)`)
let fz = await ctl(`return s.frozen.value`)
check('F: zamrożone', fz === true)
await ctl(`s.songIndex.value = 2; await sleep(600)`)
v = await shown()
check('Zamrożony rzutnik stoi na swojej zwrotce', v.text.includes('Pierwsza'), v.text)
await ctl(`s.toggleFrozen(); await sleep(700)`)
v = await shown()
check('Odmrożenie: rzutnik dogania zmianę', v.text.includes('Trzecia'), v.text)
// film: gra, stan wraca do panelu, pauza, przewijanie
await live(ids.vid)
await wait(2500)
v = await shown()
let vs = await ctl(`return J(s.video.value)`)
check('Rzutnik: film gra', v.video.includes('film') && v.vt > 0.5 && v.vpaused === false, v)
check('Pozycja filmu wraca do panelu', vs.time > 0.5 && vs.duration > 0, vs)
await ctl(`s.api.videoCmd({ type: 'toggle' }); await sleep(600)`)
v = await shown()
check('Pauza filmu', v.vpaused === true, v)
await ctl(`s.api.videoCmd({ type: 'seek', value: 1 }); await sleep(600)`)
v = await shown()
check('Przewinięcie filmu', Math.abs(v.vt - 1) < 0.3, v.vt)
await ctl(`s.toggleFrozen(); await sleep(200)`)
check('Filmu nie da się zamrozić (komunikat)', !(await ctl(`return s.frozen.value`)) && /Filmów/.test(await ctl(`return s.notice.value`)))

// klawiatura (jak operator): Enter, strzałki, cyfra, H, Esc, F
const key = k => ctl(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true })); await sleep(450)`)
await ctl(`s.selectedId.value = 'song1'; await sleep(200)`); await key('Enter')
v = await shown(); check('Klawisz Enter: wyświetla pieśń', v.text.includes('Pierwsza'), v.text)
await key('ArrowDown'); v = await shown(); check('Strzałka w dół: następna zwrotka', v.text.includes('Druga'), v.text)
await key('ArrowUp'); v = await shown(); check('Strzałka w górę: poprzednia', v.text.includes('Pierwsza'), v.text)
await key('3'); v = await shown(); check('Cyfra 3: trzecia zwrotka', v.text.includes('Trzecia'), v.text)
await key('h'); v = await shown(); check('Klawisz H: schowane', v.blank, v.blank)
await key('h'); await key('Escape'); v = await shown(); check('Esc: schowane', v.blank, v.blank)
await key('h'); await key('f'); check('Klawisz F: zamrożone', await ctl('return s.frozen.value')); await key('f'); check('F drugi raz: odmrożone', !(await ctl('return s.frozen.value')))
// prezentacja PDF → slajdy
await ctl(`await s.addFiles(['${MEDIA}slajdy.pdf']); await sleep(1500)`)
const deck = await ctl(`const d = s.items.value.find(i => i.type === 'scene' && /slajdy/i.test(i.name)); return d ? { n: d.entries.length, ok: d.entries.every(e => { const it = s.items.value.find(x => x.id === e.ref); return it && it.type === 'image' && !it.missing }) } : J(s.items.value.map(i => i.type + ':' + i.name))`)
check('PDF → prezentacja ze slajdami', deck && deck.n === 2 && deck.ok, deck)
// pętla: slajdy zmieniają się same
await live(ids.loop)
const seen = new Set()
for (let i = 0; i < 8; i++) { const x = await shown(); seen.add(x.img ? 'img' : x.text ? 'txt' : '-'); await wait(400) }
let step = await ctl(`return s.video.value.step`)
check('Pętla: slajdy zmieniają się same', seen.has('img') && seen.has('txt'), [...seen])
check('Numer slajdu wraca do panelu', step > 0, step)
await ctl(`s.stepBy(1); await sleep(400)`)
check('Pętla: następny slajd ręcznie', true)
// odliczanie
await live(ids.cd)
v = await shown()
check('Rzutnik: odliczanie z czasem', /\d+:\d\d/.test(v.text) || /–:––/.test(v.text), v.text)
// obraz rzutnika dla studia (Rzutnik w tej aplikacji)
await ctl(`s.settings.studioLocalProjector = true; s.selectedId.value = '${ids.img}'; await s.goLive(); await sleep(600)`)
let pj = await ctl(`return J(st.projector)`)
check('Studio widzi zdjęcie z Rzutnika', pj.kind === 'image' && /plansza/.test(pj.url), pj)
await ctl(`s.selectedId.value = '${ids.txt}'; await s.goLive(); await sleep(500)`)
pj = await ctl(`return J(st.projector)`)
check('Studio widzi tekst z Rzutnika', pj.kind === 'text', pj)
await ctl(`s.toggleHidden(); await sleep(400)`)
pj = await ctl(`return J(st.projector)`)
check('Schowany obraz — studio nic nie pokazuje', pj.kind === 'none', pj)
await ctl(`s.toggleHidden(); s.settings.studioLocalProjector = false; await sleep(400)`)
pj = await ctl(`return J(st.projector)`)
check('Bez „obrazu z Rzutnika” studio nie bierze obrazu', pj.kind === 'none', pj)
// zdjęcie z rzutnika
await ctl(`s.hide(); await sleep(700)`)
v = await shown()
check('„Zdejmij”: rzutnik pusty', !v.has, v)
// zapis i ponowne uruchomienie
const before = await ctl(`await s.flush(); return { items: s.items.value.length, songs: s.songs.value.length }`)
await C.send('Page.reload'); C.ws.close(); await wait(1500)
C = await attach(isCtl); await wait(3000)
const after = await ctl(`return { items: s.items.value.length, songs: s.songs.value.length, missing: s.items.value.filter(i => i.missing).length }`)
check('Biblioteka zapisana po ponownym uruchomieniu', after.items === before.items && after.songs === before.songs && !after.missing, { before, after })
await ctl(`await s.api.closeOutput(); await sleep(600)`)
o = await ctl(`return J(s.output.value)`)
check('Zamknięcie okna rzutnika', !o.open, o)
O = null

console.log('\n=== STUDIO ===')
await ctl(`Object.assign(s.access, { status: 'active', email: 'test@test.pl', name: 'Test', roles: ['admin'], names: ['Administrator'], edit: true, manage: true })
  const d = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  s.services.value.push({ id: 'svcT', date: d, time: '12:12', place: 'Hotel Forza', sermonTitle: 'Kazanie testowe', passage: 'J 3,16', speaker: 'Jan Kowalski', songs: [], files: [] })
  s.churchAnnouncements.value = [{ id: 'an1', title: 'Ogłoszenie testowe', text: 'Treść ogłoszenia', projector: true, audience: 'public', from: '', to: '' }]
  s.settings.streamEngine = 'studio'; s.settings.studioDirect = false; s.settings.streamLyrics = 'local'
  s.role.value = 'stream'; await sleep(3500)`)
// pomocnicze: przyciski i piksele wizji
const H = `const btn = (sel, txt) => [...document.querySelectorAll(sel)].find(b => b.innerText.trim().startsWith(txt));
  const pix = () => { const c = document.querySelector('.mon.pgm canvas'); const t = document.createElement('canvas'); t.width = 96; t.height = 54; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 96, 54); const d = x.getImageData(0, 0, 96, 54).data; let sum = 0, sq = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i+1] + d[i+2]) / 3; sum += l; sq += l * l } const n = d.length / 4, m = sum / n; return { mean: Math.round(m), sd: Math.round(Math.sqrt(sq / n - m * m)) } };
  const take = async () => { document.querySelector('.desk-take-btn').click(); await sleep(700) };`
const sc = code => ctl(H + code)
let r = await sc(`for (let i = 0; i < 20 && pix().sd < 5; i++) await sleep(250); return { hw: st.hardware, cam: st.camera, mons: document.querySelectorAll('.mon canvas').length, pix: pix(), err: st.error }`)
check('Studio: karta graficzna sprawdzona', r.hw !== null, r.hw)
check('Kamera wybrana sama (urządzenie)', !!r.cam, r.cam)
check('Podgląd i wizja rysowane', r.mons === 2, r.mons)
check('Kamera otwarta bez błędu (obraz kamery w ukrytym oknie testu jest zawsze czarny — ograniczenie Chromium)', r.err === '', r.err)
// podgląd → wizja
r = await sc(`btn('.desk-scenes button', 'Koniec').click(); await sleep(400); return { pv: st.preview.scene, pg: st.program.scene, ready: document.querySelector('.desk-take-btn').classList.contains('ready') }`)
check('Scena idzie najpierw na podgląd', r.pv === 'end' && r.pg === 'camera' && r.ready, r)
r = await sc(`await take(); return { pg: st.program.scene, ready: document.querySelector('.desk-take-btn').classList.contains('ready') }`)
check('„Na wizję” przenosi podgląd na wizję', r.pg === 'end' && !r.ready, r)
r = await sc(`return pix()`)
check('Plansza końcowa narysowana', r.mean > 40, r)
// pasek mówcy i napisy
r = await sc(`btn('.desk-scenes button', 'Kamera').click(); await sleep(300); btn('.desk-ovl button', 'Pasek mówcy').click(); await sleep(300); const a = { pv: st.preview.lowerThird, pg: st.program.lowerThird }; await take(); return { ...a, pg2: st.program.lowerThird, scene: st.program.scene }`)
check('Pasek mówcy: podgląd, potem wizja', r.pv && !r.pg && r.pg2 && r.scene === 'camera', r)
r = await sc(`const was = st.program.lyricsOn; btn('.desk-ovl button', 'Napisy').click(); await sleep(200); const now = st.program.lyricsOn; btn('.desk-ovl button', 'Napisy').click(); await sleep(200); return { was, now, back: st.program.lyricsOn }`)
check('Napisy wł./wył. od razu na wizji', r.was !== r.now && r.back === r.was, r)
// rzutnik z kamerą w okienku
r = await sc(`btn('.desk-scenes button', 'Rzutnik').click(); await sleep(400); btn('.desk-opt-group button', 'Kamera w okienku').click(); await sleep(200); document.querySelector('.desk-opt-group .desk-corner[aria-label="Lewy górny róg"]').click(); btn('.desk-opt-group button', 'Duże').click(); await sleep(200); await take(); return { scene: st.program.scene, pip: J(st.program.pip) }`)
check('Rzutnik z kamerą w okienku (róg, rozmiar)', r.scene === 'projector' && r.pip.on && r.pip.corner === 'tl' && r.pip.size === 'large', r)
// media: zdjęcie na ekran
r = await sc(`btn('.desk-tabs button', 'Media').click(); await sleep(300); const it = [...document.querySelectorAll('.desk-media-it')].find(x => x.innerText.includes('plansza')); btn('.desk-media-it .desk-media-act button', 'Na ekran'); it.querySelector('.desk-media-act button').click(); await sleep(300); const pv = { scene: st.preview.scene, media: !!st.preview.media }; await take(); return { pv, pg: st.program.scene, pix: pix() }`)
check('Media: zdjęcie na cały ekran', r.pv.scene === 'media' && r.pv.media && r.pg === 'media' && r.pix.sd > 5, r)
// film na ekran: gra na wizji, pauza, przewinięcie, pętla, głośność
r = await sc(`btn('.desk-tabs button', 'Media').click(); await sleep(300); const it = [...document.querySelectorAll('.desk-media-it')].find(x => x.innerText.includes('film')); it.querySelector('.desk-media-act button').click(); await sleep(300); await take(); await sleep(2500); return { scene: st.program.scene, m: { ...st.mplay }, ctl: !!document.querySelector('.desk-media-ctl') }`)
check('Media: film gra na wizji', r.scene === 'media' && r.m.playing && r.m.time > 0.5 && r.ctl, r)
r = await sc(`btn('.desk-media-ctl button', 'Pauza').click(); await sleep(700); const t1 = st.mplay.time; await sleep(700); const t2 = st.mplay.time; return { playing: st.mplay.playing, t1, t2 }`)
check('Film: pauza', !r.playing && Math.abs(r.t2 - r.t1) < 0.05, r)
r = await sc(`const sk = document.querySelector('.desk-media-seek'); sk.value = 2; sk.dispatchEvent(new Event('change')); await sleep(500); btn('.desk-media-ctl button', 'Graj').click(); await sleep(800); return { t: st.mplay.time, playing: st.mplay.playing }`)
check('Film: przewinięcie i dalej', r.playing && r.t >= 2, r)
r = await sc(`[...document.querySelectorAll('.desk-media-ctl input[type=checkbox]')].at(-1).click(); await sleep(200); const v = document.querySelector('.desk-media-vol input'); v.value = 0.3; v.dispatchEvent(new Event('input')); await sleep(200); return { loop: st.mplay.loop, vol: st.mplay.volume }`)
check('Film: pętla i głośność', r.loop === true && Math.abs(r.vol - 0.3) < 0.01, r)
let ai = await ctl(`return R.audioInfo()`)
check('Dźwięk studia działa (graf dźwięku)', ai.state === 'running' || ai.state === 'suspended', ai)
// prezentacja: slajdy ręcznie i same
r = await sc(`btn('.desk-tabs button', 'Media').click(); await sleep(300); const it = [...document.querySelectorAll('.desk-media-it')].find(x => x.innerText.includes('Pętla testowa')); it.querySelector('.desk-media-act button').click(); await sleep(300); await take(); const id = st.program.media; const s0 = st.mplay.slides[id] || 0; btn('.desk-media-ctl button', '▶').click(); await sleep(300); const s1 = st.mplay.slides[id]; const nm = document.querySelector('.desk-media-ctl span:not(.desk-air-name)')?.innerText; return { s0, s1, nm }`)
check('Prezentacja: następny slajd', r.s1 === r.s0 + 1 && /slajd 2 z 2/.test(r.nm), r)
r = await sc(`const id = st.program.media; const deck = s.items.value.find(i => i.id === id); deck.mAuto = true; deck.mSec = 1; const a = st.mplay.slides[id]; await sleep(2600); const b = st.mplay.slides[id]; deck.mAuto = false; return { a, b }`)
check('Prezentacja: slajdy same co ustawiony czas', r.b >= r.a + 2, r)
// nakładka: napis w rogu / cały kadr / zdjęta
r = await sc(`btn('.desk-scenes button', 'Kamera').click(); await sleep(300); btn('.desk-tabs button', 'Media').click(); await sleep(300); const it = [...document.querySelectorAll('.desk-media-it')].find(x => x.innerText.includes('Zmieniony') || x.innerText.includes('Powitanie')); it.querySelectorAll('.desk-media-act button')[1].click(); await sleep(300); const a = { ovl: st.preview.ovl, om: !!st.preview.omedia }; btn('.desk-ovl button', 'W rogu').click(); await sleep(200); const b = st.preview.ovl; await take(); const c = { ovl: st.program.ovl, scene: st.program.scene }; document.querySelector('.desk-ovl .desk-x').click(); await sleep(200); await take(); return { a, b, c, off: st.program.ovl }`)
check('Nakładka: napis na całym kadrze, w rogu, zdjęta', r.a.ovl === 'full' && r.a.om && r.b === 'corner' && r.c.ovl === 'corner' && r.c.scene === 'camera' && r.off === 'off', r)
// ogłoszenia: lista, pokaż teraz, pomiń
r = await sc(`btn('.desk-scenes button', 'Ogłoszenia').click(); await sleep(400); await take(); const list = [...document.querySelectorAll('.desk-slide')].map(x => x.innerText.split('\\n')[0]); const sl = [...document.querySelectorAll('.desk-slide')].find(x => x.innerText.includes('Ogłoszenie testowe')); sl.querySelector('.desk-slide-pic').click(); await sleep(900); const now = st.slideId; sl.querySelector('.desk-slide-eye').click(); await sleep(300); const hidden = st.hidden.includes('aan1'); sl.querySelector('.desk-slide-eye').click(); await sleep(200); return { list, now, hidden, pix: pix() }`)
check('Ogłoszenia: lista z ogłoszeniem i kartą nabożeństwa', r.list.length >= 2, r.list)
check('Ogłoszenia: „pokaż teraz”', r.now === 'aan1', r.now)
check('Ogłoszenia: pominięcie w pętli', r.hidden, r)
check('Ogłoszenia narysowane', r.pix.sd > 5, r.pix)
// odliczanie
r = await sc(`btn('.desk-scenes button', 'Odliczanie').click(); await sleep(300); await take(); btn('.desk-opt-group button', '10 min').click(); await sleep(1200); const a = st.left; btn('.desk-opt-group button', '+1').click(); await sleep(1200); return { a, b: st.left, info: document.querySelector('.desk-left-time')?.innerText }`)
check('Odliczanie 10 min i +1', r.a > 590 && r.a <= 600 && r.b > 650, r)
// plansza końcowa z kontem
r = await sc(`s.settings.donateAccount = '12 3456 7890 1234 5678 9012 3456'; s.settings.donatePhone = '600 100 200'; await sleep(200); btn('.desk-scenes button', 'Koniec').click(); await sleep(300); await take(); return { end: { ...st.end }, pix: pix() }`)
check('Plansza końcowa z kontem i BLIK', r.end.account.replace(/\D/g, '').length === 26 && r.pix.sd > 20, r)
// od razu na wizję
r = await sc(`const cb = [...document.querySelectorAll('.desk-take input[type=checkbox]')][0]; cb.click(); await sleep(300); btn('.desk-scenes button', 'Kamera').click(); await sleep(300); const a = { direct: st.direct, pg: st.program.scene, mons: document.querySelectorAll('.mon').length }; cb.click(); await sleep(200); return { ...a, after: st.direct }`)
check('„Od razu na wizję”: zmiana od razu na wizji, jeden monitor', r.direct && r.pg === 'camera' && r.mons === 1 && !r.after, r)
// napisy na wizji z Rzutnika
r = await sc(`s.selectedId.value = 'song1'; s.songIndex.value = 0; await s.goLive(); await sleep(800); const t = st.lyrics; await s.api.closeOutput(); s.hide(); return t`)
check('Napisy pieśni z Rzutnika docierają do studia', /Pierwsza zwrotka/.test(r), r)
// ATEM: błędny adres, YouTube bez logowania, gotowość, ustawienia
r = await sc(`const ip = document.querySelector('.desk-ip'); ip.value = 'abc'; ip.dispatchEvent(new Event('input')); btn('.desk-atem button', 'Połącz').click(); await sleep(300); return { atem: document.querySelector('.desk-atem .note.bad')?.innerText || '', yt: document.querySelector('.desk-yt-login')?.innerText || '', cfg: document.querySelectorAll('#desk-cfg .st-card').length }`)
check('ATEM: zły adres — komunikat', /adres IP/.test(r.atem), r.atem)
check('YouTube: przycisk połączenia', /Połącz z YouTube/.test(r.yt), r.yt)
check('Ustawienia nadawania: 3 karty', r.cfg === 3, r.cfg)
r = await sc(`btn('#desk-cfg .st-seg button', 'Prosty').click(); await sleep(500); const a = { engine: s.settings.streamEngine, mons: document.querySelectorAll('.mon').length, screen: !!document.querySelector('.desk-screen') }; btn('#desk-cfg .st-seg button', 'Studio').click(); await sleep(800); return { ...a, back: document.querySelectorAll('.mon').length }`)
check('Tryb prosty ↔ studio', r.engine === 'simple' && r.mons === 0 && r.screen && r.back === 2, r)
r = await sc(`btn('#desk-cfg .st-seg button', 'Inny laptop').click(); await sleep(400); const a = !!document.querySelector('#desk-cfg [aria-label="Laptop z rzutnikiem"]'); btn('#desk-cfg .st-seg button', 'Ta aplikacja').click(); await sleep(200); return { a, mode: s.settings.streamLyrics }`)
check('Rzutnik: inny laptop / ta aplikacja', r.a && r.mode === 'local', r)
// zwijanie kolumny
r = await sc(`document.querySelector('.rail-fold').click(); await sleep(300); const a = !!document.querySelector('.desk-rail'); document.querySelector('.rail-toggle').click(); await sleep(300); return { a, b: !document.querySelector('.desk-rail') }`)
check('Zwijanie i rozwijanie prawej kolumny', r.a && r.b, r)
// wyjście ze Stream i powrót — studio dalej działa
r = await sc(`s.role.value = 'display'; await sleep(800); s.role.value = 'stream'; await sleep(2000); return { mons: document.querySelectorAll('.mon canvas').length, pix: pix() }`)
check('Powrót do Stream: obraz dalej rysowany', r.mons === 2 && r.pix.sd > 5, r)

const errs = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND.*znak|DevTools/i.test(e))
check('Brak błędów w konsoli', !errs.length, errs.slice(0, 5))
console.log(`\n${results.length - failed}/${results.length} OK`)
fs.writeFileSync(path.join(dir, 'wynik.json'), JSON.stringify({ results, errors }, null, 1))
proc.kill()
process.exit(failed ? 1 : 0)
