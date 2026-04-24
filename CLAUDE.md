# Studyworks — Architecture context for agents

This file auto-loads at the start of every Claude Code session on
this repo. It's the big-picture framing for why the current rebuild
exists, so that every judgment call about how to build a feature is
informed by that motivation — not re-litigated from scratch.

The text below is copied verbatim from `docs/architecture-plan.md`
§Executive Summary. Keep them in sync if either is edited.

---

## Executive Summary

Studyworks works. Students practice, teachers see their rosters, managers oversee teams, admins curate content. But the platform has accumulated the kind of structural debt that every fast-shipping product accumulates, and most of the bugs we've fixed over the last month were downstream effects of that debt, not the real disease. A coherent rebuild after the `questions_v2` migration wraps up would let us:

- **Cut the attack surface for the bugs we've actually been hitting.** The `db-max-rows` silent-truncation bug, the localStorage quota crash, the Stripe eager-init build failure, the `get_question_neighbors` RPC that doesn't exist in migrations — all five of these are symptoms of the same pattern: no shared helpers, no conventions, no drift detection.
- **Make every new bug show up in one obvious place.** Right now "where does the admin check happen?" has at least five answers depending on which route you're in. That multiplies debugging time by 5x every time something goes wrong.
- **Scale cleanly to thousands of users** without hitting the next class of silent-truncation or N+1 bugs, because the query patterns would be centralized.
- **Ship new features faster** because the primitives would already exist — error boundaries, auth helpers, pagination, typed data fetching, a shared question renderer — instead of being re-invented per page.

The top five concrete findings from the audit:

1. **100 API routes, 5+ distinct auth patterns, 51 routes with inline role checks.** Every route reimplements "is this user an admin?" in a slightly different way. This is by far the biggest source of cross-cutting risk.
2. **79 bare `fetch()` calls in `useEffect` with zero abstraction.** No caching, no deduplication, no typed responses, no consistent error handling.
3. **Dual question schemas still both in use** (v1 five-table + v2 single-table). The in-flight migration is the trigger for this plan, not the goal.
4. **Schema drift from migrations:** the `practice_test_*` tables and the `get_question_neighbors` RPC both exist in the production database but are not defined in any committed migration file. A fresh database built from `supabase/migrations/` would be missing the entire practice test feature.
5. **Seven source files over 1,000 lines** (two over 2,000) that do too many unrelated things in one place, making blast-radius analysis impossible when something breaks.

The rebuild is not a big-bang rewrite. It's six phases, each independently shippable, each producing immediately visible improvements. The entire plan runs alongside the live product under the parallel-build discipline described in §3.6: a new `app/(next)/` route tree is built next to the existing tree, a `profiles.ui_version` flag routes users individually, and a `feature_flags` kill switch pins everyone back to `legacy` instantly if anything goes wrong. No phase before Phase 6 changes what a production user sees unless we deliberately flip their flag. Total duration depends on velocity, but none of the phases require taking the site down, pausing feature work, or risking a visible regression.

---

## If a proposed change would contradict the above, flag it

The rebuild exists specifically to escape the five findings above.
Any change that would reintroduce one of them — a new inline role
check, a new bare `fetch()` in `useEffect`, new v1-schema code, a
new schema drift (a table/function in the DB with no migration), a
new 1,000-line file — pauses for explicit approval first. Same rule
for anything that breaks the parallel-build discipline: the legacy
`app/` tree has to keep working, there can be no cross-tree
dependencies, and the `profiles.ui_version` + `feature_flags`
kill switch must stay functional.

When in doubt, stop and ask. The cost of a pause-and-confirm is
seconds; the cost of a silent violation that ends up in prod is
measured in users.

## TypeScript policy

The new tree is in incremental TypeScript adoption. Rules:

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
- `npm run typecheck` runs `tsc --noEmit`; CI should run it too.

## Further reading

- `docs/architecture-plan.md` — master plan (§3.8 visibility, §4 phases)
- `docs/runbook.md` — operational (includes parked deploy plan for Phase 2 step 9)
- `docs/database.md` — schema overview
