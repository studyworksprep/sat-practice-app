// Tutor training session page — pixel-identical UX to the student
// practice page. Tutors experience exactly what their students see,
// including the watermarking, the server-rendered question content,
// and the §3.7 opaque-URL pattern. See docs/architecture-plan.md §3.4.
//
// The logic here is deliberately the same as
// app/next/(student)/practice/s/[sessionId]/[position]/page.js.
// The only differences are:
//
//   - role gate (teacher/manager/admin, not student)
//   - the practice_sessions row is filtered to mode='training' so a
//     stray practice-mode session id won't accidentally render here
//   - PracticeInteractive is called with basePath='/tutor/training'
//     and sessionCompleteHref='/tutor/dashboard?training_complete=1'
//
// submitAnswer is imported from lib/practice/session-actions — the
// same function the student page uses. Shared grading, shared
// watermark injection, shared attempts-row insert. One canonical
// answer per question (§3.1).

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { applyWatermark } from '@/lib/content/watermark';
import { submitAnswer } from '@/lib/practice/session-actions';
import { PracticeInteractive } from '@/lib/practice/PracticeInteractive';

export const dynamic = 'force-dynamic';

export default async function TutorTrainingQuestionPage({ params }) {
  const { sessionId, position: positionStr } = await params;
  const { user, profile, supabase } = await requireUser();

  // Role gate — inverse of the student practice page.
  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/practice/start');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const position = Number(positionStr);
  if (!Number.isInteger(position) || position < 0) notFound();

  // 1) Load the session, pinned to the caller and to training mode.
  const { data: session, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, current_position, test_type, mode, expires_at')
    .eq('id', sessionId)
    .eq('mode', 'training')
    .maybeSingle();

  if (sessionErr || !session) notFound();
  if (session.user_id !== user.id) notFound();
  if (new Date(session.expires_at) < new Date()) {
    redirect('/tutor/training/start?expired=1');
  }

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();
  if (position >= questionIds.length) {
    redirect('/tutor/dashboard?training_complete=1');
  }

  const questionId = questionIds[position];

  // 2) Advance the persisted cursor if the tutor is moving forward.
  //    Fire-and-forget — failure doesn't break the render.
  if (position !== session.current_position) {
    supabase
      .from('practice_sessions')
      .update({
        current_position: position,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .then(() => {}, () => {});
  }

  // 3) Load question content. Uses v1 tables; Phase 3 migrates to v2.
  //    Same nested-select pattern as the student page.
  const [
    { data: question },
    { data: version },
    { data: taxonomy },
    { data: lastAttempt },
  ] = await Promise.all([
    supabase
      .from('questions')
      .select('id, source_external_id, is_broken')
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('question_versions')
      .select(
        'id, question_type, stimulus_html, stem_html, answer_options(id, ordinal, label, content_html)',
      )
      .eq('question_id', questionId)
      .eq('is_current', true)
      .maybeSingle(),
    supabase
      .from('question_taxonomy')
      .select('domain_name, skill_name, difficulty, score_band')
      .eq('question_id', questionId)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id, is_correct, selected_option_id, response_text, created_at')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!question || !version) notFound();

  // 4) Watermark all HTML before it crosses the wire. Keyed on the
  //    tutor's own user id so a leaked training-mode question is
  //    traceable the same way a leaked student-mode one would be.
  const stimulusHtml = applyWatermark(version.stimulus_html, user.id);
  const stemHtml = applyWatermark(version.stem_html, user.id);
  const rawOptions = Array.isArray(version.answer_options) ? version.answer_options : [];
  const wmOptions = rawOptions
    .slice()
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    .map((opt) => ({
      id: opt.id,
      ordinal: opt.ordinal,
      label: opt.label,
      content_html: applyWatermark(opt.content_html, user.id),
    }));

  const questionVM = {
    questionId: question.id,
    externalId: question.source_external_id,
    questionType: version.question_type,
    stimulusHtml,
    stemHtml,
    options: wmOptions,
    taxonomy: taxonomy ?? null,
  };

  const initialAttempt = lastAttempt
    ? {
        isCorrect: lastAttempt.is_correct,
        selectedOptionId: lastAttempt.selected_option_id,
        responseText: lastAttempt.response_text,
        submittedAt: lastAttempt.created_at,
      }
    : null;

  const sessionVM = {
    sessionId,
    position,
    total: questionIds.length,
    mode: session.mode,
  };

  return (
    <PracticeInteractive
      question={questionVM}
      session={sessionVM}
      initialAttempt={initialAttempt}
      submitAnswerAction={submitAnswer}
      basePath="/tutor/training"
      sessionCompleteHref="/tutor/dashboard?training_complete=1"
    />
  );
}
