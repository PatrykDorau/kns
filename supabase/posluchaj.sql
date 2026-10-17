-- Ustawienia strony widoczne dla wszystkich (także gości), np. „Posłuchaj”: linki do YouTube i Spotify.
-- Czyta każdy; zmienia administrator (set_site_setting).
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated timestamptz not null default now()
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);

create or replace function public.set_site_setting(k text, v jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_flag('manage') then raise exception 'Ustawienia strony zmienia administrator.'; end if;
  if k !~ '^[a-z_]{1,40}$' then raise exception 'Niepoprawna nazwa ustawienia.'; end if;
  insert into site_settings (key, value) values (k, coalesce(v, '{}'::jsonb))
  on conflict (key) do update set value = excluded.value, updated = now();
end $$;
revoke all on function public.set_site_setting(text, jsonb) from public, anon;
grant execute on function public.set_site_setting(text, jsonb) to authenticated;
