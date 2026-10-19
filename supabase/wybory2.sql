-- Głosowania, wersja 2: jeden rodzaj głosowania zamiast „na osoby” / „na odpowiedzi”.
--   • Lista do wyboru — osoby (członkowie) i dowolne odpowiedzi razem (np. Za / Przeciw albo kandydaci); układa ją
--     tworzący głosowanie (rada, pastor, administrator).
--   • Zgłoszenia od członków (opcjonalnie) do wybranego terminu — rada zatwierdza, kto/co trafia na listę.
--   • Głosowanie w terminie od–do (otwiera się i kończy samo) albo ręcznie (np. na spotkaniu: Otwórz / Wstrzymaj / Zakończ).
-- Etap liczony z dat i stanu (election_phase): nominations → ready → voting (paused) → closed.
-- Uruchamiać po wybory.sql. Można wielokrotnie.

alter table public.elections add column if not exists allow_nominations boolean not null default false;
alter table public.elections add column if not exists nominations_until timestamptz;
alter table public.elections add column if not exists vote_start timestamptz;
alter table public.elections add column if not exists vote_end timestamptz;
alter table public.elections drop constraint if exists elections_kind_check;
alter table public.elections add constraint elections_kind_check check (kind in ('people', 'options', 'mixed'));
-- dotychczasowe głosowania „na osoby” w trakcie zgłoszeń — zgłoszenia otwarte bez terminu
update public.elections set allow_nominations = true where kind = 'people' and status = 'nominations' and not allow_nominations and nominations_until is null;

-- Etap głosowania teraz (z dat i stanu ręcznego).
create or replace function public.election_phase(el public.elections) returns text
language sql stable set search_path = public as $$
  select case
    when el.status = 'closed' or (el.vote_end is not null and now() >= el.vote_end) then 'closed'
    when el.status = 'paused' then 'paused'
    when el.status = 'voting' or (el.vote_start is not null and now() >= el.vote_start) then 'voting'
    when el.allow_nominations and (el.nominations_until is null or now() < el.nominations_until) then 'nominations'
    else 'ready'
  end
$$;

-- Przejścia „same z siebie” (start i koniec w terminie): zapis stanu i powiadomienia. Wołane przy otwieraniu głosowań.
create or replace function public.elections_tick() returns void
language plpgsql security definer set search_path = public as $$
declare el elections;
begin
  if not is_active() then return; end if;
  for el in select * from elections where status <> 'closed' loop
    if election_phase(el) = 'voting' and el.opened is null then
      update elections set status = 'voting', opened = coalesce(el.vote_start, now()) where id = el.id;
      perform inbox_add(array(select id from people where status = 'active'), 'Głosowanie: ' || el.title, 'Głosowanie jest otwarte — oddaj głos w aplikacji (tajne).', './glosowania');
    elsif election_phase(el) = 'closed' then
      update elections set status = 'closed', closed = coalesce(el.vote_end, now()) where id = el.id;
      if el.results_public then
        perform inbox_add(array(select id from people where status = 'active'), 'Wyniki: ' || el.title, 'Głosowanie zakończone — wyniki w aplikacji.', './glosowania');
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.elections_tick() from public, anon;
grant execute on function public.elections_tick() to authenticated;

-- Lista głosowań: etap, terminy, lista do wyboru (osoby i odpowiedzi), zgłoszenia (rada), moje zgłoszenia, wyniki.
create or replace function public.elections_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare run boolean := can_run_elections();
begin
  if not is_active() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(y) - 'ord' order by y.ord, y.created desc) from (
    select e.id, e.title, e.description, e.kind, e.max_choices, election_phase(e) as status, e.results_public, e.created, e.opened, e.closed, e.event_id,
      e.allow_nominations, e.nominations_until, e.vote_start, e.vote_end,
      case election_phase(e) when 'voting' then 0 when 'paused' then 1 when 'nominations' then 2 when 'ready' then 3 else 4 end as ord,
      exists (select 1 from election_voters v where v.election_id = e.id and v.person = auth.uid()) as voted,
      (select count(*) from election_voters v where v.election_id = e.id)::int as turnout,
      (select count(*) from people p where p.status = 'active')::int as eligible,
      exists (select 1 from election_votes v where v.election_id = e.id) as has_votes,
      coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'person', c.person, 'label', coalesce(nullif(c.label, ''), pe.name, pe.email), 'accepted', c.accepted, 'pos', c.pos,
          'nominations', case when run then (select count(*) from election_nominations n where n.candidate_id = c.id) end,
          'mine', exists (select 1 from election_nominations n where n.candidate_id = c.id and n.nominator = auth.uid()),
          'votes', case when (election_phase(e) = 'closed' and (e.results_public or run)) then (select count(*) from election_votes v where v.candidate_id = c.id) end)
        order by c.accepted desc nulls last, c.pos, coalesce(nullif(c.label, ''), pe.name))
        from election_candidates c left join people pe on pe.id = c.person
        where c.election_id = e.id and (run or c.accepted or exists (select 1 from election_nominations n where n.candidate_id = c.id and n.nominator = auth.uid()))), '[]'::jsonb) as candidates
    from elections e) y), '[]'::jsonb);
end $$;
revoke all on function public.elections_overview() from public, anon;
grant execute on function public.elections_overview() to authenticated;

-- Zapis głosowania: dane, terminy i lista do wyboru — [{ person } | { label }] w kolejności na karcie.
-- Pozycje spoza listy: zgłoszone przez członków — odrzucone (zostają w zgłoszeniach), dopisane przez tworzącego — usunięte.
-- Gdy są już głosy — lista i liczba wyborów się nie zmieniają.
create or replace function public.election_save(e jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  eid text := coalesce(nullif(e ->> 'id', ''), substr(md5(random()::text), 1, 10));
  cur elections; item jsonb; n int := 0; cid text; who uuid; lbl text; keep text[] := '{}';
  voted boolean; ns timestamptz := nullif(e ->> 'nominations_until', '')::timestamptz;
  vs timestamptz := nullif(e ->> 'vote_start', '')::timestamptz; ve timestamptz := nullif(e ->> 'vote_end', '')::timestamptz;
begin
  if not can_run_elections() then raise exception 'Głosowania prowadzi rada zboru.'; end if;
  if coalesce(trim(e ->> 'title'), '') = '' then raise exception 'Wpisz tytuł głosowania.'; end if;
  if vs is not null and ve is not null and ve <= vs then raise exception 'Koniec głosowania musi być po jego początku.'; end if;
  if coalesce((e ->> 'allow_nominations')::boolean, false) and ns is not null and vs is not null and ns > vs then raise exception 'Zgłoszenia muszą się skończyć przed początkiem głosowania.'; end if;
  select * into cur from elections where id = eid;
  voted := exists (select 1 from election_votes v where v.election_id = eid);
  insert into elections (id, title, description, kind, max_choices, results_public, event_id, allow_nominations, nominations_until, vote_start, vote_end, status)
  values (eid, trim(e ->> 'title'), coalesce(e ->> 'description', ''), 'mixed', greatest(1, coalesce((e ->> 'max_choices')::int, 1)), coalesce((e ->> 'results_public')::boolean, true),
    nullif(e ->> 'event_id', ''), coalesce((e ->> 'allow_nominations')::boolean, false), ns, vs, ve, 'nominations')
  on conflict (id) do update set title = excluded.title, description = excluded.description, results_public = excluded.results_public, event_id = excluded.event_id,
    allow_nominations = excluded.allow_nominations, nominations_until = excluded.nominations_until, vote_start = excluded.vote_start, vote_end = excluded.vote_end,
    max_choices = case when voted then elections.max_choices else excluded.max_choices end,
    kind = case when voted then elections.kind else 'mixed' end;
  if not voted and jsonb_typeof(e -> 'options') = 'array' then
    for item in select * from jsonb_array_elements(e -> 'options') loop
      n := n + 1;
      who := case when jsonb_typeof(item) = 'object' then nullif(item ->> 'person', '')::uuid end;
      lbl := trim(case when jsonb_typeof(item) = 'string' then item #>> '{}' else coalesce(item ->> 'label', '') end);
      if who is null and lbl = '' then continue; end if;
      if who is not null then
        if not exists (select 1 from people where id = who and status = 'active') then continue; end if;
        select id into cid from election_candidates where election_id = eid and person = who;
      else
        select id into cid from election_candidates where election_id = eid and person is null and label = lbl;
      end if;
      if cid is null then
        cid := eid || '-' || substr(md5(random()::text), 1, 8);
        insert into election_candidates (id, election_id, person, label, accepted, pos) values (cid, eid, who, case when who is null then lbl else '' end, true, n);
      else
        update election_candidates set accepted = true, pos = n where id = cid;
      end if;
      keep := keep || cid; cid := null;
    end loop;
    -- spoza listy: zgłoszone przez członków — odrzucone, dopisane przez tworzącego — usunięte
    update election_candidates c set accepted = false where c.election_id = eid and not (c.id = any (keep)) and c.accepted
      and exists (select 1 from election_nominations x where x.candidate_id = c.id);
    delete from election_candidates c where c.election_id = eid and not (c.id = any (keep))
      and not exists (select 1 from election_nominations x where x.candidate_id = c.id);
  end if;
  if cur.id is null then
    perform inbox_add(array(select id from people where status = 'active'), 'Głosowanie: ' || trim(e ->> 'title'),
      case when coalesce((e ->> 'allow_nominations')::boolean, false) then 'Możesz zgłaszać kandydatów' || coalesce(' do ' || to_char(ns at time zone 'Europe/Warsaw', 'DD.MM HH24:MI'), '') || '.'
           when vs is not null then 'Głosowanie od ' || to_char(vs at time zone 'Europe/Warsaw', 'DD.MM HH24:MI') || '.'
           else 'Wkrótce głosowanie.' end, './glosowania');
  end if;
  return eid;
end $$;
revoke all on function public.election_save(jsonb) from public, anon;
grant execute on function public.election_save(jsonb) to authenticated;

-- Zgłoszenie od członka: osoba (who) albo propozycja tekstem (label); withdraw — wycofanie swojego zgłoszenia.
drop function if exists public.election_nominate(text, uuid, boolean);
create or replace function public.election_nominate(e text, who uuid default null, withdraw boolean default false, label text default null) returns void
language plpgsql security definer set search_path = public as $$
declare el elections; cid text; lbl text := trim(coalesce(label, ''));
begin
  if not is_active() then raise exception 'Zgłoszenia przyjmujemy od zatwierdzonych członków.'; end if;
  select * into el from elections where id = e;
  if el.id is null then raise exception 'Nie ma takiego głosowania.'; end if;
  if election_phase(el) <> 'nominations' then raise exception 'Zgłaszanie jest zamknięte.'; end if;
  if who is null and lbl = '' then raise exception 'Wybierz osobę albo wpisz propozycję.'; end if;
  if who is not null and not exists (select 1 from people where id = who and status = 'active') then raise exception 'Można zgłosić tylko zatwierdzonego członka.'; end if;
  if who is not null then select id into cid from election_candidates where election_id = e and person = who;
  else select id into cid from election_candidates where election_id = e and person is null and lower(election_candidates.label) = lower(lbl); end if;
  if withdraw then
    delete from election_nominations where candidate_id = cid and nominator = auth.uid();
    delete from election_candidates c where c.id = cid and c.accepted is null and not exists (select 1 from election_nominations n where n.candidate_id = c.id);
    return;
  end if;
  if cid is null then
    cid := e || '-' || substr(md5(random()::text), 1, 8);
    insert into election_candidates (id, election_id, person, label, pos) values (cid, e, who, case when who is null then left(lbl, 160) else '' end, 1000);
  end if;
  insert into election_nominations (candidate_id, nominator) values (cid, auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.election_nominate(text, uuid, boolean, text) from public, anon;
grant execute on function public.election_nominate(text, uuid, boolean, text) to authenticated;

-- Ręczne sterowanie: 'voting' — otwórz teraz (albo wznów), 'paused' — wstrzymaj, 'closed' — zakończ teraz,
-- 'nominations' — cofnij do przygotowania (tylko bez głosów).
create or replace function public.election_status(e text, s text) returns void
language plpgsql security definer set search_path = public as $$
declare el elections; ph text;
begin
  if not can_run_elections() then raise exception 'Głosowania prowadzi rada zboru.'; end if;
  select * into el from elections where id = e;
  if el.id is null then raise exception 'Nie ma takiego głosowania.'; end if;
  ph := election_phase(el);
  if s = 'voting' then
    if ph = 'closed' then raise exception 'Głosowanie jest już zakończone.'; end if;
    if (select count(*) from election_candidates where election_id = e and accepted) < 1 then raise exception 'Najpierw ułóż listę do wyboru (co najmniej jedną pozycję).'; end if;
    update elections set status = 'voting', opened = coalesce(opened, now()), vote_start = case when vote_start is null or vote_start > now() then now() else vote_start end where id = e;
    if el.opened is null then
      perform inbox_add(array(select id from people where status = 'active'), 'Głosowanie: ' || el.title, 'Głosowanie jest otwarte — oddaj głos w aplikacji (tajne).', './glosowania');
    end if;
  elsif s = 'paused' then
    if ph <> 'voting' then raise exception 'Wstrzymać można trwające głosowanie.'; end if;
    update elections set status = 'paused', opened = coalesce(opened, now()) where id = e;
  elsif s = 'closed' then
    if ph not in ('voting', 'paused') then raise exception 'Zakończyć można trwające głosowanie.'; end if;
    update elections set status = 'closed', closed = now(), vote_end = now() where id = e;
    if el.results_public then
      perform inbox_add(array(select id from people where status = 'active'), 'Wyniki: ' || el.title, 'Głosowanie zakończone — wyniki w aplikacji.', './glosowania');
    end if;
  elsif s = 'nominations' then
    if exists (select 1 from election_voters where election_id = e) then raise exception 'Są już oddane głosy — nie można cofnąć.'; end if;
    update elections set status = 'nominations', opened = null, vote_start = case when vote_start <= now() then null else vote_start end where id = e;
  else raise exception 'Nieznany etap.';
  end if;
end $$;
revoke all on function public.election_status(text, text) from public, anon;
grant execute on function public.election_status(text, text) to authenticated;

-- Głos: tylko w trakcie głosowania (także w terminie od–do).
create or replace function public.election_vote(e text, choices text[]) returns void
language plpgsql security definer set search_path = public as $$
declare el elections; n int := coalesce(array_length(choices, 1), 0); c text;
begin
  if not is_active() then raise exception 'Głosują zatwierdzeni członkowie.'; end if;
  select * into el from elections where id = e;
  if el.id is null or election_phase(el) <> 'voting' then raise exception 'Głosowanie nie jest otwarte.'; end if;
  if n < 1 then raise exception 'Wybierz co najmniej jedną odpowiedź.'; end if;
  if n > el.max_choices then raise exception 'Można wybrać najwyżej %.', el.max_choices; end if;
  if (select count(distinct x) from unnest(choices) x) <> n then raise exception 'Każdą odpowiedź można wybrać tylko raz.'; end if;
  if exists (select 1 from unnest(choices) x where not exists (select 1 from election_candidates c where c.id = x and c.election_id = e and c.accepted)) then
    raise exception 'Nieprawidłowy wybór.';
  end if;
  insert into election_voters (election_id, person) values (e, auth.uid());
  foreach c in array choices loop insert into election_votes (election_id, candidate_id) values (e, c); end loop;
exception when unique_violation then raise exception 'Twój głos w tym głosowaniu jest już oddany.';
end $$;
revoke all on function public.election_vote(text, text[]) from public, anon;
grant execute on function public.election_vote(text, text[]) to authenticated;
