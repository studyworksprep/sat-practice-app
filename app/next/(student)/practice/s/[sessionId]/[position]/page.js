// Practice session question page — the core of the Server-Component-
// based content-protection story from docs/architecture-plan.md §3.7.
//
// URL shape: /practice/s/[sessionId]/[position]
//   - sessionId is an opaque uuid keyed to a practice_sessions row
//   - position is the 0-indexed offset into the session's question_ids
//
// The server resolves (sessionId, position) → question_id on every
// request. The client never sees the full question_ids array; URL
// manipulation reveals nothing. RLS on practice_sessions ensures only
// the owning user can read the row.
//
// Question content is rendered as HTML on the server — stimulus_html,
// stem_html, and each option's content_html — via dangerouslySetInnerHTML
// in the JSX below. No JSON payload is sent to the client. An attacker
// hitting /practice/s/*/0 sees formatted HTML, not a scrapable object.
// Watermarking is applied via lib/content/watermark.js before
// rendering, keying off the authenticated user id.
//
// The correct answer and rationale are NOT fetched in this page. They
// are delivered via the submitAnswer Server Action only after the
// student has submitted, server-gated on the existence of an attempts
// row. See actions.js in this directory.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { applyWatermark } from '@/lib/content/watermark';
import { submitAnswer } from './actions';
import { PracticeInteractive } from './PracticeInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeQuestionPage({ params }) {
  const { sessionId, position: positionStr } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const position = Number(positionStr);
  if (!Number.isInteger(position) || position < 0) notFound();

  // 1) Load the session. RLS pins this to the owning user.
  const { data: session, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, current_position, test_type, mode, expires_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionErr || !session) notFound();
  if (session.user_id !== user.id) notFound();
  if (new Date(session.expires_at) < new Date()) {
    redirect('/practice/start?expired=1');
  }

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();
  if (position >= questionIds.length) {
    // Ran off the end — send them to the dashboard for now. A proper
    // summary page lands in a follow-up commit.
    redirect('/dashboard?session_complete=1');
  }

  const questionId = questionIds[position];

  // 2) Advance the persisted cursor if the student is moving forward.
  //    Non-blocking: a failure here doesn't break the render.
  if (position !== session.current_position) {
    // Fire-and-forget. Don't await — the update isn't on the critical path.
    supabase
      .from('practice_sessions')
      .update({
        current_position: position,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .then(() => {}, () => {});
  }

  // 3) Load the question content. Uses v1 tables (questions,
  //    question_versions, answer_options, question_taxonomy). Phase 3
  //    migrates to questions_v2.
  //
  //    question_versions → answer_options is a FK relation, so we
  //    pull them together via a nested Supabase select. That leaves
  //    just three parallel queries: question row, version+options,
  //    taxonomy, and the student's most recent attempt.
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

  // 4) Apply per-user watermarking to all HTML content before
  //    embedding. Invisible to real students, decodable from leaked
  //    text via watermarkTag(userId). See §3.7.
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

  // 5) Build the view-model handed to the client island. The client
  //    sees rendered HTML strings for the server-rendered regions
  //    and opaque option ids for interaction — never the correct
  //    answer, never the rationale, until the student has submitted.
  const questionVM = {
    questionId: question.id,
    externalId: question.source_external_id,
    questionType: version.question_type,
    stimulusHtml,
    stemHtml,
    options: wmOptions,
    taxonomy: taxonomy ?? null,
  };

  // If the student has already submitted this question, we reveal the
  // previous outcome on initial render. The Server Action will still
  // re-gate rationale delivery if they submit again.
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
    />
  );
}
