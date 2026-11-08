-- Grafik służby, część 2 (wzór: Avenit): role w składzie (Bas, Wokal…), zaproszenia z potwierdzeniem
-- „Przyjmuję / Nie mogę”, skład na najbliższą niedzielę dla wszystkich członków i automatyczne przypomnienia.
-- Stany wpisu w grafiku: new (lider wpisał, nic nie wysłano) → sent (zaproszenie wysłane) → yes / no (odpowiedź).
-- Uruchamiać po grafik-sluzby.sql i dyspozycyjnosc.sql. Można wielokrotnie.
alter table public.ministries add column if not exists roles text[] not null default '{}';
alter table public.ministry_schedule add column if not exists role text not null default '';
-- stan: kolumna dodawana raz; wpisy sprzed tej zmiany były już rozesłane starym „Wyślij grafik” — traktujemy je jako przyjęte
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ministry_schedule' and column_name = 'state') then
    alter table public.ministry_schedule add column state text not null default 'new';
    update public.ministry_schedule set state = 'yes';
  end if;
end $$;
alter table public.ministry_schedule add column if not exists sent timestamptz;
alter table public.ministry_schedule add column if not exists answered timestamptz;
alter table public.ministry_schedule add column if not exists ask_reminded timestamptz;  -- „czekamy na odpowiedź”
alter table public.ministry_schedule add column if not exists day_reminded timestamptz;  -- „w niedzielę służysz”
do $$ begin
  alter table public.ministry_schedule add constraint ministry_schedule_state check (state in ('new', 'sent', 'yes', 'no'));
exception when duplicate_object then null; end $$;

-- lider: role w służbie (kolejność = kolumny grafiku)
create or replace function public.ministry_set_roles(mid text, r text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_ministry_leader(mid) then raise exception 'Role ustala lider służby.'; end if;
  update ministries set roles = (select coalesce(array_agg(distinct_r order by ord), '{}') from (
      select distinct on (lower(btrim(x))) left(btrim(x), 40) as distinct_r, ord from unnest(coalesce(r, '{}')) with ordinality as t(x, ord)
      where btrim(x) <> '' order by lower(btrim(x)), ord) q), updated = now()
  where id = mid;
end $$;

-- lider: rola osoby w danej niedzieli (osoba musi być już w grafiku)
create or replace function public.schedule_role(mid text, d date, who uuid, r text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_ministry_leader(mid) then raise exception 'Grafik układa lider służby.'; end if;
  update ministry_schedule set role = left(btrim(coalesce(r, '')), 40) where ministry_id = mid and day = d and person = who;
  if not found then raise exception 'Tej osoby nie ma w grafiku na ten dzień.'; end if;
end $$;

-- lider: wyślij zaproszenia — każdy dostaje swoje nowe niedziele; wpisy przechodzą w „czeka na odpowiedź”
create or replace function public.schedule_publish(mid text) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare m ministries; r record; n int := 0;
begin
  if not is_ministry_leader(mid) then raise exception 'Grafik wysyła lider służby.'; end if;
  select * into m from ministries where id = mid;
  for r in select s.person, string_agg(to_char(s.day, 'DD.MM') || case when s.role <> '' then ' (' || s.role || ')' else '' end, ', ' order by s.day) as days
           from ministry_schedule s where s.ministry_id = mid and s.state = 'new' and s.day >= (now() at time zone 'Europe/Warsaw')::date group by s.person loop
    perform inbox_add(array[r.person], 'Zaproszenie do służby: ' || m.name, 'Niedziele: ' || r.days || '. Potwierdź w aplikacji — Przyjmuję albo Nie mogę.', './?sluzby=moja');
    n := n + 1;
  end loop;
  update ministry_schedule set state = 'sent', sent = now()
  where ministry_id = mid and state = 'new' and day >= (now() at time zone 'Europe/Warsaw')::date;
  return n;
end $$;

-- osoba z grafiku: odpowiedź na zaproszenie (też zmiana zdania). „Nie mogę” — dzwonek u liderów służby.
create or replace function public.schedule_answer(mid text, d date, ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m ministries; who text;
begin
  update ministry_schedule set state = case when ok then 'yes' else 'no' end, answered = now()
  where ministry_id = mid and day = d and person = auth.uid() and state <> 'new' and day >= (now() at time zone 'Europe/Warsaw')::date;
  if not found then raise exception 'Nie ma takiego zaproszenia.'; end if;
  -- dyspozycyjność zgodna z odpowiedzią (tabela „kto kiedy może”)
  insert into ministry_availability (ministry_id, person, day, state) values (mid, auth.uid(), d, case when ok then 'yes' else 'no' end)
  on conflict (ministry_id, person, day) do update set state = excluded.state, updated = now();
  if not ok then
    select * into m from ministries where id = mid;
    select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) into who from people p where p.id = auth.uid();
    perform inbox_add(m.leader_ids, m.name || ': ' || who || ' nie może ' || to_char(d, 'DD.MM'), 'Odpowiedź na zaproszenie do służby. Znajdź zastępstwo w grafiku.', './?sluzby=moja');
  end if;
end $$;

-- moje zaproszenia i służby (od dziś): na Start i do „Moja służba”
create or replace function public.my_duties() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'day', s.day, 'role', s.role, 'state', s.state) order by s.day, m.sort, m.name), '[]'::jsonb)
  from ministry_schedule s join ministries m on m.id = s.ministry_id
  where s.person = auth.uid() and s.state <> 'new' and s.day >= (now() at time zone 'Europe/Warsaw')::date
    and s.day < (now() at time zone 'Europe/Warsaw')::date + 63
$$;

-- skład na najbliższą niedzielę (dziś, jeśli niedziela): służby → osoby z rolą i stanem. Dla zatwierdzonych członków.
create or replace function public.sunday_lineup() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if not is_active() then return null; end if;
  d := d + ((7 - extract(dow from d)::int) % 7);
  return jsonb_build_object('day', d, 'ministries', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'people', (
      select jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'role', s.role, 'state', s.state, 'me', p.id = auth.uid())
        order by array_position(m.roles, nullif(s.role, '')) nulls last, p.name)
      from ministry_schedule s join people p on p.id = s.person where s.ministry_id = m.id and s.day = d and s.state <> 'new'))
    order by m.sort, m.name)
    from ministries m where exists (select 1 from ministry_schedule s where s.ministry_id = m.id and s.day = d and s.state <> 'new')), '[]'::jsonb));
end $$;

-- grafik w tablicy dyspozycyjności: dodatkowo role służby i szczegóły wpisów (dzień → osoba → {state, role})
create or replace function public.availability_board(weeks integer default 9) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare days date[] := next_sundays(weeks);
begin
  if not is_active() then raise exception 'Dyspozycyjność jest dla zatwierdzonych członków.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'days', to_jsonb(days), 'you', auth.uid(), 'roles', to_jsonb(m.roles),
      'member', exists (select 1 from ministry_members x where x.ministry_id = m.id and x.person = auth.uid() and x.status = 'active'),
      'lead', is_ministry_leader(m.id),
      'mine', coalesce((select jsonb_object_agg(a.day, a.state) from ministry_availability a
                 where a.ministry_id = m.id and a.person = auth.uid() and a.day = any (days)), '{}'::jsonb),
      'plan', coalesce((select jsonb_object_agg(s.day, s.people) from (select day, jsonb_agg(person) as people from ministry_schedule
                 where ministry_id = m.id and day = any (days) group by day) s), '{}'::jsonb),
      'detail', coalesce((select jsonb_object_agg(s.day, s.people) from (select day, jsonb_object_agg(person, jsonb_build_object('state', state, 'role', role)) as people
                 from ministry_schedule where ministry_id = m.id and day = any (days) group by day) s), '{}'::jsonb),
      'people', case when is_ministry_leader(m.id) or exists (select 1 from ministry_members x where x.ministry_id = m.id and x.person = auth.uid() and x.status = 'active') then coalesce((select jsonb_agg(jsonb_build_object(
                    'id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)),
                    'states', coalesce((select jsonb_object_agg(a.day, a.state) from ministry_availability a
                                where a.ministry_id = m.id and a.person = p.id and a.day = any (days)), '{}'::jsonb)) order by p.name)
                  from ministry_members x join people p on p.id = x.person where x.ministry_id = m.id and x.status = 'active'), '[]'::jsonb)
                  else '[]'::jsonb end
    ) order by m.sort, m.name)
    from ministries m
    where is_ministry_leader(m.id) or exists (select 1 from ministry_members x where x.ministry_id = m.id and x.person = auth.uid() and x.status = 'active')), '[]'::jsonb);
end $function$;

-- Codziennie (funkcja Netlify „przypomnienia”, bez logowania — nic nie dubluje):
--   • przyjęta służba za 1–2 dni → „W niedzielę służysz…” (raz);
--   • zaproszenie bez odpowiedzi od 2 dni → „Czekamy na Twoją odpowiedź” (raz).
create or replace function public.schedule_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/Warsaw')::date; r record; n int := 0;
begin
  for r in select s.ministry_id, s.day, s.person, s.role, m.name from ministry_schedule s join ministries m on m.id = s.ministry_id
           where s.state = 'yes' and s.day_reminded is null and s.day between today + 1 and today + 2 loop
    perform inbox_add(array[r.person], 'W niedzielę służysz: ' || r.name, to_char(r.day, 'DD.MM') || case when r.role <> '' then ' · ' || r.role else '' end || '. Dziękujemy!', './?sluzby=moja');
    update ministry_schedule set day_reminded = now() where ministry_id = r.ministry_id and day = r.day and person = r.person;
    n := n + 1;
  end loop;
  for r in select s.ministry_id, s.day, s.person, m.name from ministry_schedule s join ministries m on m.id = s.ministry_id
           where s.state = 'sent' and s.ask_reminded is null and s.sent < now() - interval '2 days' and s.day >= today loop
    perform inbox_add(array[r.person], 'Czekamy na odpowiedź: ' || r.name, 'Zaproszenie do służby na ' || to_char(r.day, 'DD.MM') || '. Przyjmuję albo Nie mogę — w aplikacji.', './?sluzby=moja');
    update ministry_schedule set ask_reminded = now() where ministry_id = r.ministry_id and day = r.day and person = r.person;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.ministry_set_roles(text, text[]), public.schedule_role(text, date, uuid, text), public.schedule_publish(text),
  public.schedule_answer(text, date, boolean), public.my_duties(), public.sunday_lineup(), public.availability_board(integer) from public, anon;
grant execute on function public.ministry_set_roles(text, text[]), public.schedule_role(text, date, uuid, text), public.schedule_publish(text),
  public.schedule_answer(text, date, boolean), public.my_duties(), public.sunday_lineup(), public.availability_board(integer) to authenticated;
revoke all on function public.schedule_reminders() from public;
grant execute on function public.schedule_reminders() to anon, authenticated;
