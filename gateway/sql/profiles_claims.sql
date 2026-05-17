-- profiles schema (matches Supabase table editor):
-- id, email, username, display_name, roles (text[]), plan, team, user_group,
-- created_at, updated_at

alter table public.profiles
  add column if not exists roles text[] not null default array['user']::text[];

alter table public.profiles
  add column if not exists plan text default 'free';

alter table public.profiles
  add column if not exists team text default 'ai-platform';

alter table public.profiles
  add column if not exists user_group text default 'engineering';

alter table public.profiles
  add column if not exists updated_at timestamptz default now();

notify pgrst, 'reload schema';
