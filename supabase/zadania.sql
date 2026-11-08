-- Projekty i zadania (wzór: Avenit): tablica zadań całego kościoła i każdej służby — status, osoba, termin, priorytet.
-- Widzą: tablicę kościoła — zatwierdzeni członkowie, tablicę służby — jej członkowie i liderzy.
-- Zmieniają: kościół — prawo edycji, rada, administrator albo lider dowolnej służby; służbę — jej lider.
-- Osoba, której przypisano zadanie, może zmieniać jego status. Wszystko przez funkcje — tabela zamknięta.
-- Uruchamiać po sluzby.sql, sluzby2.sql, skrzynka.sql. Można wielokrotnie.
create table if not exists public.tasks (
  id text primary key default gen_random_uuid()::text,
  board text not null default '',                 -- '' = cały kościół, inaczej id służby
  title text not null,
  notes text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assignee uuid references public.people (id) on delete set null,
  due date,
  created_by uuid default auth.uid(),
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists tasks_board on public.tasks (board);
alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;

create or replace function public.task_can_see(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and (b = '' or in_ministry(b))
$$;
create or replace function public.task_can_edit(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and case when b = '' then has_flag('edit') or has_flag('council') or has_flag('manage') or leads_any_ministry() else is_ministry_leader(b) end
$$;

-- tablice, które widzę, z zadaniami (zrobione — z ostatnich 30 dni) i osobami do przypisania (gdy mogę zmieniać)
create or replace function public.tasks_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare boards jsonb;
begin
  if not is_active() then raise exception 'Zadania są dla zatwierdzonych członków.'; end if;
  select coalesce(jsonb_agg(b order by (b ->> 'sort')::int, b ->> 'name'), '[]'::jsonb) into boards from (
    select jsonb_build_object('id', x.id, 'name', x.name, 'sort', x.sort, 'edit', task_can_edit(x.id),
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'notes', t.notes, 'status', t.status, 'priority', t.priority,
          'due', t.due, 'assignee', t.assignee, 'who', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'mine', t.assignee = auth.uid(), 'updated', t.updated)
          order by t.status = 'done', t.due nulls last, t.created)
        from tasks t left join people p on p.id = t.assignee
        where t.board = x.id and (t.status <> 'done' or t.done_at > now() - interval '30 days')), '[]'::jsonb),
      'people', case when task_can_edit(x.id) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))) order by p.name)
          from people p where p.status = 'active' and (x.id = '' or exists (select 1 from ministry_members mm where mm.ministry_id = x.id and mm.person = p.id and mm.status = 'active')
            or exists (select 1 from ministries m where m.id = x.id and p.id = any (m.leader_ids)))), '[]'::jsonb) else '[]'::jsonb end) as b
    from (select '' as id, 'Cały kościół' as name, -1 as sort
          union all select m.id, m.name, m.sort from ministries m where in_ministry(m.id)) x
  ) q;
  return boards;
end $$;

-- dodaj / zmień zadanie (nowe przypisanie — dzwonek u tej osoby)
create or replace function public.task_save(t jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare b text := coalesce(t ->> 'board', ''); tid text := nullif(t ->> 'id', ''); old tasks; who uuid := nullif(t ->> 'assignee', '')::uuid; nm text;
begin
  if tid is not null then
    select * into old from tasks where id = tid;
    if not found then raise exception 'Nie ma takiego zadania.'; end if;
    b := old.board;
  end if;
  if not task_can_edit(b) then raise exception 'Zadania na tej tablicy zmienia lider (albo osoba z prawem edycji).'; end if;
  if btrim(coalesce(t ->> 'title', '')) = '' then raise exception 'Wpisz, co jest do zrobienia.'; end if;
  if who is not null and not exists (select 1 from people p where p.id = who and p.status = 'active') then raise exception 'Nie ma takiej osoby.'; end if;
  if coalesce(t ->> 'status', 'todo') not in ('todo', 'doing', 'blocked', 'done') or coalesce(t ->> 'priority', 'normal') not in ('low', 'normal', 'high') then raise exception 'Nieznany status albo priorytet.'; end if;
  if tid is null then
    insert into tasks (board, title, notes, status, priority, assignee, due)
    values (b, left(btrim(t ->> 'title'), 200), left(coalesce(t ->> 'notes', ''), 4000), coalesce(t ->> 'status', 'todo'), coalesce(t ->> 'priority', 'normal'), who, nullif(t ->> 'due', '')::date)
    returning id into tid;
  else
    update tasks set title = left(btrim(t ->> 'title'), 200), notes = left(coalesce(t ->> 'notes', ''), 4000), status = coalesce(t ->> 'status', status),
      priority = coalesce(t ->> 'priority', priority), assignee = who, due = nullif(t ->> 'due', '')::date, updated = now(),
      done_at = case when coalesce(t ->> 'status', status) = 'done' then coalesce(done_at, now()) else null end
    where id = tid;
  end if;
  if who is not null and who is distinct from old.assignee then
    select case when b = '' then 'Cały kościół' else (select name from ministries where id = b) end into nm;
    perform inbox_add(array[who], 'Nowe zadanie: ' || left(btrim(t ->> 'title'), 120), nm || coalesce(' · termin ' || to_char(nullif(t ->> 'due', '')::date, 'DD.MM'), ''), './zadania');
  end if;
  return tid;
end $$;

-- status: lider tablicy albo osoba przypisana
create or replace function public.task_status(tid text, st text) returns void
language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  select * into t from tasks where id = tid;
  if not found then raise exception 'Nie ma takiego zadania.'; end if;
  if not (task_can_edit(t.board) or t.assignee = auth.uid()) then raise exception 'Status zmienia osoba przypisana albo lider.'; end if;
  if st not in ('todo', 'doing', 'blocked', 'done') then raise exception 'Nieznany status.'; end if;
  update tasks set status = st, updated = now(), done_at = case when st = 'done' then coalesce(done_at, now()) else null end where id = tid;
end $$;

create or replace function public.task_delete(tid text) returns void
language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  select * into t from tasks where id = tid;
  if not found then return; end if;
  if not task_can_edit(t.board) then raise exception 'Zadanie usuwa lider tablicy.'; end if;
  delete from tasks where id = tid;
end $$;

-- moje otwarte zadania (na Start)
create or replace function public.my_tasks() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'due', t.due, 'priority', t.priority,
      'board', case when t.board = '' then 'Cały kościół' else m.name end) order by t.due nulls last, t.created), '[]'::jsonb)
  from tasks t left join ministries m on m.id = t.board
  where t.assignee = auth.uid() and t.status <> 'done' and is_active()
$$;

revoke all on function public.task_can_see(text), public.task_can_edit(text), public.tasks_board(), public.task_save(jsonb), public.task_status(text, text),
  public.task_delete(text), public.my_tasks() from public, anon;
grant execute on function public.tasks_board(), public.task_save(jsonb), public.task_status(text, text), public.task_delete(text), public.my_tasks() to authenticated;
