-- Add is_active flag to profiles (defaults to true)
-- Inactive students still have access but are hidden from the teacher panel.

alter table public.profiles
  add column if not exists is_active boolean not null default true;
