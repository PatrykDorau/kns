-- Grafiki i filmy ogłoszeń (filmy do 50 MB): publiczny kosz „ogloszenia” w Supabase Storage (odczyt przez adres pliku — nazwy są losowe),
-- zapis i usuwanie tylko dla osób z prawem edycji. Telefon zmniejsza zdjęcie przed wysłaniem (do ~1600 px, JPEG).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ogloszenia', 'ogloszenia', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ogloszenia_insert on storage.objects;
drop policy if exists ogloszenia_update on storage.objects;
drop policy if exists ogloszenia_delete on storage.objects;
create policy ogloszenia_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ogloszenia' and public.has_flag('edit'));
create policy ogloszenia_update on storage.objects for update to authenticated
  using (bucket_id = 'ogloszenia' and public.has_flag('edit'));
create policy ogloszenia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ogloszenia' and public.has_flag('edit'));

-- Podgląd publiczny: ogłoszenia z grafiką i filmem.
create or replace function public.public_preview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('date', s.date, 'time', s.data ->> 'time', 'place', s.data ->> 'place',
        'sermonTitle', s.data ->> 'sermonTitle', 'passage', s.data ->> 'passage', 'speaker', s.data ->> 'speaker') order by s.date)
      from services s where s.date between current_date and current_date + 60), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'title', e.data ->> 'title', 'date', e.date,
        'time', e.data ->> 'time', 'place', e.data ->> 'place', 'description', e.data ->> 'description') order by e.date)
      from events e where e.date between current_date and current_date + 60
        and coalesce(e.is_public, e.type not in ('czlonkowskie', 'rada'))), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.data ->> 'title', 'text', a.data ->> 'text',
        'important', a.important, 'date', a.data -> 'date', 'image', a.data ->> 'image', 'video', a.data ->> 'video', 'link', a.data ->> 'link', 'linkText', a.data ->> 'linkText') order by a.important desc, a.updated desc)
      from announcements a where a.audience = 'public' and (a.until is null or a.until >= current_date)), '[]'::jsonb),
    'types', coalesce((select jsonb_path_query_array(t.types, '$[*] ? (!exists(@.removed)) ') from templates t where t.id = 'main'), '[]'::jsonb))
$$;
