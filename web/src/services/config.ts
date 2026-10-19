// Ustawienia strony nabożeństw na telefon.
export const CONFIG: Record<string, any> = {
  // Identyfikator klienta OAuth z Google Cloud Console (typ: aplikacja internetowa).
  // Adres strony — tylko pod nim działa logowanie Google (Authorized JavaScript origins w Google Cloud).
  appUrl: 'https://kns-nabo.netlify.app',

  clientId: '828184441520-7rkg5bloroj1dnujscio9irspa51c5is.apps.googleusercontent.com',

  // Folder aplikacji na Dysku Google — w „Mój dysk” konta kościoła albo udostępniony zalogowanemu kontu.
  // Najpewniej wpisać jego identyfikator: to końcówka adresu po otwarciu folderu w przeglądarce,
  // drive.google.com/drive/folders/<IDENTYFIKATOR>. Gdy pusty, folder jest szukany po nazwie.
  folderId: '1pI2FlyMq8XUQHbJlELd1OuxsCIz-RRnG',
  folderName: 'Aplikacja KNS Nabo',

  // Podfoldery w folderze aplikacji (te same, których używa aplikacja na komputerze).
  servicesFolder: 'nabozenstwa',
  songsFolder: 'piesni',

  // Ekran „Kamera”: sygnały od operatora streamu przez internet (ntfy.sh).
  // Ten sam temat co cueTopic w electron/google-config.cjs.
  cueTopic: 'kns-kamera-25f03cec611e3ab11cb9a5e9',

  // Powiadomienia na telefon (przypomnienie w piątek wieczorem) — funkcja Netlify z netlify/functions/push.mjs.
  pushUrl: '/api/push',

  // Serwer aplikacji (skrypty/serwer.gs wdrożony jako aplikacja internetowa — adres kończy się na /exec).
  // Pilnuje kont i rang: nowa osoba czeka na zatwierdzenie. Pusty = bez kont (każdy z dostępem do folderu).
  apiUrl: '',

  // Baza danych Supabase (konta, rangi i wszystkie dane aplikacji). Gdy wpisana — zamiast plików JSON na Dysku
  // i zamiast serwera kont (apiUrl). Klucz „publishable” jest publiczny; dostępu pilnują reguły w bazie.
  supabaseUrl: 'https://igkjlgdpvgdeqfqctnnf.supabase.co',
  supabaseKey: 'sb_publishable_Ji4v_zRY2OGsMRAWwiis-g_x6WAYCPI',

  // Protokoły: osobne foldery na Dysku konta kościoła (tworzy je i udostępnia serwer według rang).
  protocolsFolder: 'KNS Nabo — Protokoły', // spotkania członkowskie — czytają wszyscy zatwierdzeni
  councilFolder: 'KNS Nabo — Rada', // rada zboru — tylko rada, pastor i administrator
}

// Testy bez Google (skrypty/test-ui, vite --mode baza|dysk): udawane logowanie i Dysk, adres strony testowej;
// „baza” — prawdziwy schemat bazy w przeglądarce (PGlite), „dysk” — dane na udawanym Dysku i serwer kont.
const MODE = import.meta.env?.MODE
if (MODE === 'baza' || MODE === 'dysk') Object.assign(CONFIG, { folderId: '', appUrl: location.origin })
if (MODE === 'dysk') Object.assign(CONFIG, { apiUrl: 'https://mock.api/exec', supabaseUrl: '' })
