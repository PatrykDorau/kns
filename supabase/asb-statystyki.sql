-- ASB: statystyki większych wydarzeń (dawniej arkusz „ASB | Statystyki Poznań × Gdańsk”, zakładka „Dashboard Poznań”).
-- Rejestr wydarzeń (frekwencja z jakością danych, nowe osoby, źródła dotarcia, koszty w kategoriach), rejestr reklam
-- Meta (wydatek, wyświetlenia, kliknięcia, wynik) i ustawienia miasta (cel udziału stałych bywalców, działania na kolejne
-- wydarzenia). Pusta kwota = koszt nieznany (nie 0 zł), pusta frekwencja = brak danych (nie 0 osób).
-- Widzą i zmieniają osoby z rangą „ASB” oraz administrator (is_asb() z asb.sql). Uruchamiaj po asb.sql. Można ponownie.

create table if not exists public.asb_stat_events (
  id text primary key,
  city text not null default 'Poznań',
  date date,
  name text not null default '',
  kind text not null default 'Ewangelizacja',
  place text not null default '',
  signups int,                       -- zapisy (to nie obecność)
  attendance int,                    -- obecni
  att_min int, att_max int,          -- przedział, gdy liczby nie ma (np. 5–10)
  quality text not null default 'potwierdzona',
  new_people int,                    -- rozpoznane nowe osoby
  src_friends int, src_social int, src_posters int, src_regular int, src_other int, -- źródła dotarcia (deklaracje)
  src_basis text not null default '', -- skąd źródła: zapisy, ankieta obecnych, relacja
  cost_posters numeric(10,2), cost_flyers numeric(10,2), cost_room numeric(10,2), cost_food numeric(10,2),
  cost_transport numeric(10,2), cost_decor numeric(10,2), cost_other numeric(10,2), cost_promo numeric(10,2), -- promocja poza Meta
  cost_status text not null default 'czesciowe',
  note text not null default '',
  updated timestamptz not null default now(),
  updated_by text not null default ''
);
do $$ begin
  alter table public.asb_stat_events add constraint asb_stat_events_quality check (quality in ('potwierdzona', 'szacunek', 'brak'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.asb_stat_events add constraint asb_stat_events_cost check (cost_status in ('pelne', 'czesciowe', 'nieznane'));
exception when duplicate_object then null; end $$;
create index if not exists asb_stat_events_city on public.asb_stat_events (city, date);

create table if not exists public.asb_ads (
  id text primary key,
  city text not null default 'Poznań',
  event_id text references public.asb_stat_events (id) on delete set null,
  date date,
  name text not null default '',
  goal text not null default 'reakcje',  -- cel kampanii Meta: reakcje, rozmowy, aktywnosc, polubienia, inne
  spent numeric(10,2),                     -- faktycznie wydano (nie budżet)
  impressions int, reach int,
  results int,                             -- wynik wg celu (np. reakcje na wydarzenie)
  link_clicks int, activity int,
  note text not null default '',
  updated timestamptz not null default now(),
  updated_by text not null default ''
);
do $$ begin
  alter table public.asb_ads add constraint asb_ads_goal check (goal in ('reakcje', 'rozmowy', 'aktywnosc', 'polubienia', 'inne'));
exception when duplicate_object then null; end $$;
create index if not exists asb_ads_city on public.asb_ads (city, date);

create table if not exists public.asb_stat_cities (
  id text primary key,                    -- miasto, np. „Poznań”
  regular_goal int not null default 50,   -- cel: najwyżej tyle % deklaracji „stali/bywalcy” w zapisach
  actions jsonb not null default '[]',    -- działania na kolejne wydarzenia [{ title, text }]
  updated timestamptz not null default now()
);

alter table public.asb_stat_events enable row level security;
alter table public.asb_ads enable row level security;
alter table public.asb_stat_cities enable row level security;
revoke all on public.asb_stat_events, public.asb_ads, public.asb_stat_cities from public, anon, authenticated;
grant select, insert, update, delete on public.asb_stat_events, public.asb_ads, public.asb_stat_cities to authenticated;
drop policy if exists asb_stat_events_all on public.asb_stat_events;
drop policy if exists asb_ads_all on public.asb_ads;
drop policy if exists asb_stat_cities_all on public.asb_stat_cities;
create policy asb_stat_events_all on public.asb_stat_events for all to authenticated using (is_asb()) with check (is_asb());
create policy asb_ads_all on public.asb_ads for all to authenticated using (is_asb()) with check (is_asb());
create policy asb_stat_cities_all on public.asb_stat_cities for all to authenticated using (is_asb()) with check (is_asb());

/* ---------- Facebook / Meta (funkcja /api/meta pobiera dane tokenem z Netlify; zapisuje przeglądarka osoby z ASB) ---------- */
-- Miasto: strona na Facebooku i konto reklamowe (to nie są tajne dane — tajny token jest tylko na serwerze).
alter table public.asb_stat_cities add column if not exists fb_page text not null default '';        -- identyfikator strony
alter table public.asb_stat_cities add column if not exists fb_ad_account text not null default '';  -- act_… (konto reklamowe)
alter table public.asb_stat_cities add column if not exists fb_synced timestamptz;
alter table public.asb_stat_cities add column if not exists fb_followers int;
alter table public.asb_stat_cities add column if not exists ig_followers int;
-- Reklamy pobrane z Meta: identyfikator reklamy i cel kampanii; przypisanie do wydarzenia i uwagi zostają przy ponownym pobraniu.
alter table public.asb_ads add column if not exists fb_id text;
alter table public.asb_ads add column if not exists campaign text not null default '';
alter table public.asb_ads add column if not exists synced timestamptz;
create unique index if not exists asb_ads_fb on public.asb_ads (fb_id) where fb_id is not null;
-- Wydarzenia ze strony na Facebooku (wezmę udział / zainteresowani) — do porównania z faktyczną frekwencją.
create table if not exists public.asb_fb_events (
  id text primary key,                    -- identyfikator wydarzenia na Facebooku
  city text not null default 'Poznań',
  name text not null default '',
  start_time timestamptz,
  place text not null default '',
  attending int, interested int,
  synced timestamptz not null default now()
);
alter table public.asb_stat_events add column if not exists fb_event_id text;   -- powiązane wydarzenie na Facebooku
alter table public.asb_stat_events add column if not exists meeting_id text;    -- powiązane spotkanie w grafiku ASB
alter table public.asb_fb_events enable row level security;
revoke all on public.asb_fb_events from public, anon, authenticated;
grant select, insert, update, delete on public.asb_fb_events to authenticated;
drop policy if exists asb_fb_events_all on public.asb_fb_events;
create policy asb_fb_events_all on public.asb_fb_events for all to authenticated using (is_asb()) with check (is_asb());
-- frekwencja zwykłych cotygodniowych spotkań z grafiku ASB (asb_meetings) należy do tego miasta — trend i wpływ ewangelizacji
alter table public.asb_stat_cities add column if not exists grafik boolean not null default false;

/* ---------- token Meta wklejany w aplikacji ---------- */
-- Token trafia do zamkniętej tabeli: nikt z aplikacji go nie odczyta (ani ASB, ani administrator) — czyta go tylko
-- funkcja serwerowa „meta” (Supabase Edge Function, klucz serwisowy). W aplikacji widać tylko końcówkę i datę.
create table if not exists public.asb_fb_secrets (
  city text primary key,
  token text not null,
  set_by text not null default '',
  set_at timestamptz not null default now()
);
alter table public.asb_fb_secrets enable row level security;
revoke all on public.asb_fb_secrets from public, anon, authenticated;
grant select on public.asb_fb_secrets to service_role;
alter table public.asb_stat_cities add column if not exists fb_token_hint text not null default '';
alter table public.asb_stat_cities add column if not exists fb_token_set timestamptz;

create or replace function public.asb_fb_token_set(c text, t text) returns text
language plpgsql security definer set search_path = public as $$
declare tok text := trim(coalesce(t, '')); hint text;
begin
  if not is_asb() then raise exception 'Tylko dla ASB.'; end if;
  if coalesce(trim(c), '') = '' then raise exception 'Brak miasta.'; end if;
  if tok = '' then
    delete from asb_fb_secrets where city = c;
    update asb_stat_cities set fb_token_hint = '', fb_token_set = null where id = c;
    return '';
  end if;
  if length(tok) < 40 or tok ~ '\s' then raise exception 'To nie wygląda na token Meta — skopiuj cały token (długi ciąg znaków bez spacji).'; end if;
  hint := '…' || right(tok, 4);
  insert into asb_fb_secrets (city, token, set_by, set_at)
    values (c, tok, coalesce((select email from people where id = auth.uid()), ''), now())
    on conflict (city) do update set token = excluded.token, set_by = excluded.set_by, set_at = now();
  insert into asb_stat_cities (id) values (c) on conflict (id) do nothing;
  update asb_stat_cities set fb_token_hint = hint, fb_token_set = now() where id = c;
  return hint;
end $$;
revoke all on function public.asb_fb_token_set(text, text) from public, anon;
grant execute on function public.asb_fb_token_set(text, text) to authenticated;
