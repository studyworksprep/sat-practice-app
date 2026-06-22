# Studyworks — Architecture context for agents

This file auto-loads at the start of every Claude Code session on
this repo. It captures the current operating state of the platform
so judgment calls about how to build a feature are informed by
where the rebuild actually stands — not by where it once was.

---

## Current state (June 2026)

The Studyworks rebuild described in `docs/architecture-plan.md` is
substantively complete. The platform is past the parallel-build
period and runs as a single tree on the v2 schema.

- **There is one app tree.** `app/next/*` was promoted to the route
  root in Stage C (see `docs/decommission-plan.md`). The legacy
  `app/` tree, `profiles.ui_version`, the
  `feature_flags.force_ui_version` row, and the proxy's tree
  resolver are all gone. The `feature_flags` table itself stays as
  infrastructure for future rollouts.
- **The v1 schema is archived to `_legacy`.** Public has zero v1
  presence for questions, practice tests, assignments, or answers.
  The 17 tables moved to `_legacy` cover the v1 question cluster
  (`questions`, `question_versions`, `question_taxonomy`,
  `question_id_map`), answer cluster (`answer_options`,
  `correct_answers`), practice-test list + attempt clusters (6
  tables), assignment clusters (4 tables), and `question_status`.
  All historical rows are preserved for audit.
- **`attempts.question_id` is exclusively v2-keyed.** The v1↔v2
  translation helpers (`resolveLegacyQuestionIds`, `question_id_map`
  walks, the union joins in DB functions) are gone. Any code that
  reaches for them is reintroducing a retired pattern.
- **The original schema-drift items are closed.** `practice_test_*`
  and `get_question_neighbors` were committed to migrations and the
  latter ultimately dropped. Any new DB object lives in a
  timestamped file under `supabase/migrations/`.

What's still pending under the decommission plan:

- The 90-day hold on `_legacy` before the final drop.
- Phase 3 schema normalizations (Phase 3 §§2–4): normalize
  `questions_v2.options` into a child table, unify
  `assignments_v2`/`assignment_students_v2` into a single
  `assignments`/`assignment_students` pair shared with ACT,
  universal audit columns + soft-delete.
- Playwright dual-tree mode removal (cosmetic; no behavior impact).

---

## Rules for new work

1. **v2 / live tables only.** Read and write the live surface:
   `questions_v2`, `assignments_v2`, `assignment_students_v2`, the
   `practice_test_*_v2` cluster, plus the always-current tables
   (`attempts`, `practice_sessions`, `desmos_saved_states`,
   `question_concept_tags`, `concept_tags`, `question_notes`,
   `question_error_notes`, `student_notes`, `profiles`, etc.).
   Reading any name in `_legacy` — or any retired v1 table by name —
   is a violation. No `question_id_map` walks. No
   `resolveLegacyQuestionIds`-shaped translation. If you find old
   code that still does this, fix it; don't propagate the pattern.

2. **Use the shared primitives.** Auth via `lib/api/auth.js`
   (`requireUser`, `requireRole`, `requireServiceRole('reason')`);
   never inline a role check. Server Actions return
   `actionOk()`/`actionFail()` from `lib/api/response.ts`; API
   routes wrap with `legacyApiRoute` and return `NextResponse.json`
   of `ok()`/`fail()`. Pagination via `lib/api/paginate.js`.
   Question rendering via `lib/ui/QuestionRenderer.js`. Server
   Components for initial data; `useEffect+fetch` is a legacy
   pattern.

3. **Commit schema to migrations.** Every DB change is a timestamped
   file under `supabase/migrations/`. After applying a migration,
   regenerate `lib/types/database.ts` via the Supabase MCP
   `generate_typescript_types` tool. The "schema in prod but not in
   migrations" drift mode is closed; keep it closed.

4. **Pause and confirm before reintroducing any retired pattern.**
   Inline role checks, bare `fetch()` in `useEffect`, new
   1,000-line files, schema drift, v1-table reads, or
   `question_id_map` translation logic all warrant an explicit
   ask first. The cost of pausing is seconds; the cost of a silent
   reversion is measured in users.

---

## TypeScript policy

Conversion is ongoing as background work:

- New files default to `.ts` / `.tsx`. Existing `.js` files keep
  working untouched (the tsconfig has `allowJs: true`,
  `checkJs: false`).
- Touched files don't have to convert — only when you're already
  doing a substantial refactor of one.
- Shared types live in `lib/types/`. Import via the barrel:
  `import type { Row, ActionResult, SubjectCode } from '@/lib/types'`.
- Database row types come from `lib/types/database.ts`, which is
  auto-generated. Regenerate after every migration via the
  Supabase MCP `generate_typescript_types` tool (or
  `supabase gen types typescript`).
- `npm run typecheck` runs `tsc --noEmit`; CI runs it too.

---

## Further reading

- `docs/architecture-plan.md` — original rebuild design document.
  The phased plan in §4 is now substantively shipped; the doc is
  preserved as the historical record of intent.
- `docs/decommission-plan.md` — legacy-tree decommission tracker.
  Stages A, B, C complete; Stage D mostly complete (residue listed
  in "Current state" above).
- `docs/runbook.md` — operational runbook.
- `docs/database.md` — schema operations + safe service-role usage.
