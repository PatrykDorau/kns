// Nowa wersja strony: zainstalowana aplikacja na telefonie często nie przeładowuje się sama (wraca z pamięci).
// Przy powrocie do aplikacji i co 30 minut sprawdzamy version.json; jest nowsza — przeładowanie przy powrocie
// (gdy nic nie jest w edycji), a w trakcie pracy pasek „Nowa wersja — odśwież”.
import { ref } from 'vue'

export const updateReady = ref(false)
let busy = false
async function check(reloadNow: () => boolean) {
  if (busy || !import.meta.env.PROD) return
  busy = true
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
    const { build } = await res.json()
    if (build && build !== __BUILD_ID__) {
      if (reloadNow()) location.reload()
      else updateReady.value = true
    }
  } catch { /* bez internetu — sprawdzimy później */ } finally { busy = false }
}

// canReload: czy można przeładować bez utraty pracy (nic niezapisanego)
export function startUpdateCheck(canReload: () => boolean) {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(canReload) })
  setInterval(() => check(() => false), 30 * 60e3)
  setTimeout(() => check(() => false), 20e3)
}
