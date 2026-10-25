-- Grafik służby z dyspozycyjności (backlog #50): lider przypisuje osoby do najbliższych niedziel, członkowie służby
-- widzą grafik (kto w którą niedzielę), „Wyślij grafik” — powiadomienie (dzwonek + push) do każdego z jego niedzielami.
create table if not exists public.ministry_schedule (
  ministry_id text not null references public.ministries(id) on delete cascade,
  day date not null,
  person uuid not null references public.people(id) on delete cascade,
  created timestamptz not null default now(),
  primary key (ministry_id, day, person)
);
alter table public.ministry_schedule enable row level security; -- tylko przez funkcje poniżej

-- lider: dodaj / zdejmij osobę z niedzieli
create or replace function public.schedule_toggle(mid text, d date, who uuid) returns boolean
language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_ministry_leader(mid) then raise exception 'Grafik układa lider służby.'; end if;
  if d is null or extract(dow from d) <> 0 or d < (now() at time zone 'Europe/Warsaw')::date then raise exception 'Wybierz jedną z najbliższych niedziel.'; end if;
  if not exists (select 1 from ministry_members x where x.ministry_id = mid and x.person = who and x.status = 'active') then raise exception 'Ta osoba nie służy w tej służbie.'; end if;
  if exists (select 1 from ministry_schedule where ministry_id = mid and day = d and person = who) then
    delete from ministry_schedule where ministry_id = mid and day = d and person = who; return false;
  end if;
  insert into ministry_schedule (ministry_id, day, person) values (mid, d, who); return true;
end $$;

-- lider: wyślij grafik — każdy dostaje swoje niedziele (od dziś)
create or replace function public.schedule_publish(mid text) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare m ministries; r record; n int := 0;
begin
  if not is_ministry_leader(mid) then raise exception 'Grafik wysyła lider służby.'; end if;
  select * into m from ministries where id = mid;
  for r in select s.person, string_agg(to_char(s.day, 'DD.MM'), ', ' order by s.day) as days
           from ministry_schedule s where s.ministry_id = mid and s.day >= (now() at time zone 'Europe/Warsaw')::date group by s.person loop
    perform inbox_add(array[r.person], 'Grafik: ' || m.name, 'Służysz w niedziele: ' || r.days || '.', './?sluzby=moja');
    n := n + 1;
  end loop;
  return n;
end $$;

-- dyspozycyjność + grafik (plan: niedziela → osoby) dla członków służby i lidera
create or replace function public.availability_board(weeks integer default 9) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare days date[] := next_sundays(weeks);
begin
  if not is_active() then raise exception 'Dyspozycyjność jest dla zatwierdzonych członków.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'days', to_jsonb(days), 'you', auth.uid(),
      'member', exists (select 1 from ministry_members x where x.ministry_id = m.id and x.person = auth.uid() and x.status = 'active'),
      'lead', is_ministry_leader(m.id),
      'mine', coalesce((select jsonb_object_agg(a.day, a.state) from ministry_availability a
                 where a.ministry_id = m.id and a.person = auth.uid() and a.day = any (days)), '{}'::jsonb),
      'plan', coalesce((select jsonb_object_agg(s.day, s.people) from (select day, jsonb_agg(person) as people from ministry_schedule
                 where ministry_id = m.id and day = any (days) group by day) s), '{}'::jsonb),
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

revoke all on function public.schedule_toggle(text, date, uuid) from public, anon;
revoke all on function public.schedule_publish(text) from public, anon;
grant execute on function public.schedule_toggle(text, date, uuid) to authenticated;
grant execute on function public.schedule_publish(text) to authenticated;

-- Dyspozycyjność: niedziela, na którą lider wpisał osobę do grafiku, a ona potwierdziła „mogę” — zablokowana do zmiany
-- przez tę osobę (zmianę ustala z liderem; po zdjęciu z grafiku znów może zmienić).
create or replace function public.availability_set(mid text, d date, st text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ministry_members x where x.ministry_id = mid and x.person = auth.uid() and x.status = 'active') then
    raise exception 'Dyspozycyjność podają osoby, które służą w tej służbie.';
  end if;
  if d is null or extract(dow from d) <> 0 or d < (now() at time zone 'Europe/Warsaw')::date then raise exception 'Wybierz jedną z najbliższych niedziel.'; end if;
  if coalesce(st, '') <> 'yes'
     and exists (select 1 from ministry_schedule s where s.ministry_id = mid and s.day = d and s.person = auth.uid())
     and exists (select 1 from ministry_availability a where a.ministry_id = mid and a.day = d and a.person = auth.uid() and a.state = 'yes') then
    raise exception 'Na tę niedzielę jesteś w grafiku — zmianę ustal z liderem służby.';
  end if;
  if st is null then delete from ministry_availability where ministry_id = mid and person = auth.uid() and day = d; return; end if;
  if st not in ('yes', 'no', 'maybe') then raise exception 'Nieznana odpowiedź.'; end if;
  insert into ministry_availability (ministry_id, person, day, state) values (mid, auth.uid(), d, st)
  on conflict (ministry_id, person, day) do update set state = excluded.state, updated = now();
end $$;
revoke all on function public.availability_set(text, date, text) from public, anon;
grant execute on function public.availability_set(text, date, text) to authenticated;
