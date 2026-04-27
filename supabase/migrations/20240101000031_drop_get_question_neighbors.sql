-- =========================================================
-- Drop the get_question_neighbors RPC and its orphan caller.
-- =========================================================
-- The RPC was added in 20240101000001_create_get_question_neighbors_rpc.sql
-- to back the legacy /api/questions/[questionId]/neighbors route used by
-- the v1 question-detail "prev / next" navigation. The v2 practice runner
-- (app/next/(student)/practice/s/[sessionId]/[position]) reads the next
-- question id directly from `practice_sessions.question_ids[position]`
-- — no RPC, no per-step query. The legacy route had no remaining callers
-- in the codebase before this commit and is being deleted alongside this
-- migration, so the function is unreachable.
--
-- Two signatures exist in production: one with `p_user_id uuid` defaulted
-- and one without it (where p_marked_only is the only behavior gated on
-- a user). We drop both with `if exists` so a fresh database (which only
-- knows the single signature defined in 20240101000001_*) is unaffected
-- and a prod database that still has the second overload from the
-- pre-migration era gets cleaned up.
-- =========================================================

drop function if exists public.get_question_neighbors(
  uuid, uuid, text, integer, integer[], text, text, boolean
);

drop function if exists public.get_question_neighbors(
  uuid, text, integer, integer[], text, text, boolean
);
