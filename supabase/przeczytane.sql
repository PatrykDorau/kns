-- Przeczytane ogłoszenia: które ogłoszenia dana osoba już otworzyła (na dowolnym urządzeniu).
-- Każdy widzi i dopisuje tylko swoje; po usunięciu ogłoszenia wpisy znikają same.
create table if not exists public.seen_announcements (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ann_id text not null references public.announcements(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, ann_id)
);
alter table public.seen_announcements enable row level security;
drop policy if exists seen_own_read on public.seen_announcements;
create policy seen_own_read on public.seen_announcements for select to authenticated using (user_id = auth.uid());
drop policy if exists seen_own_add on public.seen_announcements;
create policy seen_own_add on public.seen_announcements for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.seen_announcements to authenticated;
-- Oznacz jako przeczytane (tylko ogłoszenia, które ta osoba widzi; powtórki pomijane).
create or replace function public.mark_seen(ids text[]) returns void
language sql security invoker set search_path = public as $$
  insert into seen_announcements (user_id, ann_id)
  select auth.uid(), a.id from announcements a where a.id = any(ids) and auth.uid() is not null
  on conflict do nothing
$$;
revoke all on function public.mark_seen(text[]) from public;
grant execute on function public.mark_seen(text[]) to authenticated;
