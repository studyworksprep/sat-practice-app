-- Retire the v1 question_assignments cluster.
--
-- Inventory:
--   question_assignments              101 rows, last write 2026-05-02 (50 days)
--   question_assignment_students      101 rows, last write 2026-05-02
--   trg_question_assignment_v2_sync   mirrored INS/UPD/DEL → assignments_v2
--   trg_qas_v2_sync                   mirrored INS/UPD/DEL → assignment_students_v2
--   sync_question_assignment_to_v2()  trigger fn
--   sync_qas_to_v2()                  trigger fn
--   is_student_assigned(uuid,uuid)    only used by v1 RLS
--   is_assignment_teacher(uuid,uuid)  only used by v1 RLS
--
-- Verified state:
--   * Zero app-code readers/writers of question_assignments after the
--     prior commit on this branch repointed the one remaining reader
--     (lessonworksSync.js) to assignment_students_v2 + assignments_v2.
--   * 101 / 101 v1 (assignment_id, student_id) pairs have v2 mirrors;
--     v2 also holds 96 native pairs the sync trigger never produced.
--     No data loss.
--   * Neither sync function or is_* helper is called by any other
--     function, view, or policy.
--
-- Order of ops:
--   1. Drop RLS policies that depend on the helper functions (Postgres
--      tracks the dependency; dropping the function first would
--      cascade-drop the policies, but explicit is clearer to audit).
--   2. Drop the two helper functions.
--   3. Drop the two triggers, then the two trigger functions.
--   4. SET SCHEMA both tables to _legacy (child first; FKs span
--      cross-schema without issue, so order is cosmetic).
--   5. NOTIFY pgrst.
--
-- Remaining policies on the two tables (Teachers manage own
-- assignments, demo_readonly_*) are self-contained and travel with
-- the tables under SET SCHEMA. They become inert once _legacy is off
-- the PostgREST surface.

-- 1. Drop the policies that reference the two helper functions.
drop policy if exists "Students view assigned assignments" on public.question_assignments;
drop policy if exists "View assignment students"          on public.question_assignment_students;
drop policy if exists "Teachers manage assignment students" on public.question_assignment_students;

-- 2. Drop the two helper functions (now safe to drop — no dependent
--    objects after step 1).
drop function if exists public.is_student_assigned(uuid, uuid);
drop function if exists public.is_assignment_teacher(uuid, uuid);

-- 3. Drop the two sync triggers, then the trigger functions.
drop trigger if exists trg_question_assignment_v2_sync on public.question_assignments;
drop trigger if exists trg_qas_v2_sync                 on public.question_assignment_students;
drop function if exists public.sync_question_assignment_to_v2();
drop function if exists public.sync_qas_to_v2();

-- 4. Archive both tables. Cross-schema FK
--    (_legacy.question_assignment_students.assignment_id →
--     _legacy.question_assignments(id)) survives the move.
alter table public.question_assignment_students set schema _legacy;
alter table public.question_assignments         set schema _legacy;

-- 5. Drop the PostgREST schema cache so the tables stop being exposed.
notify pgrst, 'reload schema';
