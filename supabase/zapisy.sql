-- Zapisy na wydarzenia. Ustawienia zapisów są w danych wydarzenia (data.signup):
--   { enabled: true, max: 30 (puste = bez limitu), kids: true (można zapisać dzieci), approval: true (twórca
--     zatwierdza), until: '2026-11-20' (zapisy do tego dnia włącznie; puste = do dnia wydarzenia) }
-- Limit liczy wszystkie osoby (dorośli + dzieci). Gdy miejsc brakuje — lista rezerwowa; gdy ktoś się wypisze,
-- pierwsi z rezerwy wchodzą sami (bez zatwierdzania) albo czekają na twórcę (z zatwierdzaniem).
-- Zapisami zarządza twórca wydarzenia albo osoba z prawem edycji. Uruchamiaj po skrzynka.sql.
create table if not exists public.event_signups (
  event_id text not null references public.events (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  adults int not null default 1 check (adults between 0 and 20),
  children int not null default 0 check (children between 0 and 20),
  note text not null default '',
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'reserve')),
  created timestamptz not null default now(),
  primary key (event_id, person),
  check (adults + children > 0)
);
alter table public.event_signups enable row level security;
revoke all on public.event_signups from anon, authenticated;

-- Wewnętrzne: ustawienia zapisów, zajęte miejsca, prawo zarządzania.
create or replace function public.signup_conf(eid text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(e.data -> 'signup', '{}'::jsonb) || jsonb_build_object('date', e.date, 'title', coalesce(nullif(e.data ->> 'title', ''), 'Wydarzenie'), 'created_by', e.created_by)
  from events e where e.id = eid and e.status = 'published'
$$;
create or replace function public.signup_taken(eid text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(adults + children), 0)::int from event_signups where event_id = eid and status = 'confirmed'
$$;
create or replace function public.signup_manager(eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and (has_flag('edit') or exists (select 1 from events e where e.id = eid and e.created_by = auth.uid()))
$$;
create or replace function public.signup_limit(conf jsonb) returns int
language sql immutable as $$ select nullif(nullif(conf ->> 'max', ''), '0')::int $$;

-- Rezerwa → potwierdzeni, póki są miejsca (tylko zapisy bez zatwierdzania). Zwraca przeniesione osoby.
create or replace function public.signup_promote(eid text) returns void
language plpgsql security definer set search_path = public as $$
declare conf jsonb := signup_conf(eid); lim int := signup_limit(signup_conf(eid)); r record;
begin
  if conf is null or coalesce((conf ->> 'approval')::boolean, false) then return; end if;
  for r in select * from event_signups where event_id = eid and status = 'reserve' order by created loop
    exit when lim is not null and signup_taken(eid) + r.adults + r.children > lim;
    update event_signups set status = 'confirmed' where event_id = eid and person = r.person;
    perform inbox_add(array[r.person], 'Masz miejsce: ' || (conf ->> 'title'), 'Zwolniło się miejsce — jesteś na liście uczestników.', './?wydarzenie=' || eid);
  end loop;
end $$;

-- Stan zapisów dla zalogowanego: miejsca, moje zgłoszenie; zarządzającemu — lista osób.
create or replace function public.signup_board(eid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare conf jsonb := signup_conf(eid); mine record;
begin
  if not is_active() then raise exception 'Zapisy są dla zatwierdzonych członków.'; end if;
  if conf is null or not coalesce((conf ->> 'enabled')::boolean, false) then return null; end if;
  select * into mine from event_signups where event_id = eid and person = auth.uid();
  return jsonb_build_object(
    'max', signup_limit(conf), 'kids', coalesce((conf ->> 'kids')::boolean, false), 'approval', coalesce((conf ->> 'approval')::boolean, false),
    'until', coalesce(nullif(conf ->> 'until', ''), conf ->> 'date'),
    'open', coalesce(nullif(conf ->> 'until', ''), conf ->> 'date') is null or coalesce(nullif(conf ->> 'until', ''), conf ->> 'date')::date >= (now() at time zone 'Europe/Warsaw')::date,
    'taken', signup_taken(eid),
    'reserve', (select coalesce(sum(adults + children), 0)::int from event_signups where event_id = eid and status = 'reserve'),
    'pending', (select coalesce(sum(adults + children), 0)::int from event_signups where event_id = eid and status = 'pending'),
    'mine', case when mine.person is null then null else jsonb_build_object('status', mine.status, 'adults', mine.adults, 'children', mine.children, 'note', mine.note) end,
    'manage', signup_manager(eid),
    'list', case when signup_manager(eid) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)),
                   'grupa', p.grupa, 'adults', s.adults, 'children', s.children, 'note', s.note, 'status', s.status, 'created', s.created) order by s.created)
                 from event_signups s join people p on p.id = s.person where s.event_id = eid), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Zapis (albo zmiana liczby osób). Bez zatwierdzania: od razu na listę albo do rezerwy; z zatwierdzaniem — czeka.
create or replace function public.signup_join(eid text, new_adults int, new_children int, new_note text) returns text
language plpgsql security definer set search_path = public as $$
declare conf jsonb := signup_conf(eid); lim int; seats int; old record; st text; until date;
begin
  if not is_active() then raise exception 'Zapisy są dla zatwierdzonych członków.'; end if;
  if conf is null or not coalesce((conf ->> 'enabled')::boolean, false) then raise exception 'Na to wydarzenie nie ma zapisów.'; end if;
  until := coalesce(nullif(conf ->> 'until', ''), conf ->> 'date')::date;
  if until is not null and until < (now() at time zone 'Europe/Warsaw')::date then raise exception 'Zapisy są już zamknięte.'; end if;
  if not coalesce((conf ->> 'kids')::boolean, false) then new_children := 0; end if;
  seats := coalesce(new_adults, 0) + coalesce(new_children, 0);
  if seats < 1 then raise exception 'Zapisz co najmniej jedną osobę.'; end if;
  lim := signup_limit(conf);
  select * into old from event_signups where event_id = eid and person = auth.uid();
  if coalesce((conf ->> 'approval')::boolean, false) then
    st := case when old.status = 'confirmed' and old.adults + old.children >= seats then 'confirmed' else 'pending' end;
  else
    st := case when lim is null or signup_taken(eid) - coalesce(case when old.status = 'confirmed' then old.adults + old.children end, 0) + seats <= lim then 'confirmed' else 'reserve' end;
  end if;
  insert into event_signups (event_id, person, adults, children, note, status) values (eid, auth.uid(), new_adults, new_children, left(coalesce(new_note, ''), 300), st)
  on conflict (event_id, person) do update set adults = excluded.adults, children = excluded.children, note = excluded.note, status = excluded.status,
    created = case when event_signups.status = excluded.status then event_signups.created else now() end;
  if st = 'pending' and old.person is null then
    perform inbox_add(array_remove(array[(conf ->> 'created_by')::uuid], null) || array(select p.id from people p join ranks r on r.id = any (p.roles) where (conf ->> 'created_by') is null and p.status = 'active' and r.manage),
      'Zapis do zatwierdzenia: ' || (conf ->> 'title'),
      (select coalesce(nullif(name, ''), split_part(email, '@', 1)) from people where id = auth.uid()) || ' — ' || seats || ' ' || case when seats = 1 then 'osoba' else 'osoby' end,
      './?wydarzenie=' || eid);
  end if;
  perform signup_promote(eid);
  return st;
end $$;

-- Wypisanie się (zwalnia miejsce — wchodzi ktoś z rezerwy).
create or replace function public.signup_leave(eid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from event_signups where event_id = eid and person = auth.uid();
  perform signup_promote(eid);
end $$;

-- Twórca wydarzenia albo osoba z prawem edycji: potwierdzenie (gdy brak miejsc — rezerwa), rezerwa, usunięcie.
create or replace function public.signup_decide(eid text, who uuid, decision text) returns text
language plpgsql security definer set search_path = public as $$
declare conf jsonb := signup_conf(eid); lim int := signup_limit(signup_conf(eid)); s record; st text;
begin
  if not signup_manager(eid) then raise exception 'Zapisami zarządza twórca wydarzenia albo osoba z prawem edycji.'; end if;
  select * into s from event_signups where event_id = eid and person = who;
  if s.person is null then raise exception 'Tej osoby nie ma na liście.'; end if;
  if decision = 'remove' then
    delete from event_signups where event_id = eid and person = who;
    perform inbox_add(array[who], 'Zapis: ' || (conf ->> 'title'), 'Twój zapis nie został przyjęty.', './?wydarzenie=' || eid);
    perform signup_promote(eid);
    return 'removed';
  end if;
  if decision = 'confirm' then
    st := case when s.status = 'confirmed' or lim is null or signup_taken(eid) + s.adults + s.children <= lim then 'confirmed' else 'reserve' end;
  elsif decision = 'reserve' then st := 'reserve';
  else raise exception 'Nieznana decyzja.'; end if;
  update event_signups set status = st where event_id = eid and person = who;
  if st is distinct from s.status then
    perform inbox_add(array[who], 'Zapis: ' || (conf ->> 'title'),
      case when st = 'confirmed' then 'Zapis potwierdzony — jesteś na liście uczestników.' else 'Jesteś na liście rezerwowej — damy znać, gdy zwolni się miejsce.' end,
      './?wydarzenie=' || eid);
  end if;
  return st;
end $$;

revoke all on function public.signup_conf(text), public.signup_taken(text), public.signup_manager(text), public.signup_promote(text) from public, anon, authenticated;
revoke all on function public.signup_board(text), public.signup_join(text, int, int, text), public.signup_leave(text), public.signup_decide(text, uuid, text) from public, anon;
grant execute on function public.signup_board(text), public.signup_join(text, int, int, text), public.signup_leave(text), public.signup_decide(text, uuid, text) to authenticated;
