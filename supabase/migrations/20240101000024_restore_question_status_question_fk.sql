-- Restore the question_status → questions FK that migration 000017
-- dropped. Preserves the embedded-select relationship PostgREST uses
-- for the legacy /api/questions "Preview Questions" flow.
--
-- Background. 000017 dropped this FK alongside attempts' question_id
-- FK, on the premise that those columns might start carrying v2 UUIDs
-- (which live in questions_v2, not questions). That premise is true
-- for `attempts` — the new-tree submitAnswer action writes v2 UUIDs
-- there — but was NOT true for `question_status`. In production
-- today, every question_status row still points at a v1 questions.id
-- (3210/3210 matches vs. questions; 0/3210 vs. questions_v2). The
-- drop relaxed a constraint the data never violated, and the
-- side-effect was:
--
--   "Could not find a relationship between 'questions' and
--    'question_status' in the schema cache"
--
-- from PostgREST when the /api/questions route tried to embed
-- `question_status!left(...)` in its select. Teachers hit this when
-- they clicked "Preview Questions" in the assignment-creation flow.
--
-- Restoring the FK unblocks legacy callers with zero code change.
--
-- Lifecycle: question_status and this FK are both legacy-only. The
-- new tree reads per-question state directly from `attempts` (see
-- lib/practice/session-actions.js, app/next/(student)/assignments/
-- [id]/page.js). Both retire in Phase 6 with the rest of the legacy
-- tree. Until then, keeping the FK in place means PostgREST can
-- resolve the embedded join and ~12 legacy routes keep working
-- unchanged.

alter table public.question_status
  add constraint question_status_question_id_fkey
  foreign key (question_id)
  references public.questions(id)
  on delete cascade;

-- Kick PostgREST to reload its schema cache right away rather than
-- waiting for the next scheduled refresh. Supabase's PostgREST
-- listens on this channel.
notify pgrst, 'reload schema';
