-- Powiadomienia w aplikacji (dzwonek): zawsze włączone. Telefon (Web Push) i e-mail to dodatkowe kanały,
-- które każdy włącza sam. Wpisy dodaje tylko baza (funkcje poniżej i wyzwalacze) — osoba czyta swoje
-- i oznacza je jako przeczytane. Uruchamiaj po zatwierdzanie.sql i sluzby.sql.
create table if not exists public.inbox (
  id bigint generated always as identity primary key,
  person uuid not null references public.people (id) on delete cascade,
  title text not null,
  body text not null default '',
  url text not null default '',
  created timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists inbox_person on public.inbox (person, created desc);
alter table public.inbox enable row level security;
revoke all on public.inbox from anon, authenticated;
grant select, delete on public.inbox to authenticated;
grant update (read) on public.inbox to authenticated;
drop policy if exists inbox_own_read on public.inbox;
drop policy if exists inbox_own_update on public.inbox;
drop policy if exists inbox_own_delete on public.inbox;
create policy inbox_own_read on public.inbox for select to authenticated using (person = auth.uid());
create policy inbox_own_update on public.inbox for update to authenticated using (person = auth.uid()) with check (person = auth.uid());
create policy inbox_own_delete on public.inbox for delete to authenticated using (person = auth.uid());

-- Wewnętrzne: wpis dla wielu osób (tylko zatwierdzonych, bez autora); stare wpisy (ponad 90 dni) znikają.
create or replace function public.inbox_add(targets uuid[], t text, b text, u text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from inbox where created < now() - interval '90 days';
  insert into inbox (person, title, body, url)
    select p.id, left(coalesce(t, ''), 160), left(coalesce(b, ''), 400), left(coalesce(u, ''), 300)
    from people p where p.id = any (targets) and p.status = 'active' and p.id is distinct from auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.inbox_add(uuid[], text, text, text) from public, anon, authenticated;

-- Powiadomienie do wybranych osób (twórca wydarzenia/ogłoszenia z prawem edycji).
create or replace function public.inbox_send(targets uuid[], title text, body text, url text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not has_flag('edit') then raise exception 'Powiadomienia wysyłają osoby z prawem edycji.'; end if;
  return inbox_add(targets, title, body, url);
end $$;
revoke all on function public.inbox_send(uuid[], text, text, text) from public, anon;
grant execute on function public.inbox_send(uuid[], text, text, text) to authenticated;

-- Nowe zgłoszenie (wydarzenie/ogłoszenie czekające na zatwierdzenie) → zatwierdzający.
create or replace function public.inbox_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform inbox_add(array(select distinct p.id from people p join ranks r on r.id = any (p.roles) where p.status = 'active' and r.approve),
      'Nowe zgłoszenie do zatwierdzenia',
      coalesce(nullif(new.data ->> 'title', ''), case when tg_table_name = 'events' then 'Wydarzenie' else 'Ogłoszenie' end),
      case when tg_table_name = 'events' then './?wydarzenie=' else './?ogloszenie=' end || new.id);
  end if;
  return new;
end $$;
drop trigger if exists events_inbox on public.events;
create trigger events_inbox after insert or update on public.events for each row execute function public.inbox_review();
drop trigger if exists announcements_inbox on public.announcements;
create trigger announcements_inbox after insert or update on public.announcements for each row execute function public.inbox_review();

-- Zgłoszenie do służby → liderzy tej służby (bez liderów — administratorzy); decyzja → zgłaszający.
create or replace function public.inbox_ministry() returns trigger
language plpgsql security definer set search_path = public as $$
declare m ministries; who text;
begin
  select * into m from ministries where id = coalesce(new.ministry_id, old.ministry_id);
  if m.id is null then return null; end if;
  if tg_op = 'INSERT' and new.status = 'pending' then
    select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) into who from people p where p.id = new.person;
    perform inbox_add(case when cardinality(m.leader_ids) > 0 then m.leader_ids
                      else array(select distinct p.id from people p join ranks r on r.id = any (p.roles) where p.status = 'active' and r.manage) end,
      'Zgłoszenie do służby: ' || m.name, who || ' chce się zaangażować — zaakceptuj albo odrzuć.', './?sluzby=1');
  elsif tg_op = 'INSERT' and new.status = 'active' and new.person is distinct from auth.uid() then
    perform inbox_add(array[new.person], 'Dodano Cię do służby: ' || m.name, 'Lider dodał Cię do tej służby.', './?sluzby=1');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
    perform inbox_add(array[new.person], 'Przyjęto Cię do służby: ' || m.name, 'Lider zaakceptował Twoje zgłoszenie.', './?sluzby=1');
  elsif tg_op = 'DELETE' and old.person is distinct from auth.uid() then
    perform inbox_add(array[old.person], 'Służba: ' || m.name, case when old.status = 'pending' then 'Lider nie przyjął zgłoszenia tym razem.' else 'Lider usunął Cię z tej służby.' end, './?sluzby=1');
  end if;
  return null;
end $$;
drop trigger if exists ministry_members_inbox on public.ministry_members;
create trigger ministry_members_inbox after insert or update or delete on public.ministry_members for each row execute function public.inbox_ministry();
