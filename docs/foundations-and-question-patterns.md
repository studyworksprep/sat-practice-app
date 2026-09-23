# Foundations and question patterns — extending the curriculum model

> **Status: Living — adopted design, partially implemented.** Written
> 2026-07-26 from the owner's pedagogical observations; last verified
> against the codebase 2026-09-22 (§7 added). §3.4 step 1 (schema) and most of
> step 2 (lesson scope/kind fields, scoped generate prefills, the
> pattern-catalog editor, and question→pattern tagging in the review
> surfaces) have landed; the content-drafts picker, the classification
> queue, and every consumer in step 3 have not. The engineering work described in §3
> should update this doc (and the upgrade-plan ledger) as it lands.
> The human workstream in §4 is the operating checklist for the owner
> and co-instructors and should be kept true as steps complete.

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
   strategy, which applies equally to all Reading & Writing questions.
   Today these exist only as one-on-one sessions; self-serve students
   never get them.
2. **Question-pattern lessons** — "when you see this format, run this
   process." Narrower than a skill: a recognizable question format
   within a skill, with a rehearsed procedure. The team is already
   authoring at this grain (see `docs/lesson-template-specs/` —
   "Solve SAT Boundaries Questions in the Fastest Order", "Solve
   Percent and Percent Change Problems with Desmos") but the model can
   only record them as skill-level lessons, losing the specificity.

Forcing either into skill tags corrupts the model: a section lesson
tagged to all twelve R&W skills would flip `has_lesson` coverage for
units that have no real skill lesson, spam "Learn it first" on every
miss, and scramble `feature_efficacy` attribution.

## 2. The model: one scope axis, one behavior axis

Every lesson is described by two independent properties:

**Scope** — where on the content hierarchy the lesson attaches.
Four grains, one axis:

```
section  →  domain  →  skill  →  question pattern
(RW/Math)   (e.g. SEC)  (e.g. BOU)  (e.g. "two blanks joined by a semicolon")
```

**Behavior** — how the lesson enters a student's work:

| Behavior | Trigger | Position | Completion |
|---|---|---|---|
| **Foundational** | none — every student gets it | front-loaded, before drilling its scope | binary (`lesson_progress.completed_at`), tutor can mark "covered in session" |
| **Standard** (instructional/remedial) | weakness or misses in its scope | woven into drills, plans, reports | same progress record, but re-recommendable |

The three lesson kinds are points in this two-axis space, not three
sibling categories:

- Foundation = coarse scope (usually section) + foundational behavior.
- Skill lesson = skill scope + standard behavior.
- Pattern lesson = pattern scope + standard behavior.

Other combinations are legal where they make sense (a domain-scoped
standard lesson; in principle a skill-scoped foundation).

### 2.1 Authoring decision rules

When categorizing a lesson idea, answer two questions:

1. **Scope: what is the narrowest scope at which the advice is
   true?** If the process only works when you recognize a specific
   format, it's pattern-scoped. If it applies to any question in the
   skill, it's skill-scoped. If it applies regardless of skill
   (passage strategy, Desmos fluency, SPR entry mechanics,
   annotation habits), it's section- or domain-scoped.
2. **Behavior: does every student need it before drilling,
   regardless of their performance?** Yes → foundational.
   Only students who are missing these questions → standard.

Worked examples:

| Lesson idea | Scope | Behavior |
|---|---|---|
| Reading passage strategy | section: RW | foundational |
| Desmos fluency / calculator strategy | section: Math | foundational |
| SPR answer-entry mechanics | section: Math | foundational |
| "Boundaries in the fastest order" | skill: BOU | standard |
| "Percent change with Desmos" | pattern (or skill) under Q.B. | standard |
| "Transitions: bracket the pivot" | skill: TRA | standard |
| "System has no solution — parallel lines" | pattern under H.D. | standard |

### 2.2 Precedence when scopes overlap

For **remediation** (a student misses questions), recommend the most
specific applicable uncompleted lesson first, falling back up the
hierarchy: pattern lesson → skill lesson → domain lesson → the
section foundation (only if uncompleted). For **planning**,
foundations front-load unconditionally; standard lessons schedule
where the generator's weakness logic already places them.

## 3. Architecture

### 3.1 New schema (one migration, then regenerate types)

**`question_patterns`** — a curated sub-skill catalog, reference data
in the same spirit as `curriculum_units` (admin-authored,
student-readable, RLS: select for all authenticated, write for
admin):

```
question_patterns (
  id uuid pk,
  test_type text default 'sat',
  domain_code text not null,
  skill_code text not null,          -- parent skill
  name text not null,                -- short label, e.g. "Punctuation between clauses"
  recognition_cue text not null,     -- the "when you see…" sentence
  process_summary text,              -- the "…do this" in one or two lines
  sequence integer not null,         -- teaching order within the skill
  unique (test_type, domain_code, skill_code, name)
)
```

Naming note: the concept is called a **question pattern** in schema
and code because `questions_v2.question_type` already exists and means
answer format (MCQ vs. SPR). UI copy may still say "question type."
Do **not** repurpose `concept_tags` — it is a free-form staff notebook
with manager/admin-only RLS; a pedagogical join key needs a controlled
vocabulary and student-readable rows.

**`questions_v2.pattern_id`** — nullable FK to `question_patterns`.
One primary pattern per question (see §6 for the deliberate
single-pattern decision). Also added to `question_content_drafts` so
new questions are born classified. Untyped questions are legal
forever; classification is per-skill, on demand (§4 step 3).

**`lessons.kind`** — `'standard' | 'foundation'`, default
`'standard'`, plus `foundation_sequence integer` (ordering of
foundations within their scope; null for standard lessons).

**`lesson_topics` scope grains** — the tagging table grows from two
grains (domain, skill) to four. Add nullable `section text`
(`'math' | 'reading_writing'`, matching `get_plan_inputs`) and
nullable `pattern_id uuid`, with a check constraint enforcing exactly
one coherent grain per row:

- section-level: `section` set, others null
- domain-level: `domain_name` set, `skill_code`/`pattern_id` null (already exists)
- skill-level: `domain_name` + `skill_code` set (already exists)
- pattern-level: `pattern_id` set (its skill is derivable)

The unique index extends accordingly.

### 3.2 Consumer rules

| Consumer | Change |
|---|---|
| `lib/lesson/recommend.ts` | Becomes scope-aware. Input gains optional pattern ids (from the missed questions themselves). Resolution follows the §2.2 precedence chain; an uncompleted section foundation is surfaced ahead of (not instead of) the specific lesson. |
| `lib/plan/generate-plan.ts` | New front-load pass before the weekly weak-skill loop: for each section the plan touches, emit that section's uncompleted foundation lessons (ordered by `foundation_sequence`) in the earliest weeks, before that section's first drills. Completion via the existing `lesson_progress` linkage — already-completed foundations are skipped, so tutored students who did them live are never re-assigned (§4 step 5). |
| Drill builders (`weak-queue`, session creation, plan drill payloads) | `filter_criteria` gains optional `pattern_id`, closing the see-format→run-process loop: pattern lesson, then a drill of exactly that format. |
| Dynamic detours (upgrade plan §3.2) | Prefer an easier same-pattern question over same-skill; when a skill has no tagged lesson, the section foundation is the fallback "step back" offer. |
| `feature_efficacy` (§3.5) | Scoped tags expand to member skills for pre/post measurement: a section-tagged foundation is measured across the whole section's skills; a pattern-tagged lesson is measured on exactly its pattern's questions — the sharpest efficacy signal available. |
| `/welcome` wizard + Today | A new student's first plan opens with foundations — the digitized version of the owner's first one-on-one sessions. |
| Tutor roster | "Foundations covered" becomes a visible per-student signal, plus a one-click **mark covered in session** action (writes a completed `lesson_progress` row) for work done live. |

### 3.3 Deliberate non-changes (guardrails)

- **The syllabus layer stays at skill grain.** `curriculum_units`
  remains 29 rows; coverage, mastery snapshots, and plan *scheduling*
  do not descend to pattern grain. Patterns are intra-skill detail for
  drills, recommendations, and reports — per-student pattern-level
  mastery would be statistically noisy and would bloat plans.
- **Scoped tags do not flip `has_lesson`.** A unit counts as
  lesson-covered in `get_plan_inputs` / `/admin/content/units` only
  via skill-grain (or pattern-grain, rolled up) content. Publishing
  one passage-strategy foundation must not mark twelve R&W units
  covered.
- **Foundations never hard-block.** They order and nudge (front-load
  position, "start here" chips); drills are never locked behind them —
  consistent with hints and detours being offers, not gates.
- **Foundations stay out of the mastery math.** Their effect is
  measured by `feature_efficacy` at section scope, not by a synthetic
  skill score.
- **Test runner untouched** (Bluebook parity, as always).

### 3.4 Engineering sequence

1. Migration: `question_patterns` + `lessons.kind`/`foundation_sequence`
   + `lesson_topics` grains + `questions_v2.pattern_id` (+ drafts
   column). Apply via MCP `apply_migration` per
   `supabase/migrations/README.md`; regenerate `lib/types/database.ts`.
   **✅ Landed 2026-07-27** — migration
   `20260727190000_question_patterns_lesson_scopes.sql`, applied to
   dev + prod via MCP; types regenerated. Constraint probes verified
   in dev (one-grain check rejects mixed rows, section values
   restricted to `math`/`reading_writing`, `foundation_sequence`
   rejected on standard lessons, pattern delete cascades its tags and
   nulls its questions). Guardrail confirmed against the live
   `get_plan_inputs`: `has_lesson` matches `lesson_topics.skill_code`
   only, so section-/pattern-grain rows cannot flip unit coverage.
2. Admin surfaces: pattern-catalog editor (per skill, under
   `/admin/content/units`), pattern picker in the question editor and
   drafts review, kind/scope fields in the lesson builder + AI generate
   flow, AI-assisted bulk classification queue (§4 step 3).
   **Partially landed 2026-07-27**: the units worklist's per-unit
   "Generate lesson" link now carries `?skill=`, the generate page
   prefills the brief from scope facts (taxonomy names, published
   depth + difficulty mix, `expected_minutes`; `?pattern=` prefills
   recognition cue + process once patterns exist) and stamps the
   matching `lesson_topics` row on save; the lesson builder gained
   kind/foundation-order metadata fields and a Scope-tags editor
   (section + skill grains; pattern tags display but are authored via
   the catalog tooling).
   **Pattern-catalog editor landed 2026-08-16** at
   `/admin/content/patterns` — admin-only, grouped per skill in
   teaching order, with create/edit/delete/reorder plus a CSV
   importer (dry-run preview, skip-or-update duplicate policy,
   template download, and export of the live catalog for round-trip
   editing in a spreadsheet). Domain/skill codes are validated against
   `SAT_TAXONOMY` on both authoring paths, so a pattern cannot be
   filed under a unit that does not exist. Delete states its cost
   first: tagged questions fall back to unclassified (FK set null),
   lesson scope tags are removed (FK cascade). The units worklist
   gained a Patterns column deep-linking per skill, and each pattern
   row links to `/admin/lessons/generate?pattern=`, which reaches the
   cue+process prefill built in this step. CSV parse/plan logic is
   `lib/admin/questionPatternCsv.ts`, shared by the client preview and
   the Server Action and covered by
   `lib/admin/questionPatternCsv.test.mjs`.
   **Question tagging landed 2026-08-16** — migration
   `20260816120000_question_pattern_tagging.sql`, applied to dev +
   prod via MCP. Verified in dev (role gate rejects teacher and
   unauthenticated callers; a cross-skill pattern is refused; a
   matching tag records its tagger; clearing wipes all three columns)
   and in prod (columns, index, SECURITY DEFINER with pinned
   `search_path`, execute granted to `authenticated` and not `anon`,
   role gate rejecting, zero rows touched). `questions_v2`
   UPDATE is admin-only (`questions_v2_admin_all`; the
   `demo_readonly_*` policies are RESTRICTIVE guards, not grants), and
   widening it so tutors could classify would also hand them
   `stem_html`, `is_published` and `is_broken`. So the write goes
   through `set_question_pattern()`, a SECURITY DEFINER function gated
   on `is_manager()` (manager + admin, matching the concept-tag write
   bar) that touches `pattern_id` plus new `pattern_tagged_by` /
   `pattern_tagged_at` attribution columns and nothing else — the same
   shape as `merge_concept_tags()`. It refuses a pattern whose
   domain/skill differs from the question's, so the bank cannot
   accumulate cross-skill tags no recommendation path could use.
   The picker (`lib/practice/QuestionPatternTag.tsx`) mounts through
   `QuestionRenderer`'s existing `controlsNode` slot beside
   `ConceptTags` — **not** inside the renderer, which
   `TestRunnerInteractive` also mounts. Live surfaces: the per-student
   and group assignment reports, practice-session review, test
   results, and the shared question detail page. Options are scoped to
   the question's own skill, and the control hides itself when that
   skill has no patterns. `/admin/content/patterns` grew a "Recently
   tagged" audit strip off the attribution columns.
   Still open from this step: the pattern picker in the *content
   drafts* review (`question_content_drafts.pattern_id` is still
   unwritten — that pipeline stages content fields only), and the
   AI-assisted classification queue.
3. Consumers, in dependency order: `recommend.ts` chain →
   generator front-load pass → drill `pattern_id` filter → detours →
   efficacy expansion → wizard/Today/roster surfaces.
4. Tutor "mark covered" action + roster foundations signal.
5. Each step behind normal review; user-facing changes ride
   `feature_flags` if staged rollout is warranted (foundations
   front-load changes every new plan — flag it).

Steps 1–2 unblock the human workstream's in-app portions; §4 steps 1–2
need no engineering at all and can start immediately.

## 4. The human workstream (owner + co-instructors)

This is the practical checklist. Artifacts marked **[now]** can be
drafted today in a doc or spreadsheet; **[in-app]** waits on §3.4
steps 1–2.

### Step 1 — Inventory the foundations **[now]**

List every lesson you currently deliver one-on-one to *all* students.
For each, record:

| Field | Prompt |
|---|---|
| Working title | e.g. "Reading passage strategy" |
| Scope | RW section / Math section / a domain |
| Order | If a student had one hour before their first drill, what comes first? This becomes `foundation_sequence`. |
| Length | Target 10–20 minutes as a lesson; split anything longer. |
| "Done" check | 2–4 check questions that prove the method was absorbed (these become `check` blocks; the lesson isn't complete until they're passed). |
| Universality test | Would you skip this for any student? If yes for many, it's a standard lesson, not a foundation. |

Things to think about:

- **Keep the list short.** Expect 3–6 per section. Foundations are the
  material you'd never let a student skip — not everything useful.
- **Personal-preference vs. platform method.** If co-instructors teach
  a step differently, reconcile before authoring: the platform version
  becomes *the* Studyworks method every self-serve student learns.
- **What replaces your delivery.** These lessons stand in for you in a
  live session. Budget for a short video block (the builder supports
  `video` blocks) where tone and demonstration matter — passage
  annotation in particular is hard to teach in text alone.

### Step 2 — Draft the pattern catalogs **[now, and now also in-app]**

Drafting still happens wherever it's fastest — a doc or spreadsheet is
fine. Since 2026-08-16 the drafts have somewhere to land:
`/admin/content/patterns` takes either a CSV upload (columns
`domain_code, skill_code, name, recognition_cue, process_summary,
sequence`; download the template from the importer) or one-at-a-time
entry. Import previews every row before writing, and re-importing a
corrected sheet with "Update existing" is the supported way to revise
a catalog — the app never becomes a fork of the spreadsheet.

Per skill, starting only with skills where you actually teach
"see format → run process" (don't force catalogs onto skills you teach
holistically). For each pattern:

| Field | Prompt |
|---|---|
| Name | Short, student-facing: "No-solution systems" |
| Recognition cue | One sentence: "When you see…" — **this is the highest-value artifact.** It becomes UI copy, the classifier prompt for step 3, and the lesson's opening line. If you can't write a crisp cue, it isn't a pattern. |
| Process | The numbered steps you teach, in 1–3 lines (full detail goes in the lesson later). |
| Rough share | What fraction of the skill's questions fit? (Sanity check for step 3.) |

Rules of thumb:

- **2–6 patterns per skill.** More means the grain is too fine to
  drill against (a skill has ~100–120 questions in the bank; a pattern
  needs enough questions to build drills from).
- **Recognizable from the question alone.** A student (and a
  classifier) must be able to assign the pattern *before* solving.
  "Questions students find tricky" is not a pattern.
- **Leftovers are fine.** Questions matching no pattern stay
  unclassified and are handled by skill-level material. Never force
  100% coverage.
- Where the catalogs already exist implicitly — the three authored
  template specs — extract their implied patterns first.

### Step 3 — Classify the question bank **[in-app]**, per skill, on demand

Classification happens when a skill's first pattern lesson is ready to
ship — never big-bang across all 3,381 questions.

Since 2026-08-16 there is also an **opportunistic path** that needs no
queue: any manager or admin reviewing an assignment, a practice
session, or a test result gets a pattern picker under the question,
scoped to that question's skill. Tagging the obvious fits as they come
up costs seconds and needs no sweep. The two are complementary — this
catches what a tutor happens to see; the queue below is how a skill
gets covered systematically. Both write the same column, and
`/admin/content/patterns` shows who tagged what.

1. Engineering provides an AI-assisted queue (drafts-pipeline
   pattern): for a chosen skill, the model proposes a pattern per
   question using your recognition cues, and a reviewer confirms or
   corrects.
2. **Human review protocol** (you or a co-instructor, ~100–120
   questions per skill; expect under an hour per skill once fluent):
   review grouped *by proposed pattern*, not question order — misfits
   jump out visually; spot-check the "no pattern" pile for a missed
   pattern; when one question plausibly fits two patterns, assign the
   one whose *process* you'd actually use, and if that's ambiguous
   often, your patterns overlap — merge or sharpen the cues.
3. **Sanity check with item stats**: patterns should cluster in
   difficulty/p-value; a wild outlier inside a pattern is usually
   misfiled (or mis-keyed — flag it to the §1.7 audit).
4. New questions get classified at draft review (a picker in the
   drafts flow), so the bank never regresses to untyped for cataloged
   skills.

### Step 4 — Author the lessons **[in-app]**, priority order

Use the existing generate flow (`/admin/lessons/generate`) + builder
review; the builder gains kind/scope fields (§3.4).

Priority: **foundations first** — the list is short, the reach is
every student, and they unblock the wizard/plan front-loading. Then
pattern and skill lessons for the weakest-covered, highest-traffic
units, in the order `/admin/content/units` already ranks them.

Structural templates:

- **Foundation**: why this method → the method (video where
  demonstration matters) → worked demonstration → completion check
  (the step-1 "done" questions, with branch-remediation on misses).
- **Pattern lesson**: recognition cue up front ("when you see…") →
  the process, numbered → one worked example → 2–3 checks with
  branch/rejoin remediation → ends into a drill of that pattern
  (the `pattern_id` drill filter makes this automatic).
- Keep using `lesson_topics` skill tags for skill lessons exactly as
  today; nothing about §3.4 changes existing authoring.

### Step 5 — Backfill your current students **[in-app]**

When foundations publish, existing students have mostly already had
them live. Before enabling plan front-loading, tutors sweep their
rosters with **mark covered in session** for each student/foundation
actually delivered. Un-marked students get the foundation front-loaded
into their next plan regeneration — which is exactly right for anyone
who joined recently and skipped it. Assign this sweep explicitly to
each co-instructor for their own roster; it's minutes per student.

### Step 6 — Watch efficacy and iterate **[in-app]**

The `/admin/lessons` efficacy column already measures pre/post
first-attempt accuracy per tagged skill; §3.2 extends it to section
scope (foundations) and pattern scope. Review monthly:

- A foundation that doesn't move section accuracy is a red flag on
  the *digitization*, not necessarily the method — compare against
  students who got it live (their gains are the benchmark).
- A pattern lesson with flat efficacy usually means the recognition
  cue isn't landing — students aren't identifying the format under
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
| 1 | Owner + co-instructors | Foundation inventory (step 1), pattern catalogs for first 3–5 skills (step 2) | nothing — start now; catalogs can be entered or imported at `/admin/content/patterns` |
| 2 | Engineering | Schema migration + admin surfaces (§3.4 steps 1–2) | design sign-off — schema and the catalog editor done; picker + classification queue outstanding |
| 3 | Engineering | Recommendation chain, generator front-load, drill filter (§3.4 step 3) | 2 |
| 4 | Owner + co-instructors | Author foundations (step 4); classify first skills (step 3); backfill rosters (step 5) | 2, and 3 for front-loading to take effect |
| 5 | Both, ongoing | Pattern lessons per unit-coverage ranking; efficacy review (step 6) | 4 |

## 6. Decisions taken / still open

Taken in this design (revisit deliberately, not by drift):

- **One primary pattern per question** (nullable FK, not a junction).
  Simpler classification, unambiguous drills and efficacy. If real
  multi-pattern questions emerge, a junction can supersede the column.
- **Foundations nudge, never gate** (§3.3).
- **Syllabus/mastery stay at skill grain** (§3.3).
- **`concept_tags` untouched** — separate concern, different
  governance.

Open, owner to decide during steps 1–2:

- Should foundations **re-surface near test day** (a "refresher" plan
  task in the final weeks), or is once enough?
- Is there a **domain-scoped foundation** in practice (e.g. an essay
  of the SEC grammar approach), or do all foundations land at section
  scope? The schema supports both; the inventory will tell.
- Naming: is "question type" the student-facing label, or does
  Studyworks teaching vocabulary use another word ("format",
  "setup")? Schema says `question_patterns` regardless (§3.1).

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
`20260922120000_curriculum_unit_steps.sql`, applied to dev 2026-09-22;
production pending). Units stay at skill grain (§3.3); the syllabus is
intra-unit detail.

| Column | Meaning |
|---|---|
| `kind` | `lesson` or `drill` |
| `lesson_id` | the bank lesson (kind = lesson); the same lesson may appear in several units |
| `role` | `practice` (the questions for the lesson just taught) or `mixed` (homework across the unit and its domain's earlier units) |
| `skill_codes` | widens a drill beyond the unit's skill; null = the unit's skill, or for a mixed set the domain's units walked so far (max 4) |
| `pattern_id` | narrows a drill to one question pattern once catalogs exist; the launcher falls back to the skill-wide draw when nothing is tagged |
| `question_count`, `minutes` | null = 8 (practice) / 10 (mixed) and the unit's minutes |
| `skip_if_completed` | lesson steps: skip when `lesson_progress.completed_at` is set (default true) |

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
- Payloads: lesson tasks carry `lesson_id` + the lesson's own title
  ("Lesson: Solve Equations by Graphing…"); drills carry
  `skill_codes`, `drill_role`, optional `pattern_id`, the `lesson_id`
  they exercise ("Practice: <lesson title>"), and `unit_step_id`.

Without the flag (or for units with no rows) the pre-syllabus
behavior is byte-for-byte unchanged; `lib/plan/unit-syllabus.test.mjs`
covers the walk.

### 7.4 Authoring (landed 2026-09-22)

Built for a non-technical editor working entirely inside the admin
account (owner direction 2026-09-22: no spreadsheet or CSV path). The
sidebar gains **Curriculum** (`/admin/curriculum`):

- **Curriculum home**: every SAT unit in teaching order, grouped Math
  then Reading & Writing, with its syllabus outline and a status the
  editor can act on (Authored · Default — not yet authored · needs
  attention: no steps / no lesson / an unpublished lesson). A "How to
  build a unit" note states the teaching sequence in plain words.
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
  domain) or skills chosen by name; an optional "only one question
  type" select appears when the skill has a pattern catalog. A "what a
  student will see" panel runs the generator's own
  `expandUnitSyllabus`, so the preview is the exact task list a plan
  emits. "Start over with the default" resets the unit. Every edit
  stamps `syllabus_authored_at`.
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

1. Pattern-targeted drills once catalogs exist (the column, the editor
   field, and the launcher fallback are already in place).
2. Focus-phase lesson reassignment from per-drill outcomes.
3. Pacing copy: a syllabus unit is ~2.5 hours, so at 5 hours/week the
   coverage phase covers ~2 units/week and short runways will not fit
   every unit; the rationale should say so.
