-- Mapa KNS: kto z kościoła mieszka na którym osiedlu Poznania albo w której gminie wokół (bez adresów — tylko osiedle
-- albo miejscowość i podpis, np. „Patryk i Wiktoria Dorau”). Widzą tylko zalogowani członkowie. Każdy sam dodaje,
-- zmienia i usuwa swój wpis (owners — wspólny wpis pary); administrator może poprawić każdy. Można uruchomić ponownie.

create table if not exists public.kns_map (
  id text primary key default 'm-' || left(md5(random()::text || clock_timestamp()::text), 12),
  label text not null,
  area text not null,                  -- 'pz:<osiedle>' albo 'gm:<gmina>' (kształty: web/src/data/mapa-kns.json)
  place text not null default '',      -- miejscowość / część osiedla (opcjonalnie)
  owners uuid[] not null default '{}', -- kto może zmieniać (osoba albo para)
  source text not null default 'sam',  -- 'sam' — dopisany w aplikacji, 'lista' — z listy członków
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
do $$ begin
  alter table public.kns_map add constraint kns_map_area check (area ~ '^(pz|gm):.{2,60}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.kns_map add constraint kns_map_label check (length(trim(label)) between 2 and 80);
exception when duplicate_object then null; end $$;

alter table public.kns_map enable row level security;
revoke all on public.kns_map from public, anon, authenticated;
grant select, update, delete on public.kns_map to authenticated;
drop policy if exists kns_map_read on public.kns_map;
drop policy if exists kns_map_edit on public.kns_map;
drop policy if exists kns_map_remove on public.kns_map;
create policy kns_map_read on public.kns_map for select to authenticated using (is_active());
create policy kns_map_edit on public.kns_map for update to authenticated
  using (is_active() and (auth.uid() = any (owners) or has_flag('manage'))) with check (is_active() and (auth.uid() = any (owners) or has_flag('manage')));
create policy kns_map_remove on public.kns_map for delete to authenticated using (is_active() and (auth.uid() = any (owners) or has_flag('manage')));

-- mój wpis: zmiana istniejącego (gdzie jestem właścicielem) albo nowy
create or replace function public.kns_map_me(lbl text, ar text, pl text) returns text
language plpgsql security definer set search_path = public as $$
declare mid text;
begin
  if not is_active() then raise exception 'Tylko dla członków.'; end if;
  if length(trim(coalesce(lbl, ''))) < 2 then raise exception 'Wpisz podpis, np. imię i nazwisko.'; end if;
  if coalesce(ar, '') !~ '^(pz|gm):.{2,60}$' then raise exception 'Wybierz osiedle albo miejscowość.'; end if;
  select id into mid from kns_map where auth.uid() = any (owners) order by updated desc limit 1;
  if mid is null then
    insert into kns_map (label, area, place, owners, source) values (left(trim(lbl), 80), ar, left(trim(coalesce(pl, '')), 80), array[auth.uid()], 'sam') returning id into mid;
  else
    update kns_map set label = left(trim(lbl), 80), area = ar, place = left(trim(coalesce(pl, '')), 80), updated = now() where id = mid;
  end if;
  return mid;
end $$;
revoke all on function public.kns_map_me(text, text, text) from public, anon;
grant execute on function public.kns_map_me(text, text, text) to authenticated;
