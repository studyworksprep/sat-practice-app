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
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { applyWatermark } from '@/lib/content/watermark';
import { submitAnswer } from '@/lib/practice/session-actions';
import { loadReviewData } from '@/lib/practice/load-review-data';
import { PracticeInteractive } from '@/lib/practice/PracticeInteractive';
import { QuestionMap } from '@/lib/practice/QuestionMap';
import { inferLayoutMode } from '@/lib/ui/question-layout';

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

  // 3) Load the question content from questions_v2 + the student's
  //    prior attempt (for resume-reveal) + the full status list for
  //    the question map footer. One Promise.all; three independent
  //    queries.
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
    // All of this user's attempts for this session's question set.
    // Used to stamp correct / incorrect pills on the question map.
    // Latest attempt per question_id wins if a student re-tried.
    supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', user.id)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false }),
    // Publish / deletion check across the whole session — one IN
    // query instead of per-position round-trips. Rows missing from
    // the result are "removed" (deleted, unpublished, or missing).
    supabase
      .from('questions_v2')
      .select('id, is_published, deleted_at')
      .in('id', questionIds),
  ]);

  // Question-removed / invalid state. Instead of notFound() — which
  // would take the student out of the session entirely — render a
  // soft "this question isn't available" state with the question
  // map still visible so they can jump elsewhere.
  const questionRemoved = !question
    || question.deleted_at
    || !question.is_published;

  // Build the map items once, reused in both the happy-path render
  // and the question-removed render.
  const mapItems = buildMapItems({
    questionIds,
    publishedRows: sessionPublished ?? [],
    attempts: sessionAttempts ?? [],
  });

  if (questionRemoved) {
    return (
      <main style={REMOVED_S.main}>
        <h1 style={REMOVED_S.h1}>This question was removed</h1>
        <p style={REMOVED_S.sub}>
          It was either unpublished or deleted after your session was
          created. Pick another question from the map below, or{' '}
          <Link href="/practice/start" style={REMOVED_S.link}>
            start a new session
          </Link>.
        </p>
        <QuestionMap
          basePath="/practice"
          sessionId={sessionId}
          currentPosition={position}
          items={mapItems}
        />
      </main>
    );
  }

  // 4) Apply per-user watermarking to all HTML content before
  //    embedding. Invisible to real students, decodable from leaked
  //    text via watermarkTag(userId). See §3.7. We watermark the
  //    pre-rendered HTML when present — the watermark injects between
  //    tags at the first non-accessibility-attr boundary, which still
  //    lands cleanly inside the rendered output's wrapper tags.
  const stimulusHtml = applyWatermark(
    question.stimulus_rendered ?? question.stimulus_html,
    user.id,
  );
  const stemHtml = applyWatermark(
    question.stem_rendered ?? question.stem_html,
    user.id,
  );

  // v2 options are a jsonb array of {label, ordinal, content_html}
  // objects (dev-seed rows still use the older {id, text} shape — the
  // fallbacks below accept either). The option letter is returned to
  // the server as `optionId` when the student submits.
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

  // 5) Build the view-model handed to the client island. The client
  //    sees rendered HTML strings for the server-rendered regions
  //    and opaque option ids for interaction — never the correct
  //    answer, never the rationale, until the student has submitted.
  const questionVM = {
    questionId: question.id,
    externalId: question.display_code,
    questionType: question.question_type,
    stimulusHtml,
    stemHtml,
    options: wmOptions,
    // Layout preference from domain_code: reading-section domains
    // (CAS/EOI/INI/SEC) → two-column (passage on the left, stem +
    // options on the right); math domains render single-column.
    // The renderer also falls back to single-column if there's no
    // stimulus or the viewport is narrow.
    layout: inferLayoutMode(question.domain_code),
    taxonomy: {
      domain_name: question.domain_name,
      skill_name: question.skill_name,
      difficulty: question.difficulty,
      score_band: question.score_band,
    },
  };

  // If the student has already submitted this question, eagerly load
  // the rationale and correct answer so the page renders directly in
  // the reviewed state. Avoids forcing the student to re-submit just
  // to see the rationale on a question they've already answered. The
  // submitAnswer Server Action still server-gates the same data on
  // any re-submission.
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

  // Review-mode sessions exit back to the review list; practice-mode
  // sessions exit to the student dashboard. Same page handles both
  // because the only difference is where the student lands at the end.
  const sessionCompleteHref =
    session.mode === 'review'
      ? '/review?complete=1'
      : '/dashboard?session_complete=1';

  return (
    <>
      <PracticeInteractive
        key={`${sessionId}-${position}`}
        question={questionVM}
        session={sessionVM}
        initialAttempt={initialAttempt}
        submitAnswerAction={submitAnswer}
        basePath="/practice"
        sessionCompleteHref={sessionCompleteHref}
      />
      <QuestionMap
        basePath="/practice"
        sessionId={sessionId}
        currentPosition={position}
        items={mapItems}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Build the per-position item array the QuestionMap renders.
// Latest attempt per question_id wins (attempts are already
// ordered created_at desc by the caller). Missing from the
// published-rows lookup = removed.
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

const REMOVED_S = {
  main: { maxWidth: 720, margin: '3rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  h1: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' },
  sub: { color: '#4b5563', lineHeight: 1.5 },
  link: { color: '#2563eb', textDecoration: 'none', fontWeight: 600 },
};
