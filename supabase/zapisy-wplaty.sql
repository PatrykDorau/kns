-- Zapisy z wpłatami (wzór: Avenit, bez płatności online): w ustawieniach zapisów wydarzenia cena za osobę dorosłą
-- i dziecko (data.signup.price, data.signup.priceChild) oraz dane do przelewu (data.signup.account). Każdy widzi swoją
-- kwotę; zarządzający zapisami zaznacza wpłaty (przelew / gotówka) i widzi, ile zebrano. Uruchamiać po zapisy.sql.
alter table public.event_signups add column if not exists paid numeric(10, 2) not null default 0;
alter table public.event_signups add column if not exists paid_at timestamptz;

create or replace function public.signup_price(conf jsonb, a int, c int) returns numeric
language sql immutable as $$
  select round(coalesce(nullif(conf ->> 'price', '')::numeric, 0) * a + coalesce(nullif(conf ->> 'priceChild', '')::numeric, nullif(conf ->> 'price', '')::numeric, 0) * c, 2)
$$;

create or replace function public.signup_board(eid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare conf jsonb := signup_conf(eid); mine record;
begin
  if not is_active() then raise exception 'Zapisy są dla zatwierdzonych członków.'; end if;
  if conf is null or not coalesce((conf ->> 'enabled')::boolean, false) then return null; end if;
  select * into mine from event_signups where event_id = eid and person = auth.uid();
  return jsonb_build_object(
    'max', signup_limit(conf), 'kids', coalesce((conf ->> 'kids')::boolean, false), 'approval', coalesce((conf ->> 'approval')::boolean, false),
    'until', coalesce(nullif(conf ->> 'until', ''), conf ->> 'date'),
    'open', coalesce(nullif(conf ->> 'until', ''), conf ->> 'date') is null or coalesce(nullif(conf ->> 'until', ''), conf ->> 'date')::date >= (now() at time zone 'Europe/Warsaw')::date,
    'taken', signup_taken(eid),
    'reserve', (select coalesce(sum(adults + children), 0)::int from event_signups where event_id = eid and status = 'reserve'),
    'pending', (select coalesce(sum(adults + children), 0)::int from event_signups where event_id = eid and status = 'pending'),
    'price', nullif(conf ->> 'price', '')::numeric, 'priceChild', nullif(conf ->> 'priceChild', '')::numeric, 'account', coalesce(conf ->> 'account', ''),
    'mine', case when mine.person is null then null else jsonb_build_object('status', mine.status, 'adults', mine.adults, 'children', mine.children, 'note', mine.note,
              'due', signup_price(conf, mine.adults, mine.children), 'paid', mine.paid) end,
    'manage', signup_manager(eid),
    'money', case when signup_manager(eid) then (select jsonb_build_object('due', coalesce(sum(signup_price(conf, adults, children)), 0), 'paid', coalesce(sum(paid), 0))
               from event_signups where event_id = eid and status = 'confirmed') end,
    'list', case when signup_manager(eid) then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)),
                   'grupa', p.grupa, 'adults', s.adults, 'children', s.children, 'note', s.note, 'status', s.status, 'created', s.created,
                   'due', signup_price(conf, s.adults, s.children), 'paid', s.paid) order by s.created)
                 from event_signups s join people p on p.id = s.person where s.event_id = eid), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- zarządzający: wpłata osoby (kwota; 0 — cofnięcie). Pełna wpłata — dzwonek u tej osoby.
create or replace function public.signup_paid(eid text, who uuid, amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare conf jsonb := signup_conf(eid); s record;
begin
  if not signup_manager(eid) then raise exception 'Wpłaty zaznacza twórca wydarzenia albo osoba z prawem edycji.'; end if;
  if amount is null or amount < 0 or amount > 100000 then raise exception 'Nieprawidłowa kwota.'; end if;
  select * into s from event_signups where event_id = eid and person = who;
  if s.person is null then raise exception 'Tej osoby nie ma na liście.'; end if;
  update event_signups set paid = round(amount, 2), paid_at = case when amount > 0 then now() end where event_id = eid and person = who;
  if amount > 0 and amount >= signup_price(conf, s.adults, s.children) and s.paid < amount then
    perform inbox_add(array[who], 'Wpłata przyjęta: ' || (conf ->> 'title'), 'Dziękujemy — ' || to_char(amount, 'FM999990.00') || ' zł.', './?wydarzenie=' || eid);
  end if;
end $$;

revoke all on function public.signup_price(jsonb, int, int) from public, anon, authenticated;
revoke all on function public.signup_board(text), public.signup_paid(text, uuid, numeric) from public, anon;
grant execute on function public.signup_board(text), public.signup_paid(text, uuid, numeric) to authenticated;
