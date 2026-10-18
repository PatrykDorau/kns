-- ASB: grafik spotkań studenckich (dawniej arkusz „ASB | GRAFIK”) i lista pomysłów na spotkania.
-- Widzą i zmieniają osoby z rangą „ASB” oraz administrator. Uruchamiaj po zatwierdzanie.sql i skrzynka.sql (pliki: asb-pliki.sql).
insert into public.ranks (id, name, can_edit, council, protocols, manage, sort) values ('asb', 'ASB', false, false, false, false, 9)
on conflict (id) do nothing;

create table if not exists public.asb_meetings (
  id text primary key,
  season text not null,                 -- rok akademicki, np. '2026/2027'
  sort int not null default 0,          -- kolejność w grafiku (także dla wierszy bez daty)
  month text not null default '',       -- np. 'PAŹDZIERNIK', 'LIPIEC (?)'
  date date,
  concept text not null default '',     -- „Co i po co robimy” (koncepcja okresu)
  leader text not null default '',      -- prowadzący
  helper text not null default '',      -- prowadzący pomocniczy
  topic text not null default '',
  place text not null default '',
  attendance int,                       -- frekwencja
  int_date text not null default '',    -- integracje i notatki: data, organizator, pomysł
  int_organizer text not null default '',
  int_idea text not null default '',
  updated timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists asb_meetings_season on public.asb_meetings (season, sort);
create table if not exists public.asb_ideas (
  id text primary key,
  author text not null default '',
  topic text not null,
  created timestamptz not null default now()
);

create or replace function public.is_asb() returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('manage') or exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'asb' = any (p.roles))
$$;
revoke all on function public.is_asb() from public, anon;
grant execute on function public.is_asb() to authenticated;

alter table public.asb_meetings enable row level security;
alter table public.asb_ideas enable row level security;
revoke all on public.asb_meetings, public.asb_ideas from anon, authenticated;
grant select, insert, update, delete on public.asb_meetings, public.asb_ideas to authenticated;
drop policy if exists asb_meetings_all on public.asb_meetings;
drop policy if exists asb_ideas_all on public.asb_ideas;
create policy asb_meetings_all on public.asb_meetings for all to authenticated using (is_asb()) with check (is_asb());
create policy asb_ideas_all on public.asb_ideas for all to authenticated using (is_asb()) with check (is_asb());

/* ---------- rodzaje spotkań, notatki, rozważanie, kalendarz kościelny, przypomnienia ---------- */
-- Rodzaj: cykliczne (cotygodniowe), wewnętrzne (np. organizacyjne — tylko dla ASB), ewangelizacyjne.
alter table public.asb_meetings add column if not exists kind text not null default 'cykliczne';
alter table public.asb_meetings add column if not exists time text not null default '19:00';
alter table public.asb_meetings add column if not exists note text not null default '';      -- notatka
alter table public.asb_meetings add column if not exists study text not null default '';     -- rozważanie dla prowadzącego
alter table public.asb_meetings add column if not exists files jsonb not null default '[]';  -- załączniki [{name, path}] (kosz „asb”, asb-pliki.sql)
alter table public.asb_meetings add column if not exists reminded timestamptz;               -- ostatnie przypomnienie
do $$ begin
  alter table public.asb_meetings add constraint asb_meetings_kind check (kind in ('cykliczne', 'wewnetrzne', 'ewangelizacyjne'));
exception when duplicate_object then null; end $$;

-- Każde spotkanie z datą (bez przerw) samo trafia do kalendarza kościelnego jako wydarzenie „asb_<id>”
-- (rodzaj „Spotkanie studenckie”). Wewnętrzne — tylko dla członków, pozostałe także dla gości.
-- Notatka, rozważanie i załączniki zostają w ASB.
create or replace function public.asb_calendar() returns trigger
language plpgsql security definer set search_path = public as $$
declare m asb_meetings; eid text; label text; title text; ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if tg_op = 'DELETE' then m := old; else m := new; end if;
  eid := 'asb_' || m.id;
  if tg_op = 'UPDATE' and old.id <> new.id then delete from events where id = 'asb_' || old.id; end if;
  if tg_op = 'DELETE' or m.date is null or (m.topic = '' and lower(m.leader) in ('przerwa', 'brak')) then
    delete from events where id = eid;
    return null;
  end if;
  label := case m.kind when 'wewnetrzne' then 'spotkanie wewnętrzne' when 'ewangelizacyjne' then 'spotkanie ewangelizacyjne' else 'spotkanie' end;
  title := 'ASB: ' || coalesce(nullif(m.topic, ''), label);
  perform set_config('kns.sync', 'on', true); -- bez zatwierdzania (zatwierdzanie.sql → moderate)
  insert into events (id, type, date, is_public, status, data, updated, updated_by)
  values (eid, 'studenckie', m.date, m.kind <> 'wewnetrzne', 'published',
    jsonb_build_object('id', eid, 'type', 'studenckie', 'date', m.date, 'time', m.time, 'place', m.place, 'title', title,
      'description', 'ASB — ' || label || case when m.kind = 'cykliczne' then ' (cykliczne)' else '' end || '. Szczegóły w zakładce ASB.',
      'program', '[]'::jsonb, 'public', m.kind <> 'wewnetrzne', 'asb', m.id, 'updated', ms, 'createdBy', 'ASB', 'updatedBy', m.updated_by),
    ms, m.updated_by)
  on conflict (id) do update set type = excluded.type, date = excluded.date, is_public = excluded.is_public, status = 'published',
    data = excluded.data, updated = excluded.updated, updated_by = excluded.updated_by;
  perform set_config('kns.sync', '', true);
  return null;
end $$;
revoke all on function public.asb_calendar() from public, anon, authenticated;
drop trigger if exists asb_meetings_calendar on public.asb_meetings;
create trigger asb_meetings_calendar after insert or update or delete on public.asb_meetings for each row execute function public.asb_calendar();

-- Przypomnienie o spotkaniu w aplikacji (dzwonek, a kto włączył — także na telefon) dla wszystkich z rangą ASB.
create or replace function public.asb_remind(meeting text) returns int
language plpgsql security definer set search_path = public as $$
declare m asb_meetings; n int;
begin
  if not is_asb() then raise exception 'Przypomnienia wysyłają osoby z rangą ASB.'; end if;
  select * into m from asb_meetings where id = meeting;
  if m.id is null then raise exception 'Nie ma takiego spotkania.'; end if;
  n := inbox_add(array(select p.id from people p where p.status = 'active' and 'asb' = any (p.roles)),
    'ASB: ' || coalesce(nullif(m.topic, ''), case m.kind when 'wewnetrzne' then 'spotkanie wewnętrzne' when 'ewangelizacyjne' then 'spotkanie ewangelizacyjne' else 'spotkanie' end),
    concat_ws(' · ', case when m.date is not null then to_char(m.date, 'DD.MM') end, nullif(m.time, ''), nullif(m.place, ''),
      case when m.leader <> '' then 'prowadzi: ' || m.leader end),
    './?asb=' || m.id);
  update asb_meetings set reminded = now() where id = meeting;
  return n;
end $$;
revoke all on function public.asb_remind(text) from public, anon;
grant execute on function public.asb_remind(text) to authenticated;

-- Istniejące spotkania → kalendarz (ponowne uruchomienie tylko odświeża).
update public.asb_meetings set kind = kind;

/* ---------- terminarz dla wszystkich, przypomnienia dla prowadzących ---------- */
-- Terminarz bez logowania (strona /asb dla gości i członków bez rangi ASB): najbliższe pół roku, bez spotkań
-- wewnętrznych i przerw; tylko data, godzina, rodzaj, temat i miejsce (bez prowadzących, notatek i frekwencji).
create or replace function public.asb_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'date', m.date, 'time', m.time, 'kind', m.kind, 'topic', m.topic, 'place', m.place)
    order by m.date, m.sort), '[]'::jsonb)
  from asb_meetings m
  where m.date between current_date - 7 and current_date + 183 and m.kind <> 'wewnetrzne'
    and not (m.topic = '' and lower(m.leader) in ('przerwa', 'brak'))
$$;
revoke all on function public.asb_public() from public;
grant execute on function public.asb_public() to anon, authenticated;

-- Konto prowadzącego: osoba z rangą ASB o tym imieniu i nazwisku albo (jeśli jedna taka) o tym imieniu.
create or replace function public.asb_person(who text) returns uuid
language sql stable security definer set search_path = public as $$
  with c as (select p.id, lower(trim(p.name)) as name from people p
             where p.status = 'active' and 'asb' = any (p.roles) and trim(coalesce(who, '')) <> '')
  select coalesce((select id from c where name = lower(trim(who)) limit 1),
    (select min(id::text)::uuid from c where split_part(name, ' ', 1) = lower(trim(who)) having count(*) = 1))
$$;
revoke all on function public.asb_person(text) from public, anon, authenticated;

-- Osoby z rangą ASB (podpowiedzi „Prowadzący” — kto dostanie przypomnienie).
create or replace function public.asb_people() returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_asb() then raise exception 'Brak dostępu.'; end if;
  return query select p.id, p.name from people p where p.status = 'active' and 'asb' = any (p.roles) and p.name <> '' order by lower(p.name);
end $$;
revoke all on function public.asb_people() from public, anon;
grant execute on function public.asb_people() to authenticated;

-- Przypomnienie dla prowadzącego i pomocnika na 3 dni przed spotkaniem (raz na termin). Wywołuje je codziennie
-- funkcja Netlify (netlify/functions/przypomnienia.mjs) — ponowne wywołanie niczego nie dubluje.
alter table public.asb_meetings add column if not exists leader_reminded date;
create or replace function public.asb_leader_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare m asb_meetings; n int := 0; t uuid[]; d int;
begin
  for m in select * from asb_meetings where date between current_date and current_date + 3 and leader_reminded is distinct from date
           and not (topic = '' and lower(leader) in ('przerwa', 'brak')) order by date loop
    t := array_remove(array[asb_person(m.leader), case when m.helper <> m.leader then asb_person(m.helper) end], null);
    d := m.date - current_date;
    if cardinality(t) > 0 then
      n := n + inbox_add(t, 'Prowadzisz spotkanie ASB ' || case d when 0 then 'dziś' when 1 then 'jutro' else 'za ' || d || ' dni' end,
        concat_ws(' · ', coalesce(nullif(m.topic, ''), 'temat do ustalenia'), to_char(m.date, 'DD.MM'), nullif(m.time, ''), nullif(m.place, ''),
          case when m.study <> '' or m.files <> '[]'::jsonb then 'rozważanie w aplikacji' end),
        './?asb=' || m.id);
    end if;
    update asb_meetings set leader_reminded = m.date where id = m.id;
  end loop;
  return n;
end $$;
revoke all on function public.asb_leader_reminders() from public;
grant execute on function public.asb_leader_reminders() to anon, authenticated;
