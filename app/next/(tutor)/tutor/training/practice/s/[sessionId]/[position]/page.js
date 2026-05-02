// Tutor → training session question page. Mirrors the student
// runner at app/next/(student)/practice/s/[sessionId]/[position]
// — same content-protection story, same watermarking, same
// session-complete redirect plumbing — with three differences:
//
//   - role gate accepts teacher / manager / admin; students go
//     to /practice/start
//   - the practice_sessions row is filtered to mode='training' so
//     a stray practice-mode session id can't accidentally render
//     here
//   - base paths point at /tutor/training/practice instead of
//     /practice, so the QuestionMap + session-complete redirect
//     stay inside the training tree
//
// Both pages use the shared loadQuestion() loader and the
// PracticeInteractive client island, so the next/prev fast path and
// concept-tag / question-note panels are identical between the two.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { submitAnswer } from '@/lib/practice/session-actions';
import { loadQuestion } from '@/lib/practice/load-question';
import { loadQuestionAction } from '@/lib/practice/load-question-action';
import { PracticeInteractive } from '@/lib/practice/PracticeInteractive';
import { QuestionMap } from '@/lib/practice/QuestionMap';
import s from './Runner.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorTrainingQuestionPage({ params }) {
  const { sessionId, position: positionStr } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/practice/start');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const position = Number(positionStr);
  if (!Number.isInteger(position) || position < 0) notFound();

  const result = await loadQuestion(
    { userId: user.id, role: profile.role, supabase },
    { sessionId, position, expectedMode: 'training', includeTutorTools: true },
  );

  switch (result.kind) {
    case 'not_found':
      notFound();
      break;
    case 'expired':
    case 'completed':
    case 'abandoned':
    case 'past_end':
      redirect(result.redirectTo);
      break;
    case 'removed':
      return (
        <main className={s.removedMain}>
          <div className={s.removedCard}>
            <div className={s.removedEyebrow}>Question unavailable</div>
            <h1 className={s.removedH1}>This question was removed</h1>
            <p className={s.removedSub}>
              It was either unpublished or deleted after this training
              session was created. Pick another question from the map
              below, or{' '}
              <Link href="/tutor/training/practice" className={s.removedLink}>
                start a new session
              </Link>.
            </p>
          </div>
          <QuestionMap
            basePath="/tutor/training/practice"
            sessionId={sessionId}
            currentPosition={position}
            items={result.mapItems}
          />
        </main>
      );
    case 'ok':
      break;
  }

  const { payload } = result;

  return (
    <PracticeInteractive
      key={sessionId}
      initialPosition={payload.position}
      total={payload.total}
      sessionId={sessionId}
      sessionMode={payload.sessionMode}
      initialQuestion={payload.question}
      initialAttempt={payload.initialAttempt}
      initialDesmos={payload.desmos}
      initialMapItems={payload.mapItems}
      initialConceptTags={payload.conceptTags}
      initialQuestionNotes={payload.questionNotes}
      initialErrorNote={payload.errorNote}
      initialStudentNote={payload.studentNote}
      initialMarked={payload.marked}
      submitAnswerAction={submitAnswer}
      loadQuestionAction={loadQuestionAction}
      loadQuestionActionInput={{ expectedMode: 'training', includeTutorTools: true }}
      basePath="/tutor/training/practice"
      sessionCompleteHref={`/tutor/training/practice/review/${sessionId}`}
    />
  );
}
