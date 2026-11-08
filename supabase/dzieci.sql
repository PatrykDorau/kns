-- Meldowanie dzieci (wzór: Avenit, bez drukarki): rodzic dodaje swoje dzieci (imię, rok urodzenia, alergie),
-- w niedzielę melduje je do sali i dostaje 4-cyfrowy kod odbioru (ten sam dla rodzeństwa tego dnia).
-- Nauczyciele (członkowie służby oznaczonej jako szkółka) widzą listę dzisiejszych sal z alergiami i wydają dziecko
-- po kodzie. Dane dzieci widzi tylko rodzic; nauczyciele — tylko dzieci zameldowane dziś. Tabele zamknięte.
-- Uruchamiać po sluzby.sql, sluzby2.sql, skrzynka.sql. Można wielokrotnie.
alter table public.ministries add column if not exists kids boolean not null default false;
create table if not exists public.kids (
  id text primary key default gen_random_uuid()::text,
  parent uuid not null references public.people (id) on delete cascade,
  name text not null,
  born int check (born between 2000 and 2100),
  allergies text not null default '',
  notes text not null default '',
  created timestamptz not null default now()
);
create table if not exists public.kid_checkins (
  kid text not null references public.kids (id) on delete cascade,
  day date not null,
  room text not null default '',
  code text not null,
  in_at timestamptz not null default now(),
  out_at timestamptz,
  out_by uuid,
  primary key (kid, day)
);
create table if not exists public.kids_settings (id int primary key default 1 check (id = 1), rooms text[] not null default '{}');
insert into public.kids_settings (id, rooms) values (1, '{"Maluchy (2–4)","Przedszkole (5–6)","Szkolne (7–12)"}') on conflict do nothing;
alter table public.kids enable row level security;
alter table public.kid_checkins enable row level security;
alter table public.kids_settings enable row level security;
revoke all on public.kids, public.kid_checkins, public.kids_settings from anon, authenticated;

create or replace function public.kids_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select is_active() and (has_flag('manage') or exists (select 1 from ministries m where m.kids and in_ministry(m.id)))
$$;
create or replace function public.kids_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Warsaw')::date $$;

-- moje dzieci z dzisiejszym meldunkiem, sale, czy jestem nauczycielem
create or replace function public.kids_mine() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Meldowanie dzieci jest dla zatwierdzonych członków.'; end if;
  return jsonb_build_object('teacher', kids_teacher(), 'manage', has_flag('manage'), 'rooms', to_jsonb((select rooms from kids_settings where id = 1)),
    'ministries', case when has_flag('manage') then (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kids', kids) order by sort, name), '[]'::jsonb) from ministries) end,
    'kids', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'born', k.born, 'allergies', k.allergies, 'notes', k.notes,
        'today', (select jsonb_build_object('room', c.room, 'code', c.code, 'in', c.in_at, 'out', c.out_at) from kid_checkins c where c.kid = k.id and c.day = kids_today())) order by k.created)
      from kids k where k.parent = auth.uid()), '[]'::jsonb));
end $$;

create or replace function public.kid_save(k jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare kid_id text := nullif(k ->> 'id', '');
begin
  if not is_active() then raise exception 'Dzieci dodają zatwierdzeni członkowie.'; end if;
  if btrim(coalesce(k ->> 'name', '')) = '' then raise exception 'Wpisz imię dziecka.'; end if;
  if kid_id is null then
    insert into kids (parent, name, born, allergies, notes) values (auth.uid(), left(btrim(k ->> 'name'), 80), nullif(k ->> 'born', '')::int, left(coalesce(k ->> 'allergies', ''), 300), left(coalesce(k ->> 'notes', ''), 500))
    returning id into kid_id;
  else
    update kids set name = left(btrim(k ->> 'name'), 80), born = nullif(k ->> 'born', '')::int, allergies = left(coalesce(k ->> 'allergies', ''), 300), notes = left(coalesce(k ->> 'notes', ''), 500)
    where id = kid_id and parent = auth.uid();
    if not found then raise exception 'To nie jest Twoje dziecko.'; end if;
  end if;
  return kid_id;
end $$;

create or replace function public.kid_delete(kid_id text) returns void
language sql security definer set search_path = public as $$ delete from kids where id = kid_id and parent = auth.uid() $$;

-- meldowanie: rodzic (swoje dzieci) — kod wspólny dla rodzeństwa tego dnia; ponowne zameldowanie po odbiorze — nowy kod
create or replace function public.kid_checkin(kid_ids text[], r text) returns text
language plpgsql security definer set search_path = public as $$
declare c text; rooms text[] := (select rooms from kids_settings where id = 1);
begin
  if not is_active() then raise exception 'Meldowanie jest dla zatwierdzonych członków.'; end if;
  if coalesce(cardinality(kid_ids), 0) = 0 then raise exception 'Zaznacz dziecko.'; end if;
  if exists (select 1 from unnest(kid_ids) x where not exists (select 1 from kids k where k.id = x and k.parent = auth.uid())) then raise exception 'To nie jest Twoje dziecko.'; end if;
  if coalesce(r, '') <> '' and not (r = any (rooms)) then raise exception 'Nie ma takiej sali.'; end if;
  select ch.code into c from kid_checkins ch join kids k on k.id = ch.kid where k.parent = auth.uid() and ch.day = kids_today() and ch.out_at is null limit 1;
  if c is null then
    loop
      c := lpad((floor(random() * 10000))::int::text, 4, '0');
      exit when not exists (select 1 from kid_checkins where day = kids_today() and code = c and out_at is null);
    end loop;
  end if;
  insert into kid_checkins (kid, day, room, code) select x, kids_today(), coalesce(r, ''), c from unnest(kid_ids) x
  on conflict (kid, day) do update set room = excluded.room, code = case when kid_checkins.out_at is null then kid_checkins.code else excluded.code end, in_at = now(), out_at = null, out_by = null;
  return c;
end $$;

-- nauczyciel: dzisiejsze sale — dzieci z alergiami i uwagami, rodzic, stan (w sali / odebrane)
create or replace function public.kids_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not kids_teacher() then raise exception 'Listę sal widzą nauczyciele szkółki.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kid', k.id, 'name', k.name, 'born', k.born, 'allergies', k.allergies, 'notes', k.notes, 'room', c.room,
      'parent', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'in', c.in_at, 'out', c.out_at) order by c.room, c.out_at is not null, k.name)
    from kid_checkins c join kids k on k.id = c.kid join people p on p.id = k.parent where c.day = kids_today()), '[]'::jsonb);
end $$;

-- nauczyciel: odbiór po kodzie — wydaje wszystkie dzieci z tym kodem (rodzeństwo), dzwonek u rodzica
create or replace function public.kid_pickup(c text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare names text; par uuid;
begin
  if not kids_teacher() then raise exception 'Dzieci wydają nauczyciele szkółki.'; end if;
  select string_agg(k.name, ', ' order by k.name), min(k.parent::text)::uuid into names, par from kid_checkins ch join kids k on k.id = ch.kid
  where ch.day = kids_today() and ch.code = btrim(c) and ch.out_at is null;
  if names is null then raise exception 'Nie ma dziecka z takim kodem (albo już odebrane).'; end if;
  update kid_checkins set out_at = now(), out_by = auth.uid() where day = kids_today() and code = btrim(c) and out_at is null;
  perform inbox_add(array[par], 'Odebrano: ' || names, 'Dziecko wydane ze szkółki o ' || to_char(now() at time zone 'Europe/Warsaw', 'HH24:MI') || '.', './dzieci');
  return to_jsonb(names);
end $$;

create or replace function public.kids_rooms_set(r text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not kids_teacher() then raise exception 'Sale ustawiają nauczyciele szkółki.'; end if;
  update kids_settings set rooms = (select coalesce(array_agg(left(btrim(x), 40)), '{}') from unnest(coalesce(r, '{}')) x where btrim(x) <> '') where id = 1;
end $$;

-- administrator: która służba to szkółka (jej członkowie są nauczycielami)
create or replace function public.kids_ministry_set(mid text, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_flag('manage') then raise exception 'Ustawia administrator.'; end if;
  update ministries set kids = coalesce(on_, false) where id = mid;
end $$;

revoke all on function public.kids_teacher(), public.kids_today() from public, anon, authenticated;
revoke all on function public.kids_mine(), public.kid_save(jsonb), public.kid_delete(text), public.kid_checkin(text[], text), public.kids_board(), public.kid_pickup(text),
  public.kids_rooms_set(text[]), public.kids_ministry_set(text, boolean) from public, anon;
grant execute on function public.kids_mine(), public.kid_save(jsonb), public.kid_delete(text), public.kid_checkin(text[], text), public.kids_board(), public.kid_pickup(text),
  public.kids_rooms_set(text[]), public.kids_ministry_set(text, boolean) to authenticated;
