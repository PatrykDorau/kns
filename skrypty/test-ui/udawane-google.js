// Udawane Google (logowanie GIS, Dysk, userinfo) i serwer kont — do testu prawdziwego trybu aplikacji na telefon.
// Stan w localStorage ('mock-drive', 'mock-people'); bieżący użytkownik: localStorage 'mock-user'.
(function () {
  const FOLDER = 'application/vnd.google-apps.folder'
  const ADMIN = 'admin@kns.pl'
  const RANKS = [
    { id: 'czlonek', name: 'Członek' }, { id: 'lider', name: 'Lider', edit: true }, { id: 'organizator', name: 'Organizator nabożeństw', edit: true },
    { id: 'technika', name: 'Technika (rzutnik, stream)', edit: true }, { id: 'protokolant', name: 'Protokolant', protocols: true },
    { id: 'rada', name: 'Członek rady zboru', edit: true, council: true }, { id: 'pastor', name: 'Pastor', edit: true, council: true },
    { id: 'admin', name: 'Administrator', edit: true, council: true, protocols: true, manage: true },
  ]
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v))
  let drive = load('mock-drive', null)
  if (!drive) {
    drive = { next: 10, files: {} }
    const add = (id, name, mimeType, parent, content) => { drive.files[id] = { id, name, mimeType, parents: parent ? [parent] : [], trashed: false, content } }
    add('root', 'Aplikacja KNS Nabo', FOLDER, null)
    add('svc', 'nabozenstwa', FOLDER, 'root')
    add('protos', 'KNS Nabo — Protokoły', FOLDER, null)
    add('council', 'KNS Nabo — Rada', FOLDER, null)
    const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
    const date = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    add('s1', date + ' Światłość (s1)', FOLDER, 'svc')
    add('s1j', 'nabozenstwo.json', 'application/json', 's1', JSON.stringify({ service: { id: 's1', date, time: '10:00', sermonTitle: 'Światłość', passage: 'J 8,12', speaker: 'Jan', songs: [], files: [], updated: 5 } }))
    save('mock-drive', drive)
  }
  const persist = () => save('mock-drive', drive)
  const user = () => localStorage.getItem('mock-user') || 'nowy@kns.pl'
  const people = () => load('mock-people', [])
  const person = email => people().find(p => p.email === email)
  const flag = (p, f) => !!p && p.status === 'active' && p.roles.some(r => RANKS.some(x => x.id === r && x[f]))
  // Dostęp do folderów jak w serwer.gs (dziedziczony po folderach najwyższego poziomu).
  function topOf(f) { while (f && f.parents.length) f = drive.files[f.parents[0]]; return f }
  function canSee(f) {
    const p = person(user())
    if (!p || p.status !== 'active') return false
    const top = topOf(f)
    if (top.id === 'council') return flag(p, 'council')
    return true
  }
  function canWrite(f) {
    const p = person(user())
    const top = topOf(f)
    if (top.id === 'council') return flag(p, 'council')
    if (top.id === 'protos') return flag(p, 'protocols') || flag(p, 'council')
    if (f.name === 'powiadomienia' || drive.files[f.parents[0]]?.name === 'powiadomienia') return canSee(f)
    return flag(p, 'edit')
  }
  function matches(f, q) {
    return q.split(' and ').every(part => {
      part = part.trim()
      let m
      if ((m = /^'(.+)' in parents$/.exec(part))) return f.parents.includes(m[1])
      if ((m = /^name='(.+)'$/.exec(part))) return f.name === m[1].replace(/\\'/g, "'")
      if ((m = /^name contains '(.+)'$/.exec(part))) return f.name.includes(m[1])
      if ((m = /^mimeType='(.+)'$/.exec(part))) return f.mimeType === m[1]
      if (part === 'trashed=false') return !f.trashed
      if (/mimeType contains/.test(part)) return false
      throw new Error('mock: zapytanie ' + part)
    })
  }
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  const realFetch = window.fetch.bind(window)
  const tokenUser = opt => { const t = ((opt && opt.headers && (opt.headers.Authorization || opt.headers.authorization)) || '').replace('Bearer ', ''); return t.startsWith('tok-') ? t.slice(4).split('|')[0] : '' }

  /* ---------- serwer kont (jak serwer.gs) ---------- */
  function server(req) {
    const tok = String(req.token || '')
    const email = tok.startsWith('tok-') ? tok.slice(4).split('|')[0] : ''
    const list = people()
    const view = p => ({ email: p.email, name: p.name, status: p.status, roles: p.roles, requested: p.requested, newsletter: !!p.newsletter })
    if (req.action === 'public') return { services: [], events: [], announcements: [{ id: 'p', title: 'Ogłoszenie publiczne', text: 'Dla gości', important: false }], types: [] }
    if (!email) return { error: 'Logowanie wygasło — zaloguj się ponownie.' }
    if (req.action === 'me') {
      let p = list.find(x => x.email === email)
      if (!p) { p = { email, name: email.split('@')[0], status: email === ADMIN ? 'active' : 'pending', roles: email === ADMIN ? ['czlonek', 'admin'] : [], requested: Date.now() }; list.push(p); save('mock-people', list) }
      return { person: view(p), ranks: RANKS }
    }
    const me = list.find(x => x.email === email)
    if (req.action === 'people') return flag(me, 'manage') ? { people: list.map(view), ranks: RANKS } : { error: 'Tylko administrator może zarządzać osobami.' }
    if (req.action === 'setPerson') {
      if (!flag(me, 'manage')) return { error: 'Tylko administrator może zarządzać osobami.' }
      const p = list.find(x => x.email === req.email)
      if (req.status) p.status = req.status
      if (Array.isArray(req.roles)) p.roles = req.roles
      if (p.status === 'active' && !p.roles.length) p.roles = ['czlonek']
      save('mock-people', list)
      return { person: view(p) }
    }
    if (req.action === 'setNewsletter') { me.newsletter = !!req.on; save('mock-people', list); return { person: view(me) } }
    return { error: 'Nieznane polecenie.' }
  }

  window.fetch = async (url, opt = {}) => {
    url = String(url)
    window.__calls = (window.__calls || []).concat(((opt.method || 'GET') + ' ' + url).slice(0, 160))
    if (url.startsWith('https://mock.api/')) return json(server(JSON.parse(opt.body)))
    if (url.includes('oauth2/v3/userinfo')) { const e = tokenUser(opt); return e ? json({ email: e, name: e.split('@')[0] }) : json({}, 401) }
    if (!/googleapis\.com/.test(url)) return realFetch(url, opt)
    if (!tokenUser(opt)) return json({}, 401)
    const scope = ((opt.headers.Authorization || '').split('|')[1] || '')
    if (!scope.includes('drive')) return json({ error: 'insufficient scope' }, 403)
    const u = new URL(url)
    const method = opt.method || 'GET'
    let m
    if (u.pathname === '/drive/v3/about') return json({ user: { emailAddress: tokenUser(opt) } })
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q')
      return json({ files: Object.values(drive.files).filter(f => canSee(f) && matches(f, q)).map(({ id, name, mimeType }) => ({ id, name, mimeType })) })
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) {
      const f = drive.files[m[1]]
      if (!f || !canSee(f)) return json({}, 404)
      if (method === 'GET') return u.searchParams.get('alt') === 'media' ? json(JSON.parse(f.content)) : json({ id: f.id })
      if (method === 'PATCH') { if (!canWrite(f)) return json({}, 403); Object.assign(f, JSON.parse(opt.body)); persist(); return json({ id: f.id }) }
    }
    const create = (meta, content) => {
      const parent = drive.files[meta.parents[0]]
      if (!parent || !canWrite(parent)) return json({}, 403)
      const id = 'm' + drive.next++
      drive.files[id] = { id, name: meta.name, mimeType: meta.mimeType || 'application/json', parents: meta.parents, trashed: false, content }
      persist()
      return json({ id })
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') return create(JSON.parse(opt.body))
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') return create(JSON.parse(await opt.body.get('metadata').text()), await opt.body.get('file').text())
    if ((m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)) && method === 'PATCH') {
      const f = drive.files[m[1]]
      if (!canWrite(f)) return json({}, 403)
      f.content = opt.body; persist(); return json({ id: f.id })
    }
    return json({ error: 'mock: ' + method + ' ' + url }, 500)
  }

  /* ---------- logowanie Google (GIS) ---------- */
  // Token „tok-<email>|<zakresy>” — dzięki temu udawany Dysk wie, kto pyta i czy ma zakres Dysku.
  window.google = { accounts: { oauth2: {
    initTokenClient: cfg => ({ callback: cfg.callback, requestAccessToken(opts) {
      window.__scopes = (window.__scopes || []).concat(opts.scope)
      setTimeout(() => this.callback({ access_token: 'tok-' + user() + '|' + opts.scope, expires_in: 3600, scope: opts.scope }), 20)
    } }),
    revoke: (t, cb) => cb && cb(),
  } } }
})()
