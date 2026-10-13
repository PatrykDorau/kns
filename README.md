# Kościół Na Skale

Aplikacja dla służb kościoła (Windows): rzutnik, stream i organizacja nabożeństw. Zbudowana na Vue 3 i Electronie.

## Służby

- **Rzutnik** — pieśni, zdjęcia, filmy, teksty, prezentacje (PowerPoint, PDF) i pętle wyświetlane na drugim ekranie. Podgląd, przenikanie, ukrywanie (`H`), zamrażanie (`F`), sterowanie slajdami strzałkami.
- **Stream** — podgląd kamer podłączonych do komputera, dane nabożeństwa do skopiowania i sygnały dźwiękowe dla kamerzysty (na jego telefon).
- **Organizacja nabożeństw** — plan nabożeństwa: data, kazanie, fragment, mówca, zespół, pieśni, załączniki. Alarm, gdy na najbliższą niedzielę czegoś brakuje.

## Wspólne dane

Nabożeństwa i baza pieśni synchronizują się między komputerami przez **folder wspólny** (np. Dysk Google lub OneDrive) — ustawia się go na ekranie wyboru służby. Pozostałe dane (materiały, ustawienia) są lokalne.

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
