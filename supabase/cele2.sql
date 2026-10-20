-- Cele wsparcia, część 2: cel bez terminu (ends puste — zbieramy, dopóki rada nie zamknie) i cel jednorazowy
-- (kind = 'once': każdy deklaruje jedną kwotę z dziesięciny i raz potwierdza wpłatę — bez miesięcznego potwierdzania).
-- Uruchamiać po cele.sql. Można wielokrotnie.
alter table public.goals alter column ends drop not null;
alter table public.goals drop constraint if exists goals_check;
alter table public.goals drop constraint if exists goals_ends_check;
alter table public.goals add constraint goals_ends_check check (ends is null or ends >= starts);
alter table public.goals add column if not exists kind text not null default 'monthly';
alter table public.goals drop constraint if exists goals_kind_check;
alter table public.goals add constraint goals_kind_check check (kind in ('monthly', 'once'));

-- cel otwarty: niezamknięty i (bez terminu albo przed terminem)
create or replace function public.goal_open(g public.goals) returns boolean
language sql stable as $$ select not g.closed and (g.ends is null or g.ends >= current_date) $$;

drop policy if exists pledges_add on public.pledges;
create policy pledges_add on public.pledges for insert to authenticated with check (
  person = auth.uid() and is_active()
  and exists (select 1 from goals g where g.id = goal_id and goal_open(g)));

-- deklaracje miesięczne (do potwierdzania co miesiąc) — bez celów jednorazowych
create or replace function public.pledge_prev_due() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pledges p join goals g on g.id = p.goal_id and g.kind = 'monthly'
                 where p.person = auth.uid() and p.amount > 0 and p.since <= (date_trunc('month', current_date) - interval '1 month')::date)
    and not exists (select 1 from pledge_months where person = auth.uid() and month = (date_trunc('month', current_date) - interval '1 month')::date and confirmed is not null)
$$;

create or replace function public.pledge_set(g text, amt int) returns void
language plpgsql security definer set search_path = public as $$
declare goal goals; cur date := date_trunc('month', current_date)::date; nxt date := (date_trunc('month', current_date) + interval '1 month')::date;
  prev date := (date_trunc('month', current_date) - interval '1 month')::date; locked boolean; old int;
begin
  if not is_active() then raise exception 'Deklaracje składają członkowie z kontem.'; end if;
  select * into goal from goals where id = g;
  if goal.id is null then raise exception 'Nie ma takiego celu.'; end if;
  if amt is null or amt < 0 or amt > 100000 then raise exception 'Kwota od 0 do 100 000 zł.'; end if;
  old := coalesce((select amount from pledges where goal_id = g and person = auth.uid()), 0);
  if amt = old then return; end if;
  if not goal_open(goal) and amt > old then
    raise exception 'Ten cel jest już zamknięty — można tylko zmniejszyć deklarację.';
  end if;
  -- jednorazowy: zmiana tylko przed potwierdzeniem wpłaty
  if goal.kind = 'once' then
    if exists (select 1 from pledge_confirmations c where c.goal_id = g and c.person = auth.uid()) then
      raise exception 'Wpłata na ten cel jest już potwierdzona — deklaracji nie można zmienić.';
    end if;
    insert into pledges (goal_id, person, amount, since) values (g, auth.uid(), amt, cur)
    on conflict (goal_id, person) do update set amount = excluded.amount, updated = now();
    return;
  end if;
  locked := pledge_locked();
  if locked and old > 0 then
    raise exception 'W tym miesiącu dziesięcina jest już potwierdzona — deklarację zmienisz od %.', to_char(nxt, 'DD.MM.YYYY');
  end if;
  if old > 0 and pledge_prev_due() then
    raise exception 'Najpierw potwierdź miesiąc %, potem zmienisz deklarację.', to_char(prev, 'MM.YYYY');
  end if;
  insert into pledges (goal_id, person, amount, since) values (g, auth.uid(), amt, case when locked then nxt else cur end)
  on conflict (goal_id, person) do update set amount = excluded.amount, updated = now(),
    since = case when pledges.amount = 0 and excluded.amount > 0 then excluded.since else pledges.since end;
end $$;

-- Jednorazowy: potwierdzenie wpłaty (raz, ostatecznie; można potwierdzić mniej niż zadeklarowano).
create or replace function public.pledge_once_done(g text, amt int default null) returns int
language plpgsql security definer set search_path = public as $$
declare goal goals; p pledges; a int; cur date := date_trunc('month', current_date)::date;
begin
  if not is_active() then raise exception 'Potwierdzają członkowie z kontem.'; end if;
  select * into goal from goals where id = g;
  if goal.id is null or goal.kind <> 'once' then raise exception 'To nie jest cel jednorazowy.'; end if;
  select * into p from pledges where goal_id = g and person = auth.uid();
  if p.goal_id is null or p.amount <= 0 then raise exception 'Najpierw zadeklaruj kwotę.'; end if;
  if exists (select 1 from pledge_confirmations c where c.goal_id = g and c.person = auth.uid()) then raise exception 'Wpłata jest już potwierdzona.'; end if;
  a := coalesce(amt, p.amount);
  if a <= 0 or a > p.amount then raise exception 'Potwierdzić można od 1 zł do zadeklarowanej kwoty.'; end if;
  if a < p.amount then update pledges set amount = a, updated = now() where goal_id = g and person = auth.uid(); end if;
  insert into pledge_confirmations (goal_id, person, month, amount) values (g, auth.uid(), cur, a);
  return a;
end $$;
revoke all on function public.pledge_once_done(text, int) from public, anon;
grant execute on function public.pledge_once_done(text, int) to authenticated;

-- Potwierdzenie miesiąca — tylko cele miesięczne.
create or replace function public.confirm_month(m date, amounts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare mon date := date_trunc('month', m)::date; cur date := date_trunc('month', current_date)::date; p pledges; a int; total int := 0;
begin
  if not is_active() then raise exception 'Potwierdzają członkowie z kontem.'; end if;
  if mon > cur or mon < (cur - interval '1 month')::date then raise exception 'Potwierdzić można bieżący albo poprzedni miesiąc.'; end if;
  if exists (select 1 from pledge_months where person = auth.uid() and month = mon and confirmed is not null) then
    raise exception 'Ten miesiąc jest już potwierdzony — nie można go zmienić.';
  end if;
  for p in select x.* from pledges x join goals g on g.id = x.goal_id and g.kind = 'monthly'
           where x.person = auth.uid() and x.since <= mon and (x.amount > 0 or (amounts ? x.goal_id)) loop
    a := coalesce((amounts ->> p.goal_id)::int, p.amount);
    if a < 0 then raise exception 'Kwota nie może być ujemna.'; end if;
    if a > p.amount then raise exception 'Potwierdzić można najwyżej zadeklarowaną kwotę — najpierw zwiększ deklarację.'; end if;
    if a < p.amount then update pledges set amount = a, updated = now() where goal_id = p.goal_id and person = p.person; end if;
    insert into pledge_confirmations (goal_id, person, month, amount) values (p.goal_id, p.person, mon, a)
    on conflict (goal_id, person, month) do update set amount = excluded.amount, confirmed = now();
    total := total + a;
  end loop;
  insert into pledge_months (person, month, total, confirmed) values (auth.uid(), mon, total, now())
  on conflict (person, month) do update set total = excluded.total, confirmed = now();
  return total;
end $$;

-- Cele z postępem: rodzaj, bez terminu (months_left null), przy jednorazowym — czy moja wpłata potwierdzona.
create or replace function public.goals_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date;
begin
  if not is_active() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x.closed, x.ends nulls last) from (
    select g.id, g.title, g.description, g.target, g.starts, g.ends, g.image, g.kind, not goal_open(g) as closed,
      coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g.id), 0)::int as confirmed,
      coalesce((select sum(p.amount) from pledges p where p.goal_id = g.id), 0)::int as monthly,
      (select count(*) from pledges p where p.goal_id = g.id and p.amount > 0)::int as people,
      case when g.ends is null or g.kind = 'once' then null
           else greatest(0, (extract(year from age(date_trunc('month', g.ends), cur)) * 12 + extract(month from age(date_trunc('month', g.ends), cur)))::int + 1) end as months_left,
      coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g.id and c.month = cur), 0)::int as confirmed_now,
      coalesce((select p.amount from pledges p where p.goal_id = g.id and p.person = auth.uid()), 0) as mine,
      (select c.amount from pledge_confirmations c where c.goal_id = g.id and c.person = auth.uid() and g.kind = 'once' limit 1) as mine_done
    from goals g) x), '[]'::jsonb);
end $$;

-- Moje miesiące do potwierdzenia — tylko cele miesięczne.
create or replace function public.my_pledge_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date; prev date := (date_trunc('month', current_date) - interval '1 month')::date;
begin
  if not is_active() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m.mon, 'confirmed', pm.confirmed, 'total', pm.total,
        'items', (select jsonb_agg(jsonb_build_object('goal', p.goal_id, 'title', g.title, 'amount', p.amount,
                   'confirmed', (select c.amount from pledge_confirmations c where c.goal_id = p.goal_id and c.person = p.person and c.month = m.mon)) order by g.title)
                  from pledges p join goals g on g.id = p.goal_id and g.kind = 'monthly'
                  where p.person = auth.uid() and p.since <= m.mon and (p.amount > 0 or exists (select 1 from pledge_confirmations c where c.goal_id = p.goal_id and c.person = p.person and c.month = m.mon))))
        order by m.mon)
      from (values (prev), (cur)) m(mon)
      left join pledge_months pm on pm.person = auth.uid() and pm.month = m.mon
      where exists (select 1 from pledges p join goals g on g.id = p.goal_id and g.kind = 'monthly' where p.person = auth.uid() and p.since <= m.mon and p.amount > 0)
         or pm.confirmed is not null), '[]'::jsonb),
    'monthly', coalesce((select sum(p.amount) from pledges p join goals g on g.id = p.goal_id and g.kind = 'monthly' where p.person = auth.uid()), 0),
    'locked', pledge_locked(), 'prevDue', pledge_prev_due(),
    'next', (date_trunc('month', current_date) + interval '1 month')::date);
end $$;

-- Przypomnienia o potwierdzeniu — tylko cele miesięczne.
create or replace function public.pledge_reminders_on(today date) returns int
language plpgsql security definer set search_path = public as $$
declare prev date := (date_trunc('month', today) - interval '1 month')::date; n int := 0; r record;
begin
  if extract(day from today) > 7 then return 0; end if;
  for r in select p.person, sum(p.amount)::int as total from pledges p join people pe on pe.id = p.person and pe.status = 'active'
           join goals g on g.id = p.goal_id and g.kind = 'monthly'
           where p.amount > 0 and p.since <= prev group by p.person loop
    if exists (select 1 from pledge_months pm where pm.person = r.person and pm.month = prev and (pm.confirmed is not null or pm.reminded is not null)) then continue; end if;
    n := n + inbox_add(array[r.person], 'Potwierdź cele wsparcia za ' || to_char(prev, 'MM.YYYY'),
      'Czy Twoja dziesięcina wyniosła co najmniej ' || r.total || ' zł? Potwierdź albo zmniejsz deklaracje.', './cele');
    insert into pledge_months (person, month, reminded) values (r.person, prev, now())
    on conflict (person, month) do update set reminded = now();
  end loop;
  return n;
end $$;
revoke all on function public.pledge_reminders_on(date) from public, anon, authenticated;
