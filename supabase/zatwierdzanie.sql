-- Zgłoszenia od członków: każdy zatwierdzony członek może dodać wydarzenie albo ogłoszenie, ale bez prawa edycji
-- czeka ono na zatwierdzenie (status 'pending'). Zatwierdzają: lider newslettera, rada zboru, pastor, administrator
-- (ranga z flagą approve). Osoby z prawem edycji publikują od razu, jak dotąd.
-- Uruchomienie: po schema.sql, kalendarz.sql, grafiki.sql i powiadomienia.sql (można uruchamiać ponownie).

alter table public.ranks add column if not exists approve boolean not null default false; -- zatwierdza zgłoszenia
insert into public.ranks (id, name, can_edit, council, protocols, manage, approve, sort)
values ('newsletter', 'Lider newslettera', false, false, false, false, true, 6)
on conflict (id) do update set name = excluded.name, approve = true;
update public.ranks set approve = true where id in ('rada', 'pastor', 'admin');
update public.ranks set sort = case id when 'rada' then 7 when 'pastor' then 8 when 'admin' then 9 else sort end where id in ('rada', 'pastor', 'admin');

create or replace function public.has_flag(flag text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from people p join ranks r on r.id = any (p.roles)
    where p.id = auth.uid() and p.status = 'active'
      and case flag when 'edit' then r.can_edit when 'council' then r.council
                    when 'protocols' then r.protocols when 'manage' then r.manage
                    when 'approve' then r.approve else false end)
$$;

alter table public.events add column if not exists status text not null default 'published';
alter table public.events add column if not exists created_by uuid default auth.uid();
alter table public.announcements add column if not exists status text not null default 'published';
alter table public.announcements add column if not exists created_by uuid default auth.uid();
do $$ begin
  alter table public.events add constraint events_status check (status in ('published', 'pending'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.announcements add constraint announcements_status check (status in ('published', 'pending'));
exception when duplicate_object then null; end $$;

-- Status pilnuje baza: bez prawa edycji — zawsze „czeka”; opublikować zgłoszenie może tylko osoba zatwierdzająca.
-- (Skrypty Google działają kluczem serwera — bez auth.uid() — i niczego tu nie zmieniają.)
create or replace function public.moderate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); else new.created_by := old.created_by; end if;
  if not (has_flag('edit') or has_flag('approve')) then new.status := 'pending';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'published' and not has_flag('approve') then
    raise exception 'Zgłoszenie może opublikować lider newslettera, rada zboru albo administrator.';
  end if;
  return new;
end $$;
drop trigger if exists events_moderate on public.events;
create trigger events_moderate before insert or update on public.events for each row execute function public.moderate();
drop trigger if exists announcements_moderate on public.announcements;
create trigger announcements_moderate before insert or update on public.announcements for each row execute function public.moderate();

-- Reguły: opublikowane widzą wszyscy zatwierdzeni; zgłoszenia — autor i zatwierdzający.
drop policy if exists events_read on public.events;
drop policy if exists events_write on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;
create policy events_read on public.events for select to authenticated
  using (is_active() and (status = 'published' or created_by = auth.uid() or has_flag('approve')));
create policy events_insert on public.events for insert to authenticated with check (is_active());
create policy events_update on public.events for update to authenticated
  using (has_flag('edit') or has_flag('approve') or (created_by = auth.uid() and status = 'pending'))
  with check (has_flag('edit') or has_flag('approve') or (created_by = auth.uid() and status = 'pending'));
create policy events_delete on public.events for delete to authenticated
  using (has_flag('edit') or has_flag('approve') or (created_by = auth.uid() and status = 'pending'));

drop policy if exists announcements_read on public.announcements;
drop policy if exists announcements_write on public.announcements;
drop policy if exists announcements_insert on public.announcements;
drop policy if exists announcements_update on public.announcements;
drop policy if exists announcements_delete on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using ((case audience when 'council' then has_flag('council') else is_active() end)
         and (status = 'published' or created_by = auth.uid() or has_flag('approve')));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (is_active() and (case when audience = 'council' or important then has_flag('council') else true end));
create policy announcements_update on public.announcements for update to authenticated
  using (case when audience = 'council' or important then has_flag('council')
              else has_flag('edit') or has_flag('approve') or (created_by = auth.uid() and status = 'pending') end)
  with check (case when audience = 'council' or important then has_flag('council')
              else has_flag('edit') or has_flag('approve') or (created_by = auth.uid() and status = 'pending') end);
create policy announcements_delete on public.announcements for delete to authenticated
  using (case when audience = 'council' or important then has_flag('council')
              else has_flag('edit') or has_flag('approve') or (created_by = auth.uid() and status = 'pending') end);

-- Na zewnątrz (goście, Kalendarz Google) — tylko opublikowane.
create or replace function public.public_preview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('date', s.date, 'time', s.data ->> 'time', 'place', s.data ->> 'place',
        'sermonTitle', s.data ->> 'sermonTitle', 'passage', s.data ->> 'passage', 'speaker', s.data ->> 'speaker') order by s.date)
      from services s where s.date between current_date and current_date + 60), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'title', e.data ->> 'title', 'date', e.date,
        'time', e.data ->> 'time', 'place', e.data ->> 'place', 'description', e.data ->> 'description') order by e.date)
      from events e where e.status = 'published' and e.date between current_date and current_date + 60
        and coalesce(e.is_public, e.type not in ('czlonkowskie', 'rada'))), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.data ->> 'title', 'text', a.data ->> 'text',
        'important', a.important, 'date', a.data -> 'date', 'image', a.data ->> 'image', 'video', a.data ->> 'video', 'link', a.data ->> 'link', 'linkText', a.data ->> 'linkText') order by a.important desc, a.updated desc)
      from announcements a where a.status = 'published' and a.audience = 'public' and (a.until is null or a.until >= current_date)), '[]'::jsonb),
    'types', coalesce((select jsonb_path_query_array(t.types, '$[*] ? (!exists(@.removed)) ') from templates t where t.id = 'main'), '[]'::jsonb))
$$;
create or replace function public.calendar_feed(token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (select * from people where calendar_token = token and status = 'active'),
  council as (select exists (select 1 from p join ranks r on r.id = any (p.roles) where r.council) as ok)
  select case when not exists (select 1 from p) then null else jsonb_build_object(
    'name', (select name from p),
    'services', coalesce((select jsonb_agg(s.data order by s.date) from services s
      where s.date between current_date - 60 and current_date + 366), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e.data order by e.date) from events e
      where e.status = 'published' and e.date between current_date - 60 and current_date + 366 and (e.type <> 'rada' or (select ok from council))), '[]'::jsonb),
    'types', coalesce((select t.types from templates t where t.id = 'main'), '[]'::jsonb))
  end
$$;

-- Powiadomienie dla zatwierdzających o nowym zgłoszeniu (wysyła /api/push z tokenem autora — dowolny zatwierdzony
-- członek, ale tylko do osób zatwierdzających i tylko gdy ma zgłoszenie czekające).
create or replace function public.review_targets() returns table (id text, subscription jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Brak dostępu.'; end if;
  if not exists (select 1 from events e where e.created_by = auth.uid() and e.status = 'pending')
     and not exists (select 1 from announcements a where a.created_by = auth.uid() and a.status = 'pending') then
    raise exception 'Brak zgłoszeń do zatwierdzenia.';
  end if;
  return query
    select d.id, d.data -> 'subscription' from push_devices d join people p on p.id = d.person
    join ranks r on r.id = any (p.roles)
    where p.status = 'active' and r.approve and d.data ? 'subscription' and p.id <> auth.uid()
    group by d.id, d.data;
end $$;
revoke all on function public.review_targets() from public, anon;
grant execute on function public.review_targets() to authenticated;
