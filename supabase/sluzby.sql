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

-- Służba: administrator tworzy i zmienia wszystko; lider — opis i „szukamy chętnych”.
create or replace function public.ministry_save(mid text, new_name text, new_description text, new_seeking boolean, new_leaders uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if has_flag('manage') then
    if length(trim(coalesce(new_name, ''))) = 0 then raise exception 'Wpisz nazwę służby.'; end if;
    insert into ministries (id, name, description, seeking, leader_ids) values (mid, trim(new_name), coalesce(new_description, ''), coalesce(new_seeking, false), coalesce(new_leaders, '{}'))
    on conflict (id) do update set name = excluded.name, description = excluded.description, seeking = excluded.seeking, leader_ids = excluded.leader_ids, updated = now();
  elsif is_ministry_leader(mid) then
    update ministries set description = coalesce(new_description, description), seeking = coalesce(new_seeking, seeking), updated = now() where id = mid;
  else raise exception 'Służby zmienia administrator albo lider służby.'; end if;
end $$;
create or replace function public.ministry_delete(mid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_flag('manage') then raise exception 'Służby usuwa administrator.'; end if;
  delete from ministries where id = mid;
end $$;

-- Lista osób do wyboru liderów (administrator).
create or replace function public.member_names() returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_flag('manage') then raise exception 'Tylko administrator.'; end if;
  return query select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from people p where p.status = 'active' order by 2;
end $$;

revoke all on function public.is_ministry_leader(text), public.ministry_board(), public.ministry_join(text), public.ministry_leave(text),
  public.ministry_decide(text, uuid, boolean), public.ministry_save(text, text, text, boolean, uuid[]), public.ministry_delete(text), public.member_names() from public, anon;
grant execute on function public.ministry_board(), public.ministry_join(text), public.ministry_leave(text),
  public.ministry_decide(text, uuid, boolean), public.ministry_save(text, text, text, boolean, uuid[]), public.ministry_delete(text), public.member_names() to authenticated;
