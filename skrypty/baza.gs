// Baza danych (Supabase) dla skryptów Google: przypomnienia (przypomnienie.gs) i newsletter.
// Plik w tym samym projekcie co przypomnienie.gs. Gdy w Ustawieniach projektu → Właściwości skryptu jest
// SUPABASE_SECRET (klucz „secret” z Supabase → Project Settings → API Keys), przypomnienia czytają nabożeństwa
// i telefony z bazy zamiast z Dysku. Klucz jest tylko tutaj (na koncie kościoła) — nigdy w aplikacji ani w repozytorium.
// Cogodzinne przypomnienia zaglądają do bazy, więc darmowy projekt Supabase nie usypia.
// Co godzinę skrypt udostępnia też folder „Aplikacja KNS Nabo” (załączniki) osobom z prawem edycji według rang z bazy.
//
// Instalacja (raz): „+” → Skrypt → nazwa „baza” → wklej ten plik; Ustawienia projektu → Właściwości skryptu →
// Dodaj: SUPABASE_SECRET = klucz secret; potem uruchom „ustawNewsletterBazy” (newsletter co czwartek o 18:00
// i co 15 minut próbne e-maile, o które ktoś poprosił w aplikacji: Mój profil → „Wyślij próbny e-mail”).
// Powiadomienia z aplikacji idą tylko w aplikacji (dzwonek) i jako powiadomienia na telefon — nie e-mailem.

const BAZA = { url: 'https://igkjlgdpvgdeqfqctnnf.supabase.co', folderId: '1pI2FlyMq8XUQHbJlELd1OuxsCIz-RRnG', folder: 'Aplikacja KNS Nabo' }

function bazaKlucz() { return PropertiesService.getScriptProperties().getProperty('SUPABASE_SECRET') || '' }
function bazaWlaczona() { return !!bazaKlucz() }
// Zapytanie do bazy (REST). Klucz secret omija reguły dostępu — dlatego jest tylko w skrypcie.
function baza(path, method, body) {
  const key = bazaKlucz()
  const headers = { apikey: key }
  if (!/^sb_/.test(key)) headers.Authorization = 'Bearer ' + key // starszy klucz service_role
  const res = UrlFetchApp.fetch(BAZA.url + '/rest/v1/' + path, {
    method: method || 'get', headers, muteHttpExceptions: true,
    contentType: 'application/json', payload: body ? JSON.stringify(body) : undefined,
  })
  if (res.getResponseCode() >= 300) throw new Error('Baza danych: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200))
  const text = res.getContentText()
  return text ? JSON.parse(text) : null
}

// Przypomnienia: nabożeństwo na dany dzień i telefony z włączonymi powiadomieniami.
function bazaNabozenstwo(date) {
  const rows = baza('services?select=data&date=eq.' + date + '&limit=1')
  return rows.length ? rows[0].data : null
}
function bazaTelefony() {
  return baza('push_devices?select=id,data').map(r => {
    const when = (r.data && r.data.schedule) || {}
    return { id: r.id, subscription: r.data && r.data.subscription, day: when.day ?? 5, hour: when.hour ?? 19, remove: () => baza('push_devices?id=eq.' + encodeURIComponent(r.id), 'delete') }
  })
}

/* ---------- folder z załącznikami: dostęp według rang ---------- */
// Edytor folderu „Aplikacja KNS Nabo” = zatwierdzone osoby z rangą z prawem edycji (organizator, technika, lider,
// rada, pastor, administrator). Kto rangę straci albo zostanie odrzucony — traci edycję. Osób spoza bazy
// (np. udostępnionych ręcznie) skrypt nie rusza. Działa tylko, gdy coś się zmieniło od ostatniego razu.
function bazaUdostepnij() {
  const people = baza('people?select=email,status,roles')
  const edit = baza('ranks?select=id&can_edit=is.true').map(r => r.id)
  const lower = e => String(e || '').toLowerCase()
  const want = people.filter(p => p.status === 'active' && (p.roles || []).some(r => edit.indexOf(r) >= 0)).map(p => lower(p.email)).sort()
  const others = people.map(p => lower(p.email)).filter(e => want.indexOf(e) < 0).sort()
  const sig = want.join(',') + '|' + others.join(',')
  const props = PropertiesService.getScriptProperties()
  if (props.getProperty('UDOSTEPNIENIE') === sig) return
  let dir = null
  try { dir = DriveApp.getFolderById(BAZA.folderId) } catch (e) {
    const found = DriveApp.getFoldersByName(BAZA.folder)
    if (found.hasNext()) dir = found.next()
  }
  if (!dir) return
  const owner = dir.getOwner() ? lower(dir.getOwner().getEmail()) : ''
  const editors = dir.getEditors().map(u => lower(u.getEmail()))
  for (const e of want) if (e && e !== owner && editors.indexOf(e) < 0) dir.addEditor(e)
  for (const e of others) if (e !== owner && editors.indexOf(e) >= 0) { try { dir.removeEditor(e) } catch (x) { /* dostęp odziedziczony */ } }
  props.setProperty('UDOSTEPNIENIE', sig)
  Logger.log('Folder: edytorzy ' + want.length)
}

/* ---------- newsletter z bazy ---------- */
function ustawNewsletterBazy() {
  ScriptApp.getProjectTriggers().filter(t => ['newsletter', 'newsletterBazy', 'probneMaile'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('newsletterBazy').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(18).inTimezone('Europe/Warsaw').create()
  ScriptApp.newTrigger('probneMaile').timeBased().everyMinutes(15).create()
}
// Próbne newslettery z kolejki (mail_requests): ten sam e-mail co w czwartek, tylko do osoby, która poprosiła.
function probneMaile() {
  if (!bazaWlaczona()) return
  const queue = baza('mail_requests?select=id,person&sent=is.null&kind=eq.newsletter_test&order=id&limit=20')
  if (!queue.length) return
  const ids = queue.map(r => r.person).join(',')
  const people = baza('people?select=id,email&status=eq.active&id=in.(' + ids + ')')
  const html = trescNewslettera() || '<p>W najbliższych dwóch tygodniach nie ma jeszcze wydarzeń ani ogłoszeń.</p>'
  for (const r of queue) {
    const p = people.filter(x => x.id === r.person)[0]
    if (p) MailApp.sendEmail({ to: p.email, subject: '[Próba] Kościół Na Skale — najbliższe dwa tygodnie', htmlBody: html, name: 'Kościół Na Skale' })
    baza('mail_requests?id=eq.' + r.id, 'patch', { sent: new Date().toISOString() })
  }
}
function newsletterBazy() {
  const people = baza('people?select=email&status=eq.active&newsletter=is.true')
  if (!people.length) return
  const html = trescNewslettera()
  if (!html) return
  for (const p of people) MailApp.sendEmail({ to: p.email, subject: 'Kościół Na Skale — najbliższe dwa tygodnie', htmlBody: html, name: 'Kościół Na Skale' })
  Logger.log('Newsletter wysłany: ' + people.length)
}
// Treść newslettera: nabożeństwa i wydarzenia na dwa tygodnie, aktualne ogłoszenia.
function trescNewslettera() {
  const tz = 'Europe/Warsaw'
  const from = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')
  const until = Utilities.formatDate(new Date(Date.now() + 14 * 86400000), tz, 'yyyy-MM-dd')
  const range = '&date=gte.' + from + '&date=lte.' + until
  const services = baza('services?select=data' + range).map(r => r.data)
  const events = baza('events?select=data,type&ministries=eq.%7B%7D' + range + '&type=neq.rada&status=eq.published').map(r => r.data)
  const anns = baza('announcements?select=data,important,until&audience=neq.council&status=eq.published&ministries=eq.%7B%7D').filter(r => !r.until || r.until >= from)
    .map(r => Object.assign({}, r.data, { important: r.important })).sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0))
  const tpl = baza('templates?select=types&id=eq.main')
  const types = (tpl[0] && tpl[0].types) || []
  return htmlNewslettera(services, events, anns, types, tz)
}
function htmlNewslettera(services, events, anns, types, tz) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const day = date => Utilities.formatDate(new Date(date + 'T12:00:00'), tz, 'dd.MM')
  const typeName = id => (types.find(t => t.id === id) || { name: '' }).name
  const items = services.map(s => ({ date: s.date, time: s.time || '', title: 'Nabożeństwo' + (s.sermonTitle ? ': ' + s.sermonTitle : ''), sub: [s.passage, s.speaker, s.place].filter(Boolean).join(' · ') }))
    .concat(events.map(e => ({ date: e.date, time: e.time || '', title: e.title || typeName(e.type), sub: [e.place, e.description].filter(Boolean).join(' · ') })))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  if (!items.length && !anns.length) return ''
  const block = (title, body) => '<h2 style="font:600 16px Arial;margin:22px 0 8px;color:#222">' + title + '</h2>' + body
  let html = '<div style="font:14px/1.5 Arial;color:#333;max-width:560px"><h1 style="font:700 20px Arial;margin:0 0 4px">Kościół Na Skale</h1><p style="margin:0;color:#777">Najbliższe dwa tygodnie</p>'
  if (anns.length) html += block('Ogłoszenia', anns.map(a => (/^https:\/\//.test(a.image || '') ? '<img src="' + esc(a.image) + '" alt="" style="display:block;width:100%;max-width:560px;border-radius:8px;margin:0 0 6px">' : '') + '<p style="margin:0 0 10px">' + (a.important ? '<b style="color:#c0392b">Komunikat rady zboru: </b>' : '') + '<b>' + esc(a.title) + '</b><br>' + esc(a.text).replace(/\n/g, '<br>') + (/^https?:\/\//.test(a.link || '') ? '<br><a href="' + esc(a.link) + '" style="color:#c77d14">' + esc(a.linkText || a.link) + '</a>' : '') + '</p>').join(''))
  if (items.length) html += block('Kalendarz', '<table style="border-collapse:collapse;width:100%">' + items.map(it => '<tr><td style="padding:6px 10px 6px 0;vertical-align:top;white-space:nowrap;color:#555">' + day(it.date) + (it.time ? ' ' + esc(it.time) : '') + '</td><td style="padding:6px 0"><b>' + esc(it.title) + '</b>' + (it.sub ? '<br><span style="color:#777">' + esc(it.sub) + '</span>' : '') + '</td></tr>').join('') + '</table>')
  return html + '<p style="margin-top:26px;color:#999;font-size:12px">Wysłane z aplikacji Kościoła Na Skale. Wypisać się można w aplikacji: Start → Newsletter.</p></div>'
}

/* ---------- zdjęcia z nabożeństw: Dysk → karta najbliższego nabożeństwa na stronie startowej ---------- */
// Folder ze zdjęciami (lata → MM_RR → DD_MM, np. 2026 / 10_26 / 18_10). Skrypt bierze najnowszy folder, w którym są
// zdjęcia, wgrywa do bazy (prywatny kubełek „zdjecia”, widzą tylko zatwierdzeni członkowie) do 8 pomniejszonych
// zdjęć wybranych równo z całego folderu, zapisuje ich listę i usuwa poprzednie. Raz dziennie (rano): nowe nabożeństwo albo
// nowe zdjęcia — od początku folderu; bez zmian — kolejna ósemka z tego samego folderu (po obejściu całego — od nowa).
// Instalacja (raz, także po zmianie tego pliku): uruchom „ustawZdjecia” (codziennie ok. 6:00; pierwsze pobranie od razu). Konto skryptu musi widzieć folder.
const ZDJECIA = { folderId: '1JDHuBFv_l6QZpKc5oPcO_vBY1V60vbKs', max: 8, size: 1600 }

function ustawZdjecia() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'zdjeciaNabozenstw').forEach(t => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('zdjeciaNabozenstw').timeBased().everyDays(1).atHour(6).inTimezone('Europe/Warsaw').create()
  zdjeciaNabozenstw()
}
// Najnowszy folder ze zdjęciami. Nazwy z datą: „2026”, „10_26” (miesiąc_rok), „18_10” (dzień_miesiąc) —
// w obu dwuczłonowych druga liczba jest „starsza”, więc klucz sortowania = druga * 100 + pierwsza.
function najnowszyFolderZdjec(folder, path) {
  const kids = []
  const it = folder.getFolders()
  while (it.hasNext()) {
    const f = it.next(), n = f.getName().trim()
    let key = null
    if (/^\d{4}$/.test(n)) key = +n * 10000
    else { const m = /^(\d{1,2})[_.\-](\d{1,2})$/.exec(n); if (m) key = +m[2] * 100 + +m[1] }
    if (key != null) kids.push({ f, key, n })
  }
  kids.sort((a, b) => b.key - a.key)
  for (const k of kids) { const r = najnowszyFolderZdjec(k.f, path.concat(k.n)); if (r) return r }
  const imgs = []
  const fi = folder.getFiles()
  while (fi.hasNext()) { const x = fi.next(); if (/^image\//.test(x.getMimeType())) imgs.push(x) }
  return imgs.length ? { folder, imgs, path } : null
}
// Data z nazw folderów (rok i DD_MM), np. ['2026', '10_26', '18_10'] → 2026-10-18; bez folderu roku — rok z MM_RR
function dataZdjec(path) {
  const mr = path.length > 1 ? /^(\d{1,2})[_.\-](\d{2})$/.exec(path[path.length - 2]) : null
  const year = path.filter(n => /^\d{4}$/.test(n))[0] || (mr ? '20' + mr[2] : '')
  const day = /^(\d{1,2})[_.\-](\d{1,2})$/.exec(path[path.length - 1] || '')
  return year && day ? year + '-' + ('0' + day[2]).slice(-2) + '-' + ('0' + day[1]).slice(-2) : ''
}
function bazaNaglowki(extra) {
  const key = bazaKlucz(), h = { apikey: key }
  if (!/^sb_/.test(key)) h.Authorization = 'Bearer ' + key
  for (const k in extra || {}) h[k] = extra[k]
  return h
}
function zdjeciaNabozenstw() {
  if (!bazaWlaczona()) return
  const found = najnowszyFolderZdjec(DriveApp.getFolderById(ZDJECIA.folderId), [])
  if (!found) return
  const props = PropertiesService.getScriptProperties()
  const id = found.folder.getId()
  const all = found.imgs.sort((a, b) => a.getName().localeCompare(b.getName()))
  const stamp = id + ':' + all.length
  // ten sam folder i tyle samo zdjęć — kolejna ósemka (gdy jest z czego wybierać); inaczej — od początku
  let round = 0
  if (props.getProperty('ZDJECIA_STAN') === stamp) {
    if (all.length <= ZDJECIA.max) return
    round = +(props.getProperty('ZDJECIA_RUNDA') || 0) + 1
  }
  // równo z całego folderu (np. 8 ze 120 — co 15.), w kolejnych dniach przesunięte o jedno zdjęcie dalej
  const step = all.length / ZDJECIA.max
  round = round % Math.max(1, Math.ceil(step))
  const pick = all.length <= ZDJECIA.max ? all : Array.from({ length: ZDJECIA.max }, (_, i) => all[(Math.floor(i * step) + round) % all.length])
  const token = ScriptApp.getOAuthToken(), auth = { Authorization: 'Bearer ' + token }
  const files = []
  pick.forEach((f, i) => {
    try {
      const meta = JSON.parse(UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + f.getId() + '?fields=thumbnailLink&supportsAllDrives=true', { headers: auth }).getContentText())
      if (!meta.thumbnailLink) return
      const img = UrlFetchApp.fetch(meta.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, '') + '=s' + ZDJECIA.size, { headers: auth }).getBlob()
      const path = id + '/' + all.length + '-' + round + '-' + i + '.jpg' // nowa nazwa przy każdej zmianie — bez starych kopii w pamięci podręcznej
      const res = UrlFetchApp.fetch(BAZA.url + '/storage/v1/object/zdjecia/' + path, {
        method: 'post', headers: bazaNaglowki({ 'x-upsert': 'true' }), contentType: img.getContentType() || 'image/jpeg', payload: img.getBytes(), muteHttpExceptions: true,
      })
      if (res.getResponseCode() < 300) files.push(path)
      else Logger.log('Zdjęcie ' + f.getName() + ': ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200))
    } catch (e) { Logger.log('Zdjęcie ' + f.getName() + ': ' + e.message) }
  })
  if (!files.length) return
  // lista dla strony; poprzednie zdjęcia usuwane z bazy
  const value = { files, date: dataZdjec(found.path), folder: found.path.join(' / '), count: all.length, updated: new Date().toISOString() }
  const res = UrlFetchApp.fetch(BAZA.url + '/rest/v1/site_settings?on_conflict=key', {
    method: 'post', headers: bazaNaglowki({ Prefer: 'resolution=merge-duplicates' }), contentType: 'application/json',
    payload: JSON.stringify({ key: 'zdjecia', value }), muteHttpExceptions: true,
  })
  if (res.getResponseCode() >= 300) throw new Error('Zdjęcia — zapis listy: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200))
  const old = JSON.parse(props.getProperty('ZDJECIA_PLIKI') || '[]').filter(p => files.indexOf(p) < 0)
  if (old.length) UrlFetchApp.fetch(BAZA.url + '/storage/v1/object/zdjecia', { method: 'delete', headers: bazaNaglowki(), contentType: 'application/json', payload: JSON.stringify({ prefixes: old }), muteHttpExceptions: true })
  props.setProperty('ZDJECIA_STAN', stamp)
  props.setProperty('ZDJECIA_RUNDA', String(round))
  props.setProperty('ZDJECIA_PLIKI', JSON.stringify(files))
  Logger.log('Zdjęcia: ' + files.length + ' z ' + value.folder + (round ? ' (zestaw ' + (round + 1) + ')' : ''))
}
