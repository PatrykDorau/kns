-- Telefon (przeglądarka) z włączonymi powiadomieniami należy do konta, które jest na nim TERAZ zalogowane.
-- Po zmianie konta na tym samym telefonie zwykły zapis był blokowany (wiersz należał do poprzedniego konta),
-- więc powiadomienia szły dalej do starego konta, a nowe nic nie dostawało. push_claim przenosi telefon
-- (ten sam identyfikator albo ten sam adres subskrypcji) na zalogowaną osobę. Uruchamiać po schema.sql. Można wielokrotnie.
create or replace function public.push_claim(did text, d jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Powiadomienia są dla zatwierdzonych członków.'; end if;
  if coalesce(did, '') = '' or d is null or not (d ? 'subscription') then raise exception 'Brak danych telefonu.'; end if;
  delete from push_devices where id = did
     or (data -> 'subscription' ->> 'endpoint') = (d -> 'subscription' ->> 'endpoint');
  insert into push_devices (id, person, data, updated) values (did, auth.uid(), d, now());
end $$;
revoke all on function public.push_claim(text, jsonb) from public, anon;
grant execute on function public.push_claim(text, jsonb) to authenticated;
