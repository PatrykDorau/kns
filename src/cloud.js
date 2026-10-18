// Baza danych (Supabase) jako „folder wspólny” aplikacji na komputer: te same funkcje co folder na dysku
// albo Dysk Google (sharedRead, sharedWrite, sharedSongsRead…), więc reszta aplikacji się nie zmienia.
// Logowanie: to samo konto Google co do Dysku (token tożsamości → Supabase). Załączniki zostają na Dysku.
// Dostępu pilnuje baza (reguły RLS według rang) — taka sama jak w aplikacji na telefon.
import { createClient } from '@supabase/supabase-js'

export const BAZA = 'baza'
export const CLOUD = {
  pushUrl: 'https://kns-nabo.netlify.app/api/push',
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
  // Napisy pieśni przez internet: kanał na żywo „napisy-<klucz>” (bez zapisu w bazie, bez logowania). Strona
  // kns-nabo.netlify.app/napisy?k=<klucz> (OBS na komputerze od streamu, w dowolnej sieci) pokazuje to, co tu nadajemy,
  // a po połączeniu prosi („hello”) o bieżącą zwrotkę.
  let lyricsCh = null, lyricsKey = '', lyricsNow = { text: '' }
  const lyricsSend = () => lyricsCh?.send({ type: 'broadcast', event: 'napisy', payload: lyricsNow }).catch(() => {})
  function lyrics(key, text) {
    if (key !== lyricsKey) {
      if (lyricsCh) sb.removeChannel(lyricsCh)
      lyricsCh = null; lyricsKey = key
      if (key) {
        lyricsCh = sb.channel('napisy-' + key, { config: { broadcast: { self: false } } })
        lyricsCh.on('broadcast', { event: 'hello' }, lyricsSend)
        lyricsCh.subscribe(status => { if (status === 'SUBSCRIBED') lyricsSend() })
      }
    }
    lyricsNow = { text: String(text || '') }
    if (key) lyricsSend()
  }

  // Odbiór napisów z rzutnika na innym komputerze (ten sam kanał co strona /napisy).
  function listenLyrics(key, onText) {
    const ch = sb.channel('napisy-' + key, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'napisy' }, ({ payload }) => onText(String(payload?.text || '')))
    ch.subscribe(status => { if (status === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'hello', payload: {} }).catch(() => {}) })
    return () => sb.removeChannel(ch)
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
    // Kim jest zalogowany i co mu wolno (rangi z bazy) — do odblokowania służb na komputerze.
    access: () => safe(async () => {
      const s = await session()
      const [[p], ranks] = await Promise.all([
        sb.from('people').select('email,name,status,roles').eq('id', s.user.id).then(check),
        sb.from('ranks').select('*').then(check),
      ])
      if (!p) throw new Error('Konta nie ma jeszcze w bazie — zaloguj się ponownie.')
      person = p
      const flag = f => (p.roles || []).some(r => ranks.some(x => x.id === r && x[f]))
      return { email: p.email, name: p.name || '', status: p.status, roles: p.roles || [], names: (p.roles || []).map(r => ranks.find(x => x.id === r)?.name).filter(Boolean), edit: flag('can_edit'), manage: flag('manage') }
    }),
    // Wydarzenia (kalendarz): zapis od razu w bazie; nowsza wersja w bazie wstrzymuje zapis.
    saveEvent: (ev, base = 0) => safe(async () => {
      const p = await active()
      const [row] = check(await sb.from('events').select('updated').eq('id', ev.id))
      if (row && (row.updated || 0) > base) throw new Error('Ktoś inny zmienił to wydarzenie w międzyczasie — kliknij „Synchronizuj” i spróbuj ponownie.')
      check(await sb.from('events').upsert({ id: ev.id, type: ev.type || 'inne', date: day(ev.date), is_public: ev.public ?? null, data: ev, updated: ev.updated || Date.now(), updated_by: ev.updatedBy || p.email }))
      return { ok: true }
    }),
    removeEvent: id => safe(async () => { await active(); check(await sb.from('events').delete().eq('id', id)); return { ok: true } }),
    // Podgląd dla gości (bez logowania): to, co baza pokazuje publicznie.
    publicPreview: () => safe(async () => check(await sb.rpc('public_preview'))),
    // „Posłuchaj”: linki YouTube i Spotify (czyta też gość).
    listen: () => safe(async () => ((check(await sb.from('site_settings').select('value').eq('key', 'posluchaj')) || [])[0]?.value || {})),
    lyrics, listenLyrics,
    // Skład zespołu: osoby ze służby muzycznej (dla osób z prawem edycji).
    // Przeczytane ogłoszenia (na koncie — te same co na stronie i telefonie).
    seenAnns: () => safe(async () => { await active(); return { ids: (check(await sb.from('seen_announcements').select('ann_id')) || []).map(x => x.ann_id) } }),
    markSeen: ids => safe(async () => { await active(); check(await sb.rpc('mark_seen', { ids })); return { ok: true } }),
    bandPeople: () => safe(async () => { await active(); return { people: check(await sb.rpc('band_people')) || [] } }),
    // Osoby (administrator): lista, zatwierdzanie, rangi.
    people: () => safe(async () => {
      await active()
      const [people, ranks] = await Promise.all([sb.from('people').select('*').order('requested').then(check), sb.from('ranks').select('*').order('sort').then(check)])
      return { people, ranks }
    }),
    setPerson: (email, status, roles) => safe(async () => {
      await active()
      return { person: check(await sb.rpc('set_person', { person_email: email, new_status: status ?? null, new_roles: Array.isArray(roles) ? roles : null })) }
    }),
    // Powiadomienia do wybranych osób: lista odbiorców i wysyłka przez /api/push (z tokenem logowania).
    directory: () => safe(async () => {
      await active()
      const [people, ranks] = await Promise.all([sb.rpc('people_directory').then(check), sb.from('ranks').select('*').order('sort').then(check)])
      return { people, ranks }
    }),
    // Zawsze w aplikacji (baza); dodatkowo na telefony tych, którzy je włączyli.
    notify: (people, msg) => safe(async () => {
      const s = await session()
      const inApp = check(await sb.rpc('inbox_send', { targets: people, title: msg.title || '', body: msg.body || '', url: msg.url || '' }))
      const res = await fetch(CLOUD.pushUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inbox: true, token: s.access_token }) }).catch(() => null)
      const out = (await res?.json().catch(() => ({}))) || {}
      return { ...(res?.ok ? out : { sent: 0 }), inApp }
    }),
    // Powiadomienia w aplikacji (dzwonek).
    inbox: () => safe(async () => ({ list: check(await sb.from('inbox').select('id,title,body,url,created,read').order('created', { ascending: false }).range(0, 49)) || [] })),
    inboxRead: ids => safe(async () => { if (ids.length) check(await sb.from('inbox').update({ read: true }).in('id', ids)); return { ok: true } }),
    // Pierwsze połączenie (po zalogowaniu Google): od razu sprawdza konto.
    connect: () => safe(async () => { await active(); return { ok: true, email: person.email } }),
    signOut: () => sb.auth.signOut({ scope: 'local' }).catch(() => {}),

    sharedRead: () => safe(async () => {
      await active()
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
      const [rows, events, tpl, news] = await Promise.all([
        all(() => sb.from('services').select('data').order('id')),
        all(() => sb.from('events').select('data,updated,status').or(`date.gte.${since},date.is.null`).order('id')),
        sb.from('templates').select('types').eq('id', 'main').then(check),
        all(() => sb.from('announcements').select('data,audience,updated,status').order('id')),
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
        // zgłoszenia czekające na zatwierdzenie — tylko w aplikacji na telefon/w przeglądarce
        events: events.filter(r => (r.status || 'published') === 'published').map(r => ({ ...r.data, updated: Math.max(r.data?.updated || 0, r.updated || 0) })),
        announcements: news.filter(r => (r.status || 'published') === 'published').map(r => ({ ...r.data, updated: Math.max(r.data?.updated || 0, r.updated || 0), audience: r.audience })),
      }
    }),
    sharedWrite: (dir, payload) => safe(async () => {
      const p = await active()
      const svc = payload.service
      let files = [], kept = [], warning = ''
      if (svc.files?.length) {
        const res = await api.cloudStoreFiles(svc)
        if (!res.error) { files = res.files; kept = res.kept } else {
          // Bez dostępu do folderu na Dysku nabożeństwo i tak się zapisuje: pliki, które już są na Dysku (kopie
          // z „dysk-google”), zostają; nowe zostają tylko na tym komputerze.
          const onDrive = f => /[\\/]dysk-google[\\/]/.test(f.path || '') || String(f.path || '').startsWith('pliki/')
          const name = f => String(f.path).split(/[\\/]/).pop()
          kept = svc.files.filter(onDrive).map(f => ({ ...f, path: 'pliki/' + name(f) }))
          const left = svc.files.length - kept.length
          warning = left ? `Zapisano, ale nowe załączniki (${left}) zostały tylko na tym komputerze — ${res.needLogin ? 'zaloguj się ponownie kontem Google' : 'to konto nie ma dostępu do folderu „Aplikacja KNS Nabo” na Dysku'}.` : ''
        }
      }
      const data = { ...svc, files: kept }
      check(await sb.from('services').upsert({ id: svc.id, date: day(svc.date), data, updated: svc.updated || Date.now(), updated_by: svc.updatedBy || p.email }))
      return { files, warning }
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
