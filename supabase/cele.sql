-- Cele wsparcia: rada (pastor, administrator) ogłasza cel — kwota łącznie i termin. Członkowie deklarują, ile
-- z SWOJEJ DZIESIĘCINY przeznaczają na cel co miesiąc. Po każdym miesiącu osoba potwierdza, że jej dziesięcina
-- wyniosła co najmniej sumę deklaracji; jeśli nie — zmniejsza deklaracje (potwierdza mniejsze kwoty).
-- Kwoty pojedynczych osób widzą: ta osoba i rada zboru (oraz pastor/administrator); reszta zboru — sumy i liczbę osób.
-- Uruchamiaj po schema.sql i skrzynka.sql (można ponownie).

create table if not exists public.goals (
  id text primary key,
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  target int not null check (target > 0 and target <= 100000000), -- zł łącznie
  starts date not null default current_date,
  ends date not null,
  image text not null default '',
  closed boolean not null default false,
  created_by uuid default auth.uid() references public.people (id) on delete set null,
  created timestamptz not null default now(),
  check (ends >= starts)
);
-- Deklaracja: zł miesięcznie z dziesięciny (0 = wycofana). since — pierwszy miesiąc deklaracji.
create table if not exists public.pledges (
  goal_id text not null references public.goals (id) on delete cascade,
  person uuid not null default auth.uid() references public.people (id) on delete cascade,
  amount int not null check (amount between 0 and 100000),
  since date not null default date_trunc('month', current_date)::date,
  updated timestamptz not null default now(),
  primary key (goal_id, person)
);
-- Potwierdzone miesiące: ile faktycznie poszło na cel w danym miesiącu (tylko przez confirm_month).
create table if not exists public.pledge_confirmations (
  goal_id text not null references public.goals (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount int not null check (amount >= 0),
  confirmed timestamptz not null default now(),
  primary key (goal_id, person, month)
);
-- Miesiąc potwierdzony przez osobę (suma) i wysłane przypomnienia.
create table if not exists public.pledge_months (
  person uuid not null references public.people (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  total int not null default 0,
  confirmed timestamptz,
  reminded timestamptz,
  primary key (person, month)
);

-- Kto zakłada cele i widzi kwoty osób: rada zboru, pastor, administrator.
create or replace function public.can_manage_goals() returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('council') or has_flag('manage')
    or exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'pastor' = any (p.roles))
$$;
revoke all on function public.can_manage_goals() from public, anon;
grant execute on function public.can_manage_goals() to authenticated;

alter table public.goals enable row level security;
alter table public.pledges enable row level security;
alter table public.pledge_confirmations enable row level security;
alter table public.pledge_months enable row level security;
revoke all on public.goals, public.pledges, public.pledge_confirmations, public.pledge_months from anon, authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update on public.pledges to authenticated;
grant select on public.pledge_confirmations, public.pledge_months to authenticated;

drop policy if exists goals_read on public.goals;
create policy goals_read on public.goals for select to authenticated using (is_active());
drop policy if exists goals_write on public.goals;
create policy goals_write on public.goals for all to authenticated using (can_manage_goals()) with check (can_manage_goals());

drop policy if exists pledges_read on public.pledges;
create policy pledges_read on public.pledges for select to authenticated using (person = auth.uid() or can_manage_goals());
-- własna deklaracja, tylko na otwarty cel przed terminem
drop policy if exists pledges_add on public.pledges;
create policy pledges_add on public.pledges for insert to authenticated with check (
  person = auth.uid() and is_active()
  and exists (select 1 from goals g where g.id = goal_id and not g.closed and g.ends >= current_date));
drop policy if exists pledges_change on public.pledges;
create policy pledges_change on public.pledges for update to authenticated
  using (person = auth.uid()) with check (person = auth.uid() and is_active());

drop policy if exists pledge_conf_read on public.pledge_confirmations;
create policy pledge_conf_read on public.pledge_confirmations for select to authenticated using (person = auth.uid() or can_manage_goals());
drop policy if exists pledge_months_read on public.pledge_months;
create policy pledge_months_read on public.pledge_months for select to authenticated using (person = auth.uid() or can_manage_goals());

-- Deklaracja (nowa, zmiana, 0 = wycofanie). Zwiększyć można tylko przed terminem celu.
create or replace function public.pledge_set(g text, amt int) returns void
language plpgsql security definer set search_path = public as $$
declare goal goals;
begin
  if not is_active() then raise exception 'Deklaracje składają członkowie z kontem.'; end if;
  select * into goal from goals where id = g;
  if goal.id is null then raise exception 'Nie ma takiego celu.'; end if;
  if amt is null or amt < 0 or amt > 100000 then raise exception 'Kwota od 0 do 100 000 zł miesięcznie.'; end if;
  if (goal.closed or goal.ends < current_date)
     and amt > coalesce((select amount from pledges where goal_id = g and person = auth.uid()), 0) then
    raise exception 'Ten cel jest już zamknięty — można tylko zmniejszyć deklarację.';
  end if;
  insert into pledges (goal_id, person, amount) values (g, auth.uid(), amt)
  on conflict (goal_id, person) do update set amount = excluded.amount, updated = now(),
    since = case when pledges.amount = 0 and excluded.amount > 0 then date_trunc('month', current_date)::date else pledges.since end;
end $$;
revoke all on function public.pledge_set(text, int) from public, anon;
grant execute on function public.pledge_set(text, int) to authenticated;

-- Potwierdzenie miesiąca (bieżący albo poprzedni): amounts = {"cel": kwota}. Kwota mniejsza niż deklaracja
-- zmniejsza deklarację na przyszłość; większej niż deklaracja nie da się potwierdzić. Można poprawić (nadpisuje).
create or replace function public.confirm_month(m date, amounts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare mon date := date_trunc('month', m)::date; cur date := date_trunc('month', current_date)::date; p pledges; a int; total int := 0;
begin
  if not is_active() then raise exception 'Potwierdzają członkowie z kontem.'; end if;
  if mon > cur or mon < (cur - interval '1 month')::date then raise exception 'Potwierdzić można bieżący albo poprzedni miesiąc.'; end if;
  for p in select * from pledges where person = auth.uid() and since <= mon and (amount > 0 or (amounts ? goal_id)) loop
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
revoke all on function public.confirm_month(date, jsonb) from public, anon;
grant execute on function public.confirm_month(date, jsonb) to authenticated;

-- Cele z postępem dla członków: zebrano (potwierdzone), deklaracje miesięcznie, liczba osób, prognoza do terminu.
create or replace function public.goals_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date;
begin
  if not is_active() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x.closed, x.ends) from (
    select g.id, g.title, g.description, g.target, g.starts, g.ends, g.image, g.closed or g.ends < current_date as closed,
      coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g.id), 0)::int as confirmed,
      coalesce((select sum(p.amount) from pledges p where p.goal_id = g.id), 0)::int as monthly,
      (select count(*) from pledges p where p.goal_id = g.id and p.amount > 0)::int as people,
      -- miesiące do terminu (z bieżącym, jeśli jeszcze niepotwierdzony w całości)
      greatest(0, (extract(year from age(date_trunc('month', g.ends), cur)) * 12 + extract(month from age(date_trunc('month', g.ends), cur)))::int + 1) as months_left,
      coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g.id and c.month = cur), 0)::int as confirmed_now,
      coalesce((select p.amount from pledges p where p.goal_id = g.id and p.person = auth.uid()), 0) as mine
    from goals g) x), '[]'::jsonb);
end $$;
revoke all on function public.goals_overview() from public, anon;
grant execute on function public.goals_overview() to authenticated;

-- Moje miesiące do potwierdzenia: poprzedni (jeśli niepotwierdzony) i bieżący, z deklaracjami.
create or replace function public.my_pledge_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date; prev date := (date_trunc('month', current_date) - interval '1 month')::date;
begin
  if not is_active() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m.mon, 'confirmed', pm.confirmed, 'total', pm.total,
        'items', (select jsonb_agg(jsonb_build_object('goal', p.goal_id, 'title', g.title, 'amount', p.amount,
                   'confirmed', (select c.amount from pledge_confirmations c where c.goal_id = p.goal_id and c.person = p.person and c.month = m.mon)) order by g.title)
                  from pledges p join goals g on g.id = p.goal_id
                  where p.person = auth.uid() and p.since <= m.mon and (p.amount > 0 or exists (select 1 from pledge_confirmations c where c.goal_id = p.goal_id and c.person = p.person and c.month = m.mon))))
        order by m.mon)
      from (values (prev), (cur)) m(mon)
      left join pledge_months pm on pm.person = auth.uid() and pm.month = m.mon
      where exists (select 1 from pledges p where p.person = auth.uid() and p.since <= m.mon and p.amount > 0)
         or pm.confirmed is not null), '[]'::jsonb),
    'monthly', coalesce((select sum(amount) from pledges where person = auth.uid()), 0));
end $$;
revoke all on function public.my_pledge_status() from public, anon;
grant execute on function public.my_pledge_status() to authenticated;

-- Rada: kto ile deklaruje na cel i czy potwierdził ostatnie miesiące.
create or replace function public.goal_people(g text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur date := date_trunc('month', current_date)::date; prev date := (date_trunc('month', current_date) - interval '1 month')::date;
begin
  if not can_manage_goals() then raise exception 'Kwoty osób widzi rada zboru.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(pe.name, ''), pe.email), 'amount', p.amount, 'since', p.since,
      'given', coalesce((select sum(c.amount) from pledge_confirmations c where c.goal_id = g and c.person = p.person), 0),
      'prev', (select c.amount from pledge_confirmations c where c.goal_id = g and c.person = p.person and c.month = prev),
      'now', (select c.amount from pledge_confirmations c where c.goal_id = g and c.person = p.person and c.month = cur))
      order by p.amount desc, pe.name)
    from pledges p join people pe on pe.id = p.person where p.goal_id = g and (p.amount > 0 or exists (select 1 from pledge_confirmations c where c.goal_id = g and c.person = p.person))), '[]'::jsonb);
end $$;
revoke all on function public.goal_people(text) from public, anon;
grant execute on function public.goal_people(text) to authenticated;

-- Przypomnienie (zaplanowana funkcja codziennie; działa w dniach 1–7): kto ma deklaracje, a nie potwierdził
-- poprzedniego miesiąca — raz w miesiącu wiadomość w aplikacji (i na telefon, kto włączył).
create or replace function public.pledge_reminders_on(today date) returns int
language plpgsql security definer set search_path = public as $$
declare prev date := (date_trunc('month', today) - interval '1 month')::date; n int := 0; r record;
begin
  if extract(day from today) > 7 then return 0; end if;
  for r in select p.person, sum(p.amount)::int as total from pledges p join people pe on pe.id = p.person and pe.status = 'active'
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
create or replace function public.pledge_reminders() returns int
language sql security definer set search_path = public as $$ select pledge_reminders_on(current_date) $$;
revoke all on function public.pledge_reminders() from public;
grant execute on function public.pledge_reminders() to anon, authenticated;
