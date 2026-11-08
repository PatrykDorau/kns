-- Finanse służb (wzór: Avenit, bez płatności online): roczny plan wydatków każdej służby i jej wydatki.
-- Widzi i dodaje wydatki: lider służby (swojej). Plany ustala i widzi wszystko: rada albo administrator.
-- Tabele zamknięte — wszystko przez funkcje. Uruchamiać po sluzby.sql. Można wielokrotnie.
create table if not exists public.ministry_budgets (
  ministry_id text not null references public.ministries (id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  planned numeric(12, 2) not null default 0 check (planned >= 0),
  note text not null default '',
  primary key (ministry_id, year)
);
create table if not exists public.ministry_expenses (
  id text primary key default gen_random_uuid()::text,
  ministry_id text not null references public.ministries (id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Warsaw')::date,
  amount numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  title text not null,
  created_by uuid default auth.uid(),
  created timestamptz not null default now()
);
create index if not exists ministry_expenses_m on public.ministry_expenses (ministry_id, day);
alter table public.ministry_budgets enable row level security;
alter table public.ministry_expenses enable row level security;
revoke all on public.ministry_budgets, public.ministry_expenses from anon, authenticated;

create or replace function public.finance_all() returns boolean
language sql stable security definer set search_path = public as $$ select has_flag('council') or has_flag('manage') $$;
create or replace function public.finance_sees(mid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and (finance_all() or exists (select 1 from ministries m where m.id = mid and auth.uid() = any (m.leader_ids)))
$$;

-- służby, których finanse widzę: plan, wydane, wydatki w roku
create or replace function public.finance_board(y int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Finanse są dla zatwierdzonych członków.'; end if;
  return jsonb_build_object('all', finance_all(), 'year', y, 'ministries', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name,
      'planned', coalesce((select b.planned from ministry_budgets b where b.ministry_id = m.id and b.year = y), 0),
      'note', coalesce((select b.note from ministry_budgets b where b.ministry_id = m.id and b.year = y), ''),
      'spent', coalesce((select sum(e.amount) from ministry_expenses e where e.ministry_id = m.id and extract(year from e.day) = y), 0),
      'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'day', e.day, 'amount', e.amount, 'title', e.title,
          'by', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'mine', e.created_by = auth.uid()) order by e.day desc, e.created desc)
        from ministry_expenses e left join people p on p.id = e.created_by where e.ministry_id = m.id and extract(year from e.day) = y), '[]'::jsonb)
    ) order by m.sort, m.name) from ministries m where finance_sees(m.id)), '[]'::jsonb));
end $$;

create or replace function public.finance_plan(mid text, y int, amount numeric, n text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not finance_all() then raise exception 'Plan budżetu ustala rada albo administrator.'; end if;
  if amount is null or amount < 0 then raise exception 'Nieprawidłowa kwota.'; end if;
  insert into ministry_budgets (ministry_id, year, planned, note) values (mid, y, round(amount, 2), left(coalesce(n, ''), 500))
  on conflict (ministry_id, year) do update set planned = excluded.planned, note = excluded.note;
end $$;

create or replace function public.finance_expense_add(mid text, d date, amount numeric, t text) returns text
language plpgsql security definer set search_path = public as $$
declare id text;
begin
  if not finance_sees(mid) then raise exception 'Wydatki służby wpisuje jej lider (albo rada).'; end if;
  if btrim(coalesce(t, '')) = '' then raise exception 'Wpisz, na co był wydatek.'; end if;
  if amount is null or amount <= 0 then raise exception 'Wpisz kwotę.'; end if;
  insert into ministry_expenses (ministry_id, day, amount, title) values (mid, coalesce(d, (now() at time zone 'Europe/Warsaw')::date), round(amount, 2), left(btrim(t), 200)) returning ministry_expenses.id into id;
  return id;
end $$;

create or replace function public.finance_expense_delete(eid text) returns void
language plpgsql security definer set search_path = public as $$
declare e ministry_expenses;
begin
  select * into e from ministry_expenses where id = eid;
  if not found then return; end if;
  if not (finance_all() or (e.created_by = auth.uid() and finance_sees(e.ministry_id))) then raise exception 'Wydatek usuwa osoba, która go wpisała, albo rada.'; end if;
  delete from ministry_expenses where id = eid;
end $$;

revoke all on function public.finance_all(), public.finance_sees(text) from public, anon, authenticated;
revoke all on function public.finance_board(int), public.finance_plan(text, int, numeric, text), public.finance_expense_add(text, date, numeric, text), public.finance_expense_delete(text) from public, anon;
grant execute on function public.finance_board(int), public.finance_plan(text, int, numeric, text), public.finance_expense_add(text, date, numeric, text), public.finance_expense_delete(text) to authenticated;
