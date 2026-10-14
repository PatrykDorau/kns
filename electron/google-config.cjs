// Logowanie do Dysku Google w aplikacji na komputerze.
// Identyfikator i „sekret” klienta typu „Aplikacja komputerowa” z Google Cloud Console (projekt KNS Nabo).
// Google nie traktuje sekretu klienta komputerowego jako poufnego — i tak trafia do instalatora.
module.exports = {
  clientId: '828184441520-8o83kfp8n9617a5fmhk25vbs8lncc7ed.apps.googleusercontent.com',
  // Sekret jest w osobnym pliku electron/google-secret.cjs (nie trafia na GitHuba, ale trafia do instalatora).
  clientSecret: (() => { try { return require('./google-secret.cjs') } catch { return '' } })(),

  // Folder aplikacji na Dysku: najpewniej jego identyfikator (końcówka adresu
  // drive.google.com/drive/folders/<IDENTYFIKATOR>); gdy pusty, folder jest szukany po nazwie.
  folderId: '',
  folderName: 'Aplikacja KNS Nabo',
  servicesFolder: 'nabozenstwa',
  songsFolder: 'piesni',

  // Sygnały dla kamerzysty przez internet (ntfy.sh) — ten sam temat co w mobile/config.js.
  cueTopic: 'kns-kamera-25f03cec611e3ab11cb9a5e9',
}
