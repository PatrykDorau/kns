// Połączenie z bazą danych: wydarzenia, osoby, skrzynka, napisy i obraz rzutnika przez sieć, linki i kody QR.
import { churchEvents, cloud } from './state'

export async function saveChurchEvent(ev, base = 0) {
  if (!cloud) return { error: 'Brak połączenia z bazą danych.' }
  const res = await cloud.saveEvent(ev, base)
  if (res.error) return res
  const i = churchEvents.value.findIndex(x => x.id === ev.id)
  if (i >= 0) churchEvents.value[i] = ev
  else churchEvents.value.push(ev)
  return res
}
export async function removeChurchEvent(id) {
  if (!cloud) return { error: 'Brak połączenia z bazą danych.' }
  const res = await cloud.removeEvent(id)
  if (!res.error) churchEvents.value = churchEvents.value.filter(x => x.id !== id)
  return res
}
// Osoby i powiadomienia (baza danych).
export const loadBandPeople = () => (cloud ? cloud.bandPeople() : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
export const loadSeenAnns = () => (cloud ? cloud.seenAnns() : Promise.resolve({ ids: [] }))
export const markSeenAnns = ids => (cloud ? cloud.markSeen(ids) : Promise.resolve({}))
export const loadListen = () => (cloud ? cloud.listen() : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
export const loadPublicPreview = () => (cloud ? cloud.publicPreview() : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
export const loadPeople = () => (cloud ? cloud.people() : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
export const setPerson = (email, status, roles) => (cloud ? cloud.setPerson(email, status, roles) : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
export const loadDirectory = () => (cloud ? cloud.directory() : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
// Link do konkretnej rzeczy na stronie (po zalogowaniu otwiera ją od razu) — do wysłania komuś.
export const linkTo = (kind, id) => 'https://kns-nabo.netlify.app/' + kind + '/' + encodeURIComponent(id)
// Kod QR z linkiem — PNG 1200×1200 do pobrania (np. na grafikę ogłoszenia).
export async function downloadQr(kind, id, title) {
  const { default: qrcode } = await import('qrcode-generator')
  const code = qrcode(0, 'M'); code.addData(linkTo(kind, id)); code.make()
  const n = code.getModuleCount(), size = 1200, cell = Math.floor(size / (n + 8)), off = Math.floor((size - cell * n) / 2)
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000'
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (code.isDark(r, k)) g.fillRect(off + k * cell, off + r * cell, cell, cell)
  const slug = String(title || kind).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'qr-' + (slug || kind) + '.png'; a.click()
}
export async function copyLink(kind, id) {
  const url = linkTo(kind, id)
  try { await navigator.clipboard.writeText(url); return url } catch { return '' }
}
export const loadInbox = () => (cloud ? cloud.inbox() : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
export const readInbox = ids => (cloud ? cloud.inboxRead(ids) : Promise.resolve({ ok: true }))
export const notifyPeople = (people, msg) => (cloud ? cloud.notify(people, msg) : Promise.resolve({ error: 'Brak połączenia z bazą danych.' }))
// Napisy z innego komputera (rzutnik gdzie indziej): kanał na żywo z kluczem z adresu …/napisy?k=…
export function listenLyrics(key, onText) { return cloud ? cloud.listenLyrics(key, onText) : () => {} }
export const publishProjector = row => (cloud ? cloud.publishProjector(row) : Promise.resolve({}))
export const unpublishProjector = id => (cloud ? cloud.unpublishProjector(id) : Promise.resolve({}))
export const loadProjectors = () => (cloud ? cloud.projectors() : Promise.resolve([]))
export const screenSignal = (key, onMsg) => (cloud ? cloud.signal(key, onMsg) : null) // obraz rzutnika przez sieć
export const liveChannel = (prefix, key, onMsg) => (cloud ? cloud.signal(key, onMsg, prefix) : null) // pilot kaznodziei, slajdy dla Stream
export const lyricsLink = key => (cloud ? cloud.lyricsLink(key) : 'connecting') // napisy pieśni na przezroczystym tle (źródło „Przeglądarka” w OBS)
