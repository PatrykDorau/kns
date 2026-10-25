-- Ankiety i ewaluacje (zakładka „Ankiety” w „Ogłoszeniach”): pastor, rada zboru albo administrator tworzy ankietę dla wybranej
-- grupy (wszyscy członkowie albo rangi, służby i konkretne osoby), z pytaniami: tekst, jeden wybór, wiele wyborów, skala 1–5. Wybrani dostają
-- powiadomienie i wypełniają (do zamknięcia ankiety — odpowiedź można poprawić). Tworzący i prowadzący widzą zestawienie;
-- ankieta anonimowa — bez imion przy odpowiedziach (widać tylko, ile osób odpowiedziało).
-- Tylko przez funkcje (security definer). Uruchamiać po schema.sql, zatwierdzanie.sql, skrzynka.sql, sluzby.sql, wiadomosci.sql (można ponownie).
create table if not exists public.surveys (
  id text primary key,
  title text not null check (length(title) between 1 and 160),
  description text not null default '' check (length(description) <= 4000),
  questions jsonb not null default '[]'::jsonb,   -- [{ id, type: text|one|many|scale, label, options: [text], required }]
  everyone boolean not null default false,        -- wszyscy zatwierdzeni członkowie
  ranks text[] not null default '{}',
  ministries text[] not null default '{}',
  anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'closed')),
  closes date,                                    -- do kiedy (informacyjnie; po tej dacie ankieta zamyka się sama)
  created_by uuid default auth.uid() references public.people (id) on delete set null,
  created timestamptz not null default now()
);
create table if not exists public.survey_responses (
  survey_id text not null references public.surveys (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,     -- { id pytania: tekst | indeks | [indeksy] | 1–5 }
  at timestamptz not null default now(),
  primary key (survey_id, person)
);
-- konkretne osoby (obok rang i służb)
alter table public.surveys add column if not exists people uuid[] not null default '{}';
alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
revoke all on public.surveys, public.survey_responses from anon, authenticated;

-- kto jest adresatem ankiety
create or replace function public.survey_targets(sid text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select p.id from people p, surveys s where s.id = sid and p.status = 'active' and (s.everyone or p.roles && s.ranks)
    union select mm.person from ministry_members mm, surveys s where s.id = sid and mm.status = 'active' and mm.ministry_id = any (s.ministries)
    union select unnest(m.leader_ids) from ministries m, surveys s where s.id = sid and m.id = any (s.ministries)
    union select p.id from people p, surveys s where s.id = sid and p.status = 'active' and p.id = any (s.people)), '{}')
$$;
-- prowadzi ankietę: tworzący, pastor, rada zboru, administrator
create or replace function public.survey_can_manage(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_broadcast_all() or exists (select 1 from surveys s where s.id = sid and s.created_by = auth.uid())
$$;
revoke all on function public.survey_targets(text), public.survey_can_manage(text) from public, anon, authenticated;

-- lista: ankiety, w których biorę udział, i (dla prowadzących) wszystkie z ostatnich 180 dni
create or replace function public.survey_board() returns jsonb
language plpgsql security definer set search_path = public as $$
declare boss boolean := can_broadcast_all();
begin
  if not is_active() then raise exception 'Ankiety są dla zatwierdzonych członków.'; end if;
  update surveys set status = 'closed' where status = 'open' and closes is not null and closes < current_date;
  return jsonb_build_object('canCreate', boss, 'list', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'description', s.description, 'questions', s.questions, 'anonymous', s.anonymous,
      'status', s.status, 'closes', s.closes, 'created', s.created, 'everyone', s.everyone, 'ranks', s.ranks, 'ministries', s.ministries,
      'people', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', coalesce(nullif(x.name, ''), split_part(x.email, '@', 1))) order by x.name)
                          from people x where x.id = any (s.people)), '[]'::jsonb),
      'author', coalesce(nullif(a.name, ''), split_part(a.email, '@', 1)),
      'forMe', auth.uid() = any (survey_targets(s.id)), 'canManage', survey_can_manage(s.id),
      'answered', r.person is not null, 'myAnswers', r.answers,
      'count', (select count(*) from survey_responses x where x.survey_id = s.id),
      'targets', cardinality(survey_targets(s.id))
    ) order by s.status, s.created desc)
    from surveys s left join people a on a.id = s.created_by
      left join survey_responses r on r.survey_id = s.id and r.person = auth.uid()
    where (auth.uid() = any (survey_targets(s.id)) and (s.status = 'open' or s.created > now() - interval '60 days'))
       or (survey_can_manage(s.id) and s.created > now() - interval '180 days')), '[]'::jsonb));
end $$;

-- nowa albo zmieniona ankieta; nowa — powiadomienie do adresatów. Pytania można zmieniać, dopóki nikt nie odpowiedział.
create or replace function public.survey_save(s jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare sid text := s ->> 'id'; old surveys; q jsonb := coalesce(s -> 'questions', '[]'::jsonb); fresh boolean;
begin
  if not is_active() then raise exception 'Brak dostępu.'; end if;
  select * into old from surveys where id = sid;
  fresh := old.id is null;
  if fresh and not can_broadcast_all() then raise exception 'Ankietę może utworzyć pastor, rada zboru albo administrator.'; end if;
  if not fresh and not survey_can_manage(sid) then raise exception 'Tę ankietę zmienia osoba, która ją utworzyła, albo rada zboru.'; end if;
  if trim(coalesce(s ->> 'title', '')) = '' then raise exception 'Wpisz tytuł ankiety.'; end if;
  if jsonb_typeof(q) <> 'array' or jsonb_array_length(q) = 0 then raise exception 'Dodaj co najmniej jedno pytanie.'; end if;
  if jsonb_array_length(q) > 40 then raise exception 'Najwyżej 40 pytań.'; end if;
  if not coalesce((s ->> 'everyone')::boolean, false) and coalesce(jsonb_array_length(s -> 'ranks'), 0) + coalesce(jsonb_array_length(s -> 'ministries'), 0) + coalesce(jsonb_array_length(s -> 'people'), 0) = 0 then
    raise exception 'Wybierz, kto ma wypełnić ankietę.';
  end if;
  if not fresh and old.questions is distinct from q and exists (select 1 from survey_responses where survey_id = sid) then
    raise exception 'Ktoś już odpowiedział — pytań nie można już zmienić (tytuł, opis i termin — tak).';
  end if;
  insert into surveys (id, title, description, questions, everyone, ranks, ministries, people, anonymous, closes)
  values (sid, trim(s ->> 'title'), coalesce(s ->> 'description', ''), q, coalesce((s ->> 'everyone')::boolean, false),
    array(select jsonb_array_elements_text(coalesce(s -> 'ranks', '[]'::jsonb))), array(select jsonb_array_elements_text(coalesce(s -> 'ministries', '[]'::jsonb))),
    array(select x::uuid from jsonb_array_elements_text(coalesce(s -> 'people', '[]'::jsonb)) x),
    coalesce((s ->> 'anonymous')::boolean, false), nullif(s ->> 'closes', '')::date)
  on conflict (id) do update set title = excluded.title, description = excluded.description, questions = excluded.questions,
    everyone = excluded.everyone, ranks = excluded.ranks, ministries = excluded.ministries, people = excluded.people, closes = excluded.closes,
    -- anonimowość nie zmienia się po pierwszej odpowiedzi
    anonymous = case when exists (select 1 from survey_responses where survey_id = sid) then surveys.anonymous else excluded.anonymous end;
  if fresh then
    perform inbox_add(array(select x from unnest(survey_targets(sid)) x where x <> auth.uid()), 'Ankieta: ' || trim(s ->> 'title'),
      'Prosimy o wypełnienie' || coalesce(' do ' || to_char(nullif(s ->> 'closes', '')::date, 'DD.MM'), '') || '.', './ankiety/' || sid);
  end if;
  return sid;
end $$;

-- odpowiedź (można poprawić, dopóki ankieta jest otwarta)
create or replace function public.survey_answer(sid text, answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s surveys;
begin
  select * into s from surveys where id = sid;
  if s.id is null then raise exception 'Nie ma takiej ankiety.'; end if;
  if not (auth.uid() = any (survey_targets(sid))) then raise exception 'Ta ankieta jest dla innej grupy.'; end if;
  if s.status <> 'open' or (s.closes is not null and s.closes < current_date) then raise exception 'Ankieta jest już zamknięta.'; end if;
  if jsonb_typeof(answers) <> 'object' then raise exception 'Nieprawidłowe odpowiedzi.'; end if;
  if exists (select 1 from jsonb_array_elements(s.questions) qq where coalesce((qq ->> 'required')::boolean, false)
             and coalesce(answers -> (qq ->> 'id'), 'null'::jsonb) in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)) then
    raise exception 'Odpowiedz na wszystkie wymagane pytania.';
  end if;
  insert into survey_responses (survey_id, person, answers) values (sid, auth.uid(), answers)
  on conflict (survey_id, person) do update set answers = excluded.answers, at = now();
end $$;

-- wyniki dla prowadzących: odpowiedzi (z imionami, chyba że anonimowa) i kto jeszcze nie odpowiedział
create or replace function public.survey_results(sid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s surveys;
begin
  select * into s from surveys where id = sid;
  if s.id is null or not survey_can_manage(sid) then raise exception 'Wyniki widzi osoba, która utworzyła ankietę, i rada zboru.'; end if;
  return jsonb_build_object(
    'responses', coalesce((select jsonb_agg(jsonb_build_object('answers', r.answers,
        'name', case when s.anonymous then null else coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) end)
        order by case when s.anonymous then random() end, r.at)
      from survey_responses r join people p on p.id = r.person where r.survey_id = sid), '[]'::jsonb),
    'missing', coalesce((select jsonb_agg(coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) order by 1)
      from people p where p.id = any (survey_targets(sid))
        and not exists (select 1 from survey_responses r where r.survey_id = sid and r.person = p.id)), '[]'::jsonb));
end $$;

create or replace function public.survey_status(sid text, st text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not survey_can_manage(sid) then raise exception 'Brak uprawnień.'; end if;
  if st not in ('open', 'closed') then raise exception 'Nieprawidłowy stan.'; end if;
  update surveys set status = st, closes = case when st = 'open' and closes < current_date then null else closes end where id = sid;
end $$;

create or replace function public.survey_remove(sid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not survey_can_manage(sid) then raise exception 'Brak uprawnień.'; end if;
  delete from surveys where id = sid;
end $$;

revoke all on function public.survey_board(), public.survey_save(jsonb), public.survey_answer(text, jsonb), public.survey_results(text),
  public.survey_status(text, text), public.survey_remove(text) from public, anon;
grant execute on function public.survey_board(), public.survey_save(jsonb), public.survey_answer(text, jsonb), public.survey_results(text),
  public.survey_status(text, text), public.survey_remove(text) to authenticated;
