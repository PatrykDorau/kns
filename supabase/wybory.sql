-- Wybory i głosowania (np. wybory rady, głosowanie na spotkaniu członkowskim):
--   1) zgłaszanie — członkowie zgłaszają kandydatów (głosowanie „na osoby”) albo rada od razu wpisuje opcje,
--   2) rada akceptuje, kto bierze udział,
--   3) głosowanie — każdy zatwierdzony członek raz, można wybrać kilka (do max_choices),
--   4) zakończone — wyniki.
-- Głosowanie można podpiąć pod spotkanie z kalendarza (np. członkowskie) i włączać/wstrzymywać w trakcie
-- (status 'voting' — aktywne, 'paused' — wstrzymane: oddane głosy zostają, nowych nie można oddać).
-- Głos jest TAJNY: kto zagłosował (election_voters) jest zapisane osobno od tego, na kogo (election_votes, bez osoby).
-- Uruchamiaj po schema.sql, zatwierdzanie.sql, skrzynka.sql (można ponownie).

create table if not exists public.elections (
  id text primary key,
  title text not null check (length(title) between 1 and 160),
  description text not null default '',
  kind text not null default 'people' check (kind in ('people', 'options')),  -- na osoby (ze zgłoszeń) albo na opcje
  max_choices int not null default 1 check (max_choices between 1 and 50),
  status text not null default 'nominations' check (status in ('nominations', 'voting', 'paused', 'closed')),
  results_public boolean not null default true,                                -- wyniki dla wszystkich (inaczej tylko rada)
  created_by uuid default auth.uid() references public.people (id) on delete set null,
  created timestamptz not null default now(),
  opened timestamptz,  -- początek głosowania
  closed timestamptz   -- koniec głosowania
);
alter table public.elections add column if not exists event_id text references public.events (id) on delete set null; -- spotkanie
alter table public.elections drop constraint if exists elections_status_check;
alter table public.elections add constraint elections_status_check check (status in ('nominations', 'voting', 'paused', 'closed'));
create table if not exists public.election_candidates (
  id text primary key,
  election_id text not null references public.elections (id) on delete cascade,
  person uuid references public.people (id) on delete cascade,  -- kandydat-osoba (null — opcja)
  label text not null default '' check (length(label) <= 160),
  accepted boolean,                                              -- null — czeka na radę
  created timestamptz not null default now(),
  unique (election_id, person)
);
alter table public.election_candidates add column if not exists pos int not null default 0; -- kolejność odpowiedzi jak wpisane
create table if not exists public.election_nominations (
  candidate_id text not null references public.election_candidates (id) on delete cascade,
  nominator uuid not null default auth.uid() references public.people (id) on delete cascade,
  created timestamptz not null default now(),
  primary key (candidate_id, nominator)
);
create table if not exists public.election_voters (
  election_id text not null references public.elections (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  voted timestamptz not null default now(),
  primary key (election_id, person)
);
-- tajne: bez osoby i bez czasu oddania głosu (kolejność wierszy nie zdradza, kto głosował)
create table if not exists public.election_votes (
  election_id text not null references public.elections (id) on delete cascade,
  candidate_id text not null references public.election_candidates (id) on delete cascade
);

alter table public.elections enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_nominations enable row level security;
alter table public.election_voters enable row level security;
alter table public.election_votes enable row level security;
-- wszystko przez funkcje poniżej — bez bezpośredniego dostępu do tabel
revoke all on public.elections, public.election_candidates, public.election_nominations, public.election_voters, public.election_votes from anon, authenticated;

-- Kto prowadzi wybory: rada zboru, pastor, administrator.
create or replace function public.can_run_elections() returns boolean
language sql stable security definer set search_path = public as $$
  select has_flag('council') or has_flag('manage')
    or exists (select 1 from people p where p.id = auth.uid() and p.status = 'active' and 'pastor' = any (p.roles))
$$;
revoke all on function public.can_run_elections() from public, anon;
grant execute on function public.can_run_elections() to authenticated;

-- Lista zatwierdzonych członków do zgłaszania kandydatów (same imiona — bez e-maili).
create or replace function public.election_people() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from people p
  where is_active() and p.status = 'active' order by 2
$$;
revoke all on function public.election_people() from public, anon;
grant execute on function public.election_people() to authenticated;

-- Wszystkie wybory z moim stanem; kandydaci: zaakceptowani dla wszystkich, zgłoszenia i ich liczba — dla rady;
-- wyniki po zakończeniu (gdy publiczne) albo zawsze dla rady; frekwencja dla rady w trakcie.
create or replace function public.elections_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare run boolean := can_run_elections();
begin
  if not is_active() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x.ord, x.created desc) from (
    select e.id, e.title, e.description, e.kind, e.max_choices, e.status, e.results_public, e.created, e.opened, e.closed, e.event_id,
      case e.status when 'voting' then 0 when 'paused' then 1 when 'nominations' then 2 else 3 end as ord,
      exists (select 1 from election_voters v where v.election_id = e.id and v.person = auth.uid()) as voted,
      (select count(*) from election_voters v where v.election_id = e.id)::int as turnout,
      (select count(*) from people p where p.status = 'active')::int as eligible,
      coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'person', c.person, 'label', coalesce(nullif(c.label, ''), pe.name, pe.email), 'accepted', c.accepted,
          'nominations', case when run then (select count(*) from election_nominations n where n.candidate_id = c.id) end,
          'mine', exists (select 1 from election_nominations n where n.candidate_id = c.id and n.nominator = auth.uid()),
          'votes', case when (e.status = 'closed' and (e.results_public or run)) then (select count(*) from election_votes v where v.candidate_id = c.id) end)
        order by c.accepted desc nulls last, c.pos, coalesce(nullif(c.label, ''), pe.name))
        from election_candidates c left join people pe on pe.id = c.person
        where c.election_id = e.id and (run or c.accepted or exists (select 1 from election_nominations n where n.candidate_id = c.id and n.nominator = auth.uid()))), '[]'::jsonb) as candidates
    from elections e) x), '[]'::jsonb);
end $$;
revoke all on function public.elections_overview() from public, anon;
grant execute on function public.elections_overview() to authenticated;

-- Rada: nowe wybory albo zmiana (tytuł, opis, liczba wyborów, opcje do głosowania).
create or replace function public.election_save(e jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare eid text := coalesce(nullif(e ->> 'id', ''), substr(md5(random()::text), 1, 10)); cur elections; opt text; n int := 0;
begin
  if not can_run_elections() then raise exception 'Wybory prowadzi rada zboru.'; end if;
  select * into cur from elections where id = eid;
  if cur.id is not null and cur.status <> 'nominations' then
    update elections set title = coalesce(nullif(e ->> 'title', ''), title), description = coalesce(e ->> 'description', description), results_public = coalesce((e ->> 'results_public')::boolean, results_public),
      event_id = case when e ? 'event_id' then nullif(e ->> 'event_id', '') else event_id end where id = eid;
    return eid; -- po rozpoczęciu głosowania nie zmienia się rodzaju ani liczby wyborów
  end if;
  insert into elections (id, title, description, kind, max_choices, results_public, event_id)
  values (eid, e ->> 'title', coalesce(e ->> 'description', ''), coalesce(e ->> 'kind', 'people'), greatest(1, coalesce((e ->> 'max_choices')::int, 1)), coalesce((e ->> 'results_public')::boolean, true), nullif(e ->> 'event_id', ''))
  on conflict (id) do update set title = excluded.title, description = excluded.description, kind = excluded.kind, max_choices = excluded.max_choices, results_public = excluded.results_public, event_id = excluded.event_id;
  -- opcje (głosowanie na opcje): od razu zaakceptowane
  if coalesce(e ->> 'kind', 'people') = 'options' and jsonb_typeof(e -> 'options') = 'array' then
    delete from election_candidates c where c.election_id = eid and c.person is null and not (c.label in (select jsonb_array_elements_text(e -> 'options')));
    for opt in select jsonb_array_elements_text(e -> 'options') loop
      n := n + 1;
      if trim(opt) <> '' and not exists (select 1 from election_candidates c where c.election_id = eid and c.label = trim(opt)) then
        insert into election_candidates (id, election_id, label, accepted, pos) values (eid || '-' || substr(md5(random()::text), 1, 8), eid, trim(opt), true, n);
      else
        update election_candidates c set pos = n where c.election_id = eid and c.label = trim(opt);
      end if;
    end loop;
  end if;
  if cur.id is null then
    perform inbox_add(array(select id from people where status = 'active'), 'Wybory: ' || (e ->> 'title'),
      case when coalesce(e ->> 'kind', 'people') = 'people' then 'Zgłoś kandydatów — rada zatwierdzi listę, potem głosowanie.' else 'Wkrótce głosowanie.' end, './glosowania');
  end if;
  return eid;
end $$;
revoke all on function public.election_save(jsonb) from public, anon;
grant execute on function public.election_save(jsonb) to authenticated;

-- Członek zgłasza kandydata (albo wycofuje swoje zgłoszenie: withdraw = true).
create or replace function public.election_nominate(e text, who uuid, withdraw boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare el elections; cid text;
begin
  if not is_active() then raise exception 'Kandydatów zgłaszają zatwierdzeni członkowie.'; end if;
  select * into el from elections where id = e;
  if el.id is null then raise exception 'Nie ma takich wyborów.'; end if;
  if el.status <> 'nominations' or el.kind <> 'people' then raise exception 'Zgłaszanie kandydatów jest zamknięte.'; end if;
  if not exists (select 1 from people where id = who and status = 'active') then raise exception 'Można zgłosić tylko zatwierdzonego członka.'; end if;
  select id into cid from election_candidates where election_id = e and person = who;
  if withdraw then
    delete from election_nominations where candidate_id = cid and nominator = auth.uid();
    delete from election_candidates c where c.id = cid and c.accepted is null and not exists (select 1 from election_nominations n where n.candidate_id = c.id);
    return;
  end if;
  if cid is null then
    cid := e || '-' || substr(md5(random()::text), 1, 8);
    insert into election_candidates (id, election_id, person) values (cid, e, who);
  end if;
  insert into election_nominations (candidate_id, nominator) values (cid, auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.election_nominate(text, uuid, boolean) from public, anon;
grant execute on function public.election_nominate(text, uuid, boolean) to authenticated;

-- Rada: kandydat bierze udział (true), nie (false), do decyzji (null). Rada może też dopisać osobę sama.
create or replace function public.election_review(c text, ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_run_elections() then raise exception 'Kandydatów zatwierdza rada zboru.'; end if;
  if exists (select 1 from election_candidates x join elections e on e.id = x.election_id where x.id = c and e.status = 'closed') then raise exception 'Wybory są zakończone.'; end if;
  if exists (select 1 from election_candidates x join elections e on e.id = x.election_id where x.id = c and e.status = 'voting')
     and exists (select 1 from election_votes v where v.candidate_id = c) then raise exception 'Na tego kandydata są już głosy.'; end if;
  update election_candidates set accepted = ok where id = c;
end $$;
revoke all on function public.election_review(text, boolean) from public, anon;
grant execute on function public.election_review(text, boolean) to authenticated;

-- Rada: etap — 'voting' (aktywne: start albo wznowienie), 'paused' (wstrzymane), 'closed' (koniec),
-- 'nominations' (powrót do zgłoszeń, tylko bez głosów).
create or replace function public.election_status(e text, s text) returns void
language plpgsql security definer set search_path = public as $$
declare el elections;
begin
  if not can_run_elections() then raise exception 'Wybory prowadzi rada zboru.'; end if;
  select * into el from elections where id = e;
  if el.id is null then raise exception 'Nie ma takich wyborów.'; end if;
  if s = 'voting' then
    if el.status = 'closed' then raise exception 'Wybory są już zakończone.'; end if;
    if (select count(*) from election_candidates where election_id = e and accepted) < 1 then raise exception 'Najpierw zatwierdź kandydatów (co najmniej jednego).'; end if;
    update elections set status = 'voting', opened = coalesce(opened, now()) where id = e;
    if el.opened is null then -- powiadomienie tylko przy pierwszym otwarciu (nie po każdym wznowieniu)
      perform inbox_add(array(select id from people where status = 'active'), 'Głosowanie: ' || el.title, 'Głosowanie jest otwarte — oddaj głos w aplikacji (tajne).', './glosowania');
    end if;
  elsif s = 'paused' then
    if el.status <> 'voting' then raise exception 'Wstrzymać można trwające głosowanie.'; end if;
    update elections set status = 'paused' where id = e;
  elsif s = 'closed' then
    if el.status not in ('voting', 'paused') then raise exception 'Zakończyć można trwające głosowanie.'; end if;
    update elections set status = 'closed', closed = now() where id = e;
    if el.results_public then
      perform inbox_add(array(select id from people where status = 'active'), 'Wyniki: ' || el.title, 'Głosowanie zakończone — wyniki w aplikacji.', './glosowania');
    end if;
  elsif s = 'nominations' then
    if exists (select 1 from election_voters where election_id = e) then raise exception 'Są już oddane głosy — nie można wrócić do zgłoszeń.'; end if;
    update elections set status = 'nominations', opened = null where id = e;
  else raise exception 'Nieznany etap.';
  end if;
end $$;
revoke all on function public.election_status(text, text) from public, anon;
grant execute on function public.election_status(text, text) to authenticated;

-- Rada: usunięcie wyborów (razem z głosami).
create or replace function public.election_remove(e text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_run_elections() then raise exception 'Wybory prowadzi rada zboru.'; end if;
  delete from elections where id = e;
end $$;
revoke all on function public.election_remove(text) from public, anon;
grant execute on function public.election_remove(text) to authenticated;

-- Głos: raz na osobę, od 1 do max_choices różnych zatwierdzonych kandydatów. Tajny — osobno „kto”, osobno „na kogo”.
create or replace function public.election_vote(e text, choices text[]) returns void
language plpgsql security definer set search_path = public as $$
declare el elections; n int := coalesce(array_length(choices, 1), 0); c text;
begin
  if not is_active() then raise exception 'Głosują zatwierdzeni członkowie.'; end if;
  select * into el from elections where id = e;
  if el.id is null or el.status <> 'voting' then raise exception 'Głosowanie nie jest otwarte.'; end if;
  if n < 1 then raise exception 'Wybierz co najmniej jedną odpowiedź.'; end if;
  if n > el.max_choices then raise exception 'Można wybrać najwyżej %.', el.max_choices; end if;
  if (select count(distinct x) from unnest(choices) x) <> n then raise exception 'Każdą odpowiedź można wybrać tylko raz.'; end if;
  if exists (select 1 from unnest(choices) x where not exists (select 1 from election_candidates c where c.id = x and c.election_id = e and c.accepted)) then
    raise exception 'Nieprawidłowy wybór.';
  end if;
  insert into election_voters (election_id, person) values (e, auth.uid()); -- drugi raz — błąd klucza
  foreach c in array choices loop insert into election_votes (election_id, candidate_id) values (e, c); end loop;
exception when unique_violation then raise exception 'Twój głos w tym głosowaniu jest już oddany.';
end $$;
revoke all on function public.election_vote(text, text[]) from public, anon;
grant execute on function public.election_vote(text, text[]) to authenticated;
