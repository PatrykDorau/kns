-- Materiały (dawniej „Biblioteka protokołów”): protokoły spotkań i pliki pomocnicze (np. instrukcja obsługi rzutnika).
-- Ta sama tabela protocols i prywatny kosz „protokoly”; rodzaj (protokół, instrukcja, plik) jest w data.type.
-- Widoczność (kind):
--   czlonkowskie — protokół dla członków (dodają protokolant i rada zboru),
--   material     — instrukcja albo plik pomocniczy dla członków (dodają też osoby z prawem edycji, technika i administrator),
--   rada         — tylko rada zboru (protokół albo materiał).
-- Uruchamiaj po schema.sql i sluzby.sql, a przed protokoly.sql (można ponownie). Tu też lista osób do składu zespołu.
alter table public.protocols drop constraint if exists protocols_kind_check;
alter table public.protocols add constraint protocols_kind_check check (kind in ('czlonkowskie', 'rada', 'material'));

create or replace function public.can_write_material() returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('edit') or has_flag('protocols') or has_flag('council') or has_flag('manage')
    or exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'technika' = any (p.roles))
$$;
revoke all on function public.can_write_material() from public, anon;
grant execute on function public.can_write_material() to authenticated;

drop policy if exists protocols_read on public.protocols;
drop policy if exists protocols_write on public.protocols;
create policy protocols_read on public.protocols for select to authenticated
  using (case kind when 'rada' then has_flag('council') else is_active() end);
create policy protocols_write on public.protocols for all to authenticated
  using (case kind when 'rada' then has_flag('council') when 'material' then can_write_material() else has_flag('protocols') or has_flag('council') end)
  with check (case kind when 'rada' then has_flag('council') when 'material' then can_write_material() else has_flag('protocols') or has_flag('council') end);

-- Pliki (kosz „protokoly”): protokoly.sql.

-- Skład zespołu: osoby ze służby muzycznej (służby o nazwie z „muzy”, „uwielb” albo „zesp”) — członkowie i liderzy.
create or replace function public.band_people() returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_flag('edit') then raise exception 'Skład zespołu ustalają osoby z prawem edycji.'; end if;
  return query
    select distinct p.id, p.name from people p
    join ministries m on m.name ~* '(muzy|uwielb|zesp)'
    where p.status = 'active' and p.name <> ''
      and (p.id = any (m.leader_ids) or exists (select 1 from ministry_members mm where mm.ministry_id = m.id and mm.person = p.id and mm.status = 'active'))
    order by p.name;
end $$;
revoke all on function public.band_people() from public, anon;
grant execute on function public.band_people() to authenticated;
