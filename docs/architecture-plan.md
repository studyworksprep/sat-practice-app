# Studyworks Architecture Plan

_A top-to-bottom analysis of the current platform and a staged plan for a coherent rebuild._

_Written April 2026. Assumes the `questions_v2` schema migration is complete before this plan kicks off._

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

## 1. Where We Are — Inventory

### 1.1 Stack

| Layer | Current |
|---|---|
| Framework | Next.js 14.2.5 (App Router) |
| UI runtime | React 18.3.1 |
| Database | Supabase (hosted Postgres + Auth + RLS) |
| Client libs | `@supabase/ssr` 0.5, `@supabase/supabase-js` 2.45 |
| Billing | Stripe 22 |
| Rendering helpers | KaTeX + MathJax (both), jsPDF, Desmos |
| Language | Plain JavaScript (no TypeScript) |
| Tests | None |
| CI | None (next lint is configured but not run in a workflow) |

### 1.2 Scale (by the numbers)

| Dimension | Count |
|---|---|
| Database tables defined in migrations | 37 |
| Migration files | 53 (28 of them are `add_*` or `fix_*` — reactive patches) |
| SQL functions (RPCs) | 12 defined, 1 referenced-but-missing (`get_question_neighbors`) |
| Indexes in migrations | 18 |
| API routes | ~100 |
| Pages in `app/` (non-API) | 41 |
| Shared components in `components/` | 14 |
| Total JS/JSX lines under `app/` | 35,740 |
| Total JS/JSX lines under `components/` | 6,924 |
| Total JS lines under `lib/` | 4,448 |
| `globals.css` lines | 8,223 |
| Files over 1,000 lines | 7 |
| Files over 2,000 lines | 2 (`practice/[questionId]/page.js`, `components/AdminDashboard.js`) |

### 1.3 Features, grouped by domain

| Domain | Tables | API routes | Primary page(s) |
|---|---|---|---|
| **Users & auth** | `profiles`, `classes`, `class_enrollments`, `class_invites`, `teacher_codes`, `teacher_student_assignments`, `manager_teacher_assignments` | `/api/me`, `/api/signup`, `/api/admin/users`, `/api/admin/teacher-codes`, `/api/admin/manager-assignments` | `/login`, `/teachers` (admin roster) |
| **Questions (v1 legacy)** | `questions`, `question_versions`, `answer_options`, `correct_answers`, `question_taxonomy`, `question_status` | `/api/questions/*`, `/api/filters`, `/api/domain-counts` | `/practice/[questionId]` |
| **Questions (v2 in-flight)** | `questions_v2`, `question_id_map`, `questions_v2_fix_suggestions` | `/api/admin/questions-v2/*` | `components/QuestionsV2Preview`, `components/QuestionsV2BulkReview` |
| **Taxonomy** | `concept_tags`, `question_concept_tags`, `answer_choice_tags`, `option_answer_choice_tags`, `question_notes`, `skill_learnability` | `/api/concept-tags`, `/api/answer-choice-tags`, `/api/question-notes`, `/api/admin/skill-learnability` | (inline on question pages) |
| **Attempts & sessions** | `attempts`, `question_status` | `/api/attempts`, `/api/status`, `/api/smart-review`, `/api/review` | `/practice/[questionId]`, `/review` |
| **Practice tests** | `practice_tests`, `practice_test_modules`, `practice_test_attempts`, `practice_test_module_attempts`, `practice_test_module_items`, `practice_test_item_attempts`, `practice_test_routing_rules` — **none of these are in any committed migration** | `/api/practice-tests/*` | `/practice-test/*` |
| **Scoring** | `score_conversion`, `sat_official_scores`, `sat_test_registrations` | `/api/teacher/score-conversion`, `/api/admin/recalculate-score` | `/practice-test/attempt/[id]/results` |
| **Assignments** | `question_assignments`, `question_assignment_students` | `/api/assignments/*`, `/api/teacher/question-assignments` | `/assignments/[id]`, `/teacher` |
| **Learning content (lessons)** | `lessons`, `lesson_blocks`, `lesson_topics`, `lesson_assignments`, `lesson_assignment_students`, `lesson_progress` | `/api/lessons/*`, `/api/teacher/lessons/*` | `/learn`, `/teacher/content/[lessonId]` |
| **Flashcards & vocab** | `flashcard_sets`, `flashcards`, `sat_vocabulary`, `sat_vocabulary_progress` | `/api/flashcards/*`, `/api/flashcard-sets`, `/api/sat-vocabulary` | `/flashcards/[setId]`, `/review` |
| **ACT (parallel universe)** | `act_questions`, `act_answer_options`, `act_attempts` | `/api/act/*` | `/act-practice/*` |
| **Billing** | `subscriptions` | `/api/billing/*`, `/api/webhooks/stripe` | `/account/billing`, `/subscribe` |
| **Admin & reporting** | `bug_reports`, `desmos_saved_states`, `question_availability` (broken — RLS enabled, no policies) | `/api/admin/*`, `/api/error-log`, `/api/time-analytics` | `/admin`, `/admin/bulk-reocr` |

### 1.4 Auth / role system

Five user roles: `practice` (unpaid preview), `student`, `teacher`, `manager`, `admin`. The role lives on `profiles.role` and is mirrored to `auth.users.raw_app_metadata.role` via a trigger (`sync_role_to_auth_metadata`). RLS policies check roles either via helper functions (`is_admin()`, `is_teacher()`, `teacher_can_view_student()`) or by directly querying `profiles` — and half of the policies still do the latter despite a 2025 refactor (`fix_profiles_rls_infinite_recursion.sql`) that was supposed to eliminate direct profile queries.

---

## 2. Pain Points Diagnosed

The pain points group into four categories. Within each, I've flagged severity: **[H]** = actively causing bugs or a scaling blocker, **[M]** = silently costly but not yet broken, **[L]** = technical cleanliness only.

### 2.1 Database & schema

**[H] Schema drift from migrations.** The `practice_test_*` tables (seven of them: `practice_tests`, `practice_test_modules`, `practice_test_attempts`, `practice_test_module_attempts`, `practice_test_module_items`, `practice_test_item_attempts`, `practice_test_routing_rules`) and the `get_question_neighbors` RPC function are referenced by production code but **do not exist in any committed migration file**. They exist in the live database only. This means:

- A fresh Supabase project built from `supabase/migrations/` is missing the entire practice-test feature.
- You can't reliably stand up a staging environment or a dev database.
- Schema changes to those tables have no version history, no review, and no rollback path.
- If production is ever corrupted or lost, recovery requires rebuilding schema from intuition.

**[H] Dual question schemas in production traffic.** The v1 five-table model (`questions`, `question_versions`, `answer_options`, `correct_answers`, `question_taxonomy`) and the v2 single-table model (`questions_v2`) are both actively read — 34 files still query v1, only 4 query v2. The migration is in flight and this plan assumes it wraps up before the rebuild starts.

**[H] RLS policy drift.** Four migration files in history are `fix_*_rls_*`, all about recursion, manager visibility, or role-specific bugs that the original policies missed. The `fix_profiles_rls_infinite_recursion.sql` refactor rewrote `is_admin()` and `is_teacher()` to use JWT claims instead of querying `profiles`, but most other policies (on `concept_tags`, `answer_choice_tags`, `desmos_saved_states`, `question_concept_tags`, etc.) still do `exists (select 1 from profiles where role = 'admin')` inline. This is the exact recursion pattern the refactor was supposed to eliminate, partially done.

**[M] Orphaned `question_availability` table.** RLS is enabled but zero policies are defined, meaning it returns zero rows for every query. Unknown purpose, likely half-finished performance optimization. Either should be deleted or completed.

**[M] Two parallel assignment systems.** `question_assignments`+`question_assignment_students` and `lesson_assignments`+`lesson_assignment_students` have nearly identical structure but are independent tables with no shared abstraction. Adding a new assignable resource means a third parallel system.

**[M] JSONB used as a dumping ground.** `questions_v2.options`, `questions_v2.correct_answer`, `lesson_blocks.content`, `lesson_progress.check_answers`, `question_assignments.filter_criteria` — all JSONB with no schema validation and no migration story if the shape changes. Old rows silently become "wrong shape" if a key is added or renamed.

**[M] Cascading deletes with no soft-delete pattern.** A profile delete cascades through `classes`, `class_enrollments`, `attempts`, `flashcards`, `question_notes`, `lesson_progress`, etc. No audit trail once the cascade runs. Regulatory/archival risk if a school ever asks for historical records of a removed user.

**[M] Inconsistent audit columns.** `questions_v2` has `created_at, updated_at, approved_at, approved_by, last_fixed_at, last_fixed_by`. `profiles` has only `created_at`. Most junction tables have nothing. There's no consistent "who last touched this row" trail anywhere.

**[L] Unused indexes and missing indexes.** The audit flagged at least five places where RLS helper functions do lookups on tables that lack a covering index (e.g. `teacher_student_assignments` composite lookups). Not a crisis at current scale; will be at 1000+ users.

### 2.2 API surface

**[H] Five+ distinct auth patterns across 100 routes.** The route inventory identified these patterns, with the counts:

| Pattern | Count | Example |
|---|---|---|
| Lightweight `auth.getUser()` + RLS-only enforcement | ~46 | `/api/dashboard`, `/api/flashcards` |
| Inline role gate (`if (profile.role !== 'admin') return 403`) | ~51 | `/api/admin/*`, `/api/teacher/*` |
| Anonymous (no auth check at all) | 3 | `/api/signup`, `/api/webhooks/stripe` |
| Mixed inline-role + service-role client | ~30 | `/api/admin/platform-stats`, `/api/teacher/dashboard` |
| Token/secret-based (external endpoints) | 3 | `/api/external/*`, `/api/public/*` |

Each of these has its own small-print differences in how it returns errors, whether it sets `profile = null` on missing rows, whether it falls through to a default role, and whether it uses `createClient()` or `createServiceClient()`. That's the reason every bug in the auth/RLS space (the recent Active Users, the fix_manager_practice_test_visibility, all four RLS recursion fixes) required a multi-file change and took a long debug cycle — there was no one place to look.

**[H] 37 routes use `createServiceClient()` (RLS-bypassing).** Some of these genuinely need to bypass RLS (cross-user aggregation for admin analytics, webhook handlers). Many don't. There's no convention that says "you must comment *why* you need to bypass RLS" and no audit of which ones could switch back to the RLS-scoped client. Every bypass is a potential data-leak vector if the app-layer role check ever has a bug.

**[M] Duplicate endpoints and parallel SAT/ACT routes.** `/api/dashboard` vs `/api/dashboard/stats` — both return dashboard data, different projections, overlapping queries. `/api/questions` vs `/api/act/questions` — nearly identical route, forked by test type because the test-type selector is client-side. Every bug fix in one must be mirrored in the other, and in practice they drift.

**[M] No shared response envelope.** Some routes return `{ error: '...' }`, some `{ error: '...', status: 'failed' }`, some just `{ }` with a non-200 status, some `{ ok: true, ... }`. The client's 79 fetch sites each guess at how to parse the response.

**[M] No shared pagination helper.** The `db-max-rows` bug we fixed last month was preventable with a single `paginate(query, { from, limit })` helper that always adds `.order()` and returns a typed result. Instead, every route that lists data re-implements pagination its own way, and several of them silently truncate at 1,000 rows.

**[M] Stripe (and other env-gated libs) still eagerly imported at module load.** We fixed the lazy-init for the `new Stripe()` constructor, but the SDK itself is still imported at the top of the file. That's mostly fine today but bit us once this session and will bite again.

**[L] REST pathing is inconsistent.** `/api/teacher/student/[studentId]/upload-bluebook` is an action, not a resource. `/api/admin/recalculate-score` is a verb. Resource-style routing (`/api/students/[id]/bluebook-uploads`, `/api/attempts/[id]/score`) would be easier to reason about, but this is polish, not urgent.

### 2.3 Frontend

**[H] 79 bare `fetch('/api/...')` calls in `useEffect` blocks with no abstraction.** No caching. No deduplication (the same student roster is fetched independently by three different pages on one session). No typed responses. No retry. No consistent loading state. No consistent error-toast handling. Every new page re-implements the same four-state pattern (`loading/data/error/refetching`) by hand.

**[H] Seven files over 1,000 lines; two over 2,000.** The biggest offenders:

| File | Lines | What it contains |
|---|---|---|
| `app/practice/[questionId]/page.js` | 2,391 | Question rendering, MCQ interaction, SPR input, teacher mode, session navigation, flashcard modal host, error log, concept tags, bug reports, map view, Desmos integration, timer |
| `components/AdminDashboard.js` | 2,366 | 10+ tab views, each with their own fetching, modals, tables |
| `app/teacher/shared.js` | 1,824 | A grab bag — avatars, formatting, 5+ large components used by teacher pages |
| `app/practice-test/attempt/[attemptId]/results/page.js` | 1,410 | Results rendering for all MCQ + SPR questions + score breakdown + section navigation |
| `app/practice-test/attempt/[attemptId]/page.js` | 1,090 | Active test runtime — modules, timer, answer state, submission |
| `app/act-practice/[questionId]/page.js` | 1,075 | ACT variant of the practice page — mostly a copy |
| `app/dashboard/DashboardClient.js` | 1,070 | Student dashboard with 8+ widget cards |

Every change to one of these files has a disproportionate blast radius. You can't reason about what a PR might break without reading thousands of lines.

**[H] The question renderer exists three times.** `/practice/[questionId]`, `/act-practice/[questionId]`, and `/teacher/review/[questionId]` all render an MCQ question with options, rationale, and score reveal — three independent implementations that have drifted from each other. The recent "Flashcards" button change had to be applied in two of them; the `AnswerChoiceTags` component was only wired into two of them.

**[M] 16 distinct `localStorage` key prefixes, several growing unbounded.** The audit found `practice_session_*`, `practice_*_page_*`, `act_session_*`, `teacher_review_session_*`, `teacher_review_meta_*`, `pt_factor_*`, `{qid}_elapsed`, `{qid}_qt`, `{qid}_ans`, `desmos_state_*`, plus some one-off keys. We just patched the quota crash for `practice_session_*` with an LRU helper, but the other six prefixes write under similar "cache forever, never evict" patterns and can each cause the same class of bug.

**[M] Only one error boundary in the entire app** (`app/dashboard/error.js`, which I added this branch). Every other route surfaces crashes as the generic Next.js "Application error: a client-side exception has occurred" page with no stack trace and no recovery button.

**[M] 14 shared components, ~12 clear opportunities for more.** The audit specifically called out: modal patterns (no shared implementation, so each page rolls its own overlay and close-on-outside-click logic), pagination controls, tables, score displays, avatars, toast/notification. These would be a weekend of extraction and would halve the surface area of the large files.

**[L] Design tokens and CSS live in one 8,223-line `globals.css` file.** Mostly works. Getting in the way of component-level styling discipline.

### 2.4 Cross-cutting

**[M] No type system.** At 45,000+ lines of application code, a data-shape change anywhere (adding a field to `/api/dashboard`, changing what a component expects) has no compile-time check. Every bug we fixed this session that involved "oh, the shape of this object changed" would have been a compile error with TypeScript.

**[M] No tests.** Not even smoke tests for "can a student log in and see the dashboard" or "can a teacher open a student profile". Every deploy is a production test against real users.

**[M] No CI pipeline running lint/build on PRs.** `next lint` is configured but never runs automatically. The build itself only happens at deploy time.

**[M] No centralized error monitoring.** `console.error` is scattered throughout. Server-side errors in API routes don't reach any monitor. When a student reports a bug, the only available evidence is their screenshot of the generic error page.

**[M] No local dev environment for the database.** Applying a new migration means pasting SQL into the Supabase dashboard or running a one-off script. No `supabase db push` workflow because the existing migration filenames don't match the CLI's timestamp convention.

**[L] No `tsconfig.json`, no `.prettierrc`, no shared editor config.** Polish.

---

## 3. Target Architecture

### 3.1 Principles

Six principles that every piece of the rebuild should be tested against:

1. **One canonical answer per question.** "Is this user an admin?" should be one function call. "How do I list rows from this table?" should be one helper. "What do I put in an error response?" should be one constant.
2. **The database is the source of truth.** Every schema change lives in a committed migration. Nothing exists in production that isn't in version control. Migrations are replayable from scratch into a clean database.
3. **RLS is the primary access-control layer; app-code checks are a secondary defense.** Bypassing RLS requires an inline comment explaining why, and the bypass is audited periodically. When in doubt, lean on RLS.
4. **Server renders data. Client handles interaction.** Initial page state comes from a server component. Client components mount only where interaction or local state demands it. This kills the 79 `useEffect+fetch` pattern.
5. **Every file has one job.** Files over ~500 lines get broken up unless there's an explicit exception. The top-level `app/` pages are orchestration; the actual rendering lives in focused components.
6. **Errors are visible, recoverable, and debuggable.** Every route segment has an error boundary. Every API response has a consistent shape. Every caught exception is logged with a request id.

### 3.2 Database layer

**Schema consolidation:**

- **Drop the v1 question tables** (`questions`, `question_versions`, `answer_options`, `correct_answers`, `question_taxonomy`) once `questions_v2` is the only read/write target. The `question_id_map` bridge table can stay for as long as legacy attempts reference old IDs, then be archived.
- **Normalize `questions_v2.options`.** Move options into a child `question_options` table keyed by `(question_id, option_label)`. Keep the JSON path only for `correct_answer` metadata (text/number/tolerance for SPR) because that's genuinely variant-shape. Options are uniform and deserve SQL typing so indexes, tag joins (the `option_answer_choice_tags` we added last week), and search all work naturally.
- **Define the `practice_test_*` schema in migrations.** Seven tables, all the RLS policies, all the indexes. This is mandatory foundational work — nothing else is safe until the production schema matches the migration history.
- **Unify the SAT assignment model** into one `assignments` table with a polymorphic `target_type` (`question_set` | `lesson` | `practice_test`) and a single `assignment_students` junction. Drop the four current SAT assignment tables. This removes about 30% of the teacher-route complexity on the SAT side. **ACT keeps its own parallel `act_assignments` + `act_assignment_students` pair** — the ACT assignment model is passage-based and doesn't share the SAT's question-set shape well enough to be worth forcing into a single schema (see §3.6 on ACT separation). Cross-test reporting happens through the rollup layer described in §3.8, not by merging the tables.
- **Standardize audit columns on every table:** `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (soft delete). A single trigger per table maintains `updated_at`. `deleted_at IS NULL` becomes the default filter in every read query and in every RLS policy.

**RLS discipline:**

- **One set of helper functions**, all JWT-based, defined once: `auth_role()`, `is_admin()`, `is_teacher_or_admin()`, `is_manager_or_admin()`, `can_view_student(uuid)`, `can_view_teacher(uuid)`. No policy is allowed to do `exists (select 1 from profiles where role = 'admin')` — that pattern caused four different recursion bugs.
- **Every table has RLS enabled**, even lookup tables. The handful of genuinely public tables (`sat_vocabulary`, `score_conversion`) get an explicit `for select using (true)` policy instead of being left disabled. This makes "no RLS" impossible-by-default.
- **Each policy has a companion comment** that explains what it's for in English, so the next person can read the intent without decoding the SQL.
- **Service-role queries go through a single helper** (`lib/db/admin.js`) that wraps the service client and logs every call with the route and reason. This turns "who bypasses RLS and why" into a one-file audit.

**Observability at the DB level:**

- A `query_log` view that captures slow queries (via `pg_stat_statements`) so we can see the top 20 by total time, weekly.
- `pgaudit` or similar for admin-critical tables (`profiles` role changes, `subscriptions`, `teacher_student_assignments`).

### 3.3 Server layer (API)

**One auth helper module.** `lib/api/auth.js` exports:

```js
requireUser()                 // → { user, profile } or throws 401
requireRole(['admin'])        // → { user, profile } or throws 401/403
requireServiceRole(reason)    // → service client + audit log entry
```

Every API route's first line becomes one of those three calls. The ~51 inline role checks collapse to zero. Auth bugs become fixable in one file.

**One response helper.** `lib/api/response.js`:

```js
ok(data)                      // → NextResponse.json({ ok: true, data })
fail(message, status)         // → NextResponse.json({ ok: false, error: message }, { status })
```

Every route returns via one of these. The 79 client fetch sites can rely on `json.ok` to branch — no more guessing whether an error is `json.error`, `json.message`, or a non-200 status with an empty body.

**One pagination helper.** `lib/api/paginate.js`:

```js
paginate(query, { page, pageSize, order })
  → always adds .order(), clamps pageSize to a safe max,
    returns { items, page, total, hasMore }
```

The `db-max-rows` silent-truncation bug becomes structurally impossible because `paginate()` is the only way to list rows. Count queries use `countExact()`, another tiny helper that wraps the HEAD-request trick we used to fix Practice Volume.

**Resource-based REST routing.** The target shape:

```
/api/students/[id]
/api/students/[id]/attempts
/api/students/[id]/scores
/api/teachers/[id]
/api/teachers/[id]/students
/api/assignments
/api/assignments/[id]
/api/assignments/[id]/submissions
/api/practice-tests
/api/practice-tests/[id]/attempts
/api/practice-tests/attempts/[id]
/api/questions
/api/questions/[id]
/api/questions/[id]/attempts
```

SAT and ACT endpoints remain parallel trees (`/api/questions/*` and `/api/act/questions/*`, `/api/practice-tests/*` and `/api/act/practice-tests/*`) because the content shape, assignment model, scoring rules, and test structure differ fundamentally — ACT tests have no module routing, no adaptive logic, and a passage-based assignment model that doesn't compress cleanly into the SAT's question-set shape. What both trees do share is the helper layer defined above: same `requireRole()`, same `paginate()`, same `ok()`/`fail()`, same rate limiting, same logging. Cross-cutting bugs get fixed once. Test-specific logic stays isolated. A dedicated `/api/me/activity` rollup endpoint reads from both trees and returns unified counts (total attempts, total practice tests, assignment completion percentages) so dashboards and managerial reporting can aggregate across the two without merging schemas.

**Standard route skeleton.** Every new route looks like this:

```js
import { requireRole } from '@/lib/api/auth';
import { ok, fail } from '@/lib/api/response';
import { paginate } from '@/lib/api/paginate';

export async function GET(req) {
  const { supabase } = await requireRole(['teacher', 'admin']);
  const { searchParams } = new URL(req.url);
  const { items, total, hasMore } = await paginate(
    supabase.from('students').select('*'),
    { page: searchParams.get('page'), pageSize: 25 }
  );
  return ok({ items, total, hasMore });
}
```

That's the maximum amount of boilerplate per route. Everything above is mechanical.

**Env-gated SDKs always lazy-init.** `lib/stripe.js`, `lib/anthropic.js`, etc. all follow the same `getStripe()` / `getAnthropic()` getter pattern, memoized at module scope. Never construct at import time. Never trust that a `.env` value is present when the file loads.

### 3.4 Client layer

**Server components for initial data.** Most pages under `app/` are converted to server components that fetch their initial data via `lib/db.js` directly (no HTTP round-trip, no `useEffect`, no client-side loading state). The page renders on the server, streams HTML, and hydrates only the parts that need interactivity. The 79 `fetch+useEffect` pattern becomes maybe 10, reserved for genuinely interactive things (live polling of assignment completion, mid-session stats updates).

**Client components only where interaction happens.** A page like `/dashboard` is a server component that hands data to a small `<DashboardInteractive>` child which owns the click handlers and state. Component decomposition enforces this naturally: if a file is over 500 lines, it's trying to do both, and the first refactor is splitting it.

**Shared data-fetching hook for the remaining client-side cases.** For the real cases where the client needs to fetch (mid-session updates, form submissions that reload data), one hook:

```js
useApi(url, { params })
  → { data, error, isLoading, refetch }
```

The hook handles the `json.ok` convention from §3.3, reads the standard error shape, deduplicates in-flight requests to the same URL, and can optionally cache for the session. It's a dozen lines; the win is consistency.

**Shared component primitives.** A small, focused set that gets imported everywhere:

| Component | Replaces |
|---|---|
| `<Button variant="primary|secondary|danger">` | The ~30 different inline button styles |
| `<Card>`, `<CardHeader>`, `<CardBody>` | The raw `<div className="card">` scattered everywhere |
| `<Modal title onClose>` | The ~10 inline modal implementations |
| `<Table columns rows sort paging>` | The 5+ custom admin tables |
| `<Pagination page totalPages onPageChange>` | The custom pagination in AdminDashboard + BulkReview |
| `<Avatar name size>` | The two different avatar components |
| `<ScoreCard composite rw math>` | The ~6 places that render SAT scores |
| `<DomainMasteryBar ...>` | The inline bars in dashboard + student detail |
| `<QuestionRenderer mode="practice|review|teacher">` | `/practice/[id]`, `/act-practice/[id]`, `/teacher/review/[id]` — one component, three modes |

The `<QuestionRenderer>` is the biggest win. All three current implementations compute option state, handle MCQ vs SPR, render the stimulus/stem/options/rationale, integrate Desmos and flashcards and concept tags — they should be one component with a `mode` prop and a small set of slots for teacher-only elements.

**Server-side session state, not localStorage.** The `practice_session_*`, `teacher_review_session_*`, `act_session_*` localStorage caches all exist to compensate for a frontend that doesn't have server-rendered pagination. In the rebuild, session state (current question list, position, timers, draft answers) moves into a server-side `practice_sessions` table keyed by an opaque `sessionId` (see §3.7). The client only knows its session id; the server looks up everything else. URL params survive reloads, share cleanly, and don't leak question content; `localStorage` stops being a privacy surface entirely.

The only legitimate use of localStorage in the rebuild is per-question timer recovery (`{qid}_elapsed`), and even that could move to session storage or the URL hash. Both client-side toggles from the legacy tree (`studyworks_test_type` and `sat_teacher_mode`) are removed — see the navigation model below. Everything else goes away.

**Navigation tree, not toggles.** The legacy product uses two client-side toggles that mutate UI context: `studyworks_test_type` (SAT vs ACT) and `sat_teacher_mode` (privileged-user view mode). Both disappear in the rebuild. A user's experience is determined entirely by their role and the URL they're on — no flags to sync, no state to persist, no "why am I seeing this" confusion.

The new top-level route tree:

```
app/(next)/
  (student)/                          — student role only
    dashboard/
    practice/s/[sessionId]/[position] — opaque session URLs (§3.7)
    review/
    practice-test/
  (tutor)/                            — tutor, manager, admin
    tutor/
      dashboard/
      training/                       — tutor's own private practice
      training/review/                — tutor's own review of their own attempts
      students/                       — list of assigned students
      students/[id]/                  — student activity, scores, attempts
      browse/                         — curriculum-planning browse, full metadata
  (manager)/
    manager/
      dashboard/
      teachers/                       — list of assigned tutors
      teachers/[id]/                  — tutor's training + their students
      teachers/[id]/students/[id]/
  (admin)/
    admin/
  act/                                — fully parallel ACT tree
    (student)/
      dashboard/
      practice/s/[sessionId]/[position]
      review/
      practice-test/
    (tutor)/
      tutor/
        training/
        students/
        ...
    (manager)/
      manager/
        ...
```

Key consequences:

- **`/tutor/training` looks and feels exactly like the student practice and review UIs.** That's the whole point — tutors experience what their students experience. The shared `<QuestionRenderer>` and the shared practice-session flow serve both audiences with zero divergence in rendering. The only difference is the data filter: on `/tutor/training`, the queries are `where user_id = auth.uid()`, and RLS via `can_view` (§3.8) protects the row regardless. There is no "teacher mode" toggle, no inline `isTeacherMode` branch in the renderer, no way for the two experiences to drift.
- **`/act/*` is a complete parallel tree.** ACT dashboards, practice, practice tests (no module routing), passage-based assignments, review, and tutor training all live under the ACT path. The SAT and ACT trees share backend helpers (auth, pagination, rate limiting, response envelopes, the watermarking helper from §3.7) and share UI primitives (`<Button>`, `<Card>`, `<Modal>`, `<QuestionRenderer>`), but not data schema or navigation state. Cross-test reporting lives in a dedicated `user_activity_rollup` view and the `/api/me/activity` endpoint, so a dashboard that wants to show "total attempts across SAT + ACT" or "practice tests completed, both tests" can do so with a single query.
- **There are no test-type or teacher-mode toggles to forget to render, debug, or sync.** The URL is the mode.
- **Login lands the user on their default test type.** A new `profiles.default_test_type` column (`sat` | `act`, default `sat`) decides whether a fresh login redirects to `/dashboard` or `/act/dashboard`. Users navigate between the two freely through a top-level nav item; the last-visited tree is remembered per-session for return visits.

**Error boundaries on every route segment.** Each of the following gets an `error.js` that captures the actual error, shows a recovery button, and surfaces the stack to support (following the pattern from `app/dashboard/error.js`):

- `app/error.js` (catch-all)
- `app/practice/error.js`
- `app/practice-test/error.js`
- `app/review/error.js`
- `app/teacher/error.js`
- `app/admin/error.js`
- `app/features/error.js`

### 3.5 Cross-cutting

**TypeScript, incrementally.** Start with `lib/` (pure functions, easy to annotate), then API routes, then components. Full conversion is not a prerequisite for any other phase — you get real compile-time safety from the first `tsconfig.json` onward. The types for database rows should be generated from Supabase's schema, not hand-maintained.

**Error monitoring.** Sentry or an equivalent, one SDK, one `.env` entry. Wire up to both the Next.js server and client. This replaces every `console.error` call that currently serves as a half-hearted log. Every API route wraps its handler in a helper that catches, attaches the request id, and forwards to Sentry.

**Structured logging on the server.** A tiny `lib/log.js` that produces JSON logs with `requestId`, `route`, `userId`, `role`, `durationMs`. Vercel (or whatever host) already captures stdout; structured logs make it searchable.

**Local dev environment.** Rename the existing migration files to the Supabase CLI's `YYYYMMDDHHMMSS_*.sql` convention (a one-time sed pass over git history), add `supabase/config.toml`, document `supabase db reset` as the way to populate a local or dev-remote database. New migrations go through `supabase migration new`. Dev always has the same schema as prod.

**CI.** One `.github/workflows/ci.yml` that runs `npm ci`, `next lint`, `next build`, and `node --check` on every script file. That catches the class of bugs we've been hitting (silent syntax errors in scripts, lint misses, lazy-init failures at build time) before merge.

**Integration tests for the critical flows.** Four or five Playwright tests is plenty:

1. Student logs in → sees dashboard → starts a practice session → answers a question → sees result
2. Student takes a full practice test → sees score report
3. Teacher logs in → opens student profile → reviews a wrong answer
4. Admin logs in → opens Questions V2 preview → approves a question
5. Stripe checkout → webhook → subscription active

These don't have to catch every bug — they have to catch "is the whole platform completely broken right now". Every deploy runs them.

**A shared design-token file.** Extract from `globals.css` into `app/design-tokens.css` or CSS variables on `:root`. Everything else consumes tokens. Long-term, `globals.css` shrinks from 8,223 lines to maybe 500 of actual global rules plus the tokens.

### 3.6 Parallel-safe rebuild strategy

Nothing in this rebuild is allowed to change the experience of a real student or tutor until we flip them over explicitly. The entire plan runs alongside the live product, not inside it. Five rules enforce this:

**1. New code lives in a parallel route tree.** A new top-level group `app/(next)/` contains every rebuilt page. The existing routes (`app/practice`, `app/dashboard`, `app/teacher`, `app/act-practice`, etc.) stay exactly as they are and keep serving production traffic throughout Phases 1–5. Builds produce both trees. Nobody reaches the new tree unless middleware routes them to it.

**2. A per-user `ui_version` flag.** A new column `profiles.ui_version` (`legacy` | `next`, default `legacy`) determines which tree each user sees. Next.js middleware reads the flag on every request and rewrites the URL into the chosen tree. Rollout is a single UPDATE per cohort — internal accounts first, then a handful of opt-in tutors, then a beta cohort of friendly students, then new signups, then everyone. Rollback for any individual user is one SQL statement.

**3. A `feature_flags` table as the kill switch.** One row, one key (`force_ui_version`), one nullable value (`legacy` | `next` | `null`). Middleware consults it before the per-user flag. If anything goes wrong in production, `update feature_flags set value = 'legacy' where key = 'force_ui_version'` pins every user back to the old tree instantly — no redeploy, no env-var change, no git commit. The flag is cached server-side for at most 5 seconds, so the blast radius of a flip is bounded to that window. The same mechanism supports the inverse flip (`force = 'next'`) for final cut-over verification.

**4. Database changes are additive-only through Phase 5.** New tables and columns appear; old ones stay untouched. Views and triggers bridge shapes where two code paths need to coexist. Any table being replaced (the unified `assignments` table, the new `practice_sessions` server-state table, the normalized `question_options` child table) uses dual-write during the transition: the legacy code path keeps writing to the old shape, a trigger or app-level helper forwards the write to the new shape, and the `(next)` code path reads only from the new shape. No data migration is irreversible until Phase 6.

**5. Every PR runs tests on both trees.** The Playwright integration suite from §3.5 runs twice on every pull request — once with `ui_version=legacy` forced, once with `next` forced. A regression in either tree blocks merge. This keeps the legacy tree maintainable as a rollback target for as long as we carry it.

This discipline stretches calendar time slightly — we carry duplication through several phases — but the alternative is a big-bang cut-over, which is the single largest incident risk the rebuild could take on. Phase 6 (Decommission) is where the duplication is finally paid down.

### 3.7 Content protection

**Threat model.** The risk we're defending against is *bulk automated extraction* of question content, not individual student curiosity. Students are encouraged to see metadata — difficulty, score band, domain, skill, concept tags, rationale after submission — because it's part of the product's value: the feeling that Studyworks is a sneak peek at how the SAT actually works. The goal is to raise the cost of scraping enough that it stops being practical at scale, without degrading the honest student experience in any way.

**Today's exposure** (audited April 2026):

- `/api/questions/[id]` returns full `stimulus_html`, `stem_html`, and `options[].content_html` as JSON on every load. An authenticated attacker can iterate sequential question IDs and dump the content bank.
- `correct_option_id` and `correct_text` are correctly guarded (only after submission, or for privileged roles). Good.
- `rationale_html` and `explanation_html` are not in the initial response. Good.
- `localStorage` under `practice_session_*` stores question IDs and trimmed metadata, but not content. Good.
- There is no rate limiting on content endpoints, no scraper detection, no watermarking, no session gating.

**Defenses to add**, in order of payoff:

- **Server-rendered question content.** The practice page under `app/(next)/` is a React Server Component. Question HTML is rendered on the server and streamed as rendered markup, not as a JSON payload containing raw `stem_html`. DevTools shows formatted HTML for a single question — not a scrapable object, not an array. A determined attacker can still parse the DOM, but the friction is orders of magnitude higher than a JSON endpoint, and the attacker loses the ability to pattern-match on stable JSON field names.

- **Opaque session-position URLs.** Instead of `/practice/[questionId]` (where iterating IDs reveals content), the new URL is `/practice/s/[sessionId]/[position]`. The server maps `(sessionId, position) → questionId` via the `practice_sessions` table, scoped to the authenticated user. URL manipulation reveals nothing. Starting a real session is rate-limited and audited. An attacker would have to start a real session and burn their rate-limit budget to scrape even a handful of questions.

- **Server-side session state.** Replace every `practice_session_*` localStorage entry with rows in `practice_sessions` (session id, owner, question list, current position, timers, draft answers, TTL). The client only knows its session id. This kills the localStorage quota-crash class of bugs as a side effect, and it removes the "scrape from DevTools > Application > Local Storage" attack surface entirely.

- **Per-endpoint rate limiting.** Upstash Redis (free tier covers our first ~100k users) fronts `/api/questions/*`, `/api/practice-tests/*`, `/api/sessions/*`, and the ACT equivalents. Normal students don't issue 60 requests per minute; scrapers do. Tiered response: soft throttle → hard throttle → role-specific lockout → Sentry alert. Rate-limit thresholds are calibrated against the 99.9th-percentile of observed real-student cadence from production logs, with a 10x headroom.

- **Behavioral scraper detection.** A small `lib/api/scraperSignals.js` helper watches per-session request cadence. A real student spends 30–180 seconds per question and interacts with the page (option selection, rationale view, Desmos, keyboard events). A scraper issues sequential requests with millisecond spacing and no DOM interaction. Unambiguous patterns escalate to a lockout. The helper starts in shadow mode (logs only, no blocks) for a week before enforcement, to rule out false positives against edge cases like keyboard-driven power users.

- **Per-user HTML watermarking.** A `lib/content/watermark.js` helper injects a zero-width character pattern derived from `user_id` into rendered question HTML. The pattern is invisible to normal rendering, preserved across copy-paste, and decodable from any leaked text. If question content appears publicly — a dumped Discord channel, a sold answer key, a public GitHub repo — we can trace the source account. Cheap to implement and a meaningful deterrent against insider leaks by students, tutors, or compromised sessions.

- **Server-gated rationale delivery.** `/api/questions/[id]/rationale` checks that an `attempts` row exists for the current user and question before returning the explanation. No client-side flag can bypass this check. The same rule applies to the ACT rationale endpoint.

- **Metadata stays visible to students.** Concept tags, difficulty, score band, domain, and skill are part of the honest student experience and the filter UI. The rate limiter, session gating, server rendering, and watermarking carry the anti-scrape load — metadata visibility is unrelated to that threat.

None of these is disruptive to real users. They all land in the `(next)` tree and stay dark until a cohort is flipped over. The shadow-mode phase for scraper detection and rate limiting means we observe without enforcing for long enough to calibrate against real traffic.

### 3.8 Unified visibility model

The current RLS implementation re-derives "can this user see this row" independently on every user-owned table. `teacher_can_view_student()` is called from seven migration files; manager visibility has needed three separate `fix_manager_*_visibility.sql` patches to chase drift; the cross-tier `manager → teacher → student` path is implemented differently in each policy that needs it.

This is unnecessary. Every supervisory relationship is structurally the same: a parent tier can see its direct children AND everything its children can see. The whole thing collapses into one SQL function.

**`can_view(target_user_id)` — one function, one source of truth:**

```sql
create or replace function public.can_view(target uuid)
  returns boolean
  language sql
  stable
  security definer
as $$
  select
    auth.uid() = target                              -- self
    or is_admin()                                    -- admin sees all
    or exists (                                      -- tutor → student
      select 1 from teacher_student_assignments
      where teacher_id = auth.uid() and student_id = target
    )
    or exists (                                      -- manager → tutor
      select 1 from manager_teacher_assignments
      where manager_id = auth.uid() and teacher_id = target
    )
    or exists (                                      -- manager → student via tutor
      select 1
      from manager_teacher_assignments mta
      join teacher_student_assignments tsa using (teacher_id)
      where mta.manager_id = auth.uid() and tsa.student_id = target
    );
$$;
```

Every RLS policy on user-owned data — SAT and ACT — collapses to a one-liner:

```sql
create policy visible_rows on attempts                  for select using (can_view(user_id));
create policy visible_rows on lesson_progress           for select using (can_view(user_id));
create policy visible_rows on question_assignment_students
                                                        for select using (can_view(student_id));
create policy visible_rows on practice_test_attempts    for select using (can_view(user_id));
create policy visible_rows on act_attempts              for select using (can_view(user_id));
create policy visible_rows on act_assignment_students   for select using (can_view(student_id));
-- ...and so on for every table where a row belongs to a user
```

**Consequences:**

1. **One place to change the hierarchy.** Adding a district-admin tier above manager means editing `can_view` once. Every policy inherits the change automatically. No hunt through migrations. No repeat of the three `fix_manager_*_visibility` incidents.
2. **Manager visibility stops drifting.** The three existing fix migrations exist precisely because manager→student was re-derived per table. With `can_view`, there is nowhere for drift to hide.
3. **Tutor training requires no extra plumbing.** The `/tutor/training` page queries `attempts where user_id = auth.uid()`, which passes `can_view` via the self clause. The same RLS policy that protects students' attempts protects tutors' training attempts. Tutors never see their own training rows in their "my students" view because that query filters by `user_id in (list_visible_users('student'))`, not by `can_view` alone. Role is the filter; `can_view` is the gate.
4. **Companion helper `list_visible_users(role_filter)`** returns the set of ids the current user can see, optionally filtered to a specific role (e.g. `'student'` for the tutor's student list, `'teacher'` for the manager's tutor list). Drives every list-my-people page with a single query.
5. **Cross-test aggregation is trivial.** The `user_activity_rollup` view from §3.3 queries SAT and ACT tables under RLS and unions the results. A manager's dashboard sees the aggregate of everyone `can_view` allows, across both test types, in one SELECT.

**Closure table — defer.** If a manager ever ends up with tens of thousands of transitively-visible students, we materialize a `user_visibility (viewer_id, target_id)` closure table maintained by triggers and redirect `can_view` to read from it. Not needed at current scale; the direct-query implementation handles thousands per manager comfortably.

**Audit back-test.** Before any RLS policy is rewritten to use `can_view`, a one-off script runs during Phase 1 that compares the result of `can_view(x)` against the current helper-function decisions for every (viewer, target) pair that exists in production. Zero diffs is the precondition for switching the policies over in Phase 2. This is a read-only check and does not touch production RLS.

---

## 4. Migration Plan

Six phases, each independently shippable, each producing visible improvement. Nothing before Phase 6 changes what a production user sees without a deliberate `ui_version` flip. Nothing in this plan requires pausing feature work or taking the site down.

**Parallel-build discipline (applies to every phase).** Per §3.6, all new code from Phase 1 onward lands in `app/(next)/` and in new database tables/columns. Legacy routes and legacy tables stay untouched until Phase 6. Phases 2–5 read "refactor" as "write the `(next)` version alongside the existing one", not "edit the existing one in place". Playwright runs both trees on every PR. The `feature_flags.force_ui_version` kill switch is the single-statement rollback path at every step.

### Phase 0 — Questions V2 Completion (prerequisite)

Not part of this rebuild, but must land first. The last few v1→v2 batches finish, every route that reads v1 is switched to v2, and the legacy tables stop receiving writes. Only after this is the rest of the plan safe to begin.

### Phase 1 — Foundation (no visible product change)

**Goal:** put the scaffolding in place so the later phases have somewhere to land.

1. **Commit the missing schema to migrations.** Write `create_practice_tests_schema.sql` that defines all seven `practice_test_*` tables exactly as they exist in production. Write `create_get_question_neighbors_rpc.sql`. Replay-from-scratch test: can you rebuild prod schema from `supabase/migrations/` alone?
2. **Normalize migration filenames** to the Supabase CLI's timestamped convention via a one-time rename script.
3. **Add `supabase/config.toml`** so `supabase db push` and `supabase db reset` work. Document both in a new `docs/database.md`.
4. **Set up the dev Supabase project.** Apply all migrations. This becomes the staging environment the rest of the plan tests against.
5. **Add `tsconfig.json`** with `allowJs: true` so JS files keep working but new TS files are allowed.
6. **Add a `.github/workflows/ci.yml`** that runs lint + build on every PR.
7. **Wire up Sentry (or equivalent)** on both server and client. Every API route gets a catch-all wrapper that forwards to Sentry.
8. **Write the four shared helpers** in `lib/api/`: `auth.js`, `response.js`, `paginate.js`, `logger.js`. Plus `lib/stripe.js` and `lib/anthropic.js` as the canonical lazy-init SDK getters.
9. **Stand up the parallel-build machinery** from §3.6. Create the empty `app/(next)/` route tree. Add the `profiles.ui_version` column (default `legacy`). Create the `feature_flags` table and seed the `force_ui_version` row (initially `legacy` because the next tree is empty). Write the middleware that consults both flags and rewrites the URL. Add a one-screen `/admin/feature-flags` panel (in the legacy tree, admin-only) for flipping the kill switch without touching SQL.
10. **Create the `practice_sessions` server-state table** from §3.7, dormant. Columns: `id`, `user_id`, `test_type`, `question_ids jsonb`, `current_position int`, `draft_answers jsonb`, `created_at`, `expires_at`. RLS: `user_id = auth.uid()`. Nothing reads or writes it yet; this is forward-wiring.
11. **Write the content-protection helpers** as pure modules: `lib/api/rateLimit.js` (Upstash Redis wrapper), `lib/api/scraperSignals.js` (per-session cadence tracker, shadow mode only), `lib/content/watermark.js` (zero-width-character injector keyed by user id). All three are unused at the end of Phase 1; they're ready to be imported in Phase 2.
12. **Write the `can_view(target)` SQL function and `list_visible_users(role_filter)` companion** from §3.8 as new migrations. Do not wire any existing policy to them yet. Run the audit back-test: a one-off script that enumerates every (viewer, target) pair in production and confirms `can_view(target)` returns the same answer as the current helper stack. The script runs against the dev Supabase project (which is seeded from prod). Zero diffs is the precondition for Phase 2's RLS rewrites.
13. **Extend the Playwright suite (initial)** to run each test twice: once against `app/` (legacy, via middleware override) and once against `app/(next)/` (which is still a stub, so the next-tree pass is expected to fail with "route not found" for most suites until Phase 2 fills it in). This establishes the dual-tree CI pattern before the `(next)` tree has any content to test.

**Exit criteria:** Fresh database rebuildable from migrations. CI blocks broken PRs on both trees. Errors show up in Sentry. The helpers exist but aren't used yet. The parallel-build infrastructure is live but dark — `force_ui_version='legacy'`, `(next)` tree is an empty shell, and no production user reaches a single line of new code. Flipping an internal account to `ui_version='next'` returns a placeholder page and nothing else. Everything is ready for Phase 2 to start writing the new tree's contents.

### Phase 2 — Backend consolidation

**Goal:** eliminate the auth-pattern and response-shape drift.

1. **Refactor every API route** to use `requireUser()` / `requireRole()` / `requireServiceRole()` from §3.3. Batch by route tree (`/api/admin/*`, `/api/teacher/*`, `/api/practice-tests/*`, etc.). Each batch is a PR.
2. **Standardize response envelopes** via `ok()` / `fail()`. Update the few client fetch sites that care about the shape (most can stay on `json.error` fallback during the transition).
3. **Replace every `.limit(N)` with `paginate(...)`.** The grep pattern is one-line; the refactor is mechanical; the payoff is permanent immunity to the db-max-rows class of bugs.
4. **Collapse duplicate routes.** `/api/dashboard/stats` merges into `/api/dashboard`. `/api/act/*` becomes query-parameterized on `/api/*`. Delete the orphaned duplicates.
5. **Audit every `createServiceClient()` call.** For each: either (a) document the reason in a comment and wrap via `requireServiceRole('reason')`, or (b) convert to an RLS-scoped client if the role check is sufficient. Target: cut service-role usage in half.
6. **Fix the RLS drift.** Rewrite every policy that still does `exists (select 1 from profiles)` to use the JWT-based helpers. Add migrations for the tables where RLS was enabled-without-policies (`question_availability`) or is missing entirely.

**Exit criteria:** Zero inline role checks. Zero `setItem`-style unbounded writes. One auth code path. The platform-stats bug class is structurally impossible.

### Phase 3 — Schema simplification

**Goal:** normalize the core data model now that the server layer is clean.

1. **Drop the v1 question tables** (`questions`, `question_versions`, `answer_options`, `correct_answers`, `question_taxonomy`). Archive to a `_legacy` schema for 90 days, then drop. `question_id_map` stays for attempts referencing old IDs.
2. **Normalize `questions_v2.options`** into a `question_options` child table. Migrate the JSONB payload into rows. Update `question_concept_tags` and `option_answer_choice_tags` to FK the new table.
3. **Unify the SAT assignment model** per §3.2. One `assignments` + `assignment_students` pair replacing `question_assignments` + `question_assignment_students` + `lesson_assignments` + `lesson_assignment_students` on the SAT side. Dual-write during the transition; the legacy tree reads the old shape, the `(next)` tree reads the new one. **ACT gets its own `act_assignments` + `act_assignment_students` pair** — new tables, not a rename of anything existing, because today ACT has no dedicated assignment system. The ACT assignment model is passage-based and distinct.
4. **Standardize audit columns.** Every table gets `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`. Soft-delete becomes the default. RLS policies on every table add `deleted_at IS NULL` filter.
5. **Delete or implement `question_availability`.** My bet is delete.
6. **Add the missing indexes** for common RLS join patterns (`teacher_student_assignments (teacher_id, student_id)`, `lesson_assignments (student_id)`, etc.).

**Exit criteria:** Schema is fully replayable and fully documented. No "mystery tables". Soft-delete everywhere. Every join hits an index.

### Phase 4 — Frontend simplification

**Goal:** shrink the frontend's surface area and consolidate data flow.

1. **Build the shared component primitives** from §3.4: `<Button>`, `<Card>`, `<Modal>`, `<Table>`, `<Pagination>`, `<Avatar>`, `<ScoreCard>`, `<DomainMasteryBar>`. Each is a few dozen lines; most replace dozens of inline instances.
2. **Build `<QuestionRenderer>`** and migrate the three question pages onto it one at a time. Start with `/teacher/review/[questionId]` because it's the smallest and has the fewest side effects. `/practice/[questionId]` comes last because it's the most complex and most production-critical.
3. **Convert pages to server components for initial data.** Start with the static-ish ones: `/dashboard`, `/teachers`, `/admin`, `/practice-test`. Each conversion eliminates 3-5 `useEffect+fetch` blocks and typically shrinks the file by 30%.
4. **Replace localStorage caches with server-side session state.** The `practice_session_*` and `teacher_review_session_*` caches come out; per §3.7, session progress lives in the `practice_sessions` server table and the URL only carries an opaque `sessionId` + `position`. The client never caches question content or metadata locally. The recent `lib/practiceSessionStorage.js` LRU helper can be deleted once nothing writes to those keys.
5. **Decompose the 7 files over 1,000 lines.** The target is: every file under 500 lines unless there's an explicit reason. The usual split is extracting tab panels, widget cards, and modals into their own files.
6. **Add error boundaries** (`error.js`) for every top-level route segment per §3.4.

**Exit criteria:** No file over 1,000 lines. Three question renderers become one. 79 `useEffect+fetch` blocks become fewer than 20. Every top-level route has a recovery path.

### Phase 5 — Hardening & polish

**Goal:** lock in the gains and make the platform confidently operable.

1. **Write the four integration tests** from §3.5. Wire them into CI.
2. **Begin the TypeScript conversion.** `lib/` first (pure functions, mechanical), then `components/` primitives (typed props), then routes. This is a long-running background task — no specific deadline — but every new file after Phase 5 begins should be TS.
3. **Extract design tokens** from `globals.css`. Shrink the global CSS to something reasonable.
4. **Audit observability.** Verify that every bug we've hit in the last six months would now produce a Sentry alert, a structured log, or a failed CI run. If not, add the missing instrumentation.
5. **Publish a runbook.** Short `docs/runbook.md` covering: how to apply a migration, how to roll back a deploy, how to find out why a student is seeing an error, how to bypass RLS safely in a one-off script, how to seed a dev database. The stuff that's currently tribal knowledge.

**Exit criteria:** A new developer can find any bug in under 10 minutes by following the runbook. Deploys are boring. Feature work happens on top of a stable base.

### Phase 6 — Decommission

**Goal:** retire the legacy tree, collect on the simplifications the rebuild has been carrying dual costs for, and turn the plan from "an in-progress migration" into "the platform".

**Precondition:** 100% of production users on `ui_version='next'` for at least 30 consecutive days with no reported regressions. `feature_flags.force_ui_version = 'next'` for a verification window of 7 days, during which the legacy tree is unreachable even via direct URL. Playwright dual-tree CI has been green for the full window.

1. **Delete `app/(legacy)/` and the old route files.** Every page under `app/practice`, `app/act-practice`, `app/teacher/...` (except any route that has no `(next)` replacement and is genuinely still used), `app/dashboard` (legacy version), and the rest of the legacy tree. Cross-reference `(next)` before each delete to confirm nothing unique is being lost.
2. **Remove dual-write triggers** from the tables that were being fed from both trees during the parallel period.
3. **Archive the v1 question tables and legacy SAT assignment tables** (`questions`, `question_versions`, `answer_options`, `correct_answers`, `question_taxonomy`, `question_assignments`, `question_assignment_students`) to a `_legacy` schema. Keep for 90 days, then drop.
4. **Drop the `sat_teacher_mode` and `studyworks_test_type` localStorage keys** with a one-time cleanup snippet served on the next login for any lingering browser state.
5. **Remove `profiles.ui_version`** and the `feature_flags.force_ui_version` row. Everyone is on `next` by definition; the flag is dead weight. Keep the `feature_flags` table itself — it's useful infrastructure for future rollouts.
6. **Remove the Playwright dual-tree CI pattern.** Tests now run once against the single tree.
7. **Final cleanup pass.** Re-run the "files over 1000 lines", "routes with inline role checks", "`fetch+useEffect` blocks", "distinct localStorage prefixes", and "parallel question renderers" counts from §2. Every number should match the targets in §6.

**Exit criteria:** No legacy code path anywhere. Schema is single-source. Every metric in §6 hits target. The rebuild is finished. Future development is net-new feature work on a stable base, not structural debt repayment.

---

## 5. What Stays the Same

- **Next.js App Router + Supabase.** Both are fine. The problems are architectural, not framework-level. Swapping runtimes would destroy schedule for no benefit.
- **React 18 + server components.** Currently underused, not misused.
- **Stripe for billing.** The integration itself is fine once the lazy-init pattern is enforced.
- **The feature set.** Every feature stays. This is a rebuild of _how_, not _what_.
- **The `questions_v2` schema as the canonical question model.** Phase 0 finishes the migration; everything after assumes v2.
- **Supabase RLS as the primary access-control layer.** The rebuild strengthens RLS, doesn't replace it.
- **MathJax + KaTeX + Desmos.** They work. They stay.

---

## 6. What Has to Change

| Item | Current | Target |
|---|---|---|
| Auth patterns in API routes | 5+ | 1 |
| Inline role checks | ~51 | 0 |
| Bare `fetch+useEffect` | ~79 | <20 |
| Distinct localStorage key prefixes | 16 | 1 (just `{qid}_elapsed`) |
| Client-side test-type toggles (`studyworks_test_type`) | 1 | 0 (dedicated `/act/*` path tree) |
| Client-side teacher-mode toggles (`sat_teacher_mode`) | 1 | 0 (role + URL determine mode) |
| Files over 1,000 lines | 7 | 0 |
| Error boundaries | 1 | 6+ |
| Question renderer implementations | 3 | 1 (shared across SAT + ACT) |
| SAT assignment system tables | 4 | 2 (`assignments` + `assignment_students`) |
| ACT assignment system tables | 0 (today ACT has no dedicated assignments) | 2 (`act_assignments` + `act_assignment_students`, passage-based) |
| Question schemas in use | 2 | 1 (SAT `questions_v2`, separate ACT `act_questions_v2`) |
| Schemas missing from migrations | 2 (practice_test_*, get_question_neighbors) | 0 |
| Places in RLS where hierarchy visibility is re-derived | 7+ | 1 (`can_view()`) |
| RLS policies that query `profiles` directly | many | 0 |
| Content endpoints with rate limiting | 0 | all (SAT + ACT) |
| Watermarked rendered question HTML | no | yes (per user) |
| Server-side practice session state | no (localStorage only) | yes (`practice_sessions` table) |
| Parallel-build / rollback infrastructure | none | `ui_version` + `feature_flags` kill switch |
| Shared UI primitives | ~6 | ~12 |
| CI pipeline | none | one, dual-tree until Phase 6 |
| Error monitoring | none | Sentry (or equivalent) |
| Automated tests | 0 | ~5 integration + growing unit |
| Dev environment | ad-hoc | documented `supabase db reset` |
| Typescript coverage | 0% | steadily growing, starting with `lib/` |

---

## 7. Risks & Tradeoffs

**Risk: the rebuild takes longer than expected and feature work stalls.**
Mitigation: every phase is independently shippable. Phase 1 alone (foundation) takes a few days and produces immediately visible gains (CI, Sentry, rebuildable schema). Phase 2 can be done route tree by route tree, interleaved with feature work. At no point does the plan require a feature freeze.

**Risk: phase 3 (schema simplification) causes data loss.**
Mitigation: archive rather than drop. Every phase-3 step writes data to a `_legacy` schema first and keeps it for 90 days. The actual drops happen at the _end_ of phase 3 only if everything downstream is confirmed working. Soft-delete becomes the default, so there's no irrecoverable delete pattern anywhere after phase 3 completes.

**Risk: the `<QuestionRenderer>` unification breaks a rare code path.**
Mitigation: the three current implementations have visible drift. Unify by building the new component, then migrate pages one-at-a-time behind a feature flag, not all at once. The rollout order (`/teacher/review` → `/act-practice` → `/practice`) is deliberately low-to-high risk.

**Risk: TypeScript conversion eats developer time without visible user-facing improvement.**
Mitigation: it's explicitly background work. New files are TS, old files stay JS, there's no hard deadline. The gains compound over months, not weeks.

**Risk: the rebuild over-engineers and introduces abstractions that aren't justified.**
Mitigation: every helper in §3.3/§3.4 replaces a measured number of existing instances. `paginate()` replaces ~100 `.limit()` calls; `<Button>` replaces ~30 inline implementations. If a proposed helper has fewer than ~5 callers, don't build it. Three similar call sites is better than a premature abstraction.

**Risk: Sentry (or the chosen error-monitoring vendor) becomes a cost center at 1000+ users.**
Mitigation: Sentry's free tier covers thousands of events per month, which is enough for the first year. If volume outgrows the free tier, the cost at that point is a known quantity and can be budgeted against the value it's delivering. Alternatively, a self-hosted option (Glitchtip, self-hosted Sentry) is available if cost ever becomes prohibitive.

**Risk: RLS hardening breaks a student-facing query mid-production.**
Mitigation: every RLS change in phase 2 lands first on the dev Supabase project from phase 1, gets exercised by the four integration tests, then promotes to production. No RLS change is deployed blind. The `can_view()` rewrite specifically is gated on the Phase 1 back-test script returning zero diffs against the current helper stack.

**Risk: Carrying dual code paths in Phases 2–5 slows down feature work.**
Mitigation: new features after Phase 1 land only in the `(next)` tree by default. If a feature must also ship to `legacy` users mid-rebuild, it's authored once in a shared module and imported from both trees — but the default is next-only, on the theory that legacy's days are numbered and the cost of back-porting usually exceeds the value of serving it to a shrinking user pool. Feature owners are encouraged to push the launch into the next cohort's flip window rather than dual-write.

**Risk: The `(next)` tree ships with subtle regressions that aren't caught until a cohort is flipped.**
Mitigation: the Playwright suite runs against both trees on every PR from Phase 1 onward. The rollout sequence starts with 2–3 internal accounts for at least a week before any external user sees the new tree, then opt-in tutors, then a small beta cohort of friendly students, and only then broader rollout. Every flip is reversible via the `feature_flags.force_ui_version` kill switch in under a minute.

**Risk: Content protection (rate limiter, scraper detection) accidentally locks out real students.**
Mitigation: rate-limit thresholds are set based on the observed 99.9th-percentile student request cadence in production logs, with a 10x headroom. The scraper-detection helper runs in shadow mode (logs only, no blocks) for a week before enforcement — the first sign of over-triggering is visible in the logs before any student is inconvenienced. Every lockout fires a Sentry alert, not a silent block. Support has a one-click unlock path for any false-positive case that slips through.

**Risk: Watermarking rendered HTML breaks screen readers or copy-paste for legitimate accessibility use.**
Mitigation: the zero-width character pattern is inserted only in non-semantic positions (between tags, inside whitespace runs, never inside `alt` text, `aria-label`, or any screen-reader-visible attribute). A separate accessibility audit runs against the watermarked output in the Playwright suite before watermarking ships to any cohort. If a conflict surfaces, watermarking is disabled per-page via a feature flag rather than ripped out wholesale.

**Risk: The full parallel ACT tree doubles the frontend surface area.**
Mitigation: the trees share everything they can — shared UI primitives (`<Button>`, `<Card>`, `<QuestionRenderer>`), shared helper modules (`requireRole`, `paginate`, `useApi`), and shared design tokens — so the duplication is limited to navigation, routing, and the handful of places where SAT and ACT genuinely differ (module routing, adaptive logic, scoring conversion). The duplication is the right trade-off for content/format independence: a bug in ACT assignment routing can never regress SAT practice, and vice versa.

---

## Appendix A: Top 10 "if we do nothing" failure modes

If this rebuild doesn't happen, these are the bugs and incidents I'd expect at increasing user counts:

1. **More silent query truncation** as tables grow past 1,000 rows in active windows. We fixed Practice Volume; the next victim is probably admin teacher stats or the leaderboard-style queries.
2. **localStorage quota crashes on more key prefixes.** We fixed `practice_session_*`; the next one is probably `teacher_review_session_*` or the `{qid}_elapsed` timer state.
3. **Regressions from "which of the 3 question renderers did I update?"** We already hit this with the Flashcards button and the AnswerChoiceTags integration.
4. **Dashboard crashes with generic "Application error"** on pages without an error boundary. We patched `/dashboard`; the next student report will be from `/practice-test/attempt/[id]` or `/teacher`.
5. **RLS recursion on a new role or a new policy.** Four existing `fix_*_rls_*` migrations are evidence; the fifth is coming.
6. **Auth gate bypass** via a new `/api/admin/*` route that forgets the inline role check. 51 duplicated checks means one of them will eventually be forgotten.
7. **Schema drift** — something else added to production outside of migrations, joining the practice-test tables and `get_question_neighbors`.
8. **Cross-feature breakage** when someone edits `AdminDashboard.js` and accidentally changes something in an unrelated tab because the file is 2,366 lines.
9. **Slow cold-start on Vercel** as client bundles accumulate (Desmos + jsPDF + KaTeX + MathJax loaded eagerly on the practice page).
10. **An outage caused by a bug that no one has a stack trace for**, because there's no error monitoring and no structured logging to find it after the fact.

Every item on this list is structurally fixable by the plan. None of them is fixable without it.

---

## Appendix B: Out of scope for this plan

A few things I intentionally didn't propose, because the value isn't obvious at current scale:

- **Microservices.** Monolith-in-Next.js is fine at thousands of users. Split only if a specific service starts getting in the way.
- **A redesign of the student-facing UI.** The architecture plan is about structure, not aesthetics. A visual refresh is a separate project.
- **A different database.** Postgres on Supabase is fine. The schema is the problem, not the engine.
- **Server-side caching layers (Redis, etc.).** Defer until there's a measured hot path that actually needs one.
- **A queue system for background jobs.** Defer; the current Anthropic Batches flow for question cleanup is an example that demonstrates we already have a queue available when we need one (Anthropic's).
- **A new auth provider.** Supabase Auth is fine.

---

## Appendix C: Ordered TODO checklist

A single, chronologically-ordered to-do list for the whole plan, for reference once work starts.

```
Phase 0 — Prerequisites (not part of this plan)
  [ ] Finish questions_v2 migration; stop writing to v1

Phase 1 — Foundation
  [ ] Write create_practice_tests_schema.sql from live prod
  [ ] Write create_get_question_neighbors_rpc.sql from live prod
  [ ] Delete or document question_availability
  [ ] Rename migrations to Supabase CLI timestamp format
  [ ] Add supabase/config.toml
  [ ] Stand up dev Supabase project from migrations
  [ ] Add tsconfig.json with allowJs
  [ ] Add .github/workflows/ci.yml (lint + build + node --check scripts)
  [ ] Wire up Sentry on server + client
  [ ] Write lib/api/auth.js (requireUser, requireRole, requireServiceRole)
  [ ] Write lib/api/response.js (ok, fail)
  [ ] Write lib/api/paginate.js (paginate, countExact)
  [ ] Write lib/api/logger.js (structured logs with request id)
  [ ] Write lib/stripe.js, lib/anthropic.js (lazy getters)
  [ ] Commit docs/database.md and docs/runbook.md (initial draft)
  [ ] Create empty app/(next)/ route tree
  [ ] Add profiles.ui_version column (default 'legacy')
  [ ] Create feature_flags table + seed force_ui_version row ('legacy')
  [ ] Write middleware that consults feature_flags then profiles.ui_version
  [ ] Add /admin/feature-flags panel (legacy tree, admin only)
  [ ] Create practice_sessions server-state table (dormant)
  [ ] Write lib/api/rateLimit.js (Upstash wrapper, not yet called)
  [ ] Write lib/api/scraperSignals.js (shadow mode only, not yet called)
  [ ] Write lib/content/watermark.js (zero-width injector, not yet called)
  [ ] Write can_view(target) SQL function + list_visible_users(role) helper
  [ ] Run can_view back-test script against prod snapshot; require zero diffs
  [ ] Extend Playwright harness to dual-tree mode (legacy + next)

Phase 2 — Backend consolidation
  [ ] Refactor /api/admin/* to use auth helpers
  [ ] Refactor /api/teacher/* to use auth helpers
  [ ] Refactor /api/practice-tests/* to use auth helpers
  [ ] Refactor /api/billing/* to use auth helpers
  [ ] Refactor remaining routes (batched by tree)
  [ ] Replace every .limit(N) with paginate()
  [ ] Collapse /api/dashboard/stats into /api/dashboard
  [ ] Parameterize /api/questions to handle SAT + ACT
  [ ] Delete /api/act/questions, /api/act/dashboard
  [ ] Audit every createServiceClient() call; document or remove
  [ ] Rewrite every RLS policy that queries profiles directly
  [ ] Write missing RLS policies for question_availability or drop it

Phase 3 — Schema simplification
  [ ] Normalize questions_v2.options into question_options child table
  [ ] Unify assignments into one table + one junction
  [ ] Data-migrate existing assignments
  [ ] Add audit columns (created_by, updated_by, deleted_at) to every table
  [ ] Add deleted_at IS NULL to every RLS select policy
  [ ] Add missing indexes per audit
  [ ] Archive v1 question tables to _legacy schema
  [ ] Drop _legacy schema after 90 days of stability

Phase 4 — Frontend simplification
  [ ] Build <Button>, <Card>, <Modal>, <Table>, <Pagination>, <Avatar>
  [ ] Build <ScoreCard>, <DomainMasteryBar>
  [ ] Build <QuestionRenderer>, migrate /teacher/review onto it
  [ ] Migrate /act-practice onto <QuestionRenderer>
  [ ] Migrate /practice onto <QuestionRenderer>
  [ ] Convert /dashboard to server component for initial data
  [ ] Convert /teachers to server component
  [ ] Convert /admin to server component
  [ ] Convert /practice-test to server component
  [ ] Replace practice_session_* localStorage with URL state
  [ ] Decompose AdminDashboard.js into per-tab files
  [ ] Decompose teacher/shared.js into focused components
  [ ] Decompose the results page
  [ ] Add error boundaries for /practice, /practice-test, /review, /teacher, /admin, /features
  [ ] Delete lib/practiceSessionStorage.js once unused

Phase 5 — Hardening
  [ ] Write 4-5 Playwright integration tests
  [ ] Wire tests into CI as a required check
  [ ] Convert lib/ to TypeScript
  [ ] Convert shared components to TypeScript
  [ ] Extract design tokens from globals.css
  [ ] Shrink globals.css to <1000 lines
  [ ] Audit observability — does every past incident produce a signal now?
  [ ] Final runbook in docs/runbook.md
  [ ] Retrospective: what didn't we need?

Phase 6 — Decommission
  [ ] Verify 100% of users on ui_version='next' for 30+ days
  [ ] Force feature_flags.force_ui_version='next' for 7-day window
  [ ] Delete app/(legacy) route files (everything under old paths with a next equivalent)
  [ ] Remove dual-write triggers from replaced tables
  [ ] Archive v1 question tables + legacy SAT assignment tables to _legacy schema
  [ ] Drop _legacy schema after 90 days of stability
  [ ] Cleanup snippet to clear sat_teacher_mode / studyworks_test_type from lingering browsers
  [ ] Drop profiles.ui_version column
  [ ] Drop feature_flags.force_ui_version row (keep the table itself)
  [ ] Remove Playwright dual-tree mode; tests run once against the single tree
  [ ] Re-run §2 audit metrics; verify every §6 target is hit
```




