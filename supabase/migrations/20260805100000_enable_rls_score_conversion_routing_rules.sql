-- Close the open RLS hole on the two score/routing reference tables.
--
-- Both tables shipped before the RLS sweep and were never enabled, so
-- the anon key could INSERT/UPDATE/DELETE the scoring ground truth
-- that every practice-test score is derived from. This is the Phase 0
-- prerequisite for the Bluebook contributions feature
-- (docs/bluebook-contributions-plan-2026-08.md): contributors must
-- never be able to write score_conversion directly, and that guarantee
-- is meaningless while the table is unprotected.
--
-- "Enable RLS with no policies" would have been the simple fix, but the
-- read audit says otherwise. score_conversion is read through the
-- RLS-bound *user* client in two places:
--
--   1. The student scoring path. finishModule (app/(student)/practice/
--      test/actions.js) passes its requireUser() client into
--      closeTestAttempt -> recomputeAttemptScores, which selects
--      score_conversion to find the exact (m1, m2) -> scaled row. With
--      no SELECT policy this does not error — it returns zero rows and
--      silently falls through to the estimated-curve branch, so every
--      newly finished test would get a subtly wrong scaled score. That
--      is the worst possible failure mode: invisible.
--   2. The admin content page (app/(admin)/admin/content/page.js) lists
--      conversions with the requireUser() client, and
--      admin/content/actions.js inserts/deletes with ctx.supabase.
--
-- Everything else that touches the table (the Recalculate action in
-- lib/practice-test/score-actions.ts, the upload-bluebook route,
-- lessonworksSync via computeTestScores) uses a service-role client and
-- bypasses RLS either way.
--
-- practice_test_routing_rules has no v2 consumers at all — the v2
-- schema moved adaptive thresholds onto practice_tests_v2 columns
-- (see 20240101000014) and the 40 surviving prod rows are v1 residue.
-- It gets the same shape anyway so the two tables stay symmetric and a
-- reader we missed degrades to "empty" rather than "denied".
--
-- Policy shape mirrors the sibling act_score_conversion table:
-- authenticated read, admin-only write. Reads are scoped to
-- `authenticated` (tighter than act_score_conversion's `public`) since
-- no anon path reads either table — public/external API routes go
-- through the service role.
--
-- stg_* staging tables are deliberately out of scope; they are slated
-- for deletion in a separate cleanup (docs/database.md "Known drift").

-- ── score_conversion ──────────────────────────────────────────────

alter table public.score_conversion enable row level security;

drop policy if exists score_conversion_select on public.score_conversion;
create policy score_conversion_select on public.score_conversion
  for select to authenticated
  using (true);

drop policy if exists score_conversion_admin_write on public.score_conversion;
create policy score_conversion_admin_write on public.score_conversion
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── practice_test_routing_rules ───────────────────────────────────

alter table public.practice_test_routing_rules enable row level security;

drop policy if exists practice_test_routing_rules_select on public.practice_test_routing_rules;
create policy practice_test_routing_rules_select on public.practice_test_routing_rules
  for select to authenticated
  using (true);

drop policy if exists practice_test_routing_rules_admin_write on public.practice_test_routing_rules;
create policy practice_test_routing_rules_admin_write on public.practice_test_routing_rules
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── demo read-only lockdown ───────────────────────────────────────
-- 20260511000000_demo_readonly_foundation swept "every public table
-- with RLS enabled", which is exactly why these two were skipped.
-- Re-apply the three restrictive policies now that they qualify, so
-- the invariant "RLS-enabled public table => demo accounts cannot
-- write it" holds without exception.

do $$
declare
  rec record;
begin
  for rec in
    select unnest(array['score_conversion', 'practice_test_routing_rules']) as tablename
  loop
    execute format($f$
      drop policy if exists demo_readonly_insert on public.%I;
      create policy demo_readonly_insert on public.%I
        as restrictive for insert
        to authenticated
        with check (not public.is_demo());

      drop policy if exists demo_readonly_update on public.%I;
      create policy demo_readonly_update on public.%I
        as restrictive for update
        to authenticated
        using      (not public.is_demo())
        with check (not public.is_demo());

      drop policy if exists demo_readonly_delete on public.%I;
      create policy demo_readonly_delete on public.%I
        as restrictive for delete
        to authenticated
        using (not public.is_demo());
    $f$,
      rec.tablename, rec.tablename,
      rec.tablename, rec.tablename,
      rec.tablename, rec.tablename
    );
  end loop;
end;
$$;
