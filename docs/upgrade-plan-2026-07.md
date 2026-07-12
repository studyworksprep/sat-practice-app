# Studyworks Upgrade Plan — July 2026

## Purpose and method

This plan maps the path from the platform as it exists today to the
aspirational model: an application that gives an **independent student
the focus and clarity of working with a skilled tutor**, and gives a
**fresh or undertrained tutor the tools to partially replicate a master
tutor's intuitive, experience-based decision-making** — planning,
diagnosis, prioritization, and instructional judgment.

Every "current state" statement below was verified directly against the
codebase and the **production database schema and row counts** (July
2026). Nothing here relies on claims made in the repo's own planning
documents. Where those documents turned out to be wrong, this plan says
so explicitly (see "Corrections to the record").

### Verified current state (the short version)

| Fact | Evidence |
|---|---|
| 66 students, 7 tutors, 2 managers, 1 admin in production | `profiles` row counts |
| Practice loop is the living product: 21,541 attempts, 568 sessions, 223 assignments, 129 v2 test attempts | production row counts |
| **Lesson system has zero student usage**: 4 lessons, 93 blocks, **0 `lesson_progress` rows** | production row counts |
| 3,430 published-bank questions with inline taxonomy (`domain_code`, `skill_code`, `difficulty` 1–3, `score_band` 1–7) | `questions_v2` schema + counts |
| No study-plan tables, columns, or UI anywhere | migrations + `lib/types/database.ts` + full-tree grep |
| No spaced-repetition scheduler; only recency-weighted ranking (`lib/practice/weak-queue.js:186-190`) and flashcard weighted-random (`FlashcardReviewInteractive.jsx:18-30`) | code |
| No per-skill time-series anywhere; all skill aggregates are current-window, computed live (`get_roster_skill_performance`, `get_student_dashboard_stats`) | migration SQL |
| Mastery model exists (`lib/mastery.js`) but is never persisted; recomputed on read, duplicated in SQL (`20260505000000_dashboard_stats_with_mastery.sql:101-158`) | code |
| No hint/scaffold field on `questions_v2`; feedback is binary reveal-after-submit | schema + `PracticeInteractive.js` |
| No weak-skill → lesson recommendation path; the join key exists (`lesson_topics(domain_name, skill_code)` shares the `questions_v2` code space) but is used only for display chips | code |
| **Lesson branching DOES run for students** — `on_correct_block_id` / `on_incorrect_block_id` / `rejoin_at_block_id` in `lesson_blocks.content` JSONB, executed by `lib/lesson/runtime-navigation.mjs` via the student's `LessonSlideshow` | code |
| Assignment types: server accepts `questions`, `practice_test`, `lesson`, `lesson_pack` (`actions.ts:91`); UI offers only three — `lesson` is a latent path | code |
| Bluebook upload writes full item-level attempt data but triggers no plan/recommendation step; does not touch `profiles` | `upload-bluebook/route.js` |
| Vercel functions in `iad1`; production DB in us-west-2; ~7–11 serial DB round-trips per submit; zero data caching (`cache=MISS` on all logged requests) | Vercel deployment metadata + production logs + code trace |
| Vestigial schema in production: `classes`/`class_enrollments`/`class_invites` (0 rows), `profile_cards` view (0 rows), 11 `stg_*` staging tables | production schema |
| Live but unintegrated: `sat_vocabulary` (991 words) + `sat_vocabulary_progress` (23 rows) | production counts |
| 42 of 151 migration files lack timestamp prefixes (apply order ambiguous) | `supabase/migrations/` listing |
| CI runs lint + build only — no `tsc --noEmit`, no e2e auth specs, no unit-test runner | `.github/workflows/ci.yml` |

### Corrections to the record

Two claims in the repo's docs are contradicted by code and must not
inform future decisions:

1. `docs/lesson-builder-feature-audit-2026-04-25.md` says learner-side
   branching doesn't work. **It does.** The student viewer executes
   authored branch/rejoin logic today. The audit doc and the stale
   header comment in `lib/ui/LessonSlideshow.jsx:1-7` should be updated.
2. `docs/authorization-matrix.md` enumerates many `/api/admin/*` and
   `/api/teacher/*` routes that no longer exist (logic moved to Server
   Actions). The matrix needs regeneration before it's used for any
   security reasoning.

---

## The organizing idea: build the judgment layer

The platform already **measures** well (item-level attempts, taxonomy,
mastery math, roster RPCs) and **delivers** well (practice sets,
adaptive tests, assignment reports). What separates it from a master
tutor is **judgment**: knowing what a student should do *today*, why,
in what order, and when to revisit. Every phase below either builds a
piece of that judgment layer or clears the ground for it.

Dependency spine:

```
Phase 0 (feel & trust)        — independent, do first
Phase 1 (knowledge model)     — data layer everything else consumes
Phase 2 (plan engine)         — consumes Phase 1
Phase 3 (pedagogy loop)       — consumes Phases 1–2
Phase 4 (tutor cockpit)       — consumes Phases 1–3
Phase 5 (manager layer)       — consumes Phases 1–4
Phase 6 (sidebar UI + design unification) — can start in parallel with
         Phase 1; must land before Phases 2–4 ship their new surfaces
         so new features are born into the new shell, not retrofitted
```

At production scale (76 users), schema migrations are cheap **now**.
That is a strategic window: land the data-model phases before growth
makes them expensive.

---

## Phase 0 — Feel and trust (1–2 weeks)

Nothing else in this plan matters if the core loop feels tedious and
the data layer can't be trusted. All items are verified defects with
known fixes; none change product behavior.

**P0.1 Region colocation.** Add `"regions": ["pdx1"]` to `vercel.json`
(same region as the us-west-2 database). Later, when a maintenance
window allows, migrate the database to us-east-2 (where the user base
and the org's other Supabase projects already are) and flip functions
back to `iad1`.

**P0.2 Submit-path latency** (`lib/practice/session-actions.ts`):
- Fire-and-forget `markAssignmentCompletedIfDone` (currently awaited;
  adds 4 serial queries to every assignment submit).
- Parallelize the question fetch and duplicate-attempt check.
- Take the Upstash rate-limit HTTP call off the hot path.
- Same treatment for `recordItemAnswer` in the test runner and the
  `time-ping` route.
Target: submit round-trip under ~200 ms perceived.

**P0.3 Report de-waterfall** (`lib/practice/build-session-review.js`,
`lib/practice-test/load-test-results.js`,
`app/(tutor)/tutor/assignments/[id]/report/page.js`):
- Collapse the sequential note/tag/desmos tails into one `Promise.all`.
- Stop serializing every question's full HTML + rationale into the
  initial payload; lazy-load question bodies (the `loadQuestionAction`
  pattern already exists).
- Add `<Suspense>` so the score strip streams before question content.
- Narrow the `revalidatePath('/tutor'|'/practice', 'layout')` calls in
  the note/tag/desmos actions to specific paths.

**P0.4 Assignment-creation load.** Replace the unbounded
`student_practice_stats` view read with a profiles-only projection (or
typeahead), and cache taxonomy/test/lesson-pack lists with
`unstable_cache` + tags.

**P0.5 CI enforcement.** Add `npm run typecheck`, the existing
`tests/e2e/api-auth.*` / `page-auth.*` Playwright specs, and a unit
runner for `lib/lesson/*.test.mjs` to `.github/workflows/ci.yml`.

**P0.6 Public surface hardening.** `crypto.timingSafeEqual` for the
external API key; per-consumer rotatable keys; wire `lib/api/rateLimit`
onto `app/api/public/*`, `app/api/external/*`, and `app/api/signup`;
add per-student authorization to `external/score-report/[attemptId]`.

**P0.7 Hygiene.** Migration ordering: verification against
production's `schema_migrations` showed the problem is bigger than
the 42 bare filenames — only 6 of 151 local files match tracked
versions (tracking began 2026-04-20; everything earlier was applied
by hand under different stamps). Renaming files would deepen the
drift, so the fix is a **baseline reset** (dump schema → archive the
directory → `migration repair`), documented in
`supabase/migrations/README.md` and scheduled as its own operation.
Fold the vestigial-object drops (`classes`/`class_enrollments`/
`class_invites`, `profile_cards`, `stg_*`) into that reset, after an
archival export. Also: scrub stale `question_id_map`/`ui_version`
comments; add audit-parity logging to the raw `createServiceClient()`
call sites the wrapper can't serve (demo-tour loaders, cron); fix the
README; regenerate the authorization matrix; **rewrite the
getting-started tutorial and Help copy to match the shipped app**
(it currently tells students to click tabs that don't exist).

---

## Phase 1 — The knowledge model (2–3 weeks)

Everything a master tutor "just knows" about a student reduces to three
questions the data layer currently cannot answer: what has this student
covered, how strong are they *per skill over time*, and what does the
syllabus expect. This phase creates those facts once so every later
feature reads instead of recomputes.

**1.1 Persist mastery as a time-series.** New table
`skill_mastery_snapshots(student_id, test_type, domain_code,
skill_code, snapshot_date, mastery, attempts_count, correct_count,
avg_difficulty)`. Populated by a nightly job (Supabase scheduled edge
function or `pg_cron`) running the existing mastery formula — the SQL
version already exists in `20260505000000_dashboard_stats_with_mastery.sql`
and should become the single implementation (drop the duplicated JS
path in `lib/mastery.js` or make it a thin mirror with a shared test
vector). Backfill from the 21.5k historical attempts so trends exist on
day one.
- Unlocks: per-skill trend charts, "improving least" answers, tutor
  effectiveness metrics (Phase 5), plan re-pacing (Phase 2).

**1.2 Define the curriculum.** New table `curriculum_units(id,
test_type, domain_code, skill_code, title, sequence, expected_minutes,
mastery_threshold, prerequisite_unit_ids uuid[])` seeded from the
existing taxonomy (`lib/practice/sat-taxonomy.ts` mirrors the live
`questions_v2` tuples; `skill_learnability` provides an initial
difficulty-to-learn signal). This is deliberately a thin overlay — the
taxonomy already exists; what's missing is *sequence, expectation, and
prerequisite structure*, which is exactly the master tutor's syllabus.

**1.3 Compute coverage.** View or RPC `get_student_coverage(student_id)`
joining `curriculum_units` × `skill_mastery_snapshots` (latest) ×
attempt counts → per-unit status: `not_started / in_progress /
practiced / mastered / decayed`. "Decayed" = mastery snapshot dropped
N points from its peak — the retention signal spaced repetition
(Phase 3) will consume.
- Directly answers tutor question (2) "covered vs. remaining" and
  feeds the student's progress map.

**1.4 Content-coverage audit.** One-time report: questions and lessons
per curriculum unit (the bank has 3,430 questions; distribution by
skill must be verified, and units with thin coverage flagged as content
debt for Phase 3's content workstream).

Acceptance: a single RPC returns, for any student, a per-skill list
with current mastery, 4-week trend, coverage status, and question/lesson
availability — in one query.

---

## Phase 2 — The plan engine (3–4 weeks)

The single largest gap against the stated vision, for both roles. A
student with a goal and a date gets a living plan; a tutor gets the
generator a master tutor carries in their head.

**2.1 Schema.** `study_plans(id, student_id, created_by, test_type,
goal_score, test_date, starting_score, status, config jsonb,
created_at, updated_at)` and `plan_tasks(id, plan_id, week_index,
scheduled_date, task_type, payload jsonb, status, completed_at,
completed_via)` where `task_type ∈ {lesson, drill, review, practice_set,
full_test, vocab, flashcards}`. Tasks reference existing objects
(lesson ids, filter criteria in the same shape `practice_sessions.
filter_criteria` already uses, test ids) so completion detection can be
automatic: finishing the linked session/lesson/test marks the task.

**2.2 Generator.** Deterministic first, model-assisted later:
1. Establish baseline per skill (latest snapshots; if none, require a
   diagnostic — see 2.4).
2. Compute the gap to `goal_score` using the existing
   `score_conversion` data to translate score → needed-correct →
   per-domain targets.
3. Allocate weeks across curriculum units weighted by (gap ×
   learnability × score-band leverage), front-loading lessons for
   weak-but-learnable units, inserting a full practice test every N
   weeks (the existing `StudyCountdown.js` mock-biasing heuristic is a
   seed for the taper logic), reserving recurring review slots that
   Phase 3's SRS will fill.
4. Emit weekly plan → daily tasks sized to the student's declared
   weekly hours (new `study_plans.config` field, asked at creation).

**2.3 Student surface: "Today".** The new sidebar's anchor item
(see Phase 6). Shows today's 1–3 tasks with one-tap starts, why-this
copy ("Quadratics is your highest-leverage weak skill — 40 points of
headroom"), week progress, and the countdown. This is the
focus-and-clarity deliverable for overwhelmed students: the app opens
to *what to do next*, not a menu.

**2.4 Tutor surfaces.**
- **Intake wizard** on the student page: upload Bluebook/official
  scores → set target + date → review the generated plan → adjust →
  activate. Composes the existing upload route, `OfficialScoresCard`,
  and the generator; replaces today's à-la-carte setup.
- **Plan editor**: drag tasks between weeks, swap units, regenerate a
  week, add manual tasks. Tutor edits set `plan_tasks.source =
  'tutor'` so regeneration never clobbers human judgment.
- **Adherence**: completion vs. schedule per student and per roster —
  answers tutor question (4) with a real signal (on-track / behind /
  ahead), not per-assignment due-date pills.

**2.5 Re-pacing.** Weekly job compares snapshot trajectory to the
plan's implied trajectory; drift beyond a threshold triggers a
regeneration proposal (student sees "your plan was updated"; tutor gets
an approval queue item for tutored students). Self-serve students get
auto-apply; this is the app acting as the tutor.

Acceptance: a brand-new self-serve student can go signup → diagnostic →
goal/date → generated plan → first task in under ten minutes with no
human involvement; a tutor can produce the same for a new client in one
sitting from a score report.

---

## Phase 3 — Pedagogy in the loop (3–4 weeks, parallel content workstream)

**3.1 Spaced repetition, for real.** New table `review_queue(id,
student_id, item_type, item_ref, due_at, interval_days, ease,
lapses, last_result, last_reviewed_at)` with `item_type ∈ {question,
skill, flashcard, vocab}`. SM-2-lite scheduling: wrong answers enqueue
at 1–2 days; correct reviews expand the interval; "decayed" coverage
states (Phase 1.3) enqueue skill-level micro-drills. Sources unify what
already exists: the weak-queue's priority logic becomes the *intake*
policy; `flashcards.mastery` ratings and `sat_vocabulary_progress`
migrate from weighted-random to due-date scheduling. Daily plan tasks
of type `review` (Phase 2) draw from this queue — spaced repetition
becomes a standing part of every plan rather than an opt-in page.

**3.2 Scaffolding.** Two mechanisms, both requiring authoring support:
- **Progressive hints**: add `hints jsonb` (ordered array) to
  `questions_v2` + the drafts pipeline; the *practice* runner offers
  "Need a nudge?" before reveal (the test runner stays hint-free —
  Bluebook parity, see 6.2); hint usage recorded on `attempts`
  (`response_json` already exists for structured metadata). Attempts
  with hints score partial weight in mastery.
- **Difficulty ramping**: drill builders (`weak-queue.js`
  `selectDrillQuestionIds`, session creation) order easy→hard within a
  skill and, on repeated misses, inject a lower-difficulty question or
  a lesson-check detour instead of marching on.

**3.3 Connect weak skills to lessons.** The join key already exists
(`lesson_topics(domain_name, skill_code)` shares the `questions_v2`
code space). Build `recommendLessonsForSkills()` and surface it in:
the Review hub ("Learn it first" next to each weak-skill drill), plan
generation (lesson before drill for weak units), and post-drill results
("You missed 4 transitions questions — here's the 10-minute lesson").

**3.4 Content production (the workstream that makes 3.1–3.3 real).**
Production has **4 lessons**. The infrastructure (builder, branching
runtime, JSON authoring format, validation script) is built and idle.
Plan: author one lesson per curriculum unit, weakest-coverage units
first (from the Phase 1.4 audit), using the existing AI-assisted drafts
pipeline (`admin/content/drafts` pattern) extended to lesson JSON, with
human review in the existing builder. Target ~40 units covered within
the phase; leverage the already-working branch/rejoin runtime for
check-remediation loops inside each lesson. Also author `hints` for the
top ~500 highest-traffic questions.

Acceptance: a student's day can be "10-min lesson → scaffolded drill →
3 spaced reviews," generated automatically, with every element linked
by skill code.

---

## Phase 4 — The tutor cockpit (2–3 weeks)

Make a 60-minute session run through one composed surface instead of
page-to-page navigation, and give the undertrained tutor the master
tutor's prep sheet.

**4.1 Session workspace** (`/tutor/session/[studentId]`): one screen
composing what exists — student snapshot + per-skill trend
(Phase 1), plan adherence (Phase 2), latest assignment report, review
queue state, and quick actions (assign, note, drill). Add a **prep
card**: "Since last session: X sessions, mastery moved on these skills,
struggled with Y, plan is N days behind — suggested focus: Z." That
sentence is the experience-replication deliverable.

**4.2 Presenter mode.** Full-screen toggle on `AssignmentReport` and
`GroupAssignmentReport`: suppress app chrome (the sidebar shell makes
this trivial — the runner routes already opt out), larger type,
keyboard next/prev, reveal-all control. Wire the already-installed
Excalidraw as an annotation overlay.

**4.3 One-click authoring.** "Assign from weaknesses" on the student
page pre-fills the existing weighted skill picker from current weak
skills; assignment templates (`assignment_templates` table or a
`filter_criteria` snapshot library); "reassign to another student."
Resolve the latent `lesson` assignment type: surface it in the UI
(it becomes the natural unit of Phase 3 plans) rather than deleting it.

**4.4 Answer the six questions on one page.** Student header gets:
struggling-with (exists), progress (exists), **coverage** (Phase 1.3),
**adherence** (Phase 2.4), and the roster Performance page gains
**per-skill trend deltas** (Phase 1.1) so "improving least" is finally
a real, sortable answer — replacing the misleading lowest-current-
accuracy heatmap.

---

## Phase 5 — The manager layer (2 weeks)

The role model and RLS are already sound (`manager_teacher_assignments`,
`can_view()` with transitive visibility). What's missing is the content
of management.

**5.1 Coaching channel.** `tutor_feedback(id, manager_id, teacher_id,
category, body, related_student_id, related_assignment_id, status,
created_at)` + thread UI on `/tutor/teachers/[teacherId]` — the manager
equivalent of tutor→student notes. Categories align with training
assignments so feedback → assigned drill is one flow.

**5.2 Tutor effectiveness.** With mastery snapshots (Phase 1), compute
per-tutor rollups: average student mastery delta / score delta over a
window, adherence rates, assignment completion, plan quality signals.
Surface on the Teachers tab; label carefully as *signals, not
rankings* (n is small: 7 tutors).

**5.3 Team-scoped home.** Give managers a real landing view: team
strip, per-tutor cards, attention queue ("3 students behind plan under
Tutor A"). Separate "students I personally tutor" from "my tutors'
students" on Dashboard/Roster/Performance (today's union scope is
misleading; the Performance header literally over-claims "your
students").

**5.4 Readiness.** Replace the marketing-only "readiness" concept with
a computed signal from training-assignment completion + trainee test
scores (the data already exists on the teacher detail page).

---

## Phase 6 — Sidebar shell and design unification (2–3 weeks; start early, in parallel)

**Decision (owner): move all user types from the top navbar to a
sidebar layout.** Rationale: the top bar caps out at ~7 flat tabs
(students are already there), complex roles need grouped sections, and
students' other educational tools use sidebars — it's the familiar
pattern.

**6.1 The shell.** New `AppSidebar` in `lib/ui/`, swapped into the
three route-group layouts (`app/(student)/layout.js`,
`app/(tutor)/layout.js`, `app/(admin)/layout.js` — all currently mount
the shared `AppNav`, so this is one component + three layout edits).
`lib/ui/nav-links.js` stays the single source of truth, extended with
section grouping and icons (use the existing SVG `IconTile` system).
Structure:
- **Student:** Today (plan tasks — Phase 2 anchor) · Practice ·
  Review (absorbs Notes) · Learn · Progress · Help. Persistent footer:
  countdown + streak.
- **Tutor:** Teach (dashboard, roster, session workspace) · Assign
  (assignments, templates, lesson packs — currently orphaned off-nav) ·
  Analyze (performance, coverage) · Train. Persistent: student
  quick-switcher (the mid-session navigation gap).
- **Manager:** tutor sections + Team (Phase 5 home). **Admin:** content,
  users, config groups.
- Collapse to icon rail on narrow desktop; drawer on mobile; **runner
  and presenter routes suppress the shell entirely** (focus modes).

**6.2 One design language — with a codified Bluebook exception.**
The practice-test and practice-session runners deliberately mirror the
Bluebook layout so practice builds test-day familiarity: the test
runner aims for close parity; the practice runner is a more polished,
brand-aligned echo of the same layout. This intent is currently
undocumented, which is why design audits misread the runners as legacy
residue. Codify it:
- Write a short **runner design spec** (`docs/design/runner-spec.md`):
  which Bluebook elements are parity-locked (layout regions, question
  map, timer placement, mark-for-review, option interaction), and
  which are brand-adjustable (color tokens, typography, focus states,
  micro-interactions). Future restyles and audits work from this spec.
- Unify everything *around* the runners: one accent — standardize on
  the navy/gold token system (`--color-app-primary #102a43`); retire
  legacy blue `#4f7ce0`/`#2563eb` and the hardcoded indigo; align the
  wordmark gold to the token scale.
- Apply the rounded-card + shadow language to the non-runner surfaces
  that have no parity constraint (question bank browsing, modals,
  Review/Notes) so they match the dashboard era.
- Runner polish stays token-level: brand type/colors/focus-visible
  states within the Bluebook structure, and the practice runner may
  take slightly more brand warmth than the test runner per the
  echo-vs-parity distinction.
- Fix the `--s1…--s5` token collision (`globals.css` vs
  `next-tokens.css`); begin decomposing the 8,236-line `globals.css`.
- Replace emoji icons in Help/banners with the SVG system.

**6.3 Access and comfort.** Remove `maximumScale: 1` (restore
pinch-zoom); add `:focus-visible` styles to nav/buttons/inputs; add
mobile breakpoints to the runner surfaces (practice runner, test
runner, roster each have a single media query today — they're the
most-used surfaces and the least covered).

**6.4 First-run.** Onboarding wizard (target score → short diagnostic →
first plan/practice set) replacing the read-the-help-articles model,
folded into the Phase 2 self-serve flow.

---

## Cross-cutting standards

- **Every schema change** is a timestamped migration + regenerated
  `lib/types/database.ts` (close the 42-file backlog in P0.7 first).
- **New code is TypeScript**; new surfaces use Server Components +
  server actions with the shared primitives (`requireRole`,
  `actionOk/actionFail`, `paginate`).
- **One computation, one home**: the mastery formula's JS/SQL
  duplication gets a shared test vector before Phase 1 builds on it;
  the plan generator and SRS scheduler each live in one place with
  unit tests wired into CI (enabled by P0.5).
- **Feature flags**: the `feature_flags` table was deliberately kept —
  gate Today/plans, SRS, and the sidebar behind flags for staged
  rollout to the 76-user base (tutors first, then students).
- **Instrument the complaints**: Sentry is installed; add spans on
  submit, report load, and plan generation so the P0 wins are measured,
  not asserted.

## Sequencing summary

| Phase | Duration | Can parallelize with |
|---|---|---|
| 0 — Feel & trust | 1–2 wk | — (do first) |
| 6 — Sidebar + design | 2–3 wk | Phase 1 |
| 1 — Knowledge model | 2–3 wk | Phase 6 |
| 2 — Plan engine | 3–4 wk | Phase 3 content authoring |
| 3 — Pedagogy loop | 3–4 wk | Phase 2 (schema up front) |
| 4 — Tutor cockpit | 2–3 wk | Phase 5 |
| 5 — Manager layer | 2 wk | Phase 4 |

Roughly a 4–5 month arc for the full vision, with the app noticeably
faster and cleaner after week 2, and the transformative student-facing
change (Today + plans) landing around the halfway mark.
