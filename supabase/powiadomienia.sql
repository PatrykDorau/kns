-- Powiadomienia do wybranych osób (np. przy nowym wydarzeniu albo ogłoszeniu).
-- Osoba z prawem edycji wybiera odbiorców; funkcja /api/push (Netlify) z jej tokenem pobiera telefony odbiorców
-- przez notify_targets — baza sama sprawdza uprawnienia, więc serwer nie potrzebuje tajnego klucza bazy.

-- Lista osób do wyboru odbiorców: imię, rangi i liczba telefonów z włączonymi powiadomieniami.
create or replace function public.people_directory()
returns table (id uuid, name text, email text, roles text[], devices int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_flag('edit') then raise exception 'Odbiorców wybierają osoby z prawem edycji.'; end if;
  return query
    select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), p.email, p.roles,
      (select count(*)::int from push_devices d where d.person = p.id)
    from people p where p.status = 'active' order by lower(coalesce(nullif(p.name, ''), p.email));
end $$;

-- Telefony wybranych osób (tylko zatwierdzonych) — dla funkcji, która wysyła powiadomienia.
create or replace function public.notify_targets(targets uuid[])
returns table (id text, subscription jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_flag('edit') then raise exception 'Powiadomienia wysyłają osoby z prawem edycji.'; end if;
  return query
    select d.id, d.data -> 'subscription' from push_devices d join people p on p.id = d.person
    where d.person = any (targets) and p.status = 'active' and d.data ? 'subscription';
end $$;

-- Telefony, które wypisały się z powiadomień (serwer powiadomień odpowiedział 404/410).
create or replace function public.forget_push_devices(ids text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_flag('edit') then raise exception 'Brak uprawnień.'; end if;
  delete from push_devices where id = any (ids);
end $$;

revoke all on function public.people_directory() from public, anon;
revoke all on function public.notify_targets(uuid[]) from public, anon;
revoke all on function public.forget_push_devices(text[]) from public, anon;
grant execute on function public.people_directory() to authenticated;
grant execute on function public.notify_targets(uuid[]) to authenticated;
grant execute on function public.forget_push_devices(text[]) to authenticated;
