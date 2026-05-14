// Server-side loader for the /review/error-log page. Returns the
// user's error-log entries newest-first, joined with each
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
//
// SAT and ACT entries live in the same question_error_notes
// table, scoped by the test_type discriminator (PR 1). The loader
// forks the join target — questions_v2 / attempts on the SAT
// side, act_questions / act_answer_options / act_attempts on the
// ACT side — and returns a uniform row shape so the review page
// can render either tree transparently.

import { applyWatermark } from '@/lib/content/watermark';
import {
  extractMcqCorrectId,
  formatSprCorrect,
} from '@/lib/practice/correct-answer';
import { sectionLabel } from '@/lib/practice/act-taxonomy';

/**
 * @param {object} args
 * @param {*} args.supabase
 * @param {string} args.userId
 * @param {'sat'|'act'} [args.testType='sat']
 * @param {number} [args.limit=200]
 */
export async function loadErrorNotes({ supabase, userId, testType = 'sat', limit = 200 }) {
  const { data: noteRows } = await supabase
    .from('question_error_notes')
    .select('question_id, body, updated_at')
    .eq('user_id', userId)
    .eq('test_type', testType)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (!noteRows || noteRows.length === 0) return [];

  const qids = noteRows.map((r) => r.question_id);

  return testType === 'act'
    ? buildActRows(supabase, userId, noteRows, qids)
    : buildSatRows(supabase, userId, noteRows, qids);
}

// ──────────────────────────────────────────────────────────────
// SAT side — joins questions_v2 + attempts.
// ──────────────────────────────────────────────────────────────

async function buildSatRows(supabase, userId, noteRows, qids) {
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
    const existing = statsByQid.get(qid) ?? { attempts: 0, correct: 0, latest: null };
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
    const preview = q ? buildSatPreview(q, userId, stat?.latest) : null;
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

function buildSatPreview(q, userId, latestAttempt) {
  const isSpr = q.question_type === 'spr';
  const stimulusHtml = applyWatermark(q.stimulus_rendered ?? q.stimulus_html ?? '', userId);
  const stemHtml = applyWatermark(q.stem_rendered ?? q.stem_html ?? '', userId);
  const optionsSource = Array.isArray(q.options_rendered)
    ? q.options_rendered
    : Array.isArray(q.options) ? q.options : [];
  const options = optionsSource.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
    return { id: label, ordinal: idx, label, content_html: applyWatermark(content, userId) };
  });
  const correctOptionId = !isSpr ? extractMcqCorrectId(q.correct_answer) : null;
  const correctAnswerDisplay = isSpr ? formatSprCorrect(q.correct_answer) : null;
  const rationaleHtml = applyWatermark(q.rationale_rendered ?? q.rationale_html ?? '', userId);
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

// ──────────────────────────────────────────────────────────────
// ACT side — joins act_questions + act_answer_options + act_attempts.
// Returns the same row shape so the rendering layer doesn't care.
// ACT is MCQ-only; SPR fields stay null.
// ──────────────────────────────────────────────────────────────

async function buildActRows(supabase, userId, noteRows, qids) {
  const [
    { data: questionRows },
    { data: optionRows },
    { data: attemptRows },
  ] = await Promise.all([
    supabase
      .from('act_questions')
      .select(
        'id, external_id, question_type, ' +
        'stimulus_html, stem_html, rationale_html, ' +
        'section, category, category_code, difficulty',
      )
      .in('id', qids),
    supabase
      .from('act_answer_options')
      .select('id, question_id, ordinal, label, content_html, is_correct')
      .in('question_id', qids)
      .order('ordinal', { ascending: true }),
    supabase
      .from('act_attempts')
      .select('question_id, is_correct, selected_option_id, created_at')
      .eq('user_id', userId)
      .in('question_id', qids)
      .order('created_at', { ascending: false }),
  ]);

  const qById = new Map();
  for (const q of questionRows ?? []) qById.set(q.id, q);

  // Bucket options + locate the correct option per question.
  const optionsByQid = new Map();
  const correctByQid = new Map();
  for (const opt of optionRows ?? []) {
    const arr = optionsByQid.get(opt.question_id) ?? [];
    arr.push(opt);
    optionsByQid.set(opt.question_id, arr);
    if (opt.is_correct) correctByQid.set(opt.question_id, opt.id);
  }

  const statsByQid = new Map();
  for (const a of attemptRows ?? []) {
    const qid = a.question_id;
    const existing = statsByQid.get(qid) ?? { attempts: 0, correct: 0, latest: null };
    existing.attempts += 1;
    if (a.is_correct) existing.correct += 1;
    if (existing.latest === null) {
      existing.latest = {
        isCorrect: !!a.is_correct,
        selectedOptionId: a.selected_option_id ?? null,
        responseText: '',
        createdAt: a.created_at,
      };
    }
    statsByQid.set(qid, existing);
  }

  return noteRows.map((row) => {
    const q = qById.get(row.question_id);
    const stat = statsByQid.get(row.question_id);
    const preview = q
      ? buildActPreview(q, optionsByQid.get(q.id) ?? [], correctByQid.get(q.id) ?? null, userId, stat?.latest)
      : null;
    return {
      questionId: row.question_id,
      body: row.body,
      updatedAt: row.updated_at,
      externalId: q?.external_id ?? null,
      // Map ACT section/category onto the SAT-shaped slots so the
      // row renderer doesn't need to branch on test type.
      domainCode: q?.section ?? null,
      domainName: q?.section ? sectionLabel(q.section) : null,
      skillName: q?.category ?? null,
      difficulty: q?.difficulty ?? null,
      attempts: stat?.attempts ?? 0,
      correct: stat?.correct ?? 0,
      lastIsCorrect: stat?.latest?.isCorrect ?? null,
      preview,
    };
  });
}

function buildActPreview(q, options, correctOptionId, userId, latestAttempt) {
  const stimulusHtml = applyWatermark(q.stimulus_html ?? '', userId);
  const stemHtml = applyWatermark(q.stem_html ?? '', userId);
  const sortedOpts = (options ?? []).slice().sort(
    (a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0),
  );
  const vmOptions = sortedOpts.map((opt) => ({
    // Keep the option UUID as the id so the runner-style highlight
    // logic can match against the student's selected_option_id.
    id: opt.id,
    ordinal: opt.ordinal,
    label: opt.label,
    content_html: applyWatermark(opt.content_html ?? '', userId),
  }));
  const rationaleHtml = applyWatermark(q.rationale_html ?? '', userId);
  return {
    isSpr: false, // ACT is MCQ-only.
    stimulusHtml,
    stemHtml,
    options: vmOptions,
    correctOptionId,
    correctAnswerDisplay: null,
    rationaleHtml,
    studentAnswer: latestAttempt
      ? {
          isCorrect: latestAttempt.isCorrect,
          selectedOptionId: latestAttempt.selectedOptionId,
          responseText: null,
        }
      : null,
  };
}
