-- Miejsce na dane (dla administratora i deweloperów — can_backlog z zgloszenia.sql): rozmiar bazy, pliki w koszach
-- i czy plik jest jeszcze używany (grafika ogłoszenia/wydarzenia/celu/wydawki, plik materiału, plik ASB).
-- Usuwanie plików — z aplikacji przez Storage API (reguły koszy), tu tylko odczyt. Uruchamiać po zgloszenia.sql,
-- cele.sql, asb.sql i wydawka.sql. Można wielokrotnie.
create or replace function public.storage_usage() returns jsonb
language plpgsql stable security definer set search_path = public, storage as $$
declare files jsonb := '[]'::jsonb;
begin
  if not can_backlog() then raise exception 'Miejsce na dane widzą administrator i deweloperzy.'; end if;
  if to_regclass('storage.objects') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name,
          'size', coalesce((o.metadata ->> 'size')::bigint, 0), 'created', o.created_at,
          'usedBy', u.what) order by (u.what is null) desc, coalesce((o.metadata ->> 'size')::bigint, 0) desc), '[]'::jsonb)
      from storage.objects o
      left join lateral (
        select case
          when o.bucket_id = 'ogloszenia' then coalesce(
            (select 'ogłoszenie: ' || coalesce(a.data ->> 'title', '') from announcements a where a.data::text like '%' || o.name || '%' limit 1),
            (select 'wydarzenie: ' || coalesce(e.data ->> 'title', '') from events e where e.data::text like '%' || o.name || '%' limit 1),
            (select 'cel: ' || g.title from goals g where g.image like '%' || o.name || '%' limit 1),
            (select 'wydawka: ' || w.title from giveaways w where w.image like '%' || o.name || '%' limit 1))
          when o.bucket_id = 'protokoly' then (select 'materiał: ' || coalesce(p.data ->> 'title', '') from protocols p where p.data ->> 'file' = o.name limit 1)
          when o.bucket_id = 'asb' then (select 'ASB: ' || coalesce(nullif(m.topic, ''), m.month) from asb_meetings m where m.files::text like '%' || o.name || '%' limit 1)
          else 'zdjęcia na stronę główną (odświeżane same)' end as what
      ) u on true
    $q$ into files;
  end if;
  return jsonb_build_object('db', pg_database_size(current_database()), 'dbLimit', 500 * 1024 * 1024,
    'filesLimit', 1024 * 1024 * 1024, 'files', files);
end $$;
revoke all on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
