-- Tłumaczenie na żywo (wzór: Avenit, bez serwera mediów): tłumacz nadaje z przeglądarki prosto do telefonów słuchaczy
-- (WebRTC); baza trzyma tylko listę kanałów, które właśnie nadają (język, nazwa, liczba słuchaczy).
-- Słuchacz bez konta (strona /sluchaj.html z kodu QR) widzi kanały na żywo — tylko język i liczbę słuchaczy.
-- Nadawać mogą: osoby z prawem edycji, liderzy służb i członkowie służby oznaczonej jako tłumacze.
-- Uruchamiać po sluzby.sql, sluzby2.sql. Można wielokrotnie.
alter table public.ministries add column if not exists translate boolean not null default false;
create table if not exists public.translation_sessions (
  id text primary key default gen_random_uuid()::text,
  lang text not null,
  name text not null,
  translator uuid not null default auth.uid() references public.people (id) on delete cascade,
  started timestamptz not null default now(),
  seen timestamptz not null default now(),
  ended timestamptz,
  listeners int not null default 0
);
alter table public.translation_sessions enable row level security;
revoke all on public.translation_sessions from anon, authenticated;

create or replace function public.tl_can() returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and (has_flag('edit') or has_flag('manage') or leads_any_ministry() or exists (select 1 from ministries m where m.translate and in_ministry(m.id)))
$$;

create or replace function public.tl_start(l text, nm text) returns text
language plpgsql security definer set search_path = public as $$
declare sid text;
begin
  if not tl_can() then raise exception 'Nadają tłumacze (członkowie służby tłumaczy) albo liderzy.'; end if;
  if btrim(coalesce(l, '')) !~ '^[A-Za-z]{2,3}$' then raise exception 'Kod języka: 2–3 litery, np. EN.'; end if;
  update translation_sessions set ended = now() where translator = auth.uid() and ended is null;
  insert into translation_sessions (lang, name) values (upper(btrim(l)), left(btrim(coalesce(nullif(nm, ''), upper(l))), 40)) returning id into sid;
  return sid;
end $$;

-- co 15 s od tłumacza: wciąż nadaje, ilu słucha
create or replace function public.tl_ping(sid text, n int) returns void
language sql security definer set search_path = public as $$
  update translation_sessions set seen = now(), listeners = greatest(0, least(coalesce(n, 0), 10000)) where id = sid and translator = auth.uid() and ended is null
$$;
create or replace function public.tl_stop(sid text) returns void
language sql security definer set search_path = public as $$
  update translation_sessions set ended = now() where id = sid and (translator = auth.uid() or has_flag('manage')) and ended is null
$$;

-- kanały na żywo (także dla słuchaczy bez konta): bez danych tłumacza
create or replace function public.tl_live() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'lang', lang, 'name', name, 'listeners', listeners) order by lang), '[]'::jsonb)
  from translation_sessions where ended is null and seen > now() - interval '45 seconds'
$$;

-- dla strony tłumacza: czy mogę nadawać, która służba to tłumacze (administrator)
create or replace function public.tl_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('can', tl_can(), 'manage', has_flag('manage'),
    'ministries', case when has_flag('manage') then (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'on', translate) order by sort, name), '[]'::jsonb) from ministries) end)
$$;
create or replace function public.tl_ministry_set(mid text, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_flag('manage') then raise exception 'Ustawia administrator.'; end if;
  update ministries set translate = coalesce(on_, false) where id = mid;
end $$;

revoke all on function public.tl_can() from public, anon, authenticated;
revoke all on function public.tl_start(text, text), public.tl_ping(text, int), public.tl_stop(text), public.tl_info(), public.tl_ministry_set(text, boolean), public.tl_live() from public, anon;
grant execute on function public.tl_start(text, text), public.tl_ping(text, int), public.tl_stop(text), public.tl_info(), public.tl_ministry_set(text, boolean), public.tl_live() to authenticated;
grant execute on function public.tl_live() to anon;
