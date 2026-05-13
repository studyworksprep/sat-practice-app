-- Drop profiles.parent_email + its index.
--
-- Background. Migration 20240101000044 added parent_email when we
-- thought the LessonWorks /provision payload's `email` field was
-- always the parent billing address. PR #46 on the LessonWorks
-- side flipped the integration to send the student's own email
-- instead (with name+manual fallback for the no-student-email
-- case), so the column has no readers and no writers anywhere in
-- the codebase. Migration 20240101000045 had backfilled the column
-- with two rows (Allegra Herrera + the smoke-test Emma); those
-- placeholders are now gone or never read, and the parent-email
-- values they held are not data we need to preserve.
--
-- Net effect of (044 + 045 + this drop) in the migration history:
-- "we tried a parent-email column, decided it was the wrong shape,
-- dropped it before anything came to depend on it."

drop index if exists public.idx_profiles_parent_email_lower;

alter table public.profiles
  drop column if exists parent_email;
