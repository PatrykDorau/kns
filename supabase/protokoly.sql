-- Biblioteka protokołów: protokół to plik (PDF, Word, zdjęcie) spisany poza aplikacją i wgrany tutaj.
-- Widoczność: kind = 'czlonkowskie' (wszyscy zatwierdzeni członkowie) albo 'rada' (tylko rada zboru) — pilnują tego
-- reguły tabeli protocols (schema.sql). Plik leży w prywatnym koszu „protokoly”: pobrać go może tylko ten, kto widzi
-- protokół (adres ważny godzinę). Dodają protokolant i rada zboru. Opcjonalnie protokół jest dołączony do spotkania.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('protokoly', 'protokoly', false, 26214400, array['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text',
  'image/jpeg', 'image/png', 'image/webp', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists protokoly_read on storage.objects;
drop policy if exists protokoly_insert on storage.objects;
drop policy if exists protokoly_delete on storage.objects;
create policy protokoly_read on storage.objects for select to authenticated
  using (bucket_id = 'protokoly' and exists (select 1 from public.protocols p where p.data ->> 'file' = storage.objects.name));
create policy protokoly_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'protokoly' and (public.has_flag('protocols') or public.has_flag('council')));
create policy protokoly_delete on storage.objects for delete to authenticated
  using (bucket_id = 'protokoly' and (public.has_flag('protocols') or public.has_flag('council')));

-- Materiały (najpierw materialy.sql — funkcja can_write_material): także prezentacje i arkusze (instrukcje), do 25 MB; wgrywać i usuwać mogą wszyscy, którzy dodają materiały.
update storage.buckets set allowed_mime_types = array['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet',
  'image/jpeg', 'image/png', 'image/webp', 'text/plain'] where id = 'protokoly';
drop policy if exists protokoly_insert on storage.objects;
drop policy if exists protokoly_delete on storage.objects;
create policy protokoly_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'protokoly' and public.can_write_material());
create policy protokoly_delete on storage.objects for delete to authenticated
  using (bucket_id = 'protokoly' and public.can_write_material());
