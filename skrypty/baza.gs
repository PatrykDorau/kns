// Baza danych (Supabase) dla skryptów Google: przypomnienia (przypomnienie.gs) i newsletter.
// Plik w tym samym projekcie co przypomnienie.gs. Gdy w Ustawieniach projektu → Właściwości skryptu jest
// SUPABASE_SECRET (klucz „secret” z Supabase → Project Settings → API Keys), przypomnienia czytają nabożeństwa
// i telefony z bazy zamiast z Dysku. Klucz jest tylko tutaj (na koncie kościoła) — nigdy w aplikacji ani w repozytorium.
// Cogodzinne przypomnienia zaglądają do bazy, więc darmowy projekt Supabase nie usypia.
// Co godzinę skrypt udostępnia też folder „Aplikacja KNS Nabo” (załączniki) osobom z prawem edycji według rang z bazy.
//
// Instalacja (raz): „+” → Skrypt → nazwa „baza” → wklej ten plik; Ustawienia projektu → Właściwości skryptu →
// Dodaj: SUPABASE_SECRET = klucz secret; potem uruchom „ustawNewsletterBazy” (newsletter co czwartek o 18:00).

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
  ScriptApp.getProjectTriggers().filter(t => ['newsletter', 'newsletterBazy'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('newsletterBazy').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(18).inTimezone('Europe/Warsaw').create()
}
function newsletterBazy() {
  const people = baza('people?select=email&status=eq.active&newsletter=is.true')
  if (!people.length) return
  const tz = 'Europe/Warsaw'
  const from = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')
  const until = Utilities.formatDate(new Date(Date.now() + 14 * 86400000), tz, 'yyyy-MM-dd')
  const range = '&date=gte.' + from + '&date=lte.' + until
  const services = baza('services?select=data' + range).map(r => r.data)
  const events = baza('events?select=data,type' + range + '&type=neq.rada').map(r => r.data)
  const anns = baza('announcements?select=data,important,until&audience=neq.council').filter(r => !r.until || r.until >= from)
    .map(r => Object.assign({}, r.data, { important: r.important })).sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0))
  const tpl = baza('templates?select=types&id=eq.main')
  const types = (tpl[0] && tpl[0].types) || []
  const html = htmlNewslettera(services, events, anns, types, tz)
  if (!html) return
  for (const p of people) MailApp.sendEmail({ to: p.email, subject: 'Kościół Na Skale — najbliższe dwa tygodnie', htmlBody: html, name: 'Kościół Na Skale' })
  Logger.log('Newsletter wysłany: ' + people.length)
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
  if (anns.length) html += block('Ogłoszenia', anns.map(a => (/^https:\/\//.test(a.image || '') ? '<img src="' + esc(a.image) + '" alt="" style="display:block;width:100%;max-width:560px;border-radius:8px;margin:0 0 6px">' : '') + '<p style="margin:0 0 10px">' + (a.important ? '<b style="color:#c0392b">Komunikat rady zboru: </b>' : '') + '<b>' + esc(a.title) + '</b><br>' + esc(a.text).replace(/\n/g, '<br>') + '</p>').join(''))
  if (items.length) html += block('Kalendarz', '<table style="border-collapse:collapse;width:100%">' + items.map(it => '<tr><td style="padding:6px 10px 6px 0;vertical-align:top;white-space:nowrap;color:#555">' + day(it.date) + (it.time ? ' ' + esc(it.time) : '') + '</td><td style="padding:6px 0"><b>' + esc(it.title) + '</b>' + (it.sub ? '<br><span style="color:#777">' + esc(it.sub) + '</span>' : '') + '</td></tr>').join('') + '</table>')
  return html + '<p style="margin-top:26px;color:#999;font-size:12px">Wysłane z aplikacji KNS Nabo. Wypisać się można w aplikacji: Start → Newsletter.</p></div>'
}
