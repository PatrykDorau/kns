-- Role i dostęp do modułów (zakładka „Moduły”): administrator dodaje, zmienia i usuwa role (oprócz „Administrator”)
-- oraz przypisuje moduły do konkretnych osób. Dostęp według służb i ról siedzi w ustawieniu strony „moduly”
-- ({ off, only: {moduł: [służby]}, ranks: {moduł: [role]}, people: {moduł: liczba osób} }); same osoby — w tabeli
-- module_people (ustawienia strony czyta każdy, także gość, więc nie trzymamy tam nikogo po imieniu ani adresie).
-- Uruchamiaj po schema.sql, zatwierdzanie.sql i posluchaj.sql. Skrypt można uruchomić ponownie.

/* ---------- role ---------- */
alter table public.ranks add column if not exists builtin boolean not null default false; -- wbudowane: aplikacja zna je po identyfikatorze
update public.ranks set builtin = true where id in ('czlonek', 'lider', 'organizator', 'technika', 'protokolant', 'newsletter', 'rada', 'pastor', 'admin', 'asb', 'dev');

-- Zapis roli: nowa (rid pusty — identyfikator z nazwy) albo zmiana istniejącej. „Administrator” i uprawnienie
-- zarządzania osobami są poza zasięgiem — tę rolę zmienia się tylko w bazie.
create or replace function public.rank_save(rid text, rname text, edit boolean, council boolean, protocols boolean, approve boolean)
returns text language plpgsql security definer set search_path = public as $$
declare nid text := nullif(trim(coalesce(rid, '')), ''); base text; n int := 1;
begin
  if not has_flag('manage') then raise exception 'Role zmienia administrator.'; end if;
  if nullif(trim(coalesce(rname, '')), '') is null then raise exception 'Podaj nazwę roli.'; end if;
  if nid = 'admin' then raise exception 'Roli „Administrator” nie zmienia się w aplikacji.'; end if;
  if nid is null then
    base := trim(both '-' from regexp_replace(lower(translate(trim(rname), 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszzACELNOSZZ')), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'rola'; end if;
    nid := left(base, 40);
    while exists (select 1 from ranks where id = nid) loop n := n + 1; nid := left(base, 36) || '-' || n; end loop;
    insert into ranks (id, name, can_edit, council, protocols, manage, approve, sort, builtin)
    values (nid, trim(rname), coalesce(rank_save.edit, false), coalesce(rank_save.council, false), coalesce(rank_save.protocols, false), false, coalesce(rank_save.approve, false),
      (select coalesce(max(sort), 0) + 1 from ranks where id <> 'admin'), false);
  else
    update ranks set name = trim(rname), can_edit = coalesce(rank_save.edit, false), council = coalesce(rank_save.council, false),
      protocols = coalesce(rank_save.protocols, false), approve = coalesce(rank_save.approve, false)
    where id = nid and id <> 'admin';
    if not found then raise exception 'Nie ma takiej roli.'; end if;
  end if;
  return nid;
end $$;

-- Usunięcie roli dodanej w aplikacji (wbudowanych nie — kod aplikacji na nich polega); osoby ją tracą.
create or replace function public.rank_delete(rid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_flag('manage') then raise exception 'Role zmienia administrator.'; end if;
  if exists (select 1 from ranks where id = rid and builtin) then raise exception 'Tej roli nie można usunąć — aplikacja z niej korzysta. Możesz zmienić jej nazwę i uprawnienia.'; end if;
  update people set roles = array_remove(roles, rid) where rid = any (roles);
  delete from ranks where id = rid;
  -- moduły przypisane do tej roli — bez niej
  update site_settings set value = jsonb_set(value, '{ranks}', coalesce((
      select jsonb_object_agg(k, v) from (
        select k, (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(v0) x where x <> rid) v
        from jsonb_each(coalesce(value->'ranks', '{}'::jsonb)) e(k, v0)) s
      where jsonb_array_length(v) > 0), '{}'::jsonb))
  where key = 'moduly' and value ? 'ranks';
end $$;

/* ---------- moduły dla konkretnych osób ---------- */
create table if not exists public.module_people (
  module text not null,
  person uuid not null references public.people (id) on delete cascade,
  primary key (module, person)
);
alter table public.module_people enable row level security;
revoke all on public.module_people from public, anon, authenticated;

-- moduły, do których zalogowana osoba ma dostęp imienny
create or replace function public.my_modules() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(module order by module), '{}') from module_people where person = auth.uid()
$$;

-- pełna lista (administrator): moduł, adres, imię
create or replace function public.module_people_all() returns table (module text, email text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_flag('manage') then raise exception 'Tylko dla administratora.'; end if;
  return query select m.module, p.email, coalesce(p.name, '') from module_people m join people p on p.id = m.person order by m.module, p.name;
end $$;

-- osoby z dostępem do modułu (zastępuje listę); liczba trafia do ustawienia „moduly” → people, żeby aplikacja wiedziała,
-- że moduł jest ograniczony, nie znając nazwisk
create or replace function public.module_people_set(mod text, emails text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_flag('manage') then raise exception 'Tylko dla administratora.'; end if;
  if coalesce(trim(mod), '') = '' then raise exception 'Brak modułu.'; end if;
  delete from module_people where module = mod;
  insert into module_people (module, person)
    select mod, p.id from people p where lower(p.email) in (select lower(e) from unnest(coalesce(emails, '{}')) e) on conflict do nothing;
  get diagnostics n = row_count;
  insert into site_settings (key, value) values ('moduly', '{}'::jsonb) on conflict (key) do nothing;
  update site_settings set value = case when n > 0
      then jsonb_set(value, '{people}', coalesce(value->'people', '{}'::jsonb) || jsonb_build_object(mod, n))
      else jsonb_set(value, '{people}', coalesce(value->'people', '{}'::jsonb) - mod) end
  where key = 'moduly';
  return n;
end $$;

revoke all on function public.rank_save(text, text, boolean, boolean, boolean, boolean), public.rank_delete(text),
  public.my_modules(), public.module_people_all(), public.module_people_set(text, text[]) from public, anon;
grant execute on function public.rank_save(text, text, boolean, boolean, boolean, boolean), public.rank_delete(text),
  public.my_modules(), public.module_people_all(), public.module_people_set(text, text[]) to authenticated;
