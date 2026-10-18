-- Załączniki spotkań ASB (rozważanie dla prowadzącego itp.): prywatny kosz „asb” — pobiera, wgrywa i usuwa
-- tylko osoba z rangą ASB albo administrator (link do pobrania ważny godzinę). Uruchamiaj po asb.sql.
insert into storage.buckets (id, name, public, file_size_limit)
values ('asb', 'asb', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists asb_files_read on storage.objects;
drop policy if exists asb_files_insert on storage.objects;
drop policy if exists asb_files_delete on storage.objects;
create policy asb_files_read on storage.objects for select to authenticated using (bucket_id = 'asb' and public.is_asb());
create policy asb_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'asb' and public.is_asb());
create policy asb_files_delete on storage.objects for delete to authenticated using (bucket_id = 'asb' and public.is_asb());
