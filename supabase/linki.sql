-- Kanały KNS: linki do grup WhatsApp (członkowie, kobiety…), Facebooka, strony www — w zakładce „Więcej”,
-- żeby z aplikacji dało się dotrzeć wszędzie. Linki zaproszeń do grup nie są publiczne: widzą tylko zalogowani
-- członkowie (nie site_settings, które czyta każdy). Zmienia zarządzający (manage).
-- Uruchamiać po schema.sql (is_active, has_flag). Można uruchomić ponownie.

create table if not exists public.kns_links (
  id text primary key default 'l-' || left(md5(random()::text || clock_timestamp()::text), 12),
  name text not null,
  url text not null,
  note text not null default '',
  pos int not null default 0,
  updated timestamptz not null default now()
);
do $$ begin
  alter table public.kns_links add constraint kns_links_url check (url ~ '^https://[^\s]{4,}$' and length(url) <= 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.kns_links add constraint kns_links_name check (length(trim(name)) between 2 and 60);
exception when duplicate_object then null; end $$;

alter table public.kns_links enable row level security;
revoke all on public.kns_links from public, anon, authenticated;

create or replace function public.kns_links_load() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_active() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'url', url, 'note', note) order by pos, lower(name))
    from kns_links), '[]'::jsonb) end
$$;

-- cała lista naraz (kolejność = kolejność w tablicy): [{name, url, note}]
create or replace function public.kns_links_save(items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; i int := 0;
begin
  if not (is_active() and has_flag('manage')) then raise exception 'Linki zmienia zarządzający.'; end if;
  if jsonb_typeof(coalesce(items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(items, '[]'::jsonb)) > 30 then raise exception 'Za dużo linków.'; end if;
  delete from kns_links where true;
  for it in select * from jsonb_array_elements(coalesce(items, '[]'::jsonb)) loop
    if length(trim(coalesce(it ->> 'name', ''))) < 2 then raise exception 'Każdy link potrzebuje nazwy.'; end if;
    if coalesce(it ->> 'url', '') !~ '^https://[^\s]{4,}$' or length(it ->> 'url') > 500 then raise exception 'Link „%” musi zaczynać się od https://', it ->> 'name'; end if;
    insert into kns_links (name, url, note, pos) values (left(trim(it ->> 'name'), 60), trim(it ->> 'url'), left(trim(coalesce(it ->> 'note', '')), 120), i);
    i := i + 1;
  end loop;
end $$;

revoke all on function public.kns_links_load() from public, anon;
revoke all on function public.kns_links_save(jsonb) from public, anon;
grant execute on function public.kns_links_load() to authenticated;
grant execute on function public.kns_links_save(jsonb) to authenticated;
