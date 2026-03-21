-- Allow teachers to mark assignments as complete
alter table public.question_assignments
  add column if not exists completed_at timestamptz;
