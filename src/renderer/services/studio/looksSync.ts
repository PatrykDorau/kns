// Wyglądy streamu (presety z „Przygotowania” i to, co jest teraz wybrane) do przeniesienia na inny komputer:
// przez Dysk Google (to samo konto na obu komputerach) albo przez plik. Grafiki z Biblioteki nie jadą razem z wyglądem —
// na drugim komputerze trzeba je mieć w Bibliotece (presety, które ich używają, pokażą wtedy zamiast nich tło).
import { api, settings } from '@/stores'

const KEYS = ['studioPresets', 'presetOn', 'presetsV', 'cdLook', 'endLook', 'lifeLook', 'lowerLook', 'verseLook', 'banner', 'bannerQueue', 'bannerCycle', 'bannerSec',
  'prayerInk', 'prayerOutline', 'prayerStyle', 'prayerHead', 'prayerText', 'prayerSub', 'prayerLink', 'prayerLinkLabel', 'studioHidden', 'studioSlideSec'] as const
const KIND = 'kns-wyglady-streamu'

export function packLooks() {
  const looks: Record<string, unknown> = {}
  for (const k of KEYS) if (settings[k] !== undefined) looks[k] = JSON.parse(JSON.stringify(settings[k]))
  return { kind: KIND, v: 1, at: new Date().toISOString(), count: (settings.studioPresets || []).length, looks }
}
// Zastępuje wyglądy na tym komputerze tymi z paczki; zwraca liczbę presetów albo błąd.
export function applyLooks(pack): { count?: number, error?: string } {
  if (!pack || pack.kind !== KIND || !pack.looks?.studioPresets) return { error: 'To nie jest plik z wyglądami streamu.' }
  for (const k of KEYS) if (pack.looks[k] !== undefined) (settings as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(pack.looks[k]))
  return { count: pack.looks.studioPresets.length }
}
export async function looksToDrive() {
  const r = await api.looksWrite?.(packLooks())
  return r?.error ? { error: r.needLogin ? 'Zaloguj ten komputer do Google (Ustawienia aplikacji).' : r.error } : { ok: true }
}
export async function looksFromDrive() {
  const r = await api.looksRead?.()
  if (!r || r.error) return { error: r?.needLogin ? 'Zaloguj ten komputer do Google (Ustawienia aplikacji).' : r?.error || 'Nie udało się.' }
  if (r.missing) return { error: 'Na Dysku nie ma jeszcze wyglądów — najpierw „Wyślij na Dysk” na komputerze, na którym je ustawiłeś.' }
  return { pack: r.data, at: r.data?.at || r.mtime }
}
export function looksToFile() {
  const blob = new Blob([JSON.stringify(packLooks(), null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = 'wyglady-streamu-' + new Date().toISOString().slice(0, 10) + '.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
export function looksFromFile(): Promise<{ pack?: unknown, error?: string }> {
  return new Promise(resolve => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = '.json,application/json'
    inp.onchange = async () => {
      const f = inp.files?.[0]
      if (!f) return resolve({})
      try { resolve({ pack: JSON.parse(await f.text()) }) } catch { resolve({ error: 'Nie da się odczytać tego pliku.' }) }
    }
    inp.click()
  })
}
