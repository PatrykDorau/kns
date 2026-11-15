-- Powiadomienia a moduły: wyłączony moduł nie wysyła powiadomień, a administrator może też wyciszyć powiadomienia
-- włączonego modułu (Moduły → „Powiadomienia”). Wpis w dzwonku z takiego modułu w ogóle nie powstaje, więc nie idzie
-- też na telefon (push czyta dzwonek) ani e-mailem (mail_queue czyta dzwonek).
-- Ustawienia: site_settings 'moduly' → off (wyłączone), mute (wyciszone powiadomienia).
-- Uruchamiać po skrzynka.sql i role-moduly.sql. Można wielokrotnie.

-- moduł powiadomienia z adresu, do którego prowadzi (i tytułu — grafik i służby mają ten sam adres)
create or replace function public.inbox_module(u text, t text) returns text language sql immutable as $$
  select case
    when u like './?sluzby%' and (t like 'Zaproszenie do służby:%' or t like 'W niedzielę służysz:%' or t like 'Czekamy na odpowiedź:%'
      or t like 'Grafik:%' or t ~ ' nie może \d\d\.\d\d$') then 'grafik'
    when u like './?sluzby%' then 'serve'
    when u like './?wydarzenie=%' then 'cal'
    when u like './glosowania%' then 'votes'
    when u like './?asb=%' then 'asb'
    when u like './cele%' then 'goals'
    when u like './?ogloszenie=%' then 'anns'
    when u like './?wydawka=%' then 'gifts'
    when u like './ankiety%' then 'surveys'
    when u like './zadania%' then 'zadania'
    when u like './modlitwa%' then 'pray'
    when u like './dzieci%' then 'dzieci'
    when u like './zgloszenia%' then 'bugs'
    else 'msg'
  end
$$;
revoke all on function public.inbox_module(text, text) from public, anon;

-- czy powiadomienia tego modułu mają nie powstawać (moduł wyłączony, wyciszony albo wyłączony moduł nadrzędny)
create or replace function public.inbox_muted(u text, t text) returns boolean
language sql stable security definer set search_path = public as $$
  with m as (select inbox_module(coalesce(u, ''), coalesce(t, '')) id),
       s as (select coalesce((select value from site_settings where key = 'moduly'), '{}'::jsonb) v)
  select exists (
    select 1 from m, s, unnest(array[m.id] || case when m.id = 'grafik' then array['serve'] else '{}'::text[] end) x
    where coalesce(s.v -> 'off', '[]'::jsonb) ? x or (x = m.id and coalesce(s.v -> 'mute', '[]'::jsonb) ? x))
$$;
revoke all on function public.inbox_muted(text, text) from public, anon, authenticated;

create or replace function public.inbox_skip_muted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if inbox_muted(new.url, new.title) then return null; end if;
  return new;
end $$;
revoke all on function public.inbox_skip_muted() from public, anon, authenticated;
drop trigger if exists inbox_mute on public.inbox;
create trigger inbox_mute before insert on public.inbox for each row execute function public.inbox_skip_muted();
