# Authorization matrix (generated)

> **Status: Generated document — do not edit by hand.**
> Produced by `scripts/generate-auth-matrix.mjs`; CI fails if this
> file is stale. Guard detection is file-level: it answers "which
> auth guards does this entry point's file call," not which guard
> wraps which line. RLS remains the authoritative layer beneath
> all of it (`can_view()` + per-table policies). The hand-written
> 2026-05-04 matrix with per-row analysis is preserved at
> `docs/history/authorization-matrix-2026-05-04.md`.

## Middleware (`proxy.js`)

Runs on every matched request. Detected: session refresh only.

## HTTP route handlers

| Path | Methods | Guards (file-level) |
|---|---|---|
| `/api/admin/lessons/generate` | — | requireRole[admin] |
| `/api/admin/questions-v2/generate` | — | requireServiceRole |
| `/api/admin/sync-lessonworks` | — | requireRole[admin] + service client (RLS bypass) |
| `/api/billing/create-checkout` | — | requireUser |
| `/api/billing/create-portal` | — | requireUser |
| `/api/external/score-report/[attemptId]` | GET | requireExternalApiAccess + service client (RLS bypass) |
| `/api/practice-test/time-ping` | POST | requireUser |
| `/api/public/students/[studentId]/practice-data` | GET | requireExternalApiAccess + service client (RLS bypass) |
| `/api/public/students/provision` | POST | requireExternalApiAccess + service client (RLS bypass) |
| `/api/public/students/search` | GET | requireExternalApiAccess + service client (RLS bypass) |
| `/api/signup` | POST | rateLimit + service client (RLS bypass) |
| `/api/teacher/student/[studentId]/upload-bluebook` | — | requireServiceRole |
| `/api/webhooks/stripe` | POST | stripe signature + service client (RLS bypass) |
| `/auth/callback` | GET | ⚠️ **none detected** |
| `/auth/confirm/verify` | POST | ⚠️ **none detected** |
| `/auth/demo/[persona]` | GET | service client (RLS bypass) |

## Server Actions

| Module | Exported actions | Guards (file-level) |
|---|---|---|
| `app/(admin)/admin/act/imports/[jobId]/actions.ts` | `parseEnglish`, `parseMath`, `parseReading`, `parseScience`, `parseScaleAction`, `addJobFile` | requireRole[admin] |
| `app/(admin)/admin/act/imports/[jobId]/review/actions.ts` | `saveDraft`, `approveDraft`, `bulkApprove`, `unapproveDraft`, `rejectDraft`, `finalizeJob` | requireRole[admin] |
| `app/(admin)/admin/act/imports/actions.ts` | `createImportJob`, `deleteImportJob` | requireRole[admin] |
| `app/(admin)/admin/act/score-conversion/actions.ts` | `upsertConversionRows`, `deleteConversionTable`, `createConversionForm` | requireRole[admin] |
| `app/(admin)/admin/content/actions.js` | `addScoreConversions`, `deleteScoreConversion`, `updateTestThresholds`, `saveSkillLearnability` | requireRole[admin] |
| `app/(admin)/admin/content/drafts/[draftId]/actions.js` | `saveDraft`, `promoteDraft`, `rejectDraft` | requireRole[admin] |
| `app/(admin)/admin/lessons/[lessonId]/actions.js` | `updateLessonMetadata`, `saveLessonBlocks`, `searchQuestionBank`, `getQuestionById`, `deleteLesson` | requireRole[admin] |
| `app/(admin)/admin/lessons/[lessonId]/import/actions.js` | `importBlocksIntoLesson` | requireRole[admin] |
| `app/(admin)/admin/lessons/actions.js` | `createLesson` | requireRole[admin] |
| `app/(admin)/admin/lessons/generate/actions.ts` | `savePromptTemplate`, `resetPromptTemplate` | requireRole[admin] |
| `app/(admin)/admin/lessons/import/actions.js` | `createLessonFromSpec` | requireRole[admin] |
| `app/(admin)/admin/questions/new/actions.js` | `listQuestionSources`, `createQuestion` | requireRole[admin] |
| `app/(admin)/admin/users/[userId]/actions.js` | `updateProfileFields`, `changeRole`, `toggleActive`, `banUser`, `unbanUser`, `deleteUser`, `assignTeacherStudent`, `unassignTeacherStudent`, `assignManagerTeacher`, `unassignManagerTeacher` | requireRole[admin] + requireServiceRole |
| `app/(admin)/admin/users/codes/actions.js` | `createTeacherCode`, `revokeTeacherCode`, `inviteStudent`, `revokeStudentInvite` | requireRole[admin] |
| `app/(student)/assignments/[id]/actions.js` | `startAssignmentPractice` | requireUser + rateLimit |
| `app/(student)/dashboard/actions.js` | `updateTargetScore` | requireUser |
| `app/(student)/learn/[lessonId]/actions.js` | `markBlockComplete`, `submitCheckAnswer`, `submitDesmosResult`, `markLessonComplete` | requireUser |
| `app/(student)/notes/actions.ts` | `createNote`, `updateNote`, `deleteNote`, `upsertNoteForQuestion` | requireUser |
| `app/(student)/practice/start/actions.js` | `countAvailable`, `createSession`, `countAvailableAct`, `createActSession` | requireUser + rateLimit |
| `app/(student)/practice/test/actions.js` | `startTestAttempt`, `recordItemAnswer`, `toggleMarkForReview`, `pauseTestModule`, `resumeTestModule`, `finishModule` | requireUser + rateLimit |
| `app/(student)/practice/tests/actions.ts` | `startActPracticeTest`, `finalizeActPracticeTest` | requireUser + rateLimit |
| `app/(student)/review/actions.js` | `createWeakQueueDrill`, `createSkillDrill`, `createActWeakQueueDrill`, `createActCategoryDrill` | requireUser + rateLimit |
| `app/(student)/today/actions.ts` | `startPlanTask`, `markTaskDone` | requireUser + rateLimit |
| `app/(tutor)/tutor/assignments/[id]/actions.js` | `addAssignmentMembers`, `submitAssignmentOnBehalf`, `archiveAssignment` | requireUser |
| `app/(tutor)/tutor/assignments/new/actions.ts` | `createAssignment` | requireUser + rateLimit |
| `app/(tutor)/tutor/lesson-packs/actions.ts` | `createPack`, `renamePack`, `deletePack`, `addQuestionToPack`, `removeQuestionFromPack`, `reorderPackQuestions`, `searchQuestions`, `listDomainsAndSkills`, `listConceptTags` | requireUser + rateLimit |
| `app/(tutor)/tutor/roster/actions.ts` | `updateStudentProfile` | requireRole[admin|manager|teacher] + requireServiceRole |
| `app/(tutor)/tutor/students/[studentId]/actions.js` | `importStudentPracticeHistory`, `addTestRegistration`, `removeTestRegistration`, `addOfficialScore`, `deleteStudentPracticeTest`, `removeOfficialScore` | requireUser + requireServiceRole |
| `app/(tutor)/tutor/students/[studentId]/plan/actions.ts` | `generatePlanAction`, `activatePlanAction` | requireUser |
| `app/(tutor)/tutor/training/assignments/[id]/actions.js` | `startTrainingAssignment` | requireUser + rateLimit |
| `app/(tutor)/tutor/training/practice/actions.js` | `createTrainingSession`, `countAvailable` | requireUser + rateLimit |
| `app/(tutor)/tutor/training/review/actions.js` | `createTrainingWeakQueueDrill`, `createTrainingSkillDrill` | requireUser + rateLimit |
| `app/account/actions.js` | `updateProfile`, `updateEmail`, `addTeacherCode` | requireUser |
| `lib/plan/plan-actions.ts` | `generateStudyPlan`, `activatePlan`, `proposeRepace` | requireUser |
| `lib/practice-test/score-actions.ts` | `recalculateScore` | requireServiceRole |
| `lib/practice/broken-actions.js` | `loadBrokenDataAction`, `flagQuestionBroken`, `saveQuestionCorrections` | requireRole[admin|manager] |
| `lib/practice/concept-tags-actions.ts` | `addConceptTag`, `removeConceptTagFromQuestion` | requireRole[admin|manager] |
| `lib/practice/desmos-actions.ts` | `saveDesmosState`, `deleteDesmosState` | requireRole[admin|manager] |
| `lib/practice/error-notes-actions.ts` | `saveErrorNote`, `getErrorNote` | requireUser |
| `lib/practice/flashcards-actions.ts` | `listFlashcardSets`, `listFlashcards`, `createFlashcard`, `updateFlashcard`, `deleteFlashcard`, `rateFlashcard`, `createFlashcardSet` | requireUser |
| `lib/practice/load-question-action.ts` | `loadQuestionAction` | requireUser |
| `lib/practice/question-notes-actions.ts` | `addQuestionNote`, `updateQuestionNote`, `deleteQuestionNote` | requireRole[admin|manager|teacher] |
| `lib/practice/question-search-actions.ts` | `searchQuestions`, `listConceptTagsForSearch` | requireUser |
| `lib/practice/session-actions.ts` | `submitAnswer`, `submitPracticeSession`, `abandonPracticeSession`, `togglePracticeMark` | requireUser + rateLimit |

## Attention list

Entry points with **no detected guard** (verify each is
deliberately public, or fix):

- Route `/auth/callback` (app/auth/callback/route.js)
- Route `/auth/confirm/verify` (app/auth/confirm/verify/route.ts)

_16 route handlers, 44 server-action modules enumerated._
