// Ustawienia strony nabożeństw na telefon.
window.KNS_CONFIG = {
  // Identyfikator klienta OAuth z Google Cloud Console (typ: aplikacja internetowa).
  // Adres strony — tylko pod nim działa logowanie Google (Authorized JavaScript origins w Google Cloud).
  appUrl: 'https://kns-nabo.netlify.app',

  clientId: '828184441520-7rkg5bloroj1dnujscio9irspa51c5is.apps.googleusercontent.com',

  // Folder aplikacji na Dysku Google — w „Mój dysk” konta kościoła albo udostępniony zalogowanemu kontu.
  // Najpewniej wpisać jego identyfikator: to końcówka adresu po otwarciu folderu w przeglądarce,
  // drive.google.com/drive/folders/<IDENTYFIKATOR>. Gdy pusty, folder jest szukany po nazwie.
  folderId: '',
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
}
