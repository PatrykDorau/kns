-- Kod spotkania członkowskiego: meldować się można tylko z kodem, który rada podaje na miejscu (np. na rzutniku),
-- żeby nie meldować się z domu. Kod (4 cyfry) powstaje przy pierwszym odczycie obecności przez radę / administratora
-- i widzą go tylko oni. Po 5 błędnych kodach meldowanie jest zablokowane, dopóki rada nie odblokuje (event_code_reset).
-- Spotkania rady — bez kodu.
-- Uruchamiać po obecnosc.sql. Można wielokrotnie.

create table if not exists public.event_codes (
  event_id text primary key references public.events (id) on delete cascade,
  code text not null,
  created timestamptz not null default now()
);
alter table public.event_codes enable row level security;
revoke all on public.event_codes from public, anon, authenticated; -- tylko przez funkcje poniżej

create table if not exists public.event_code_tries (
  event_id text not null references public.events (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  n int not null default 0,
  primary key (event_id, person)
);
alter table public.event_code_tries enable row level security;
revoke all on public.event_code_tries from public, anon, authenticated;

-- Meldowanie z kodem. Zwraca liczbę obecnych; -1 — zły kod (próba zapisana), -2 — za dużo błędnych prób.
-- (Bez wyjątku przy złym kodzie — inaczej licznik prób cofałby się razem z wyjątkiem.)
drop function if exists public.event_checkin(text, boolean);
create or replace function public.event_checkin(eid text, on_ boolean default true, code text default null) returns int
language plpgsql security definer set search_path = public as $$
declare ev events; tries int; good text;
begin
  if not is_active() then raise exception 'Meldować się mogą zatwierdzeni członkowie.'; end if;
  select * into ev from events where id = eid;
  if ev.id is null then raise exception 'Nie ma takiego spotkania.'; end if;
  if ev.type not in ('czlonkowskie', 'rada') then raise exception 'Na tym wydarzeniu nie ma meldowania.'; end if;
  if ev.type = 'rada' and not can_run_elections() then raise exception 'Na spotkaniu rady melduje się rada.'; end if;
  if ev.date is null or current_date < ev.date or current_date > ev.date + 1 then raise exception 'Zameldować się można w dniu spotkania.'; end if;
  if on_ and ev.type = 'czlonkowskie' and not can_run_elections() then
    select n into tries from event_code_tries where event_id = eid and person = auth.uid();
    if coalesce(tries, 0) >= 5 then return -2; end if;
    select c.code into good from event_codes c where c.event_id = eid;
    if good is null or coalesce(regexp_replace(code, '\s', '', 'g'), '') <> good then
      insert into event_code_tries (event_id, person, n) values (eid, auth.uid(), 1)
        on conflict (event_id, person) do update set n = event_code_tries.n + 1;
      return -1;
    end if;
  end if;
  if on_ then insert into event_attendance (event_id, person) values (eid, auth.uid()) on conflict do nothing;
  else delete from event_attendance where event_id = eid and person = auth.uid(); end if;
  return (select count(*)::int from event_attendance where event_id = eid);
end $$;
revoke all on function public.event_checkin(text, boolean, text) from public, anon;
grant execute on function public.event_checkin(text, boolean, text) to authenticated;

-- Stan obecności jak wcześniej; rada i administrator dostają też kod spotkania członkowskiego (tworzony za pierwszym razem).
create or replace function public.event_attendance_info(eid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; total int; mine boolean; names jsonb := null; ecode text := null; etype text; blocked int := null;
begin
  if not is_active() then return null; end if;
  select count(*)::int into n from event_attendance where event_id = eid;
  select count(*)::int into total from people where status = 'active' and 'czlonek' = any (roles);
  mine := exists (select 1 from event_attendance where event_id = eid and person = auth.uid());
  if can_run_elections() then
    select coalesce(jsonb_agg(coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) order by lower(coalesce(nullif(p.name, ''), p.email))), '[]'::jsonb)
      into names from event_attendance a join people p on p.id = a.person where a.event_id = eid;
    select type into etype from events where id = eid;
    if etype = 'czlonkowskie' then
      insert into event_codes (event_id, code) values (eid, lpad((floor(random() * 10000))::int::text, 4, '0')) on conflict (event_id) do nothing;
      select c.code into ecode from event_codes c where c.event_id = eid;
      select count(*)::int into blocked from event_code_tries t where t.event_id = eid and t.n >= 5;
    end if;
  end if;
  return jsonb_build_object('count', n, 'members', total, 'me', mine, 'names', names, 'code', ecode, 'blocked', blocked);
end $$;
revoke all on function public.event_attendance_info(text) from public, anon;
grant execute on function public.event_attendance_info(text) to authenticated;

-- Rada / administrator: odblokowanie osób po błędnych kodach na tym spotkaniu.
create or replace function public.event_code_reset(eid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_run_elections() then raise exception 'Odblokować meldowanie może rada albo administrator.'; end if;
  delete from event_code_tries where event_id = eid;
end $$;
revoke all on function public.event_code_reset(text) from public, anon;
grant execute on function public.event_code_reset(text) to authenticated;
