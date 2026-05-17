-- Replace profiles.role (text) with profiles.roles (text[]).

alter table public.profiles
  add column if not exists roles text[];

update public.profiles
set roles = array[role]::text[]
where roles is null and role is not null;

update public.profiles
set roles = array['user']::text[]
where roles is null;

alter table public.profiles drop column if exists role;

alter table public.profiles
  alter column roles set default array['user']::text[];

alter table public.profiles
  alter column roles set not null;

notify pgrst, 'reload schema';
