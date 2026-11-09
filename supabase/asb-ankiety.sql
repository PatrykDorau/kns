-- ASB: ankiety z kodem QR („Skąd się dowiedziałeś?” + własne pytania: otwarte, jednokrotnego i wielokrotnego wyboru).
-- Organizator (is_asb()) tworzy ankietę, opcjonalnie podpiętą pod wydarzenie w statystykach; goście wypełniają ją bez
-- logowania na stronie /ankieta?t=<token> (tylko przez dwie funkcje poniżej — tabele są zamknięte). Odpowiedzi na pytanie
-- o źródło podpowiadają liczby w statystykach wydarzenia. Uruchamiaj po asb.sql i asb-statystyki.sql. Można ponownie.

create table if not exists public.asb_surveys (
  id text primary key,
  token text not null unique default left(md5(random()::text || clock_timestamp()::text), 12),
  city text not null default 'Poznań',
  event_id text references public.asb_stat_events (id) on delete set null,
  title text not null default '',
  intro text not null default '',
  questions jsonb not null default '[]',   -- [{ id, text, type: 'source' | 'open' | 'one' | 'many', options: [..] }]
  open boolean not null default true,
  created timestamptz not null default now(),
  created_by text not null default ''
);
create table if not exists public.asb_survey_answers (
  id bigint generated always as identity primary key,
  survey text not null references public.asb_surveys (id) on delete cascade,
  answers jsonb not null default '{}',     -- { <id pytania>: 'tekst' | 'opcja' | ['opcja', …] }
  created timestamptz not null default now()
);
create index if not exists asb_survey_answers_survey on public.asb_survey_answers (survey);

alter table public.asb_surveys enable row level security;
alter table public.asb_survey_answers enable row level security;
revoke all on public.asb_surveys, public.asb_survey_answers from public, anon, authenticated;
grant select, insert, update, delete on public.asb_surveys to authenticated;
grant select, delete on public.asb_survey_answers to authenticated;
drop policy if exists asb_surveys_all on public.asb_surveys;
drop policy if exists asb_survey_answers_read on public.asb_survey_answers;
drop policy if exists asb_survey_answers_delete on public.asb_survey_answers;
create policy asb_surveys_all on public.asb_surveys for all to authenticated using (is_asb()) with check (is_asb());
create policy asb_survey_answers_read on public.asb_survey_answers for select to authenticated using (is_asb());
create policy asb_survey_answers_delete on public.asb_survey_answers for delete to authenticated using (is_asb());

-- ankieta dla wypełniającego (bez logowania): tylko tytuł, wstęp i pytania
create or replace function public.asb_survey_public(t text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('title', s.title, 'intro', s.intro, 'questions', s.questions, 'open', s.open)
  from asb_surveys s where s.token = t
$$;

-- zapis odpowiedzi: tylko do otwartej ankiety, tylko znane pytania, krótkie teksty, z limitem odpowiedzi
create or replace function public.asb_survey_submit(t text, a jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare s asb_surveys; q jsonb; v jsonb; clean jsonb := '{}'::jsonb; opts jsonb;
begin
  select * into s from asb_surveys where token = t;
  if s.id is null then raise exception 'Nie ma takiej ankiety.'; end if;
  if not s.open then raise exception 'Ankieta jest już zamknięta.'; end if;
  if jsonb_typeof(a) is distinct from 'object' or length(a::text) > 8000 then raise exception 'Nieprawidłowe odpowiedzi.'; end if;
  if (select count(*) from asb_survey_answers where survey = s.id) >= 3000 then raise exception 'Ankieta ma już maksymalną liczbę odpowiedzi.'; end if;
  for q in select * from jsonb_array_elements(s.questions) loop
    v := a -> (q->>'id');
    if v is null or v = 'null'::jsonb then continue; end if;
    opts := case when q->>'type' = 'source' then '["src_friends","src_social","src_posters","src_regular","src_other"]'::jsonb else coalesce(q->'options', '[]'::jsonb) end;
    if q->>'type' = 'open' then
      if jsonb_typeof(v) = 'string' and length(trim(v #>> '{}')) > 0 then clean := clean || jsonb_build_object(q->>'id', left(trim(v #>> '{}'), 1000)); end if;
    elsif q->>'type' = 'many' then
      if jsonb_typeof(v) = 'array' then
        clean := clean || jsonb_build_object(q->>'id', coalesce((select jsonb_agg(x) from jsonb_array_elements(v) x where opts @> jsonb_build_array(x)), '[]'::jsonb));
      end if;
    else -- 'one' i 'source'
      if jsonb_typeof(v) = 'string' and opts @> jsonb_build_array(v) then clean := clean || jsonb_build_object(q->>'id', v); end if;
    end if;
  end loop;
  if clean = '{}'::jsonb then raise exception 'Odpowiedz przynajmniej na jedno pytanie.'; end if;
  insert into asb_survey_answers (survey, answers) values (s.id, clean);
  return true;
end $$;
revoke all on function public.asb_survey_public(text), public.asb_survey_submit(text, jsonb) from public;
grant execute on function public.asb_survey_public(text), public.asb_survey_submit(text, jsonb) to anon, authenticated;
