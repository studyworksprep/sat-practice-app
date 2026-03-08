-- =========================================================
-- Extended signup fields on profiles + teacher registration codes
-- =========================================================

-- 1) Add new columns to profiles
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists user_type text check (user_type in ('student','teacher','exploring')),
  add column if not exists high_school text,
  add column if not exists graduation_year int,
  add column if not exists target_sat_score int,
  add column if not exists tutor_name text;

-- 2) Teacher registration codes (one-time use)
create table if not exists public.teacher_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table public.teacher_codes enable row level security;

-- Only admins can manage teacher codes
create policy teacher_codes_admin_all on public.teacher_codes
  for all using (public.is_admin());

-- 3) Update handle_new_user to pull metadata from auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_meta jsonb;
  v_user_type text;
  v_role text;
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_user_type := v_meta->>'user_type';

  -- Map user_type to role
  case v_user_type
    when 'student' then v_role := 'student';
    when 'teacher' then v_role := 'teacher';
    else v_role := 'practice';
  end case;

  insert into public.profiles (
    id, email, role, first_name, last_name, user_type,
    high_school, graduation_year, target_sat_score, tutor_name
  )
  values (
    new.id,
    new.email,
    v_role,
    v_meta->>'first_name',
    v_meta->>'last_name',
    v_user_type,
    v_meta->>'high_school',
    (v_meta->>'graduation_year')::int,
    (v_meta->>'target_sat_score')::int,
    v_meta->>'tutor_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    role = coalesce(excluded.role, profiles.role),
    first_name = coalesce(excluded.first_name, profiles.first_name),
    last_name = coalesce(excluded.last_name, profiles.last_name),
    user_type = coalesce(excluded.user_type, profiles.user_type),
    high_school = coalesce(excluded.high_school, profiles.high_school),
    graduation_year = coalesce(excluded.graduation_year, profiles.graduation_year),
    target_sat_score = coalesce(excluded.target_sat_score, profiles.target_sat_score),
    tutor_name = coalesce(excluded.tutor_name, profiles.tutor_name);

  return new;
end;
$$;
