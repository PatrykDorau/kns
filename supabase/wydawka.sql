-- Wydawka: członkowie oddają rzeczy za darmo (w „Ogłoszeniach”). Jedna wydawka (tytuł, opis, gdzie odebrać) ma kilka
-- przedmiotów — każdy ze zdjęciem i liczbą sztuk. Na każdy przedmiot osobna kolejka: pierwsze osoby (tyle, ile sztuk)
-- biorą, kolejne są na liście rezerwowej. Gdy ktoś zrezygnuje albo oddający go skreśli, następna osoba z rezerwy dostaje
-- powiadomienie, że teraz jej kolej. Oddający widzi, kto się zapisał, i zaznacza „wydane”.
-- Tylko przez funkcje (security definer). Uruchamiać po schema.sql, zatwierdzanie.sql i skrzynka.sql. Można wielokrotnie
-- (także na bazie z poprzednią wersją — jedna rzecz na wydawkę: przenosi ją jako przedmiot).
create table if not exists public.giveaways (
  id text primary key,
  owner uuid not null references public.people (id) on delete cascade,
  title text not null,
  description text not null default '',
  image text not null default '',
  place text not null default '',
  qty int not null default 1 check (qty between 1 and 99),
  closed boolean not null default false,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create table if not exists public.giveaway_items (
  id text primary key,
  giveaway_id text not null references public.giveaways (id) on delete cascade,
  title text not null,
  image text not null default '',
  qty int not null default 1 check (qty between 1 and 99),
  sort int not null default 0
);
create index if not exists giveaway_items_g on public.giveaway_items (giveaway_id, sort);
create table if not exists public.giveaway_claims (
  giveaway_id text not null references public.giveaways (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  note text not null default '',
  given boolean not null default false,
  created timestamptz not null default now()
);
-- przejście z poprzedniej wersji: zapisy na konkretny przedmiot
alter table public.giveaway_claims add column if not exists item_id text references public.giveaway_items (id) on delete cascade;
insert into public.giveaway_items (id, giveaway_id, title, image, qty)
  select g.id || '-1', g.id, g.title, g.image, g.qty from public.giveaways g
  where not exists (select 1 from public.giveaway_items i where i.giveaway_id = g.id)
  on conflict (id) do nothing;
update public.giveaway_claims c set item_id = c.giveaway_id || '-1' where c.item_id is null;
alter table public.giveaway_claims alter column item_id set not null;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'giveaway_claims_pkey'
             and pg_get_constraintdef(oid) not like '%item_id%') then
    alter table public.giveaway_claims drop constraint giveaway_claims_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'giveaway_claims_pkey') then
    alter table public.giveaway_claims add constraint giveaway_claims_pkey primary key (item_id, person);
  end if;
end $$;
alter table public.giveaways enable row level security;
alter table public.giveaway_items enable row level security;
alter table public.giveaway_claims enable row level security;
revoke all on public.giveaways, public.giveaway_items, public.giveaway_claims from anon, authenticated;

-- poprzednie wersje funkcji (inne parametry)
drop function if exists public.giveaway_takers(text);
drop function if exists public.giveaway_promote(text, uuid[]);
drop function if exists public.giveaway_save(text, text, text, text, text, int, boolean);
drop function if exists public.giveaway_claim(text, text);
drop function if exists public.giveaway_unclaim(text);
drop function if exists public.giveaway_drop(text, uuid);
drop function if exists public.giveaway_given(text, uuid, boolean);

-- czy mogę zmieniać tę wydawkę: oddający albo osoba z prawem edycji
create or replace function public.giveaway_mine(gid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from giveaways g where g.id = gid and g.owner = auth.uid()) or has_flag('edit')
$$;
-- kto teraz bierze przedmiot: pierwsze „qty” osób (wydane najpierw, potem w kolejności zapisu)
create or replace function public.giveaway_item_takers(iid text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(select c.person from giveaway_claims c where c.item_id = iid
    order by c.given desc, c.created, c.person limit (select qty from giveaway_items where id = iid)), '{}')
$$;
-- po zmianie kolejki: ci, którzy właśnie weszli do biorących, dostają powiadomienie
create or replace function public.giveaway_item_promote(iid text, before uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare t text; gid text; fresh uuid[];
begin
  select i.title, i.giveaway_id into t, gid from giveaway_items i where i.id = iid;
  if gid is null or (select closed from giveaways where id = gid) then return; end if;
  fresh := array(select x from unnest(giveaway_item_takers(iid)) x where not x = any (coalesce(before, '{}')));
  if cardinality(fresh) > 0 then
    perform inbox_add(fresh, 'Wydawka: teraz Twoja kolej', '„' || t || '” — możesz odebrać. Umów się z oddającym.', './?wydawka=' || gid);
  end if;
end $$;
-- wszystkie sztuki wszystkich przedmiotów wydane → wydawka zamknięta
create or replace function public.giveaway_check_closed(gid text) returns void
language sql security definer set search_path = public as $$
  update giveaways g set closed = true, updated = now() where g.id = gid and not g.closed
    and not exists (select 1 from giveaway_items i where i.giveaway_id = gid
      and (select count(*) from giveaway_claims c where c.item_id = i.id and c.given) < i.qty)
$$;
revoke all on function public.giveaway_item_promote(text, uuid[]), public.giveaway_check_closed(text) from public, anon, authenticated;

-- lista: otwarte, zamknięte z ostatnich 14 dni i wszystkie moje
create or replace function public.giveaway_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Wydawka jest dla zatwierdzonych członków.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'title', g.title, 'description', g.description, 'place', g.place, 'closed', g.closed, 'created', g.created,
      'owner', coalesce(nullif(o.name, ''), split_part(o.email, '@', 1)),
      'mine', g.owner = auth.uid(), 'canEdit', giveaway_mine(g.id),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'title', i.title, 'image', i.image, 'qty', i.qty,
          'count', (select count(*) from giveaway_claims c where c.item_id = i.id),
          'given', (select count(*) from giveaway_claims c where c.item_id = i.id and c.given),
          -- moje miejsce w kolejce (1 = pierwszy); biorę, gdy miejsce <= liczba sztuk
          'myPos', (select k.pos from (select c.person, row_number() over (order by c.given desc, c.created, c.person) pos
                     from giveaway_claims c where c.item_id = i.id) k where k.person = auth.uid()),
          'myGiven', (select c.given from giveaway_claims c where c.item_id = i.id and c.person = auth.uid()),
          -- kto się zapisał — widzi oddający (i osoby z prawem edycji)
          'claims', case when giveaway_mine(g.id) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
                      'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'note', c.note, 'given', c.given)
                      order by c.given desc, c.created, c.person)
                    from giveaway_claims c join people p on p.id = c.person where c.item_id = i.id), '[]'::jsonb) end
        ) order by i.sort, i.id) from giveaway_items i where i.giveaway_id = g.id), '[]'::jsonb)
    ) order by g.closed, g.created desc)
    from giveaways g join people o on o.id = g.owner
    where not g.closed or g.updated > now() - interval '14 days' or g.owner = auth.uid()), '[]'::jsonb);
end $$;

-- dodanie / zmiana (oddający): przedmioty jako [{ id, title, image, qty }]; usunięte z listy znikają razem z zapisami
create or replace function public.giveaway_save(gid text, new_title text, new_description text, new_place text, new_items jsonb, new_closed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare it jsonb; k int := 0; iid text; befores jsonb := '{}'::jsonb; t text;
begin
  if not is_active() then raise exception 'Wydawka jest dla zatwierdzonych członków.'; end if;
  if coalesce(trim(new_title), '') = '' then raise exception 'Podaj, co oddajesz.'; end if;
  if jsonb_typeof(new_items) is distinct from 'array' or jsonb_array_length(new_items) = 0 then raise exception 'Dodaj co najmniej jeden przedmiot.'; end if;
  if jsonb_array_length(new_items) > 30 then raise exception 'Najwyżej 30 przedmiotów w jednej wydawce.'; end if;
  if exists (select 1 from giveaways where id = gid) then
    if not giveaway_mine(gid) then raise exception 'Zmienia oddający.'; end if;
    select jsonb_object_agg(i.id, to_jsonb(giveaway_item_takers(i.id))) into befores from giveaway_items i where i.giveaway_id = gid;
    update giveaways set title = left(trim(new_title), 120), description = left(coalesce(new_description, ''), 2000),
      place = left(coalesce(new_place, ''), 200), closed = coalesce(new_closed, false), updated = now() where id = gid;
  else
    insert into giveaways (id, owner, title, description, place)
    values (gid, auth.uid(), left(trim(new_title), 120), left(coalesce(new_description, ''), 2000), left(coalesce(new_place, ''), 200));
  end if;
  -- przedmioty z listy (pusta nazwa — nazwa wydawki)
  delete from giveaway_items i where i.giveaway_id = gid
    and not i.id = any (array(select x ->> 'id' from jsonb_array_elements(new_items) x where coalesce(x ->> 'id', '') <> ''));
  for it in select * from jsonb_array_elements(new_items) loop
    iid := coalesce(nullif(it ->> 'id', ''), gid || '-' || substr(md5(random()::text), 1, 8));
    t := coalesce(nullif(trim(it ->> 'title'), ''), trim(new_title));
    if exists (select 1 from giveaway_items where id = iid and giveaway_id <> gid) then raise exception 'Błędny przedmiot.'; end if;
    insert into giveaway_items (id, giveaway_id, title, image, qty, sort)
    values (iid, gid, left(t, 120), left(coalesce(it ->> 'image', ''), 500), greatest(1, least(99, coalesce((it ->> 'qty')::int, 1))), k)
    on conflict (id) do update set title = excluded.title, image = excluded.image, qty = excluded.qty, sort = excluded.sort;
    k := k + 1;
    -- więcej sztuk → kolejni z rezerwy dostają powiadomienie
    if befores ? iid then perform giveaway_item_promote(iid, array(select jsonb_array_elements_text(befores -> iid))::uuid[]); end if;
  end loop;
end $$;

create or replace function public.giveaway_delete(gid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not giveaway_mine(gid) then raise exception 'Usuwa oddający.'; end if;
  delete from giveaways where id = gid;
end $$;

-- zapis po przedmiot (biorę albo rezerwa) — oddający dostaje powiadomienie
create or replace function public.giveaway_claim(iid text, new_note text) returns int
language plpgsql security definer set search_path = public as $$
declare g giveaways; i giveaway_items; pos int; who text;
begin
  if not is_active() then raise exception 'Wydawka jest dla zatwierdzonych członków.'; end if;
  select * into i from giveaway_items where id = iid;
  select * into g from giveaways where id = i.giveaway_id;
  if g.id is null then raise exception 'Tej rzeczy już nie ma.'; end if;
  if g.closed then raise exception 'Wydawka jest już zamknięta.'; end if;
  if g.owner = auth.uid() then raise exception 'To Twoja wydawka.'; end if;
  insert into giveaway_claims (giveaway_id, item_id, person, note) values (g.id, iid, auth.uid(), left(coalesce(new_note, ''), 300))
    on conflict (item_id, person) do update set note = excluded.note;
  select k.pos into pos from (select c.person, row_number() over (order by c.given desc, c.created, c.person) pos
    from giveaway_claims c where c.item_id = iid) k where k.person = auth.uid();
  select coalesce(nullif(name, ''), split_part(email, '@', 1)) into who from people where id = auth.uid();
  perform inbox_add(array[g.owner], 'Wydawka: ' || i.title,
    who || case when pos <= i.qty then ' chce to wziąć.' else ' zapisał(a) się na listę rezerwową (' || (pos - i.qty) || '.).' end,
    './?wydawka=' || g.id);
  return pos;
end $$;

-- rezygnacja (moja) — następny z rezerwy dostaje powiadomienie
create or replace function public.giveaway_unclaim(iid text) returns void
language plpgsql security definer set search_path = public as $$
declare before uuid[] := giveaway_item_takers(iid);
begin
  delete from giveaway_claims where item_id = iid and person = auth.uid() and not given;
  perform giveaway_item_promote(iid, before);
end $$;

-- oddający: skreśla osobę (np. się nie zgłosiła) — ona i następny z rezerwy dostają powiadomienie
create or replace function public.giveaway_drop(iid text, who uuid) returns void
language plpgsql security definer set search_path = public as $$
declare before uuid[] := giveaway_item_takers(iid); i giveaway_items;
begin
  select * into i from giveaway_items where id = iid;
  if i.id is null or not giveaway_mine(i.giveaway_id) then raise exception 'Skreśla oddający.'; end if;
  delete from giveaway_claims where item_id = iid and person = who;
  if found then perform inbox_add(array[who], 'Wydawka: ' || i.title, 'Oddający przekazał rzecz komuś innemu.', './?wydawka=' || i.giveaway_id); end if;
  perform giveaway_item_promote(iid, before);
end $$;

-- oddający: wydane (albo cofnięcie) — gdy wydano wszystko, wydawka się zamyka
create or replace function public.giveaway_given(iid text, who uuid, val boolean) returns void
language plpgsql security definer set search_path = public as $$
declare gid text;
begin
  select giveaway_id into gid from giveaway_items where id = iid;
  if gid is null or not giveaway_mine(gid) then raise exception 'Wydanie zaznacza oddający.'; end if;
  update giveaway_claims set given = coalesce(val, true) where item_id = iid and person = who;
  update giveaways set updated = now() where id = gid;
  perform giveaway_check_closed(gid);
end $$;

revoke all on function public.giveaway_mine(text), public.giveaway_item_takers(text), public.giveaway_board(),
  public.giveaway_save(text, text, text, text, jsonb, boolean), public.giveaway_delete(text), public.giveaway_claim(text, text),
  public.giveaway_unclaim(text), public.giveaway_drop(text, uuid), public.giveaway_given(text, uuid, boolean) from public, anon;
grant execute on function public.giveaway_board(), public.giveaway_save(text, text, text, text, jsonb, boolean),
  public.giveaway_delete(text), public.giveaway_claim(text, text), public.giveaway_unclaim(text),
  public.giveaway_drop(text, uuid), public.giveaway_given(text, uuid, boolean) to authenticated;
revoke all on function public.giveaway_mine(text), public.giveaway_item_takers(text) from authenticated;
