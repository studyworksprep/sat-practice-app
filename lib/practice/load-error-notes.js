// Server-side loader for the /review/error-log page. Returns
// the user's error-log entries newest-first, joined with each
// question's taxonomy + accuracy summary + the static content
// (stem, options, correct answer, rationale) so the row can
// render an expandable static preview without a per-row fetch.
//
// Static rather than interactive on purpose — the error-log row
// is a read-only review surface; the student doesn't re-answer
// the question here, they just want to remind themselves what
// the question said and what the right answer was. Same content
// is watermarked against the viewer's id (same protection
// contract as the in-session review).

import { applyWatermark } from '@/lib/content/watermark';
import {
  extractMcqCorrectId,
  formatSprCorrect,
} from '@/lib/practice/correct-answer';

/**
 * @param {object} args
 * @param {*} args.supabase
 * @param {string} args.userId
 * @param {number} [args.limit=200]
 */
export async function loadErrorNotes({ supabase, userId, limit = 200 }) {
  const { data: noteRows } = await supabase
    .from('question_error_notes')
    .select('question_id, body, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (!noteRows || noteRows.length === 0) return [];

  const qids = noteRows.map((r) => r.question_id);

  // Pull the static question content + taxonomy + the student's
  // attempts in two parallel reads.
  const [{ data: questionRows }, { data: attemptRows }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select(
        'id, question_type, display_code, ' +
        'stimulus_html, stem_html, options, ' +
        'stimulus_rendered, stem_rendered, options_rendered, ' +
        'rationale_html, rationale_rendered, correct_answer, ' +
        'domain_code, domain_name, skill_name, difficulty',
      )
      .in('id', qids),
    supabase
      .from('attempts')
      .select('question_id, is_correct, selected_option_id, response_text, created_at')
      .eq('user_id', userId)
      .in('question_id', qids)
      .order('created_at', { ascending: false }),
  ]);

  const qById = new Map();
  for (const q of questionRows ?? []) qById.set(q.id, q);

  // Per-question: count + the latest attempt details (latest is
  // first since we ordered desc).
  const statsByQid = new Map();
  for (const a of attemptRows ?? []) {
    const qid = a.question_id;
    const existing = statsByQid.get(qid) ?? {
      attempts: 0,
      correct: 0,
      latest: null,
    };
    existing.attempts += 1;
    if (a.is_correct) existing.correct += 1;
    if (existing.latest === null) {
      existing.latest = {
        isCorrect: !!a.is_correct,
        selectedOptionId: a.response_text ?? null,
        responseText: a.response_text ?? '',
        createdAt: a.created_at,
      };
    }
    statsByQid.set(qid, existing);
  }

  return noteRows.map((row) => {
    const q = qById.get(row.question_id);
    const stat = statsByQid.get(row.question_id);

    // Build the static preview payload only when the question
    // still resolves — a missing/unpublished question still gets
    // a row (the note text remains useful) but with preview=null.
    const preview = q ? buildPreview(q, userId, stat?.latest) : null;

    return {
      questionId: row.question_id,
      body: row.body,
      updatedAt: row.updated_at,
      externalId: q?.display_code ?? null,
      domainCode: q?.domain_code ?? null,
      domainName: q?.domain_name ?? null,
      skillName: q?.skill_name ?? null,
      difficulty: q?.difficulty ?? null,
      attempts: stat?.attempts ?? 0,
      correct: stat?.correct ?? 0,
      lastIsCorrect: stat?.latest?.isCorrect ?? null,
      preview,
    };
  });
}

function buildPreview(q, userId, latestAttempt) {
  const isSpr = q.question_type === 'spr';

  const stimulusHtml = applyWatermark(
    q.stimulus_rendered ?? q.stimulus_html ?? '',
    userId,
  );
  const stemHtml = applyWatermark(q.stem_rendered ?? q.stem_html ?? '', userId);

  const optionsSource = Array.isArray(q.options_rendered)
    ? q.options_rendered
    : Array.isArray(q.options)
      ? q.options
      : [];
  const options = optionsSource.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
    return {
      id: label,
      ordinal: idx,
      label,
      content_html: applyWatermark(content, userId),
    };
  });

  const correctOptionId = !isSpr ? extractMcqCorrectId(q.correct_answer) : null;
  const correctAnswerDisplay = isSpr ? formatSprCorrect(q.correct_answer) : null;
  const rationaleHtml = applyWatermark(
    q.rationale_rendered ?? q.rationale_html ?? '',
    userId,
  );

  return {
    isSpr,
    stimulusHtml,
    stemHtml,
    options,
    correctOptionId,
    correctAnswerDisplay,
    rationaleHtml,
    studentAnswer: latestAttempt
      ? {
          isCorrect: latestAttempt.isCorrect,
          // For MCQ, the v2-era response_text carries the option
          // letter (A/B/C/D); for SPR it carries the typed string.
          selectedOptionId: !isSpr ? latestAttempt.selectedOptionId : null,
          responseText: isSpr ? latestAttempt.responseText : null,
        }
      : null,
  };
}
