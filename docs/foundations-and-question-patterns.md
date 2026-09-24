# Foundations, techniques and unit syllabi — extending the curriculum model

> **Status: Living — adopted design, in delivery.** Written 2026-07-26
> from the owner's pedagogical observations; last verified against the
> codebase 2026-09-24 (§8 added: **question patterns retired in favor
> of techniques**; all four steps shipped — A (schema + rename), B (the
> per-unit tagging screen), C (lesson technique pickers +
> technique-first practice steps) and D (section foundation syllabi,
> 2026-09-24). All three migrations — A's, C's and D's — are in
> production as of 2026-09-24; the tutor "covered in session" action and
> the roster foundations signal, §3.2, shipped 2026-09-24 behind
> migration `20260924180000` — applied to dev, production on the owner's
> go-ahead). §3.4
> step 1 (schema) and step 2 (lesson scope/kind fields, scoped generate
> prefills) landed in July–August as the *pattern* layer; that layer is
> gone — the tables, columns, RPC and admin surfaces it introduced were
> replaced on 2026-09-23 by the technique layer described in §8, which
> now carries the "how a question is solved" grain. §7 (unit syllabi)
> is live behind the `unit_syllabus` flag with an in-app editor. The
> engineering work described in §3 and §8 should update this doc (and
> the ledger in `student-onboarding-and-plan-redesign-2026-09.md`) as it
> lands. The human workstream in §4 is the operating checklist for the
> owner and co-instructors and should be kept true as steps complete.

## 1. Why this exists

The pedagogy loop (upgrade plan Phase 3) keys everything on the
`(domain_code, skill_code)` pair: `curriculum_units` is one row per
skill, `lesson_topics` tags are consumed only at skill grain, the plan
generator emits lesson tasks only as remediation for weak skills, and
"Learn it first" recommendations resolve by skill code.

The owner's in-person teaching includes two lesson kinds that don't
fit that grain:

1. **Foundations** — big-picture method lessons that apply to a whole
   section and are delivered to *every* student, up front, as a
   prerequisite for productive practice. Example: the reading passage
   strategy, which applies equally to all Reading & Writing questions;
   "Desmos: graphing and x-intercepts" and "Desmos: regression" before
   the first Math unit. Today these exist only as one-on-one sessions;
   self-serve students never get them.
2. **Technique lessons** — "here is a tool; here is when to reach for
   it." A technique is *how* a question is solved (graphing to
   x-intercepts, regression, Desmos lists, plugging in answers, Good
   Cop Bad Cop), and it cuts across skills: the SAT splits linear and
   nonlinear content that share one method, word problems and geometry
   questions end in "solve an equation", and one question is often
   solvable by several techniques. The team already authors at this
   grain ("Solve Equations by Regression", "Solve Percent and Percent
   Change Problems with Desmos") but the skill-keyed model could only
   record them as skill-level lessons, losing what they actually teach.

Forcing either into skill tags corrupts the model: a section lesson
tagged to all twelve R&W skills would flip `has_lesson` coverage for
units that have no real skill lesson, spam "Learn it first" on every
miss, and scramble `feature_efficacy` attribution; a technique tagged to
one skill would never drill the same tool in the next unit.

## 2. The model: two axes, plus a behavior

**Content** is the spine: the 29 SAT skills. Units, mastery, coverage
and plan phases stay keyed to it and it does not change (§3.3).
Lessons attach to it through `lesson_topics` at one of three grains:

```
section  →  domain  →  skill
(RW/Math)   (e.g. SEC)  (e.g. BOU)
```

**Technique** is the second axis (§8): how a question is solved. A
technique declares *default applicability* by skill (every question in
those skills counts) and questions can be tagged individually, many
techniques per question. Lessons carry the techniques they teach
(`lesson_techniques`), which is what the practice step after a lesson
narrows to.

**Behavior** — how the lesson enters a student's work:

| Behavior | Trigger | Position | Completion |
|---|---|---|---|
| **Foundational** | none — every student gets it | front-loaded, before drilling its scope | binary (`lesson_progress.completed_at`), tutor can mark "covered in session" |
| **Standard** (instructional/remedial) | weakness or misses in its scope | woven into drills, plans, reports | same progress record, but re-recommendable |

The three lesson kinds are points in this space, not sibling
categories:

- Foundation = tool mechanics (`lessons.kind = 'foundation'`, usually
  section scope) + foundational behavior. Teaches a technique's
  mechanics before the section's first unit.
- Skill lesson = skill scope + standard behavior.
- Technique lesson = skill scope + the technique(s) it applies, standard
  behavior. "Solve linear equations by graphing" (H.A.) and "Advanced
  solving" (P.B.) stay in their units as *applications* of a tool the
  foundation introduced.

### 2.1 Authoring decision rules

When categorizing a lesson idea, answer three questions:

1. **Scope: what is the narrowest content scope at which the advice is
   true?** If it applies to any question in the skill, it's
   skill-scoped. If it applies regardless of skill (passage strategy,
   Desmos fluency, SPR entry mechanics, annotation habits), it's
   section- or domain-scoped.
2. **Technique: which tool does it teach?** Pick from the Techniques
   catalog (or add one). A lesson can teach several. A lesson that
   teaches no particular tool carries none.
3. **Behavior: does every student need it before drilling,
   regardless of their performance?** Yes → foundational.
   Only students who are missing these questions → standard.

Worked examples:

| Lesson idea | Scope | Techniques | Behavior |
|---|---|---|---|
| Reading passage strategy | section: RW | Process and Pre-Answer | foundational |
| Desmos: graphing and x-intercepts | section: Math | Solve by graphing | foundational |
| Desmos: regression | section: Math | Solve by regression | foundational |
| "Solve linear equations by graphing" | skill: H.A. | Solve by graphing | standard |
| "Advanced solving" | skill: P.B. | Solve by regression | standard |
| "Boundaries in the fastest order" | skill: BOU | — | standard |
| "Transitions: bracket the pivot" | skill: TRA | Good Cop Bad Cop | standard |

### 2.2 Precedence when scopes overlap

For **remediation** (a student misses questions), recommend the most
specific applicable uncompleted lesson first, falling back up the
hierarchy: skill lesson → domain lesson → the section foundation (only
if uncompleted). For **planning**, foundations front-load
unconditionally; standard lessons schedule where the unit's syllabus
(§7) places them.

## 3. Architecture

### 3.1 Schema

**Techniques** — see §8.2 for the four tables (`techniques`,
`technique_skills`, `question_techniques`, `lesson_techniques`) and the
`set_question_techniques()` write path. Migration `20260923120000`
(techniques replace question patterns).

**`lessons.kind`** — `'standard' | 'foundation'`, default
`'standard'`, plus `foundation_sequence integer` (ordering of
foundations within their scope; null for standard lessons). Migration
`20260727190000`.

**`lesson_topics` scope grains** — three grains (section, domain,
skill), exactly one coherent grain per row, enforced by the
`lesson_topics_one_grain` check: section-level (`section` set, others
null), domain-level (`domain_name` set, `skill_code` null), skill-level
(`domain_name` + `skill_code`). `section` is `'math' |
'reading_writing'`, matching `get_plan_inputs`. `lesson_revision_topics`
mirrors the same shape for the tutor draft flow.

**`lesson_progress.covered_by` / `covered_at`** — the tutor's "covered
in session" record (migration `20260924180000`; dev 2026-09-24,
production on the owner's go-ahead): who recorded a lesson as covered
live and when, both null for a completion the student earned in the
app. Written only through `mark_lesson_covered(student, lesson)` and
`unmark_lesson_covered(student, lesson)` — SECURITY DEFINER, gated on
`is_teacher()` (teacher, manager or admin) and `can_view(student)`; a
trigger keeps the two columns off-limits to anyone but staff and the
service role, so a student's own RLS-scoped progress writes cannot
forge attribution. The mark upserts a completed row (the first mark
wins; a student's earlier completion is kept); the undo deletes a row
the mark created outright or, when the student had started the lesson,
keeps their progress and withdraws only the mark's completion stamp.
The generator's skip rule reads `completed_at` either way.

Do **not** repurpose `concept_tags` for any of this — it is a free-form
staff notebook with manager/admin-only RLS; a pedagogical join key
needs a controlled vocabulary and student-readable rows.

### 3.2 Consumer rules

| Consumer | Change |
|---|---|
| `lib/lesson/recommend.ts` | Becomes scope-aware. Resolution follows the §2.2 precedence chain; an uncompleted section foundation is surfaced ahead of (not instead of) the specific lesson. |
| `lib/plan/generate-plan.ts` | Foundations: one syllabus per section ("Before Math", "Before Reading & Writing", §8.6) walked before the section's first unit in coverage, or before the section's first task in targeted/self-directed plans; already-completed foundations are skipped (`lesson_progress`), so tutored students who did them live are never re-assigned (§4 step 5). Unit syllabi: §7. |
| Drill builders (syllabus practice steps, end-of-lesson "Practice this now", session creation) | Draw from the step's skills narrowed to the preceding lesson's techniques: tagged or default-applicable questions first, topped up from the skill when short. `filter_criteria.technique_ids` carries the narrowing; the session records how many matched. |
| Dynamic detours (upgrade plan §3.2) | Prefer an easier same-technique question over same-skill; when a skill has no tagged lesson, the section foundation is the fallback "step back" offer. |
| `feature_efficacy` (§3.5) | Scoped tags expand to member skills for pre/post measurement: a section-tagged foundation is measured across the whole section's skills. Technique-level efficacy is a later addition (§8.7). |
| `/welcome` wizard + Today | A new student's first plan opens with foundations — the digitized version of the owner's first one-on-one sessions. |
| Tutor roster + student page | **Shipped 2026-09-24.** The roster's Foundations column — "Covered", or "n of N", with a *fewest covered first* sort — counts the section syllabi's published lesson steps a student has done, completed in the app or covered in session alike, and links to the student page's Foundations card. There, grouped "Before Math" / "Before Reading & Writing", each lesson shows where the student stands (not yet · started in the app · completed in the app · covered in session, with who and when) and **Mark covered** records a lesson taught live through `mark_lesson_covered()`; **Undo** withdraws it. Nothing shows until a section syllabus has a published lesson. Loader and pure helpers: `lib/lesson/foundations.ts`. |

### 3.3 Deliberate non-changes (guardrails)

- **The syllabus layer stays at skill grain.** `curriculum_units`
  remains 29 rows; coverage, mastery snapshots, and plan *scheduling*
  do not descend below the skill. Techniques are a second axis for
  drills, lessons, and reports — per-student technique-level mastery
  would be statistically noisy and would bloat plans.
- **Scoped tags do not flip `has_lesson`.** A unit counts as
  lesson-covered in `get_plan_inputs` / `/admin/content/units` only
  via skill-grain content. Publishing one passage-strategy foundation
  must not mark twelve R&W units covered. A technique link never
  counts as coverage either.
- **Foundations never hard-block.** They order and nudge (front-load
  position, "start here" chips); drills are never locked behind them —
  consistent with hints and detours being offers, not gates.
- **Foundations stay out of the mastery math.** Their effect is
  measured by `feature_efficacy` at section scope, not by a synthetic
  skill score.
- **Techniques narrow, never exclude.** A technique-narrowed drill fills
  from the rest of the skill when the technique runs short, so a thin
  catalog never starves a student. There are no per-question
  exclusions.
- **Test runner untouched** (Bluebook parity, as always).

### 3.4 Engineering sequence

1. **Schema (landed 2026-07-27; superseded in part 2026-09-23).**
   Migration `20260727190000` added
   `lessons.kind` / `foundation_sequence` and the `lesson_topics`
   grains, which stand, and a per-skill question-pattern catalog with a
   single-pattern column on `questions_v2`, which did not survive
   contact with the owner's first unit (§8.1). Guardrail confirmed
   against the live `get_plan_inputs`: `has_lesson` matches
   `lesson_topics.skill_code` only, so section-grain rows cannot flip
   unit coverage.
2. **Admin surfaces (landed 2026-07-27 → 2026-08-16, reworked
   2026-09-23).** The units worklist's per-unit "Generate lesson" link
   carries `?skill=`; the generate page prefills the brief from scope
   facts (taxonomy names, published depth + difficulty mix,
   `expected_minutes`) and stamps the matching `lesson_topics` row on
   save; the lesson builder gained kind/foundation-order fields and a
   Scope-tags editor (section + skill grains). The pattern catalog,
   CSV importer and per-question single-select picker that shipped in
   August were replaced by the Techniques catalog, the per-question
   technique tags and the technique-narrowed draw (§8.5, step A).
3. Consumers, in dependency order: technique-narrowed practice steps
   and pickers (§8.5 steps B–C) → section foundations (§8.5 step D) →
   `recommend.ts` chain → detours → efficacy expansion →
   wizard/Today/roster surfaces.
4. Tutor "mark covered" action + roster foundations signal —
   **landed 2026-09-24** (migration `20260924180000`; §3.1, §3.2).
5. Each step behind normal review; user-facing changes ride
   `feature_flags` if staged rollout is warranted (foundations
   front-load changes every new plan — it rides the `unit_syllabus`
   switch, which is off in production until the owner turns it on).

## 4. The human workstream (owner + co-instructors)

This is the practical checklist. Artifacts marked **[now]** can be
drafted today in a doc or spreadsheet; **[in-app]** are done inside the
admin account — there is no CSV path anymore, by the owner's direction
(2026-09-22).

### Step 1 — Inventory the foundations **[now]**

List every lesson you currently deliver one-on-one to *all* students.
For each, record:

| Field | Prompt |
|---|---|
| Working title | e.g. "Reading passage strategy", "Desmos: regression" |
| Scope | RW section / Math section / a domain |
| Technique(s) | Which tool it introduces — that becomes the technique the unit lessons later apply |
| Order | If a student had one hour before their first drill, what comes first? This becomes `foundation_sequence`. |
| Length | Target 10–20 minutes as a lesson; split anything longer. |
| "Done" check | 2–4 check questions that prove the method was absorbed (these become `check` blocks; the lesson isn't complete until they're passed). |
| Universality test | Would you skip this for any student? If yes for many, it's a standard lesson, not a foundation. |

Things to think about:

- **Keep the list short.** Expect 3–6 per section. Foundations are the
  material you'd never let a student skip — not everything useful.
- **Foundations = tool mechanics; unit lessons = applications.** Teach
  what regression *is* once, before Math; teach "solve this unit's
  equations by regression" inside each unit that uses it.
- **Personal-preference vs. platform method.** If co-instructors teach
  a step differently, reconcile before authoring: the platform version
  becomes *the* Studyworks method every self-serve student learns.
- **What replaces your delivery.** These lessons stand in for you in a
  live session. Budget for a short video block (the builder supports
  `video` blocks) where tone and demonstration matter — passage
  annotation in particular is hard to teach in text alone.

### Step 2 — Build the Techniques catalog **[in-app]**

`/admin/techniques`. One entry per tool you teach; expect a dozen or so
across both sections, not one per question format. For each technique:

| Field | Prompt |
|---|---|
| Name | The name you use in the room: "Solve by regression", "Good Cop Bad Cop" |
| When to use it | One sentence a student matches *before* solving — **the highest-value field.** It becomes UI copy and the lesson's opening line. If you can't write a crisp cue, it isn't a technique. |
| The process | The steps you teach, in 1–3 lines (full detail goes in the lesson later). |
| Applies to | The skills where *every* question counts (Good Cop Bad Cop = every R&W skill except Form, Structure, and Sense). Use the all-Math / all-R&W shortcuts. Leave empty for a tool that only fits questions you tag one by one. |

Rules of thumb:

- **Recognizable from the question alone.** A student must be able to
  pick the technique *before* solving. "Questions students find
  tricky" is not a technique.
- **One tool, many units.** If the same method shows up under H.A.,
  H.D., P.C. and Q.B., it is one technique with several default skills
  (or several lessons that apply it), never four catalog entries.
- You can also add a technique from inside a unit's syllabus editor
  when the practice step needs one.

### Step 3 — Tag the question bank **[in-app]**, per unit, on demand

Tagging happens when a unit's syllabus is being built — never big-bang
across all 3,381 questions. Two paths, both writing the same rows
(`question_techniques`, via `set_question_techniques()`), and
`/admin/techniques` shows who tagged what:

1. **The unit's tagging screen** (`/tutor/tagging`, then a unit; §8.5
   step B): the unit's published questions one at a time with the
   answer in view, technique checkboxes (keys 1–9), Save & next
   (Enter), Skip, "N of M tagged", untagged first. Managers can help
   from their sidebar's "Tag questions"; a co-instructor can take a
   unit.
2. **Opportunistically**: any manager or admin reviewing an assignment,
   a practice session, a test result, or a question page gets the
   technique tags under the question and can add one in seconds.

Human review protocol: tag the technique(s) you would *actually use* on
the question; a question that a default-applicable technique already
covers needs no tag; when a whole skill fits a technique, set it as a
default skill on the technique instead of tagging every question.
AI-suggested tags are a later addition (§8.7).

### Step 4 — Author the lessons **[in-app]**, priority order

Use the existing generate flow (`/admin/lessons/generate`, which
prefills from `?technique=` or `?skill=`) + builder review; the builder
carries kind/scope fields and, from step C, a technique picker.

Priority: **foundations first** — the list is short, the reach is
every student, and they unblock the "Before Math" / "Before Reading &
Writing" syllabi. Then technique and skill lessons for the units you
are building, in the order `/admin/curriculum` walks them.

Structural templates:

- **Foundation**: why this tool → the mechanics (video where
  demonstration matters) → worked demonstration → completion check
  (the step-1 "done" questions, with branch-remediation on misses).
  Its practice step is a mixed set across the technique's default
  skills.
- **Technique lesson**: "when to use it" up front → the process,
  numbered → one worked example → 2–3 checks with branch/rejoin
  remediation → the unit's practice step drills the unit's questions
  for that technique. The worked solutions must demonstrate the
  technique, never a general path.
- Keep using `lesson_topics` skill tags for skill lessons exactly as
  today; nothing about §3 changes existing authoring.

### Step 5 — Backfill your current students **[in-app]**

When foundations publish, existing students have mostly already had
them live. Before enabling plan front-loading, tutors sweep their
rosters with **mark covered in session** for each student/foundation
actually delivered. Un-marked students get the foundation front-loaded
into their next plan regeneration — which is exactly right for anyone
who joined recently and skipped it. Assign this sweep explicitly to
each co-instructor for their own roster; it's minutes per student.

In the app (since 2026-09-24): Roster → sort by *Foundations (fewest
covered first)* → open a student → the **Foundations** card → **Mark
covered** on each lesson delivered live (Undo withdraws a slip). The
column and the card appear once a section syllabus has a published
lesson, and they do not wait for the syllabus switch — the sweep is
meant to happen before it goes on.

### Step 6 — Watch efficacy and iterate **[in-app]**

The `/admin/lessons` efficacy column already measures pre/post
first-attempt accuracy per tagged skill; §3.2 extends it to section
scope (foundations). Review monthly:

- A foundation that doesn't move section accuracy is a red flag on
  the *digitization*, not necessarily the method — compare against
  students who got it live (their gains are the benchmark).
- A technique lesson with flat efficacy usually means the "when to use
  it" isn't landing — students aren't recognizing the moment under
  test conditions. Sharpen the cue before rewriting the process.

### Adjacent (optional, same muscle): prerequisite graph

`curriculum_units.prerequisite_unit_ids` is still empty and
owner-authored by design (e.g. H.A. before H.D.). Drafting it is the
same kind of tutor-knowledge capture as steps 1–2 — batch it into the
same working sessions if convenient, but it is not required for
anything in this document.

## 5. Sequencing summary

| Order | Who | What | Depends on |
|---|---|---|---|
| 1 | Owner + co-instructors | Foundation inventory (step 1); the Techniques catalog (step 2) | nothing — the catalog is live at `/admin/techniques` |
| 2 | Engineering | Techniques layer steps B–D (§8.5): tagging screen, lesson pickers + technique-first practice steps, section foundations | step A (shipped 2026-09-23) |
| 3 | Owner + co-instructors | Build units in `/admin/curriculum`; tag their questions (step 3); author foundations (step 4) | 2 (tagging screen for step 3; B–C for the practice option) |
| 4 | Engineering | Recommendation chain, detours, efficacy expansion, roster signal (§3.2) | 3 |
| 5 | Both, ongoing | Turn the syllabus switch on; backfill rosters (step 5); efficacy review (step 6) | 4 |

## 6. Decisions taken / still open

Taken (revisit deliberately, not by drift):

- **Two axes, content and technique** (§8.1). Content is the spine and
  does not change; technique cuts across it.
- **Many techniques per question, default-by-skill plus explicit
  tags, no exclusions** (§8.1). This supersedes the July decision of
  one primary pattern per question: real questions are solvable by
  several tools, and a tool that fits a whole skill should not need
  100 tags.
- **Foundations nudge, never gate** (§3.3).
- **Syllabus/mastery stay at skill grain** (§3.3).
- **`concept_tags` untouched** — separate concern, different
  governance.
- **No CSV / no codes as primary labels** for any of the authoring
  surfaces (owner direction 2026-09-22).

Open, owner to decide:

- Should foundations **re-surface near test day** (a "refresher" plan
  task in the final weeks), or is once enough?
- Is there a **domain-scoped foundation** in practice (e.g. an essay
  of the SEC grammar approach), or do all foundations land at section
  scope? The schema supports both; the inventory will tell.

## 7. Unit syllabi (added 2026-09-22)

### 7.1 Why

The generator's coverage phase emitted one "lesson" task per skill,
resolved to a bank lesson only when the student pressed Start (first
published skill-tagged lesson, alphabetically), followed by one
skill-wide drill. That model assumed one lesson per skill. The owner's
teaching does not work that way: a unit is a *sequence* — teach one
technique (solve by graphing), practice it on adapted examples, teach
the next (solve by regression), practice, then a mixed homework set —
and a technique lesson is reused across units (regression under H.B.,
P.C., Q.D.). In production 8 of 29 skills carry two to five lessons,
and 15 of 44 pending lesson tasks resolved to whichever lesson sorted
first, sometimes the same lesson under three different skill titles.

There is no intro drill: the lesson's own check blocks and interactive
elements are the examples (owner note 2026-09-22).

### 7.2 Model

`curriculum_unit_steps` — an ordered syllabus per unit (migration
`20260922120000_curriculum_unit_steps.sql`, applied to dev and
production 2026-09-22), and since step D (migration `20260924150000`)
also the two section foundation syllabi: rows with a `section`
(`math` | `reading_writing`) and no `unit_id`, exactly one of the two
per row, positions unique per syllabus, `test_type` on the row. Units
stay at skill grain (§3.3); the syllabus is intra-unit detail.

| Column | Meaning |
|---|---|
| `kind` | `lesson` or `drill` |
| `lesson_id` | the bank lesson (kind = lesson); the same lesson may appear in several units |
| `role` | `practice` (the questions for the lesson just taught) or `mixed` (homework across the unit and its domain's earlier units) |
| `skill_codes` | widens a drill beyond the unit's skill; null = the unit's skill, or for a mixed set the domain's units walked so far (max 4) |
| `technique_source` | practice steps: `lesson` (default) = narrow to the techniques of the lesson step just before it (`lesson_techniques`); `none` = the whole skill (or the chosen skills); `explicit` = this step's `technique_ids`. Mixed sets never narrow; lesson steps ignore it. |
| `technique_ids` | the explicit list when `technique_source = 'explicit'`, else null. Matching questions (tagged, or default-applicable by skill) are drawn first and the launcher tops up from the skills when short; the task's why-line says so and names the techniques. |
| `question_count`, `minutes` | null = 8 (practice) / 10 (mixed) and the unit's minutes |
| `skip_if_completed` | lesson steps: skip when `lesson_progress.completed_at` is set (default true) |
| `section`, `test_type` | a section foundation syllabus ("Before Math" / "Before Reading & Writing") instead of a unit. A foundation's practice step draws across the skills the preceding lesson's techniques apply to (`technique_skills`), technique questions first; a mixed set draws from the whole section. |

`curriculum_units.syllabus_authored_at` marks a human-authored
syllabus; every SAT unit was backfilled with a **default two-step
syllabus** (the lesson the launcher would have picked, then an
8-question practice drill) so output is unchanged until a real one is
authored.

### 7.3 Generator (flag `unit_syllabus`)

`lib/plan/unit-steps.ts` loads the syllabi and the student's completed
lessons when the flag is `on`; every generator caller (wizard,
tutor generate, re-pace interactive + cron, remaining-weeks
regeneration, tutor week regeneration) passes them through. With them:

- **Coverage** walks each unit's steps in order. A lesson step is the
  unit's opening move for everyone — the self-assessment no longer
  skips lessons; the student's own *Mark complete* (or *Mark done* on
  the plan task, which now stamps `lesson_progress`) is the skip
  mechanism, and it carries across units because the record is per
  lesson. A lesson already on the draft is not scheduled twice. A
  second pass over the curriculum revisits only mixed sets (else the
  unit's last drill), never re-teaches.
- **Targets** (self-directed) walks the chosen units' syllabi the same
  way.
- **Focus / rehearsal** picks, for a ranked weak skill, the unit's
  first unclaimed lesson ("Learn it first"), else cycles the unit's
  drills. Reassigning the specific lesson whose drill went worst needs
  per-drill outcomes and is a follow-up.
- **Foundations** (step D): a section's foundation syllabus is walked
  to exhaustion before the first task of that section in any phase —
  in coverage before the section's first unit, in targeted /
  self-directed plans before the section's first focus or target task
  — the pool's own walk holding still meanwhile. Completed or
  already-scheduled foundation lessons are skipped (their practice
  step still runs), each foundation is scheduled once, and the plan
  rationale says how many come first per section. Foundation payloads
  carry `section` and `foundation: true`, no skill; "Foundation: <lesson
  title>" / "Practice: <lesson title>" / "Mixed practice: <section>",
  why-line "Foundations first: taught before your first Math topic."
  The launcher opens the pinned lesson and, for a drill with no skills
  of its own, draws across every skill in the section.
- Payloads: lesson tasks carry `lesson_id` + the lesson's own title
  ("Lesson: Solve Equations by Graphing…"); drills carry
  `skill_codes`, `drill_role`, optional `technique_ids`, the
  `lesson_id` they exercise ("Practice: <lesson title>"), and
  `unit_step_id`.

Without the flag (or for units with no rows) the pre-syllabus
behavior is byte-for-byte unchanged; `lib/plan/unit-syllabus.test.mjs`
covers the walk.

### 7.4 Authoring (landed 2026-09-22)

Built for a non-technical editor working entirely inside the admin
account (owner direction 2026-09-22: no spreadsheet or CSV path). The
sidebar gains **Curriculum** (`/admin/curriculum`):

- **Curriculum home**: a "Before the units" block with the two
  foundation syllabi ("Before Math", "Before Reading & Writing":
  outline, status, Build/Edit), then every SAT unit in teaching order,
  grouped Math then Reading & Writing, with its syllabus outline and a
  status the editor can act on (Authored · Default — not yet authored ·
  needs attention: no steps / no lesson / an unpublished lesson). A
  "How to build a unit" note states the teaching sequence in plain
  words, foundations included.
- **The switch**: "Study plans use these syllabi: On/Off" flips the
  `unit_syllabus` flag through a Server Action (feature_flags'
  `ff_write` policy is `is_admin()`), with a confirm that says what
  changes for students. No SQL involved.
- **Unit editor** (`/admin/curriculum/<unit>`): steps as numbered
  cards in teaching order — Lesson · Practice · Mixed set — each with
  move up/down, Edit, Remove, and an "add a step here" insert point
  between cards plus "Add a step" at the end. Adding a lesson opens a
  searchable picker (title, status, "Teaches: <skills>", "Also in:
  <units>"; lessons tagged to the unit listed first). Practice and
  mixed sets ask "How many questions?" and "Which questions?" — this
  unit's skill (or, for a mixed set, everything covered so far in the
  domain) or skills chosen by name. A practice set's "Which
  questions?" offers four answers (step C): **Questions for the lesson
  just taught — its techniques first** (preselected), **Any question
  in the skill**, **Choose the skills myself**, and **Specific
  techniques** (checkboxes over the catalog, the unit's
  default-applicable techniques first, with an inline "New technique"
  form that pre-fills this unit's skill as its default). Step cards
  say what a practice set narrows to ("Solve by regression first", or
  "any technique (the lesson before it has no techniques yet)") and
  lesson cards list what they teach. A "what a student will see" panel
  runs the generator's own `expandUnitSyllabus`, so the preview is the
  exact task list a plan emits, why-lines included. "Start over with
  the default" resets the unit. Every edit stamps
  `syllabus_authored_at`.
- **Section editor** (`/admin/curriculum/section/<math|reading_writing>`,
  step D): the same editor scoped to a section. Foundation-kind lessons
  list first in the picker; a practice set's "Which questions?" reads
  "the skills the lesson's techniques apply to" / "any question in
  Math" / chosen skills / specific techniques, and a mixed set is the
  whole section; the preview runs `expandSectionSyllabus`. No default to
  reset to — empty means no foundations, and plans go straight to the
  units.
- **Tutor editor**: "Unit syllabus" in the add-task type list drops a
  unit's whole syllabus into a week as tutor tasks (completed lessons
  skipped, one step per day), not gated on the flag.
- Field validation lives in `lib/admin/unitSyllabus.ts` (unit-tested)
  and is shared by the editor's forms and its Server Actions.
  Reordering and insert-at renumber through a +1000 offset so the
  `(unit_id, position)` unique index never trips mid-write.
- The units worklist keeps its coverage and planning-settings views
  and links each unit to its editor.

### 7.5 Still to build

1. ~~Tutor "covered in session" (writes a completed `lesson_progress`
   row) and a roster "foundations covered" signal (§3.2), so tutors can
   backfill students who did the foundations live (§4 step 5).~~
   **Shipped 2026-09-24** — §3.1 (schema), §3.2 (surfaces), §4 step 5
   (how to run the sweep).
2. Focus-phase lesson reassignment from per-drill outcomes.
3. Pacing copy: a syllabus unit is ~2.5 hours, so at 5 hours/week the
   coverage phase covers ~2 units/week and short runways will not fit
   every unit; the rationale should say so.

## 8. Techniques replace question patterns (2026-09-23)

### 8.1 Why, and the decisions

The owner started building the first unit (H.A., Linear equations in
one variable) in the curriculum editor and hit the limit of the
pattern layer immediately: a practice drill could only target a whole
skill, but the drill after "Solve by regression" needs *the questions
regression solves*. A pattern was scoped to one skill and a question
could hold only one, while techniques cut across skills (the SAT
splits linear/nonlinear content that shares one method; word problems
and geometry questions end in "solve an equation") and one question is
solvable by several. The pattern catalog held two rows in production
with nothing tagged, so replacing it cost nothing.

Decisions, made with the owner (do not relitigate):

1. **Two axes.** *Content* = the 29 SAT skills — units, mastery,
   coverage and plan phases stay keyed to it; it is the spine and does
   not change. *Technique* = how a question is solved; it cuts across
   skills and domains.
2. **Replace "question patterns / question types" with
   "Techniques"** — in schema, code and every piece of UI copy.
   Nothing is called a pattern or question type anymore.
3. **A technique declares default applicability by skill** (a list of
   skills where every question counts) **and questions can be tagged
   individually, many techniques per question.** No per-question
   exclusions for now.
4. **Lessons carry the techniques they teach** (one or several).
5. **The practice step after a lesson draws from the unit's skill(s)
   narrowed to that lesson's techniques**, tagged/default-applicable
   questions first, topping up from the rest of the skill when short
   (the task's why-line says so). Mixed sets draw from the unit's
   skills regardless of technique. The same lesson reused in another
   unit therefore drills that unit's questions for the same technique —
   the intended way to teach a tool in several units.
6. **Foundations = tool mechanics; unit lessons = applications.**
   Foundations live in one syllabus per section ("Before Math",
   "Before Reading & Writing"), built in the same editor, walked by the
   generator before the section's first unit in coverage (or before
   the section's first task in targeted/self-directed plans), skipped
   when already completed. A foundation's practice step is a mixed set
   across its techniques' applicable skills.
7. **Question tagging is done in-app** by admins/managers on a per-unit
   tagging screen; everything is usable by a non-technical owner with
   no CSV and no codes as primary labels.

### 8.2 Schema

Migration `20260923120000` (techniques replace question patterns;
applied to dev 2026-09-23; production on the owner's go-ahead).

| Table | Columns | RLS |
|---|---|---|
| `techniques` | `id`, `test_type`, `name` (unique per test), `description` ("when to use it"), `process_summary`, `section` (`math` / `reading_writing` / null = both — catalog grouping only), `sequence`, timestamps | select all authenticated; write `is_admin()` |
| `technique_skills` | `(technique_id, skill_code)` — default applicability | same |
| `question_techniques` | `(question_id, technique_id)`, `tagged_by`, `tagged_at` — explicit tags, many per question | select all; managers write through `set_question_techniques()` (SECURITY DEFINER, `is_manager()`, replaces the question's whole set, same shape as the retired `merge_concept_tags`-style RPC); admins may write directly |
| `lesson_techniques` | `(lesson_id, technique_id)` — what a lesson teaches | select all; write `is_admin()` |

`curriculum_unit_steps.technique_ids uuid[]` replaces the single
per-step pin (drill steps only; a trigger scrubs a deleted technique out
of every step). Retired in the same migration: the pattern table, the
per-question column and its attribution columns, the drafts column, the
scope-grain column on `lesson_topics` and `lesson_revision_topics`
(their one-grain checks and unique indexes were rebuilt on three grains,
and `create_lesson_revision` / `publish_lesson_revision` redefined
without it), and the single-select tagging RPC. The two production
pattern rows carried over as techniques with the pattern's skill as
their one default skill, keeping their ids.

### 8.3 What a question "matches"

A question matches a technique when it is tagged to it explicitly
**or** its skill is one of the technique's default skills.
`lib/practice/technique-match.ts` (pure, unit-tested) partitions a
candidate list into matching / rest; every drill draw that narrows to
techniques takes the matching group first — each group ordered
unanswered-first, then already-answered — and fills from the rest. The
practice session's `filter_criteria` records `technique_ids` and
`technique_matched`.

### 8.4 Admin surfaces

- **Techniques** (`/admin/techniques`, sidebar entry between
  Curriculum and Lessons): grouped Math / Reading & Writing / both, in
  catalog order; name, when to use it, process; "Applies to" in plain
  words ("Every Math question", "Every question in Linear equations in
  one variable, …"); tagged-question, lesson and syllabus-step counts;
  create / edit / reorder / delete with the delete's real cost stated
  first; a "Recently tagged" audit strip; a "Lesson" button into the
  generate flow (`?technique=` prefills the brief with the cue, process
  and where it applies, and the saved lesson gets a `lesson_techniques`
  link).
- **Curriculum editor**: a practice set's "Which techniques?"
  checkboxes with inline create (§7.4); step cards say "<technique>
  first".
- **Review surfaces** (assignment reports, session review, test
  results, question page): "Techniques" under the question for
  managers and admins — default-applicable techniques shown as muted,
  non-removable chips; explicit tags as removable chips; an "+ Add
  technique…" select with the question's section first.
- `/admin/questions?technique=<id>` lists a technique's tagged
  questions (linked from the catalog's counts).

### 8.5 Build order (one PR each, verified in dev as admin first)

- **A. Schema + rename — shipped 2026-09-23.** Everything above; the
  retired terms are enforced by `scripts/check-code-hygiene.mjs`.
- **B. Tagging screen — shipped 2026-09-23.** `/tutor/tagging` (every
  unit with its progress; manager + admin) and `/tutor/tagging/<unit>`:
  the unit's published `pool = 'standard'` questions one at a time,
  rendered by the shared renderer in teacher mode with the answer and
  rationale, technique checkboxes with keys 1–9, Save & next (Enter),
  Skip (S / →), Previous (←), "N of M tagged", an order switch
  (untagged first · in order · tagged only), and a note of the
  techniques that already apply to the whole skill. Lives in the tutor
  tree because the admin tree redirects managers; admins link in from
  the Curriculum home, each unit editor and the Techniques page,
  managers from their sidebar. Writes through `set_question_techniques()`.
  Questions load one step ahead through a Server Action; the first is
  server-rendered. The seam for AI suggestions is the view-model's
  `suggestions` list (always empty today), which the panel renders as
  one-click chips when present.
- **C. Lessons + practice steps + draw — shipped 2026-09-24.**
  Migration `20260924120000` (dev; production on the owner's
  go-ahead): `curriculum_unit_steps.technique_source` (`lesson` |
  `none` | `explicit`, default `lesson`) and
  `lesson_revision_techniques`, with `create_lesson_revision` copying a
  lesson's techniques into a draft and `publish_lesson_revision`
  writing them back. A "Techniques" section on the lesson editor (admin
  builder and the tutor draft flow) links what a lesson teaches; the AI
  generate page has a "Techniques this lesson teaches" picker
  (preselected from `?technique=`) saved with the lesson; the admin
  review of a proposal counts technique changes. In the unit editor a
  practice set's "Which questions?" defaults to the lesson just taught.
  The generator (pure, `lib/plan/unit-syllabus.test.mjs`) carries each
  lesson step's techniques and writes the preceding lesson's
  `technique_ids` into a practice drill's `filter_criteria` unless the
  step says `none` or `explicit`; a completed (skipped) lesson still
  narrows the practice after it; mixed sets never narrow. The drill's
  why-line says what comes first ("Questions solved by Solve by
  regression come first, then the rest of Linear equations in one
  variable."); a real reason (focus phase) precedes it, a silent
  coverage/targets code yields to it. The launcher (step A) draws
  technique-matching questions first, tops up from the skills and
  records `technique_matched`.
- **D. Section foundations — shipped 2026-09-24.** Migration
  `20260924150000` (dev and production, 2026-09-24):
  `curriculum_unit_steps.unit_id` nullable, `section` + `test_type`
  columns, exactly one of unit/section per row, positions unique per
  section syllabus. Two "Before …" syllabi on the Curriculum home and a
  section editor (§7.4); the generator front-load per decision 6 (§7.3)
  with a rationale sentence; the launcher's section fallback. The
  tutor "covered in session" action followed the same day (§3.2, §7.5).

### 8.6 Guardrails

Students see nothing new until the owner turns the syllabus switch on.
Units, mastery, coverage and phases do not change. v2 tables only;
Server Actions via `actionOk`/`actionFail`; auth via `requireRole`;
`npm run typecheck`, `npm run test:unit`, `node
scripts/generate-auth-matrix.mjs` and `node
scripts/check-code-hygiene.mjs` before every PR.

### 8.7 Later, not now

AI tag suggestions; technique-level efficacy/accuracy; focus-phase
"reassign the lesson whose drill went worst"; pacing copy for
syllabus-length plans.
