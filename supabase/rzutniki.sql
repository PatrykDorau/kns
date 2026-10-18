-- Rzutniki widoczne dla Streamu: komputer z rzutnikiem zapisuje tu swój klucz (napisy i obraz przez internet),
-- a laptop ze streamem wybiera go z listy — bez kopiowania adresu. Czytają i zapisują tylko zatwierdzeni członkowie.
-- Uruchamiaj po schema.sql (można ponownie).

create table if not exists public.projector_links (
  id text primary key,                         -- losowy identyfikator komputera (z ustawień aplikacji)
  name text not null default '' check (length(name) <= 80),
  key text not null check (length(key) between 8 and 80),
  screen boolean not null default false,       -- udostępnia też obraz rzutnika
  updated_by uuid default auth.uid() references public.people (id) on delete set null,
  updated timestamptz not null default now()
);
alter table public.projector_links enable row level security;
revoke all on public.projector_links from anon, authenticated;
grant select, insert, update, delete on public.projector_links to authenticated;

drop policy if exists projector_links_read on public.projector_links;
create policy projector_links_read on public.projector_links for select to authenticated using (is_active());
drop policy if exists projector_links_write on public.projector_links;
create policy projector_links_write on public.projector_links for all to authenticated using (is_active()) with check (is_active());
