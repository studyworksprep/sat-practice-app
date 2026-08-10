-- Drop the 11 stg_* staging tables and their helper function.
--
-- These were work tables for pre-loading question and practice-test
-- content during the v1→v2 migration into the question bank. Owner
-- confirmed 2026-08-10 they are no longer in use. They had RLS
-- disabled (flagged by the Supabase security advisor: readable and
-- writable with the anon key), and docs/upgrade-plan-2026-07.md
-- already listed them as vestigial schema to fold into the P0.7
-- baseline reset — this migration simply retires them early.
--
-- Verified before writing: no references under app/, lib/ (excluding
-- generated types), or scripts/; no dependent views or inbound FKs in
-- production; the only dependent object is stg_clear_practice_test,
-- dropped here too. Plain DROP (no CASCADE) so any unknown dependency
-- fails loudly instead of being silently removed.
--
-- Apply via the Supabase MCP (apply_migration), dev then prod, per
-- supabase/migrations/README.md. Regenerate lib/types/database.ts after.

drop function if exists public.stg_clear_practice_test(text);

drop table if exists public.stg_answer_options_new;
drop table if exists public.stg_correct_answers_new;
drop table if exists public.stg_practice_test_module_items;
drop table if exists public.stg_practice_test_modules;
drop table if exists public.stg_practice_test_routing_rules;
drop table if exists public.stg_practice_tests;
drop table if exists public.stg_pt11_corrected_taxonomy;
drop table if exists public.stg_pt6_id_reconciliation;
drop table if exists public.stg_pt7_id_reconciliation;
drop table if exists public.stg_question_versions_new;
drop table if exists public.stg_questions_new;
