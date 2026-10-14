// Przypomnienie o niekompletnym nabożeństwie — Google Apps Script (script.google.com) na koncie,
// które ma dostęp do folderu „Aplikacja KNS Nabo”. Co piątek ok. 19:00 sprawdza najbliższą niedzielę
// i gdy czegoś brakuje, wysyła mail oraz powiadomienie na telefony, które je włączyły w aplikacji.
//
// Instalacja (raz):
//   1. script.google.com → Nowy projekt → wklej cały ten plik (zastąp zawartość Code.gs).
//   2. Uzupełnij poniżej adresy w „recipients” i hasło „pushSecret” (to samo co PUSH_SECRET w Netlify).
//   3. Ustawienia projektu (ikona zębatki) → Strefa czasowa: (GMT+01:00) Warszawa.
//   4. Wybierz funkcję „setup” na górze i kliknij „Uruchom” → zezwól na dostęp (Dysk, Gmail, połączenia).
//   5. Dla próby uruchom „sprawdzTeraz” — przyjdzie mail i powiadomienie, nawet gdy wszystko jest gotowe.

const CONFIG = {
  folderName: 'Aplikacja KNS Nabo', // folder aplikacji (ten sam co w aplikacji)
  servicesFolder: 'nabozenstwa',
  recipients: ['wpisz.adres@gmail.com'], // kto dostaje maila — można kilka adresów
  pushUrl: 'https://kns-nabo.netlify.app/api/push', // funkcja wysyłająca powiadomienia na telefony
  pushSecret: 'WPISZ-HASLO-PUSH_SECRET', // z: node skrypty/klucze-powiadomien.cjs
  appUrl: 'https://kns-nabo.netlify.app',
  day: ScriptApp.WeekDay.FRIDAY,
  hour: 19,
}

// Wymagane informacje — te same co w aplikacji.
const REQUIRED = [['sermonTitle', 'tytuł kazania'], ['passage', 'fragment'], ['speaker', 'mówca']]

function setup() {
  for (const t of ScriptApp.getProjectTriggers()) if (t.getHandlerFunction() === 'sprawdzNiedziele') ScriptApp.deleteTrigger(t)
  ScriptApp.newTrigger('sprawdzNiedziele').timeBased().onWeekDay(CONFIG.day).atHour(CONFIG.hour).create()
  Logger.log('Gotowe — przypomnienie będzie sprawdzane co tydzień.')
}

// Test: wysyła wiadomość zawsze, także gdy wszystko jest gotowe.
function sprawdzTeraz() { sprawdzNiedziele(true) }

function sprawdzNiedziele(always) {
  const tz = Session.getScriptTimeZone() || 'Europe/Warsaw'
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
  const sunday = Utilities.formatDate(d, tz, 'yyyy-MM-dd')
  const pretty = Utilities.formatDate(d, tz, 'd.MM.yyyy')

  const service = findService(sunday)
  const missing = !service ? ['całe nabożeństwo (nie zostało utworzone)']
    : REQUIRED.filter(([key]) => !String(service[key] || '').trim()).map(([, name]) => name)
        .concat(service.songs && service.songs.length ? [] : ['pieśni'])
  if (!missing.length && always !== true) return

  const title = missing.length ? `Nabożeństwo ${pretty} — brakuje: ${missing.join(', ')}` : `Nabożeństwo ${pretty} jest gotowe`
  const lines = service ? [
    `Tytuł kazania: ${service.sermonTitle || '—'}`, `Fragment: ${service.passage || '—'}`, `Mówca: ${service.speaker || '—'}`,
    `Pieśni: ${(service.songs || []).length}`, `Godzina i miejsce: ${service.time || '12:12'}, ${service.place || 'Hotel Forza'}`,
  ] : []

  MailApp.sendEmail({
    to: CONFIG.recipients.join(','),
    subject: title,
    htmlBody: `<p><b>${title}</b></p>${lines.length ? '<p>' + lines.join('<br>') + '</p>' : ''}<p><a href="${CONFIG.appUrl}">Uzupełnij w aplikacji</a></p>`,
  })
  sendPush(`Nabożeństwo ${pretty}`, missing.length ? 'Brakuje: ' + missing.join(', ') + '. Dotknij, aby uzupełnić.' : 'Wszystko gotowe.')
}

// Powiadomienia na telefony: adresy zapisane przez aplikację w folderze „powiadomienia”.
// Telefony, które się wypisały (albo usunęły aplikację), są stamtąd usuwane.
function sendPush(title, body) {
  const roots = DriveApp.getFoldersByName(CONFIG.folderName)
  if (!roots.hasNext()) return
  const dirs = roots.next().getFoldersByName('powiadomienia')
  if (!dirs.hasNext()) return
  const files = {}, subscriptions = []
  const it = dirs.next().getFiles()
  while (it.hasNext()) {
    const f = it.next()
    try { const data = JSON.parse(f.getBlob().getDataAsString()); files[f.getId()] = f; subscriptions.push({ id: f.getId(), subscription: data.subscription }) } catch (e) { /* uszkodzony plik */ }
  }
  if (!subscriptions.length) return
  const res = UrlFetchApp.fetch(CONFIG.pushUrl, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ secret: CONFIG.pushSecret, title: title, body: body, url: CONFIG.appUrl, subscriptions: subscriptions }),
  })
  const out = JSON.parse(res.getContentText() || '{}')
  if (res.getResponseCode() !== 200) throw new Error('Powiadomienia: ' + (out.error || res.getResponseCode()))
  for (const id of out.gone || []) files[id] && files[id].setTrashed(true)
  Logger.log('Powiadomienia wysłane: ' + out.sent)
}

// Nabożeństwo na dany dzień: podfolder „<data> <tytuł> (<id>)” z plikiem nabozenstwo.json.
function findService(date) {
  const roots = DriveApp.getFoldersByName(CONFIG.folderName)
  if (!roots.hasNext()) throw new Error('Nie widzę folderu „' + CONFIG.folderName + '” na tym koncie.')
  const sub = roots.next().getFoldersByName(CONFIG.servicesFolder)
  if (!sub.hasNext()) return null
  const folders = sub.next().getFolders()
  while (folders.hasNext()) {
    const f = folders.next()
    if (!f.getName().startsWith(date)) continue
    const files = f.getFilesByName('nabozenstwo.json')
    if (files.hasNext()) return JSON.parse(files.next().getBlob().getDataAsString()).service
  }
  return null
}
