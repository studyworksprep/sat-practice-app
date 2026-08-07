-- Per-student on/off switch for dynamic detours (§3.2) — the
-- "Tough stretch. Want to step back?" offer the practice runner
-- makes after two consecutive misses (lib/practice/session-actions.ts
-- + lib/practice/PracticeInteractive.js).
--
-- Tri-state on purpose:
--   true  → the runner probes and offers detours as it does today
--   false → no probe, no offer; the question set is walked exactly
--           as it was built, start to finish
--   null  → never set explicitly. The app derives the default:
--           OFF for a student with an assigned tutor (a crafted
--           tutor assignment should run as the tutor built it),
--           ON for a self-guided student.
--
-- Deriving beats backfilling here: a student who links a tutor
-- next month, or signs up tomorrow, lands on the right default
-- with no follow-up data migration. The moment a tutor or the
-- student flips the toggle we store an explicit boolean and the
-- derived default stops applying.
--
-- Resolution lives in lib/practice/detour-preference.mjs.

alter table public.profiles
  add column if not exists practice_detours_enabled boolean;

comment on column public.profiles.practice_detours_enabled is
  'Dynamic practice detours (the easier-question / lesson offer after repeated misses). true = on, false = off, null = unset (resolved by the app: off when the student has a row in teacher_student_assignments, on otherwise). See lib/practice/detour-preference.mjs.';
