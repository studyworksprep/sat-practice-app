'use server';

// Server Action for the admin question-authoring page. Takes the
// editor's structured payload (ProseMirror JSON per surface + the
// taxonomy / answer metadata), serializes each surface to clean bank
// HTML, pre-renders the math server-side, and inserts a new
// questions_v2 row.
//
// Invariants for authored questions:
//   - source        = 'studyworks'   (distinguishes in-house content)
//   - is_published  = false          (never live until an admin flips
//                                      it from the question detail page)
//   - display_code is left NULL so the BEFORE INSERT trigger assigns
//     the next M-/RW- code from the row's domain_code.
//
// Admin-gated via requireRole; RLS on questions_v2 enforces the same
// at the DB layer.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { docToBankHtml, docToBankHtmlOrNull } from '@/lib/content/bank-html';
import { findDomain, findSkill } from '@/lib/practice/sat-taxonomy';
import { renderRow } from '@/lib/content/render-math.mjs';

function fail(message) {
  return { error: message };
}

export async function createQuestion(payload) {
  const { supabase } = await requireRole(['admin']);

  const questionType = payload?.question_type;
  if (questionType !== 'mcq' && questionType !== 'spr') {
    return fail('Pick a question type.');
  }

  // ── Taxonomy (names resolved from the canonical table) ──────────
  const domain = findDomain(payload?.domain_code);
  if (!domain) return fail('Pick a domain.');
  const skill = findSkill(payload?.domain_code, payload?.skill_code);
  if (!skill) return fail('Pick a skill.');

  // ── Difficulty / score band (optional, range-checked) ───────────
  const difficulty = normalizeInt(payload?.difficulty, 1, 3);
  if (difficulty === 'invalid') return fail('Difficulty must be 1–3.');
  const scoreBand = normalizeInt(payload?.score_band, 1, 7);
  if (scoreBand === 'invalid') return fail('Score band must be 1–7.');

  // ── Content surfaces → bank HTML ────────────────────────────────
  const stemHtml = docToBankHtml(payload?.stem, 'stem');
  if (!stemHtml) return fail('The question stem is required.');
  const stimulusHtml = docToBankHtmlOrNull(payload?.stimulus, 'stimulus');
  const rationaleHtml = docToBankHtmlOrNull(payload?.rationale, 'rationale');

  // ── Options + correct answer ────────────────────────────────────
  let options = null;
  let correctAnswer;

  if (questionType === 'mcq') {
    const rawOptions = Array.isArray(payload?.options) ? payload.options : [];
    const built = [];
    for (let i = 0; i < rawOptions.length; i++) {
      const label = (rawOptions[i]?.label || String.fromCharCode(65 + i)).trim();
      const contentHtml = docToBankHtml(rawOptions[i]?.doc, 'option');
      if (!contentHtml) return fail(`Option ${label} is empty.`);
      built.push({ label, ordinal: i + 1, content_html: contentHtml });
    }
    if (built.length < 2) return fail('Add at least two answer choices.');

    const labels = built.map((o) => o.label);
    if (new Set(labels).size !== labels.length) {
      return fail('Answer-choice labels must be unique.');
    }
    const correctLabel = payload?.correct_option_label;
    if (!correctLabel || !labels.includes(correctLabel)) {
      return fail('Mark which answer choice is correct.');
    }
    options = built;
    correctAnswer = {
      option_label: correctLabel,
      option_labels: null,
      text: null,
      number: null,
      tolerance: null,
    };
  } else {
    // SPR: accepted answers (one per line), optional numeric tolerance.
    const answers = Array.isArray(payload?.spr_answers)
      ? payload.spr_answers.map((a) => String(a).trim()).filter(Boolean)
      : [];
    if (answers.length === 0) return fail('Add at least one accepted answer.');

    const tolerance = payload?.spr_tolerance == null || payload.spr_tolerance === ''
      ? null
      : Number(payload.spr_tolerance);
    if (tolerance != null && !Number.isFinite(tolerance)) {
      return fail('Tolerance must be a number.');
    }
    // Store a numeric target when exactly one answer is numeric, so
    // the grader's numeric-tolerance fallback has something to use.
    const numericTarget = answers.length === 1 && Number.isFinite(Number(answers[0]))
      ? Number(answers[0])
      : null;

    correctAnswer = {
      text: JSON.stringify(answers),
      number: numericTarget,
      tolerance,
      option_label: null,
      option_labels: null,
    };
  }

  // ── Pre-render math (so the new-tree read path shows SVG, not raw
  //    \( … \) source) and insert. ────────────────────────────────
  const rendered = renderRow({
    id: 'new',
    stem_html: stemHtml,
    stimulus_html: stimulusHtml,
    rationale_html: rationaleHtml,
    options,
  });

  const insertRow = {
    question_type: questionType,
    stem_html: stemHtml,
    stimulus_html: stimulusHtml,
    rationale_html: rationaleHtml,
    options,
    correct_answer: correctAnswer,
    domain_code: domain.code,
    domain_name: domain.name,
    skill_code: skill.code,
    skill_name: skill.name,
    difficulty: difficulty === 'empty' ? null : difficulty,
    score_band: scoreBand === 'empty' ? null : scoreBand,
    source: 'studyworks',
    is_published: false,
    stem_rendered: rendered.stem_rendered,
    stimulus_rendered: rendered.stimulus_rendered,
    rationale_rendered: rendered.rationale_rendered,
    options_rendered: rendered.options_rendered,
    rendered_source_hash: rendered.rendered_source_hash,
    rendered_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('questions_v2')
    .insert(insertRow)
    .select('id')
    .single();

  if (error) return fail(`Could not save: ${error.message}`);

  revalidatePath('/admin/questions');
  redirect(`/admin/questions/${data.id}`);
}

// Returns: a number in range, 'empty' for blank, or 'invalid' for a
// non-integer / out-of-range value.
function normalizeInt(value, min, max) {
  if (value == null || value === '') return 'empty';
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return 'invalid';
  return n;
}
