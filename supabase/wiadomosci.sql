-- Wiadomości do rang i służb (dzwonek w aplikacji, a kto włączył — także telefon). Uruchamiaj po skrzynka.sql
-- i asb.sql (można ponownie).
--   pastor, rada zboru, administrator → do dowolnych rang i służb;
--   lider ASB (rangi „ASB” i „Lider”) → do rangi ASB;
--   lider służby → do swojej służby (członkowie i pozostali liderzy).
create or replace function public.can_broadcast_all() returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('council') or has_flag('manage')
    or exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'pastor' = any (p.roles))
$$;
create or replace function public.is_asb_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'asb' = any (p.roles) and 'lider' = any (p.roles))
$$;
revoke all on function public.can_broadcast_all(), public.is_asb_leader() from public, anon;
grant execute on function public.can_broadcast_all(), public.is_asb_leader() to authenticated;

-- Do kogo ta osoba może napisać (z liczbą odbiorców).
create or replace function public.broadcast_options() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare everything boolean := can_broadcast_all();
begin
  if not is_active() then raise exception 'Brak dostępu.'; end if;
  return jsonb_build_object(
    'ranks', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
        'count', (select count(*) from people p where p.status = 'active' and r.id = any (p.roles))) order by r.sort)
      from ranks r where everything or (r.id = 'asb' and is_asb_leader())), '[]'::jsonb),
    'ministries', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name,
        'count', (select count(*) from (select mm.person from ministry_members mm where mm.ministry_id = m.id and mm.status = 'active'
                                         union select unnest(m.leader_ids)) s)) order by m.sort, m.name)
      from ministries m where everything or auth.uid() = any (m.leader_ids)), '[]'::jsonb));
end $$;

-- Wysyłka: wpis w dzwonku u każdego odbiorcy (bez nadawcy); telefon — /api/push { inbox: true } zaraz potem.
create or replace function public.broadcast_send(title text, body text, url text, ranks text[], ministries text[]) returns int
language plpgsql security definer set search_path = public as $$
declare everything boolean := can_broadcast_all(); who text; targets uuid[]; txt text := trim(coalesce(body, ''));
begin
  if not is_active() then raise exception 'Brak dostępu.'; end if;
  ranks := coalesce(ranks, '{}'); ministries := coalesce(ministries, '{}');
  if trim(coalesce(title, '')) = '' then raise exception 'Wpisz tytuł wiadomości.'; end if;
  if cardinality(ranks) + cardinality(ministries) = 0 then raise exception 'Wybierz, do kogo wysłać.'; end if;
  if not everything then
    if exists (select 1 from unnest(ranks) r where not (r = 'asb' and is_asb_leader())) then
      raise exception 'Do tej rangi wiadomość może wysłać pastor, rada zboru albo administrator.';
    end if;
    if exists (select 1 from unnest(ministries) x where not exists (select 1 from public.ministries m where m.id = x and auth.uid() = any (m.leader_ids))) then
      raise exception 'Możesz pisać tylko do służb, w których jesteś liderem.';
    end if;
  end if;
  select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) into who from people p where p.id = auth.uid();
  targets := array(
    select p.id from people p where p.status = 'active' and p.roles && ranks
    union select mm.person from ministry_members mm where mm.status = 'active' and mm.ministry_id = any (ministries)
    union select unnest(m.leader_ids) from public.ministries m where m.id = any (ministries));
  return inbox_add(targets, trim(title), left(txt, 340) || case when txt = '' then '' else ' — ' end || who,
    coalesce(nullif(trim(url), ''), './'));
end $$;
revoke all on function public.broadcast_options(), public.broadcast_send(text, text, text, text[], text[]) from public, anon;
grant execute on function public.broadcast_options(), public.broadcast_send(text, text, text, text[], text[]) to authenticated;
