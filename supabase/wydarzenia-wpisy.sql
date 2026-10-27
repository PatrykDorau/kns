-- Wpisy pod wydarzeniem (aktualności, ogłoszenia dla uczestników) i osoby zarządzające wydarzeniem.
-- Wpisy dodają: twórca wydarzenia, osoby dodane przez niego do zarządzania i osoby z prawem edycji.
-- Zarządzających dodaje/usuwa twórca albo osoba z prawem edycji. Czytają wszyscy, którzy widzą wydarzenie
-- (ta sama zasada co events_read). Zapisani na wydarzenie (zapisy.sql) dostają nowy wpis do skrzynki.
-- Uruchamiać po zapisy.sql, widocznosc.sql i skrzynka.sql. Można wielokrotnie.

create table if not exists public.event_managers (
  event_id text not null references public.events (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  added timestamptz not null default now(),
  primary key (event_id, person)
);
alter table public.event_managers enable row level security;
revoke all on public.event_managers from public, anon, authenticated; -- tylko przez funkcje poniżej

create table if not exists public.event_posts (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  author uuid references public.people (id) on delete set null,
  text text not null check (length(text) between 1 and 4000),
  created timestamptz not null default now()
);
create index if not exists event_posts_event on public.event_posts (event_id, created desc);
alter table public.event_posts enable row level security;
revoke all on public.event_posts from public, anon, authenticated;

-- czy zalogowany widzi to wydarzenie (jak events_read)
create or replace function public.event_visible(eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and exists (select 1 from events e where e.id = eid
    and (e.status = 'published' or e.created_by = auth.uid() or has_flag('approve'))
    and (e.created_by = auth.uid() or sees_ministries(e.ministries)))
$$;
-- twórca albo prawo edycji — może dodawać zarządzających
create or replace function public.event_owner(eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and (has_flag('edit') or exists (select 1 from events e where e.id = eid and e.created_by = auth.uid()))
$$;
-- twórca, zarządzający albo prawo edycji — może dodawać wpisy
create or replace function public.event_manager(eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select event_owner(eid) or (is_active() and exists (select 1 from event_managers m where m.event_id = eid and m.person = auth.uid()))
$$;
revoke all on function public.event_visible(text) from public, anon, authenticated;
revoke all on function public.event_owner(text) from public, anon, authenticated;
revoke all on function public.event_manager(text) from public, anon, authenticated;

-- Wpisy, zarządzający i moje uprawnienia przy wydarzeniu.
create or replace function public.event_feed(eid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not event_visible(eid) then return null; end if;
  return jsonb_build_object(
    'canPost', event_manager(eid),
    'canManage', event_owner(eid),
    'managers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))) order by m.added)
      from event_managers m join people p on p.id = m.person where m.event_id = eid), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'text', x.text, 'created', x.created,
        'author', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1), 'Usunięte konto'), 'mine', x.author = auth.uid()) order by x.created desc)
      from event_posts x left join people p on p.id = x.author where x.event_id = eid), '[]'::jsonb));
end $$;

-- Nowy wpis; zapisani na wydarzenie dostają go do skrzynki. Zwraca id wpisu.
create or replace function public.event_post_add(eid text, body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; title text; who uuid[];
begin
  if not event_manager(eid) then raise exception 'Wpisy dodaje twórca wydarzenia albo osoba zarządzająca.'; end if;
  if length(trim(coalesce(body, ''))) < 2 then raise exception 'Wpis jest pusty.'; end if;
  insert into event_posts (event_id, author, text) values (eid, auth.uid(), left(trim(body), 4000)) returning id into pid;
  select coalesce(nullif(e.data ->> 'title', ''), 'Wydarzenie') into title from events e where e.id = eid;
  select array_agg(s.person) into who from event_signups s where s.event_id = eid and s.person <> auth.uid();
  if who is not null then perform inbox_add(who, 'Nowy wpis: ' || title, left(trim(body), 300), './?wydarzenie=' || eid); end if;
  return pid;
end $$;

-- Usunięcie wpisu: autor albo twórca / prawo edycji.
create or replace function public.event_post_remove(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare x event_posts;
begin
  select * into x from event_posts where id = pid;
  if x.id is null then return; end if;
  if not (event_owner(x.event_id) or (x.author = auth.uid() and event_manager(x.event_id))) then raise exception 'Ten wpis usuwa jego autor albo twórca wydarzenia.'; end if;
  delete from event_posts where id = pid;
end $$;

-- Dodanie / usunięcie osoby zarządzającej (twórca albo prawo edycji). Nowa osoba dostaje wiadomość do skrzynki.
create or replace function public.event_manager_set(eid text, pid uuid, on_ boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare title text;
begin
  if not event_owner(eid) then raise exception 'Osoby zarządzające dodaje twórca wydarzenia.'; end if;
  if on_ then
    if not exists (select 1 from people where id = pid and status = 'active') then raise exception 'Nie ma takiej osoby.'; end if;
    insert into event_managers (event_id, person) values (eid, pid) on conflict do nothing;
    select coalesce(nullif(e.data ->> 'title', ''), 'Wydarzenie') into title from events e where e.id = eid;
    if pid <> auth.uid() then perform inbox_add(array[pid], 'Zarządzasz wydarzeniem: ' || title, 'Możesz dodawać wpisy pod tym wydarzeniem.', './?wydarzenie=' || eid); end if;
  else
    delete from event_managers where event_id = eid and person = pid;
  end if;
end $$;

-- Osoby do wyboru jako zarządzający (twórca wydarzenia nie musi mieć prawa edycji, więc nie people_directory).
create or replace function public.event_manager_candidates(eid text) returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not event_owner(eid) then raise exception 'Osoby zarządzające wybiera twórca wydarzenia.'; end if;
  return query select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from people p
    where p.status = 'active' order by lower(coalesce(nullif(p.name, ''), p.email));
end $$;

revoke all on function public.event_feed(text) from public, anon;
revoke all on function public.event_post_add(text, text) from public, anon;
revoke all on function public.event_post_remove(uuid) from public, anon;
revoke all on function public.event_manager_set(text, uuid, boolean) from public, anon;
revoke all on function public.event_manager_candidates(text) from public, anon;
grant execute on function public.event_feed(text) to authenticated;
grant execute on function public.event_post_add(text, text) to authenticated;
grant execute on function public.event_post_remove(uuid) to authenticated;
grant execute on function public.event_manager_set(text, uuid, boolean) to authenticated;
grant execute on function public.event_manager_candidates(text) to authenticated;
