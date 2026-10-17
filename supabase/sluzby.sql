-- Służby (zespół uwielbienia, technika, dzieci, powitanie…): kto w nich służy, kto jest liderem i które szukają
-- nowych chętnych („Zaangażuj się”). Członek zgłasza się sam (czeka na akceptację), lider służby albo administrator
-- akceptuje lub odrzuca. Wszystko przez funkcje poniżej — bezpośredni dostęp do tabel jest zamknięty.
create table if not exists public.ministries (
  id text primary key,
  name text not null,
  description text not null default '',
  seeking boolean not null default false,        -- szuka nowych chętnych
  leader_ids uuid[] not null default '{}',        -- liderzy (akceptują zgłoszenia)
  sort int not null default 0,
  updated timestamptz not null default now()
);
create table if not exists public.ministry_members (
  ministry_id text not null references public.ministries (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created timestamptz not null default now(),
  primary key (ministry_id, person)
);
alter table public.ministries enable row level security;
alter table public.ministry_members enable row level security;
revoke all on public.ministries, public.ministry_members from anon, authenticated;

create or replace function public.is_ministry_leader(mid text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('manage') or exists (select 1 from ministries m where m.id = mid and auth.uid() = any (m.leader_ids))
$$;

-- Osoba z rangą „Lider” (zakłada służby i może być ich liderem).
create or replace function public.has_lider_rank() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'lider' = any (p.roles))
$$;
-- Pełna edycja służby (nazwa, liderzy, usunięcie): administrator albo jej lider z rangą „Lider”.
create or replace function public.ministry_full(mid text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('manage') or (has_lider_rank() and exists (select 1 from ministries m where m.id = mid and auth.uid() = any (m.leader_ids)))
$$;

-- Tablica służb dla zalogowanego: liderzy, służący, moje zgłoszenie; liderom i administratorowi — oczekujący.
create or replace function public.ministry_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Służby są dla zatwierdzonych członków.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'description', m.description, 'seeking', m.seeking,
      'leaders', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))))
                  from people p where p.id = any (m.leader_ids)), '[]'::jsonb),
      'members', coalesce((select jsonb_agg(coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) order by p.name)
                  from ministry_members x join people p on p.id = x.person where x.ministry_id = m.id and x.status = 'active'), '[]'::jsonb),
      'mine', (select x.status from ministry_members x where x.ministry_id = m.id and x.person = auth.uid()),
      'lead', is_ministry_leader(m.id),
      'leader', auth.uid() = any (m.leader_ids),           -- jestem liderem tej służby
      'full', ministry_full(m.id),                          -- mogę zmienić nazwę i liderów, usunąć
      'people', case when is_ministry_leader(m.id) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
                    'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))) order by p.name)
                  from ministry_members x join people p on p.id = x.person where x.ministry_id = m.id and x.status = 'active'), '[]'::jsonb)
                  else '[]'::jsonb end,                     -- liderom: służący z id (do usuwania)
      'pending', case when is_ministry_leader(m.id) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
                    'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'grupa', p.grupa) order by x.created)
                  from ministry_members x join people p on p.id = x.person where x.ministry_id = m.id and x.status = 'pending'), '[]'::jsonb)
                  else '[]'::jsonb end
    ) order by m.seeking desc, m.sort, m.name) from ministries m), '[]'::jsonb);
end $$;

-- Zgłoszenie do służby (czeka na lidera) i rezygnacja.
create or replace function public.ministry_join(mid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Służby są dla zatwierdzonych członków.'; end if;
  insert into ministry_members (ministry_id, person, status) values (mid, auth.uid(), 'pending') on conflict do nothing;
end $$;
create or replace function public.ministry_leave(mid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from ministry_members where ministry_id = mid and person = auth.uid();
end $$;

-- Lider służby albo administrator: akceptacja / odrzucenie (także usunięcie kogoś ze służby).
create or replace function public.ministry_decide(mid text, who uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_ministry_leader(mid) then raise exception 'Zgłoszenia akceptuje lider tej służby albo administrator.'; end if;
  if accept then update ministry_members set status = 'active' where ministry_id = mid and person = who;
  else delete from ministry_members where ministry_id = mid and person = who; end if;
end $$;

-- Lider służby albo administrator dodaje osobę od razu (bez zgłoszenia).
create or replace function public.ministry_add(mid text, who uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_ministry_leader(mid) then raise exception 'Osoby dodaje lider tej służby albo administrator.'; end if;
  if not exists (select 1 from people where id = who and status = 'active') then raise exception 'Tej osoby nie ma wśród członków.'; end if;
  insert into ministry_members (ministry_id, person, status) values (mid, who, 'active')
  on conflict (ministry_id, person) do update set status = 'active';
end $$;
-- Członkowie do wyboru przy dodawaniu (dla liderów służb i administratora).
create or replace function public.ministry_people() returns table (id uuid, name text, grupa text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_flag('manage') or exists (select 1 from ministries m where auth.uid() = any (m.leader_ids))) then
    raise exception 'Osoby dodaje lider służby albo administrator.';
  end if;
  return query select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), p.grupa from people p where p.status = 'active' order by 2;
end $$;

-- Służba: administrator tworzy i zmienia wszystko; osoba z rangą „Lider” zakłada nowe służby (zostaje ich liderem)
-- i zmienia w całości te, którymi kieruje; lider bez tej rangi — tylko opis i „szukamy chętnych”.
create or replace function public.ministry_save(mid text, new_name text, new_description text, new_seeking boolean, new_leaders uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  fresh boolean := not exists (select 1 from ministries where id = mid);
  leaders uuid[] := coalesce(new_leaders, '{}');
begin
  if (fresh and (has_flag('manage') or has_lider_rank())) or (not fresh and ministry_full(mid)) then
    if length(trim(coalesce(new_name, ''))) = 0 then raise exception 'Wpisz nazwę służby.'; end if;
    -- lider zakładający albo zmieniający swoją służbę zostaje jej liderem
    if not has_flag('manage') and not (auth.uid() = any (leaders)) then leaders := leaders || auth.uid(); end if;
    -- liderem służby może być tylko osoba z rangą „Lider”
    if exists (select 1 from unnest(leaders) l where not exists (select 1 from people p where p.id = l and p.status = 'active' and 'lider' = any (p.roles))) then
      raise exception 'Liderem służby może być tylko osoba z rangą Lider.';
    end if;
    insert into ministries (id, name, description, seeking, leader_ids) values (mid, trim(new_name), coalesce(new_description, ''), coalesce(new_seeking, false), leaders)
    on conflict (id) do update set name = excluded.name, description = excluded.description, seeking = excluded.seeking, leader_ids = excluded.leader_ids, updated = now();
  elsif not fresh and is_ministry_leader(mid) then
    update ministries set description = coalesce(new_description, description), seeking = coalesce(new_seeking, seeking), updated = now() where id = mid;
  else raise exception 'Służby zakłada administrator albo osoba z rangą Lider; zmienia — administrator albo lider służby.'; end if;
end $$;
create or replace function public.ministry_delete(mid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not ministry_full(mid) then raise exception 'Służbę usuwa administrator albo jej lider.'; end if;
  delete from ministries where id = mid;
end $$;

-- Osoby do wyboru na liderów służby (administrator, osoba z rangą Lider): tylko z rangą „Lider”.
create or replace function public.member_names() returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_flag('manage') or has_lider_rank()) then raise exception 'Tylko administrator albo lider.'; end if;
  return query select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from people p where p.status = 'active' and 'lider' = any (p.roles) order by 2;
end $$;

-- Powiadomienie o nowym zgłoszeniu: telefony liderów tej służby (bez liderów — administratorów).
-- Wywołuje osoba, która właśnie się zgłosiła (musi mieć oczekujące zgłoszenie do tej służby).
create or replace function public.ministry_targets(mid text) returns table (id text, subscription jsonb, who text, ministry text)
language plpgsql stable security definer set search_path = public as $$
declare m ministries; me text;
begin
  select * into m from ministries where ministries.id = mid;
  if m.id is null or not exists (select 1 from ministry_members x where x.ministry_id = mid and x.person = auth.uid() and x.status = 'pending') then
    raise exception 'Brak zgłoszenia do tej służby.';
  end if;
  select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) into me from people p where p.id = auth.uid();
  return query
    select d.id, d.data -> 'subscription', me, m.name from push_devices d join people p on p.id = d.person
    where p.status = 'active' and d.data ? 'subscription' and p.id <> auth.uid()
      and (p.id = any (m.leader_ids) or (cardinality(m.leader_ids) = 0 and exists (select 1 from ranks r where r.id = any (p.roles) and r.manage)));
end $$;

revoke all on function public.has_lider_rank(), public.ministry_full(text), public.ministry_targets(text), public.ministry_add(text, uuid), public.ministry_people() from public, anon;
grant execute on function public.ministry_targets(text), public.ministry_add(text, uuid), public.ministry_people() to authenticated;
revoke all on function public.is_ministry_leader(text), public.ministry_board(), public.ministry_join(text), public.ministry_leave(text),
  public.ministry_decide(text, uuid, boolean), public.ministry_save(text, text, text, boolean, uuid[]), public.ministry_delete(text), public.member_names() from public, anon;
grant execute on function public.ministry_board(), public.ministry_join(text), public.ministry_leave(text),
  public.ministry_decide(text, uuid, boolean), public.ministry_save(text, text, text, boolean, uuid[]), public.ministry_delete(text), public.member_names() to authenticated;
