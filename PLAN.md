# Plan rozbudowy: aplikacja życia kościoła

## Decyzje (ustalone z Patrykiem, 16.10.2026)
- **Na razie wszystko na Dysku Google** kościoła (konto `pliki.kns@gmail.com`, folder „Aplikacja KNS Nabo”).
  Później przenosiny do bazy danych — **Supabase** (darmowy plan + codzienne „szturchnięcie” + kopia na Dysk).
- **Nowa osoba czeka na zatwierdzenie** przez administratora; do tego czasu widzi tylko rzeczy publiczne
  (kalendarz publiczny, ogłoszenia publiczne).
- Wszyscy zatwierdzeni mają dostęp „od razu” — bez ręcznego udostępniania folderu (robi to skrypt serwera).

## Jak to działa (Dysk Google)
- **Skrypt serwera** = Google Apps Script na koncie kościoła, w tym samym projekcie co przypomnienia:
  - `skrypty/przypomnienie.gs` — przypomnienia o brakach (co godzinę, mail + powiadomienia na telefony),
  - `skrypty/serwer.gs` — **aplikacja internetowa** (doPost) dla telefonu i komputera: konta, rangi, udostępnianie.
- Telefon/komputer wysyła do skryptu swój token logowania Google; skrypt sprawdza go
  (`tokeninfo` — czy to nasz klient, `userinfo`/Drive `about` — adres e-mail) i odpowiada.
- Zapytania do skryptu: `POST` z `Content-Type: text/plain` (bez preflight CORS), treść JSON `{ action, token, … }`.

### Foldery i dostęp (pilnuje Dysk Google)
| Folder | Kto widzi | Kto edytuje |
|---|---|---|
| `Aplikacja KNS Nabo` (nabożeństwa, wydarzenia, pieśni, ogłoszenia) | zatwierdzeni | lider, organizator, technika, rada, pastor, admin |
| `Aplikacja KNS Nabo/powiadomienia` | — | wszyscy zatwierdzeni (zapis własnego telefonu) |
| `KNS Nabo — Protokoły` (spotkania członkowskie) | zatwierdzeni | protokolant, rada, pastor, admin (zatwierdzają) |
| `KNS Nabo — Rada` (protokoły i sprawy rady) | rada, pastor, admin | rada, pastor, admin |
| `KNS Nabo — Administracja` (`osoby.json`) | tylko konto kościoła (przez skrypt) | — |

Uwaga: w „Mój dysk” dostępu odziedziczonego po folderze nadrzędnym nie da się zdjąć w podfolderze — dlatego
Protokoły, Rada i Administracja to **osobne foldery najwyższego poziomu**, nie podfoldery aplikacji.

### Rangi (`RANGI` w serwer.gs)
`czlonek` (Członek), `lider` (edycja), `organizator` (Organizator nabożeństw, edycja), `technika` (rzutnik/stream, edycja),
`protokolant` (pisze protokoły), `rada` (Członek rady zboru: edycja + folder rady), `pastor` (edycja + rada),
`admin` (wszystko + zarządzanie osobami). Flagi: `edit`, `council`, `protocols`, `manage`.

### Osoby (`KNS Nabo — Administracja/osoby.json`)
`{ people: [{ email, name, status: 'pending'|'active'|'rejected', roles: [...], requested, changed, changedBy }] }`
Zmiany pod `LockService`. Adresy z `SERWER.admins` są zawsze administratorami.

### API skryptu (`serwer.gs` → `AKCJE`)
- `me` — kim jestem; przy pierwszym logowaniu tworzy prośbę (`pending`). Zwraca `{ person, ranks }`.
- `people` — lista osób (tylko admin).
- `setPerson` `{ email, status?, roles? }` — zatwierdź / odrzuć / zmień rangi + od razu udostępnia lub odbiera foldery.
- (dalej) `public` — kalendarz i ogłoszenia publiczne dla niezatwierdzonych.
- Funkcja jednorazowa `przeniesObecnych()` — osoby, którym folder był już udostępniony → zatwierdzeni członkowie
  (edytorzy dostają też „organizator”).

## Etapy i stan

### 1. Fundament
- [x] Plan (`PLAN.md`)
- [x] Skrypt serwera: konta, prośby o dostęp, rangi, udostępnianie folderów (`skrypty/serwer.gs`) — **niewdrożony**
- [x] Test skryptu na podstawionych usługach Google (`skrypty/test-serwera.cjs`: `node skrypty/test-serwera.cjs`)
- [x] Telefon (`mobile/`, wersja 2.26) — działa w trybie pokazowym; prawdziwe logowanie dwuetapowe sprawdzić po wdrożeniu skryptu:
  - `config.js`: `apiUrl` (adres aplikacji internetowej skryptu, …/exec)
  - `drive.js`: logowanie w dwóch krokach — najpierw tylko tożsamość (`openid email profile`), dostęp do Dysku
    (`drive`) dopiero po zatwierdzeniu; zapamiętany członek → od razu oba zakresy; `accessToken()` dla API
  - nowy moduł `api.js`: `call(action, data)` → POST do `apiUrl`
  - ekran „Czekasz na zatwierdzenie” (imię, e-mail, „Sprawdź ponownie”, „Wyloguj”, później publiczny kalendarz)
  - zakładka **Osoby** (tylko admin): oczekujący (zatwierdź z rangami / odrzuć), członkowie (rangi jako przełączniki)
  - tryb pokazowy (`?demo`): udawane API z kilkoma osobami
- [ ] Komputer: logowanie przez to samo API (ranga decyduje o dostępie do Organizacji/Rzutnika/Stream) — **po wdrożeniu serwera** (bez niego nie da się sprawdzić, a łatwo odciąć technikę)
- [x] Wydarzenia różnych typów (telefon 2.27; `mobile/church.js`, zapis w `drive.js`, test: `node skrypty/test-telefonu.mjs`): nabożeństwo, spotkanie studenckie, członkowskie, rady, inne (edytowalna lista typów)
  - dane: `Aplikacja KNS Nabo/wydarzenia/<data> <tytuł> (<id>)/wydarzenie.json`; nabożeństwa zostają w `nabozenstwa/`
    (zgodność z rzutnikiem), z nowym polem `program`
- [x] Szablony (edytowalne; usunięte wbudowane rodzaje zapamiętane jako `{ id, removed: true }`) dla każdego typu: domyślna godzina, miejsce, program — `szablony/szablony.json`
- [x] Program nabożeństwa (jak w przykładzie): punkty `{ key, offset, category, title, person, note }` — offset = minuty od początku, program przesuwa się z godziną;
  kategorie z ikonami: Inne/Odprawa, Prowadzenie, Ogłoszenia, Uwielbienie, Modlitwa, Kazanie (tytuł + fragment), Pieśń/kolekta…
  Szablon nabożeństwa: 9:45 Odprawa, 10:00 Prowadzenie, 10:05 Ogłoszenia, 10:10 Uwielbienie, 10:40 Modlitwa, 10:50 Kazanie, 11:35 Pieśń/kolekta
- [x] Kalendarz życia kościoła na telefonie: widok miesiąca + lista najbliższych (60 dni), filtr typów
- [x] Kalendarz i program w Organizacji na komputerze (`src/ChurchCalendar.vue`, `src/ProgramEditor.vue`; szablony i wydarzenia czyta synchronizacja z Dyskiem Google — `readChurch` w `gdrive.cjs`)

### 2. Protokoły
- [x] Protokół do spotkania członkowskiego (`KNS Nabo — Protokoły`) i rady (`KNS Nabo — Rada/protokoly`) — telefon 2.28: Kalendarz → Protokoły albo przycisk przy spotkaniu
- [x] Pisze protokolant (ranga; protokoły rady — rada), czytają uprawnieni; obecni, porządek obrad, ustalenia/uchwały, głosowania
- [x] Status: szkic → do akceptacji → zatwierdzony (zatwierdzają rada/pastor; zatwierdzony zablokowany); PDF przez drukowanie

### 3. Komunikacja
- [x] Strona główna (zakładka Start): komunikaty rady zboru (przypięte, ważne do daty) — piszą rada/pastor
- [x] Ogłoszenia: odbiorcy publiczni / członkowie / rada; `ogloszenia/ogloszenia.json` (+ `KNS Nabo — Rada/ogloszenia.json`); dodają osoby z prawem edycji
- [x] Newsletter: co czwartek 18:00 e-mail (`newsletter()` w serwer.gs, wyzwalacz z `ustawNewsletter()`) — kalendarz na 2 tygodnie (bez rady) i ogłoszenia; zapis/wypis przełącznikiem na stronie Start. Limit Gmaila: ok. 100 maili dziennie
- [x] Publiczny podgląd (`public` w API, pamięć 10 min) dla niezatwierdzonych i gości: nabożeństwa, wydarzenia „widoczne dla gości”, ogłoszenia publiczne

### 4. Komputer
- [x] Stream: program nabożeństwa w panelu (w dniu nabożeństwa zaznaczony punkt „TERAZ”, kopiowanie)
- [x] Rzutnik: przycisk „Ogłoszenia” — aktualne ogłoszenia (bez rady) jako pętla slajdów przełączanych co 12 s

### 5. Baza danych (później)
- [ ] Supabase: tabele osób, rang, wydarzeń, programów, protokołów, ogłoszeń; uprawnienia w bazie (RLS);
  logowanie Google; pliki zostają na Dysku; migracja z JSON na Dysku

## Wdrożenie po stronie Patryka (gdy skrypt i telefon będą gotowe)
1. script.google.com (konto kościoła) → projekt z przypomnieniami → dodaj plik `serwer` → wklej `skrypty/serwer.gs`,
   uzupełnij `admins`.
2. Wdróż → Aplikacja internetowa (Wykonaj jako: Ja; Dostęp: Każdy) → adres `…/exec` → do `mobile/config.js` (`apiUrl`).
3. Uruchom `przeniesObecnych` (obecne osoby → członkowie) i `ustawNewsletter` (wyzwalacz newslettera).
4. Google Cloud: ekran zgody — dodać zakresy `openid`, `email`, `profile` (są niewrażliwe).

## Stan projektu (dla kontynuacji)
- Repozytorium: github.com/PatrykDorau/kns, folder lokalny `Pulpit\projekty\kns-nabo` (obok `portfolio` — osobny projekt).
- Komputer: Electron + Vue (`src/`, `electron/`), wydania na GitHub Releases (ostatnie 1.2.3), automatyczne aktualizacje.
  Budowanie: `npx vite build` → `npx electron-builder --win --publish never "-c.directories.output=%TEMP%/kns-out"`,
  kopia do `release/`, wydanie skryptem przez API GitHuba (logowanie z menedżera haseł Gita).
- Telefon: `mobile/` (bez budowania, Vue z CDN), Netlify `kns-nabo.netlify.app` (publikuje się samo po `git push`),
  funkcja `netlify/functions/push.mjs` (powiadomienia Web Push, zmienne VAPID_PRIVATE i PUSH_SECRET w Netlify).
- Sekret klienta Google na komputer: `electron/google-secret.cjs` (poza repozytorium).
