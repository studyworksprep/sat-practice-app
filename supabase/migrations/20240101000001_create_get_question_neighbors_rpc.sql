-- =========================================================
-- get_question_neighbors RPC — backfilled from production
-- =========================================================
-- The `get_question_neighbors` function is called from
-- app/api/questions/[questionId]/neighbors/route.js but has
-- never been committed as a migration. It exists only in the
-- production database.
--
-- Call signature (from the route):
--   supabase.rpc('get_question_neighbors', {
--     current_question_id: uuid,
--     p_user_id:           uuid,
--     p_program:           text      -- 'SAT'
--     p_difficulty:        int | null,
--     p_score_bands:       int[] | null,
--     p_domain_name:       text | null,
--     p_skill_name:        text | null,
--     p_marked_only:       boolean,
--   })
-- Returns:
--   (prev_id uuid, next_id uuid)
--
-- This migration defines a placeholder that returns NULL for
-- both neighbors and logs a notice. A replay-from-scratch dev
-- database will be able to call the function (so routes won't
-- crash), but prev/next navigation will be no-ops until the
-- real body is pasted in.
--
-- ACTION REQUIRED BEFORE RELYING ON THIS FUNCTION IN DEV:
--   1) Connect to the production Supabase database (psql or
--      the SQL editor in the Supabase dashboard).
--   2) Run:
--         select pg_get_functiondef(
--           'public.get_question_neighbors(uuid, uuid, text, int, int[], text, text, boolean)'::regprocedure
--         );
--      (If the argument types differ, replace them with the
--      actual signature from `\df public.get_question_neighbors`.)
--   3) Paste the returned function body into this file,
--      replacing the placeholder below. Preserve the
--      `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER ...`
--      header so replay works cleanly.
--   4) Commit the updated migration. A fresh `supabase db
--      reset` against dev should then reproduce the prod
--      behavior of the neighbors endpoint.
--
-- This file uses the YYYYMMDDHHMMSS_*.sql Supabase CLI naming
-- convention so it sorts predictably alongside the rest of
-- the soon-to-be-renormalized migration directory.
-- =========================================================

create or replace function public.get_question_neighbors(
  current_question_id uuid,
  p_user_id           uuid,
  p_program           text default 'SAT',
  p_difficulty        integer default null,
  p_score_bands       integer[] default null,
  p_domain_name       text default null,
  p_skill_name        text default null,
  p_marked_only       boolean default false
)
returns table (prev_id uuid, next_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- PLACEHOLDER: return no neighbors. Replace this body with
  -- the real implementation dumped from production via
  -- pg_get_functiondef() — see header comment.
  raise notice
    'get_question_neighbors placeholder invoked; install real body from prod';
  return query select null::uuid as prev_id, null::uuid as next_id;
end;
$$;

revoke all on function public.get_question_neighbors(uuid, uuid, text, integer, integer[], text, text, boolean) from public;
revoke all on function public.get_question_neighbors(uuid, uuid, text, integer, integer[], text, text, boolean) from anon;
grant execute on function public.get_question_neighbors(uuid, uuid, text, integer, integer[], text, text, boolean) to authenticated;
