# Migration directory status — read before running `supabase db push`

**Verified against production (`supabase_migrations.schema_migrations`)
on 2026-07-12.**

## The short version

**Do NOT run `supabase db push` (or `migration up`) against production
from this directory.** The files here are an accurate *historical
record* of schema changes, but they do not correspond to production's
migration-tracking table, and a push would attempt to re-apply years
of already-applied DDL.

## The verified facts

- Production tracks **67** applied migrations, versions
  `20260420125836` → `20260701151309` — CLI/MCP tracking began
  2026-04-20. Everything before that was applied by hand (dashboard
  SQL editor or MCP `apply_migration`, which stamps its own
  timestamp).
- Of the **151** `.sql` files in this directory, only **6** have
  filenames whose version matches a tracked version. **103**
  timestamped files (the `20220101…`/`20230101…`/`20240101…` series
  and many `2026…` ones) are untracked — the CLI would treat them as
  pending. **42** files have no timestamp prefix at all
  (`add_*.sql`, `fix_*.sql`, `create_*.sql`, …) — the CLI skips
  those entirely.
- Conversely, **61** tracked production versions have no matching
  local filename (the same logical migrations exist here under
  different names/stamps).
- Two filename collisions exist locally: `20240101000014_*` (two
  files) and `20260701000000_*` (two files).

## What this means

- Renaming the bare files to timestamped names would make things
  *worse*: they'd become "pending" in the CLI's eyes while remaining
  already-applied in production.
- The directory currently serves as an **audit log**, not a
  replayable migration chain. Treat it that way.
- **Never verify a live DB object against a repo file.** Functions
  and views have been redefined in production after their repo file
  was written (e.g. `get_student_dashboard_stats` — a repo file
  carries a mastery-computing variant; the live function computes
  plain accuracy). To check what production actually runs, query the
  live catalog via MCP:
  `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n
  on n.oid = p.pronamespace where n.nspname='public' and
  p.proname='<fn>';`

## The fix (scheduled operation — see docs/upgrade-plan-2026-07.md P0.7)

Baseline reset, to be done deliberately during a quiet window:

1. `supabase db dump` production schema to a single baseline
   migration (e.g. `2026XXXXXXXXXX_baseline.sql`).
2. Move every existing file into `supabase/migrations-archive/`
   (kept in git for history).
3. `supabase migration repair --status applied <baseline-version>`
   so production tracks exactly the baseline.
4. From then on, every schema change is a new timestamped file
   applied via `supabase db push` / MCP `apply_migration`, and the
   tracking table stays authoritative (CLAUDE.md rule 3 becomes
   enforceable again).

## Until the reset lands

- New migrations: keep creating timestamped files here AND applying
  them via MCP `apply_migration` (which records its own version) —
  the file is the reviewable artifact, the MCP apply is the source
  of truth.
- Also pending from the audit (fold into the baseline reset): drop
  the vestigial `classes`, `class_enrollments`, `class_invites`
  tables (0 rows), the unused `profile_cards` view (0 consumers in
  code after verification), and the 11 `stg_*` staging tables —
  after an archival export.
