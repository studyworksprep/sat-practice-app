-- Stage D-5 of the legacy-tree decommission: archive the three
-- fully-orphaned legacy tables to a _legacy schema, and drop the
-- continuous-sync triggers + dead-code RPCs that targeted them.
--
-- After D-1 through D-4 the following tables have zero application
-- readers and zero application writers:
--   * lesson_assignments              (0 rows)
--   * lesson_assignment_students      (0 rows)
--   * question_status                 (4,279 rows; last update 2026-05-09,
--                                      no writer since the cutover)
--
-- They move to _legacy.* so they remain available for emergency
-- restore but disappear from the PostgREST default surface.
--
-- A fourth table, question_assignments, is intentionally NOT archived
-- here: its child junction question_assignment_students still has a
-- single reader (lib/lessonworksSync.js), so the parent stays in
-- public to keep the FK relationship intact. Both tables will be
-- archived together once the Lessonworks integration is rewritten.
--
-- Dead code being dropped along the way (none of these still have a
-- live caller post-D-1):
--   * trigger trg_lesson_assignment_v2_sync (on lesson_assignments)
--     + function sync_lesson_assignment_to_v2 — the v1→v2 mirror.
--   * trigger trg_las_v2_sync (on lesson_assignment_students)
--     + function sync_las_to_v2 — the v1→v2 mirror for the junction.
--   * function on_attempt_insert_update_question_status — orphan,
--     never bound to a trigger.
--   * function sync_question_status_on_attempt_insert — same, orphan.
--   * function upsert_question_status_after_attempt — RPC formerly
--     called by lib/practice/session-actions.ts; the call was removed
--     in Stage D-1.

-- 1. Drop the obsolete sync triggers + functions for the lesson side.
drop trigger if exists trg_lesson_assignment_v2_sync on public.lesson_assignments;
drop trigger if exists trg_las_v2_sync on public.lesson_assignment_students;
drop function if exists public.sync_lesson_assignment_to_v2();
drop function if exists public.sync_las_to_v2();

-- 2. Drop the orphan question_status helper functions. They were
--    never bound to triggers in production and the only caller of
--    the upsert RPC was removed in D-1.
drop function if exists public.on_attempt_insert_update_question_status();
drop function if exists public.sync_question_status_on_attempt_insert();
drop function if exists public.upsert_question_status_after_attempt(uuid, uuid, boolean);

-- 3. Create the archive schema. Comment is verbose because this is
--    the kind of object that confuses future readers if it just
--    appears unannotated.
create schema if not exists _legacy;
comment on schema _legacy is
  'Archived tables retired from public during the Phase 6 legacy-tree '
  'decommission (Stage D-5, 2026-06-20). Kept for one cycle for '
  'emergency rollback; can be dropped once the rebuild is fully '
  'bedded in. Not exposed via the PostgREST API.';

-- 4. Move the tables. Triggers, indexes, RLS policies, and FK
--    constraints all follow the table. The FK from
--    lesson_assignment_students.assignment_id → lesson_assignments.id
--    stays valid because both tables land in the same _legacy schema.
alter table public.lesson_assignment_students set schema _legacy;
alter table public.lesson_assignments         set schema _legacy;
alter table public.question_status            set schema _legacy;

-- 5. Refresh PostgREST so the moved tables disappear from its
--    default-schema introspection.
notify pgrst, 'reload schema';
