-- Zgody na e-maile według rodzaju powiadomienia (osobno: wiadomości, wydarzenia i zapisy, służby, głosowania,
-- ASB, cele wsparcia, ogłoszenia do zatwierdzenia) — domyślnie wyłączone (e-mail tylko za zgodą).
-- Każde powiadomienie w aplikacji (dzwonek) dostaje rodzaj z adresu, do którego prowadzi; skrypt Google
-- (skrypty/baza.gs, maile_powiadomien) co kilka minut wysyła je e-mailem osobom, które się na ten rodzaj zgodziły.
-- Uruchamiać po skrzynka.sql. Można wielokrotnie.

-- rola serwera (w Supabase jest zawsze; w testowej bazie w przeglądarce może jej nie być)
do $$ begin if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;

alter table public.people add column if not exists mail_prefs jsonb not null default '{}'::jsonb;
alter table public.inbox add column if not exists kind text not null default 'wiadomosci';
alter table public.inbox add column if not exists mailed boolean not null default false;

-- rodzaj powiadomienia z adresu (./?sluzby=1, ./?wydarzenie=…, ./glosowania…)
create or replace function public.inbox_kind(u text) returns text language sql immutable as $$
  select case
    when u like './?sluzby%' then 'sluzby'
    when u like './?wydarzenie=%' then 'wydarzenia'
    when u like './glosowania%' then 'glosowania'
    when u like './?asb=%' then 'asb'
    when u like './cele%' then 'cele'
    when u like './?ogloszenie=%' then 'ogloszenia'
    else 'wiadomosci'
  end
$$;
create or replace function public.inbox_set_kind() returns trigger language plpgsql as $$
begin
  new.kind := public.inbox_kind(coalesce(new.url, ''));
  return new;
end $$;
drop trigger if exists inbox_kind on public.inbox;
create trigger inbox_kind before insert on public.inbox for each row execute function public.inbox_set_kind();

-- Zgody tej osoby: tylko znane rodzaje i wartości tak/nie.
create or replace function public.set_mail_prefs(prefs jsonb) returns public.people
language plpgsql security definer set search_path = public as $$
declare p people; clean jsonb;
begin
  if auth.uid() is null then raise exception 'Zaloguj się.'; end if;
  select coalesce(jsonb_object_agg(k, (v)::boolean), '{}'::jsonb) into clean
  from jsonb_each_text(coalesce(prefs, '{}'::jsonb)) as e(k, v)
  where k in ('wiadomosci', 'wydarzenia', 'sluzby', 'glosowania', 'asb', 'cele', 'ogloszenia') and v in ('true', 'false');
  update people set mail_prefs = clean where id = auth.uid() returning * into p;
  return p;
end $$;
revoke all on function public.set_mail_prefs(jsonb) from public, anon;
grant execute on function public.set_mail_prefs(jsonb) to authenticated;

-- Kolejka e-maili (tylko skrypt z kluczem serwera): świeże powiadomienia (ostatnie 2 dni) osób, które zgodziły się
-- na ten rodzaj; od razu oznaczane jako wysłane, żeby nic nie poszło dwa razy.
create or replace function public.mail_queue() returns table (id bigint, email text, name text, title text, body text, url text, kind text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    with q as (
      update inbox i set mailed = true
      from people p
      where p.id = i.person and not i.mailed and i.created > now() - interval '2 days' and p.status = 'active'
        and coalesce((p.mail_prefs ->> i.kind)::boolean, false)
      returning i.id, p.email, p.name, i.title, i.body, i.url, i.kind
    )
    select q.id, q.email, q.name, q.title, q.body, q.url, q.kind from q;
end $$;
revoke all on function public.mail_queue() from public, anon, authenticated;
grant execute on function public.mail_queue() to service_role;
