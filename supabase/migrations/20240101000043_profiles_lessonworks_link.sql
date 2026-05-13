-- profiles.lessonworks_* — link a Studyworks profile back to its
-- LessonWorks record so the provisioning handler at
-- POST /api/public/students/provision can be idempotent on
-- lessonworks_student_id. Adopting two columns:
--
--   lessonworks_student_id      — the LessonWorks-side UUID for
--                                 this student. UNIQUE so a repeat
--                                 provision call lands on the same
--                                 profile row instead of creating
--                                 a duplicate.
--
--   lessonworks_organization_id — the LessonWorks org the student
--                                 belongs to. Stored for forward
--                                 compatibility (per-org scoping,
--                                 analytics) but not enforced or
--                                 indexed today.
--
-- Both nullable. Existing Studyworks-native students keep null on
-- both columns; only profiles that came through the LessonWorks
-- provision flow (or are explicitly backfilled) carry values.
--
-- Three already-linked students per the manual-type-the-ID flow
-- on the LessonWorks side need their lessonworks_student_id
-- populated separately once we have the LW-side UUIDs — see the
-- followup PR thread for that backfill. Until then they stay NULL,
-- which is safe: LessonWorks already holds the Studyworks UUID
-- locally for those three, so it won't fire provision for them.

alter table public.profiles
  add column if not exists lessonworks_student_id text,
  add column if not exists lessonworks_organization_id text;

-- Partial unique index so two students can both have NULL (the
-- common case for Studyworks-native accounts) but no two profiles
-- can share a non-null lessonworks_student_id.
create unique index if not exists idx_profiles_lessonworks_student_id_unique
  on public.profiles (lessonworks_student_id)
  where lessonworks_student_id is not null;

-- Non-unique index on the org column for future filtering — cheap
-- and lets a "all students from LW org X" query stay fast.
create index if not exists idx_profiles_lessonworks_organization_id
  on public.profiles (lessonworks_organization_id)
  where lessonworks_organization_id is not null;
