// Practice-test runner — entry route for a module position.
//
// Server-renders the requested position end-to-end (stem + options
// + stimulus, all watermarked, plus the student's existing answer
// and mark-for-review flag) via the shared loader in
// lib/practice-test/load-test-question.ts, then hands the payload
// to the client island as initial props. From there the island owns
// Next/Back within the module (§6.3b instant-next): adjacent moves
// are client state changes fed by the loadTestQuestionAction Server
// Action, with the URL kept in sync via history.pushState — so
// direct hits, refreshes, and deep links still land here and
// resolve any position.
//
// Bluebook-style: no correct-answer reveal during the test.
// QuestionRenderer is invoked in mode='practice' with result=null,
// so the inputs stay editable and no reveal styling appears.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { loadTestQuestion } from '@/lib/practice-test/load-test-question';
import { loadTestQuestionAction } from '@/lib/practice-test/load-test-question-action';
import {
  recordItemAnswer,
  toggleMarkForReview,
  finishModule,
  pauseTestModule,
} from '../../../../../actions';
import { TestRunnerInteractive } from './TestRunnerInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeTestRunnerPage({ params }) {
  const { attemptId, moduleAttemptId, position: positionStr } = await params;
  const { user, profile, supabase } = await requireUser();

  const position = Number(positionStr);
  if (!Number.isInteger(position) || position < 0) notFound();

  const result = await loadTestQuestion(
    { userId: user.id, role: profile.role, supabase },
    { attemptId, moduleAttemptId, position },
  );
  if (result.kind === 'redirect') redirect(result.redirectTo);
  if (result.kind === 'not_found') notFound();

  const payload = result.payload;

  return (
    <TestRunnerInteractive
      attemptId={attemptId}
      moduleAttemptId={moduleAttemptId}
      initialPayload={payload}
      recordItemAnswerAction={recordItemAnswer}
      toggleMarkForReviewAction={toggleMarkForReview}
      finishModuleAction={finishModule}
      pauseTestModuleAction={pauseTestModule}
      loadQuestionAction={loadTestQuestionAction}
    />
  );
}
