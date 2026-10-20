-- Wydawka: członkowie oddają rzeczy za darmo (w „Ogłoszeniach”). Inni zapisują się po rzecz — pierwsze osoby
-- (tyle, ile sztuk) biorą, kolejne są na liście rezerwowej. Gdy ktoś zrezygnuje albo oddający go skreśli, następna osoba
-- z rezerwy dostaje powiadomienie, że teraz jej kolej. Oddający widzi, kto się zapisał, i zaznacza „wydane”.
-- Tylko przez funkcje (security definer). Uruchamiać po schema.sql, zatwierdzanie.sql i skrzynka.sql. Można wielokrotnie.
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
create table if not exists public.giveaway_claims (
  giveaway_id text not null references public.giveaways (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  note text not null default '',
  given boolean not null default false,
  created timestamptz not null default now(),
  primary key (giveaway_id, person)
);
alter table public.giveaways enable row level security;
alter table public.giveaway_claims enable row level security;
revoke all on public.giveaways, public.giveaway_claims from anon, authenticated;

-- czy mogę zmieniać tę wydawkę: oddający albo osoba z prawem edycji
create or replace function public.giveaway_mine(gid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from giveaways g where g.id = gid and g.owner = auth.uid()) or has_flag('edit')
$$;
-- kto teraz bierze: pierwsze „qty” osób (wydane najpierw, potem w kolejności zapisu)
create or replace function public.giveaway_takers(gid text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(select c.person from giveaway_claims c where c.giveaway_id = gid
    order by c.given desc, c.created, c.person limit (select qty from giveaways where id = gid)), '{}')
$$;
-- po zmianie kolejki: ci, którzy właśnie weszli do biorących, dostają powiadomienie
create or replace function public.giveaway_promote(gid text, before uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare t text; now_takers uuid[] := giveaway_takers(gid); fresh uuid[];
begin
  select title into t from giveaways where id = gid;
  fresh := array(select x from unnest(now_takers) x where not x = any (coalesce(before, '{}')));
  if cardinality(fresh) > 0 then
    perform inbox_add(fresh, 'Wydawka: teraz Twoja kolej', '„' || t || '” — możesz odebrać. Umów się z oddającym.', './?wydawka=' || gid);
  end if;
end $$;
revoke all on function public.giveaway_promote(text, uuid[]) from public, anon, authenticated;

-- lista: otwarte, zamknięte z ostatnich 14 dni i wszystkie moje
create or replace function public.giveaway_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Wydawka jest dla zatwierdzonych członków.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'title', g.title, 'description', g.description, 'image', g.image, 'place', g.place,
      'qty', g.qty, 'closed', g.closed, 'created', g.created,
      'owner', coalesce(nullif(o.name, ''), split_part(o.email, '@', 1)),
      'mine', g.owner = auth.uid(), 'canEdit', giveaway_mine(g.id),
      'count', (select count(*) from giveaway_claims c where c.giveaway_id = g.id),
      'given', (select count(*) from giveaway_claims c where c.giveaway_id = g.id and c.given),
      -- moje miejsce w kolejce (1 = pierwszy); biorę, gdy miejsce <= liczba sztuk
      'myPos', (select k.pos from (select c.person, row_number() over (order by c.given desc, c.created, c.person) pos
                 from giveaway_claims c where c.giveaway_id = g.id) k where k.person = auth.uid()),
      'myGiven', (select c.given from giveaway_claims c where c.giveaway_id = g.id and c.person = auth.uid()),
      -- kto się zapisał — widzi oddający (i osoby z prawem edycji)
      'claims', case when giveaway_mine(g.id) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
                  'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'note', c.note, 'given', c.given)
                  order by c.given desc, c.created, c.person)
                from giveaway_claims c join people p on p.id = c.person where c.giveaway_id = g.id), '[]'::jsonb) end
    ) order by g.closed, g.created desc)
    from giveaways g join people o on o.id = g.owner
    where not g.closed or g.updated > now() - interval '14 days' or g.owner = auth.uid()), '[]'::jsonb);
end $$;

-- dodanie / zmiana (oddający); nowa wydawka — od zalogowanej osoby
create or replace function public.giveaway_save(gid text, new_title text, new_description text, new_image text, new_place text, new_qty int, new_closed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare before uuid[];
begin
  if not is_active() then raise exception 'Wydawka jest dla zatwierdzonych członków.'; end if;
  if coalesce(trim(new_title), '') = '' then raise exception 'Podaj, co oddajesz.'; end if;
  if exists (select 1 from giveaways where id = gid) then
    if not giveaway_mine(gid) then raise exception 'Zmienia oddający.'; end if;
    before := giveaway_takers(gid);
    update giveaways set title = left(trim(new_title), 120), description = left(coalesce(new_description, ''), 2000),
      image = left(coalesce(new_image, ''), 500), place = left(coalesce(new_place, ''), 200),
      qty = greatest(1, least(99, coalesce(new_qty, 1))), closed = coalesce(new_closed, false), updated = now() where id = gid;
    if not coalesce(new_closed, false) then perform giveaway_promote(gid, before); end if; -- więcej sztuk → kolejni z rezerwy
  else
    insert into giveaways (id, owner, title, description, image, place, qty)
    values (gid, auth.uid(), left(trim(new_title), 120), left(coalesce(new_description, ''), 2000), left(coalesce(new_image, ''), 500),
      left(coalesce(new_place, ''), 200), greatest(1, least(99, coalesce(new_qty, 1))));
  end if;
end $$;

create or replace function public.giveaway_delete(gid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not giveaway_mine(gid) then raise exception 'Usuwa oddający.'; end if;
  delete from giveaways where id = gid;
end $$;

-- zapis po rzecz (biorę albo rezerwa) — oddający dostaje powiadomienie
create or replace function public.giveaway_claim(gid text, new_note text) returns int
language plpgsql security definer set search_path = public as $$
declare g giveaways; pos int; who text;
begin
  if not is_active() then raise exception 'Wydawka jest dla zatwierdzonych członków.'; end if;
  select * into g from giveaways where id = gid;
  if g.id is null then raise exception 'Tej rzeczy już nie ma.'; end if;
  if g.closed then raise exception 'Wydawka jest już zamknięta.'; end if;
  if g.owner = auth.uid() then raise exception 'To Twoja wydawka.'; end if;
  insert into giveaway_claims (giveaway_id, person, note) values (gid, auth.uid(), left(coalesce(new_note, ''), 300))
    on conflict (giveaway_id, person) do update set note = excluded.note;
  select k.pos into pos from (select c.person, row_number() over (order by c.given desc, c.created, c.person) pos
    from giveaway_claims c where c.giveaway_id = gid) k where k.person = auth.uid();
  select coalesce(nullif(name, ''), split_part(email, '@', 1)) into who from people where id = auth.uid();
  perform inbox_add(array[g.owner], 'Wydawka: ' || g.title,
    who || case when pos <= g.qty then ' chce to wziąć.' else ' zapisał(a) się na listę rezerwową (' || (pos - g.qty) || '.).' end,
    './?wydawka=' || gid);
  return pos;
end $$;

-- rezygnacja (moja) — następny z rezerwy dostaje powiadomienie
create or replace function public.giveaway_unclaim(gid text) returns void
language plpgsql security definer set search_path = public as $$
declare before uuid[] := giveaway_takers(gid);
begin
  delete from giveaway_claims where giveaway_id = gid and person = auth.uid() and not given;
  if not (select closed from giveaways where id = gid) then perform giveaway_promote(gid, before); end if;
end $$;

-- oddający: skreśla osobę (np. się nie zgłosiła) — ona i następny z rezerwy dostają powiadomienie
create or replace function public.giveaway_drop(gid text, who uuid) returns void
language plpgsql security definer set search_path = public as $$
declare before uuid[] := giveaway_takers(gid); t text;
begin
  if not giveaway_mine(gid) then raise exception 'Skreśla oddający.'; end if;
  select title into t from giveaways where id = gid;
  delete from giveaway_claims where giveaway_id = gid and person = who;
  if found then perform inbox_add(array[who], 'Wydawka: ' || t, 'Oddający przekazał rzecz komuś innemu.', './?wydawka=' || gid); end if;
  if not (select closed from giveaways where id = gid) then perform giveaway_promote(gid, before); end if;
end $$;

-- oddający: wydane (albo cofnięcie) — gdy wydano wszystkie sztuki, wydawka się zamyka
create or replace function public.giveaway_given(gid text, who uuid, val boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not giveaway_mine(gid) then raise exception 'Wydanie zaznacza oddający.'; end if;
  update giveaway_claims set given = coalesce(val, true) where giveaway_id = gid and person = who;
  update giveaways g set closed = g.closed or (select count(*) from giveaway_claims c where c.giveaway_id = gid and c.given) >= g.qty, updated = now()
    where g.id = gid;
end $$;

revoke all on function public.giveaway_mine(text), public.giveaway_takers(text), public.giveaway_board(),
  public.giveaway_save(text, text, text, text, text, int, boolean), public.giveaway_delete(text), public.giveaway_claim(text, text),
  public.giveaway_unclaim(text), public.giveaway_drop(text, uuid), public.giveaway_given(text, uuid, boolean) from public, anon;
grant execute on function public.giveaway_board(), public.giveaway_save(text, text, text, text, text, int, boolean),
  public.giveaway_delete(text), public.giveaway_claim(text, text), public.giveaway_unclaim(text),
  public.giveaway_drop(text, uuid), public.giveaway_given(text, uuid, boolean) to authenticated;
revoke all on function public.giveaway_mine(text), public.giveaway_takers(text) from authenticated;
