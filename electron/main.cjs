const { app, BrowserWindow, ipcMain, screen, dialog, protocol, powerSaveBlocker, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const http = require('node:http')
const { Readable } = require('node:stream')
const { execFile } = require('node:child_process')
const createGoogleDrive = require('./gdrive.cjs')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
// Dane zostają w dotychczasowym folderze niezależnie od nazwy programu — zmiana nazwy
// nie może „zgubić” pieśni, materiałów ani ustawień. (Testy podają własny folder przełącznikiem.)
if (!process.argv.some(arg => arg.startsWith('--user-data-dir'))) app.setPath('userData', path.join(app.getPath('appData'), 'rzutnik'))
const MEDIA = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.ogv': 'video/ogg',
}
const STORES = ['library', 'songs', 'settings', 'services', 'bible']
const SONG_EXT = new Set(['', '.txt', '.xml', '.json', '.pro', '.cho', '.chopro', '.crd'])
const REMOTE_PORT = 8765

let control = null
let output = null
let live = null // to, co aktualnie ma być na rzutniku
let waiting = false // rzutnik został odłączony — czekamy, aż wróci
let sleepBlock = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])
// Film na rzutniku ma ruszyć z dźwiękiem bez klikania w tamto okno.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const userFile = name => path.join(app.getPath('userData'), name)
const mediaDir = () => userFile('media')
const inMediaDir = p => typeof p === 'string' && path.resolve(p).startsWith(mediaDir() + path.sep)

/* ---------- pliki z dysku: media://local/<ścieżka> ---------- */
// Obsługujemy nagłówek Range ręcznie — bez tego nie działa przewijanie filmów.
async function serveMedia(request) {
  const file = decodeURIComponent(new URL(request.url).pathname.slice(1))
  const type = MEDIA[path.extname(file).toLowerCase()]
  if (!type) return new Response(null, { status: 403 })
  let size
  try { size = (await fs.promises.stat(file)).size } catch { return new Response(null, { status: 404 }) }
  if (!size) return new Response(null, { status: 200, headers: { 'Content-Type': type } })

  let start = 0, end = size - 1, status = 200
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '')
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = +range[1]
      if (range[2]) end = Math.min(+range[2], size - 1)
    } else {
      start = Math.max(0, size - +range[2])
    }
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    status = 206
  }
  const headers = { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' }
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status, headers })
}

async function uniquePath(dir, name) {
  await fs.promises.mkdir(dir, { recursive: true })
  const { name: base, ext } = path.parse(name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'))
  for (let i = 1; ; i++) {
    const p = path.join(dir, (i === 1 ? base : `${base}-${i}`) + ext)
    if (!fs.existsSync(p)) return p
  }
}

// Zamienia wskazane ścieżki na elementy biblioteki. Z opcją „copy” plik trafia do folderu
// aplikacji, więc materiał nie znika po wyjęciu pendrive'a. PDF-y renderuje okno (strona = zdjęcie).
async function importFiles(paths, copy) {
  const result = []
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p !== 'string') continue
    const ext = path.extname(p).toLowerCase()
    const name = path.parse(p).name
    if (ext === '.pdf' || ext === '.pptx' || ext === '.ppt') {
      // Załącznik nabożeństwa (copy === 'all') kopiujemy w całości; zwykle PDF jest tylko źródłem stron.
      let file = p
      if (copy === 'all' && !inMediaDir(p)) { file = await uniquePath(mediaDir(), path.basename(p)); await fs.promises.copyFile(p, file) }
      result.push({ type: ext === '.pdf' ? 'pdf' : 'pptx', path: file, name })
      continue
    }
    const mime = MEDIA[ext]
    if (!mime) continue
    let file = p
    if (copy && !inMediaDir(p)) {
      file = await uniquePath(mediaDir(), path.basename(p))
      await fs.promises.copyFile(p, file)
    }
    result.push({ type: mime.split('/')[0], path: file, name })
  }
  return result
}

async function saveImage(name, bytes) {
  const file = await uniquePath(mediaDir(), String(name) + '.png')
  await fs.promises.writeFile(file, Buffer.from(bytes))
  return { type: 'image', path: file, name: String(name) }
}

/* ---------- prezentacje PowerPoint (.pptx) → obrazy ---------- */
// Slajdy rysuje niewidoczne okno aplikacji (bez PowerPointa na komputerze); tutaj robimy każdemu
// zrzut i zapisujemy go jako zdjęcie w bibliotece.
let pptxJob = null
function convertPptx(file) {
  if (pptxJob) return Promise.resolve({ error: 'Inna prezentacja jest właśnie przetwarzana.' })
  return new Promise(resolve => {
    const win = new BrowserWindow({ show: false, width: 960, height: 540, webPreferences: { ...webPreferences, offscreen: true } })
    const job = pptxJob = { file, name: path.parse(file).name, win, slides: [] }
    const timer = setTimeout(() => job.finish('Przetwarzanie prezentacji trwało zbyt długo.'), 300000)
    job.finish = error => {
      if (pptxJob !== job) return
      pptxJob = null
      clearTimeout(timer)
      if (!win.isDestroyed()) win.destroy()
      resolve(error ? { error, slides: job.slides } : { slides: job.slides })
    }
    win.webContents.on('render-process-gone', () => job.finish('Nie udało się przetworzyć prezentacji.'))
    // Samo okno jest małe (system przyciąłby większe do rozmiaru ekranu), ale strona w środku
    // „widzi” pełne 1920×1080 — tak jak w przeglądarce uruchomionej bez ekranu.
    // (ustawiane w preparePptxWindow, gdy strona jest już wczytana)
    load(win, 'pptx')
  })
}
async function preparePptxWindow() {
  const job = pptxJob
  if (!job) return null
  const dbg = job.win.webContents.debugger
  if (!dbg.isAttached()) dbg.attach('1.3')
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  return fs.promises.readFile(job.file)
}
async function capturePptxSlide(index, count, rect) {
  const job = pptxJob
  if (!job) return
  const shot = await job.win.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 }, captureBeyondViewport: true })
  job.slides.push(await saveImage(count > 1 ? `${job.name} – slajd ${index + 1}` : job.name, Buffer.from(shot.data, 'base64')))
  toControl('pptx:progress', { name: job.name, done: index + 1, count })
}

/* Prezentację najwierniej odtworzy program, w którym powstała. Kolejność prób:
   1. PowerPoint zainstalowany na komputerze — sam eksportuje slajdy do obrazów (dokładna kopia),
   2. LibreOffice — zamienia prezentację na PDF, a ten rozkładamy na strony jak każdy PDF,
   3. wbudowany czytnik (powyżej) — działa wszędzie, ale układ i kolory bywają przybliżone. */
const run = (cmd, args, timeout = 180000) => new Promise((resolve, reject) =>
  execFile(cmd, args, { windowsHide: true, timeout }, (err, stdout) => (err ? reject(err) : resolve(String(stdout)))))

const POWERPOINT_SCRIPT = `
param($src, $out)
$ErrorActionPreference = 'Stop'
$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$app = New-Object -ComObject PowerPoint.Application
try {
  # ReadOnly = tak, Untitled = nie, WithWindow = nie (wartości MsoTriState: -1 / 0)
  $pres = $app.Presentations.Open($src, -1, 0, 0)
  $height = [int](1920 * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
  $pres.Export($out, 'PNG', 1920, $height)
  $pres.Close()
} finally {
  # Nie zamykamy PowerPointa, jeśli użytkownik miał go otwartego przed importem.
  if (-not $wasRunning) { $app.Quit() }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
`

async function pptxViaPowerPoint(file, name) {
  if (!(await regQuery('HKCR\\PowerPoint.Application'))) return null
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kns-pptx-'))
  try {
    const script = path.join(dir, 'export.ps1')
    await fs.promises.writeFile(script, '\ufeff' + POWERPOINT_SCRIPT)
    const out = path.join(dir, 'slajdy')
    await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, file, out])
    // PowerPoint nazywa pliki w języku programu („Slajd1.PNG”, „Slide1.PNG”) — porządkujemy po numerze.
    const number = n => +(/(\d+)\.png$/i.exec(n)?.[1] || 0)
    const names = (await fs.promises.readdir(out)).filter(n => /\.png$/i.test(n)).sort((a, b) => number(a) - number(b))
    if (!names.length) return null
    const slides = []
    for (const [i, n] of names.entries()) {
      slides.push(await saveImage(names.length > 1 ? `${name} – slajd ${i + 1}` : name, await fs.promises.readFile(path.join(out, n))))
      toControl('pptx:progress', { name, done: i + 1, count: names.length })
    }
    return slides
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function pptxViaLibreOffice(file) {
  const soffice = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
    .map(base => path.join(base, 'LibreOffice', 'program', 'soffice.exe')).find(p => fs.existsSync(p))
  if (!soffice) return null
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kns-pptx-'))
  await run(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, file])
  const pdf = (await fs.promises.readdir(dir)).find(n => n.toLowerCase().endsWith('.pdf'))
  // Plik tymczasowy sprzątamy po czasie wystarczającym na rozłożenie PDF-a na strony.
  setTimeout(() => fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}), 15 * 60000)
  return pdf ? path.join(dir, pdf) : null
}

async function convertPresentation(file) {
  const name = path.parse(file).name
  const slides = await pptxViaPowerPoint(file, name).catch(() => null)
  if (slides) return { slides, method: 'powerpoint' }
  const pdf = await pptxViaLibreOffice(file).catch(() => null)
  if (pdf) return { pdf, name, method: 'libreoffice' }
  if (!file.toLowerCase().endsWith('.pptx')) return { error: 'Starszy format .ppt da się wczytać tylko na komputerze z PowerPointem lub LibreOffice. Zapisz prezentację jako .pptx albo PDF.' }
  return { ...(await convertPptx(file)), method: 'builtin' }
}

/* ---------- dane aplikacji ---------- */
function loadStore(name) {
  if (!STORES.includes(name)) return null
  try {
    const data = JSON.parse(fs.readFileSync(userFile(name + '.json'), 'utf8'))
    if (name !== 'library') return data
    return data.map(it => (it.path ? { ...it, missing: !fs.existsSync(it.path) } : it))
  } catch { return null }
}

// Zapis przez plik tymczasowy — przerwany zapis nie zostawi uszkodzonej biblioteki.
async function saveStore(name, data, dir = app.getPath('userData')) {
  if (!STORES.includes(name)) return
  const file = path.join(dir, name + '.json')
  await fs.promises.writeFile(file + '.tmp', JSON.stringify(data, null, 1))
  await fs.promises.rename(file + '.tmp', file)
}

/* ---------- import pieśni ---------- */
function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf)
  // Stare polskie pliki tekstowe bywają w Windows-1250 zamiast UTF-8.
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1250').decode(buf) }
}

async function walk(dir, out) {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (out.length >= 20000) return
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(p, out)
    else if (entry.isFile()) out.push(p)
  }
}

async function pickSongFiles(folder) {
  const res = await dialog.showOpenDialog(control, folder
    ? { title: 'Wybierz folder z pieśniami', properties: ['openDirectory'] }
    : { title: 'Wybierz pliki z pieśniami', properties: ['openFile', 'multiSelections'] })
  if (res.canceled) return []
  let paths = res.filePaths
  if (folder) { paths = []; await walk(res.filePaths[0], paths) }
  const files = []
  for (const p of paths) {
    const ext = path.extname(p).toLowerCase()
    if (!SONG_EXT.has(ext)) continue
    try {
      const stat = await fs.promises.stat(p)
      if (stat.size > (ext === '.json' ? 100 : 3) * 1024 * 1024) continue
      files.push({ name: path.basename(p), content: decodeText(await fs.promises.readFile(p)) })
    } catch { /* plik nie do odczytania — pomijamy */ }
  }
  return files
}

/* ---------- kopia zapasowa ---------- */
async function mapPaths(library, settings, fn, services = []) {
  for (const s of services) for (const f of s.files || []) f.path = await fn(f.path)
  for (const it of library) {
    delete it.missing
    if (it.path) it.path = await fn(it.path)
    if (it.bgImage) it.bgImage = await fn(it.bgImage)
  }
  if (settings.songStyle?.bgImage) settings.songStyle.bgImage = await fn(settings.songStyle.bgImage)
}

async function exportBackup() {
  const res = await dialog.showOpenDialog(control, { title: 'Wybierz miejsce na kopię', properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled) return {}
  const dir = await uniquePath(res.filePaths[0], 'NaSkale-kopia-' + new Date().toISOString().slice(0, 10))
  await fs.promises.mkdir(dir, { recursive: true })
  const library = loadStore('library') || []
  const settings = loadStore('settings') || {}
  const services = loadStore('services') || []
  const copied = new Map()
  await mapPaths(library, settings, async p => {
    if (!fs.existsSync(p)) return p
    if (!copied.has(p)) {
      const dest = await uniquePath(path.join(dir, 'media'), path.basename(p))
      await fs.promises.copyFile(p, dest)
      copied.set(p, 'media/' + path.basename(dest))
    }
    return copied.get(p)
  }, services)
  await saveStore('services', services, dir)
  await saveStore('library', library, dir)
  await saveStore('settings', settings, dir)
  await saveStore('songs', loadStore('songs') || [], dir)
  return { dir }
}

async function importBackup() {
  const res = await dialog.showOpenDialog(control, { title: 'Wybierz folder z kopią (NaSkale-kopia-… lub Rzutnik-kopia-…)', properties: ['openDirectory'] })
  if (res.canceled) return {}
  const dir = res.filePaths[0]
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8'))
  let library, settings, songs
  try { library = read('library'); settings = read('settings'); songs = read('songs') } catch { return { error: 'W tym folderze nie ma kopii biblioteki aplikacji.' } }
  let services = []
  try { services = read('services') } catch { /* starsza kopia bez nabożeństw */ }
  const answer = await dialog.showMessageBox(control, {
    type: 'warning', buttons: ['Wczytaj kopię', 'Anuluj'], defaultId: 1, cancelId: 1,
    message: 'Wczytać kopię?', detail: 'Obecne materiały, pieśni i ustawienia zostaną zastąpione zawartością kopii.',
  })
  if (answer.response !== 0) return {}
  await mapPaths(library, settings, async p => {
    if (!p.startsWith('media/')) return p
    const dest = await uniquePath(mediaDir(), path.basename(p))
    await fs.promises.copyFile(path.join(dir, p), dest)
    return dest
  }, services)
  await saveStore('services', services)
  await saveStore('library', library)
  await saveStore('settings', settings)
  await saveStore('songs', songs)
  return { ok: true }
}

/* ---------- nabożeństwo jako folder (przenoszenie między komputerami) ---------- */
async function exportService(payload) {
  const res = await dialog.showOpenDialog(control, { title: 'Wybierz miejsce na folder nabożeństwa', properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled) return {}
  const dir = await uniquePath(res.filePaths[0], 'Nabozenstwo-' + (payload.service.date || 'bez-daty'))
  await fs.promises.mkdir(dir, { recursive: true })
  for (const f of payload.service.files || []) {
    if (!fs.existsSync(f.path)) continue
    const dest = await uniquePath(path.join(dir, 'pliki'), path.basename(f.path))
    await fs.promises.copyFile(f.path, dest)
    f.path = 'pliki/' + path.basename(dest)
  }
  await fs.promises.writeFile(path.join(dir, 'nabozenstwo.json'), JSON.stringify(payload, null, 1))
  return { dir }
}

async function importService() {
  const res = await dialog.showOpenDialog(control, { title: 'Wybierz folder nabożeństwa (Nabozenstwo-…)', properties: ['openDirectory'] })
  if (res.canceled) return {}
  const dir = res.filePaths[0]
  let payload
  try { payload = JSON.parse(fs.readFileSync(path.join(dir, 'nabozenstwo.json'), 'utf8')) } catch { return { error: 'W tym folderze nie ma nabożeństwa.' } }
  const files = []
  for (const f of payload.service?.files || []) {
    if (typeof f.path !== 'string' || !f.path.startsWith('pliki/')) continue
    const src = path.join(dir, 'pliki', path.basename(f.path))
    if (!fs.existsSync(src)) continue
    const dest = await uniquePath(mediaDir(), path.basename(src))
    await fs.promises.copyFile(src, dest)
    files.push({ ...f, path: dest })
  }
  payload.service = { ...payload.service, files }
  return { payload }
}

/* ---------- folder wspólny z nabożeństwami ---------- */
// Folder aplikacji (np. „Aplikacja KNS Nabo” na Dysku Google):
//   nabozenstwa/<data> <tytuł kazania> (<id>)/nabozenstwo.json + pliki/
//   piesni/baza-piesni.json
// — jeden podfolder na nabożeństwo, nazwany datą, żeby dało się go rozpoznać także w Eksploratorze.
const sharedBase = dir => path.join(dir, 'nabozenstwa')
const safeId = id => typeof id === 'string' && /^[a-z0-9]{4,20}$/i.test(id)
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
function serviceFolderName(svc) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(svc.date || '') ? svc.date : 'bez-daty'
  const title = String(svc.sermonTitle || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/[. ]+$/, '')
  return date + (title ? ' ' + title : '') + ' (' + svc.id + ')'
}
// Folder nabożeństwa rozpoznajemy po identyfikatorze na końcu nazwy (sama nazwa zmienia się z datą i tytułem).
async function findServiceFolder(base, id) {
  let names = []
  try { names = await fs.promises.readdir(base) } catch { /* brak folderu bazowego */ }
  const name = names.find(n => n === id || n.endsWith('(' + id + ')'))
  return name ? path.join(base, name) : null
}

async function sharedRead(dir) {
  if (typeof dir !== 'string' || !fs.existsSync(dir)) return { error: 'Folder wspólny jest teraz niedostępny.' }
  const list = []
  let names = []
  try { names = await fs.promises.readdir(sharedBase(dir)) } catch { /* jeszcze nic tu nie zapisano */ }
  for (const name of names) {
    try {
      const folder = path.join(sharedBase(dir), name)
      const payload = JSON.parse(await fs.promises.readFile(path.join(folder, 'nabozenstwo.json'), 'utf8'))
      if (!safeId(payload.service?.id)) continue
      payload.service.files = (payload.service.files || [])
        .filter(f => typeof f.path === 'string' && f.path.startsWith('pliki/'))
        .map(f => ({ ...f, path: path.join(folder, 'pliki', path.basename(f.path)) }))
      list.push(payload)
    } catch { /* folder w trakcie synchronizacji albo nie nasz — pomijamy */ }
  }
  return { list }
}

async function sharedWrite(dir, payload) {
  const svc = payload?.service
  if (typeof dir !== 'string' || !fs.existsSync(dir)) return { error: 'Folder wspólny jest teraz niedostępny — zmiany zostaną wysłane później.' }
  if (!safeId(svc?.id)) return { error: 'Nieprawidłowe nabożeństwo.' }
  const base = sharedBase(dir)
  await fs.promises.mkdir(base, { recursive: true })
  const wanted = path.join(base, serviceFolderName(svc))
  let folder = await findServiceFolder(base, svc.id)
  const oldFilesDir = folder ? path.join(folder, 'pliki') : null
  // Zmiana daty lub tytułu = zmiana nazwy folderu. Gdy jest akurat zajęty, zostaje stara nazwa do następnego zapisu.
  if (folder && !samePath(folder, wanted)) { try { await fs.promises.rename(folder, wanted); folder = wanted } catch { /* spróbujemy przy kolejnym zapisie */ } }
  folder = folder || wanted
  const filesDir = path.join(folder, 'pliki')
  await fs.promises.mkdir(filesDir, { recursive: true })
  const files = []
  const kept = []
  for (const f of svc.files || []) {
    let p = f.path
    if (typeof p !== 'string') continue
    // Załącznik znany pod ścieżką sprzed zmiany nazwy folderu leży teraz w nowym.
    if (oldFilesDir && samePath(path.dirname(p), oldFilesDir)) p = path.join(filesDir, path.basename(p))
    // Załącznik spoza folderu nabożeństwa jest do niego kopiowany.
    if (!samePath(path.dirname(p), filesDir)) {
      if (!fs.existsSync(p)) continue
      const dest = await uniquePath(filesDir, path.basename(p))
      await fs.promises.copyFile(p, dest)
      p = dest
    }
    files.push({ key: f.key, path: p })
    kept.push({ ...f, path: 'pliki/' + path.basename(p) })
  }
  for (const name of await fs.promises.readdir(filesDir)) {
    if (!files.some(f => path.basename(f.path).toLowerCase() === name.toLowerCase())) await fs.promises.rm(path.join(filesDir, name), { force: true })
  }
  const file = path.join(folder, 'nabozenstwo.json')
  await fs.promises.writeFile(file + '.tmp', JSON.stringify({ ...payload, service: { ...svc, files: kept } }, null, 1))
  await fs.promises.rename(file + '.tmp', file)
  return { files }
}

// Wspólna baza pieśni: jeden plik obok folderów nabożeństw.
const songsFile = dir => path.join(dir, 'piesni', 'baza-piesni.json')
async function sharedSongsRead(dir, knownMtime) {
  if (typeof dir !== 'string' || !fs.existsSync(dir)) return { error: 'Folder wspólny jest teraz niedostępny.' }
  try {
    const mtime = (await fs.promises.stat(songsFile(dir))).mtimeMs
    // Plik nietknięty od ostatniego razu — nie ma po co czytać kilku megabajtów.
    if (knownMtime && mtime === knownMtime) return { unchanged: true, mtime }
    return { ...JSON.parse(await fs.promises.readFile(songsFile(dir), 'utf8')), mtime }
  } catch (e) {
    return e.code === 'ENOENT' ? { songs: [], deleted: {}, mtime: 0 } : { error: 'Nie udało się odczytać wspólnej bazy pieśni.' }
  }
}
async function sharedSongsWrite(dir, data) {
  if (typeof dir !== 'string' || !fs.existsSync(dir)) return { error: 'Folder wspólny jest teraz niedostępny.' }
  await fs.promises.mkdir(path.dirname(songsFile(dir)), { recursive: true })
  const file = songsFile(dir)
  await fs.promises.writeFile(file + '.tmp', JSON.stringify(data))
  await fs.promises.rename(file + '.tmp', file)
  return { mtime: (await fs.promises.stat(file)).mtimeMs }
}

// Folder aplikacji to ten, który ma podfoldery „nabozenstwa” i „piesni” (albo nazywa się „Aplikacja KNS Nabo”).
const APP_FOLDER = 'Aplikacja KNS Nabo'
const hasAppData = dir => ['nabozenstwa', 'piesni'].every(sub => fs.existsSync(path.join(dir, sub)))

// Podpowiedź na start: szuka folderu „Aplikacja KNS Nabo” na dyskach Google Drive zamontowanych
// w systemie (także skrótu do udostępnionego folderu). Tylko po nazwie — same podfoldery
// „nabozenstwa” i „piesni” nie wystarczą, bo mają je też stare foldery testowe.
async function suggestShared() {
  const roots = []
  for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    const drive = letter + ':\\'
    if (fs.existsSync(path.join(drive, '.shortcut-targets-by-id'))) roots.push(path.join(drive, 'Mój dysk'), path.join(drive, 'My Drive'))
  }
  const home = os.homedir()
  roots.push(path.join(home, 'Mój dysk'), path.join(home, 'My Drive'), path.join(home, 'Google Drive'), path.join(home, 'Google Drive', 'My Drive'))
  const found = []
  for (const root of roots) {
    let names = []
    try { names = (await fs.promises.readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).slice(0, 500) } catch { continue }
    for (const name of names) {
      const dir = path.join(root, name)
      if (name.toLowerCase() === APP_FOLDER.toLowerCase() && !found.includes(dir)) found.push(dir)
    }
  }
  return found
}

async function sharedRemove(dir, id) {
  if (typeof dir !== 'string' || !safeId(id)) return
  const folder = await findServiceFolder(sharedBase(dir), id)
  if (folder) await fs.promises.rm(folder, { recursive: true, force: true })
}

/* ---------- czyje to konto: Dysk Google / OneDrive ---------- */
// Dysk Google na komputer zapisuje zalogowane konto w swojej lokalnej bazie (wpis „driveway_account”).
// Czytamy plik wprost, bez otwierania bazy, więc nie wchodzimy w drogę działającemu programowi.
async function googleDriveEmails() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Google', 'DriveFS')
  const emails = []
  let accounts = []
  try { accounts = (await fs.promises.readdir(base)).filter(name => /^\d{6,}$/.test(name)) } catch { return emails }
  for (const account of accounts) {
    for (const name of ['metadata_sqlite_db-wal', 'metadata_sqlite_db']) {
      let text
      try { text = (await fs.promises.readFile(path.join(base, account, name))).toString('latin1') } catch { continue }
      const m = /driveway_account[^@]{0,600}?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})/.exec(text)
      if (!m) continue
      // W zapisie adres poprzedzają znacznik „B” i bajt z długością — bierzemy dokładnie tyle znaków,
      // bo sąsiednie bajty potrafią wyglądać jak litery i przyklejać się do adresu.
      const at = m.index + m[0].length - m[1].length
      let email = m[1]
      if (text[at - 2] === 'B' && text.charCodeAt(at - 1) >= 6) email = text.substr(at, text.charCodeAt(at - 1))
      else if (text[at - 1] === 'B' && m[1].charCodeAt(0) >= 6) email = text.substr(at + 1, m[1].charCodeAt(0))
      if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) email = m[1]
      if (!emails.includes(email)) emails.push(email)
      break
    }
  }
  return emails
}

const regQuery = key => new Promise(resolve => execFile('reg', ['query', key], { windowsHide: true }, (err, out) => resolve(err ? '' : out)))
async function oneDriveAccount(dir) {
  for (const kind of ['Personal', 'Business1', 'Business2']) {
    const out = await regQuery('HKCU\\Software\\Microsoft\\OneDrive\\Accounts\\' + kind)
    const folder = /UserFolder\s+REG_SZ\s+(.+)/.exec(out)?.[1].trim()
    const email = /UserEmail\s+REG_SZ\s+(.+)/.exec(out)?.[1].trim()
    if (folder && email && (path.resolve(dir) + path.sep).toLowerCase().startsWith((path.resolve(folder) + path.sep).toLowerCase())) return email
  }
  return null
}

async function sharedAccount(dir) {
  if (typeof dir !== 'string' || !dir) return null
  try {
    // Dysk Google montowany jako litera dysku ma w korzeniu ukryty folder skrótów.
    if (fs.existsSync(path.join(path.parse(path.resolve(dir)).root, '.shortcut-targets-by-id'))) {
      const emails = await googleDriveEmails()
      if (emails.length) return { provider: 'Dysk Google', email: emails.join(' / ') }
    }
    const email = await oneDriveAccount(dir)
    if (email) return { provider: 'OneDrive', email }
  } catch { /* nie udało się ustalić — trudno, to tylko informacja */ }
  return null
}

/* ---------- sygnały dla kamerzysty (stream) ---------- */
// Telefon kamerzysty otwiera stronę z tego komputera (ta sama sieć Wi-Fi) i ze słuchawką w uchu
// dostaje sygnał dźwiękowy, gdy operator streamu oznaczy go jako „na wizji”, „przygotuj się” lub „poza wizją”.
const CUE_PORT = 8766
let cue = null
const CUE_PAGE = "<!doctype html><html lang=\"pl\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,user-scalable=no\"><title>Sygnał dla kamery</title><style>\nhtml,body{margin:0;height:100%}\nbody{font:600 20px system-ui,sans-serif;color:#fff;background:#14161a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:20px;box-sizing:border-box;transition:background .15s}\nbody.live{background:#d92c22}body.ready{background:#c98a00}body.off{background:#14161a}\n#big{font-size:13vw;font-weight:900;letter-spacing:.02em;line-height:1.05}\n#net{font-size:15px;opacity:.75;min-height:1.3em}\nbutton{font:inherit;font-size:22px;padding:18px 26px;border:0;border-radius:16px;background:#fff;color:#14161a}\n</style></head><body class=\"off\">\n<div id=\"big\">POZA WIZJĄ</div>\n<button id=\"start\">Dotknij, aby włączyć dźwięk</button>\n<div id=\"net\">Łączenie…</div>\n<script>\nconst TEXT = { live: 'NA WIZJI', ready: 'PRZYGOTUJ SIĘ', off: 'POZA WIZJĄ' }\n// Sygnały: na wizji — dwa wysokie krótkie; przygotuj się — jeden średni; poza wizją — jeden niski długi.\nconst TONES = { live: [[880, 0, .14], [880, .22, .14]], ready: [[660, 0, .28]], off: [[330, 0, .55]] }\nconst BUZZ = { live: [120, 80, 120], ready: [250], off: [500] }\nlet audio = null, first = true\nfunction beep(freq, at, len) {\n  const osc = audio.createOscillator(), gain = audio.createGain()\n  osc.frequency.value = freq\n  gain.gain.setValueAtTime(.0001, audio.currentTime + at)\n  gain.gain.exponentialRampToValueAtTime(.6, audio.currentTime + at + .02)\n  gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + at + len)\n  osc.connect(gain).connect(audio.destination)\n  osc.start(audio.currentTime + at); osc.stop(audio.currentTime + at + len + .05)\n}\nfunction signal(state) {\n  if (audio) { audio.resume(); for (const t of TONES[state] || []) beep(...t) }\n  if (navigator.vibrate) navigator.vibrate(BUZZ[state] || 0)\n}\nfunction show(state) { document.body.className = state; big.textContent = TEXT[state] || '' }\nasync function keepAwake() { try { await navigator.wakeLock?.request('screen') } catch {} }\nstart.onclick = () => {\n  audio = new (window.AudioContext || window.webkitAudioContext)()\n  beep(660, 0, .12)\n  start.remove()\n  keepAwake()\n}\ndocument.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake() })\nconst base = location.pathname.replace(/\\/$/, '')\nconst es = new EventSource(base + '/events')\nes.onopen = () => { net.textContent = 'Połączono z komputerem'; first = true }\nes.onerror = () => { net.textContent = 'Brak połączenia — próbuję ponownie…' }\nes.onmessage = e => {\n  const s = JSON.parse(e.data)\n  show(s.state)\n  // Pierwsza wiadomość po połączeniu to tylko bieżący stan — bez sygnału.\n  if (!first) signal(s.state)\n  first = false\n}\n</script></body></html>"
const cueNotify = () => toControl('cue:clients', cue ? cue.clients.size : 0)

// Ten sam sygnał idzie też przez internet (ntfy.sh) do ekranu „Kamera” w aplikacji na telefon —
// działa w każdej sieci. Telefon potwierdza odebrany sygnał na temacie „…-ok”, więc widać, ile telefonów go ma.
// KNS_CUE_BASE: tylko do testów automatycznych (podstawiony serwer zamiast ntfy.sh).
const CUE_TOPIC = require('./google-config.cjs').cueTopic || ''
const CUE_RELAY = (process.env.KNS_CUE_BASE || 'https://ntfy.sh') + '/' + CUE_TOPIC
let relay = null // { ctrl, last: id ostatniego sygnału, phones: Map telefon → id ostatnio potwierdzonego sygnału }
// phones — telefony z otwartym ekranem „Kamera”, got — ile z nich potwierdziło ostatni sygnał.
const relayNotify = (error = '') => toControl('cue:remote', {
  phones: relay ? relay.phones.size : 0,
  got: relay ? [...relay.phones.values()].filter(id => id === relay.last).length : 0,
  error,
})
async function relayCue(state, quiet = false) {
  if (!CUE_TOPIC) return
  try {
    // Treść czytelna dla człowieka, stan w tagach — aplikacja ntfy na telefonie (działa też przy zablokowanym
    // ekranie) pokazuje ją jako powiadomienie o priorytecie zależnym od stanu; ciche zmiany — bez dźwięku.
    const text = { live: 'NA WIZJI', ready: 'PRZYGOTUJ SIĘ', off: 'POZA WIZJĄ' }[state]
    const priority = quiet ? '1' : { live: '5', ready: '4', off: '3' }[state]
    const res = await fetch(CUE_RELAY, { method: 'POST', headers: { Title: 'Kamera', Priority: priority, Tags: quiet ? state + ',quiet' : state }, body: text })
    if (!res.ok) throw new Error(String(res.status))
    const { id } = await res.json()
    if (relay) relay.last = id
    relayNotify()
    relayQuota()
  } catch {
    relayNotify('Sygnał nie poszedł przez internet — sprawdź połączenie komputera.')
  }
}
// Ile wiadomości wysłano dziś przez ntfy z tego łącza internetowego i jaki jest limit (darmowe konto: 250 dziennie).
// Liczą się sygnały z komputera i potwierdzenia z telefonów w tej samej sieci.
let quotaTimer = null
function relayQuota() {
  clearTimeout(quotaTimer)
  quotaTimer = setTimeout(async () => {
    try {
      const res = await (await fetch((process.env.KNS_CUE_BASE || 'https://ntfy.sh') + '/v1/account')).json()
      toControl('cue:quota', { used: res.stats?.messages ?? null, limit: res.limits?.messages ?? null, left: res.stats?.messages_remaining ?? null })
    } catch { /* bez internetu — zostaje poprzednia wartość */ }
  }, 1500)
}
function watchRelay(on) {
  relay?.ctrl.abort()
  relay = null
  if (!on || !CUE_TOPIC) return
  const ctrl = new AbortController()
  relay = { ctrl, last: '', phones: new Map() }
  relayQuota()
  const take = line => {
    try {
      const msg = JSON.parse(line)
      if (msg.event !== 'message' || !relay) return
      const ack = JSON.parse(msg.message)
      if (!ack.phone) return
      if (ack.bye) relay.phones.delete(ack.phone)
      else relay.phones.set(ack.phone, ack.id)
      relayNotify()
    } catch { /* nie nasza wiadomość */ }
  }
  ;(async () => {
    while (!ctrl.signal.aborted) {
      try {
        const res = await fetch(CUE_RELAY + '-ok/json', { signal: ctrl.signal })
        let buf = ''
        for await (const chunk of res.body) {
          buf += Buffer.from(chunk).toString()
          let at
          while ((at = buf.indexOf('\n')) >= 0) { take(buf.slice(0, at)); buf = buf.slice(at + 1) }
        }
      } catch { /* zerwane połączenie — ponawiamy */ }
      if (!ctrl.signal.aborted) await new Promise(r => setTimeout(r, 3000))
    }
  })()
}
function cueHandler(req, res) {
  const [, token, part] = req.url.split('?')[0].split('/')
  if (!cue || token !== cue.token) { res.writeHead(404).end(); return }
  if (req.method === 'GET' && !part) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(CUE_PAGE); return }
  if (req.method === 'GET' && part === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write('data: ' + JSON.stringify({ state: cue.state }) + '\n\n')
    const clients = cue.clients
    clients.add(res)
    cueNotify()
    req.on('close', () => { clients.delete(res); cueNotify() })
    return
  }
  res.writeHead(404).end()
}
function sendCue(state) {
  if (!['live', 'ready', 'off'].includes(state)) return 0
  relayCue(state)
  if (!cue) return 0
  cue.state = state
  for (const res of cue.clients) res.write('data: ' + JSON.stringify({ state }) + '\n\n')
  return cue.clients.size
}
function setCue(on, token) {
  // Włączenie i wyłączenie ustawia telefony na „poza wizją” bez sygnału dźwiękowego.
  const wasOn = !!relay
  watchRelay(on && !!token)
  if (on && token) relayCue('off', true)
  else if (wasOn) relayCue('off', true)
  return new Promise(resolve => {
    if (cue) {
      clearInterval(cue.beat)
      for (const res of cue.clients) res.end()
      cue.server.close()
      cue.server.closeAllConnections?.()
      cue = null
      cueNotify()
    }
    if (!on || typeof token !== 'string' || !token) return resolve({})
    const server = http.createServer(cueHandler)
    // Bez lokalnej strony (zajęty port) sygnały i tak idą przez internet.
    server.once('error', e => resolve({ error: e.code === 'EADDRINUSE' ? `Strona w sieci lokalnej nie działa: port ${CUE_PORT} jest zajęty przez inny program.` : e.message }))
    server.listen(CUE_PORT, () => {
      // Co kilkanaście sekund pusty znak, żeby sieć nie uznała połączenia za martwe.
      const beat = setInterval(() => { for (const res of cue?.clients || []) res.write(': \n\n') }, 15000)
      cue = { server, token, clients: new Set(), state: 'off', beat }
      resolve({ url: `http://${lanAddress()}:${CUE_PORT}/${token}` })
    })
  })
}

/* ---------- pilot w telefonie ---------- */
let remote = null
let remoteState = { title: '' }
const REMOTE_PAGE = `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>Kościół Na Skale — pilot</title><style>
body{margin:0;background:#0f1115;color:#eef0f4;font:17px system-ui,sans-serif;display:flex;flex-direction:column;height:100dvh;padding:16px;box-sizing:border-box;gap:12px}
#t{min-height:3em;text-align:center;color:#8f98a8;display:grid;place-items:center}
.row{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:12px}
button{font:inherit;font-size:22px;font-weight:700;border:0;border-radius:18px;color:#fff;background:#1f232c;touch-action:manipulation}
button:active{filter:brightness(1.4)}#n{background:#5b8cff}#h{flex:none;padding:18px}
</style></head><body><div id="t">Łączenie…</div>
<div class="row"><button id="p">‹ Wstecz</button><button id="n">Dalej ›</button></div><button id="h">Ukryj obraz</button>
<script>
const base = location.pathname.replace(/\\/$/, '')
const cmd = c => fetch(base + '/cmd/' + c, { method: 'POST' }).then(tick)
const tick = () => fetch(base + '/state').then(r => r.json()).then(s => { t.textContent = s.title }).catch(() => { t.textContent = 'Brak połączenia z komputerem' })
p.onclick = () => cmd('prev'); n.onclick = () => cmd('next'); h.onclick = () => cmd('hide')
setInterval(tick, 1500); tick()
</script></body></html>`

function remoteHandler(req, res) {
  const [, token, a, b] = req.url.split('?')[0].split('/')
  if (!remote || token !== remote.token) { res.writeHead(404).end(); return }
  if (req.method === 'GET' && !a) res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(REMOTE_PAGE)
  else if (req.method === 'GET' && a === 'state') res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(remoteState))
  else if (req.method === 'POST' && a === 'cmd' && ['next', 'prev', 'hide'].includes(b)) { toControl('remote:cmd', b); res.writeHead(204).end() }
  else res.writeHead(404).end()
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list) if (a.family === 'IPv4' && !a.internal) return a.address
  }
  return 'localhost'
}

function setRemote(on, token) {
  return new Promise(resolve => {
    if (remote) { remote.server.close(); remote = null }
    if (!on || typeof token !== 'string' || !token) return resolve({})
    const server = http.createServer(remoteHandler)
    server.once('error', e => resolve({ error: e.code === 'EADDRINUSE' ? `Port ${REMOTE_PORT} jest zajęty przez inny program.` : e.message }))
    server.listen(REMOTE_PORT, () => {
      remote = { server, token }
      resolve({ url: `http://${lanAddress()}:${REMOTE_PORT}/${token}` })
    })
  })
}

/* ---------- okna ---------- */
function load(win, hash) {
  if (DEV_URL) win.loadURL(DEV_URL + (hash ? '#' + hash : ''))
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), hash ? { hash } : undefined)
}

// backgroundThrottling: false — okno zasłonięte lub zminimalizowane ma pracować normalnie
// (pętla na rzutniku nie może zwalniać, a import prezentacji trwać minutami).
const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false }
const iconFile = path.join(__dirname, '..', 'build', 'icon.png')
const icon = fs.existsSync(iconFile) ? { icon: iconFile } : {}
const toControl = (channel, data) => { if (control && !control.isDestroyed()) control.webContents.send(channel, data) }
const toOutput = (channel, data) => { if (output && !output.isDestroyed()) output.webContents.send(channel, data) }

function createControl() {
  control = new BrowserWindow({
    width: 1360, height: 840, minWidth: 1000, minHeight: 640,
    backgroundColor: '#0f1115', title: 'Kościół Na Skale', autoHideMenuBar: true, ...icon,
    // Testy automatyczne: okno renderowane poza ekranem (da się robić zrzuty, nic się nie pokazuje).
    webPreferences: process.env.RZUTNIK_HIDDEN ? { ...webPreferences, offscreen: true } : webPreferences,
    show: !process.env.RZUTNIK_HIDDEN, // testy automatyczne działają bez pokazywania okna
  })
  load(control)
  control.on('moved', sendDisplays)
  control.on('closed', () => { control = null; app.quit() })
}

/* ---------- aktualizacje ---------- */
// Instalator: nowa wersja z GitHub Releases pobiera się w tle, a po „Uruchom ponownie” od razu instaluje.
// Wersja przenośna (portable) nie umie się podmienić — dostaje tylko wiadomość z linkiem do pobrania.
const RELEASES = 'https://api.github.com/repos/PatrykDorau/kns/releases/latest'
let update = null // { version, ready } albo { version, url }
let updater = null
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false }
function setUpdate(next) { update = next; toControl('update:state', update) }
async function checkPortable() {
  try {
    const res = await (await fetch(RELEASES, { headers: { 'User-Agent': 'KosciolNaSkale' } })).json()
    const version = String(res.tag_name || '').replace(/^v/, '')
    if (version && newer(version, app.getVersion())) setUpdate({ version, url: res.html_url })
  } catch { /* bez internetu — spróbujemy później */ }
}
function setupUpdates() {
  if (!app.isPackaged || process.env.RZUTNIK_HIDDEN) return
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    checkPortable()
    setInterval(checkPortable, 6 * 3600e3)
    return
  }
  updater = require('electron-updater').autoUpdater
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.on('update-downloaded', info => setUpdate({ version: info.version, ready: true }))
  updater.on('error', () => { /* bez internetu albo brak wydania — spróbujemy później */ })
  const check = () => updater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, 6 * 3600e3)
}

function displays() {
  const all = screen.getAllDisplays()
  const current = control ? screen.getDisplayMatching(control.getBounds()).id : null
  return all.map((d, i) => ({
    id: d.id,
    label: `Ekran ${i + 1}` + (d.label ? ` (${d.label})` : ''),
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    current: d.id === current,
  }))
}
const sendDisplays = () => toControl('displays:changed', displays())

function openOutput(displayId) {
  waiting = false
  if (output) output.close()
  const list = displays()
  const target = screen.getAllDisplays().find(d => d.id === displayId)
  // Pełny ekran tylko na innym ekranie niż panel sterowania — inaczej zasłoniłby przyciski.
  const fullscreen = !!target && !list.find(d => d.id === displayId).current

  // Na rzutniku okno jest przezroczyste i zakrywa cały ekran: gdy nic nie jest wyświetlane,
  // widać przez nie pulpit. Nie łapie myszy ani klawiatury, więc nie przeszkadza w pracy.
  const win = new BrowserWindow({
    ...(fullscreen
      ? { ...target.bounds, frame: false, transparent: true, resizable: false, focusable: false, skipTaskbar: true, hasShadow: false }
      : { width: 960, height: 540, backgroundColor: '#000000' }),
    title: 'Kościół Na Skale — obraz na rzutnik', autoHideMenuBar: true, webPreferences, ...icon,
  })
  output = win
  win.displayId = fullscreen ? displayId : null
  if (fullscreen) {
    win.setBounds(target.bounds)
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(true)
  }
  win.setMenuBarVisibility(false)
  load(win, 'output')
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') win.close()
  })
  // Windows nie może wygasić ekranu ani uśpić komputera w trakcie wyświetlania.
  if (sleepBlock === null) sleepBlock = powerSaveBlocker.start('prevent-display-sleep')
  win.on('closed', () => {
    if (output !== win) return
    output = null
    if (sleepBlock !== null) { powerSaveBlocker.stop(sleepBlock); sleepBlock = null }
    if (!waiting) live = null
    toControl('output:state', { open: false, fullscreen: false, waiting })
  })
  toControl('output:state', { open: true, fullscreen, waiting: false })
  if (control) control.focus()
}

function closeOutput() {
  waiting = false
  if (output) output.close()
  else { live = null; toControl('output:state', { open: false, fullscreen: false, waiting: false }) }
}

// Odłączony rzutnik: zamykamy okno (Windows przeniósłby je na ekran operatora),
// zapamiętujemy obraz i wracamy z nim, gdy tylko ekran pojawi się ponownie.
function onDisplayRemoved(e, display) {
  if (output && output.displayId === display.id) { waiting = true; output.close() }
  sendDisplays()
}
function onDisplayAdded(e, display) {
  sendDisplays()
  if (waiting) setTimeout(() => { if (waiting && !output) openOutput(display.id) }, 1500)
}

/* ---------- start ---------- */
app.whenReady().then(() => {
  protocol.handle('media', serveMedia)

  ipcMain.handle('displays:get', () => displays())
  ipcMain.handle('output:open', (e, displayId) => openOutput(displayId))
  ipcMain.handle('output:close', () => closeOutput())
  ipcMain.handle('files:pick', async (e, kind) => {
    const images = Object.keys(MEDIA).filter(x => MEDIA[x].startsWith('image/')).map(x => x.slice(1))
    const res = await dialog.showOpenDialog(control, kind === 'deck'
      ? { title: 'Wybierz prezentację', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Prezentacje (PowerPoint, PDF)', extensions: ['pptx', 'ppt', 'pdf'] }] }
      : kind === 'image'
      ? { title: 'Wybierz zdjęcie', properties: ['openFile'], filters: [{ name: 'Zdjęcia', extensions: images }] }
      : { title: 'Dodaj zdjęcia, filmy, PDF lub prezentację', properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Zdjęcia, filmy, PDF, PowerPoint', extensions: [...Object.keys(MEDIA).map(x => x.slice(1)), 'pdf', 'pptx', 'ppt'] }] })
    return res.canceled ? [] : res.filePaths
  })
  ipcMain.handle('files:import', (e, paths, copy) => importFiles(paths, copy))
  ipcMain.handle('files:readPdf', (e, p) => (typeof p === 'string' && p.toLowerCase().endsWith('.pdf') ? fs.promises.readFile(p) : null))
  ipcMain.handle('files:saveImage', (e, name, bytes) => saveImage(name, bytes))
  ipcMain.handle('files:pptx', (e, p) => (typeof p === 'string' && /\.pptx?$/i.test(p) ? convertPresentation(p) : { error: 'To nie jest prezentacja PowerPoint.' }))
  ipcMain.handle('pptx:data', () => preparePptxWindow())
  ipcMain.handle('pptx:slide', (e, index, count, rect) => capturePptxSlide(index, count, rect))
  ipcMain.on('pptx:done', (e, error) => pptxJob?.finish(error))
  // Usuwamy wyłącznie kopie z folderu aplikacji — nigdy oryginały użytkownika.
  ipcMain.handle('files:remove', (e, p) => (inMediaDir(p) ? fs.promises.rm(p, { force: true }) : null))
  ipcMain.handle('store:load', (e, name) => loadStore(name))
  ipcMain.handle('store:save', (e, name, data) => saveStore(name, data))
  ipcMain.handle('songs:pick', (e, folder) => pickSongFiles(!!folder))
  // Pieśni z folderu na Dysku Google (link albo identyfikator folderu) — przez logowanie Google aplikacji.
  ipcMain.handle('songs:fromDrive', (e, link) => viaGoogle(async () => {
    const id = /folders\/([\w-]+)/.exec(String(link))?.[1] || /[?&]id=([\w-]+)/.exec(String(link))?.[1] || (/^[\w-]{20,}$/.test(String(link).trim()) ? String(link).trim() : '')
    if (!id) throw new Error('To nie wygląda na link do folderu na Dysku Google.')
    if (!gdrive.status().loggedIn) throw Object.assign(new Error('Najpierw zaloguj się kontem Google na ekranie startowym aplikacji.'), { needLogin: true })
    const files = await gdrive.folderFiles(id, (done, total) => toControl('songs:driveProgress', { done, total }))
    return { files: files.map(f => ({ name: f.name, content: decodeText(f.data) })) }
  }))
  ipcMain.handle('songs:export', async (e, list) => {
    const res = await dialog.showSaveDialog(control, { title: 'Zapisz bazę pieśni', defaultPath: 'piesni.json', filters: [{ name: 'Baza pieśni', extensions: ['json'] }] })
    if (res.canceled) return {}
    await fs.promises.writeFile(res.filePath, JSON.stringify(list, null, 1))
    return { file: res.filePath }
  })
  ipcMain.handle('service:export', (e, payload) => exportService(payload))
  ipcMain.handle('service:import', () => importService())
  ipcMain.handle('shared:pick', async () => {
    const res = await dialog.showOpenDialog(control, { title: 'Wybierz folder aplikacji na Dysku Google (np. „Aplikacja KNS Nabo”)', properties: ['openDirectory', 'createDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })
  // „google” zamiast ścieżki = folder aplikacji obsługiwany przez logowanie do Dysku Google.
  const GOOGLE = 'google'
  const gdrive = createGoogleDrive({ serviceFolderName, safeId })
  const viaGoogle = async job => { try { return await job() } catch (e) { return { error: e.message, needLogin: !!e.needLogin } } }
  ipcMain.handle('google:login', () => viaGoogle(() => gdrive.login()))
  ipcMain.handle('google:logout', () => gdrive.logout())
  ipcMain.handle('google:status', () => gdrive.status())
  ipcMain.handle('shared:ensure', (e, paths) => viaGoogle(() => gdrive.ensureFiles(paths)))
  ipcMain.handle('shared:account', (e, dir) => {
    if (dir !== GOOGLE) return sharedAccount(dir)
    const { email } = gdrive.status()
    return email ? { provider: 'Dysk Google', email } : null
  })
  ipcMain.handle('shared:suggest', () => suggestShared())
  ipcMain.handle('shared:check', (e, dir) => ({ hasData: typeof dir === 'string' && hasAppData(dir), name: typeof dir === 'string' ? path.basename(dir) : '' }))
  ipcMain.handle('shared:read', (e, dir) => (dir === GOOGLE ? viaGoogle(() => gdrive.readServices()) : sharedRead(dir)))
  ipcMain.handle('shared:write', (e, dir, payload) => (dir === GOOGLE ? viaGoogle(() => gdrive.writeService(payload)) : sharedWrite(dir, payload)))
  ipcMain.handle('shared:remove', (e, dir, id) => (dir === GOOGLE ? viaGoogle(() => gdrive.removeService(id)) : sharedRemove(dir, id)))
  ipcMain.handle('shared:songsRead', (e, dir, known) => (dir === GOOGLE ? viaGoogle(() => gdrive.readSongs(known)) : sharedSongsRead(dir, known)))
  ipcMain.handle('shared:songsWrite', (e, dir, data) => (dir === GOOGLE ? viaGoogle(() => gdrive.writeSongs(data)) : sharedSongsWrite(dir, data)))
  ipcMain.handle('backup:export', () => exportBackup())
  ipcMain.handle('backup:import', () => importBackup())
  ipcMain.handle('remote:set', (e, on, token) => setRemote(on, token))
  // Podpis autora zmian w nabożeństwie, gdy komputer nie jest zalogowany do Google.
  // Stream jako nakładka w OBS: małe okno (bez minimalnego rozmiaru panelu) i opcjonalnie zawsze na wierzchu.
  let normalBounds = null
  ipcMain.handle('window:compact', (e, on) => {
    if (!control || control.isDestroyed()) return
    if (on) {
      if (control.isMaximized()) control.unmaximize()
      if (!normalBounds) normalBounds = control.getBounds()
      control.setMinimumSize(240, 140)
      const b = control.getBounds()
      control.setBounds({ x: b.x + b.width - 660, y: b.y + 40, width: 640, height: 400 })
    } else {
      control.setMinimumSize(1000, 640)
      if (normalBounds) control.setBounds(normalBounds)
      normalBounds = null
    }
  })
  // Plik Biblii (OpenSong albo Zefania XML) — tekst trafia do panelu, który go rozbiera.
  ipcMain.handle('bible:pick', async () => {
    const res = await dialog.showOpenDialog(control, { title: 'Wybierz plik Biblii', filters: [{ name: 'Biblia (XML)', extensions: ['xml', 'xmm', 'bible', 'zefania'] }, { name: 'Wszystkie pliki', extensions: ['*'] }], properties: ['openFile'] })
    if (res.canceled || !res.filePaths[0]) return null
    const buf = await fs.promises.readFile(res.filePaths[0])
    // Starsze pliki bywają w kodowaniu Windows-1250 / ISO-8859-2 — wtedy deklarują to w nagłówku.
    const enc = /encoding=["']([\w-]+)["']/i.exec(buf.subarray(0, 200).toString('latin1'))?.[1]?.toLowerCase() || 'utf-8'
    let text
    try { text = new TextDecoder(enc).decode(buf) } catch { text = buf.toString('utf8') }
    return { name: path.basename(res.filePaths[0]), text }
  })
  ipcMain.handle('update:state', () => ({ current: app.getVersion(), ...(update || {}) }))
  ipcMain.handle('update:install', () => {
    if (update?.ready && updater) updater.quitAndInstall(false, true)
    else if (update?.url) shell.openExternal(update.url)
  })
  setupUpdates()
  ipcMain.handle('window:onTop', (e, on) => { if (control && !control.isDestroyed()) control.setAlwaysOnTop(!!on, 'floating') })
  ipcMain.handle('app:user', () => { try { return os.userInfo().username + ' (' + os.hostname() + ')' } catch { return os.hostname() } })
  ipcMain.handle('cue:set', (e, on, token) => setCue(on, token))
  ipcMain.handle('cue:send', (e, state) => sendCue(state))

  ipcMain.on('remote:state', (e, state) => { remoteState = state })
  ipcMain.on('output:show', (e, payload) => { live = payload; toOutput('show', live) })
  ipcMain.on('output:video', (e, cmd) => toOutput('video:cmd', cmd))
  ipcMain.on('output:ready', () => toOutput('show', live))
  ipcMain.on('output:video-state', (e, state) => toControl('video:state', state))

  screen.on('display-added', onDisplayAdded)
  screen.on('display-removed', onDisplayRemoved)
  screen.on('display-metrics-changed', sendDisplays)

  createControl()
})

app.on('window-all-closed', () => app.quit())
