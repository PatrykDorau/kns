-- Dane testowe: kilka ogłoszeń i wydarzeń na najbliższe dni (daty liczone od dziś), żeby zobaczyć stronę startową
-- i kalendarz z treścią. Uruchom w Supabase → SQL Editor. Można uruchamiać wiele razy (nadpisuje te same rekordy).
-- Wszystkie mają identyfikator zaczynający się od „test-”. Usunięcie — na końcu pliku (odkomentuj i uruchom).

with t as (select (extract(epoch from now()) * 1000)::bigint as ms)
insert into public.announcements (id, audience, important, until, data, updated, updated_by)
select id, audience, important, until,
  jsonb_build_object('id', id, 'title', title, 'text', body, 'audience', audience, 'important', important,
    'until', coalesce(until::text, ''), 'date', (select ms from t) - age * 3600000, 'author', 'Test', 'updated', (select ms from t)),
  (select ms from t), 'test'
from (values
  ('test-a1', 'members', true,  current_date + 14, 'Zmiana miejsca nabożeństwa',
   'Od przyszłej niedzieli spotykamy się w sali konferencyjnej na 1. piętrze. Wejście od parkingu.', 2),
  ('test-a2', 'members', true,  current_date + 7,  'Post i modlitwa w środę',
   'Zapraszamy wszystkich na wspólny dzień postu i modlitwy. Wieczorem spotkanie modlitewne o 19:00.', 5),
  ('test-a3', 'public',  false, null, 'Wyjazd wspólnotowy — zapisy',
   'Ruszyły zapisy na wyjazd wspólnotowy w góry. Liczba miejsc ograniczona, zapisy u Kasi do końca miesiąca.', 20),
  ('test-a4', 'members', false, null, 'Szukamy osób do służby technicznej',
   'Potrzebujemy 2–3 osób do obsługi rzutnika i streamu. Przeszkolimy — zgłoś się po nabożeństwie.', 30),
  ('test-a5', 'public',  false, null, 'Kawa po nabożeństwie',
   'W każdą niedzielę po nabożeństwie zostajemy na kawę i ciasto. Chętnych do pieczenia zapraszamy na listę.', 48),
  ('test-a6', 'members', false, null, 'Nowe śpiewniki',
   'Do bazy pieśni dodaliśmy 40 nowych pieśni wraz z akordami. Zespół uwielbienia — zerknijcie przed próbą.', 72)
) as v(id, audience, important, until, title, body, age)
on conflict (id) do update set audience = excluded.audience, important = excluded.important, until = excluded.until,
  data = excluded.data, updated = excluded.updated;

with t as (select (extract(epoch from now()) * 1000)::bigint as ms)
insert into public.events (id, type, date, is_public, data, updated, updated_by)
select id, type, current_date + d, null,
  jsonb_build_object('id', id, 'type', type, 'title', title, 'date', (current_date + d)::text, 'time', time, 'place', place,
    'description', body, 'program', '[]'::jsonb, 'createdBy', 'test', 'updated', (select ms from t)),
  (select ms from t), 'test'
from (values
  ('test-e1', 'studenckie',   1, 'Spotkanie studenckie',        '19:00', 'Klub Studnia',      'Rozważanie Listu do Filipian, rozdział 2.'),
  ('test-e2', 'inne',         2, 'Próba zespołu uwielbienia',   '18:30', 'Hotel Forza',       'Przygotowanie pieśni na niedzielę.'),
  ('test-e3', 'inne',         3, 'Spotkanie modlitewne',        '19:00', 'Online (Meet)',     'Modlitwa za kościół i miasto.'),
  ('test-e4', 'rada',         4, 'Spotkanie rady zboru',        '19:00', 'U pastora',         ''),
  ('test-e5', 'czlonkowskie', 5, 'Spotkanie członkowskie',      '18:00', 'Hotel Forza',       'Sprawozdanie finansowe i plany na nowy rok.'),
  ('test-e6', 'studenckie',   8, 'Wieczór gier dla studentów',  '19:30', 'Klub Studnia',      'Planszówki, pizza i dobra rozmowa.'),
  ('test-e7', 'inne',        10, 'Szkolenie służby technicznej','17:00', 'Hotel Forza',       'Rzutnik, stream i nagłośnienie — dla nowych osób.')
) as v(id, type, d, title, time, place, body)
on conflict (id) do update set type = excluded.type, date = excluded.date, data = excluded.data, updated = excluded.updated;

-- Usunięcie danych testowych:
-- delete from public.announcements where id like 'test-%';
-- delete from public.events where id like 'test-%';
