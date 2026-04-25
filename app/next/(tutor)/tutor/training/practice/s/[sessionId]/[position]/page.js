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
// submitAnswer + the runner client island are imported straight
// from the shared lib — same code grades both flows.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { applyWatermark } from '@/lib/content/watermark';
import { submitAnswer } from '@/lib/practice/session-actions';
import { loadReviewData } from '@/lib/practice/load-review-data';
import { PracticeInteractive } from '@/lib/practice/PracticeInteractive';
import { QuestionMap } from '@/lib/practice/QuestionMap';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import s from './Runner.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorTrainingQuestionPage({ params }) {
  const { sessionId, position: positionStr } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/practice/start');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const position = Number(positionStr);
  if (!Number.isInteger(position) || position < 0) notFound();

  // 1) Load the session, pinned to the caller and to training mode.
  const { data: session, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, current_position, test_type, mode, expires_at, status')
    .eq('id', sessionId)
    .eq('mode', 'training')
    .maybeSingle();

  if (sessionErr || !session) notFound();
  if (session.user_id !== user.id) notFound();
  if (new Date(session.expires_at) < new Date()) {
    redirect('/tutor/training/practice?expired=1');
  }

  if (session.status === 'completed') {
    redirect(`/tutor/training/practice/review/${sessionId}`);
  }
  if (session.status === 'abandoned') {
    redirect('/tutor/training/practice?abandoned=1');
  }

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();
  if (position >= questionIds.length) {
    await supabase
      .from('practice_sessions')
      .update({
        status: 'completed',
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', 'in_progress');
    redirect(`/tutor/training/practice/review/${sessionId}`);
  }

  const questionId = questionIds[position];

  // 2) Persist the cursor on every navigation. Awaited (not
  //    fire-and-forget) so a dropped packet doesn't silently
  //    leave the resume cursor stale.
  if (position !== session.current_position) {
    const { error: cursorErr } = await supabase
      .from('practice_sessions')
      .update({
        current_position: position,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    if (cursorErr) {
      console.error(
        JSON.stringify({
          event: 'training_cursor_update_failed',
          session_id: sessionId,
          position,
          message: cursorErr.message,
        }),
      );
    }
  }

  // 3) One Promise.all wave for the question content + the
  //    session-wide attempts + the publish/deletion check.
  const [
    { data: question },
    { data: lastAttempt },
    { data: sessionAttempts },
    { data: sessionPublished },
  ] = await Promise.all([
    supabase
      .from('questions_v2')
      .select(
        'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, domain_code, domain_name, skill_name, difficulty, score_band, display_code, is_broken, is_published, deleted_at',
      )
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id, is_correct, selected_option_id, response_text, created_at')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', user.id)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('questions_v2')
      .select('id, is_published, deleted_at')
      .in('id', questionIds),
  ]);

  const questionRemoved = !question
    || question.deleted_at
    || !question.is_published;

  const mapItems = buildMapItems({
    questionIds,
    publishedRows: sessionPublished ?? [],
    attempts: sessionAttempts ?? [],
  });

  if (questionRemoved) {
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
          items={mapItems}
        />
      </main>
    );
  }

  // 4) Watermarking. Same scheme the student runner uses — keyed
  //    on the teacher's user id so a leaked training-mode question
  //    is traceable in the same way.
  const stimulusHtml = applyWatermark(
    question.stimulus_rendered ?? question.stimulus_html,
    user.id,
  );
  const stemHtml = applyWatermark(
    question.stem_rendered ?? question.stem_html,
    user.id,
  );

  const optionsSource = Array.isArray(question.options_rendered)
    ? question.options_rendered
    : Array.isArray(question.options)
      ? question.options
      : [];
  const wmOptions = optionsSource.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
    return {
      id: label,
      ordinal: idx,
      label,
      content_html: applyWatermark(content, user.id),
    };
  });

  const questionVM = {
    questionId: question.id,
    externalId: question.display_code,
    questionType: question.question_type,
    stimulusHtml,
    stemHtml,
    options: wmOptions,
    layout: inferLayoutMode(question.domain_code),
    taxonomy: {
      domain_code: question.domain_code,
      domain_name: question.domain_name,
      skill_name: question.skill_name,
      difficulty: question.difficulty,
      score_band: question.score_band,
    },
  };

  let reviewData = null;
  if (lastAttempt) {
    reviewData = await loadReviewData({
      supabase,
      userId: user.id,
      questionId,
    });
  }

  const initialAttempt = lastAttempt
    ? {
        isCorrect: lastAttempt.is_correct,
        selectedOptionId: lastAttempt.selected_option_id,
        responseText: lastAttempt.response_text,
        submittedAt: lastAttempt.created_at,
        correctOptionId: reviewData?.correctOptionId ?? null,
        correctAnswerDisplay: reviewData?.correctAnswerDisplay ?? null,
        rationaleHtml: reviewData?.rationaleHtml ?? null,
      }
    : null;

  const sessionVM = {
    sessionId,
    position,
    total: questionIds.length,
    mode: session.mode,
  };

  const sessionCompleteHref = `/tutor/training/practice/review/${sessionId}`;

  return (
    <>
      <PracticeInteractive
        key={`${sessionId}-${position}`}
        question={questionVM}
        session={sessionVM}
        initialAttempt={initialAttempt}
        submitAnswerAction={submitAnswer}
        basePath="/tutor/training/practice"
        sessionCompleteHref={sessionCompleteHref}
      />
      <QuestionMap
        basePath="/tutor/training/practice"
        sessionId={sessionId}
        currentPosition={position}
        items={mapItems}
        canSubmit={false}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────

function buildMapItems({ questionIds, publishedRows, attempts }) {
  const publishedById = new Map(publishedRows.map((r) => [r.id, r]));
  const latestByQid = new Map();
  for (const a of attempts) {
    if (!latestByQid.has(a.question_id)) latestByQid.set(a.question_id, a);
  }
  return questionIds.map((qid, i) => {
    const pub = publishedById.get(qid);
    const isRemoved = !pub || pub.deleted_at || !pub.is_published;
    if (isRemoved) return { position: i, status: 'removed' };
    const att = latestByQid.get(qid);
    if (!att) return { position: i, status: 'unanswered' };
    return { position: i, status: att.is_correct ? 'correct' : 'incorrect' };
  });
}
