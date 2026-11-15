-- inbox_push_due (wpisy od bazy → telefony) tylko z hasłem: bez niego każdy z internetu mógł odczytać świeże
-- powiadomienia wszystkich (i oznaczyć je jako wysłane). Poranna funkcja Netlify (przypomnienia.mjs) podaje PUSH_SECRET.
-- W bazie jest tylko skrót SHA-256 hasła (tabela niedostępna przez API). Hasło wpisuje administrator w edytorze SQL:
--   insert into public.server_secrets (name, hash) values ('push', encode(sha256(convert_to('HASŁO', 'UTF8')), 'hex'))
--   on conflict (name) do update set hash = excluded.hash;
-- Dopóki skrótu nie ma, funkcja działa jak dawniej (przejście bez przerwy w powiadomieniach).
-- Uruchamiać po skrzynka.sql. Można wielokrotnie.

create table if not exists public.server_secrets (
  name text primary key,
  hash text not null
);
alter table public.server_secrets enable row level security;
revoke all on public.server_secrets from public, anon, authenticated;

drop function if exists public.inbox_push_due();
create or replace function public.inbox_push_due(secret text default null) returns table (id text, subscription jsonb, title text, body text, url text)
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  select s.hash into h from server_secrets s where s.name = 'push';
  if h is not null and (secret is null or encode(sha256(convert_to(secret, 'UTF8')), 'hex') <> h) then
    raise exception 'Brak dostępu.';
  end if;
  return query
    with fresh as (
      update inbox i set pushed = true
      where i.sender is null and not i.pushed and i.created > now() - interval '1 day'
      returning i.person, i.title, i.body, i.url
    )
    select d.id, d.data -> 'subscription', f.title, f.body, f.url
    from fresh f join push_devices d on d.person = f.person
    where d.data ? 'subscription';
end $$;
revoke all on function public.inbox_push_due(text) from public;
grant execute on function public.inbox_push_due(text) to anon, authenticated;
