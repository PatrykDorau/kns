# Kościół Na Skale

Aplikacja dla służb kościoła (Windows): rzutnik, stream i organizacja nabożeństw. Zbudowana na Vue 3 i Electronie.

## Służby

- **Rzutnik** — pieśni, zdjęcia, filmy, teksty, prezentacje (PowerPoint, PDF) i pętle wyświetlane na drugim ekranie. Podgląd, przenikanie, ukrywanie (`H`), zamrażanie (`F`), sterowanie slajdami strzałkami.
- **Stream** — podgląd kamer podłączonych do komputera, dane nabożeństwa do skopiowania i sygnały dźwiękowe dla kamerzysty (na jego telefon).
- **Organizacja nabożeństw** — plan nabożeństwa: data, kazanie, fragment, mówca, zespół, pieśni, załączniki. Alarm, gdy na najbliższą niedzielę czegoś brakuje.

## Wspólne dane

Nabożeństwa i baza pieśni synchronizują się przez **folder aplikacji** na Dysku Google (np. „Aplikacja KNS Nabo”), który wskazuje się na ekranie wyboru służby:

- `nabozenstwa/` — po jednym podfolderze na nabożeństwo (`<data> <tytuł kazania> (<id>)`),
- `piesni/baza-piesni.json` — wspólna baza pieśni.

Pozostałe dane (materiały, ustawienia) są lokalne na każdym komputerze.

## Uruchomienie

```bash
npm install
npm run dev
```

## Budowanie instalatora

```bash
npm run dist
```

Instalator i wersja przenośna powstają w folderze `release`.

## Wymagania i uwagi

- Rzutnik musi być podłączony jako drugi ekran w trybie „Rozszerz” (`Win` + `P`).
- Prezentacje PowerPoint najwierniej importują się na komputerze z PowerPointem lub LibreOffice; bez nich działa wbudowany, przybliżony czytnik.
- Pilot i sygnały dla kamerzysty wymagają zezwolenia w Zaporze Windows dla portów 8765 i 8766 oraz telefonu w tej samej sieci co komputer.

## Organizacja nabożeństw na telefonie

Folder `web` to strona internetowa (Vite + Vue + TypeScript) do organizacji kościoła z telefonu — dane w bazie Supabase, logowanie kontem Google.

- `web/src`: `App.vue` (widoki), `components/`, `services/` (baza, Dysk, konfiguracja, wspólne `church.ts`), `styles/`; pliki stałe (ikony, grafiki, `sw.js`, `napisy.html`) w `web/public`.
- Podgląd: `npm run dev:web`; budowanie: `npm run build:web` → `web/dist`. Netlify buduje i publikuje to samo po każdym `git push` (`netlify.toml`).
- Test bez Google i Supabase: `npx vite --config web/vite.config.mjs --mode baza --port 5184` (prawdziwy schemat bazy w przeglądarce, udawane logowanie — opis w `web/vite.config.mjs`).
- `web/src/services/config.ts`: identyfikator klienta OAuth z Google Cloud Console oraz folder aplikacji na Dysku (identyfikator albo nazwa) i nazwy podfolderów.
- `?demo` na końcu adresu włącza tryb pokazowy bez logowania.
