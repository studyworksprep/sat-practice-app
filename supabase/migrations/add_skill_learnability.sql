-- Skill learnability ratings (admin-assigned, 1-10).
-- Used to compute the Opportunity Index on practice test score reports.
create table if not exists skill_learnability (
  skill_code text primary key,
  learnability integer not null default 5 check (learnability between 1 and 10),
  updated_at timestamptz not null default now()
);

-- Allow all authenticated users to read; only admins/managers write (enforced in API).
alter table skill_learnability enable row level security;

create policy "Anyone can read skill_learnability"
  on skill_learnability for select
  using (true);

create policy "Admins can manage skill_learnability"
  on skill_learnability for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'manager')
    )
  );
