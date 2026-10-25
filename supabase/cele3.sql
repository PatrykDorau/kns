-- Cele wsparcia, część 3 — nowe zasady: co miesiąc podajesz, ile dziesięciny w tym miesiącu wpłaciłeś(-aś); część tej kwoty
-- (procent ustala rada, domyślnie 10%) rozdzielasz na wybrane cele. Bez potwierdzania — przydziały można zmieniać do końca
-- miesiąca, a z jego końcem miesiąc zamyka się sam (przydziały z poprzednich miesięcy są ostateczne i liczą się do zebranych).
-- Dawne deklaracje przestają działać; dawne potwierdzone kwoty zostają w zebranych sumach.
-- Uruchamiać po cele.sql, cele2.sql i posluchaj.sql (site_settings). Można wielokrotnie.
create table if not exists public.tithe_months (
  person uuid not null references public.people (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount int not null check (amount between 0 and 1000000),
  updated timestamptz not null default now(),
  primary key (person, month)
);
create table if not exists public.goal_allocations (
  goal_id text not null references public.goals (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount int not null check (amount > 0),
  updated timestamptz not null default now(),
  primary key (goal_id, person, month)
);
alter table public.tithe_months enable row level security;
alter table public.goal_allocations enable row level security;
revoke all on public.tithe_months, public.goal_allocations from anon, authenticated;

-- jaki procent dziesięciny można rozdzielić na cele (ustawia rada; domyślnie 10)
create or replace function public.goal_share() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'percent')::int from site_settings where key = 'cele'), 10)
$$;
create or replace function public.goal_share_set(p int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_goals() then raise exception 'Procent ustala rada zboru.'; end if;
  if p is null or p < 1 or p > 100 then raise exception 'Procent od 1 do 100.'; end if;
  insert into site_settings (key, value) values ('cele', jsonb_build_object('percent', p))
  on conflict (key) do update set value = excluded.value;
end $$;

-- mój bieżący miesiąc: wpłacona dziesięcina, pula na cele, przydziały
create or replace function public.tithe_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date; prev date := (date_trunc('month', current_date) - interval '1 month')::date;
  share int := goal_share(); t int; tp int;
begin
  if not is_active() then return '{}'::jsonb; end if;
  select amount into t from tithe_months where person = auth.uid() and month = cur;
  select amount into tp from tithe_months where person = auth.uid() and month = prev;
  return jsonb_build_object('month', cur, 'percent', share, 'tithe', t, 'pool', case when t is null then null else t * share / 100 end,
    'allocated', coalesce((select jsonb_object_agg(goal_id, amount) from goal_allocations where person = auth.uid() and month = cur), '{}'::jsonb),
    'used', coalesce((select sum(amount) from goal_allocations where person = auth.uid() and month = cur), 0),
    'prev', jsonb_build_object('month', prev, 'tithe', tp,
      'used', coalesce((select sum(amount) from goal_allocations where person = auth.uid() and month = prev), 0)),
    'closes', (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
end $$;

-- ile w tym miesiącu wpłaciłem(-am) dziesięciny (można poprawiać do końca miesiąca)
create or replace function public.tithe_set(amt int) returns void
language plpgsql security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date; share int := goal_share(); used int;
begin
  if not is_active() then raise exception 'Dla zatwierdzonych członków.'; end if;
  if amt is null or amt < 0 or amt > 1000000 then raise exception 'Kwota od 0 do 1 000 000 zł.'; end if;
  used := coalesce((select sum(amount) from goal_allocations where person = auth.uid() and month = cur), 0);
  if used > amt * share / 100 then
    raise exception 'Na cele rozdzielono już % zł — to więcej niż % proc. tej kwoty. Najpierw zmniejsz przydziały.', used, share;
  end if;
  insert into tithe_months (person, month, amount) values (auth.uid(), cur, amt)
  on conflict (person, month) do update set amount = excluded.amount, updated = now();
end $$;

-- przydział na cel w tym miesiącu (0 — usuwa); razem najwyżej pula (procent wpłaconej dziesięciny)
create or replace function public.allocation_set(g text, amt int) returns void
language plpgsql security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date; goal goals; t int; others int; pool int;
begin
  if not is_active() then raise exception 'Dla zatwierdzonych członków.'; end if;
  select * into goal from goals where id = g;
  if goal.id is null then raise exception 'Nie ma takiego celu.'; end if;
  if amt is null or amt < 0 then raise exception 'Kwota nie może być ujemna.'; end if;
  if amt = 0 then delete from goal_allocations where goal_id = g and person = auth.uid() and month = cur; return; end if;
  if not goal_open(goal) then raise exception 'Ten cel jest już zakończony.'; end if;
  select amount into t from tithe_months where person = auth.uid() and month = cur;
  if t is null then raise exception 'Najpierw podaj, ile w tym miesiącu wpłaciłeś(-aś) dziesięciny.'; end if;
  pool := t * goal_share() / 100;
  others := coalesce((select sum(amount) from goal_allocations where person = auth.uid() and month = cur and goal_id <> g), 0);
  if others + amt > pool then raise exception 'Do rozdzielenia zostało % zł.', greatest(0, pool - others); end if;
  insert into goal_allocations (goal_id, person, month, amount) values (g, auth.uid(), cur, amt)
  on conflict (goal_id, person, month) do update set amount = excluded.amount, updated = now();
end $$;

-- cele z postępem: zebrano (zamknięte miesiące + dawne potwierdzenia), w tym miesiącu (jeszcze otwarte), osoby, mój przydział
create or replace function public.goals_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date;
begin
  if not is_active() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x.closed, x.ends nulls last) from (
    select g.id, g.title, g.description, g.target, g.starts, g.ends, g.image, not goal_open(g) as closed,
      (coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g.id), 0)
        + coalesce((select sum(a.amount) from goal_allocations a where a.goal_id = g.id and a.month < cur), 0))::int as confirmed,
      coalesce((select sum(a.amount) from goal_allocations a where a.goal_id = g.id and a.month = cur), 0)::int as now,
      (select count(*) from (select a.person from goal_allocations a where a.goal_id = g.id
                             union select c.person from pledge_confirmations c where c.goal_id = g.id) s)::int as people,
      coalesce((select a.amount from goal_allocations a where a.goal_id = g.id and a.person = auth.uid() and a.month = cur), 0) as mine,
      (coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g.id and c.person = auth.uid()), 0)
        + coalesce((select sum(a.amount) from goal_allocations a where a.goal_id = g.id and a.person = auth.uid() and a.month < cur), 0))::int as mine_total
    from goals g) x), '[]'::jsonb);
end $$;

-- rada: kto ile przydzielił (w tym miesiącu i łącznie)
create or replace function public.goal_people(g text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date;
begin
  if not can_manage_goals() then raise exception 'Kwoty osób widzi rada zboru.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(pe.name, ''), pe.email),
      'now', coalesce((select a.amount from goal_allocations a where a.goal_id = g and a.person = s.person and a.month = cur), 0),
      'given', coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g and c.person = s.person), 0)
             + coalesce((select sum(a.amount) from goal_allocations a where a.goal_id = g and a.person = s.person and a.month < cur), 0))
      order by pe.name)
    from (select a.person from goal_allocations a where a.goal_id = g union select c.person from pledge_confirmations c where c.goal_id = g) s
    join people pe on pe.id = s.person), '[]'::jsonb);
end $$;

-- przypomnienie (zaplanowana funkcja codziennie): w dniach 24–28 — kto nie podał jeszcze dziesięciny za ten miesiąc,
-- a są otwarte cele — raz w miesiącu wiadomość, że miesiąc zamknie się sam z jego końcem
create or replace function public.pledge_reminders_on(today date) returns int
language plpgsql security definer set search_path = public as $$
declare cur date := date_trunc('month', today)::date; n int := 0; r record; share int := goal_share();
begin
  if extract(day from today) < 24 or extract(day from today) > 28 then return 0; end if;
  if not exists (select 1 from goals g where goal_open(g)) then return 0; end if;
  for r in select pe.id from people pe where pe.status = 'active'
           and (exists (select 1 from goal_allocations a where a.person = pe.id) or exists (select 1 from pledges p where p.person = pe.id and p.amount > 0))
           and not exists (select 1 from tithe_months t where t.person = pe.id and t.month = cur) loop
    if exists (select 1 from pledge_months pm where pm.person = r.id and pm.month = cur and pm.reminded is not null) then continue; end if;
    n := n + inbox_add(array[r.id], 'Cele wsparcia — ' || to_char(cur, 'MM.YYYY'),
      'Podaj, ile w tym miesiącu wpłaciłeś(-aś) dziesięciny, i rozdziel ' || share || '% na cele. Miesiąc zamknie się sam z jego końcem.', './cele');
    insert into pledge_months (person, month, reminded) values (r.id, cur, now())
    on conflict (person, month) do update set reminded = now();
  end loop;
  return n;
end $$;
revoke all on function public.pledge_reminders_on(date) from public, anon, authenticated;

revoke all on function public.goal_share(), public.goal_share_set(int), public.tithe_status(), public.tithe_set(int), public.allocation_set(text, int),
  public.goals_overview(), public.goal_people(text) from public, anon;
grant execute on function public.goal_share(), public.goal_share_set(int), public.tithe_status(), public.tithe_set(int), public.allocation_set(text, int),
  public.goals_overview(), public.goal_people(text) to authenticated;
-- dawne deklaracje i potwierdzanie miesięcy — już nieużywane
revoke execute on function public.pledge_set(text, int), public.confirm_month(date, jsonb), public.pledge_once_done(text, int) from authenticated;
