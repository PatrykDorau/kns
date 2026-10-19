-- Zdjęcia z ostatniego nabożeństwa (z Dysku Google kościoła) w karcie najbliższego nabożeństwa na stronie startowej.
-- Skrypt Google (skrypty/baza.gs, zdjeciaNabozenstw) co godzinę bierze najnowszy folder ze zdjęciami, wgrywa
-- pomniejszone kopie do prywatnego kubełka „zdjecia” (klucz serwera) i zapisuje listę w site_settings ('zdjecia').
-- Oglądać mogą tylko zatwierdzeni członkowie (zalogowani) — przez linki ważne godzinę. Można wielokrotnie.

insert into storage.buckets (id, name, public) values ('zdjecia', 'zdjecia', false)
on conflict (id) do update set public = false;

drop policy if exists zdjecia_read on storage.objects;
create policy zdjecia_read on storage.objects for select to authenticated
  using (bucket_id = 'zdjecia' and public.is_active());
-- wgrywanie i usuwanie — tylko skrypt z kluczem serwera (bez zasad dla użytkowników)
