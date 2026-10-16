// Przypomnienia o niekompletnym nabożeństwie — Google Apps Script (script.google.com) na koncie,
// które ma dostęp do folderu „Aplikacja KNS Nabo”. Skrypt uruchamia się co godzinę:
//   • telefony: każdy sam wybiera w aplikacji dzień i godzinę przypomnienia (domyślnie piątek 19:00);
//   • mail: w dniu i godzinie z CONFIG.mailDay / CONFIG.mailHour.
// Powiadomienie i mail idą tylko wtedy, gdy w najbliższą niedzielę czegoś brakuje.
//
// Instalacja (raz):
//   1. script.google.com → Nowy projekt → wklej cały ten plik (zastąp zawartość Code.gs).
//   2. Uzupełnij poniżej adresy w „recipients” i hasło „pushSecret” (to samo co PUSH_SECRET w Netlify).
//   3. Ustawienia projektu (ikona zębatki) → Strefa czasowa: (GMT+01:00) Warszawa.
//   4. Wybierz funkcję „setup” na górze i kliknij „Uruchom” → zezwól na dostęp (Dysk, Gmail, połączenia).
//   (baza danych) Gdy w projekcie jest też baza.gs z kluczem SUPABASE_SECRET — nabożeństwa i telefony są czytane z bazy.
//   5. Dla próby uruchom „sprawdzTeraz” — przyjdzie mail i powiadomienie na wszystkie telefony, nawet gdy wszystko jest gotowe.

const CONFIG = {
  folderName: 'Aplikacja KNS Nabo', // folder aplikacji (ten sam co w aplikacji)
  servicesFolder: 'nabozenstwa',
  pushFolder: 'powiadomienia', // tu aplikacja zapisuje telefony z włączonymi powiadomieniami
  recipients: ['wpisz.adres@gmail.com'], // kto dostaje maila — można kilka adresów
  mailDay: 5, // dzień maila: 0 niedziela, 1 poniedziałek … 5 piątek, 6 sobota
  mailHour: 19,
  pushUrl: 'https://kns-nabo.netlify.app/api/push', // funkcja wysyłająca powiadomienia na telefony
  pushSecret: 'WPISZ-HASLO-PUSH_SECRET', // z: node skrypty/klucze-powiadomien.cjs
  appUrl: 'https://kns-nabo.netlify.app',
}

// Wymagane informacje — te same co w aplikacji.
const REQUIRED = [['sermonTitle', 'tytuł kazania'], ['passage', 'fragment'], ['speaker', 'mówca']]

function setup() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (['sprawdzNiedziele', 'coGodzine'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t)
  }
  ScriptApp.newTrigger('coGodzine').timeBased().everyHours(1).create()
  Logger.log('Gotowe — skrypt sprawdza co godzinę, komu wysłać przypomnienie.')
}

// Co godzinę: telefony z przypomnieniem ustawionym na teraz (dzień + godzina) i mail o swojej porze.
function coGodzine() {
  const tz = Session.getScriptTimeZone() || 'Europe/Warsaw'
  const now = new Date()
  const day = Number(Utilities.formatDate(now, tz, 'u')) % 7 // 1 pon … 7 niedz → 0 niedz
  const hour = Number(Utilities.formatDate(now, tz, 'H'))
  const phones = readPhones().filter(p => p.day === day && p.hour === hour)
  const mail = day === CONFIG.mailDay && hour === CONFIG.mailHour
  if (!phones.length && !mail) return
  const check = checkSunday(now, tz)
  if (!check.missing.length) return
  if (mail) sendMail(check)
  if (phones.length) sendPush(phones, check)
}

// Test: mail i powiadomienie na wszystkie telefony — także gdy wszystko jest gotowe.
function sprawdzTeraz() {
  const tz = Session.getScriptTimeZone() || 'Europe/Warsaw'
  const check = checkSunday(new Date(), tz)
  sendMail(check)
  sendPush(readPhones(), check)
}

// Najbliższa niedziela (w niedzielę rano — dzisiejsza, od 14:00 — następna) i czego w niej brakuje.
function checkSunday(now, tz) {
  const d = new Date(now)
  const dow = Number(Utilities.formatDate(d, tz, 'u')) % 7
  const add = dow === 0 ? (Number(Utilities.formatDate(d, tz, 'H')) >= 14 ? 7 : 0) : 7 - dow
  d.setDate(d.getDate() + add)
  const sunday = Utilities.formatDate(d, tz, 'yyyy-MM-dd')
  const pretty = Utilities.formatDate(d, tz, 'd.MM.yyyy')
  const service = findService(sunday)
  const missing = !service ? ['całe nabożeństwo (nie zostało utworzone)']
    : REQUIRED.filter(([key]) => !String(service[key] || '').trim()).map(([, name]) => name)
        .concat(service.songs && service.songs.length ? [] : ['pieśni'])
  return { service, missing, pretty }
}

function sendMail(check) {
  const { service, missing, pretty } = check
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
}

// Telefony z włączonymi powiadomieniami: { id, subscription, day, hour, remove() }.
function readPhones() {
  if (typeof bazaWlaczona === 'function' && bazaWlaczona()) return bazaTelefony()
  const roots = DriveApp.getFoldersByName(CONFIG.folderName)
  if (!roots.hasNext()) return []
  const dirs = roots.next().getFoldersByName(CONFIG.pushFolder)
  if (!dirs.hasNext()) return []
  const out = []
  const it = dirs.next().getFiles()
  while (it.hasNext()) {
    const f = it.next()
    try {
      const data = JSON.parse(f.getBlob().getDataAsString())
      const when = data.schedule || {}
      out.push({ id: f.getId(), subscription: data.subscription, day: when.day ?? 5, hour: when.hour ?? 19, remove: () => f.setTrashed(true) })
    } catch (e) { /* uszkodzony plik */ }
  }
  return out
}

// Wysyłka przez funkcję Netlify; telefony, które się wypisały (albo usunęły aplikację), znikają z folderu.
function sendPush(phones, check) {
  if (!phones.length) return
  const { missing, pretty } = check
  const res = UrlFetchApp.fetch(CONFIG.pushUrl, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      secret: CONFIG.pushSecret,
      title: `Nabożeństwo ${pretty}`,
      body: missing.length ? 'Brakuje: ' + missing.join(', ') + '. Dotknij, aby uzupełnić.' : 'Wszystko gotowe.',
      url: CONFIG.appUrl,
      subscriptions: phones.map(p => ({ id: p.id, subscription: p.subscription })),
    }),
  })
  const out = JSON.parse(res.getContentText() || '{}')
  if (res.getResponseCode() !== 200) throw new Error('Powiadomienia: ' + (out.error || res.getResponseCode()))
  for (const id of out.gone || []) { const p = phones.find(x => x.id === id); if (p) p.remove() }
  Logger.log('Powiadomienia wysłane: ' + out.sent)
}

// Nabożeństwo na dany dzień: podfolder „<data> <tytuł> (<id>)” z plikiem nabozenstwo.json.
function findService(date) {
  if (typeof bazaWlaczona === 'function' && bazaWlaczona()) return bazaNabozenstwo(date)
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
