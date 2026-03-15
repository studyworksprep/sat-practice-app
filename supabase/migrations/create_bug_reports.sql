-- Bug reports table for tracking issues and underperforming elements
-- Run this in the Supabase SQL editor or via the Supabase CLI.

create table if not exists bug_reports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Bug Report',
  description text not null,
  image_url   text,
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_by  text,
  created_at  timestamptz not null default now()
);

-- Index for listing by date
create index if not exists idx_bug_reports_created_at
  on bug_reports (created_at desc);

-- RLS: only admins can read/write
alter table bug_reports enable row level security;

create policy "Admins can do everything on bug_reports"
  on bug_reports for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
