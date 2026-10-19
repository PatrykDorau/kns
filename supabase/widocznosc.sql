-- Widoczność wydarzeń i ogłoszeń dla wybranych służb: kolumna ministries (puste = jak dotąd, dla wszystkich).
-- Ograniczone widzą: osoby służące w którejś z tych służb, ich liderzy, autor oraz osoby z prawem edycji,
-- zatwierdzania albo administrator. Gościom (strona publiczna) i w newsletterze ograniczone się nie pokazują.
-- Uruchamiać po sluzby.sql, zatwierdzanie.sql i grafiki.sql. Można wielokrotnie.
alter table public.events add column if not exists ministries text[] not null default '{}';
alter table public.announcements add column if not exists ministries text[] not null default '{}';

-- czy dana osoba widzi rzecz ograniczoną do tych służb
create or replace function public.person_sees_ministries(pid uuid, arr text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(cardinality(arr), 0) = 0
    or exists (select 1 from people p join ranks r on r.id = any (p.roles) where p.id = pid and (r.can_edit or r.manage or r.approve))
    or exists (select 1 from ministries m where m.id = any (arr) and pid = any (m.leader_ids))
    or exists (select 1 from ministry_members x where x.ministry_id = any (arr) and x.person = pid and x.status = 'active')
$$;
create or replace function public.sees_ministries(arr text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select person_sees_ministries(auth.uid(), arr)
$$;
revoke all on function public.person_sees_ministries(uuid, text[]) from public, anon, authenticated;
revoke all on function public.sees_ministries(text[]) from public, anon;
grant execute on function public.sees_ministries(text[]) to authenticated;

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (is_active() and (status = 'published' or created_by = auth.uid() or has_flag('approve'))
         and (created_by = auth.uid() or sees_ministries(ministries)));
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using ((case audience when 'council' then has_flag('council') else is_active() end)
         and (status = 'published' or created_by = auth.uid() or has_flag('approve'))
         and (created_by = auth.uid() or sees_ministries(ministries)));

-- Na zewnątrz (goście): bez rzeczy ograniczonych do służb.
create or replace function public.public_preview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('date', s.date, 'time', s.data ->> 'time', 'place', s.data ->> 'place',
        'sermonTitle', s.data ->> 'sermonTitle', 'passage', s.data ->> 'passage', 'speaker', s.data ->> 'speaker') order by s.date)
      from services s where s.date between current_date and current_date + 60), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'title', e.data ->> 'title', 'date', e.date,
        'time', e.data ->> 'time', 'place', e.data ->> 'place', 'description', e.data ->> 'description') order by e.date)
      from events e where e.status = 'published' and e.date between current_date and current_date + 60 and cardinality(e.ministries) = 0
        and coalesce(e.is_public, e.type not in ('czlonkowskie', 'rada'))), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.data ->> 'title', 'text', a.data ->> 'text',
        'important', a.important, 'date', a.data -> 'date', 'image', a.data ->> 'image', 'video', a.data ->> 'video', 'link', a.data ->> 'link', 'linkText', a.data ->> 'linkText') order by a.important desc, a.updated desc)
      from announcements a where a.status = 'published' and a.audience = 'public' and cardinality(a.ministries) = 0 and (a.until is null or a.until >= current_date)), '[]'::jsonb),
    'types', coalesce((select jsonb_path_query_array(t.types, '$[*] ? (!exists(@.removed)) ') from templates t where t.id = 'main'), '[]'::jsonb))
$$;

-- Kalendarz w Google (link osobisty): wydarzenia ograniczone — tylko gdy ta osoba je widzi.
create or replace function public.calendar_feed(token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (select * from people where calendar_token = token and status = 'active'),
  council as (select exists (select 1 from p join ranks r on r.id = any (p.roles) where r.council) as ok)
  select case when not exists (select 1 from p) then null else jsonb_build_object(
    'name', (select name from p),
    'services', coalesce((select jsonb_agg(s.data order by s.date) from services s
      where s.date between current_date - 60 and current_date + 366), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e.data order by e.date) from events e
      where e.status = 'published' and e.date between current_date - 60 and current_date + 366 and (e.type <> 'rada' or (select ok from council))
        and person_sees_ministries((select id from p), e.ministries)), '[]'::jsonb),
    'types', coalesce((select t.types from templates t where t.id = 'main'), '[]'::jsonb))
  end
$$;
