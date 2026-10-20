-- Służby, część 2: informacje wewnętrzne służby (widzą tylko jej członkowie i liderzy, zmienia lider),
-- materiały tylko dla wybranych służb (kolumna protocols.ministries; lider dodaje pliki dla swojej służby)
-- i ASB jako zwykła służba na liście. Uruchamiać po sluzby.sql, materialy.sql, protokoly.sql i widocznosc.sql.
-- Można wielokrotnie.
alter table public.ministries add column if not exists internal text not null default '';
alter table public.protocols add column if not exists ministries text[] not null default '{}';

-- czy jestem członkiem (albo liderem) służby
create or replace function public.in_ministry(mid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_ministry_leader(mid) or exists (select 1 from ministry_members x where x.ministry_id = mid and x.person = auth.uid() and x.status = 'active')
$$;
-- lider którejkolwiek służby (wgrywanie plików dla swojej służby)
create or replace function public.leads_any_ministry() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ministries m where auth.uid() = any (m.leader_ids))
$$;
-- lider wszystkich podanych służb (co najmniej jednej) — materiał dla swoich służb
create or replace function public.leads_all_ministries(arr text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(cardinality(arr), 0) > 0 and not exists (select 1 from unnest(arr) x where not is_ministry_leader(x))
$$;
revoke all on function public.in_ministry(text), public.leads_any_ministry(), public.leads_all_ministries(text[]) from public, anon;
grant execute on function public.in_ministry(text), public.leads_any_ministry(), public.leads_all_ministries(text[]) to authenticated;

-- informacje wewnętrzne: zmienia lider tej służby (albo administrator)
create or replace function public.ministry_set_internal(mid text, txt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_ministry_leader(mid) then raise exception 'Informacje wewnętrzne zmienia lider tej służby.'; end if;
  update ministries set internal = left(coalesce(txt, ''), 5000), updated = now() where id = mid;
end $$;
revoke all on function public.ministry_set_internal(text, text) from public, anon;
grant execute on function public.ministry_set_internal(text, text) to authenticated;

-- tablica służb: także informacje wewnętrzne (tylko dla członków i liderów)
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
      'leader', auth.uid() = any (m.leader_ids),
      'full', ministry_full(m.id),
      'internal', case when in_ministry(m.id) then m.internal end,
      'people', case when is_ministry_leader(m.id) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
                    'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))) order by p.name)
                  from ministry_members x join people p on p.id = x.person where x.ministry_id = m.id and x.status = 'active'), '[]'::jsonb)
                  else '[]'::jsonb end,
      'pending', case when is_ministry_leader(m.id) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
                    'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), 'grupa', p.grupa) order by x.created)
                  from ministry_members x join people p on p.id = x.person where x.ministry_id = m.id and x.status = 'pending'), '[]'::jsonb)
                  else '[]'::jsonb end
    ) order by m.seeking desc, m.sort, m.name) from ministries m), '[]'::jsonb);
end $$;

-- materiały: ograniczone do służb widzą członkowie tych służb (i osoby z prawem edycji — sees_ministries);
-- lider służby może dodawać i zmieniać materiały tylko dla swoich służb
drop policy if exists protocols_read on public.protocols;
create policy protocols_read on public.protocols for select to authenticated
  using (case kind when 'rada' then has_flag('council') else is_active() end and sees_ministries(ministries));
drop policy if exists protocols_write on public.protocols;
create policy protocols_write on public.protocols for all to authenticated
  using (case kind when 'rada' then has_flag('council') when 'material' then can_write_material()
           or leads_all_ministries(ministries)
         else has_flag('protocols') or has_flag('council') end)
  with check (case kind when 'rada' then has_flag('council') when 'material' then can_write_material()
           or leads_all_ministries(ministries)
         else has_flag('protocols') or has_flag('council') end);
-- pliki: wgrywać i usuwać mogą też liderzy służb (czytanie pliku — tylko gdy widać materiał)
do $$ begin
  if to_regclass('storage.objects') is null then return; end if; -- testowa baza bez plików
  drop policy if exists protokoly_insert on storage.objects;
  drop policy if exists protokoly_delete on storage.objects;
  create policy protokoly_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'protokoly' and (public.can_write_material() or public.leads_any_ministry()));
  create policy protokoly_delete on storage.objects for delete to authenticated
    using (bucket_id = 'protokoly' and (public.can_write_material() or public.leads_any_ministry()));
end $$;

-- ASB jako służba na liście (terminarz i grafik — w aplikacji przy tej służbie)
insert into public.ministries (id, name, description, seeking, sort)
values ('asb', 'ASB — Akademickie Spotkania Biblijne', 'Spotkania studenckie: rozważanie Biblii, rozmowy, integracja.', false, 50)
on conflict (id) do nothing;
