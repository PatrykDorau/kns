// Podkład z YouTube: ukryte okno z oficjalnym odtwarzaczem (embed) w osobnej sesji, bez preloadu i bez dostępu do aplikacji.
// Dźwięk tego okna przechwytuje okno pulpitu (getDisplayMedia → setDisplayMediaRequestHandler w main.ts) i kieruje do
// miksu transmisji; lokalnie nic nie gra. KNS_YT_PLAYER_BASE — podstawiona strona w testach.
import { BrowserWindow } from 'electron'

const BASE = process.env.KNS_YT_PLAYER_BASE || 'https://www.youtube.com/embed/'
const REFERRER = 'https://kns-nabo.netlify.app/' // bez adresu strony YouTube nie wpuszcza do odtwarzacza (błąd 153)
const LOAD_MS = 15000 // tyle czeka na film, potem uznaje, że nie da się go odtworzyć

export default function createYtPlayer(parent: () => BrowserWindow) {
  let win: BrowserWindow | null = null, armed = false, want = false, since = 0
  async function open() {
    if (win && !win.isDestroyed()) return win
    win = new BrowserWindow({ show: false, parent: parent(), width: 640, height: 360, webPreferences: { partition: 'ytplayer', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', e => e.preventDefault())
    win.on('closed', () => { win = null })
    await win.loadURL('about:blank')
    return win
  }
  const run = (code: string) => (win && !win.isDestroyed() ? win.webContents.executeJavaScript(code).catch(() => null) : Promise.resolve(null))
  return {
    async arm() { await open(); armed = true; return true },
    // jednorazowo: kolejne getDisplayMedia to znów obraz rzutnika
    frame() { if (!armed || !win) return null; armed = false; return win.webContents.mainFrame },
    async play(id: string) {
      await open()
      want = true; since = Date.now()
      win.loadURL(BASE + encodeURIComponent(id) + '?autoplay=1&controls=0&rel=0&playsinline=1', { httpReferrer: REFERRER }).catch(() => {})
      return true
    },
    pause() { want = false; return run(`document.querySelector('video')?.pause(); true`) },
    resume() { want = true; since = Date.now(); return true },
    seek(sec: number) { return run(`{ const v = document.querySelector('video'); if (v) v.currentTime = ${+sec || 0} } true`) },
    // stan co pół sekundy; tu też pilnujemy startu, bo odtwarzacz bywa wstrzymany po załadowaniu
    async state() {
      const s = await run(`(() => { const v = document.querySelector('video'), ad = !!document.querySelector('.ad-showing')
        if (v && ${want} && v.paused && !v.ended) v.play().catch(() => {})
        return v ? { ready: true, time: v.currentTime, duration: v.duration || 0, playing: !v.paused && !v.ended, ended: v.ended, ad } : { ready: false, blocked: !!document.querySelector('.ytp-error') } })()`)
      const ready = !!s?.ready
      if (ready && s.playing) since = 0
      return { ...(s || {}), ready, error: want && !ready && (s?.blocked || (since && Date.now() - since > LOAD_MS)) ? 'Ten film nie daje się odtworzyć poza YouTube.' : '' }
    },
    close() { if (win && !win.isDestroyed()) win.destroy(); win = null },
  }
}
