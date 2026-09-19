# Student onboarding and study-plan redesign

> **Status: Living document.** Last verified against code: 2026-09-17
> (Phase 1 and Phase 2 implemented; migrations applied to dev and
> production 2026-09-17; owner notes of 2026-09-17 folded in — see §3.4). Design settled with the
> owner on 2026-09-14; the delivery ledger at the end is the working
> state. Supersedes the first-run wizard section (§6.4) of
> `upgrade-plan-2026-07.md`.

This document records the agreed redesign of the self-serve student
experience from first login through a living study plan. It covers
four connected pieces: the onboarding intake, the evidence a student
can bring, the plan generator's move from a single ranking to a
phase composer, and a student-facing plan hub. It is written so that
each phase can be implemented from this file alone.

---

## 1. Baseline (verified 2026-09-14)

An audit of the current flow, run in code and walked in dev as a
brand-new student, confirmed the following. These are the problems
the redesign exists to fix; none is speculative.

**Orientation.** The first dashboard render bounces any account under
24 hours old to `/help?welcome=1`. The gate lives in browser
`localStorage` (`app/(student)/help/HelpDashboardBanner.jsx`), so it
is per device rather than per user. The help index lists 13 articles
with no images or screenshots, still describes "tabs in the top nav"
(the sidebar shell is live for everyone in production), and neither
the articles nor the welcome email mention the study plan or the
wizard. Both tell the student to begin with a full baseline practice
test, which contradicts the wizard's diagnostic. A second static
orientation page exists at `/learn/getting-started`.

**Wizard reach.** Login always lands on `/dashboard`. The wizard at
`/welcome` is reachable only from a dashboard callout and the Today
empty state. Target score is collected at signup and asked again in
the wizard.

**Diagnostic.** The diagnostic is an ordinary practice session tagged
`filter_criteria.diagnostic`. The runner shows no diagnostic framing,
"Save & exit" goes to `/dashboard`, and finishing lands on the
generic session report whose only links are History and "Start
another session". Once a diagnostic is open the skip link disappears
(`openDiag` is checked before `skipped` in `app/(student)/welcome/page.tsx`).
The set is 2 questions per domain across 8 domains against 43 ranked
skills. One attempt caps mastery at 14/100 (volume factor
`1 − e^(−0.15·attempts)`), so a correct diagnostic answer *raises* a
skill's priority (gap 0.83) above an untested skill (default gap
0.60). The diagnostic cannot do what the copy says it does.

**Plan review and hub.** The review step shows "N weeks · M tasks".
`generatePlan()` returns a rationale string that is never stored or
rendered. The only student-facing plan surfaces are `/welcome` and
`/today`; once a plan is active `/welcome` redirects to `/today`, so
goal changes and rebuilds are unreachable. Today shows at most three
tasks and a week counter. The dashboard has no plan panel. Tutors
have a week-by-week editor at `/tutor/students/[id]/plan`; students
have none.

**Generator order.** `generatePlan()` ranks all skills by
gap × learnability × leverage from day one and uses curriculum
`sequence` only as a tiebreak. With uniform unknown mastery the
ranking collapses to learnability × question-bank size, so a first
plan opens with whatever is easiest to improve, not with the start
of the curriculum.

**Production funnel (2026-09-14).**

| Metric | Value |
|---|---|
| Students | 75 |
| Students with no tutor | 13 |
| Diagnostic sessions ever started | 1 |
| Active plans (all self-created) | 6 |
| Draft plans never activated | 4 |
| Plan tasks completed | 18 of 288 |
| Task mix on active plans | drill 228 · lesson 28 · review 20 · full test 12 |

---

## 2. Decisions settled with the owner (2026-09-14)

1. **The up-front diagnostic is retired.** No short instrument can
   measure 43 skills; even a full SAT leaves most skills under the
   app's own 8-attempt evidence bar. Evidence comes from the
   student's real test history or from the coverage phase itself.
2. **The plan becomes phased, not ranked.** Coverage (curriculum in
   sequence order) → focus (rank by gap, evidence-gated) →
   rehearsal (full tests, pacing). This matches how tutoring
   actually proceeds: the whole curriculum early, weak areas late,
   when the data exists.
3. **Students are not one population.** Intake sorts them by prep
   level and intent into foundations, targeted, or self-directed
   plans. Time to test sets pacing only; it is not the proxy for
   readiness.
4. **Evidence branch: manual domain entry is the default, Bluebook
   upload is the precise upgrade, skip is always available.** The
   upload needs an illustrated walkthrough to succeed for most
   students, and it reaches skill granularity only for tests the
   app has ingested (see §4).
5. **The research block is out of scope** until there is a coherent
   research question and design. Nothing in this document stores
   attitudinal or motivational data.
6. **Signup shrinks.** Name, email, password, invite code. Target
   score, test date, and everything else that shapes the plan moves
   into the intake.
7. **The first-login help redirect is removed.** Orientation is
   folded into the intake and the plan hub; help stays a reference.

---

## 3. Intake flow

### 3.1 Principles

- **Stateless step machine, resumable.** Keep the pattern the
  current wizard uses: every visit derives the step from data, so
  leaving mid-flow and returning picks up where the student was.
  Every step persists on submit.
- **Under ten required questions** on the plan-driving path. Each
  branch adds at most three.
- **Plan preview before anything optional.** The student sees a
  real, phased plan before being asked for any extra effort.
- **Entry.** A student with no active plan and no completed intake
  is routed to `/welcome` on login (server-side, in the login
  redirect and the student layout), not to the dashboard. The
  dashboard callout and the Today empty state stay as secondary
  entry points.

### 3.2 Steps and branches

```
1  Situation      test date · prep level · intent
      │
      ├─ prep = none ──────────────────────────────► 4
      │
      ├─ prep = some | a lot ──► 2  Evidence ───────► 4
      │
      └─ intent = my own targets ──► 3  Targets ────► 4
                     (after 2 if prep ≠ none)

4  Availability   weekly hours · study days
5  Self-assessment  comfort per domain (1–5, all eight)
6  Plan preview   phases, first two weeks, rationale · activate
```

**Step 1 — Situation.**

| Field | Values | Used for |
|---|---|---|
| Target score | 400–1600, step 10 | Goal; pacing; rationale |
| Test date | date, must be future | Weeks available; rehearsal cadence |
| Prep level | `none` · `some` · `a_lot` | Plan mode (§5.2) |
| Intent | `guide_me` · `own_targets` | Plan mode; whether step 3 shows |

Copy for prep level should describe situations, not labels:
"I'm starting from scratch" / "I've done some studying or a class" /
"I've had tutoring or prepped seriously and want to sharpen weak
areas".

**Step 2 — Evidence** (prep = some or a_lot). Three cards, in this
order, each with its trade-off stated in one line. See §4 for the
full specification.

1. *Enter your domain results* — about two minutes per test.
2. *Upload a Bluebook report* — five to ten minutes; question-level
   precision for supported tests.
3. *Skip for now* — the plan starts from a balanced baseline and
   learns from the first weeks of work.

A student can add several tests of either kind. One optional
free-text line: "What did your tutoring or class focus on?" This is
stored for a tutor reading the file and is not a generator input.

**Step 3 — Targets** (intent = own_targets). A domain → skill
picker using `SAT_TAXONOMY` display names, prefilled from any
evidence entered in step 2 (weakest domains pre-checked). Minimum one
skill. The student can also toggle whether to keep periodic full
tests.

**Step 4 — Availability.** Weekly hours (1–40, default 5) and which
days of the week they can study (checkboxes, default all seven). The
generator currently spreads a week's tasks across all seven days;
honoring study days is a direct adherence improvement.

**Step 5 — Self-assessment.** One 1–5 comfort rating per domain,
eight rows, required. Copy: "How comfortable are you with each of
these right now? There are no wrong answers — this helps the plan
decide where to start." This is a plan prior for students with no
other evidence (§5.4) and is cheap enough to ask of everyone.

**Step 6 — Plan preview and activate.** Rendered by the same
component as the plan hub (§6), read-only, with the rationale, the
phase strip, and the first two weeks expanded. Buttons: *Start my
plan* (activates and redirects to `/today`), *Change something*
(returns to the step the student picks). This replaces the current
"N weeks · M tasks" card.

### 3.3a Owner notes applied 2026-09-17

After walking the shipped Phase 1, the owner asked for four changes;
all are implemented:

1. **One question per screen, friendlier tone.** The situation and
   availability cards were split into single questions — target, test
   date, prep level, intent, (targets), hours, days — each with its
   own reassurance line and a "Question N of M" progress bar. Every
   answer is its own column, so the ladder still derives from data
   (`questionSteps`, `deriveWizardStep` in `lib/plan/intake.ts`).
2. **Self-check: "I'm not sure" and domain examples.** The eight-domain
   comfort check walks one domain at a time, shows a one-line example
   of what the domain covers (`DOMAIN_EXAMPLES`), and offers "I'm not
   sure", stored as null (no prior for that domain). The targets picker
   shows the same example under each domain name.
3. **No reason line on coverage or targets tasks.** The `coverage` and
   `targets` reason codes stay on the payload for the record but render
   nothing; the plan's structure already says why those tasks exist.
   Evidence-based reasons (self-rated low, decayed, and so on) still
   render.
4. **A place to see the plan and get ahead.** The `/plan` hub (§6) is
   live, and Today offers "Want to get ahead?" with the next three
   pending tasks, startable now, whenever today's list is clear.

### 3.3b Design pass 2026-09-17 (screenshots review)

- The intake renders **bare** (no sidebar) and opens on a **welcome
  screen** — greeting, three-line outline of what's coming, "Let's
  go" — before the first question. Questions are one short title with
  at most one line under it; copy lives in the options.
- The self-check is **one tile**: eight rows (domain, one-line
  example, 1–5 segments, "Not sure"), grouped Math / Reading &
  Writing. Walking eight screens one at a time was tedious.
- The preview tucks the rationale behind "Why this plan"; the phase
  strip carries the explanation.
- Wide screens use the width: question screens go two-column (the
  question on the left, controls on the right) from 900px; the long
  forms (targets, self-check) stay single-column; the preview and the
  plan hub widen to 1080px and collapsed weeks flow two-up.
- The dashboard has **one primary action**: "Continue plan" (Today)
  with "See the plan" beside it when a plan is active, "Set up my
  plan" otherwise; free practice / resume are text links. The
  full-width help banner is gone; a small dismissible nudge points at
  Help on the first three dashboard visits of an account under 14
  days.

### 3.3 What happens to existing surfaces

| Surface | Change |
|---|---|
| Signup form + `/api/signup` | Drop target score, high school, graduation year from the form. Keep the columns; the intake writes target. |
| `HelpDashboardBanner` | Delete the first-login redirect. Keep a dismissible "New here?" banner for accounts under 30 days, pointing at the plan hub, not at help. |
| Help content | Rewrite `getting-started` and `study-routine` to describe the intake and the plan; remove "tabs in the top nav". Screenshots are a separate content task (§9). |
| `lib/email/welcomeStudent.js` | Replace "take a baseline practice test" with "finish your setup and start your plan", linking `/welcome`. |
| `/learn/getting-started` | Redirect to `/help/getting-started`; one orientation, not two. |
| Diagnostic session code | Remove `startDiagnosticAction`, `lib/plan/diagnostic.ts` and its test, the open-diagnostic branch of the wizard, and `filter_criteria.diagnostic` handling. Existing tagged sessions in production (one) stay as ordinary practice sessions. |

---

## 4. Evidence branch

### 4.1 Manual domain entry (default)

One form per test: test type (`psat`, `sat_official`, `bluebook_practice`,
`other_practice`), test date, Reading & Writing score, Math score,
and eight domain fields. Domain labels use the names on the
student's report, which match the app's eight SAT domains exactly:

| Section | Domain (report label) | Code |
|---|---|---|
| Math | Algebra | H |
| Math | Advanced Math | P |
| Math | Problem-Solving and Data Analysis | Q |
| Math | Geometry and Trigonometry | S |
| R&W | Information and Ideas | INI |
| R&W | Craft and Structure | CAS |
| R&W | Expression of Ideas | EOI |
| R&W | Standard English Conventions | SEC |

Reports express domain performance differently (a count correct out
of a total, a percentage bar, or a seven-step band). The form accepts
whichever the report shows for that test type and normalizes to a
0–1 `performance` value on save. The normalization rule per test
type is part of the implementation and must be documented in
`docs/database.md` when it lands.

Show the trade-off next to the form: "The plan will know which
domains to prioritize. It can't tell skills apart inside a domain
until your first few drills, usually two to three weeks."

### 4.2 Bluebook report upload (precise)

Reuses `lib/bluebook/parse-report.ts` and the write path of
`/api/teacher/student/[studentId]/upload-bluebook`, exposed as a
student-scoped Server Action that writes for the caller only. Facts
that constrain the design:

- The parser yields domain and correctness per question. Skill
  granularity comes from matching each parsed question by ordinal
  to the app's copy of that practice test and writing item attempts
  against the app's own question ids. **Skill-level evidence exists
  only for tests present in `practice_tests_v2`.** Any other test
  degrades to section scores plus domain performance, which is what
  manual entry gives.
- Detect the test from the parsed report name where possible and
  confirm with the student; fall back to a picker limited to
  ingested tests. Do not offer a free-text test name.
- The walkthrough is a content deliverable: numbered steps with
  screenshots taken from the current Bluebook interface, embedded in
  the step. Prose alone will fail most students. `docs/bluebook-contributor-guide.md`
  is the starting material.

Trade-off copy: "Most precise — the plan sees every question. Takes
five to ten minutes and works for the official practice tests listed
below."

### 4.3 Skip

Always visible, never penalized in copy. Goes to step 3 or 4
depending on intent.

---

## 5. Plan generator: phase composer

### 5.1 Shape

`generatePlan()` stays pure and deterministic. It gains a `mode` and
emits tasks grouped into phases; each phase has a type, a week range,
and a one-sentence explanation. The plan stores the phase list so the
hub can render it and the re-pacer can move a plan between phases.

```
Phase types
  coverage   walk the curriculum in `curriculum_units.sequence` order:
             lesson (if has_lesson) then drill per skill; skills the
             evidence marks strong get a shortened pass (drill only)
  focus      rank by gap among skills with evidence (attempts ≥ 8 or
             an evidence prior); lessons only for weak-and-improvable
  rehearsal  full test + targeted review, biweekly then weekly
  targets    (self-directed) the student's chosen skills, cycled;
             lessons offered once per weak skill
```

### 5.2 Modes

| Mode | Chosen when | Phases | Notes |
|---|---|---|---|
| `foundations` | prep = none, or prep = some with no evidence | coverage → focus → rehearsal | Coverage takes ~60% of weeks, minimum 3, capped so focus gets ≥ 2 weeks and rehearsal ≥ 2 |
| `targeted` | prep = some with evidence, or prep = a_lot | focus → rehearsal | If evidence is thin (no imported tests and self-assessment flat), the preview says so and offers a 2-week "quick coverage" opener |
| `self_directed` | intent = own_targets | targets → rehearsal | Full tests optional per the student's toggle |

Weeks available shortens every phase proportionally; it never
changes the mode. A student with six weeks and no prep still gets a
coverage phase, compressed.

### 5.3 Priority changes

`priority()` keeps gap × learnability × leverage for the focus phase.
Two additions:

- **Evidence prior.** `SkillState` gains `evidencePrior: number | null`
  (0–1, 1 = fully mastered) derived per §5.4. When
  `attemptsCount < LOW_EVIDENCE_ATTEMPTS`, the gap term blends the
  prior with in-app mastery weighted by attempts:
  `gap = (1 − w)·(1 − prior) + w·gapFromMastery`, with
  `w = attemptsCount / LOW_EVIDENCE_ATTEMPTS`. The prior fades out as
  real drills accumulate. With no prior the current default (0.6)
  stands.
- **Reason codes.** Add `DrillWhyCode` values `prior_weak` ("A test
  you entered showed this area as weak") and `self_rated_low` ("You
  rated this area as uncomfortable"), rendered by
  `lib/plan/task-labels.ts`. Coverage-phase tasks carry
  `why_code = 'coverage'` and self-directed tasks `'targets'`, kept for
  the record but **not rendered** (owner note 3, 2026-09-17): the
  plan's structure already explains them. Evidence-based reasons are
  the first place the plan visibly reflects what the student told it.

### 5.4 Deriving the evidence prior

Per skill, in this precedence:

1. **Item-level attempts** from a Bluebook upload already land in
   `attempts` and flow through the mastery snapshot. No prior needed.
2. **Domain performance** from manual entry: the skill inherits its
   domain's normalized performance, most recent test weighted 0.6 and
   older tests sharing 0.4. Stored on the plan as
   `config.evidence.domain_prior[domain_code]`.
3. **Self-assessment** (always present): `(rating − 1) / 4`, but
   only when no domain performance exists for that domain, and
   damped by 0.5 toward 0.5 (a self-rating moves the prior half as
   far as a test would).

A strong prior shortens a domain's coverage pass (drill only, no
lesson); it never skips the domain entirely. Eight numbers cannot
distinguish a strong domain from one easy skill carrying the score.

### 5.5 Transitions and re-pacing

`repacePlan()` (§2.5 of the upgrade plan) already regenerates
remaining weeks weekly for self-serve students. It gains phase
awareness: it regenerates within the current phase and, at a phase
boundary, composes the next phase from current evidence. A
foundations plan therefore enters focus with real mastery data. Human
edits (`source = 'tutor' | 'student'`) are preserved as today.

The `wasAutoRepaced` notice on Today should link to the hub's
"what changed" list rather than a one-line message.

---

## 6. Plan hub

### 6.1 Route and navigation

New route `/plan` in the student tree. Sidebar: with an active plan
the anchor section becomes **Today · Plan · Dashboard**; without one
it stays **Dashboard** and the setup callout points at `/welcome`.
`/welcome` continues to redirect to `/today` when a plan is active,
but the hub owns goal, hours, days, and rebuild, so nothing becomes
unreachable.

### 6.2 Content, top to bottom

1. **Header.** Target, test date, days to test, current phase name
   and its one-sentence explanation. The stored rationale sits under
   it.
2. **Phase strip.** Coverage → focus → rehearsal (or the mode's
   phases) as a horizontal bar scaled by weeks, current week marked,
   each phase with a short "what this is for" line.
3. **Progress by section.** Math and Reading & Writing, each with
   skills covered / total and a mastery distribution (mastered ·
   practiced · in progress · not started) from
   `get_student_coverage`. This is where "progress along specific
   areas" lives.
4. **Week list.** Every week, collapsed by default except the current
   one; each task shows type, title, why, status, and a *Start*
   button that reuses `startPlanTask`. Completed tasks show their
   completion date. This is the student's counterpart to the tutor
   editor's list and shares its row component where practical.
5. **Coming up.** The next three pending tasks after today.
6. **Adjust.** Edit target score, test date, weekly hours, study
   days. Any change triggers a re-pace preview ("this changes N
   remaining tasks") before applying. *Rebuild plan* regenerates a
   draft from current evidence for review, leaving the active plan
   in place until activated, same as the tutor's regenerate.
7. **How progress is measured.** The existing `MasteryNote`, moved
   here from Today.

### 6.3 Relationship to Today and the dashboard

Today stays the daily surface and is unchanged in intent: due tasks,
done today, week bar. It gains one link, "See the whole plan". The
dashboard gets a compact plan card (phase, week N of M, tasks done
this week, link to `/plan`) replacing the setup callout when a plan
is active. The dashboard's test-date tile should read the plan's
date before the profile's, matching the sidebar footer.

---

### 6.4 Assignments and the plan (implemented 2026-09-19)

Before this, a tutored student with an active plan had two to-do lists
that never talked. Now an assignment given to a student with an
**active** plan is mirrored into the plan as a task with
`source = 'tutor'` (so re-pacing preserves it, overdue or not), dated
to the assignment's due date (never in the past, never past test
day), titled "Assigned: …", linked through `payload.assignment_id`.
Type mapping: questions → `practice_set`, practice test →
`full_test`, lesson / lesson pack → `lesson`.

Everything lives in database triggers
(`20260919120000_assignments_into_plan_tasks.sql`, applied to dev and
production 2026-09-19) so every creation
and completion path is covered without touching each one:

| Event | Effect on the plan task |
|---|---|
| Junction row inserted (create, reassign, add member, v1 sync) | Task created in the student's active plan |
| `assignment_students_v2.completed_at` stamped (any completion path, submit-on-behalf) | Task completed, `completed_via = 'assignment:<id>'` |
| Completion cleared | Task reopened |
| Student removed from the assignment | Pending task deleted |
| Assignment archived or deleted | Pending task skipped (`assignment_closed`); un-archive reopens |
| Due date changed | Pending task moved, week re-anchored |
| Plan activated later | Open assignments mirrored into the new plan |

On Today and the hub, an assignment task shows an "Assigned" tag and
"Assigned by your tutor"; Start opens the assignment itself (the
task completes through the assignment, never by hand). The hub's
week-by-week list now carries Start buttons on every pending task, so
a student can get ahead from any week.

## 7. Data model

All changes are timestamped migrations under `supabase/migrations/`
applied through the MCP `apply_migration` tool, followed by type
regeneration (CLAUDE.md rule 3). Nothing here touches `_legacy`.

### 7.1 `student_score_reports` (new)

One row per test a student reports or uploads.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `student_id` | uuid → profiles | RLS: owner and `can_view(student_id)` |
| `source` | text enum | `psat` · `sat_official` · `bluebook_practice` · `other_practice` |
| `entry_method` | text enum | `manual` · `upload` |
| `test_date` | date | |
| `rw_score` / `math_score` | int null | 200–800 |
| `domain_performance` | jsonb | `{ "H": 0.71, … }` normalized 0–1, all eight keys when present |
| `raw_entry` | jsonb null | what the student typed, pre-normalization |
| `practice_test_attempt_id` | uuid null | set when `entry_method = 'upload'` and the test was ingested |
| `created_at` / `updated_at` | timestamptz | |

Uploads that match an ingested test still write item attempts through
the existing path; the report row links to the resulting
`practice_test_attempts_v2` row so the hub can show both.

### 7.2 `study_plans` additions

| Column | Type | Notes |
|---|---|---|
| `mode` | text | `foundations` · `targeted` · `self_directed` (null = pre-phase plan) |
| `prep_level` | text | as entered at intake |
| `intent` | text | as entered at intake |
| `rationale` | text | the generator's paragraph, stored at write time |
| `phases` | jsonb | `[{ type, start_week, end_week, summary }]`, inclusive 0-based weeks |
| `config` | jsonb (existing) | adds `study_days: [0..6]`, `full_tests`, `evidence: { self_rating }` (Phase 3 adds `domain_prior`), `targets: [skill_code]` |

Migration: `supabase/migrations/20260915120000_student_intake_and_plan_phases.sql`
(applied to dev 2026-09-15 and to production 2026-09-17).

`plan_tasks.payload` gains `phase` (type string) and the new
`why_code` values. No new task columns.

### 7.3 `student_intake` (new, Phase 1)

The intake answers need a home before a plan exists (the wizard is
resumable step by step), so they live in their own row rather than on
`profiles`. One row per student, `student_id` primary key, RLS
`can_view(student_id)` like `study_plans`.

| Column | Type | Notes |
|---|---|---|
| `prep_level` / `intent` | text | as entered at step 1 |
| `targets` | jsonb | `[{ domain_code, skill_code }]` (own_targets) |
| `weekly_hours` | int | 1–40 |
| `study_days` | jsonb | `[0..6]`, 0 = Sunday |
| `self_rating` | jsonb | `{ "H": 3, … }` 1–5 per domain |
| `full_tests` | bool | self-directed toggle, default true |
| `focus_note` | text | reserved for the Phase 3 free-text line |
| `completed_at` | timestamptz | set when the first plan activates |
| `skipped_at` | timestamptz | set by "I'll do this later" |

Login routing (§3.1) reads this row: a student with no active plan
and neither `completed_at` nor `skipped_at` is sent from `/dashboard`
to `/welcome`. Signup stops writing `target_sat_score`, `high_school`,
and `graduation_year`; the columns remain for existing rows and the
account page. (The earlier draft of this doc put a single
`intake_completed_at` on `profiles`; the row above replaces it.)

### 7.4 Removed

`filter_criteria.diagnostic` is no longer written. No schema change;
the one production session keeps its tag harmlessly.

---

## 8. Delivery phases

Each phase is independently shippable and leaves the app in a
coherent state. Order is by leverage against the funnel.

| Phase | Scope | Acceptance |
|---|---|---|
| **1 · Intake and routing** — **implemented 2026-09-15** | Steps 1, 3, 4, 5, 6 of §3 (no evidence branch yet: prep = some/a_lot go straight to availability); signup shrink; login routes new students to `/welcome`; help redirect removed; welcome email and getting-started copy updated; diagnostic code removed. Generator gains `mode` and phases with the self-assessment prior only. Preview renders phases and rationale via the shared `PlanOverview`; `rationale` and `phases` stored. Re-pace and week regeneration compose in the plan's stored mode. | Walked in dev 2026-09-15 as a fresh student: login → `/welcome` → self-directed plan → `/today` with no help or practice-session detour; `/welcome` never dead-ends ("I'll do this later" ends routing). Unit tests cover the three modes, phase layout, priors, study days, and the step ladder (`lib/plan/phase-composer.test.mjs`, `intake.test.mjs`). No new Playwright spec: CI's e2e job runs against its own bank and the seeded student already has a plan, so a wizard walk there would be unreproducible — see `docs/runbook.md` e2e notes. |
| **2 · Plan hub** — **implemented 2026-09-17** | `/plan` per §6: header with target/date/countdown/tasks done, "right now" (week, phase, this week's bar, rationale), "up next" with Start buttons (also the "get ahead" path), progress by section from `get_student_coverage`, the week-by-week `PlanOverview` with the current week open, and Adjust (target, date, hours, days) + Rebuild. Both verbs regenerate the remaining weeks **in place** (`regenerateRemainingTasks`): same plan id, completed history and human-authored tasks kept, phases laid over the original grid. Sidebar anchor Today · Plan · Dashboard; dashboard plan card; Today links to the hub and offers "Want to get ahead?"; `MasteryNote` moved. | Walked in dev 2026-09-17 (e2e `onboarding.student.spec.ts` reaches `/plan` and checks week/phase/progress). Deviation from §6.2: adjust applies immediately with a result line rather than a before/after preview — the preview is Phase 4 polish if wanted. Legacy plans (no `phases`) render without the phase strip. |
| **3 · Evidence branch** | `student_score_reports`; manual domain entry form; student-scoped Bluebook upload with the illustrated walkthrough; evidence prior (§5.4) and reason codes wired through the generator; hub shows reported tests. | A targeted-mode student who enters two reports gets a plan whose first-week drills carry `prior_weak` reasons for their weakest domains. An upload of an ingested test yields item attempts visible in the hub. |
| **4 · Content** | Help rewrite with screenshots; Bluebook walkthrough screenshots; retire `/learn/getting-started`. | Help describes the sidebar app; every help article that names a surface shows it. |

Suggested later, not scheduled: per-unit pre-checks (3–4 custom
questions at the start of a coverage unit deciding lesson vs drill),
and the research block once its design exists.

---

## 9. Open questions

1. **Normalization per report type** (§4.1). Official score reports
   show domain performance as a seven-step band; Bluebook practice
   reports show counts. The mapping from band to 0–1 needs an owner
   decision and belongs in `docs/database.md` when implemented.
2. **Coverage share.** 60% of weeks for coverage in foundations mode
   is a starting constant. Revisit once a few plans have run.
3. **Study days and full tests.** A 3-hour full test needs a day the
   student marked available; if none has enough room, schedule it on
   the weekend regardless and say so.
4. **Existing active plans.** Six in production. Phase 2's hub should
   render them (no `phases`; treat as a single focus phase). No
   migration of their tasks.
5. **Tutor visibility of intake answers.** Prep level, intent, the
   free-text focus line, and reported tests should appear on the
   tutor's student page. Scope this into Phase 3 unless a tutor asks
   sooner.

---

## 10. Out of scope

- The research block (motivation, attitude, anxiety,
  self-efficacy). No columns, no questions, no consent language.
- Changes to the practice runner, review hub, or lesson library.
- ACT plans. The composer is written test-type agnostic, but intake
  copy and the domain table are SAT-only in this pass.
