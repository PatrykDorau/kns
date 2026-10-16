/* ---------- kalendarz w Kalendarzu Google (subskrypcja iCal) ---------- */
-- Każda osoba ma tajny klucz do swojego adresu kalendarza (…/api/kalendarz?t=KLUCZ). Adres pokazuje to,
-- co ta osoba widzi w aplikacji: nabożeństwa i wydarzenia (spotkania rady — tylko radzie). Klucz można
-- wymienić (stary adres przestaje działać). Uruchomienie: Supabase → SQL Editor → wklej → Run (można ponownie).
alter table public.people add column if not exists calendar_token uuid not null default gen_random_uuid();
create unique index if not exists people_calendar_token on public.people (calendar_token);

-- Klucz zalogowanej osoby (tylko zatwierdzonej); nowy = poprzedni adres przestaje działać.
create or replace function public.my_calendar_token(renew boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not is_active() then raise exception 'Kalendarz jest dla zatwierdzonych członków.'; end if;
  if renew then update people set calendar_token = gen_random_uuid() where id = auth.uid(); end if;
  select calendar_token into t from people where id = auth.uid();
  return t;
end $$;

-- Dane do pliku kalendarza (wywołuje je funkcja Netlify z kluczem z adresu). Ostatnie 60 dni i rok naprzód.
create or replace function public.calendar_feed(token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (select * from people where calendar_token = token and status = 'active'),
  council as (select exists (select 1 from p join ranks r on r.id = any (p.roles) where r.council) as ok)
  select case when not exists (select 1 from p) then null else jsonb_build_object(
    'name', (select name from p),
    'services', coalesce((select jsonb_agg(s.data order by s.date) from services s
      where s.date between current_date - 60 and current_date + 366), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e.data order by e.date) from events e
      where e.date between current_date - 60 and current_date + 366 and (e.type <> 'rada' or (select ok from council))), '[]'::jsonb),
    'types', coalesce((select t.types from templates t where t.id = 'main'), '[]'::jsonb))
  end
$$;

revoke execute on function public.my_calendar_token(boolean), public.calendar_feed(uuid) from public, anon;
grant execute on function public.my_calendar_token(boolean) to authenticated;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
