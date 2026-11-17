# Study Plan editor

**Living — last verified November 17, 2026.**

The modular editor and balanced scheduler were released to production on
November 16, 2026, in [PR #497](https://github.com/studyworksprep/sat-practice-app/pull/497).
Both November 16 database migrations are applied to development and production.
The live tutor editor was verified after deployment; existing schedules were
left intact, and regeneration applies the revised scheduling balance.

**Profile targets.** The tutor builder and student
Adjust form show the saved profile target with a profile-edit link instead
of requiring another score input. Submission reads the current profile
target, including changes made after opening the form. If no profile target
is saved, the score input remains required. The student setup wizard
already skips its target question when the profile has a score.

Tutors open **Student profile → Study plan**. They can generate a starting
schedule or choose **Start from scratch**. Starting from scratch archives a
previous draft and creates an empty manual draft; it leaves an active plan
in place until the new draft is activated. Generating another draft keeps
human changes and completion history. An existing draft is rebuilt in place,
so its tasks retain their identities. If there is only an active plan, a
separate draft copies its tasks and editor preferences for review.

The editor shows every week through the test date, including empty weeks.
A tutor can add a whole unit syllabus or an individual lesson, drill,
practice set, review, full test, vocabulary task, or flashcard task. Drills
and practice sets require a curriculum skill and allow 1–50 questions.
A unit uses the published syllabus, skips completed lessons, supplies
practice after otherwise unpaired lessons, and includes a mixed set.

Unit cards retain their membership across weeks. **Move unit** moves every
pending task in the unit by the same number of weeks, preserving day offsets;
**Remove unit** removes pending tasks and records the excluded skill.
Completed and skipped tasks stay as history. Individual tasks can move or be
removed independently. Moves beyond the test date fail without changing the
schedule. Later generated practice is grouped separately from the initial
learning sequence so moving that sequence does not move all future drills.

## Regeneration

Human edits use `source=tutor` or `source=student`. The original grid is saved
as `study_plans.config.plan_start`; moving or deleting the earliest task
cannot change which dates belong to which week.

Same-day steps keep their saved `payload.schedule_order` on the tutor
schedule, student plan, and daily dashboard. The student week indicator
also uses the original grid even after the earliest unit moves.

Unit membership uses `plan_tasks.payload.plan_unit_key`, with an optional
`plan_unit_title` snapshot. Explicitly added or moved units also carry
`editor_unit=true`. Generated tasks have a `generation_key` identifying their semantic target
and occurrence. Learning-step identities stay stable when pacing moves them
to another week; recurring practice/review identities include the original week.
Removing a generated task records its key; removing a unit records its
skill in `study_plans.config.editor.excluded_skills`. Exclusions are separate
from task rows, so deleting a task does not erase the tutor's decision.

The shared customization filter and atomic database functions apply to:

- Tutor regeneration of an individual week or a whole draft.
- Student Adjust and Rebuild actions.
- Weekly automatic re-pacing and its review draft.

Pending human work stays owed, including overdue tasks. Completed work
retains its status. Removed units are also filtered out of mixed review.
A moved learning unit is excluded from mixed sets scheduled before its new start.
Explicitly adding a removed skill/unit restores it. An automatic re-pace
leaves an existing review draft alone. Manual plans are not automatically
filled by student rebuilds or cron; choosing **Generate a starting plan**
explicitly switches a manual draft back to automatic suggestions while
retaining its human tasks and exclusions.

`edit_study_plan` and `write_study_plan_draft` use `SECURITY INVOKER`, existing
row permissions, a parent-plan lock, and a revision check during regeneration.
They commit deletion/insertion together; invalid or stale operations roll
back. Anonymous and demo callers cannot write. No service-role client is
used in the interactive editor.

## Scheduling

The focus/target scheduler used to advance its skill cursor on a lesson.
With many weak skills, that emitted all lessons before returning to drills.
It now finishes a lesson/practice sequence before advancing; an unfinished
pair also carries across a phase boundary. Authored unit outlines receive
practice between consecutive lessons. Every learning week reserves a mixed
review set drawn only from topics already introduced or previously practiced.
Self-directed plans keep that mixed set within the chosen target skills.
Spaced review and practice-test checkpoints continue alongside this work.

Automatic authored-syllabus generation still honors the `unit_syllabus`
switch. The fallback scheduler follows the same lesson/practice/mixed-review
balance when the switch is off. Explicit tutor unit insertion uses authored
syllabi regardless of the switch. No existing student schedule is silently
rewritten by deploying the scheduler changes; regeneration applies them.

## Verification

- `node --test lib/plan/*.test.mjs`: scheduler, customization, re-pacing,
  generation, labels, adherence, intake, and date-grid regressions.
- `supabase/tests/modular_study_plan_editor.sql`: development transaction
  that rolls back all fixtures; validates atomic edits, exclusion retention,
  history copying, stale revisions, manual plans, and cross-roster denial.
- `tests/e2e/study-plan-editor.teacher.spec.ts`: development-only temporary
  student; tutor generation/editing, whole-unit and task movement/removal,
  regeneration, blank construction, activation, mobile overflow, student
  rebuild, and launching a practice set. Fixture cleanup removes the account.
