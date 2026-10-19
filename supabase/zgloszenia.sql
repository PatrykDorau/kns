-- Zgłoszenia błędów i pomysłów („Zgłoś błąd” w aplikacji) → backlog dla administratorów i deweloperów (ranga „dev”):
-- status (nowe, w trakcie, zrobione, odrzucone), kto się zajmuje, notatka. Zgłaszający widzi swoje zgłoszenia
-- i dostaje powiadomienie, gdy zgłoszenie zostanie zrobione albo odrzucone. Uruchamiać po skrzynka.sql. Można wielokrotnie.

insert into public.ranks (id, name, can_edit, council, protocols, manage, sort)
values ('dev', 'Deweloper (aplikacja)', false, false, false, false, 10)
on conflict (id) do update set name = excluded.name;

create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  person uuid references public.people (id) on delete set null,
  title text not null,
  body text not null default '',
  page text not null default '',     -- gdzie (widok, adres)
  device text not null default '',   -- przeglądarka, ekran, wersja aplikacji
  status text not null default 'new' check (status in ('new', 'doing', 'done', 'rejected')),
  assignee uuid references public.people (id) on delete set null,
  note text not null default '',
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated; -- tylko przez funkcje poniżej

-- backlog widzą i prowadzą: administrator i deweloperzy
create or replace function public.can_backlog() returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('manage') or exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'dev' = any (p.roles))
$$;
revoke all on function public.can_backlog() from public, anon;
grant execute on function public.can_backlog() to authenticated;

create or replace function public.bug_report(t text, b text default '', pg text default '', dev text default '') returns bigint
language plpgsql security definer set search_path = public as $$
declare rid bigint; who text;
begin
  if auth.uid() is null or not exists (select 1 from people where id = auth.uid()) then raise exception 'Zaloguj się, żeby zgłosić błąd.'; end if;
  if coalesce(trim(t), '') = '' then raise exception 'Wpisz, czego dotyczy zgłoszenie.'; end if;
  if (select count(*) from bug_reports where person = auth.uid() and created > now() - interval '1 hour') >= 20 then raise exception 'Za dużo zgłoszeń naraz — spróbuj za chwilę.'; end if;
  insert into bug_reports (person, title, body, page, device) values (auth.uid(), left(trim(t), 160), left(coalesce(b, ''), 4000), left(coalesce(pg, ''), 300), left(coalesce(dev, ''), 300))
  returning id into rid;
  select coalesce(nullif(name, ''), split_part(email, '@', 1)) into who from people where id = auth.uid();
  perform inbox_add(array(select p.id from people p join ranks r on r.id = any (p.roles)
      where p.status = 'active' and (r.manage or r.id = 'dev') and p.id <> auth.uid() group by p.id),
    'Zgłoszenie: ' || left(trim(t), 100), 'Od: ' || who, './zgloszenia');
  return rid;
end $$;
revoke all on function public.bug_report(text, text, text, text) from public, anon;
grant execute on function public.bug_report(text, text, text, text) to authenticated;

-- lista: backlog — wszystkie; pozostali — tylko swoje
create or replace function public.bugs_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare all_ boolean := can_backlog();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'title', b.title, 'body', b.body, 'page', b.page, 'device', b.device, 'status', b.status, 'note', b.note,
      'created', b.created, 'updated', b.updated, 'mine', b.person = auth.uid(),
      'reporter', coalesce(nullif(r.name, ''), split_part(r.email, '@', 1)), 'assignee', b.assignee,
      'assigneeName', coalesce(nullif(a.name, ''), split_part(a.email, '@', 1))) order by
      case b.status when 'new' then 0 when 'doing' then 1 else 2 end, b.created desc)
    from bug_reports b left join people r on r.id = b.person left join people a on a.id = b.assignee
    where all_ or b.person = auth.uid()), '[]'::jsonb);
end $$;
revoke all on function public.bugs_list() from public, anon;
grant execute on function public.bugs_list() to authenticated;

-- osoby do przypisania (administratorzy i deweloperzy)
create or replace function public.backlog_people() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from people p
  where can_backlog() and p.status = 'active' and exists (select 1 from ranks r where r.id = any (p.roles) and (r.manage or r.id = 'dev'))
  order by 2
$$;
revoke all on function public.backlog_people() from public, anon;
grant execute on function public.backlog_people() to authenticated;

create or replace function public.bug_update(bid bigint, st text default null, who uuid default null, nt text default null, unassign boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare old bug_reports;
begin
  if not can_backlog() then raise exception 'Zgłoszenia prowadzą administrator i deweloperzy.'; end if;
  select * into old from bug_reports where id = bid;
  if old.id is null then raise exception 'Nie ma takiego zgłoszenia.'; end if;
  update bug_reports set status = coalesce(st, status), assignee = case when unassign then null else coalesce(who, assignee) end,
    note = coalesce(nt, note), updated = now() where id = bid;
  if st in ('done', 'rejected') and st is distinct from old.status and old.person is not null and old.person <> auth.uid() then
    perform inbox_add(array[old.person], case st when 'done' then 'Zrobione: ' else 'Zgłoszenie: ' end || left(old.title, 100),
      case st when 'done' then 'Dziękujemy — poprawka jest już w aplikacji.' else 'Tym razem tego nie zmienimy.' end || case when coalesce(nt, '') <> '' then ' ' || left(nt, 200) else '' end,
      './zgloszenia');
  end if;
end $$;
revoke all on function public.bug_update(bigint, text, uuid, text, boolean) from public, anon;
grant execute on function public.bug_update(bigint, text, uuid, text, boolean) to authenticated;
