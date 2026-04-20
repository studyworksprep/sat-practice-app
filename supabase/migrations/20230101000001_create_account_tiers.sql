-- =========================================================
-- Account Tier System: profiles, classes, enrollments, invites
-- Roles: practice (default), student, teacher, admin
-- =========================================================

-- 0) PROFILES
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text unique,
  role       text not null check (role in ('practice','student','teacher','admin')) default 'practice',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- 1) Helper functions for RLS
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('teacher','admin')
  );
$$;

-- 2) Roster tables

create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);
create index if not exists classes_teacher_id_idx on public.classes(teacher_id);

create table if not exists public.class_enrollments (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (class_id, student_id)
);
create index if not exists class_enrollments_student_id_idx on public.class_enrollments(student_id);

create table if not exists public.class_invites (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  code       text not null unique,
  expires_at timestamptz,
  max_uses   int,
  uses       int not null default 0,
  created_at timestamptz default now()
);
create index if not exists class_invites_class_id_idx on public.class_invites(class_id);

alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.class_invites enable row level security;

-- 3) Teacher can view student helper
create or replace function public.teacher_can_view_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or exists (
           select 1 from public.class_enrollments ce
           join public.classes c on c.id = ce.class_id
           where ce.student_id = target_student_id
             and c.teacher_id = auth.uid()
         );
$$;

-- 4) Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'practice')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5) Profiles policies
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.teacher_can_view_student(id)
    or public.is_admin()
  );

create policy profiles_update_self on public.profiles
  for update
  using  (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- 6) Classes policies
drop policy if exists classes_select on public.classes;
drop policy if exists classes_insert on public.classes;
drop policy if exists classes_update on public.classes;
drop policy if exists classes_delete on public.classes;

create policy classes_select on public.classes
  for select using (teacher_id = auth.uid() or public.is_admin());

create policy classes_insert on public.classes
  for insert with check (public.is_teacher() and teacher_id = auth.uid());

create policy classes_update on public.classes
  for update
  using  (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

create policy classes_delete on public.classes
  for delete using (teacher_id = auth.uid() or public.is_admin());

-- 7) Enrollments policies
drop policy if exists enrollments_select on public.class_enrollments;
drop policy if exists enrollments_insert_teacher on public.class_enrollments;
drop policy if exists enrollments_delete_teacher on public.class_enrollments;

create policy enrollments_select on public.class_enrollments
  for select using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    or student_id = auth.uid()
  );

create policy enrollments_insert_teacher on public.class_enrollments
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy enrollments_delete_teacher on public.class_enrollments
  for delete using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    or student_id = auth.uid()
  );

-- 8) Invites policies
drop policy if exists invites_select on public.class_invites;
drop policy if exists invites_insert on public.class_invites;
drop policy if exists invites_update on public.class_invites;

create policy invites_select on public.class_invites
  for select using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy invites_insert on public.class_invites
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy invites_update on public.class_invites
  for update using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

-- 9) Invite redemption RPC (transaction-safe)
create or replace function public.redeem_class_invite(invite_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.class_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv
  from public.class_invites
  where code = invite_code
  for update;

  if not found then raise exception 'invalid_code'; end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'expired_code';
  end if;

  if v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses then
    raise exception 'code_used_up';
  end if;

  insert into public.class_enrollments (class_id, student_id)
  values (v_inv.class_id, auth.uid())
  on conflict do nothing;

  update public.class_invites set uses = uses + 1 where id = v_inv.id;

  return v_inv.class_id;
end;
$$;

-- =========================================================
-- RLS for existing tables
-- =========================================================

alter table public.attempts enable row level security;
alter table public.question_status enable row level security;

-- Attempts policies
drop policy if exists attempts_select on public.attempts;
drop policy if exists attempts_insert_self on public.attempts;
drop policy if exists attempts_update_self on public.attempts;
drop policy if exists attempts_delete_self on public.attempts;

create policy attempts_select on public.attempts
  for select using (user_id = auth.uid() or public.teacher_can_view_student(user_id));

create policy attempts_insert_self on public.attempts
  for insert with check (user_id = auth.uid() or public.is_admin());

create policy attempts_update_self on public.attempts
  for update
  using  (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy attempts_delete_self on public.attempts
  for delete using (user_id = auth.uid() or public.is_admin());

-- Question_status policies
drop policy if exists qs_select on public.question_status;
drop policy if exists qs_insert_self on public.question_status;
drop policy if exists qs_update_self on public.question_status;
drop policy if exists qs_delete_self on public.question_status;

create policy qs_select on public.question_status
  for select using (user_id = auth.uid() or public.teacher_can_view_student(user_id));

create policy qs_insert_self on public.question_status
  for insert with check (user_id = auth.uid() or public.is_admin());

create policy qs_update_self on public.question_status
  for update
  using  (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy qs_delete_self on public.question_status
  for delete using (user_id = auth.uid() or public.is_admin());
