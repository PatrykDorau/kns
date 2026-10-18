// Dane w bazie Supabase zamiast plików JSON na Dysku Google — ten sam zestaw funkcji co drive.js,
// więc ekrany aplikacji się nie zmieniają. Dostępu pilnuje baza (reguły RLS według rang, supabase/schema.sql).
// Pliki (zdjęcia, filmy, prezentacje) zostają na Dysku Google: do nich potrzebne jest osobne pozwolenie
// Google, o które aplikacja pyta dopiero przy dodawaniu załącznika.
import { createDrive } from './drive.js'

// Rangi z bazy → kształt używany w aplikacji (jak w serwer.gs).
const rank = r => ({ id: r.id, name: r.name, edit: r.can_edit, council: r.council, protocols: r.protocols, manage: r.manage, approve: !!r.approve })
const view = p => ({ email: p.email, name: p.name || '', grupa: p.grupa || '', status: p.status, roles: p.roles || [], requested: p.requested ? new Date(p.requested).getTime() : 0, newsletter: !!p.newsletter })
const day = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null)

export function createSupa(config, client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})) {
  const sb = client
  let session = null
  // Aplikacja na komputer (strona wbudowana): logowanie tym samym kontem Google co aplikacja — bez drugiego logowania.
  const desk = typeof window !== 'undefined' ? window.knsDesktop : null
  const ready = sb.auth.getSession().then(async ({ data }) => {
    session = data?.session || null
    if (session || !desk) return
    const token = await desk.idToken().catch(() => null)
    if (!token) return
    const res = await sb.auth.signInWithIdToken({ provider: 'google', token })
    session = res.data?.session || null
  }).catch(() => {})
  sb.auth.onAuthStateChange((_event, s) => { session = s })
  // Świeże powiadomienia w aplikacji, które ta osoba właśnie wywołała — serwer rozsyła je też na telefony.
  const pushInbox = async () => {
    try {
      const res = await fetch((location.protocol.startsWith('http') ? '' : 'https://kns-nabo.netlify.app') + '/api/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inbox: true, token: session?.access_token || '' }),
      })
      return await res.json()
    } catch { return {} }
  }
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
  // Zgłoszenia od członków: status (opublikowane / czeka na zatwierdzenie) i czy to moje.
  const withMeta = r => ({ ...withUpdated(r), status: r.status || 'published', mine: !!session && r.created_by === session.user.id })
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
      // „Posłuchaj”: linki YouTube i Spotify (czyta każdy, także gość; zmienia administrator).
      if (action === 'listen') return (check(await sb.from('site_settings').select('value').eq('key', 'posluchaj')) || [])[0]?.value || {}
      if (action === 'setListen') return check(await sb.rpc('set_site_setting', { k: 'posluchaj', v: { youtube: data.youtube || '', youtubeMore: data.youtubeMore || '', spotify: data.spotify || '' } }))
      // Terminarz ASB — także dla gości (bez prowadzących i notatek).
      if (action === 'asbPublic') return check(await sb.rpc('asb_public'))
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
      // Powiadomienia do wybranych osób: lista osób i wysyłka przez /api/push (z tokenem logowania).
      if (action === 'directory') return { people: check(await sb.rpc('people_directory')) }
      // Powiadomienie do wybranych: zawsze w aplikacji (baza), dodatkowo na telefony (jeśli ktoś włączył).
      if (action === 'notify') {
        const inApp = check(await sb.rpc('inbox_send', { targets: data.people, title: data.title || '', body: data.body || '', url: data.url || '' }))
        const out = await pushInbox()
        return { sent: out.sent || 0, inApp }
      }
      // Świeże powiadomienia w aplikacji, które właśnie wywołałem — także na telefony odbiorców (jeśli włączyli).
      if (action === 'pushInbox') return pushInbox()
      // Próbny newsletter e-mail (wysyła skrypt Google w ciągu minuty) i jego stan.
      if (action === 'testNewsletter') return { id: check(await sb.rpc('request_test_newsletter')) }
      if (action === 'mailStatus') return (check(await sb.from('mail_requests').select('id,sent').eq('id', data.id)) || [])[0] || null
      // Powiadomienia w aplikacji (dzwonek): moje wpisy, oznaczanie jako przeczytane.
      if (action === 'inbox') return check(await sb.from('inbox').select('id,title,body,url,created,read').order('created', { ascending: false }).range(0, 49)) || []
      if (action === 'inboxRead') {
        for (const id of data.ids || []) check(await sb.from('inbox').update({ read: true }).eq('id', id))
        return { ok: true }
      }
      // Zgłoszenie do służby: telefony liderów (wpis w aplikacji robi baza).
      if (action === 'ministryPush') {
        const res = await fetch((location.protocol.startsWith('http') ? '' : 'https://kns-nabo.netlify.app') + '/api/push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ministry: true, token: session.access_token, id: data.id }),
        })
        return res.json().catch(() => ({}))
      }
      // (starsze) Nowe zgłoszenie: powiadomienie dla zatwierdzających — teraz przez pushInbox.
      if (action === 'review') {
        const res = await fetch((location.protocol.startsWith('http') ? '' : 'https://kns-nabo.netlify.app') + '/api/push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review: true, token: session.access_token, title: data.title }),
        })
        return res.json().catch(() => ({}))
      }
      // Profil: imię i nazwisko, grupka; podpowiedzi grupek.
      if (action === 'setProfile') return { person: view(check(await sb.rpc('set_my_profile', { new_name: data.name, new_group: data.grupa || '' }))) }
      if (action === 'groups') return { groups: check(await sb.rpc('group_names')) || [] }
      // Służby: tablica, zgłoszenia, akceptacja (lider/administrator), edycja.
      if (action === 'ministries') return check(await sb.rpc('ministry_board')) || []
      if (action === 'joinMinistry') return check(await sb.rpc('ministry_join', { mid: data.id }))
      if (action === 'leaveMinistry') return check(await sb.rpc('ministry_leave', { mid: data.id }))
      if (action === 'decideMinistry') return check(await sb.rpc('ministry_decide', { mid: data.id, who: data.who, accept: !!data.accept }))
      if (action === 'saveMinistry') return check(await sb.rpc('ministry_save', { mid: data.id, new_name: data.name || '', new_description: data.description || '', new_seeking: !!data.seeking, new_leaders: data.leaders || [] }))
      if (action === 'deleteMinistry') return check(await sb.rpc('ministry_delete', { mid: data.id }))
      // Zapisy na wydarzenia.
      if (action === 'signupBoard') return check(await sb.rpc('signup_board', { eid: data.id }))
      if (action === 'signupJoin') return { status: check(await sb.rpc('signup_join', { eid: data.id, new_adults: data.adults, new_children: data.children || 0, new_note: data.note || '' })) }
      if (action === 'signupLeave') return check(await sb.rpc('signup_leave', { eid: data.id }))
      if (action === 'signupDecide') return { status: check(await sb.rpc('signup_decide', { eid: data.id, who: data.who, decision: data.decision })) }
      // ASB: grafik spotkań i lista pomysłów (ranga „ASB” albo administrator — pilnuje baza).
      if (action === 'asbLoad') {
        const [meetings, ideas] = await Promise.all([sb.from('asb_meetings').select('*').order('sort').then(check), sb.from('asb_ideas').select('*').order('created').then(check)])
        const day = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d || null) // data zawsze jako 'RRRR-MM-DD'
        return { meetings: (meetings || []).map(m => ({ ...m, date: day(m.date), reminded: m.reminded instanceof Date ? m.reminded.toISOString() : m.reminded })), ideas: ideas || [] }
      }
      if (action === 'asbSave') { const row = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_'))); return check(await sb.from('asb_meetings').upsert({ ...row, updated: new Date().toISOString(), updated_by: who() })) }
      // Przypomnienie: dzwonek dla wszystkich z rangą ASB, a kto włączył — także telefon.
      if (action === 'asbRemind') { const n = check(await sb.rpc('asb_remind', { meeting: data.id })); await pushInbox(); return n }
      if (action === 'bandPeople') return check(await sb.rpc('band_people'))
      if (action === 'asbPeople') return check(await sb.rpc('asb_people'))
      // Cele wsparcia: część dziesięciny na wybrany cel, potwierdzana co miesiąc (cele.sql).
      // Dane do przelewu dziesięciny (konto, odbiorca, BLIK) — zmienia administrator.
      if (action === 'support') return (check(await sb.from('site_settings').select('value').eq('key', 'wsparcie')) || [])[0]?.value || {}
      if (action === 'setSupport') return check(await sb.rpc('set_site_setting', { k: 'wsparcie', v: { account: data.account || '', name: data.name || '', title: data.title || '', blik: data.blik || '' } }))
      if (action === 'goals') return check(await sb.rpc('goals_overview')) || []
      if (action === 'pledgeStatus') return check(await sb.rpc('my_pledge_status')) || {}
      if (action === 'canGoals') return !!check(await sb.rpc('can_manage_goals'))
      if (action === 'pledgeSet') return check(await sb.rpc('pledge_set', { g: data.g, amt: data.amt }))
      if (action === 'confirmMonth') return check(await sb.rpc('confirm_month', { m: data.m, amounts: data.amounts || {} }))
      if (action === 'goalPeople') return check(await sb.rpc('goal_people', { g: data.g })) || []
      if (action === 'saveGoal') {
        const g = data.goal
        return check(await sb.from('goals').upsert({ id: g.id, title: g.title, description: g.description || '', target: g.target, ends: g.ends, image: g.image || '', closed: !!g.closed }))
      }
      if (action === 'removeGoal') return check(await sb.from('goals').delete().eq('id', data.id))
      // Przeczytane ogłoszenia — na koncie, więc „Nowe” znika na każdym urządzeniu.
      if (action === 'seenAnns') return (check(await sb.from('seen_announcements').select('ann_id')) || []).map(x => x.ann_id)
      if (action === 'markSeen') return check(await sb.rpc('mark_seen', { ids: data.ids || [] }))
      // Wiadomość do rang i służb: wpisy w dzwonku robi baza, telefony — /api/push { inbox: true }.
      if (action === 'broadcastOptions') return check(await sb.rpc('broadcast_options'))
      if (action === 'broadcast') {
        const count = check(await sb.rpc('broadcast_send', { title: data.title, body: data.body || '', url: data.url || '', ranks: data.ranks || [], ministries: data.ministries || [] }))
        const out = await pushInbox()
        return { count, sent: out?.sent || 0 }
      }
      if (action === 'asbDelete') return check(await sb.from('asb_meetings').delete().eq('id', data.id))
      if (action === 'asbIdea') return check(await sb.from('asb_ideas').upsert({ id: data.id, author: data.author || '', topic: data.topic }))
      if (action === 'asbIdeaDelete') return check(await sb.from('asb_ideas').delete().eq('id', data.id))
      if (action === 'addToMinistry') return check(await sb.rpc('ministry_add', { mid: data.id, who: data.who }))
      if (action === 'ministryPeople') return { people: check(await sb.rpc('ministry_people')) || [] }
      if (action === 'memberNames') return { people: check(await sb.rpc('member_names')) || [] }
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
      if (desk) { desk.login(); await new Promise(() => {}) } // logowanie robi aplikacja, potem strona się przeładuje
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: location.origin + '/',
        queryParams: choose || !who() ? { prompt: 'select_account' } : { login_hint: who() },
      } })
      if (error) throw toError(error)
      await new Promise(() => {}) // czekamy na przejście do Google
    },
    forget() { session = null; sb.auth.signOut({ scope: 'local' }).catch(() => {}) },
    signOut() { session = null; sb.auth.signOut({ scope: 'local' }).catch(() => {}); files?.signOut(); desk?.logout() },

    async load() {
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
      const [services, songs, events, tpl, news] = await Promise.all([
        all(() => sb.from('services').select('data,updated').order('id')),
        songsList(),
        all(() => sb.from('events').select('data,updated,status,created_by').or(`date.gte.${since},date.is.null`).order('id')),
        sb.from('templates').select('types,updated').eq('id', 'main').then(check),
        all(() => sb.from('announcements').select('data,audience,updated,status,created_by').order('id')),
      ])
      return {
        // „updated” z kolumny — rekordy dodane wprost w bazie mogą go nie mieć w danych (inaczej każdy zapis byłby „konfliktem”)
        services: services.map(withUpdated), songs, events: events.map(withMeta),
        templates: tpl[0]?.types || null, templatesUpdated: tpl[0]?.updated || 0,
        announcements: news.map(r => ({ ...withMeta(r), audience: r.audience })),
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
      const { status, mine, ...data } = ev
      check(await sb.from('events').upsert({ id: ev.id, type: ev.type || 'inne', date: day(ev.date), is_public: ev.public ?? null, data, ...(status ? { status } : {}), updated: ev.updated || Date.now(), updated_by: ev.updatedBy || who() }))
    },
    async removeEvent(id) { check(await sb.from('events').delete().eq('id', id)) },
    async saveTemplates(types, base = 0, force = false) {
      await guardNewer('templates', 'main', base, force, 'szablony')
      const updated = Date.now()
      check(await sb.from('templates').upsert({ id: 'main', types, updated, updated_by: who() }))
      return updated
    },
    // Biblioteka protokołów: wszystkie, które ta osoba może zobaczyć (członkowskie; rady — tylko rada).
    async loadProtocols() {
      return (await all(() => sb.from('protocols').select('data,kind,event_id,updated').order('id'))).map(r => ({ ...r.data, kind: r.kind, eventId: r.event_id || '', updated: Math.max(r.data?.updated || 0, r.updated || 0) }))
    },
    // Plik protokołu: prywatny kosz „protokoly”; link ważny godzinę.
    async uploadProtocolFile(file) {
      const ext = ((file.name.match(/\.(\w+)$/) || [])[1] || 'pdf').toLowerCase()
      const path = crypto.randomUUID() + '.' + ext
      const { error } = await sb.storage.from('protokoly').upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (error) throw new Error('Nie udało się wysłać pliku: ' + error.message)
      return path
    },
    async protocolUrl(path) {
      const { data, error } = await sb.storage.from('protokoly').createSignedUrl(path, 3600)
      if (error) throw new Error('Nie udało się otworzyć pliku protokołu: ' + error.message)
      return data.signedUrl
    },
    // Załączniki spotkań ASB (rozważanie): prywatny kosz „asb”; link ważny godzinę.
    async uploadAsbFile(file) {
      const ext = ((file.name.match(/\.(\w+)$/) || [])[1] || 'bin').toLowerCase()
      const path = crypto.randomUUID() + '.' + ext
      const { error } = await sb.storage.from('asb').upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (error) throw new Error('Nie udało się wysłać pliku: ' + error.message)
      return path
    },
    async asbFileUrl(path) {
      const { data, error } = await sb.storage.from('asb').createSignedUrl(path, 3600)
      if (error) throw new Error('Nie udało się otworzyć pliku: ' + error.message)
      return data.signedUrl
    },
    async removeAsbFile(path) { await sb.storage.from('asb').remove([path]).catch(() => {}) },
    async removeProtocolFile(path) { await sb.storage.from('protokoly').remove([path]).catch(() => {}) },
    async saveProtocol(p, base = 0, force = false) {
      await guardNewer('protocols', p.id, base, force, 'ten protokół')
      check(await sb.from('protocols').upsert({ id: p.id, kind: p.kind, event_id: p.eventId || null, date: day(p.date), status: p.status || 'szkic', data: p, updated: p.updated || Date.now(), updated_by: p.updatedBy || who() }))
    },
    async removeProtocol(id) { check(await sb.from('protocols').delete().eq('id', id)) },
    async saveAnnouncement(item, base = 0, force = false) {
      await guardNewer('announcements', item.id, base, force, 'to ogłoszenie')
      const { audience, status, mine, ...data } = item
      check(await sb.from('announcements').upsert({ id: item.id, audience: audience || 'members', important: !!item.important, until: day(item.until), data, ...(status ? { status } : {}), updated: item.updated || Date.now(), updated_by: item.updatedBy || who() }))
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
