-- Obecność na spotkaniach (meldowanie się): członek melduje się na spotkaniu członkowskim albo rady w dniu
-- spotkania (także dzień później — gdy spotkanie skończy się po północy); widać, ilu członków było (z wszystkich
-- zatwierdzonych), a rada, pastor i administrator — także kto. Uruchamiać po kalendarz.sql i wybory.sql. Można wielokrotnie.

create table if not exists public.event_attendance (
  event_id text not null references public.events (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (event_id, person)
);
alter table public.event_attendance enable row level security;
revoke all on public.event_attendance from anon, authenticated; -- tylko przez funkcje poniżej

-- Meldowanie (on = false — wycofanie). Tylko zatwierdzeni członkowie, tylko spotkania z obecnością, tylko w dniu spotkania.
create or replace function public.event_checkin(eid text, on_ boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare ev events;
begin
  if not is_active() then raise exception 'Meldować się mogą zatwierdzeni członkowie.'; end if;
  select * into ev from events where id = eid;
  if ev.id is null then raise exception 'Nie ma takiego spotkania.'; end if;
  if ev.type not in ('czlonkowskie', 'rada') then raise exception 'Na tym wydarzeniu nie ma meldowania.'; end if;
  if ev.type = 'rada' and not can_run_elections() then raise exception 'Na spotkaniu rady melduje się rada.'; end if;
  if ev.date is null or current_date < ev.date or current_date > ev.date + 1 then raise exception 'Zameldować się można w dniu spotkania.'; end if;
  if on_ then insert into event_attendance (event_id, person) values (eid, auth.uid()) on conflict do nothing;
  else delete from event_attendance where event_id = eid and person = auth.uid(); end if;
  return (select count(*)::int from event_attendance where event_id = eid);
end $$;
revoke all on function public.event_checkin(text, boolean) from public, anon;
grant execute on function public.event_checkin(text, boolean) to authenticated;

-- Stan obecności: ilu obecnych, ilu członków w ogóle (z rangą członka), czy ja; lista nazwisk — tylko rada i administrator.
create or replace function public.event_attendance_info(eid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; total int; mine boolean; names jsonb := null;
begin
  if not is_active() then return null; end if;
  select count(*)::int into n from event_attendance where event_id = eid;
  select count(*)::int into total from people where status = 'active' and 'czlonek' = any (roles);
  mine := exists (select 1 from event_attendance where event_id = eid and person = auth.uid());
  if can_run_elections() then
    select coalesce(jsonb_agg(coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) order by lower(coalesce(nullif(p.name, ''), p.email))), '[]'::jsonb)
      into names from event_attendance a join people p on p.id = a.person where a.event_id = eid;
  end if;
  return jsonb_build_object('count', n, 'members', total, 'me', mine, 'names', names);
end $$;
revoke all on function public.event_attendance_info(text) from public, anon;
grant execute on function public.event_attendance_info(text) to authenticated;
