-- Dyspozycyjność w służbach: członek służby zaznacza na najbliższe niedziele „mogę / nie mogę / nie wiem”,
-- lider (albo administrator) widzi tabelę osoby × niedziele i może przypomnieć tym, którzy nie uzupełnili.
-- Wszystko przez funkcje poniżej — bezpośredni dostęp do tabeli jest zamknięty. Uruchamiać po sluzby.sql. Można wielokrotnie.
create table if not exists public.ministry_availability (
  ministry_id text not null references public.ministries (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  day date not null,
  state text not null check (state in ('yes', 'no', 'maybe')),
  updated timestamptz not null default now(),
  primary key (ministry_id, person, day)
);
alter table public.ministry_availability enable row level security;
revoke all on public.ministry_availability from anon, authenticated;

-- najbliższe niedziele (dzisiejsza też, jeśli dziś niedziela) — czas polski
create or replace function public.next_sundays(n int default 9) returns date[]
language sql stable as $$
  select array(select (s + g * 7)::date from (select (now() at time zone 'Europe/Warsaw')::date as t) x,
    lateral (select x.t + ((7 - extract(dow from x.t)::int) % 7) as s) y, generate_series(0, greatest(1, least(n, 26)) - 1) g)
$$;

-- Służby, w których służę albo którymi kieruję: niedziele, moje odpowiedzi, a liderom — tabela całej służby.
create or replace function public.availability_board(weeks int default 9) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare days date[] := next_sundays(weeks);
begin
  if not is_active() then raise exception 'Dyspozycyjność jest dla zatwierdzonych członków.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'days', to_jsonb(days),
      'member', exists (select 1 from ministry_members x where x.ministry_id = m.id and x.person = auth.uid() and x.status = 'active'),
      'lead', is_ministry_leader(m.id),
      'mine', coalesce((select jsonb_object_agg(a.day, a.state) from ministry_availability a
                 where a.ministry_id = m.id and a.person = auth.uid() and a.day = any (days)), '{}'::jsonb),
      'people', case when is_ministry_leader(m.id) then coalesce((select jsonb_agg(jsonb_build_object(
                    'id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)),
                    'states', coalesce((select jsonb_object_agg(a.day, a.state) from ministry_availability a
                                where a.ministry_id = m.id and a.person = p.id and a.day = any (days)), '{}'::jsonb)) order by p.name)
                  from ministry_members x join people p on p.id = x.person where x.ministry_id = m.id and x.status = 'active'), '[]'::jsonb)
                  else '[]'::jsonb end
    ) order by m.sort, m.name)
    from ministries m
    where is_ministry_leader(m.id) or exists (select 1 from ministry_members x where x.ministry_id = m.id and x.person = auth.uid() and x.status = 'active')), '[]'::jsonb);
end $$;

-- Moja odpowiedź na niedzielę (st = null — usuń).
create or replace function public.availability_set(mid text, d date, st text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ministry_members x where x.ministry_id = mid and x.person = auth.uid() and x.status = 'active') then
    raise exception 'Dyspozycyjność podają osoby, które służą w tej służbie.';
  end if;
  if d is null or extract(dow from d) <> 0 or d < (now() at time zone 'Europe/Warsaw')::date then raise exception 'Wybierz jedną z najbliższych niedziel.'; end if;
  if st is null then delete from ministry_availability where ministry_id = mid and person = auth.uid() and day = d; return; end if;
  if st not in ('yes', 'no', 'maybe') then raise exception 'Nieznana odpowiedź.'; end if;
  insert into ministry_availability (ministry_id, person, day, state) values (mid, auth.uid(), d, st)
  on conflict (ministry_id, person, day) do update set state = excluded.state, updated = now();
end $$;

-- Lider: przypomnienie (powiadomienie w aplikacji) dla osób, które nie podały dyspozycyjności na najbliższe 4 niedziele.
create or replace function public.availability_remind(mid text) returns int
language plpgsql security definer set search_path = public as $$
declare who uuid[]; days date[] := next_sundays(4); nm text;
begin
  if not is_ministry_leader(mid) then raise exception 'Przypomina lider tej służby albo administrator.'; end if;
  select name into nm from ministries where id = mid;
  who := array(select x.person from ministry_members x where x.ministry_id = mid and x.status = 'active' and x.person <> auth.uid()
    and (select count(*) from ministry_availability a where a.ministry_id = mid and a.person = x.person and a.day = any (days)) < cardinality(days));
  if cardinality(who) > 0 then
    perform inbox_add(who, 'Dyspozycyjność: ' || nm, 'Zaznacz, w które niedziele możesz służyć.', './?sluzby=1');
  end if;
  return cardinality(who);
end $$;

revoke all on function public.next_sundays(int), public.availability_board(int), public.availability_set(text, date, text), public.availability_remind(text) from public, anon;
grant execute on function public.next_sundays(int), public.availability_board(int), public.availability_set(text, date, text), public.availability_remind(text) to authenticated;
