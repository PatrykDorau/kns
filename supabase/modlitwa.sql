-- Prośby modlitewne (tylko wewnątrz zboru): zalogowany członek zostawia prośbę; może podać imię i kontakt,
-- i zdecydować, czy prośbę może zobaczyć cały zbór (lista modlitewna), czy tylko prowadzący (pastor, rada, administrator).
-- Prowadzący dostają powiadomienie, widzą wszystkie prośby i decydują, które pokazać zborowi (prośby gości — dopiero po
-- akceptacji). Członkowie widzą prośby pokazane zborowi i swoje; „Modlę się” — licznik osób, które się modlą.
-- Tylko przez funkcje. Uruchamiać po schema.sql, zatwierdzanie.sql, skrzynka.sql i wiadomosci.sql (można ponownie).
create table if not exists public.prayer_requests (
  id bigint generated always as identity primary key,
  text text not null check (length(text) between 3 and 1500),
  name text not null default '' check (length(name) <= 80),           -- podpis (puste — anonimowo)
  contact text not null default '' check (length(contact) <= 120),     -- telefon / e-mail do prowadzących (opcjonalnie)
  share boolean not null default false,                                -- zgoda na pokazanie zborowi
  status text not null default 'new' check (status in ('new', 'shown', 'private', 'done')),
  person uuid references public.people (id) on delete set null,        -- członek (gość — null)
  created timestamptz not null default now()
);
create table if not exists public.prayer_prayed (
  request_id bigint not null references public.prayer_requests (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  primary key (request_id, person)
);
alter table public.prayer_requests enable row level security;
alter table public.prayer_prayed enable row level security;
revoke all on public.prayer_requests, public.prayer_prayed from anon, authenticated;

-- prowadzący: pastor, rada zboru, administrator
create or replace function public.prayer_leader() returns boolean
language sql stable security definer set search_path = public as $$ select can_broadcast_all() $$;

-- nowa prośba (gość albo członek); prośba członka, który zgodził się na pokazanie — od razu na liście zboru
create or replace function public.prayer_add(t text, nm text default '', ct text default '', sh boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := case when is_active() then auth.uid() end; nid bigint; leaders uuid[];
begin
  t := trim(coalesce(t, '')); nm := left(trim(coalesce(nm, '')), 80); ct := left(trim(coalesce(ct, '')), 120);
  if length(t) < 3 then raise exception 'Napisz, w czym mamy się modlić.'; end if;
  if length(t) > 1500 then raise exception 'Prośba może mieć najwyżej 1500 znaków.'; end if;
  -- ochrona przed zalewem z zewnątrz: najwyżej 30 próśb gości na godzinę
  if me is null and (select count(*) from prayer_requests where person is null and created > now() - interval '1 hour') >= 30 then
    raise exception 'Za dużo próśb w krótkim czasie — spróbuj za chwilę.';
  end if;
  insert into prayer_requests (text, name, contact, share, status, person)
  values (t, nm, ct, coalesce(sh, false), case when me is not null and coalesce(sh, false) then 'shown' else 'new' end, me)
  returning id into nid;
  leaders := array(select p.id from people p join ranks r on r.id = any (p.roles)
    where p.status = 'active' and (r.council or r.manage or 'pastor' = any (p.roles)) and p.id is distinct from me);
  perform inbox_add(leaders, 'Prośba o modlitwę' || case when nm <> '' then ' — ' || nm else '' end, left(t, 160), './modlitwa');
  return nid;
end $$;

-- lista: prowadzący — wszystko (z kontaktem); członek — pokazane zborowi i swoje
create or replace function public.prayer_board() returns jsonb
language plpgsql security definer set search_path = public as $$
declare lead boolean := prayer_leader();
begin
  if not is_active() then raise exception 'Lista modlitewna jest dla członków — prośbę może zostawić każdy.'; end if;
  return jsonb_build_object('leader', lead, 'list', coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'text', q.text, 'name', q.name, 'share', q.share, 'status', q.status, 'created', q.created,
      'mine', q.person = auth.uid(), 'guest', q.person is null,
      'contact', case when lead then q.contact else '' end,
      'from', case when lead and q.person is not null then (select coalesce(nullif(p.name, ''), p.email) from people p where p.id = q.person) else '' end,
      'prayed', (select count(*) from prayer_prayed x where x.request_id = q.id),
      'iPrayed', exists (select 1 from prayer_prayed x where x.request_id = q.id and x.person = auth.uid())
    ) order by case q.status when 'new' then 0 when 'shown' then 1 when 'private' then 2 else 3 end, q.created desc)
    from prayer_requests q
    where (lead and q.created > now() - interval '180 days') or q.person = auth.uid()
       or (q.status = 'shown' and q.created > now() - interval '60 days')), '[]'::jsonb));
end $$;

-- prowadzący: pokaż zborowi (tylko gdy autor się zgodził) / tylko prowadzący / zakończona (wysłuchana, już nieaktualna)
create or replace function public.prayer_status(rid bigint, st text) returns void
language plpgsql security definer set search_path = public as $$
declare q prayer_requests;
begin
  select * into q from prayer_requests where id = rid;
  if q.id is null then raise exception 'Nie ma takiej prośby.'; end if;
  if not (prayer_leader() or (q.person = auth.uid() and st = 'done')) then raise exception 'Status zmieniają prowadzący.'; end if;
  if st not in ('shown', 'private', 'done') then raise exception 'Nieprawidłowy status.'; end if;
  if st = 'shown' and not q.share then raise exception 'Autor nie zgodził się na pokazanie prośby zborowi.'; end if;
  update prayer_requests set status = st where id = rid;
end $$;

-- „Modlę się” (drugie kliknięcie cofa)
create or replace function public.prayer_pray(rid bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Dla członków.'; end if;
  if not exists (select 1 from prayer_requests q where q.id = rid and (q.status = 'shown' or q.person = auth.uid() or prayer_leader())) then
    raise exception 'Nie ma takiej prośby.';
  end if;
  if exists (select 1 from prayer_prayed where request_id = rid and person = auth.uid()) then
    delete from prayer_prayed where request_id = rid and person = auth.uid(); return false;
  end if;
  insert into prayer_prayed (request_id, person) values (rid, auth.uid());
  return true;
end $$;

create or replace function public.prayer_remove(rid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (prayer_leader() or exists (select 1 from prayer_requests where id = rid and person = auth.uid())) then raise exception 'Brak uprawnień.'; end if;
  delete from prayer_requests where id = rid;
end $$;

revoke all on function public.prayer_leader(), public.prayer_add(text, text, text, boolean), public.prayer_board(), public.prayer_status(bigint, text),
  public.prayer_pray(bigint), public.prayer_remove(bigint) from public, anon;
-- tylko wewnątrz zboru: bez dostępu dla gości (anon)
grant execute on function public.prayer_add(text, text, text, boolean) to authenticated;
grant execute on function public.prayer_leader(), public.prayer_board(), public.prayer_status(bigint, text), public.prayer_pray(bigint), public.prayer_remove(bigint) to authenticated;

-- Modlitwa na dziś / na ten tydzień: starszy (pastor, rada, administrator) pisze, za co zbór modli się w tym czasie —
-- na górze zakładki „Modlitwa”. Obowiązuje od dnia dodania do końca dnia albo tygodnia (niedziela).
create table if not exists public.prayer_focus (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('day', 'week')),
  text text not null check (length(text) between 3 and 2000),
  starts date not null default current_date,
  ends date not null,
  author uuid references public.people (id) on delete set null default auth.uid(),
  created timestamptz not null default now()
);
alter table public.prayer_focus enable row level security;
revoke all on public.prayer_focus from anon, authenticated;

create or replace function public.prayer_focus_set(sc text, t text) returns bigint
language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  if not prayer_leader() then raise exception 'Modlitwę na dzień albo tydzień dodaje pastor albo rada zboru.'; end if;
  if sc not in ('day', 'week') then raise exception 'Wybierz: na dziś albo na ten tydzień.'; end if;
  t := trim(coalesce(t, ''));
  if length(t) < 3 then raise exception 'Napisz treść modlitwy.'; end if;
  -- nowa zastępuje obecną tego samego rodzaju
  delete from prayer_focus where scope = sc and ends >= current_date;
  insert into prayer_focus (scope, text, ends)
  values (sc, left(t, 2000), case when sc = 'day' then current_date else current_date + ((7 - extract(isodow from current_date)::int) % 7) end)
  returning id into nid;
  return nid;
end $$;
create or replace function public.prayer_focus_remove(fid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not prayer_leader() then raise exception 'Brak uprawnień.'; end if;
  delete from prayer_focus where id = fid;
end $$;
-- obecne (na dziś i na ten tydzień) — dla członków
create or replace function public.prayer_focus_now() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_active() then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'scope', f.scope, 'text', f.text,
      'ends', f.ends, 'author', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1), '')) order by case f.scope when 'day' then 0 else 1 end)
    from prayer_focus f left join people p on p.id = f.author where current_date between f.starts and f.ends), '[]'::jsonb) end
$$;
revoke all on function public.prayer_focus_set(text, text), public.prayer_focus_remove(bigint), public.prayer_focus_now() from public, anon;
grant execute on function public.prayer_focus_set(text, text), public.prayer_focus_remove(bigint), public.prayer_focus_now() to authenticated;
