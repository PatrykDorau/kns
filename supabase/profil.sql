-- Profil: każdy (także czekający na zatwierdzenie) uzupełnia swoje imię i nazwisko oraz grupkę, do której chodzi.
-- Grupki widać w liście osób przy wyborze odbiorców powiadomień (można powiadomić całą grupkę).
alter table public.people add column if not exists grupa text not null default '';

create or replace function public.set_my_profile(new_name text, new_group text) returns public.people
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  if auth.uid() is null then raise exception 'Zaloguj się.'; end if;
  if length(trim(coalesce(new_name, ''))) = 0 then raise exception 'Wpisz imię i nazwisko.'; end if;
  update people set name = left(trim(new_name), 80), grupa = left(trim(coalesce(new_group, '')), 60)
  where id = auth.uid() returning * into p;
  return p;
end $$;

-- Podpowiedzi grupek (te, które już ktoś wpisał).
create or replace function public.group_names() returns setof text
language sql stable security definer set search_path = public as $$
  select distinct grupa from people where status = 'active' and grupa <> '' and is_active() order by 1
$$;

-- Lista osób dla wyboru odbiorców — z grupką.
drop function if exists public.people_directory();
create or replace function public.people_directory()
returns table (id uuid, name text, email text, roles text[], devices int, grupa text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_flag('edit') then raise exception 'Odbiorców wybierają osoby z prawem edycji.'; end if;
  return query
    select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), p.email, p.roles,
      (select count(*)::int from push_devices d where d.person = p.id), p.grupa
    from people p where p.status = 'active' order by lower(coalesce(nullif(p.name, ''), p.email));
end $$;

revoke all on function public.set_my_profile(text, text) from public, anon;
revoke all on function public.group_names() from public, anon;
revoke all on function public.people_directory() from public, anon;
grant execute on function public.set_my_profile(text, text) to authenticated;
grant execute on function public.group_names() to authenticated;
grant execute on function public.people_directory() to authenticated;
