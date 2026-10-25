-- Lider służby od razu w niej służy (backlog #41): osoba dodana do ministries.leader_ids staje się aktywnym
-- członkiem tej służby — może podać dyspozycyjność, widzi ją w „Mojej służbie”, jest na grafiku.
-- (Usunięcie z liderów nie wypisuje ze służby — to osobna decyzja.)
create or replace function public.ministry_leaders_join() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into ministry_members (ministry_id, person, status)
  select new.id, x, 'active' from unnest(coalesce(new.leader_ids, '{}')) x
  where exists (select 1 from people p where p.id = x)
  on conflict (ministry_id, person) do update set status = 'active';
  return null;
end $$;

drop trigger if exists ministries_leaders_join on public.ministries;
create trigger ministries_leaders_join after insert or update of leader_ids on public.ministries
  for each row execute function public.ministry_leaders_join();

-- obecni liderzy — bez powiadomień „Dodano Cię do służby”
alter table public.ministry_members disable trigger ministry_members_inbox;
insert into public.ministry_members (ministry_id, person, status)
select m.id, x, 'active' from public.ministries m, unnest(coalesce(m.leader_ids, '{}')) x
where exists (select 1 from public.people p where p.id = x)
on conflict (ministry_id, person) do update set status = 'active';
alter table public.ministry_members enable trigger ministry_members_inbox;
