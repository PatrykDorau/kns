// Dane w bazie Supabase zamiast plików JSON na Dysku Google — ten sam zestaw funkcji co drive.js,
// więc ekrany aplikacji się nie zmieniają. Dostępu pilnuje baza (reguły RLS według rang, supabase/schema.sql).
// Pliki (zdjęcia, filmy, prezentacje) zostają na Dysku Google: do nich potrzebne jest osobne pozwolenie
// Google, o które aplikacja pyta dopiero przy dodawaniu załącznika.
import { createDrive } from './drive.js'

// Rangi z bazy → kształt używany w aplikacji (jak w serwer.gs).
const rank = r => ({ id: r.id, name: r.name, edit: r.can_edit, council: r.council, protocols: r.protocols, manage: r.manage })
const view = p => ({ email: p.email, name: p.name || '', status: p.status, roles: p.roles || [], requested: p.requested ? new Date(p.requested).getTime() : 0, newsletter: !!p.newsletter })
const day = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null)

export function createSupa(config, client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})) {
  const sb = client
  let session = null
  const ready = sb.auth.getSession().then(({ data }) => { session = data?.session || null }).catch(() => {})
  sb.auth.onAuthStateChange((_event, s) => { session = s })
  const files = config.noFiles ? null : createDrive({ ...config, apiUrl: '' }) // tylko załączniki
  const who = () => session?.user?.email || ''

  function toError(error) {
    const msg = String(error?.message || error || '')
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Brak połączenia z bazą — sprawdź internet.')
    if (error?.status === 401 || /JWT|not authenticated/i.test(msg)) return Object.assign(new Error('Sesja wygasła — zaloguj się ponownie.'), { auth: true })
    if (error?.code === '42501' || /row-level security|permission denied/i.test(msg)) return new Error('Nie masz uprawnień do tej zmiany — poproś administratora o odpowiednią rangę.')
    return new Error(msg || 'Błąd bazy danych.')
  }
  const check = res => { if (res.error) throw toError(res.error); return res.data }
  // Wszystkie wiersze (baza oddaje najwyżej 1000 naraz).
  async function all(query) {
    const out = []
    for (let from = 0; ; from += 1000) {
      const rows = check(await query().range(from, from + 999))
      out.push(...rows)
      if (rows.length < 1000) return out
    }
  }
  // Równoczesna edycja: nowsza wersja w bazie wstrzymuje zapis (chyba że force) — tak jak przy plikach na Dysku.
  async function guardNewer(table, id, base, force, what) {
    if (force) return null
    const [row] = check(await sb.from(table).select('*').eq('id', id))
    if (row && !row.deleted && (row.updated || 0) > base) throw Object.assign(new Error(`Ktoś inny zmienił ${what} w międzyczasie.`), { conflict: true, row })
    return row || null
  }
  const withUpdated = r => ({ ...r.data, updated: Math.max(r.data?.updated || 0, r.updated || 0) })
  const songsList = async () => (await all(() => sb.from('songs').select('id,number,title,text,updated').eq('deleted', false).order('id')))
  // Załączniki: logowanie Google z dostępem do Dysku dopiero przy pierwszym pliku.
  async function withFiles(job) {
    if (!files) throw new Error('Załączniki nie są dostępne.')
    if (!files.hasDrive()) await files.signIn(false, 'drive')
    await files.prepareFiles()
    try { return await job() } catch (e) {
      if (!e.auth) throw e
      await files.signIn(false, 'drive'); await files.prepareFiles()
      return job()
    }
  }

  const api = {
    enabled: true,
    async call(action, data = {}) {
      if (action === 'public') return check(await sb.rpc('public_preview'))
      if (!session) throw Object.assign(new Error('Brak logowania.'), { auth: true })
      if (action === 'me') {
        const [rows, ranks] = await Promise.all([sb.from('people').select('*').eq('id', session.user.id), sb.from('ranks').select('*').order('sort')].map(q => q.then(check)))
        if (!rows.length) throw new Error('Nie znaleziono konta w bazie — wyloguj się i zaloguj ponownie.')
        return { person: view(rows[0]), ranks: ranks.map(rank) }
      }
      if (action === 'people') {
        const [rows, ranks] = await Promise.all([sb.from('people').select('*').order('requested'), sb.from('ranks').select('*').order('sort')].map(q => q.then(check)))
        return { people: rows.map(view), ranks: ranks.map(rank) }
      }
      if (action === 'setPerson') {
        const p = check(await sb.rpc('set_person', { person_email: data.email, new_status: data.status ?? null, new_roles: Array.isArray(data.roles) ? data.roles : null }))
        return { person: view(p) }
      }
      if (action === 'calendarToken') return { token: check(await sb.rpc('my_calendar_token', { renew: !!data.renew })) }
      if (action === 'setNewsletter') return { person: view(check(await sb.rpc('set_newsletter', { enabled: !!data.on }))) }
      throw new Error('Nieznane polecenie.')
    },
  }

  return {
    demo: false,
    backend: 'supabase',
    api,
    ready,
    signedIn: () => !!session,
    account: () => who(),
    accessToken: () => session?.access_token || '',
    hasDrive: () => true, // dane są w bazie — Dysk tylko do załączników
    // Logowanie Google przez Supabase: strona przechodzi do Google i wraca już zalogowana.
    async signIn(choose = false) {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: location.origin + location.pathname,
        queryParams: choose || !who() ? { prompt: 'select_account' } : { login_hint: who() },
      } })
      if (error) throw toError(error)
      await new Promise(() => {}) // czekamy na przejście do Google
    },
    forget() { session = null; sb.auth.signOut({ scope: 'local' }).catch(() => {}) },
    signOut() { session = null; sb.auth.signOut({ scope: 'local' }).catch(() => {}); files?.signOut() },

    async load() {
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
      const [services, songs, events, tpl, news] = await Promise.all([
        all(() => sb.from('services').select('data,updated').order('id')),
        songsList(),
        all(() => sb.from('events').select('data,updated').or(`date.gte.${since},date.is.null`).order('id')),
        sb.from('templates').select('types,updated').eq('id', 'main').then(check),
        all(() => sb.from('announcements').select('data,audience,updated').order('id')),
      ])
      return {
        // „updated” z kolumny — rekordy dodane wprost w bazie mogą go nie mieć w danych (inaczej każdy zapis byłby „konfliktem”)
        services: services.map(withUpdated), songs, events: events.map(withUpdated),
        templates: tpl[0]?.types || null, templatesUpdated: tpl[0]?.updated || 0,
        announcements: news.map(r => ({ ...withUpdated(r), audience: r.audience })),
      }
    },
    async save(payload, base = 0, force = false) {
      const s = payload.service
      await guardNewer('services', s.id, base, force, 'to nabożeństwo')
      check(await sb.from('services').upsert({ id: s.id, date: day(s.date), data: s, updated: s.updated || Date.now(), updated_by: s.updatedBy || who() }))
    },
    async remove(id) { check(await sb.from('services').delete().eq('id', id)) },
    async saveSongs(change, base = 0, force = false) {
      const id = change.song?.id || change.remove
      if (change.song) {
        let remote
        try { remote = await guardNewer('songs', id, base, force, 'tę pieśń') } catch (e) {
          if (e.conflict) e.remote = { id, number: e.row.number, title: e.row.title, text: e.row.text, updated: e.row.updated }
          throw e
        }
        const s = change.song
        check(await sb.from('songs').upsert({ id, number: s.number || '', title: s.title, text: s.text || '', updated: Math.max(Date.now(), (remote?.updated || 0) + 1), deleted: false }))
      } else {
        check(await sb.from('songs').update({ deleted: true, updated: Date.now() }).eq('id', id))
      }
      return songsList()
    },
    async savePush(id, data) { check(await sb.from('push_devices').upsert({ id, data, updated: new Date().toISOString() })) },
    async removePush(id) { check(await sb.from('push_devices').delete().eq('id', id)) },

    async saveEvent(ev, base = 0, force = false) {
      await guardNewer('events', ev.id, base, force, 'to wydarzenie')
      check(await sb.from('events').upsert({ id: ev.id, type: ev.type || 'inne', date: day(ev.date), is_public: ev.public ?? null, data: ev, updated: ev.updated || Date.now(), updated_by: ev.updatedBy || who() }))
    },
    async removeEvent(id) { check(await sb.from('events').delete().eq('id', id)) },
    async saveTemplates(types, base = 0, force = false) {
      await guardNewer('templates', 'main', base, force, 'szablony')
      const updated = Date.now()
      check(await sb.from('templates').upsert({ id: 'main', types, updated, updated_by: who() }))
      return updated
    },
    async loadProtocols(kind) {
      return (await all(() => sb.from('protocols').select('data').eq('kind', kind).order('id'))).map(r => r.data)
    },
    async saveProtocol(p, base = 0, force = false) {
      await guardNewer('protocols', p.id, base, force, 'ten protokół')
      check(await sb.from('protocols').upsert({ id: p.id, kind: p.kind, event_id: p.eventId || null, date: day(p.date), status: p.status || 'szkic', data: p, updated: p.updated || Date.now(), updated_by: p.updatedBy || who() }))
    },
    async removeProtocol(id) { check(await sb.from('protocols').delete().eq('id', id)) },
    async saveAnnouncement(item, base = 0, force = false) {
      await guardNewer('announcements', item.id, base, force, 'to ogłoszenie')
      const { audience, ...data } = item
      check(await sb.from('announcements').upsert({ id: item.id, audience: audience || 'members', important: !!item.important, until: day(item.until), data, updated: item.updated || Date.now(), updated_by: item.updatedBy || who() }))
    },
    async removeAnnouncement(item) { check(await sb.from('announcements').delete().eq('id', item.id)) },
    // Grafiki ogłoszeń: publiczny kosz „ogloszenia” w Supabase Storage (losowe nazwy plików).
    uploadImage(blob) { return this.uploadFile(blob, 'jpg') },
    async uploadFile(blob, ext) {
      const path = crypto.randomUUID() + '.' + String(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const { error } = await sb.storage.from('ogloszenia').upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000' })
      if (error) throw new Error('Nie udało się wysłać pliku: ' + error.message)
      return sb.storage.from('ogloszenia').getPublicUrl(path).data.publicUrl
    },
    async removeImage(url) {
      const path = String(url || '').split('/ogloszenia/')[1]
      if (path) await sb.storage.from('ogloszenia').remove([path]).catch(() => {})
    },

    searchFiles: text => withFiles(() => files.searchFiles(text)),
    attachFromDrive: (svc, file, onProgress) => withFiles(() => files.attachFromDrive(svc, file, onProgress)),
    attachFromPhone: (svc, blob, onProgress) => withFiles(() => files.attachFromPhone(svc, blob, onProgress)),

    // Jednorazowo (administrator): wszystko z plików na Dysku Google do bazy. Rekord, który w bazie jest
    // nowszy niż na Dysku, zostaje. Zwraca liczby przeniesionych rzeczy.
    async migrateFromDrive(step = () => {}) {
      if (!files) throw new Error('Brak dostępu do Dysku.')
      step('Łączę z Dyskiem Google…')
      if (!files.hasDrive()) await files.signIn(true, 'drive')
      step('Czytam dane z Dysku…')
      const d = await files.load()
      const protocols = []
      for (const kind of ['czlonkowskie', 'rada']) {
        try { protocols.push(...await files.loadProtocols(kind)) } catch (e) { if (e.auth) throw e }
      }
      const newer = async (table, rows) => {
        if (!rows.length) return rows
        const have = new Map((await all(() => sb.from(table).select('id,updated').order('id'))).map(r => [r.id, r.updated || 0]))
        return rows.filter(r => !have.has(r.id) || have.get(r.id) <= (r.updated || 0))
      }
      const put = async (table, rows) => {
        rows = await newer(table, rows)
        for (let i = 0; i < rows.length; i += 500) check(await sb.from(table).upsert(rows.slice(i, i + 500)))
        return rows.length
      }
      const counts = {}
      step('Przenoszę nabożeństwa…')
      counts.services = await put('services', d.services.map(s => ({ id: s.id, date: day(s.date), data: s, updated: s.updated || 0, updated_by: s.updatedBy || null })))
      step('Przenoszę pieśni…')
      counts.songs = await put('songs', d.songs.filter(s => s.id && s.title).map(s => ({ id: s.id, number: s.number || '', title: s.title, text: s.text || '', updated: s.updated || 0, deleted: false })))
      step('Przenoszę kalendarz, szablony, ogłoszenia i protokoły…')
      counts.events = await put('events', (d.events || []).map(e => ({ id: e.id, type: e.type || 'inne', date: day(e.date), is_public: e.public ?? null, data: e, updated: e.updated || 0, updated_by: e.updatedBy || null })))
      counts.templates = d.templates ? await put('templates', [{ id: 'main', types: d.templates, updated: d.templatesUpdated || 0, updated_by: null }]) : 0
      counts.announcements = await put('announcements', (d.announcements || []).map(a => { const { audience, ...data } = a; return { id: a.id, audience: audience || 'members', important: !!a.important, until: day(a.until), data, updated: a.updated || 0, updated_by: a.updatedBy || null } }))
      counts.protocols = await put('protocols', protocols.map(p => ({ id: p.id, kind: p.kind, event_id: p.eventId || null, date: day(p.date), status: p.status || 'szkic', data: p, updated: p.updated || 0, updated_by: p.updatedBy || null })))
      return counts
    },
  }
}
