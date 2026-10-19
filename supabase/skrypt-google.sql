-- Uprawnienia klucza serwera (secret / service_role) dla skryptu Google (skrypty/baza.gs, przypomnienie.gs):
-- tylko to, czego skrypt używa — odczyt do newslettera, przypomnień i udostępniania folderu, kolejka próbnych
-- e-maili, usuwanie nieaktualnych telefonów i zapis listy zdjęć z nabożeństw. Uprawnień użytkowników nie zmienia.
-- Można wielokrotnie.
do $$ begin if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;

grant usage on schema public to service_role;
grant select on public.services, public.events, public.announcements, public.templates, public.people, public.ranks to service_role;
grant select, delete on public.push_devices to service_role;
grant select, update on public.mail_requests to service_role;
grant select, insert, update on public.site_settings to service_role;
