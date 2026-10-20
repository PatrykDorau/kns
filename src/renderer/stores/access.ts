import { ask } from '@/utils/ask'
// Dostęp do służb (konto i rangi z bazy), logowanie Google, wybór folderu wspólnego.
import { reactive } from 'vue'
import { BAZA, api, busy, cloud, role, settings } from './state'
import { forgetShared, googleError, googleExpired, sharedAccount, sharedStatus, sharedSuggestions, syncShared } from './sync'

/* ---------- dostęp do służb (konto i rangi z bazy) ---------- */
// Bez zalogowania nic nie działa. Rzutnik i Stream — służba techniczna (ranga „technika”) i administrator;
// Organizacja — rangi z prawem edycji. Bez internetu (np. w kościele) liczy się ostatnie udane sprawdzenie
// z tego komputera, jeśli było w ciągu 30 dni — żeby rzutnik nie stanął w trakcie nabożeństwa.
export const access = reactive({ checked: false, status: '', email: '', name: '', roles: [], names: [], edit: false, manage: false, offline: false, error: '' })
export const ACCESS_KEY = 'kns-dostep', ACCESS_DAYS = 30
export function applyAccess(a, offline = false) {
  Object.assign(access, { status: a.status || '', email: a.email || '', name: a.name || '', roles: a.roles || [], names: a.names || [], edit: !!a.edit, manage: !!a.manage, offline, error: '' })
}
export async function refreshAccess() {
  if (!cloud) return
  const r = await cloud.access()
  access.checked = true
  if (!r.error) {
    applyAccess(r)
    try { localStorage.setItem(ACCESS_KEY, JSON.stringify({ ...r, at: Date.now() })) } catch { /* bez zapisu */ }
    return
  }
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(ACCESS_KEY) || 'null') } catch { /* brak */ }
  if (/połączenia|fetch|network/i.test(r.error) && saved && Date.now() - saved.at < ACCESS_DAYS * 86400000) { applyAccess(saved, true); return }
  applyAccess({})
  access.error = r.needLogin ? '' : r.error
}
export function canUse(which) {
  if (access.status !== 'active') return false
  if (which === 'calendar') return true
  if (which === 'planner') return access.edit
  return access.roles.includes('technika') || access.manage
}
export function accessReason(which) {
  if (!access.status) return 'Zaloguj się kontem Google'
  if (access.status === 'pending') return 'Konto czeka na zatwierdzenie'
  if (access.status !== 'active') return 'Brak dostępu'
  if (canUse(which)) return ''
  return which === 'planner' ? 'Tylko dla osób z prawem edycji' : 'Tylko dla służby technicznej'
}

// Logowanie do Dysku Google: aplikacja sama czyta i zapisuje folder „Aplikacja KNS Nabo” — bez programu
// „Dysk Google na komputer” i bez wskazywania folderu. W ustawieniach zamiast ścieżki jest wtedy „google”.
export async function loginGoogle() {
  busy.value = 'Dokończ logowanie w przeglądarce, która się otworzyła…'
  try {
    googleError.value = ''
    const res = await api.googleLogin()
    if (res.error) { googleError.value = 'Logowanie nie powiodło się: ' + res.error; return }
    googleExpired.value = false
    if (cloud) {
      // Dane kościoła są w bazie; to samo konto Google loguje do bazy (konto musi być zatwierdzone).
      await cloud.signOut()
      const c = await cloud.connect()
      if (c.error && !/czeka na zatwierdzenie|nie ma dostępu/.test(c.error)) { googleError.value = c.error; return }
      if (c.error) sharedStatus.value = c.error
      sharedAccount.value = cloud.account()
      await refreshAccess()
      if (settings.sharedDir !== BAZA) connectSharedDir(BAZA)
      else syncShared()
      return
    }
    sharedAccount.value = res.email ? { provider: 'Dysk Google', email: res.email } : sharedAccount.value
    if (settings.sharedDir !== 'google') connectSharedDir('google')
    else syncShared()
  } finally {
    busy.value = ''
  }
}
export async function logoutGoogle() {
  await api.googleLogout()
  await cloud?.signOut()
  try { localStorage.removeItem(ACCESS_KEY) } catch { /* bez zapisu */ }
  applyAccess({})
  role.value = null
  googleExpired.value = false
  leaveSharedDir()
}
export async function findSharedDir() {
  sharedSuggestions.value = settings.sharedDir ? [] : await api.sharedSuggest()
}
export function connectSharedDir(dir) {
  if (!dir || dir === settings.sharedDir) return
  forgetShared()
  settings.sharedDir = dir
  sharedSuggestions.value = []
}
export async function pickSharedDir() {
  const dir = await api.sharedPick()
  if (!dir || dir === settings.sharedDir) return
  // Łatwo kliknąć o jeden folder za wysoko (np. „Mój dysk”) — wtedy pytamy, zanim cokolwiek tam powstanie.
  const check = await api.sharedCheck(dir)
  if (!check.hasData && !(await ask(`W folderze „${check.name}” nie ma jeszcze danych aplikacji (podfolderów „nabozenstwa” i „piesni”).\n\nUtworzyć je tutaj? Wybierz „Anuluj”, jeśli chodziło o folder „Aplikacja KNS Nabo”.`))) return
  connectSharedDir(dir)
}
export function leaveSharedDir() {
  settings.sharedDir = ''
  sharedStatus.value = ''
  forgetShared()
  findSharedDir()
}
