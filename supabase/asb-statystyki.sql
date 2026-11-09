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
