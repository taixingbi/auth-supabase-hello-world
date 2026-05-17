-- Optional: extend profiles for JWT claims (matches Supabase table editor).
-- Your table already has team + user_group; plan is stored in auth.user_metadata.

alter table public.profiles
  add column if not exists team text default 'ai-platform';

alter table public.profiles
  add column if not exists user_group text default 'engineering';

-- Optional: add plan on profiles instead of user_metadata
-- alter table public.profiles add column if not exists plan text default 'free';

notify pgrst, 'reload schema';
