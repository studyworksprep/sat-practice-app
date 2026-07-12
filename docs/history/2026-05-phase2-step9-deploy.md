# Phase 2 step 9 branch deploy — deploy record (May 2026)

> **Status: Historical record.** Extracted from docs/runbook.md
> on 2026-07-12. Describes the parallel-build period; every
> mechanism referenced here has since been retired.

This section describes a deploy from the parallel-build period and
is kept as a historical record. Statements below about `ui_version`
and the kill switch describe a mechanism that has since been
removed entirely (see "Parallel-build kill switch — RETIRED").

The RLS-refactor branch (plus everything that accumulated on top:
Phase 3 assignment unification, Phase 4 primitives, profile_cards
view) was deployed to production on Monday. Migrations 000011
through 000024 are applied; `main` holds the merged code. At the
time, the `app/next/` parallel tree was live behind `ui_version`
(both since retired — `app/next/*` is now the route root).

Post-deploy hotfixes, same day:
- **000015 route_code case mapping** — v1's `practice_test_modules`
  stores route codes as `EASY / HARD / BASE`; the original CASE in
  000015 compared against lowercase literals and collapsed every
  source row to `'std'`, colliding on the unique key. Fixed by
  lower-casing + explicit base→std mapping.
- **000024 restore question_status FK** — 000017 dropped
  `question_status_question_id_fkey` on the premise that the column
  might carry v2 UUIDs. In prod the column holds v1 UUIDs
  exclusively (3210/3210), so the drop was defensively over-eager
  and broke PostgREST's ability to resolve embedded
  `question_status!left(...)` selects in legacy routes. Restored
  the FK.

The items that were parked for Phase 6 have since been completed:
the legacy `practice_test_*` and v1 question tables were archived to
the `_legacy` schema (the `20260621*_archive_v1_*` migrations),
`question_status` moved to `_legacy`
(`20260620154530_recutover_drop_ui_version_and_archive_legacy_tables.sql`),
and the `upsert_question_status_after_attempt` RPC was dropped
(`20260620140312_archive_orphan_legacy_tables.sql`).
