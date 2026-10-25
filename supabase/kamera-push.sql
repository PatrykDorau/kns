-- Sygnały dla kamerzysty jako powiadomienia (Web Push) — zamiast / obok ntfy: telefony służby technicznej, które włączyły
-- „Sygnały jako powiadomienie” na ekranie Kamera, dostają jedno podmieniane powiadomienie („Kamera: NA WIZJI”…), także
-- przy zablokowanym ekranie i na zegarku. Wysyła aplikacja na komputer przez /api/push (cue: true) z tokenem osoby
-- ze służby technicznej — baza oddaje jej tylko telefony, które się zapisały. Uruchamiać po schema.sql i push-urzadzenia.sql.
-- Bez klucza obcego do push_devices: push_claim przy każdym otwarciu aplikacji zapisuje telefon od nowa (usuń + wstaw).
create table if not exists public.cue_phones (
  device_id text primary key,
  person uuid not null default auth.uid() references public.people (id) on delete cascade,
  updated timestamptz not null default now()
);
alter table public.cue_phones enable row level security;
revoke all on public.cue_phones from anon, authenticated;

-- służba techniczna (jak „Kamera (sygnały)” w aplikacji): ranga „technika” albo administrator
create or replace function public.is_tech() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'technika' = any (p.roles)) or has_flag('manage')
$$;

-- ten telefon: sygnały jako powiadomienie — włącz / wyłącz / sprawdź
create or replace function public.cue_phone_set(did text, turn_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_tech() then raise exception 'Sygnały kamery są dla służby technicznej.'; end if;
  if coalesce(did, '') = '' then raise exception 'Brak identyfikatora telefonu.'; end if;
  if turn_on then
    insert into cue_phones (device_id, person) values (did, auth.uid())
    on conflict (device_id) do update set person = excluded.person, updated = now();
  else
    delete from cue_phones where device_id = did;
  end if;
  return turn_on;
end $$;
create or replace function public.cue_phone_on(did text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cue_phones c where c.device_id = did and c.person = auth.uid())
$$;

-- dla wysyłającego (służba techniczna): subskrypcje telefonów, które chcą sygnały (osoby nadal ze służby technicznej)
create or replace function public.cue_targets() returns table (id text, subscription jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_tech() then raise exception 'Sygnały wysyła służba techniczna.'; end if;
  return query select d.id, d.data -> 'subscription' from cue_phones c
    join push_devices d on d.id = c.device_id
    join people p on p.id = d.person and p.status = 'active' and ('technika' = any (p.roles) or exists (select 1 from ranks r where r.id = any (p.roles) and r.manage))
    where d.data ? 'subscription';
end $$;

revoke all on function public.is_tech(), public.cue_phone_set(text, boolean), public.cue_phone_on(text), public.cue_targets() from public, anon;
grant execute on function public.is_tech(), public.cue_phone_set(text, boolean), public.cue_phone_on(text), public.cue_targets() to authenticated;
