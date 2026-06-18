// Practice session question page — the core of the Server-Component-
// based content-protection story from docs/architecture-plan.md §3.7.
//
// URL shape: /practice/s/[sessionId]/[position]
//   - sessionId is an opaque uuid keyed to a practice_sessions row
//   - position is the 0-indexed offset into the session's question_ids
//
// Direct hits / refreshes / deep links land here and the server
// renders the requested position end-to-end. Once the runner is
// mounted, next/prev clicks drive position via the loadQuestionAction
// Server Action + history.pushState, so the segment doesn't re-run
// and the client island doesn't unmount on every click.
//
// Question content is rendered as HTML on the server — stimulus_html,
// stem_html, and each option's content_html — via dangerouslySetInnerHTML
// in the JSX below. No JSON payload is sent to the client. An attacker
// hitting /practice/s/*/0 sees formatted HTML, not a scrapable object.
// Watermarking is applied via lib/content/watermark.js before
// rendering, keying off the authenticated user id.
//
// The correct answer and rationale are NOT fetched in this page when
// the student has not yet submitted. They are delivered via the
// submitAnswer Server Action only after the student has submitted,
// server-gated on the existence of an attempts row. See
// lib/practice/session-actions.ts.

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

export default async function PracticeQuestionPage({ params }) {
  const { sessionId, position: positionStr } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const position = Number(positionStr);
  if (!Number.isInteger(position) || position < 0) notFound();

  const result = await loadQuestion(
    { userId: user.id, role: profile.role, supabase },
    { sessionId, position },
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
              It was either unpublished or deleted after your session
              was created. Pick another question from the map below, or{' '}
              <Link href="/practice/start" className={s.removedLink}>
                start a new session
              </Link>.
            </p>
          </div>
          <QuestionMap
            basePath="/practice"
            sessionId={sessionId}
            currentPosition={position}
            items={result.mapItems}
          />
        </main>
      );
    case 'ok':
      // fall through
      break;
  }

  // TS-style narrowing isn't available here, but the switch above
  // returns or throws on every non-ok branch, so result is { kind: 'ok' }.
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
      initialErrorNote={payload.errorNote}
      initialStudentNote={payload.studentNote}
      initialMarked={payload.marked}
      practiceTest={payload.practiceTest}
      submitAnswerAction={submitAnswer}
      loadQuestionAction={loadQuestionAction}
      basePath="/practice"
      sessionCompleteHref={
        payload.sessionMode === 'review'
          ? '/review?complete=1'
          : `/practice/review/${sessionId}`
      }
      canSubmitSet={payload.sessionMode === 'practice'}
    />
  );
}
