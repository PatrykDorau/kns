// Telefon czasem wraca z logowania Google (przekierowanie) z szerokim widokiem „jak na komputerze” — dopiero
// odświeżenie to naprawiało. Tu: przy starcie (i chwilę później) odświeżamy ustawienie widoku, a gdy to nie pomoże —
// jedno automatyczne przeładowanie strony (raz na kartę; włączona „Wersja na komputer” w Chrome zostaje z komunikatem).
const KEY = 'kns-vp-reload'
const wideOnPhone = () => screen.width < 600 && innerWidth > 800 && matchMedia('(pointer: coarse)').matches

function fix() {
  if (!wideOnPhone()) { try { sessionStorage.removeItem(KEY) } catch { /* bez pamięci */ } return }
  const meta = document.querySelector('meta[name=viewport]')
  const content = meta?.getAttribute('content') || 'width=device-width,initial-scale=1,viewport-fit=cover'
  meta?.setAttribute('content', content + ',maximum-scale=1')
  setTimeout(() => {
    meta?.setAttribute('content', content)
    let done = false
    try { done = !!sessionStorage.getItem(KEY) } catch { /* bez pamięci */ }
    if (wideOnPhone() && !done) { try { sessionStorage.setItem(KEY, '1') } catch { /* bez pamięci */ } location.reload() }
  }, 400)
}

export function startViewportFix() {
  fix()
  setTimeout(fix, 1500) // po przetworzeniu powrotu z logowania
}
