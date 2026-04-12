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

The rebuild is not a big-bang rewrite. It's five phases, each independently shippable, each producing immediately visible improvements. Total duration depends on velocity, but none of the phases require taking the site down or pausing feature work.

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
- **Unify the assignment model** into one `assignments` table with a polymorphic `target_type` (`question_set` | `lesson` | `practice_test`) and a single `assignment_students` junction. Drop the four current assignment tables. This removes about 30% of the teacher-route complexity.
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

Test-type (SAT vs ACT) becomes a query parameter on `/api/questions` and `/api/practice-tests` rather than a parallel `/api/act/*` tree. One set of handlers, one set of bug fixes, no more drift.

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

**URL-driven state, not localStorage-driven.** The `practice_session_*`, `teacher_review_session_*`, `act_session_*` localStorage caches all exist to compensate for a frontend that doesn't have server-rendered pagination. Once pages fetch from the server with real pagination (via the `paginate()` helper), the session state is just URL params — and URL params survive reloads, share cleanly, and don't accumulate until they bust a storage quota. The shared `<QuestionRenderer>` gets `prev`/`next` links from the server, not from JS-parsing a localStorage CSV.

The only legitimate uses of localStorage in the rebuild:

- `studyworks_test_type` — user UI preference (SAT vs ACT tab)
- `sat_teacher_mode` — user UI preference (teacher toggle)
- Small per-question timer state for mid-session recovery (`{qid}_elapsed`) — and even this could move to session storage or the URL hash

Everything else goes away.

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

---

## 4. Migration Plan

Five phases, each independently shippable, each producing visible improvement. Nothing in this plan requires pausing feature work or taking the site down.

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

**Exit criteria:** Fresh database rebuildable from migrations. CI blocks broken PRs. Errors show up in Sentry. The helpers exist but aren't used yet.

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
3. **Unify the assignment model.** One `assignments` + `assignment_students` replacing `question_assignments` + `question_assignment_students` + `lesson_assignments` + `lesson_assignment_students`. Data-migrate existing rows. Update the teacher UI to point at the unified routes.
4. **Standardize audit columns.** Every table gets `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`. Soft-delete becomes the default. RLS policies on every table add `deleted_at IS NULL` filter.
5. **Delete or implement `question_availability`.** My bet is delete.
6. **Add the missing indexes** for common RLS join patterns (`teacher_student_assignments (teacher_id, student_id)`, `lesson_assignments (student_id)`, etc.).

**Exit criteria:** Schema is fully replayable and fully documented. No "mystery tables". Soft-delete everywhere. Every join hits an index.

### Phase 4 — Frontend simplification

**Goal:** shrink the frontend's surface area and consolidate data flow.

1. **Build the shared component primitives** from §3.4: `<Button>`, `<Card>`, `<Modal>`, `<Table>`, `<Pagination>`, `<Avatar>`, `<ScoreCard>`, `<DomainMasteryBar>`. Each is a few dozen lines; most replace dozens of inline instances.
2. **Build `<QuestionRenderer>`** and migrate the three question pages onto it one at a time. Start with `/teacher/review/[questionId]` because it's the smallest and has the fewest side effects. `/practice/[questionId]` comes last because it's the most complex and most production-critical.
3. **Convert pages to server components for initial data.** Start with the static-ish ones: `/dashboard`, `/teachers`, `/admin`, `/practice-test`. Each conversion eliminates 3-5 `useEffect+fetch` blocks and typically shrinks the file by 30%.
4. **Replace localStorage caches with URL state.** The `practice_session_*` and `teacher_review_session_*` caches come out; session progress is in the URL, fetched from the server per-question. The recent `lib/practiceSessionStorage.js` LRU helper can be deleted once nothing writes to those keys.
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
| Distinct localStorage key prefixes | 16 | ~3 |
| Files over 1,000 lines | 7 | 0 |
| Error boundaries | 1 | 6+ |
| Question renderer implementations | 3 | 1 |
| Assignment system tables | 4 | 2 |
| Question schemas in use | 2 | 1 |
| Schemas missing from migrations | 2 (practice_test_*, get_question_neighbors) | 0 |
| RLS policies that query `profiles` directly | many | 0 |
| Shared UI primitives | ~6 | ~12 |
| CI pipeline | none | one |
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
Mitigation: every RLS change in phase 2 lands first on the dev Supabase project from phase 1, gets exercised by the four integration tests, then promotes to production. No RLS change is deployed blind.

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
```




