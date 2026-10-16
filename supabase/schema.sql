-- KNS Nabo — baza danych (Supabase). Wklej całość w Supabase → SQL Editor → Run.
-- Odpowiada temu, co dziś jest na Dysku Google: osoby i rangi, nabożeństwa, pieśni, wydarzenia, szablony,
-- protokoły, ogłoszenia, telefony do powiadomień. Pliki (zdjęcia, filmy, prezentacje) zostają na Dysku.
-- Dostępu pilnuje sama baza (RLS) — tak jak dziś pilnuje go Dysk: nowa osoba czeka na zatwierdzenie,
-- a rangi decydują, kto co widzi i zmienia. Skrypt można uruchomić ponownie (nie kasuje danych).
--
-- PRZED URUCHOMIENIEM: na samym dole wpisz adres administratora (zamiast wpisz.adres@gmail.com).

/* ---------- rangi ---------- */
create table if not exists public.ranks (
  id text primary key,
  name text not null,
  can_edit boolean not null default false,   -- nabożeństwa, pieśni, wydarzenia, ogłoszenia
  council boolean not null default false,    -- rada zboru: protokoły i ogłoszenia rady, komunikaty
  protocols boolean not null default false,  -- pisze protokoły spotkań członkowskich
  manage boolean not null default false,     -- zatwierdza osoby i nadaje rangi
  sort int not null default 0
);
insert into public.ranks (id, name, can_edit, council, protocols, manage, sort) values
  ('czlonek', 'Członek', false, false, false, false, 1),
  ('lider', 'Lider', true, false, false, false, 2),
  ('organizator', 'Organizator nabożeństw', true, false, false, false, 3),
  ('technika', 'Technika (rzutnik, stream)', true, false, false, false, 4),
  ('protokolant', 'Protokolant', false, false, true, false, 5),
  ('rada', 'Członek rady zboru', true, true, false, false, 6),
  ('pastor', 'Pastor', true, true, false, false, 7),
  ('admin', 'Administrator', true, true, true, true, 8)
on conflict (id) do update set name = excluded.name, can_edit = excluded.can_edit, council = excluded.council,
  protocols = excluded.protocols, manage = excluded.manage, sort = excluded.sort;

/* ---------- osoby ---------- */
-- Adresy, które przy pierwszym logowaniu od razu są administratorami.
create table if not exists public.admin_emails (email text primary key);

create table if not exists public.people (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  roles text[] not null default '{}',
  newsletter boolean not null default false,
  requested timestamptz not null default now(),
  changed timestamptz,
  changed_by text
);

-- Pomocnicze: kim jest zalogowany i co mu wolno (security definer — działa mimo RLS na „people”).
create or replace function public.has_flag(flag text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from people p join ranks r on r.id = any (p.roles)
    where p.id = auth.uid() and p.status = 'active'
      and case flag when 'edit' then r.can_edit when 'council' then r.council
                    when 'protocols' then r.protocols when 'manage' then r.manage else false end)
$$;
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where id = auth.uid() and status = 'active')
$$;

-- Pierwsze logowanie (konto Google) → prośba o dostęp; adresy z admin_emails od razu jako administrator.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare admin boolean := exists (select 1 from admin_emails where lower(email) = lower(new.email));
begin
  insert into people (id, email, name, status, roles)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
          case when admin then 'active' else 'pending' end,
          case when admin then array['czlonek', 'admin'] else '{}'::text[] end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_new_user();

-- Zatwierdzanie, odrzucanie, rangi — tylko administrator; ostatni administrator nie może odebrać sobie uprawnień.
create or replace function public.set_person(person_email text, new_status text default null, new_roles text[] default null)
returns public.people language plpgsql security definer set search_path = public as $$
declare p people;
begin
  if not has_flag('manage') then raise exception 'Tylko administrator może zarządzać osobami.'; end if;
  select * into p from people where email = lower(person_email);
  if not found then raise exception 'Nie ma takiej osoby.'; end if;
  if new_status is not null then
    if new_status not in ('pending', 'active', 'rejected') then raise exception 'Nieznany status.'; end if;
    p.status := new_status;
  end if;
  if new_roles is not null then p.roles := array(select r from unnest(new_roles) r where r in (select id from ranks)); end if;
  if p.status = 'active' and cardinality(p.roles) = 0 then p.roles := array['czlonek']; end if;
  if p.id = auth.uid() and not (p.status = 'active' and exists (select 1 from ranks where id = any (p.roles) and manage))
     and not exists (select 1 from people x join ranks r on r.id = any (x.roles)
                     where x.id <> p.id and x.status = 'active' and r.manage) then
    raise exception 'Musi zostać przynajmniej jeden administrator.';
  end if;
  update people set status = p.status, roles = p.roles, changed = now(),
    changed_by = (select email from people where id = auth.uid())
  where id = p.id returning * into p;
  return p;
end $$;

-- Newsletter: każdy zatwierdzony zapisuje się i wypisuje sam.
create or replace function public.set_newsletter(enabled boolean) returns public.people
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  if not is_active() then raise exception 'Newsletter jest dla zatwierdzonych członków.'; end if;
  update people set newsletter = enabled where id = auth.uid() returning * into p;
  return p;
end $$;

/* ---------- dane kościoła ---------- */
-- Każdy rekord trzyma ten sam JSON co dziś pliki na Dysku (pole data), a pola potrzebne do filtrowania
-- i do reguł dostępu są osobnymi kolumnami. „updated” (ms) — do wykrywania równoczesnej edycji, jak dziś.
create table if not exists public.services (
  id text primary key,
  date date,
  data jsonb not null,
  updated bigint not null default 0,
  updated_by text
);
create table if not exists public.songs (
  id text primary key,
  number text not null default '',
  title text not null,
  text text not null default '',
  updated bigint not null default 0,
  deleted boolean not null default false   -- usunięte zostają jako znacznik, żeby nie wróciły z innego komputera
);
create table if not exists public.events (
  id text primary key,
  type text not null default 'inne',
  date date,
  is_public boolean,                        -- null = według rodzaju (członkowskie i rady — nie dla gości)
  data jsonb not null,
  updated bigint not null default 0,
  updated_by text
);
create table if not exists public.templates (
  id text primary key default 'main',
  types jsonb not null,
  updated bigint not null default 0,
  updated_by text
);
create table if not exists public.protocols (
  id text primary key,
  kind text not null check (kind in ('czlonkowskie', 'rada')),
  event_id text,
  date date,
  status text not null default 'szkic' check (status in ('szkic', 'do-akceptacji', 'zatwierdzony')),
  data jsonb not null,
  updated bigint not null default 0,
  updated_by text
);
create table if not exists public.announcements (
  id text primary key,
  audience text not null default 'members' check (audience in ('public', 'members', 'council')),
  important boolean not null default false,
  until date,
  data jsonb not null,
  updated bigint not null default 0,
  updated_by text
);
create table if not exists public.push_devices (
  id text primary key,                      -- identyfikator telefonu (jak dziś nazwa pliku w „powiadomienia”)
  person uuid not null default auth.uid() references public.people (id) on delete cascade,
  data jsonb not null,                      -- subskrypcja Web Push i wybrany dzień/godzina przypomnienia
  updated timestamptz not null default now()
);

/* ---------- reguły dostępu (RLS) ---------- */
alter table public.ranks enable row level security;
alter table public.admin_emails enable row level security;
alter table public.people enable row level security;
alter table public.services enable row level security;
alter table public.songs enable row level security;
alter table public.events enable row level security;
alter table public.templates enable row level security;
alter table public.protocols enable row level security;
alter table public.announcements enable row level security;
alter table public.push_devices enable row level security;

do $$ declare p record; begin
  -- usuwamy stare reguły, żeby skrypt dało się uruchomić ponownie
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
create policy ranks_read on public.ranks for select to authenticated using (true);
-- osoby: każdy widzi siebie, administrator — wszystkich; zmiany tylko przez set_person / set_newsletter
create policy people_read on public.people for select to authenticated using (id = auth.uid() or has_flag('manage'));

-- nabożeństwa, pieśni, wydarzenia, szablony: czytają zatwierdzeni, zmieniają rangi z prawem edycji
create policy services_read on public.services for select to authenticated using (is_active());
create policy services_write on public.services for all to authenticated using (has_flag('edit')) with check (has_flag('edit'));
create policy songs_read on public.songs for select to authenticated using (is_active());
create policy songs_write on public.songs for all to authenticated using (has_flag('edit')) with check (has_flag('edit'));
create policy events_read on public.events for select to authenticated using (is_active());
create policy events_write on public.events for all to authenticated using (has_flag('edit')) with check (has_flag('edit'));
create policy templates_read on public.templates for select to authenticated using (is_active());
create policy templates_write on public.templates for all to authenticated using (has_flag('edit')) with check (has_flag('edit'));

-- protokoły: członkowskie czytają zatwierdzeni, piszą protokolant i rada (zatwierdza); rady — tylko rada
create policy protocols_read on public.protocols for select to authenticated
  using (case kind when 'rada' then has_flag('council') else is_active() end);
create policy protocols_write on public.protocols for all to authenticated
  using (case kind when 'rada' then has_flag('council') else has_flag('protocols') or has_flag('council') end)
  with check (case kind when 'rada' then has_flag('council') else has_flag('protocols') or has_flag('council') end);

-- ogłoszenia: rada — tylko rada; komunikaty rady (important) — piszą rada i pastor; reszta — prawo edycji
create policy announcements_read on public.announcements for select to authenticated
  using (case audience when 'council' then has_flag('council') else is_active() end);
create policy announcements_write on public.announcements for all to authenticated
  using (case when audience = 'council' or important then has_flag('council') else has_flag('edit') end)
  with check (case when audience = 'council' or important then has_flag('council') else has_flag('edit') end);

-- telefony: każdy zatwierdzony zarządza tylko swoimi
create policy push_own on public.push_devices for all to authenticated
  using (person = auth.uid()) with check (person = auth.uid() and is_active());

/* ---------- podgląd publiczny (goście i osoby czekające) ---------- */
-- Tylko to, co bezpieczne: najbliższe 60 dni, wydarzenia otwarte dla gości, ogłoszenia publiczne.
create or replace function public.public_preview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('date', s.date, 'time', s.data ->> 'time', 'place', s.data ->> 'place',
        'sermonTitle', s.data ->> 'sermonTitle', 'passage', s.data ->> 'passage', 'speaker', s.data ->> 'speaker') order by s.date)
      from services s where s.date between current_date and current_date + 60), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'title', e.data ->> 'title', 'date', e.date,
        'time', e.data ->> 'time', 'place', e.data ->> 'place', 'description', e.data ->> 'description') order by e.date)
      from events e where e.date between current_date and current_date + 60
        and coalesce(e.is_public, e.type not in ('czlonkowskie', 'rada'))), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.data ->> 'title', 'text', a.data ->> 'text',
        'important', a.important, 'date', a.data -> 'date') order by a.important desc, a.updated desc)
      from announcements a where a.audience = 'public' and (a.until is null or a.until >= current_date)), '[]'::jsonb),
    'types', coalesce((select jsonb_path_query_array(t.types, '$[*] ? (!exists(@.removed)) ') from templates t where t.id = 'main'), '[]'::jsonb))
$$;

/* ---------- uprawnienia do API (nowe tabele nie są wystawiane automatycznie) ---------- */
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.ranks, public.people to authenticated;
grant select, insert, update, delete on public.services, public.songs, public.events, public.templates,
  public.protocols, public.announcements, public.push_devices to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.has_flag(text), public.is_active(), public.set_person(text, text, text[]),
  public.set_newsletter(boolean) to authenticated;
grant execute on function public.public_preview() to anon, authenticated;

/* ---------- administrator ---------- */
insert into public.admin_emails (email) values ('wpisz.adres@gmail.com') on conflict do nothing;
