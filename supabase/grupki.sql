-- Grupki domowe na Mapie KNS: każda grupka ma osiedle Poznania albo gminę (bez adresu), dzień i godzinę spotkań
-- oraz prowadzących. Grupkę dodaje sam prowadzący (zostaje jej prowadzącym), może dopisać współprowadzących spośród
-- uczestników. Uczestnicy klikają „Chodzę tu” — to ustawia pole „Grupka” w ich profilu (people.grupa), więc lista
-- uczestników i powiadamianie całej grupki działają na tym samym polu. Widzą tylko zalogowani członkowie.
-- Uruchamiać po profil.sql. Można uruchomić ponownie.

create table if not exists public.kns_groups (
  id text primary key default 'g-' || left(md5(random()::text || clock_timestamp()::text), 12),
  name text not null,
  area text not null,                   -- 'pz:<osiedle>' albo 'gm:<gmina>' (jak w kns_map)
  place text not null default '',       -- część osiedla / miejscowość (opcjonalnie)
  day text not null default '',         -- np. 'wtorek', 'co drugi czwartek'
  time text not null default '',        -- np. '19:00'
  leaders uuid[] not null default '{}', -- prowadzący (mogą zmieniać grupkę)
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
do $$ begin
  alter table public.kns_groups add constraint kns_groups_area check (area ~ '^(pz|gm):.{2,60}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.kns_groups add constraint kns_groups_name check (length(trim(name)) between 2 and 60);
exception when duplicate_object then null; end $$;
create unique index if not exists kns_groups_name_u on public.kns_groups (lower(name));

-- tabela tylko przez funkcje (uczestnicy i nazwiska prowadzących pochodzą z people)
alter table public.kns_groups enable row level security;
revoke all on public.kns_groups from public, anon, authenticated;

create or replace function public.kns_group_can(g public.kns_groups) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and (auth.uid() = any (g.leaders) or has_flag('manage'))
$$;
revoke all on function public.kns_group_can(public.kns_groups) from public, anon, authenticated;

create or replace function public.kns_groups_load() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_active() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'area', g.area, 'place', g.place, 'day', g.day, 'time', g.time,
      'leaders', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))) order by array_position(g.leaders, p.id))
                  from people p where p.id = any (g.leaders) and p.status = 'active'), '[]'::jsonb),
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))) order by lower(coalesce(nullif(p.name, ''), p.email)))
                  from people p where p.status = 'active' and lower(p.grupa) = lower(g.name)), '[]'::jsonb),
      'lead', auth.uid() = any (g.leaders), 'can', kns_group_can(g),
      'mine', exists (select 1 from people p where p.id = auth.uid() and lower(p.grupa) = lower(g.name))
    ) order by lower(g.name))
    from kns_groups g), '[]'::jsonb);
end $$;

-- nowa grupka (gid pusty — dodający zostaje prowadzącym) albo zmiana istniejącej (prowadzący lub zarządzający)
create or replace function public.kns_group_save(gid text, nm text, ar text, pl text, dy text, tm text, ldrs uuid[]) returns text
language plpgsql security definer set search_path = public as $$
declare g kns_groups; old text; ls uuid[];
begin
  if not is_active() then raise exception 'Tylko dla członków.'; end if;
  if length(trim(coalesce(nm, ''))) < 2 then raise exception 'Wpisz nazwę grupki.'; end if;
  if coalesce(ar, '') !~ '^(pz|gm):.{2,60}$' then raise exception 'Wybierz osiedle albo gminę.'; end if;
  if exists (select 1 from kns_groups where lower(name) = lower(trim(nm)) and id <> coalesce(gid, '')) then
    raise exception 'Grupka o tej nazwie już jest.'; end if;
  if coalesce(gid, '') = '' then
    insert into kns_groups (name, area, place, day, time, leaders)
    values (left(trim(nm), 60), ar, left(trim(coalesce(pl, '')), 80), left(trim(coalesce(dy, '')), 40), left(trim(coalesce(tm, '')), 20), array[auth.uid()])
    returning id into gid;
    -- prowadzący chodzi do swojej grupki
    update people set grupa = left(trim(nm), 60) where id = auth.uid();
    return gid;
  end if;
  select * into g from kns_groups where id = gid;
  if g.id is null then raise exception 'Nie ma takiej grupki.'; end if;
  if not kns_group_can(g) then raise exception 'Grupkę zmieniają jej prowadzący.'; end if;
  -- prowadzący: tylko aktywni członkowie, bez powtórzeń; co najmniej jeden
  select coalesce(array_agg(x order by o), '{}') into ls from (
    select distinct on (x) x, o from unnest(coalesce(ldrs, g.leaders)) with ordinality u(x, o)
    where exists (select 1 from people p where p.id = x and p.status = 'active') order by x, o) s;
  if cardinality(ls) = 0 then raise exception 'Grupka musi mieć prowadzącego.'; end if;
  old := g.name;
  update kns_groups set name = left(trim(nm), 60), area = ar, place = left(trim(coalesce(pl, '')), 80),
    day = left(trim(coalesce(dy, '')), 40), time = left(trim(coalesce(tm, '')), 20), leaders = ls, updated = now() where id = gid;
  -- zmiana nazwy: uczestnicy zostają w grupce
  if lower(old) <> lower(trim(nm)) then update people set grupa = left(trim(nm), 60) where lower(grupa) = lower(old); end if;
  return gid;
end $$;

create or replace function public.kns_group_delete(gid text) returns void
language plpgsql security definer set search_path = public as $$
declare g kns_groups;
begin
  select * into g from kns_groups where id = gid;
  if g.id is null then return; end if;
  if not kns_group_can(g) then raise exception 'Grupkę usuwają jej prowadzący.'; end if;
  delete from kns_groups where id = gid;
  update people set grupa = '' where lower(grupa) = lower(g.name);
end $$;

-- „Chodzę tu” / „Nie chodzę” — pole Grupka w moim profilu
create or replace function public.kns_group_join(gid text, joining boolean) returns void
language plpgsql security definer set search_path = public as $$
declare g kns_groups;
begin
  if not is_active() then raise exception 'Tylko dla członków.'; end if;
  select * into g from kns_groups where id = gid;
  if g.id is null then raise exception 'Nie ma takiej grupki.'; end if;
  if joining then update people set grupa = g.name where id = auth.uid();
  else
    if auth.uid() = any (g.leaders) and cardinality(g.leaders) = 1 then raise exception 'Jesteś jedynym prowadzącym — najpierw dopisz innego prowadzącego albo usuń grupkę.'; end if;
    update kns_groups set leaders = array_remove(leaders, auth.uid()) where id = gid;
    update people set grupa = '' where id = auth.uid() and lower(grupa) = lower(g.name);
  end if;
end $$;

-- podpowiedzi grupek w profilu: także grupki z mapy
create or replace function public.group_names() returns setof text
language sql stable security definer set search_path = public as $$
  select n from (
    select grupa n from people where status = 'active' and grupa <> ''
    union select name from kns_groups) s
  where is_active() order by 1
$$;

revoke all on function public.kns_groups_load() from public, anon;
revoke all on function public.kns_group_save(text, text, text, text, text, text, uuid[]) from public, anon;
revoke all on function public.kns_group_delete(text) from public, anon;
revoke all on function public.kns_group_join(text, boolean) from public, anon;
revoke all on function public.group_names() from public, anon;
grant execute on function public.kns_groups_load() to authenticated;
grant execute on function public.kns_group_save(text, text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.kns_group_delete(text) to authenticated;
grant execute on function public.kns_group_join(text, boolean) to authenticated;
grant execute on function public.group_names() to authenticated;
