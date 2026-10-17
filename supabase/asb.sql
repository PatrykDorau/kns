-- ASB: grafik spotkań studenckich (dawniej arkusz „ASB | GRAFIK”) i lista pomysłów na spotkania.
-- Widzą i zmieniają osoby z rangą „ASB” oraz administrator. Uruchamiaj po schema.sql.
insert into public.ranks (id, name, can_edit, council, protocols, manage, sort) values ('asb', 'ASB', false, false, false, false, 9)
on conflict (id) do nothing;

create table if not exists public.asb_meetings (
  id text primary key,
  season text not null,                 -- rok akademicki, np. '2026/2027'
  sort int not null default 0,          -- kolejność w grafiku (także dla wierszy bez daty)
  month text not null default '',       -- np. 'PAŹDZIERNIK', 'LIPIEC (?)'
  date date,
  concept text not null default '',     -- „Co i po co robimy” (koncepcja okresu)
  leader text not null default '',      -- prowadzący
  helper text not null default '',      -- prowadzący pomocniczy
  topic text not null default '',
  place text not null default '',
  attendance int,                       -- frekwencja
  int_date text not null default '',    -- integracje i notatki: data, organizator, pomysł
  int_organizer text not null default '',
  int_idea text not null default '',
  updated timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists asb_meetings_season on public.asb_meetings (season, sort);
create table if not exists public.asb_ideas (
  id text primary key,
  author text not null default '',
  topic text not null,
  created timestamptz not null default now()
);

create or replace function public.is_asb() returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('manage') or exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'asb' = any (p.roles))
$$;
revoke all on function public.is_asb() from public, anon;
grant execute on function public.is_asb() to authenticated;

alter table public.asb_meetings enable row level security;
alter table public.asb_ideas enable row level security;
revoke all on public.asb_meetings, public.asb_ideas from anon, authenticated;
grant select, insert, update, delete on public.asb_meetings, public.asb_ideas to authenticated;
drop policy if exists asb_meetings_all on public.asb_meetings;
drop policy if exists asb_ideas_all on public.asb_ideas;
create policy asb_meetings_all on public.asb_meetings for all to authenticated using (is_asb()) with check (is_asb());
create policy asb_ideas_all on public.asb_ideas for all to authenticated using (is_asb()) with check (is_asb());
