# SAT/ACT Practice & Learning Platform — Greenfield Build Plan

_A self-contained implementation plan for building the platform from an empty
repository and a fresh database. Hand this entire document to a new session._

---

## 0. How to use this document

You are building a SAT/ACT practice and learning web application from scratch.
This document is the authoritative plan. Read sections 1–6 in full before writing
any code; they define the principles, stack, and data model that every phase
depends on. Then execute the phases (section 7) in order. Each phase is
independently shippable and ends with explicit exit criteria — do not start a
phase until the previous one's exit criteria are met.

**Three rules that override convenience at every step:**

1. **The database is defined only by committed migrations.** Nothing exists in
   the database that is not in a timestamped migration file. CI replays the full
   migration set into a throwaway database on every PR and regenerates types from
   it. No SQL is ever applied by hand in a dashboard.
2. **TypeScript is strict from the first file.** Database row types are generated
   from migrations. Inputs are validated with Zod at every boundary.
3. **Two gates protect everything, and each lives in exactly one place.**
   `can_view(target)` answers "can this identity see this data" (authorization).
   `has_plan(uid, min_plan)` answers "is this identity licensed for this feature"
   (entitlement). Every policy and every feature check calls one of these — never
   an inline role or subscription check.

---

## 1. Product summary

A practice and learning platform for the SAT and ACT with four user roles:

- **Student** — self-directed practice from a ~4k-question bank with filtered
  sets; full-length practice tests that replicate the real exam (SAT adaptive
  module routing, ACT linear); detailed performance metrics and improvement
  areas; assignments from a tutor; notes, flashcards, an error log, and focused
  pre-test review; learning content (lessons) paired with practice.
- **Tutor** — sees students' practice sessions, tests, and activity; creates
  assignments and monitors completion; reviews work and presents progress
  metrics; and works questions / takes tests independently for training.
- **Manager** — treats tutors as students (assigns, reviews, monitors them the
  same way a tutor treats a student); sees all data for a tutor's students;
  creates and edits questions and content.
- **Admin** — full platform access and configuration.

**Access model:** most users require a paid subscription; a subset (a sponsor's
own students) use the platform for free. This is built in from Phase 1, not
retrofitted.

---

## 2. Architectural principles

These are load-bearing. Every modeling decision traces back to one of them.

1. **There is one kind of user.** `users` holds everyone. Roles
   (student/tutor/manager/admin) are a column; supervisory relationships are
   edges in a graph. A tutor "training" is a user doing student activities under
   their own id. A manager "treating tutors as students" is the same edge one
   level up. Build this self-similarity in and entire feature categories collapse
   into one implementation.
2. **One atomic fact powers everything: `item_attempts`.** Every metric, error
   log, completion check, mastery estimate, and score prediction is an
   aggregation over a single fact table — one row per answered question,
   regardless of where it was answered.
3. **Questions exist once.** The bank and the practice tests draw from one pool.
   A test is a *structure that references* questions, never a copy.
4. **One taxonomy is the connective tissue.** Questions, lessons, and metrics all
   reference the same skill tags. "Weak skill → lesson that teaches it → practice
   set for it" is a query, not a per-topic feature.
5. **Access control lives in the database (RLS), expressed as one function.** App
   code is the second line of defense, not the first.
6. **Entitlement is separate from role and from billing source.** What you *are*
   (role), what you're *licensed for* (plan), and *how you got it* (Stripe /
   sponsored / trial / seat) are three independent axes.
7. **Server Components render data; client components handle interaction.** No
   `fetch`-in-`useEffect` data pattern is ever introduced. Reads are RSC; writes
   are Server Actions.
8. **Every file has one job.** Pages orchestrate; components render. No file over
   ~500 lines without an explicit reason.

---

## 3. Tech stack

Use the latest stable at build time. Known-good as of June 2026:

| Layer | Choice | Version (min) |
|---|---|---|
| Framework | Next.js (App Router) | 16.2 |
| UI runtime | React | 19.2 |
| Language | TypeScript (strict) | 6.x |
| Database / Auth / RLS / Storage | Postgres via Supabase | current |
| Supabase clients | `@supabase/ssr`, `@supabase/supabase-js` | latest |
| Billing | Stripe (lazy-init) | latest |
| Rate limiting / ephemeral cache | Upstash Redis | latest |
| Error monitoring | Sentry | latest |
| Math rendering | KaTeX (+ MathLive for SPR input), MathML for a11y | latest |
| Graphing calculator | Desmos API | current |
| Rich content | TipTap (lesson/notes authoring) | latest |
| E2E tests | Playwright | latest |
| Hosting | Vercel | — |

**Build tooling:** Turbopack (default in Next 16). React Compiler **on** from day
one (`reactCompiler: true`). `next typegen` for typed route props. ESLint +
Prettier. Node ≥ 20.9.

---

## 4. Latest-capability adoption policy

Adopt these deliberately; they change how specific surfaces are built.

- **React Compiler (stable, built into Next 16)** — auto-memoization. Enable
  immediately; biggest win on `QuestionRenderer` and metrics dashboards.
- **Server Components** — the default for every page's initial data.
- **Server Actions + `useActionState` + `useFormStatus`** — every mutation.
- **`useOptimistic`** — instant feedback on answer submission, flashcard mastery
  toggles, marking complete.
- **`<Activity mode="hidden">` (React 19.2)** — pre-render the next question
  while the student works the current one (instant "Next"); preserve a
  partially-answered question's draft on navigate-away.
- **View Transitions (React 19.2)** — question-to-question and section
  transitions in the runner.
- **`use()` + Suspense streaming** — stream slow dashboard aggregates (mastery,
  score prediction) while the shell renders instantly.
- **`useEffectEvent` (19.2)** — timer/analytics effects without dependency churn.
- **`ref` as a prop** — no `forwardRef` in new components.
- **`next typegen`** — generated `PageProps`/`LayoutProps`/route types.
- **`proxy.js` (Next 16, renamed from middleware, Node runtime)** — for routing
  guards and edge-of-request concerns (e.g. rate-limit pre-checks).

**Deliberately NOT adopted:** Cache Components / PPR. Nearly every page is
per-user dynamic (auth + personalized data); PPR's static-shell model doesn't fit
the workload and adds caching complexity for little gain. Revisit only if a
high-traffic static page surfaces.

---

## 5. The data model

The schema is the architecture. Tables are introduced in the phase that needs
them (section 7), but here is the whole model in one place so the shape is clear
up front. All tables get standard audit columns: `created_at`, `created_by`,
`updated_at` (trigger-maintained), `updated_by`, `deleted_at` (soft delete;
`deleted_at IS NULL` is the default read filter and is baked into RLS).

### 5.1 Identity, hierarchy, entitlement

```
users(id, role, email, display_name, ...)        -- role: student|tutor|manager|admin
accounts(id, kind, name, sponsors_subordinates)  -- optional org/sponsor entity for seat billing
supervision(supervisor_id, subordinate_id, kind) -- kind: tutor_of | manager_of
entitlements(
  id, user_id,
  plan,            -- preview | standard | full
  status,          -- active | trialing | past_due | canceled | expired
  source,          -- stripe | sponsored | trial | org_seat | manual
  granted_by,      -- nullable: sponsoring user/org/account
  stripe_subscription_id,  -- nullable
  starts_at, ends_at
)
accommodations(user_id, extended_time_factor, extra_breaks, ...)  -- test fidelity
```

### 5.2 Question pool & taxonomy

```
tags(id, dimension, value)             -- dimension: domain|skill (SAT), subject|reporting_category (ACT)
questions(id, test_type, kind, current_version_id, ...)  -- kind: mcq | spr | passage_set
question_versions(id, question_id, stimulus, stem, status, ...) -- status: draft|in_review|published; immutable once published
question_options(question_version_id, label, content, is_correct)  -- normalized, not JSON
question_tags(question_id, tag_id)
question_spr_answers(question_version_id, accepted_value, tolerance, format)  -- variant SPR data
```

Immutability rule: an `item_attempts` row references the exact
`question_version_id` the student saw. Editing a published question creates a new
version; existing attempts and their rationales stay valid.

### 5.3 Practice tests (templates over the pool)

```
test_templates(id, test_type, name)
test_sections(template_id, position, scoring_section, time_limit)  -- RW/Math or English/Math/Reading/Science
test_modules(section_id, position, difficulty_tier, time_limit)    -- SAT: M1 + M2-easy + M2-hard; ACT: one module
test_module_questions(module_id, position, question_id)            -- ordering into the shared pool
routing_rules(section_id, from_module_id, raw_min, raw_max, to_module_id)  -- SAT only
score_conversions(test_type, form_key, scoring_section, raw, scaled)        -- seed data
```

### 5.4 The attempts fact table + session containers

```
item_attempts(
  id, user_id, question_id, question_version_id,
  context_type,        -- practice | test | assignment | lesson | review
  context_id,
  selected_option_label, response_text,
  is_correct, time_ms, marked_for_review,
  created_at
)
practice_sessions(id, user_id, test_type, filter_criteria, ordered_question_ids,
                  position, status, expires_at)   -- server-side state; opaque session URLs
test_attempts(id, user_id, template_id, form_key, status, started_at, finished_at,
              composite_score, section_scores)    -- cached scaled scores at finalize
test_module_attempts(test_attempt_id, module_id, raw_score, served_at)  -- the adaptive path taken
```

Indexes: `item_attempts(user_id, question_id)`, `(user_id, created_at)`,
`(question_id)` — the last enables empirical item difficulty (p-values) across
all users.

### 5.5 Metrics & mastery (derived; canonical source is `item_attempts`)

```
user_skill_mastery(user_id, skill_tag_id, estimate, confidence, attempts,
                   correct, avg_time_ms, last_practiced_at)  -- incrementally maintained
item_stats(question_id, p_value, avg_time_ms, distractor_distribution, discrimination)  -- author analytics
```

### 5.6 Assignments (polymorphic)

```
assignments(id, created_by, test_type, target_type, target_ref)  -- target_type: question_set|test|lesson
assignment_students(assignment_id, student_id)
```

Completion is derived: assignment work writes `item_attempts` with
`context_type='assignment'`; complete = every target question has an in-scope
attempt.

### 5.7 Learning content

```
lessons(id, test_type, title, current_version_id, status)
lesson_versions(id, lesson_id, status, ...)             -- immutable once published
lesson_blocks(lesson_version_id, position, kind, content)  -- text|image|video|worked_example|embedded_question|callout
lesson_skills(lesson_id, skill_tag_id)                  -- couples content to taxonomy
lesson_progress(user_id, lesson_id, status, completed_at)
```

### 5.8 Study tools & retention

```
notes(id, user_id, question_id?, body)                  -- private; optionally about a question
question_notes(id, author_id, question_id, body)        -- tutor/manager annotations, visible up the tree
flashcard_sets(id, user_id, name) / flashcards(id, set_id, front, back)
review_schedule(user_id, item_ref, item_kind, due_at, interval, ease)  -- SRS over flashcards + missed items
study_plans(user_id, test_type, target_score, test_date, plan)         -- generated schedule
```

### 5.9 Operational

```
desmos_states(user_id, question_id, state)
bug_reports(id, user_id, question_id?, body)
feature_efficacy(lesson_id, skill_tag_id, pre_accuracy, post_accuracy, sample)  -- materialized periodically
```

---

## 6. Cross-cutting standards (apply in every phase)

- **Auth helpers** (`lib/api/auth.ts`): `requireUser()`, `requireRole([...])`,
  `requireServiceRole(reason)` — usable from both route handlers and Server
  Actions. First line of every server entry point.
- **Entitlement helper** (`lib/api/entitlement.ts`): `requirePlan(min_plan)` and a
  client `<Gated plan="full">` wrapper. Backed by the SQL `has_plan()`.
- **Response/action helpers** (`lib/api/response.ts`): `ok()/fail()` for route
  handlers, `actionOk()/actionFail()` for Server Actions. One envelope shape.
- **Data access layer** (`lib/db/*`): typed query functions. Pagination always
  orders + clamps; soft-delete and `test_type` scoping are centralized so they
  can't be forgotten per-call.
- **RLS**: every table has RLS enabled. User-owned tables use
  `using (can_view(user_id))`. Public lookup tables get an explicit
  `using (true)` policy. Service-role bypass goes through one audited helper with
  a stated reason.
- **Migrations**: timestamped; CI replays from scratch and regenerates types.
- **Observability**: Sentry (server + client); structured logs with `requestId`,
  `route`, `userId`, `role`, `durationMs`; error boundary on every route segment.
- **Content protection** (lands with the question pool): RSC-rendered question
  HTML (no JSON content endpoint), opaque session-position URLs, per-endpoint
  rate limiting (Upstash), rationale delivery server-gated on an existing attempt
  row. Metadata stays visible to students.
- **Testing**: ~5 Playwright smoke tests over critical flows, expanded per phase;
  unit tests for scoring, mastery updates, routing, and entitlement resolution.

---

## 7. Phases

Each phase: **Goal → Deliverables → Latest-capability usage → Exit criteria.**
Ship and demo at the end of each.

### Phase 0 — Foundation (no end-user product yet)

**Goal:** a deployable shell with identity, the supervisory tree, the two gates'
plumbing, and all engineering discipline in place.

**Deliverables:**
- Repo init: Next 16 + React 19.2 + strict TS, ESLint/Prettier, `tsconfig`,
  React Compiler on, `next typegen`.
- Supabase project; migration workflow; CI (typecheck, lint, build, **migration
  replay into throwaway DB**, type generation, Playwright). Sentry wired.
- Auth (Supabase). `users`, `accounts`, `supervision` tables + RLS.
- `can_view(target)` and `list_visible_users(role_filter)` SQL functions.
- `requireUser/requireRole/requireServiceRole`, response/action helpers, the
  `lib/db` data-access scaffolding with the pagination helper.
- Shared UI primitives (`Button`, `Card`, `Modal`, `Table`, `Pagination`,
  `Avatar`) + design tokens. Role-group layouts: `(student)`, `(tutor)`,
  `(manager)`, `(admin)`. `proxy.js` routing guard.

**Latest-capability usage:** RSC layouts, React Compiler, `next typegen`.

**Exit criteria:** Fresh DB rebuildable from migrations alone. CI blocks broken
PRs. A user can sign up, get a role, and land on a role-appropriate empty shell.
`can_view` passes a back-test over seeded hierarchy fixtures.

### Phase 1 — Entitlements & billing (built in from the start)

**Goal:** the subscription/sponsored model is live and gating works before any
paid feature exists.

**Deliverables:**
- `entitlements` table; `effective_plan(uid)` and `has_plan(uid, min_plan)` SQL;
  `requirePlan()` + `<Gated>` helpers.
- Stripe integration (lazy-init getter), checkout, customer portal, and an
  idempotent webhook → entitlement mapping (`source='stripe'`).
- **Sponsored model**: `accounts.sponsors_subordinates`; resolver grants
  `source='sponsored', plan='full'` to a sponsor's subordinates via the tree.
  Define and encode the lapse policy (what happens when a student leaves a
  roster). Seat/org schema (`source='org_seat'`) present even if seat purchase UI
  is deferred.
- Three plan states wired: `preview` (limited), `standard`/`full` (paid),
  sponsored (full, $0). Account & billing pages. Conflict resolution (max of
  active grants) + `past_due` grace.

**Latest-capability usage:** Server Actions for checkout/portal initiation;
`useActionState` for billing forms.

**Exit criteria:** A paid user, a sponsored student, and a preview visitor each
resolve to the correct plan. Webhook is idempotent and replay-safe. Flipping a
sponsor flag comps their students automatically. Unit tests cover the resolver.

### Phase 2 — Question pool & self-directed practice (the spine)

**Goal:** a student can build a filtered set and practice it end to end; the fact
table starts accumulating.

**Deliverables:**
- `tags`, `questions`, `question_versions`, `question_options`, `question_tags`,
  `question_spr_answers`. Seed the ~4k bank via the seeding pipeline in the
  **Phase 2 appendix** below (a re-runnable, gated ETL — not a one-shot import).
- `item_attempts` fact table; `practice_sessions` (server-side state) with opaque
  `/practice/s/[sessionId]/[position]` URLs.
- Filter UI → session creation → **runner** → result screen.
- Shared `<QuestionRenderer mode="practice|review|tutor">`: MCQ + SPR, KaTeX,
  MathLive SPR input, Desmos, marked-for-review.
- Content protection: RSC-rendered content, rate limiting, gated rationale.
- Entitlement gating first bites here (preview = capped questions / no full
  features; full = unlimited).

**Latest-capability usage:** `<Activity mode="hidden">` to pre-render the next
question; View Transitions between questions; `useOptimistic` on answer submit;
React Compiler on the renderer.

**Exit criteria:** Student practices a filtered set, answers persist to
`item_attempts`, rationale appears only after submission, session resumes across
reload/device, preview vs full gating verified. Playwright: practice flow.

#### Phase 2 appendix — Question-bank seeding pipeline

Seeding is the highest-risk data task in the build. Treat it as a **re-runnable
validation pipeline with hard quality gates**, not a one-shot import. The core
mindset: two sources at different trust levels, reconciled into clean, versioned
rows where **nothing reaches a student until it passes validation**. A smaller
fully-trustworthy bank beats a complete-but-broken one.

**Inputs.** (a) The existing internal bank — has rationales and student attempt
history, but quality drift (mixed math notation, missing figures, incomplete
taxonomy). (b) The original CollegeBoard (CB) bank — authoritative content,
metadata, figures, taxonomy; scrapable for structured content or exportable as
PDFs. **Confirm IP/licensing/ToS rights to ingest CB content at scale before the
scrape runs** — far cheaper to settle up front than after 4k items are ingested.

**Source-of-truth reconciliation (decide per field, not wholesale):**

| Field | Authoritative source | Rationale |
|---|---|---|
| Stimulus / stem / options | **CB** | Clean original; internal copies hold the format drift |
| Figures / images | **CB or PDF** | Source-of-truth visuals; where "missing figure" is recovered |
| Taxonomy (domain/skill, reporting category) | **CB** | Official; backfills incomplete internal taxonomy |
| Answer key | **CB**, cross-checked vs historical p-values | CB correct; attempt data catches mis-keys |
| Rationale / explanations | **Internal** | Your value-add — CB usually doesn't publish these |
| Attempt history | **Internal only** | Migrate and relink — real cold-start metrics |
| Difficulty | **Both** (store CB official *and* computed empirical) | One editorial, one observed |

Principle: **CB wins on content/figures/taxonomy/key; internal wins on rationales
and history.**

**Provenance columns (add to schema):** `questions.source`,
`questions.source_external_id`, `questions.import_batch`, plus per-recovered-asset
keys. These make re-pulling from CB possible without clobbering internal edits,
and carry attempt history to the correct new row.

**Identity / matching (must happen first — no reconciliation without a join key):**
1. Join on `source_external_id` where present (CB external question IDs).
2. For internal rows lacking a CB id, fuzzy-match on a normalized stem hash
   (strip math/whitespace/markup, then compare).
3. Internal rows matching nothing in CB → "internal-only / unverifiable," held in
   `draft`.

**Pipeline stages (each writes a status; nothing is deleted):**

```
ingest → normalize → validate → triage → human review (ambiguous only) → load
```

This maps onto the `question_versions.status` machine
(`draft → in_review → published`). Seeding creates the first published version per
question; later re-imports that change content create **new versions, never
in-place edits** (`item_attempts` reference the exact version seen). The pipeline
is **idempotent and re-runnable** (upsert keyed by `source_external_id`, tracked
by `import_batch`).

**Validation checks (automated gate — all must pass for `published`):**
- Every math fragment **renders under KaTeX in the pipeline** (catch parse errors
  here, not in production). This eliminates the math-drift bug class at seed time.
- Every referenced figure resolves to a stored asset.
- MCQ has exactly one correct option; SPR has a valid accepted value + format.
- Options non-empty; answer key present.
- Taxonomy present (≥ domain + skill for SAT, ≥ reporting category for ACT).
- Answer key cross-checks against historical p-values (see below).

**Triage state machine:**
- **Auto-pass** — passes all checks → `in_review` (spot-check) or `published`.
- **Auto-fixable** — math notation normalizes, taxonomy backfills from CB → fix →
  re-validate.
- **Recoverable-with-source** — figure missing internally but present in CB/PDF →
  recover asset → re-validate.
- **Quarantine** — ambiguous stem, unrecoverable figure, or suspicious key →
  never published; human queue or discard. Quarantined rows are simply invisible
  to students, which is how a clean bank ships on day one without discarding work.

**The three hard parts:**
- **Math normalization.** Canonical stored form is **LaTeX (KaTeX-renderable)**,
  with MathML generated at build for accessibility. A detector classifies each
  fragment's current format (LaTeX / MathML / image / unicode / entities); a
  converter maps it to canonical LaTeX; the KaTeX gate verifies the output.
  Prefer CB's clean math over drifted internal copies.
- **Figures.** Scan for figure references (img tags, "the figure shows,"
  graph/coordinate language). Recover from the CB scrape, or **crop from the
  CB-generated PDF** (PDFs preserve rendered figures as images even when their
  math text is garbled — this is the PDF's best use). Store in object storage;
  link by stable key. Unrecoverable → quarantine.
- **Answer-key cross-check via attempt history.** Compute historical p-values
  from migrated `item_attempts` into `item_stats`. Flag for human review any
  question where the keyed answer's p-value ≈ 0 (likely mis-keyed), a distractor
  is chosen *more often by high performers* than the key (classic mis-key
  signature), or p-value ≈ 1.0 (trivial/low-value).

**PDF role — deliberate, not primary.** PDF math extraction is lossy, so PDFs are
**not** the content path. Use them for (a) figure recovery and (b) QA ground
truth — render the normalized internal version side-by-side with the CB PDF for
human diffing on the ambiguous bucket. Structured scrape is the content path;
PDF is the visual-truth path.

**AI-assisted cleanup (latest Claude models, always verifier- or human-gated).**
Convert messy math to canonical LaTeX (then KaTeX-validate the output — model
proposes, renderer disposes), detect missing-figure references, suggest missing
taxonomy from CB-aligned content, draft missing rationales, flag ambiguous stems.
Deterministically-confirmable fixes (math that now renders, taxonomy matching CB)
may auto-flow; subjective outputs (drafted rationale, ambiguity call) require
human sign-off before `published`. **The seed review queue is the first real
workload of the Phase 5 authoring/review workflow** — build them to share it.

**Rollout — pilot first.** Run a stratified ~150-question pilot spanning both
tests, all domains, and all kinds (MCQ, SPR, passage). Hand-QA every one; measure
auto-pass rate, the failure taxonomy, and the AI false-fix rate. Tune the
validators against that, then run the full bank.

**Appendix exit criteria:** A clean published core loads with provenance intact;
quarantined items are tracked and invisible to students; every published math
fragment passes KaTeX; every published figure resolves; the key cross-check has
run and its flags are dispositioned; the pipeline re-runs idempotently against an
updated CB pull without clobbering internal rationales or attempt links.

### Phase 3 — Metrics, mastery & review

**Goal:** practice becomes insightful; the student sees where to improve.

**Deliverables:**
- `user_skill_mastery` (incrementally updated after each session; estimate +
  confidence + decay); `item_stats` (p-values etc.).
- Student dashboard: per-skill/domain mastery, time analytics, progress over
  time, **predicted score band** (via `score_conversions`).
- **Error log** (a view over `item_attempts WHERE is_correct=false`, enriched
  with reflections) and **review sessions** generated from it or from weak
  skills.
- **Diagnostic/placement onboarding** that seeds the mastery model.
- Basic **notes** and **flashcards** (study tools; SRS scheduling comes in
  Phase 7).

**Latest-capability usage:** `use()` + Suspense to stream mastery/prediction
aggregates; `useOptimistic` on flashcard/mastery toggles.

**Exit criteria:** Dashboard reflects real attempt data within a defined latency
budget; predicted score is sensible against known conversions; a generated review
session targets the student's actual weak skills. Unit tests for mastery update +
score conversion.

### Phase 4 — Practice tests

**Goal:** full-length, exam-faithful tests with SAT adaptive routing and ACT
linear forms.

**Deliverables:**
- `test_templates/sections/modules/module_questions/routing_rules`,
  `test_attempts`, `test_module_attempts`. Seed at least one SAT and one ACT
  form.
- Test runner reusing `QuestionRenderer` and `practice_sessions` machinery:
  per-section timing, section breaks, mark-for-review, answer eliminator, embedded
  Desmos. SAT module routing driven by `routing_rules`; ACT linear.
- Scoring → cached `composite_score`/`section_scores` at finalize; results page
  with section breakdown and per-question review.
- **Resilience**: autosave every answer immediately; resumable across
  reload/device; offline queue with sync on reconnect. Respect `accommodations`
  (extended time).

**Latest-capability usage:** `<Activity>` for instant next-question; View
Transitions for section changes; `useOptimistic` autosave.

**Exit criteria:** A student completes a SAT test where module 2 selection
matches the routing band, and an ACT test scored from the conversion table; a
mid-test reload loses no answers. Unit tests for routing + scoring. Playwright:
full-test flow.

### Phase 5 — Tutor & manager surfaces + authoring

**Goal:** the supervisory features and content creation, almost all reads over
data that already exists.

**Deliverables:**
- **Tutor:** student list (`list_visible_users('student')`), per-student activity
  (sessions, tests, attempts), progress metrics, assignment creation
  (polymorphic) and completion monitoring. **Training mode is free** — a tutor
  uses the exact student practice/test/review surfaces under their own id (works
  already via the self clause of `can_view`).
- **Manager:** treats tutors as students (assign, review, monitor) and sees down
  the tree to students — all via `can_view`, no new access logic.
- **Authoring & review workflow** (manager/admin): create/edit questions and
  content with the draft → in_review → published state machine and immutable
  versioning; preview-as-student; author analytics from `item_stats`
  (p-value, distractor distribution, discrimination).

**Latest-capability usage:** Suspense-streamed roster/metrics; Server Actions for
assignment + authoring mutations; optional realtime/polling for "watch a student's
in-progress session."

**Exit criteria:** Tutor assigns work and sees accurate completion; manager opens
a tutor's student's review; a manager edits a published question and prior
attempts still render against the version the student saw. Playwright:
tutor-review + manager-down-tree flows.

### Phase 6 — Learning content & the learning loop

**Goal:** lessons that pair with practice through the shared taxonomy, and the
diagnose → teach → practice → reassess loop.

**Deliverables:**
- `lessons/lesson_versions/lesson_blocks` (block-based, TipTap authoring,
  versioned), `lesson_skills`, `lesson_progress`. **Embedded-question blocks**
  write to `item_attempts` with `context_type='lesson'`.
- **Recommendation engine**: weakest-mastery / highest-impact skills → the lesson
  that teaches each + a practice set filtered to it.
- **Study-plan generator**: target score + test date → a paced weekly plan over
  the mastery model and calendar.
- **Content efficacy**: pre/post accuracy per lesson skill (`feature_efficacy`),
  surfaced to authors.

**Latest-capability usage:** RSC for lesson rendering; `<Activity>`/View
Transitions for lesson↔practice handoff; Suspense for recommendations.

**Exit criteria:** A student with a weak skill is recommended the right lesson,
completes it (including inline practice), and the dashboard reflects the new
attempts; a study plan generates against a target and date; efficacy numbers
populate. Playwright: lesson + embedded practice flow.

### Phase 7 — Retention, AI, accessibility & polish

**Goal:** make it a learning *system* and bring it to production quality.

**Deliverables:**
- **Spaced repetition**: `review_schedule` (SM-2/Leitner) over flashcards + missed
  items + decayed skills; "focused review before a test" becomes a generated,
  prioritized session.
- **AI (latest Claude models), grounded and human-reviewed where published:**
  per-question explanations and adaptive hints grounded in the chosen distractor;
  a review tutor grounded in the student's own error log; author assistance
  (suggest skill tags, draft explanations/lesson copy, distractor analysis);
  tutor-facing auto-generated progress narratives.
- **Accessibility & accommodations**: MathML for accessible math, keyboard
  navigation, screen-reader labels; extended-time/breaks honored in the runner.
- **Engagement**: streaks, goals, daily targets tied to the study plan.

**Latest-capability usage:** Server Actions for AI calls (streamed where useful);
`useOptimistic` for SRS grading.

**Exit criteria:** SRS resurfaces the right items on schedule; AI explanations are
grounded and gated by plan; the runner passes an accessibility audit and respects
accommodations. Full Playwright suite green on every critical flow.

---

## 8. Sequencing rationale

The order is deliberate: foundation and the two gates first (Phase 0–1) so every
later feature gates correctly from day one; the **question pool + `item_attempts`
fact table** next (Phase 2) because it is the spine every other feature
aggregates over; metrics/review (Phase 3) fall out of the spine cheaply; practice
tests (Phase 4) are the most complex slice and come only after the renderer and
session machinery are proven; the tutor/manager surfaces (Phase 5) are mostly
reads over data that already exists plus the polymorphic assignment write path;
learning content and the loop (Phase 6) couple to the taxonomy that has existed
since Phase 2; retention/AI/a11y (Phase 7) compound everything. Nearly every
later feature is a query or a view over the user tree and the fact table — which
is the entire point of getting those two models right first.
