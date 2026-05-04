# Authorization matrix

**Generated:** 2026-05-04
**Scope:** every Server Action in `app/next/` + `lib/practice*/`, every
client-callable RPC granted to `authenticated`, every `/api/*` route
handler. Source-of-truth enumeration as of branch
`claude/review-migration-progress-JYrT9`.

This is the spec for the negative-test pass that should follow.
Each row answers two questions:

1. **Required role** — what role(s) can invoke this entry point?
2. **Access predicate** — once authenticated, what scopes the rows
   the caller can read or write? RLS, an inline check, or none?

**Legend.**

| Auth | Meaning |
|---|---|
| `requireUser` | any logged-in user; relies on RLS for resource scoping |
| `requireRole([...])` | explicit role gate over `profiles.role` |
| `requireServiceRole(reason, {allowedRoles})` | bypasses RLS via service client; gated on `allowedRoles` |
| `validateExternalApiKey` | server-to-server integration key |
| `(none)` | endpoint is intentionally open OR a bug — flagged below |
| `RLS` | scoping is delegated to the database policies |
| `inline tsa lookup` | direct `teacher_student_assignments(teacher_id=me)` SQL — **does not satisfy managers** |
| `can_view(target)` | unified visibility helper from migration 000004/000023 |

---

## 1. Server Actions in `app/next/` and `lib/practice*/`

26 files, 60 exported actions. All declared `'use server'`.

### Admin tree

| Action | File | Mutates? | Required role | Access predicate |
|---|---|---|---|---|
| `updateProfileFields` | `(admin)/admin/users/[userId]/actions.js` | yes | `requireRole(['admin'])` | RLS |
| `changeRole` | same | yes | `requireRole(['admin'])` | RLS |
| `toggleActive` | same | yes | `requireRole(['admin'])` | RLS |
| `deleteUser` | same | yes | `requireRole(['admin'])` | RLS |
| `assignTeacherStudent` | same | yes | `requireRole(['admin'])` | RLS |
| `unassignTeacherStudent` | same | yes | `requireRole(['admin'])` | RLS |
| `assignManagerTeacher` | same | yes | `requireRole(['admin'])` | RLS |
| `unassignManagerTeacher` | same | yes | `requireRole(['admin'])` | RLS |
| `createTeacherCode` | `(admin)/admin/users/codes/actions.js` | yes | `requireRole(['admin'])` | RLS |
| `revokeTeacherCode` | same | yes | `requireRole(['admin'])` | RLS |
| `setTeacherInviteCode` | same | yes | `requireRole(['admin'])` | RLS |
| `clearTeacherInviteCode` | same | yes | `requireRole(['admin'])` | RLS |
| `addScoreConversions` | `(admin)/admin/content/actions.js` | yes | `requireRole(['admin'])` | RLS |
| `deleteScoreConversion` | same | yes | `requireRole(['admin'])` | RLS |
| `updateTestThresholds` | same | yes | `requireRole(['admin'])` | RLS |
| `saveSkillLearnability` | same | yes | `requireRole(['admin'])` | RLS |
| `saveDraft` | `(admin)/admin/content/drafts/[draftId]/actions.js` | yes | `requireUser` (then inline role check) | RLS + `profile.role IN ('admin','manager')` |
| `promoteDraft` | same | yes | `requireUser` (then inline role check) | RLS + `profile.role IN ('admin','manager')` |
| `rejectDraft` | same | yes | `requireUser` (then inline role check) | RLS + `profile.role IN ('admin','manager')` |

### Tutor (teacher / manager) tree

| Action | File | Mutates? | Required role | Access predicate |
|---|---|---|---|---|
| `createAssignment` | `(tutor)/tutor/assignments/new/actions.ts` | yes | `requireUser` | role guard inside body — **verify** |
| `addAssignmentMembers` | `(tutor)/tutor/assignments/[id]/actions.js` | yes | `requireUser` | RLS via `is_v2_assignment_teacher` |
| `submitAssignmentOnBehalf` | same | yes | `requireUser` | RLS via `is_v2_assignment_teacher` |
| `importStudentPracticeHistory` | `(tutor)/tutor/students/[studentId]/actions.js` | yes | `requireUser` then `requireServiceRole(...,{allowedRoles:['teacher','manager','admin']})` | `can_view(studentId)` |
| `migrateUserToNext` | same | yes | `requireUser` then `requireServiceRole(...,{allowedRoles:['admin']})` | n/a (admin only) |
| `createTrainingSession` | `(tutor)/tutor/training/practice/actions.js` | yes | `requireUser` | self-only |
| `countAvailable` (training) | same | no | `requireUser` | RLS |
| `createTrainingWeakQueueDrill` | `(tutor)/tutor/training/review/actions.js` | yes | `requireUser` | self-only |
| `createTrainingSkillDrill` | same | yes | `requireUser` | self-only |
| `startTrainingAssignment` | `(tutor)/tutor/training/assignments/[id]/actions.js` | yes | `requireUser` | RLS + `can_view` |

### Student tree

| Action | File | Mutates? | Required role | Access predicate |
|---|---|---|---|---|
| `createWeakQueueDrill` | `(student)/review/actions.js` | yes | `requireUser` | self (`user.id`) |
| `createSkillDrill` | same | yes | `requireUser` | self |
| `createNote`, `updateNote`, `deleteNote`, `upsertNoteForQuestion` | `(student)/notes/actions.ts` | yes | `requireUser` | RLS (`student_notes.user_id = auth.uid()`) |
| `updateTargetScore` | `(student)/dashboard/actions.js` | yes | `requireUser` | self |
| `startTestAttempt` | `(student)/practice/test/actions.js` | yes | `requireUser` | self |
| `recordItemAnswer` | same | yes | `requireUser` | self via attempt FK |
| `toggleMarkForReview` | same | yes | `requireUser` | self via attempt FK |
| `finishModule` | same | yes | `requireUser` | self via attempt FK |
| `countAvailable` (student) | `(student)/practice/start/actions.js` | no | `requireUser` | RLS |
| `createSession` | same | yes | `requireUser` | self |
| `startAssignmentPractice` | `(student)/assignments/[id]/actions.js` | yes | `requireUser` | RLS + `is_v2_assignment_student` |

### Shared lib actions (called from multiple trees)

| Action | File | Mutates? | Required role | Access predicate |
|---|---|---|---|---|
| `recalculateScore` | `lib/practice-test/score-actions.ts` | yes | `requireServiceRole(...,{allowedRoles:['teacher','manager','admin']})` | `can_view(student)` enforced inside |
| `addQuestionNote`, `updateQuestionNote`, `deleteQuestionNote` | `lib/practice/question-notes-actions.ts` | yes | `requireRole(['teacher','manager','admin'])` | RLS |
| `saveDesmosState` | `lib/practice/desmos-actions.ts` | yes | `requireRole(['manager','admin'])` | RLS |
| `deleteDesmosState` | same | yes | `requireRole(['manager','admin'])` | RLS |
| `addConceptTag` | `lib/practice/concept-tags-actions.ts` | yes | `requireRole(['manager','admin'])` | RLS |
| `removeConceptTagFromQuestion` | same | yes | `requireRole(['admin'])` | RLS |
| `listFlashcardSets`, `listFlashcards`, `createFlashcard`, `updateFlashcard`, `deleteFlashcard`, `rateFlashcard`, `createFlashcardSet` | `lib/practice/flashcards-actions.ts` | mixed | `requireUser` | RLS (`flashcards.user_id = auth.uid()`) |
| `saveErrorNote`, `getErrorNote` | `lib/practice/error-notes-actions.ts` | mixed | `requireUser` | RLS (`question_error_notes.user_id = auth.uid()`) |
| `submitAnswer` | `lib/practice/session-actions.ts` | yes | `requireUser` | self via session ownership |
| `submitPracticeSession` | same | yes | `requireUser` | self via session ownership |
| `abandonPracticeSession` | same | yes | `requireUser` | self via session ownership |
| `togglePracticeMark` | same | yes | `requireUser` | self via session ownership |
| `loadQuestionAction` | `lib/practice/load-question-action.ts` | no | `requireUser` | RLS |
| `flagQuestionBroken`, `saveQuestionCorrections` | `lib/practice/broken-actions.js` | yes | `requireRole(['teacher','manager','admin'])` | RLS |

---

## 2. Client-callable RPC functions

Functions explicitly `grant execute ... to authenticated`. These are
callable via `supabase.rpc(...)` from any client session.

| Function | Mutates? | Required role | Access predicate |
|---|---|---|---|
| `can_view(target uuid)` | no | any authenticated | self-introspection helper |
| `can_view_from(viewer, target)` | no | any authenticated | parameterized — used by `profile_cards` view |
| `count_distinct_users_since(timestamptz)` | no | any authenticated | aggregates only — non-PII |
| `get_practice_volume_by_week(integer)` | no | any authenticated | scoped to caller's roster via `can_view` |
| `get_roster_skill_performance(...)` | no | any authenticated | scoped to caller's roster via `can_view` |
| `get_roster_weekly_trend(...)` | no | any authenticated | scoped to caller's roster via `can_view` |
| `get_student_dashboard_stats(...)` | no | any authenticated | scoped to caller via `auth.uid()` or `can_view` |
| `get_visible_student_attempts(uuid, integer)` | no | any authenticated | gated on `can_view(target)` inside |
| `get_visible_student_by_id(uuid)` | no | any authenticated | gated on `can_view(target)` inside |
| `get_visible_students_with_stats()` | no | any authenticated | enumerates `can_view` set for caller |
| `import_student_error_notes(uuid)` | yes | any authenticated | gated on `can_view(target)` inside |
| `is_v2_assignment_student(uuid, uuid)` | no | any authenticated | predicate helper |
| `is_v2_assignment_teacher(uuid, uuid)` | no | any authenticated | predicate helper |
| `list_visible_users(text)` | no | any authenticated | enumerates `can_view` set for caller |
| `redeem_class_invite(invite_code text)` | yes | any authenticated | matches code; sets caller's `class_id` |

**RPCs defined as `security definer` but **not** explicitly granted to
`authenticated`** (server-only by default):

| Function | Notes |
|---|---|
| `import_student_practice_history(uuid)` | Called only from `requireServiceRole`-gated server action. Confirm no `grant execute ... to authenticated` exists. |
| `set_question_broken(uuid, boolean)` | Called only from server-side admin route. Confirm grant. |

---

## 3. `/api/*` route handlers

99 routes. Grouped by `lib/api/auth` helper used.

### 3.1 `requireUser()` — any authenticated user, RLS-scoped

Every route below trusts RLS for resource scoping.

| Route | Notes |
|---|---|
| `/api/act/dashboard` | |
| `/api/act/questions/[questionId]` | |
| `/api/act/questions` | |
| `/api/act/submit` | |
| `/api/assignments/[id]` | |
| `/api/assignments` | |
| `/api/attempts` | |
| `/api/billing/create-checkout` | |
| `/api/billing/create-portal` | |
| `/api/billing/status` | |
| `/api/dashboard` | |
| `/api/dashboard/stats` | |
| `/api/error-log` | |
| `/api/flashcard-sets` | |
| `/api/flashcards/bulk-import` | |
| `/api/flashcards/next` | |
| `/api/flashcards` | |
| `/api/lessons/[lessonId]/blocks` | inline role check for write paths |
| `/api/lessons/[lessonId]/progress` | |
| `/api/lessons/[lessonId]` | |
| `/api/lessons` | uses both `requireUser` (GET) and `requireRole(['teacher','manager','admin'])` (POST) |
| `/api/me` | |
| `/api/practice-test/time-ping` | sendBeacon endpoint; auth in try/catch |
| `/api/practice-tests/attempt/[attemptId]` | RLS scopes to own attempts |
| `/api/practice-tests/attempt/[attemptId]/abandon` | |
| `/api/practice-tests/attempt/[attemptId]/results` | |
| `/api/practice-tests/attempt/[attemptId]/submit-module` | |
| `/api/practice-tests` | |
| `/api/practice-tests/start` | |
| `/api/progress` | |
| `/api/questions/[questionId]` | |
| `/api/questions` | |
| `/api/recommendations` | |
| `/api/review` | |
| `/api/review/weak-queue` | |
| `/api/sat-vocabulary` | |
| `/api/status` | |
| `/api/time-analytics` | |

### 3.2 `requireRole([...])` — role-gated, RLS-scoped

| Route | Allowed roles | Notes |
|---|---|---|
| `/api/admin/assignments` | `admin` | |
| `/api/admin/broken-questions` | `admin` | |
| `/api/admin/bug-reports` | `admin` | |
| `/api/admin/manager-assignments` | `admin` | |
| `/api/admin/platform-stats` | `admin` | |
| `/api/admin/questions-v2` | `admin` | GET only |
| `/api/admin/skill-learnability` | `manager`, `admin` | |
| `/api/admin/student-performance` | `admin` | |
| `/api/admin/sync-lessonworks` | `admin` | |
| `/api/admin/teacher-codes` | `admin` | |
| `/api/admin/teacher-effectiveness` | `admin` | |
| `/api/admin/teacher-invite-codes` | `admin` | |
| `/api/admin/teachers/[teacherId]/profile` | `manager`, `admin` | |
| `/api/admin/users` | `admin` | GET only (DELETE uses service-role) |
| `/api/concept-tags` | `manager`, `admin` | |
| `/api/desmos-states` | mixed: `teacher,manager,admin` (read), `manager,admin` (write) | |
| `/api/question-notes` | `teacher`, `manager`, `admin` | |
| `/api/teacher/assignment-feed` | `teacher`, `manager`, `admin` | |
| `/api/teacher/assignments` | mixed (`admin` only for some methods) | |
| `/api/teacher/dashboard` | `teacher`, `manager`, `admin` | |
| `/api/teacher/lessons/[lessonId]/assign` | `teacher`, `manager`, `admin` | |
| `/api/teacher/lessons` | `teacher`, `manager`, `admin` | |
| `/api/teacher/practice-tests` | `teacher`, `manager`, `admin` | |
| `/api/teacher/question-assignments/[assignmentId]` | `teacher`, `manager`, `admin` | |
| `/api/teacher/question-assignments` | `teacher`, `manager`, `admin` | |
| `/api/teacher/roster-overview` | `teacher`, `manager`, `admin` | |
| `/api/teacher/student/[studentId]/dashboard` | `teacher`, `manager`, `admin` | **inline tsa lookup — manager-blocked** |
| `/api/teacher/student/[studentId]/question/[questionId]` | `teacher`, `manager`, `admin` | **inline tsa lookup — manager-blocked** |
| `/api/teacher/student/[studentId]/registrations` | `teacher`, `manager`, `admin` | **inline tsa lookup — manager-blocked** |
| `/api/teacher/student/[studentId]/scores` | `teacher`, `manager`, `admin` | **inline tsa lookup — manager-blocked** |
| `/api/teacher/student/[studentId]/stats` | `teacher`, `manager`, `admin` | **inline tsa lookup — manager-blocked** |
| `/api/teacher/students` | `teacher`, `manager`, `admin` | |

### 3.3 `requireServiceRole(reason, {allowedRoles})` — RLS bypass with role gate

Each row's `reason` string is logged for audit.

| Route | Allowed roles | Reason |
|---|---|---|
| `/api/act/questions/[questionId]/correct` | `admin`, `manager` | manager/admin ACT question correction |
| `/api/act/questions/bulk-import` | `admin`, `manager` | admin/manager ACT bulk-import questions |
| `/api/act/questions/fix-categories` | `admin` | admin ACT taxonomy fix |
| `/api/act/questions/parse-pdf` | `admin`, `manager` | admin/manager ACT PDF import |
| `/api/admin/batch-fix` | `admin` | admin batch-fix preview/save |
| `/api/admin/bulk-reocr` | `admin` | admin bulk re-OCR |
| `/api/admin/questions-v2/approve` | `admin` | admin approve/unapprove |
| `/api/admin/questions-v2/fix` | `admin` | admin questions-v2 fix |
| `/api/admin/questions-v2/suggestions` | `admin` | suggestions read/apply |
| `/api/admin/recalculate-score` | `teacher`, `manager`, `admin` | score recalculation across users |
| `/api/admin/routing-rules` | `admin` | routing-rules read/write |
| `/api/admin/sync-question-ids` | `admin` | bulk question-id sync |
| `/api/admin/teachers` | `manager`, `admin` | teachers roster aggregate |
| `/api/admin/teachers/[teacherId]` | `manager`, `admin` | teacher detail; **inline `manager → tsa(teacher_id=me)` check** |
| `/api/admin/users` (DELETE only) | `admin` | needs `auth.admin.deleteUser` |
| `/api/questions/[questionId]/correct` | `admin`, `manager` | question correction |
| `/api/teacher/score-conversion` | `teacher`, `manager`, `admin` | score-conversion upsert |
| `/api/teacher/student/[studentId]/delete-session` | `teacher`, `manager`, `admin` | uses `teacher_can_view_student` RPC ✅ |
| `/api/teacher/student/[studentId]/profile` | `teacher`, `manager`, `admin` | **inline tsa lookup — manager-blocked** |
| `/api/teacher/student/[studentId]/upload-bluebook` | `teacher`, `manager`, `admin` | uses `teacher_can_view_student` RPC ✅ |
| `/api/teacher/student-performance` | `teacher`, `manager`, `admin` | aggregates over caller's roster |

### 3.4 External API key (`validateExternalApiKey`)

Server-to-server integration, bypasses user auth deliberately.

| Route | Notes |
|---|---|
| `/api/external/score-report/[attemptId]` | LessonworksSync; service-role read |
| `/api/external/student-summary/[studentId]` | LessonworksSync; service-role read |
| `/api/public/students/[studentId]/practice-data` | LessonworksSync; service-role read |

### 3.5 Webhook / signature-verified

| Route | Verification |
|---|---|
| `/api/webhooks/stripe` | `Stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET` |
| `/api/signup` | service-role; validates own `teacherCode` against `teacher_codes` table |

### 3.6 Unauthenticated catalog endpoints (RLS-only)

| Route | Risk |
|---|---|
| `/api/act/filters` | read-only taxonomy aggregate; non-PII; OK |
| `/api/domain-counts` | reads `question_taxonomy`; reads optional `x-user-id` header (not authoritative — used for filter context only) |
| `/api/filters` | read-only taxonomy aggregate; non-PII; OK |

### 3.7 Unauthenticated routes that should not be

(None as of 2026-05-04. `/api/admin/score-conversion` previously
fell here; fixed to `requireRole(['admin'])` in the same commit
that surfaced the finding.)

---

## 4. Audit findings — open issues

These rows need follow-up work. Listed in order of severity.

### 4.1 ~~`/api/admin/score-conversion` is unauthenticated~~ — fixed

`app/api/admin/score-conversion/route.js` previously ran both GET and
POST with no `requireRole` gate. Now wrapped in `legacyApiRoute` and
gated on `requireRole(['admin'])`, matching the new-tree
`addScoreConversions` Server Action. The legacy caller
(`AdminDashboard.js:737`) is admin-only, so this is the right scope.

### 4.2 Six legacy teacher routes block managers

The handoff doc already flagged this. The matrix above marks each
with **inline tsa lookup — manager-blocked**:

- `/api/teacher/student/[studentId]/dashboard`
- `/api/teacher/student/[studentId]/profile`
- `/api/teacher/student/[studentId]/question/[questionId]`
- `/api/teacher/student/[studentId]/registrations`
- `/api/teacher/student/[studentId]/scores`
- `/api/teacher/student/[studentId]/stats`

Plus `/api/admin/teachers/[teacherId]` for the manager-on-teacher case.

Two of the same family already use the `teacher_can_view_student` RPC
correctly (`delete-session`, `upload-bluebook`) — that's the reference
pattern. Fix is ~2 lines per route.

### 4.3 Role checks split across helper and inline

`(admin)/admin/content/drafts/[draftId]/actions.js` enters via
`requireUser()` and then does an inline
`profile.role !== 'admin' && profile.role !== 'manager'` check inside
each action body. Not wrong, but inconsistent with the rest of the
admin tree, which uses `requireRole(['admin'])` at the top. Worth
normalizing to `requireRole(['admin','manager'])` so the gate is
visible in one place per file.

### 4.4 Server Actions that bypass `requireRole`

`app/next/(tutor)/tutor/assignments/new/actions.ts` (`createAssignment`)
enters via `requireUser` and relies on RLS / `is_v2_assignment_teacher`
inside the body. Confirm coverage with a negative test (a student
calling `createAssignment` with a forged `formData`).

### 4.5 `requireServiceRole` audit log is a string, not structured

The `reason` argument on every `requireServiceRole` call is logged
verbatim to stdout via `lib/api/logger.js`. Sentry / log aggregation
can't currently search across these by `route` or `caller_role` since
the reason is free text. When observability lands (Phase 5 / Week 3 of
the hardening plan), add `route` and `caller_role` as first-class
fields on the audit record.

### 4.6 Unauthenticated catalog endpoints

`/api/act/filters`, `/api/domain-counts`, `/api/filters` are
RLS-scoped via the cookie session but don't require auth. Today the
underlying tables (`act_questions`, `question_taxonomy`) are readable
by `authenticated`. If a future migration tightens RLS on those
tables, these endpoints will silently start returning empty arrays
for unauthenticated callers. Cheap fix: add `await requireUser()` to
each so the failure is loud.

---

## 5. Coverage targets for the negative-test pass

Given the matrix above, the minimum useful Playwright suite is:

1. **Anonymous** caller hits each non-3.4/3.5/3.7 route → expect 401.
2. **Student** caller hits every Tutor + Admin Server Action and every
   3.2/3.3 route → expect 403.
3. **Student-A** caller hits any `(student)/...` action with a
   `formData` referencing **Student-B**'s resource (note id, attempt
   id, session id, flashcard id) → expect 403/404.
4. **Teacher-A** caller hits any `/api/teacher/student/[studentId]/*`
   route for a student **not on Teacher-A's roster** → expect 403.
5. **Manager-A** caller hits the same set for a student under a
   teacher **not assigned to Manager-A** → expect 403. (This case
   currently fails because of finding 4.2; the test catches the
   regression once the fix lands.)
6. **Admin** caller hits every route → expect 200/204 success codes
   modulo input validation.

Each row in §1, §2, §3.1–3.3 becomes one or two Playwright cases
following these patterns.
