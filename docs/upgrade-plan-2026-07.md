# Studyworks Upgrade Plan — July 2026

> **Status: Living document — the active roadmap.** Baseline verified
> against code + production: 2026-07-12. Delivery is tracked in the
> **Status ledger** below (last updated 2026-07-17) — every phase PR
> updates it, per the docs rules.

## Status ledger (updated 2026-07-17)

| Item | Status | Landed | Notes |
|---|---|---|---|
| P0.1 region colocation | **Done** | 2026-07-12 | `pdx1` |
| P0.2 submit-path latency | **Done** | 2026-07-12 | |
| P0.3 report de-waterfall | **Done** | 2026-07-12 | |
| P0.4 assignment-creation load | **Done** | 2026-07-12 | |
| P0.5 CI enforcement | **Done** | 2026-07-15 | typecheck/unit/hygiene 07-12; e2e-auth gate **live and enforcing** after PRs #191–#193 (31/31 on every PR) |
| P0.6 public surface hardening | **Done** | 2026-07-12 | |
| P0.7 hygiene | Partial | 2026-07-12 | comment scrub, service-role audit, README, matrix, tutorial done; **migration baseline reset + vestigial drops still pending** (scheduled op) |
| 1.1–1.9 knowledge model | **Done** | 2026-07-13 | PR #189; live in production (snapshots, curriculum, coverage, entitlements infra, attempt context, item stats, bank gate, snapshot-on-edit) |
| 1.5 tutor-onboarding policy | **Done** | 2026-07-16 | Owner policy encoded: admin-issued `teacher_codes` = Studyworks tutor (free, `subscription_exempt`); codeless teacher signup reopened for outside tutors (paid); sponsorship qualified — only a Studyworks tutor's roster edge grants a student free access. Resolver corrected (`20260716150000`) and **applied to production 2026-07-16** (owner-authorized; live-catalog verified; retention 0 lose / 0 gain across 77 users); proxy's blanket teacher bypass reverted |
| 1.5 `entitlements_gate` wiring | **Done** | 2026-07-16 | proxy.js + `userHasAccess` consult the flag (30s cache; resolver errors fall back to legacy; provenance fields preserved for the billing UI). Verified both ways in dev: e2e 33/33 under **off** and **on**; sponsored access live-derived under on (rostered student passes, unrostered bounces); rollback restores legacy exactly |
| 1.5 student invitations | **Done** | 2026-07-16 | Incident response (a shared multi-use tutor code granted a stranger free access; account revoked same day): sponsored student intake moved to **admin-issued, single-use invitation codes** (`student_invite_codes`, migration `20260716210000` — **applied to production 2026-07-16**, owner-authorized, ahead of the PR #201 deploy). Invite from /admin/users (email + tutor → code + welcome email); the invited email is the contact point, not a lock (students may sign up under another address) — the tracker on /admin/users/codes records claimed when/by whom/tutor. The multi-use `teacher_invite_code` is roster-only and **rejected for Studyworks tutors** at signup AND in-app; outside tutors keep it (their students pay). Full matrix verified live in dev; e2e 33/33 |
| 1.5 `entitlements_gate` flip | **Done** | 2026-07-17 | **ON in production** (owner-authorized). Preconditions re-run same day: parity 0 lose / 0 gain across 78 users on live prod data; e2e auth suite 33/33 against dev soaking `on`. Live-verified post-flip via both demo personas (tutor + student load their dashboards; no `/subscribe` bounce). Rollback remains `value='off'`, propagates within the 30s cache |
| 2.1 plan schema | **Done** | 2026-07-14 | |
| 2.2 generator | **Done** | 2026-07-14 | deterministic v1 |
| 2.3 student "Today" | **Done** | 2026-07-16 | PR #196; drill starts stamp `plan_task_id`, auto-completion verified end-to-end |
| 2.4 tutor surfaces | **Done** | 2026-07-17 | generate/review/activate (07-14) + **plan editor & adherence**: move-to-week, swap unit, remove, add manual task (all stamping `plan_tasks.source`), regenerate-a-week (`regenerateWeekTasks` — preserves tutor tasks + completed history); adherence (`lib/plan/adherence.ts`, one home) as on-track/behind/ahead on the plan page and a sortable Plan column on the roster. Editor uses selects rather than drag — same verbs, no client drag dependency |
| 2.5 re-pacing | **Done** | 2026-07-17 | engine + `proposeRepace` (07-14); **weekly job live**: Vercel cron Mondays 11:00 UTC → `/api/cron/repace` (CRON_SECRET contract, same as the lessonworks cron; admin can trigger manually with `?threshold=N`). Orchestration extracted to `lib/plan/repace-runner.ts` (one home; `proposeRepace` and the cron share it). Routing per spec: tutored student → draft + roster "Review draft" chip; self-serve → auto-apply + Today-page "plan was updated" note (system drafts carry `created_by = null`). Verified in dev: no-drift no-op, forced re-pace preserved tutor tasks and parked a draft for review, 401 on bad/missing secret |
| Phase 2 acceptance | **Met** | 2026-07-17 | Demonstrated end-to-end in dev via the §6.4 wizard: goal → short diagnostic (6 questions in dev's small bank; ~16 in prod) → mastery snapshot → generated 12-week plan → activate → Today's first task, with the first task matching the diagnostic's weakest skill. No human involvement |
| Phase 3 pedagogy loop | Partial | — | 3.1 done; 3.2 core done (dynamic detours open); 3.3 done; 3.4 tooling done (authoring ongoing); 3.5 open |
| 3.2 scaffolding | Partial | 2026-07-18 | **Progressive hints shipped end-to-end**: `questions_v2.hints` + `question_content_drafts.hints` (migration `20260718120000`, **applied to dev + prod**); authoring via the drafts editor (one hint per line, promote copies non-NULL); the practice runner offers "Need a nudge?" → progressive amber callouts (MathJax-rendered on the fly, sanitized + watermarked like rationale) — the test runner's separate loader never selects the column (Bluebook parity). Usage recorded on `attempts.response_json` (`{hints_used: n}`, first-attempt-wins). **Hint-weighted mastery live**: `get_skill_mastery_asof` (migration `20260718121000`, dev + prod, baselined from the live catalog) half-weights hint-assisted corrects; `lib/mastery.ts` mirrors it (`HINT_CORRECT_FACTOR`, unit-tested); `compute_mastery_score` untouched. A/B-verified in dev: same attempt scores mastery 3 hinted vs 6 unhinted. **Difficulty ramping (static) shipped**: weak-queue drills present easy→hard (selection stays priority-first), plan-task drills order candidates by difficulty; the free-practice launcher already had `easy_first`. **Open**: dynamic mid-session detours on repeated misses (inject easier question / lesson-check) — deferred; it breaks the fixed-walk session model and needs its own design. Hint *content* for the top ~500 questions is 3.4 workstream authoring |
| 3.3 weak skills → lessons | **Done** | 2026-07-18 | One shared resolver, `recommendLessonsForSkills()` (`lib/lesson/recommend.ts`): skill codes → published lessons via skill-level `lesson_topics` tags — the same published-only rule as `get_plan_inputs.has_lesson`; grouping/ordering pure and unit-tested. Surfaced in all three §3.3 spots: **Review hub** Common Errors rows carry "Learn it first →" beside the drill button (`skill_code` threaded through `commonErrorsFromAttempts`; ACT rows have no SAT skill codes and simply render no link); **post-drill report** gets a "Learn it first" card (top 3 most-missed skills with a tagged lesson, built in `build-session-review`, student review page only); **plan generation** already emitted lesson-before-drill for weak units (2.2) — the Today launcher's inline `lesson_topics` join now goes through the shared resolver instead. All surfaces degrade to no-recommendation while `lesson_topics` coverage is sparse (3.4 authoring populates it). Verified live in dev (LEQ-tagged lesson: hub link + click-through, report card) |
| 3.4 content production tooling | **Done** | 2026-07-17 | The §1.4 coverage audit is now a living worklist: `/admin/content/units` ranks all 29 SAT curriculum units weakest-coverage-first (published-question depth; lesson coverage via skill-level `lesson_topics` tags AND the legacy lesson-pack proxy), linking into the lesson tools. `get_plan_inputs.has_lesson` now honors **published lessons tagged via `lesson_topics`** OR the pack proxy (migration `20260717190000`, **applied to dev + prod**; live-verified in dev — tagging a published lesson to a skill flips its unit to covered; signature unchanged, no type regen needed). Prod baseline 2026-07-17: **0/29 units have a published lesson** (16 pack-proxied), 3,381 published questions. The authoring workstream itself (a lesson per unit through the AI generate flow + builder review, populating `lesson_topics`) is human+AI work, now unblocked and measurable — note the plan's "~40 units" target overshoots the 29-unit curriculum grain. Deferred to the parallel lesson-interface session: unit-prefilled generation briefs, `lesson_topics` stamping on save, and generator-emitted check-remediation branches. Hints authoring stays blocked on 3.2's `hints` schema |
| 3.1 spaced repetition | **Done** | 2026-07-17 | `review_queue` table (migration `20260717150000`, **applied to dev + prod**) + SM-2-lite scheduler (`lib/review/schedule.ts`, pure, unit-tested; intervals capped at a 30-day test-prep horizon). Intake: wrong answers enqueue / correct answers advance via `submitAnswer` (deferred `after()`, best-effort, keyed to the first-attempt-wins insert); decayed coverage units enqueue skill micro-drills (reconciled against `get_student_coverage` on Review-hub and plan-task loads — recovery removes them); flashcard ratings feed due-date scheduling and the review picker goes due-first (weighted-random is now the fallback). Consumption: Review hub "Due for review" card, and plan `review` tasks spawn an SRS session (due questions + micro-drills for ≤2 due skills) stamping `plan_task_id` — **review tasks finally auto-complete** via the existing session trigger; weak-queue is the dry-queue fallback and manual Mark-done stays as the escape hatch. `vocab` item_type reserved but unwired (`sat_vocabulary_progress` has no runtime path today — nothing to migrate until vocab practice exists). Verified live in dev: wrong→1d `again`, correct reviews 1→3→7d `good`, plan task completed `via` the session trigger, rating 5→5d `easy`; e2e 33/33 |
| Phase 4 tutor cockpit | Open | — | |
| Phase 5 manager layer | Open | — | |
| 6.1 sidebar shell | **Done** | 2026-07-16 | PR #194, behind `sidebar_shell` (dev `all`). **Production rolled out 2026-07-17**: flag migration applied, staged `staff` (manager persona live-verified), then `all` same day (student persona live-verified). Student footer countdown/streak strip still open |
| 6.2 design language / runner spec | Open | — | |
| 6.3 access & comfort | Partial | 2026-07-16 | `:focus-visible` on the new chrome only; zoom + runner breakpoints open |
| 6.3b instant-next runners | Open | — | |
| 6.4 first-run wizard | **Done** | 2026-07-17 | `/welcome`: stateless step machine (goal → quick diagnostic → build/activate plan), every visit derives the step from data so it survives leaving mid-flow. Diagnostic = a balanced cross-domain practice session (`lib/plan/diagnostic.ts`, tested) through the normal runner; finishing it feeds the new `snapshot_student_skill_mastery` DB function (applied to dev + prod) so the first plan reflects diagnostic performance immediately. Skippable (`?skip=1`); entry points: dashboard callout when no active plan + Today empty state. Verified live in dev: first task matched the diagnostic's weakest skill |

Dev-environment notes that affect local testing: studyworks-dev has
`sidebar_shell='all'`, the 29-row `curriculum_units` seed (completed
2026-07-16 — the committed migration's seed had never been applied
there), an active 48-task test plan on student1, the seed teacher
marked `subscription_exempt` (Studyworks marker; required by the
teacher e2e suite), and — since 2026-07-16 — production's
`on_auth_user_created` profile trigger (it never came over with the
schema dump, so dev signups used to create auth users with no
profiles). Dev's `entitlements_gate` is `on` (left soaking since the
2026-07-17 prod flip). Known dev seed drift: the demo accounts
(`demo.student@`/`demo.tutor@studyworks.demo`) are mis-seeded — role
`practice`, not `subscription_exempt`, no entitlement — so the local
`screenshots` Playwright project (marketing captures + demo-readonly)
fails with a bounce to /subscribe under legacy AND gate paths alike
(A/B-verified 2026-07-17, pre-existing, not a gate regression). CI is
unaffected (it runs only the auth specs). Fix is re-seeding dev's demo
accounts to match production's (role + exempt flags).

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

This table is the **2026-07-12 baseline snapshot** the plan was written
against — where the Status ledger above records later delivery, the
ledger wins (e.g. study-plan tables, CI enforcement, and the sidebar
now exist). Row counts are as of 2026-07-12 — production is live and
counts drift daily; treat them as scale indicators, not invariants. DB
*objects* (functions, views) must be verified against the live
catalog (`pg_get_functiondef` via MCP), never against repo migration
files — the directory is not a faithful mirror (see
`supabase/migrations/README.md`).

| Fact | Evidence |
|---|---|
| 66 students, 7 tutors, 2 managers, 1 admin in production | `profiles` row counts |
| Practice loop is the living product: ~21.5k attempts, 568 sessions, 223 assignments, 129 v2 test attempts | production row counts |
| **Lesson system has zero student usage**: 4 lessons, 93 blocks, **0 `lesson_progress` rows** | production row counts |
| 3,430 `questions_v2` rows (3,381 published/not-broken/not-deleted) with inline taxonomy (`domain_code`, `skill_code`, `difficulty` 1–3, `score_band` 1–7); 29 distinct (domain, skill) tuples. SAT-only — ACT questions/attempts live in the parallel `act_questions`/`act_attempts` tables | production schema + counts |
| No study-plan tables, columns, or UI anywhere | migrations + `lib/types/database.ts` + full-tree grep |
| No spaced-repetition scheduler; only recency-weighted ranking (`lib/practice/weak-queue.js:186-190`) and flashcard weighted-random (`FlashcardReviewInteractive.jsx:18-30`) | code |
| No per-skill time-series anywhere; all skill aggregates are current-window, computed live (`get_roster_skill_performance`, `get_student_dashboard_stats`) | migration SQL |
| Mastery model exists **only** in `lib/mastery.js` (invoked solely by the Lessonworks sync); never persisted. The **live** `get_student_dashboard_stats` returns plain correct/total per skill — **no mastery computation**. (A repo migration file carries a mastery variant, but production's function was later replaced; verified via `pg_get_functiondef` 2026-07-13.) | live DB catalog + code |
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

### Relationship to the greenfield plan

`docs/greenfield-build-plan.md` (a recent restart-from-scratch
exploration; the continue-vs-restart decision landed on continue) was
mined for this plan. Adopted items are marked *(greenfield …)* where
they appear: the entitlement gate (1.5), attempt context columns
(1.6), item stats + mis-key audit (1.7), bank quality gates (1.8),
question-edit integrity decision (1.9), predicted score band (Phase 1
acceptance), content efficacy (3.5), instant-next runner work (6.3b),
and CI migration replay (cross-cutting standards). Deliberately NOT
adopted: Zod-at-every-boundary and strict-TS-everywhere (incremental
policy wins on a live app), the unified `supervision` edge table (two
working junction tables; migration buys nothing), the full seeding
pipeline (bank is live; only its validators carry over), and the
offline sync queue (backlog, not a phase).

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

**P0.5 CI enforcement.** *Mostly done (2026-07-13).* The
`lint-and-build` CI job now runs `npm run typecheck`, `npm run
test:unit`, the code-hygiene ratchet, auth-matrix freshness, and
script syntax-checks. The auth-boundary e2e job (`e2e-auth`) exists but
is **secret-gated and dormant**: it reports itself *skipped* (not
green) until `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` /
`E2E_SERVICE_ROLE_KEY` are configured on the repo. The stale fixtures
were **rewritten against the generated matrix on 2026-07-13**
(`tests/e2e/helpers/fixtures.ts` + the `api-auth.*` specs now target the
real 15-route HTTP surface + page-level role boundaries; role-gating
that moved to Server Actions is covered at the page level, not by URL).
*Update 2026-07-15: the gate is live.* studyworks-dev was seeded, the
three E2E secrets configured, and the suite greened end-to-end (PRs
#191–#193: Node 22 + login-form labels + layout auth; the teacher
subscription-gate bypass in proxy.js; the student2 not-on-roster seed
fix). The e2e-auth job now enforces the auth boundary on every PR.

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
archival export. Also: scrub stale comments describing the retired v1
id-translation map and UI-version switch; add audit-parity logging to the raw `createServiceClient()`
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
avg_difficulty)` — `test_type` because SAT attempts live in `attempts`
and ACT attempts in `act_attempts`; the snapshot job reads both.
Populated by a nightly job (Supabase scheduled edge function or
`pg_cron`). The mastery formula exists **only** in `lib/mastery.js`
(the live `get_student_dashboard_stats` computes plain accuracy —
verified against the live catalog 2026-07-13, correcting an earlier
claim here that a SQL twin existed). So: port the JS formula to SQL
fresh, pin both implementations to a **shared test vector** (unit
tests on the JS side; a fixture query on the SQL side), and keep
`lib/mastery.js` as a thin verified mirror or retire it once callers
move. Backfill from the ~21.5k historical attempts so trends exist on
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
per curriculum unit (the bank has 3,381 published questions; distribution by
skill must be verified, and units with thin coverage flagged as content
debt for Phase 3's content workstream).

**1.5 Entitlement as a first-class gate** *(adopted from the
greenfield plan §2.6/Phase 1)*. Authorization already has one home
(`can_view()`); licensing does not — subscription checks live ad hoc
in `proxy.js`. Before the plan engine and SRS ship tier-gated
features, build the second gate: an `entitlements` table separating
**plan** (preview/standard/full) from **source** (stripe / sponsored /
trial / manual), a `has_plan(uid, min_plan)` SQL function, and
`requirePlan()` / `<Gated>` helpers. Encode the sponsored model (your
tutoring company's students ride free via the roster edge) and define
the **lapse policy** for students who leave a roster — currently
unanswered anywhere. Migrate the existing `subscriptions`/
`subscription_exempt` checks onto the new resolver.

**1.6 Attempt context columns** *(greenfield §5.4)*. Add
`context_type` (practice | test | assignment | lesson | review) and
`context_id` to `attempts`, backfill from existing session/assignment
linkage, and write both on every new attempt. Replaces the fragile
session-window inference in `markAssignmentCompletedIfDone` with a
direct query, and gives Phase 2 adherence and Phase 3
lesson-embedded practice their attribution key.

**1.7 Item statistics + mis-key audit** *(greenfield §5.5 + Phase 2
appendix)*. Build `item_stats` (empirical p-value, distractor
distribution, discrimination, avg time) from the existing 21.5k
attempts. Run the **answer-key cross-check** once as an audit — flag
any question whose keyed answer has p-value ≈ 0 or where high
performers prefer a distractor (the classic mis-key signature) — then
keep it as a scheduled report. Surface item stats to authors in the
admin question views.

**1.8 Bank quality gates** *(greenfield Phase 2 appendix, applied to
the live bank)*. A re-runnable `scripts/validate-bank.mjs` over the
3,381 published questions: every math fragment renders under KaTeX,
every referenced figure resolves, MCQ has exactly one key, SPR has a
valid accepted value, taxonomy present. Failures quarantine via the
existing `question_availability` table rather than deletion.

**1.9 Question-edit integrity — decision required** *(greenfield
§5.2)*. v2 dropped question versioning, so editing a published
question silently rewrites history under existing attempts — and the
AI-drafts pipeline makes edits routine. Decide between: (a) full
versioning (attempts reference the version seen — heavy retrofit),
(b) snapshot-on-edit for published questions, or (c) minimum viable:
`content_updated_at` + report-level "edited since attempted" flags.
Do not leave it silent.

Acceptance: a single RPC returns, for any student, a per-skill list
with current mastery, 4-week trend, coverage status, and question/lesson
availability — in one query. Additionally: a **predicted score band**
(via `score_conversion`) is computable per student — this becomes the
student dashboard's headline number and the plan engine's progress
denominator.

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

**3.5 Content efficacy** *(greenfield §5.9)*. Once lessons are being
produced at volume, measure whether they work: pre/post accuracy per
lesson skill (`feature_efficacy`, materialized from mastery
snapshots), surfaced to authors and to the manager's
instruction-gap view (Phase 5). This is the feedback loop that keeps
the Phase 3.4 content investment honest.

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

**6.3b Instant-next in the runners** *(greenfield §4)*. P0 fixed
server latency; this fixes perceived latency: pre-render the next
question with React 19.2's `<Activity mode="hidden">` so "Next" is
instant, View Transitions between questions, `useOptimistic` on
submit/mark actions. Fits the content-protection design (question
HTML is already server-rendered; only answers/rationales are gated
behind submit).

**6.4 First-run.** Onboarding wizard (target score → short diagnostic →
first plan/practice set) replacing the read-the-help-articles model,
folded into the Phase 2 self-serve flow.

---

## Cross-cutting standards

- **Every schema change** is a timestamped migration + regenerated
  `lib/types/database.ts` (close the 42-file backlog in P0.7 first).
- **No access regressions.** Any change to the access path — `proxy.js`,
  `lib/api/auth`, `lib/subscription`, the `entitlements`/`has_plan`
  resolver, RLS on user-scoped tables, or a route/action guard — must
  confirm it does not remove access for a currently-entitled user
  *before merge*. For licensing/authorization changes, verify parity
  against the current access set (as §1.5 did: `has_plan` matched
  today's access for all 76 users, 0 mismatches) **and** run the e2e
  auth suite (`tests/e2e/api-auth.*` + `page-auth.*`) against a seeded
  environment. This is a manual pre-merge gate until the secret-gated
  `e2e-auth` CI job is active (P0.5); once active it enforces the same
  boundary automatically on every PR. New user-facing access changes
  ride behind a `feature_flags` row so the switch is reversible without
  a deploy (as the §1.5 `entitlements_gate` does).
- **New code is TypeScript**; new surfaces use Server Components +
  server actions with the shared primitives (`requireRole`,
  `actionOk/actionFail`, `paginate`). The seam modules
  (`lib/supabase/server`, `lib/api/auth`, `lib/api/paginate`,
  `lib/externalAuth`) are converted up front so types propagate into
  every consumer, and a CI ratchet fails the build if the `.js`/
  `.jsx` file count under `app/`+`lib/` grows. Scheduled
  touch-it-convert-it conversions: `lib/mastery.js` (Phase 1),
  `lib/practice/weak-queue.js` (Phase 3), `build-session-review.js` +
  `load-test-results.js` (Phase 4 lazy-body refactor),
  `nav-links.js` → typed sidebar config (Phase 6).
- **The migration baseline reset** (P0.7 / `supabase/migrations/
  README.md`) is complete only when CI **replays the full migration
  set into a throwaway database and regenerates types on every PR**
  *(greenfield rule 1)* — that check is what keeps the drift mode
  closed permanently.
- **One computation, one home**: the mastery formula (today only in
  `lib/mastery.js`) gets a shared test vector before Phase 1 ports it
  to SQL, so the two implementations can never drift silently;
  the plan generator and SRS scheduler each live in one place with
  unit tests wired into CI (enabled by P0.5).
- **Feature flags**: the `feature_flags` table was deliberately kept —
  gate Today/plans, SRS, and the sidebar behind flags for staged
  rollout to the 76-user base (tutors first, then students).
- **Instrument the complaints**: Sentry is installed; add spans on
  submit, report load, and plan generation so the P0 wins are measured,
  not asserted.

## Sequencing summary

| Phase | Duration | Can parallelize with | Status (2026-07-16) |
|---|---|---|---|
| 0 — Feel & trust | 1–2 wk | — (do first) | Done, except P0.7 baseline reset |
| 6 — Sidebar + design | 2–3 wk | Phase 1 | 6.1 shell done (flag-gated); 6.2–6.4 open |
| 1 — Knowledge model | 2–3 wk | Phase 6 | Done; `entitlements_gate` flip pending |
| 2 — Plan engine | 3–4 wk | Phase 3 content authoring | Core done incl. Today; editor/adherence/job open |
| 3 — Pedagogy loop | 3–4 wk | Phase 2 (schema up front) | Open |
| 4 — Tutor cockpit | 2–3 wk | Phase 5 | Open |
| 5 — Manager layer | 2 wk | Phase 4 | Open |

Roughly a 4–5 month arc for the full vision, with the app noticeably
faster and cleaner after week 2, and the transformative student-facing
change (Today + plans) landing around the halfway mark.
