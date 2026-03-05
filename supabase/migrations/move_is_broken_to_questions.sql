-- Move is_broken from per-user question_status to global questions table.
-- This makes the broken flag shared across all users.

-- 1) Add the column to questions
alter table questions
  add column if not exists is_broken boolean not null default false;

-- 2) Migrate existing flags: if ANY user flagged a question as broken, mark it globally
update questions q
set is_broken = true
where exists (
  select 1 from question_status qs
  where qs.question_id = q.id
    and qs.is_broken = true
);

-- 3) (Optional) Drop the per-user column once migration is verified.
-- Uncomment when ready:
-- alter table question_status drop column if exists is_broken;
