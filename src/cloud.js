// Baza danych (Supabase) jako „folder wspólny” aplikacji na komputer: te same funkcje co folder na dysku
// albo Dysk Google (sharedRead, sharedWrite, sharedSongsRead…), więc reszta aplikacji się nie zmienia.
// Logowanie: to samo konto Google co do Dysku (token tożsamości → Supabase). Załączniki zostają na Dysku.
// Dostępu pilnuje baza (reguły RLS według rang) — taka sama jak w aplikacji na telefon.
import { createClient } from '@supabase/supabase-js'

export const BAZA = 'baza'
export const CLOUD = {
  url: 'https://igkjlgdpvgdeqfqctnnf.supabase.co',
  key: 'sb_publishable_Ji4v_zRY2OGsMRAWwiis-g_x6WAYCPI', // klucz publiczny — dostępu pilnuje baza
}

const day = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null)
const songKey = s => String(s.title || '') + '|' + (s.number || '')

export function createCloud(api, sb = createClient(CLOUD.url, CLOUD.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'kns-baza' },
})) {
  let person = null // { email, status, roles } — zalogowana osoba
  let remoteSongs = new Map() // id → wiersz pieśni z ostatniego odczytu (do wysyłania tylko zmian)

  function toError(error) {
    const msg = String(error?.message || error || '')
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Brak połączenia z bazą — sprawdź internet.'
    if (error?.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Brak uprawnień do zmian — poproś administratora (telefon → Osoby) o rangę z prawem edycji.'
    return msg || 'Błąd bazy danych.'
  }
  const check = res => { if (res.error) throw Object.assign(new Error(toError(res.error)), { db: true }); return res.data }
  async function all(query) {
    const out = []
    for (let from = 0; ; from += 1000) {
      const rows = check(await query().range(from, from + 999))
      out.push(...rows)
      if (rows.length < 1000) return out
    }
  }
  // Wynik w kształcie odpowiedzi folderu wspólnego: błąd zamiast wyjątku.
  const safe = job => job().catch(e => ({ error: e.message, needLogin: !!e.needLogin }))

  // Sesja bazy; gdy jej nie ma — logowanie tokenem tożsamości z logowania Google na tym komputerze.
  async function session() {
    const { data } = await sb.auth.getSession()
    if (data?.session) return data.session
    const t = await api.cloudIdToken()
    if (t.error || !t.idToken) throw Object.assign(new Error(t.error || 'Zaloguj się kontem Google.'), { needLogin: true })
    const res = await sb.auth.signInWithIdToken({ provider: 'google', token: t.idToken })
    if (res.error) throw Object.assign(new Error('Logowanie do bazy nie powiodło się: ' + res.error.message), { needLogin: /token|expired|audience/i.test(res.error.message) })
    return res.data.session
  }
  // Konto musi być zatwierdzone — inaczej baza i tak nic nie pokaże.
  async function active() {
    const s = await session()
    const [p] = check(await sb.from('people').select('email,status,roles').eq('id', s.user.id))
    person = p || null
    if (!p) throw new Error('Konta nie ma jeszcze w bazie — zaloguj się ponownie.')
    if (p.status === 'pending') throw new Error(`Konto ${p.email} czeka na zatwierdzenie przez administratora (telefon → Osoby).`)
    if (p.status !== 'active') throw new Error(`Konto ${p.email} nie ma dostępu do danych kościoła.`)
    return p
  }

  return {
    account: () => (person ? { provider: 'Baza danych', email: person.email } : null),
    person: () => person,
    // Pierwsze połączenie (po zalogowaniu Google): od razu sprawdza konto.
    connect: () => safe(async () => { await active(); return { ok: true, email: person.email } }),
    signOut: () => sb.auth.signOut({ scope: 'local' }).catch(() => {}),

    sharedRead: () => safe(async () => {
      await active()
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
      const [rows, events, tpl, news] = await Promise.all([
        all(() => sb.from('services').select('data').order('id')),
        all(() => sb.from('events').select('data').or(`date.gte.${since},date.is.null`).order('id')),
        sb.from('templates').select('types').eq('id', 'main').then(check),
        all(() => sb.from('announcements').select('data,audience').order('id')),
      ])
      // Teksty pieśni z nabożeństwa (komputer dopasowuje pieśni po tytule i numerze).
      if (!remoteSongs.size) for (const s of await all(() => sb.from('songs').select('*').order('id'))) remoteSongs.set(s.id, s)
      const byKey = new Map([...remoteSongs.values()].filter(s => !s.deleted).map(s => [songKey(s), s]))
      const services = rows.map(r => r.data)
      // Załączniki: ścieżki „pliki/…” → lokalne kopie z Dysku (pobierane dopiero przy wczytaniu w rzutniku).
      const withFiles = services.filter(s => s.files?.length)
      if (withFiles.length) {
        const mapped = await api.cloudMapFiles(withFiles.map(s => ({ id: s.id, files: s.files })))
        if (!mapped.error) for (const m of mapped.services) services.find(s => s.id === m.id).files = m.files
      }
      return {
        list: services.map(s => ({ service: s, songs: (s.songs || []).map(e => byKey.get(songKey(e))).filter(Boolean).map(({ number, title, text }) => ({ number, title, text })) })),
        templates: tpl[0]?.types || null,
        events: events.map(r => r.data),
        announcements: news.map(r => ({ ...r.data, audience: r.audience })),
      }
    }),
    sharedWrite: (dir, payload) => safe(async () => {
      const p = await active()
      const svc = payload.service
      let files = [], kept = []
      if (svc.files?.length) {
        const res = await api.cloudStoreFiles(svc)
        if (res.error) throw Object.assign(new Error('Załączniki: ' + res.error), { needLogin: res.needLogin })
        files = res.files; kept = res.kept
      }
      const data = { ...svc, files: kept }
      check(await sb.from('services').upsert({ id: svc.id, date: day(svc.date), data, updated: svc.updated || Date.now(), updated_by: svc.updatedBy || p.email }))
      return { files }
    }),
    sharedRemove: (dir, id) => safe(async () => { await active(); check(await sb.from('services').delete().eq('id', id)); return {} }),

    // Pieśni: „mtime” = najnowsza zmiana w bazie; gdy taka sama jak ostatnio — nic nie pobieramy.
    sharedSongsRead: (dir, known) => safe(async () => {
      await active()
      const [last] = check(await sb.from('songs').select('updated').order('updated', { ascending: false }).range(0, 0))
      const mtime = last?.updated || 0
      if (known && mtime === known && remoteSongs.size) return { unchanged: true, mtime }
      const rows = await all(() => sb.from('songs').select('*').order('id'))
      remoteSongs = new Map(rows.map(s => [s.id, s]))
      const deleted = {}
      for (const s of rows) if (s.deleted) deleted[s.id] = s.updated || 0
      return { songs: rows.filter(s => !s.deleted).map(({ id, number, title, text, updated }) => ({ id, number, title, text, updated })), deleted, mtime }
    }),
    // Wysyłane są tylko pieśni nowsze niż w bazie i nowe usunięcia (cała baza mogłaby mieć tysiące pieśni).
    sharedSongsWrite: (dir, { songs, deleted }) => safe(async () => {
      await active()
      const rows = []
      for (const s of songs) {
        const r = remoteSongs.get(s.id)
        if (!r || (!r.deleted && (s.updated || 0) > (r.updated || 0))) rows.push({ id: s.id, number: s.number || '', title: s.title, text: s.text || '', updated: s.updated || Date.now(), deleted: false })
      }
      for (const [id, at] of Object.entries(deleted || {})) {
        const r = remoteSongs.get(id)
        if (r && !r.deleted && at >= (r.updated || 0)) rows.push({ id, number: r.number, title: r.title, text: r.text, updated: at, deleted: true })
      }
      for (let i = 0; i < rows.length; i += 500) check(await sb.from('songs').upsert(rows.slice(i, i + 500)))
      for (const r of rows) remoteSongs.set(r.id, r)
      return { mtime: Math.max(0, ...[...remoteSongs.values()].map(s => s.updated || 0)) }
    }),
  }
}
