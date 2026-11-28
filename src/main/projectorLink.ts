// Połączenie z rzutnikiem Epson (iProjection przez Wi-Fi): diagnoza, dlaczego laptop nie widzi rzutnika, i szybkie
// połączenie ręczne po adresie IP (iProjection: tryb zaawansowany → „Wyszukiwanie ręczne”).
// Sprawdza: w jakiej sieci Wi-Fi jest laptop, czy jest w tej samej podsieci co rzutnik, czy rzutnik odpowiada
// i które jego usługi działają (projekcja Epson, sterowanie ESC/VP.net, PJLink, strona WWW), a przez PJLink —
// czy jest włączony. Niczego nie zmienia ani w laptopie, ani w rzutniku.
import { execFile } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { clipboard, shell } from 'electron'

const run = (cmd: string, args: string[], timeout = 8000) => new Promise<string>(resolve =>
  execFile(cmd, args, { windowsHide: true, timeout }, (err, stdout) => resolve(String(stdout || ''))))

const IP = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const toNum = (ip: string) => ip.split('.').reduce((a, x) => (a << 8) + (+x & 255), 0) >>> 0

// Sieć Wi-Fi laptopa (nazwa, siła sygnału) — z „netsh wlan show interfaces” (działa też w polskim Windows).
async function wifi() {
  const out = await run('netsh', ['wlan', 'show', 'interfaces'])
  const ssid = (out.match(/^\s*SSID\s*:\s*(.+)$/m) || [])[1]?.trim() || ''
  const signal = (out.match(/:\s*(\d{1,3})\s*%/) || [])[1] || ''
  return { ssid, signal: signal ? +signal : null }
}
// Adresy IPv4 laptopa (bez pętli zwrotnej) z maskami.
function addresses() {
  const list: { name: string, ip: string, mask: string }[] = []
  for (const [name, arr] of Object.entries(os.networkInterfaces())) for (const a of arr || []) if (a.family === 'IPv4' && !a.internal) list.push({ name, ip: a.address, mask: a.netmask })
  return list
}
function tcp(host: string, port: number, ms = 1500) {
  return new Promise<boolean>(resolve => {
    const s = net.connect({ host, port })
    const done = (ok: boolean) => { s.destroy(); resolve(ok) }
    s.setTimeout(ms, () => done(false))
    s.on('connect', () => done(true))
    s.on('error', () => done(false))
  })
}
async function ping(ip: string) {
  const out = await run('ping', ['-n', '2', '-w', '900', ip], 6000)
  const m = out.match(/(?:czas|time)[=<]\s*(\d+)\s*ms/i)
  return { ok: /TTL=/i.test(out), ms: m ? +m[1] : null }
}
// PJLink (port 4352): stan zasilania; gdy rzutnik wymaga hasła PJLink — tylko informacja, że jest.
function pjlinkPower(ip: string) {
  return new Promise<string>(resolve => {
    const s = net.connect({ host: ip, port: 4352 })
    let buf = '', asked = false
    const end = (v: string) => { s.destroy(); resolve(v) }
    s.setTimeout(2500, () => end(''))
    s.on('error', () => end(''))
    s.on('data', d => {
      buf += d.toString()
      if (!asked && /PJLINK 1/.test(buf)) return end('hasło')
      if (!asked && /PJLINK 0/.test(buf)) { asked = true; buf = ''; s.write('%1POWR ?\r'); return }
      const m = buf.match(/%1POWR=(\w+)/)
      if (m) end({ 0: 'wyłączony', 1: 'włączony', 2: 'wyłącza się', 3: 'włącza się' }[m[1]] || '')
    })
  })
}

export async function checkProjector(ip: string) {
  ip = String(ip || '').trim()
  const net4 = addresses(), w = await wifi()
  if (!IP.test(ip)) return { error: 'Wpisz adres IP rzutnika, np. 192.168.1.50 (widać go na ekranie rzutnika, gdy nie ma obrazu).', wifi: w, addresses: net4 }
  const same = net4.find(a => ((toNum(a.ip) ^ toNum(ip)) & toNum(a.mask)) === 0) || null
  const [p, epson, escvp, pj, web] = await Promise.all([ping(ip), tcp(ip, 3620), tcp(ip, 3629), tcp(ip, 4352), tcp(ip, 80)])
  const power = pj ? await pjlinkPower(ip) : ''
  return { ip, wifi: w, addresses: net4, sameSubnet: !!same, via: same?.name || '', ping: p, ports: { epson, escvp, pjlink: pj, web }, power }
}

// Program Epson iProjection (instalowany zwykle w Program Files\Epson Projector\…) — pierwszy pasujący .exe.
function findIProjection() {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean) as string[]
  const hits: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || hits.length) return
    let list: fs.Dirent[] = []
    try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of list) {
      const p = path.join(dir, e.name)
      if (e.isDirectory() && (depth > 0 || /epson/i.test(e.name))) walk(p, depth + 1)
      else if (e.isFile() && /\.exe$/i.test(e.name) && /iprojection|emp_nsc/i.test(e.name) && !/uninst|setup/i.test(e.name)) hits.push(p)
    }
  }
  for (const r of roots) walk(r, 0)
  return hits[0] || ''
}
// Adres do schowka (w iProjection: „Wyszukiwanie ręczne” → Ctrl+V) i uruchomienie programu.
export async function openIProjection(ip: string) {
  if (IP.test(String(ip || '').trim())) clipboard.writeText(String(ip).trim())
  const exe = findIProjection()
  if (!exe) return { error: 'Nie znalazłem programu Epson iProjection na tym komputerze — zainstaluj go ze strony Epson.', copied: true }
  const err = await shell.openPath(exe)
  return err ? { error: err, copied: true } : { ok: true, exe, copied: true }
}
