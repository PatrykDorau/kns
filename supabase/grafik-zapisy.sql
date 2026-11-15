-- Grafik służby, część 3: samodzielne zapisy. Lider włącza w służbie „Członkowie sami zapisują się do grafiku” —
-- wtedy członek służby sam dopisuje się na niedzielę (od razu „przyjął”, bez zaproszenia; z rolą, jeśli służba ma role)
-- i sam może się wypisać. Lider dostaje powiadomienie o każdym zapisie i wypisaniu.
-- Uruchamiać po grafik-potwierdzenia.sql. Można wielokrotnie.
alter table public.ministries add column if not exists self_schedule boolean not null default false;

-- lider: włącz / wyłącz samodzielne zapisy
create or replace function public.ministry_set_self(mid text, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_ministry_leader(mid) then raise exception 'To ustawia lider służby.'; end if;
  update ministries set self_schedule = coalesce(on_, false), updated = now() where id = mid;
end $$;

-- członek: zapisz się / wypisz z niedzieli
create or replace function public.schedule_self(mid text, d date, joining boolean, r text default '') returns void
language plpgsql security definer set search_path = public as $$
declare m ministries; who text; rl text := left(btrim(coalesce(r, '')), 40);
begin
  select * into m from ministries where id = mid;
  if m.id is null then raise exception 'Nie ma takiej służby.'; end if;
  if not exists (select 1 from ministry_members x where x.ministry_id = mid and x.person = auth.uid() and x.status = 'active') then
    raise exception 'Do grafiku zapisują się osoby, które służą w tej służbie.'; end if;
  if not m.self_schedule then raise exception 'W tej służbie grafik układa lider.'; end if;
  if d is null or not (d = any (next_sundays(26))) then raise exception 'Wybierz jedną z najbliższych niedziel.'; end if;
  if rl <> '' and not (rl = any (m.roles)) then raise exception 'Nie ma takiej roli w tej służbie.'; end if;
  select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) into who from people p where p.id = auth.uid();
  if joining then
    if exists (select 1 from ministry_schedule where ministry_id = mid and day = d and person = auth.uid() and state <> 'no') then
      update ministry_schedule set role = rl where ministry_id = mid and day = d and person = auth.uid() and state = 'yes'; -- roli z zaproszenia lidera nie zmienia
      return;
    end if;
    insert into ministry_schedule (ministry_id, day, person, role, state, answered) values (mid, d, auth.uid(), rl, 'yes', now())
    on conflict (ministry_id, day, person) do update set role = excluded.role, state = 'yes', answered = now();
    insert into ministry_availability (ministry_id, person, day, state) values (mid, auth.uid(), d, 'yes')
    on conflict (ministry_id, person, day) do update set state = 'yes', updated = now();
    perform inbox_add(m.leader_ids, 'Grafik: ' || m.name || ' — ' || who || ' zapisał(a) się na ' || to_char(d, 'DD.MM'),
      case when rl <> '' then 'Rola: ' || rl || '.' else 'Zapis do grafiku.' end, './?sluzby=moja');
  else
    if exists (select 1 from ministry_schedule where ministry_id = mid and day = d and person = auth.uid() and state in ('new', 'sent')) then
      raise exception 'To zaproszenie od lidera — odpowiedz „Nie mogę” w Mojej służbie.'; end if;
    delete from ministry_schedule where ministry_id = mid and day = d and person = auth.uid() and state = 'yes';
    if not found then return; end if;
    perform inbox_add(m.leader_ids, 'Grafik: ' || m.name || ' — ' || who || ' wypisał(a) się z ' || to_char(d, 'DD.MM'),
      'Znajdź zastępstwo w grafiku.', './?sluzby=moja');
  end if;
end $$;

-- tablica grafiku: dodatkowo „self” (czy członkowie sami się zapisują)
create or replace function public.availability_board(weeks integer default 9) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare days date[] := next_sundays(weeks);
begin
  if not is_active() then raise exception 'Dyspozycyjność jest dla zatwierdzonych członków.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'days', to_jsonb(days), 'you', auth.uid(), 'roles', to_jsonb(m.roles), 'self', m.self_schedule,
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

revoke all on function public.ministry_set_self(text, boolean) from public, anon;
revoke all on function public.schedule_self(text, date, boolean, text) from public, anon;
grant execute on function public.ministry_set_self(text, boolean) to authenticated;
grant execute on function public.schedule_self(text, date, boolean, text) to authenticated;
