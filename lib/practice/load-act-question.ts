// ACT-side helpers for the unified practice runner. The runner page
// is shared with SAT (same /practice/s/[sessionId]/[position] URL);
// load-question.ts forks on `session.test_type` and delegates ACT
// sessions here. See docs/architecture-plan.md §3.4 — "the fork
// happens at the loader and write-action layer."
//
// Shape parity with the SAT path is intentional: same QuestionVM,
// same MapItem, same InitialAttempt. The renderer doesn't need to
// branch on test type, only the data layer does. Differences from
// SAT, all absorbed inside this file:
//
//   - Options live in `act_answer_options`, not inline on the
//     question row. Two-query load per page (question + options).
//   - Option ids carry through as UUIDs (the act_answer_options.id),
//     not letters — `act_attempts.selected_option_id` is a real
//     foreign key, so we keep the UUID end-to-end and let the
//     renderer display the letter via the `label` field.
//   - Correctness lives on `act_answer_options.is_correct` rather
//     than a `correct_answer` jsonb. The grade helper compares the
//     submitted UUID against the option flagged is_correct.
//   - Taxonomy uses section/category/subcategory rather than
//     domain/skill. We map onto the existing QuestionTaxonomy
//     shape (domain_code = section, skill_code = category_code,
//     etc.) so the renderer + review aggregator consume one shape.
//   - No is_published / deleted_at columns on act_questions today;
//     `is_broken` is the only soft-removal flag.

import { applyWatermark } from '@/lib/content/watermark';
import { inferActLayoutMode } from '@/lib/practice/act-taxonomy';
import type { MapItem, QuestionTaxonomy, QuestionVM } from '@/lib/practice/load-question';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

interface ActQuestionRow {
  id: string;
  external_id: string | null;
  section: string;
  category: string | null;
  category_code: string | null;
  subcategory: string | null;
  subcategory_code: string | null;
  difficulty: number | null;
  question_type: string;
  stimulus_html: string | null;
  stem_html: string;
  rationale_html: string | null;
  is_broken: boolean;
  source_ordinal: number | null;
}

interface ActOptionRow {
  id: string;
  question_id: string;
  ordinal: number;
  label: string;
  content_html: string;
  is_correct: boolean;
}

interface ActAttemptRow {
  id: string;
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean;
  created_at: string;
}

/** Load one ACT question + its options in the shape the runner
 *  expects. Returns null when the question is missing or flagged
 *  broken; the loader treats that the same as the SAT 'removed'
 *  case. */
export async function loadActQuestionContent(
  supabase: SB,
  questionId: string,
  userId: string,
): Promise<{ vm: QuestionVM; isRemoved: boolean } | null> {
  const [{ data: question }, { data: options }] = await Promise.all([
    supabase
      .from('act_questions')
      .select(
        'id, external_id, section, category, category_code, subcategory, subcategory_code, difficulty, question_type, stimulus_html, stem_html, rationale_html, is_broken, source_ordinal',
      )
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('act_answer_options')
      .select('id, question_id, ordinal, label, content_html, is_correct')
      .eq('question_id', questionId)
      .order('ordinal', { ascending: true }),
  ]);

  if (!question) return null;
  const q = question as ActQuestionRow;

  // is_broken is the ACT-side soft-removal flag (no is_published /
  // deleted_at columns exist today). Treat broken rows the same as
  // SAT's removed state so the runner renders the "this question is
  // unavailable" placeholder.
  if (q.is_broken) {
    return {
      isRemoved: true,
      vm: makeEmptyVM(q.id),
    };
  }

  const stimulusHtml = applyWatermark(q.stimulus_html ?? '', userId);
  const stemHtml = applyWatermark(q.stem_html ?? '', userId);

  const optRows = (options ?? []) as ActOptionRow[];
  const vmOptions = optRows.map((o) => ({
    // Keep the UUID as the option's id — act_attempts.selected_option_id
    // is a real foreign key, and the grader compares UUIDs directly.
    id: o.id,
    ordinal: o.ordinal,
    label: o.label,
    content_html: applyWatermark(o.content_html ?? '', userId),
  }));

  return {
    isRemoved: false,
    vm: {
      questionId: q.id,
      externalId: q.external_id,
      questionType: q.question_type,
      stimulusHtml,
      stemHtml,
      options: vmOptions,
      layout: inferActLayoutMode(q.section),
      taxonomy: mapActTaxonomy(q),
      // Highlight the [data-q="N"] span the parser emitted for
      // this question — only meaningful on english + reading
      // today, but every ACT row carries source_ordinal so we
      // pass it through unconditionally. Renderer no-ops when
      // the stimulus has no matching marker.
      qrefOrdinal: q.source_ordinal ?? null,
    },
  };
}

/** Map ACT's section/category onto the shared QuestionTaxonomy shape
 *  so renderers consuming `taxonomy.domain_name / skill_name` work
 *  unchanged. Section goes in the domain slot, category in the skill
 *  slot. */
function mapActTaxonomy(q: ActQuestionRow): QuestionTaxonomy {
  return {
    domain_code: q.section ?? null,
    domain_name: q.section ? capitalize(q.section) : null,
    skill_code: q.category_code ?? null,
    skill_name: q.category ?? null,
    difficulty: q.difficulty ?? null,
    score_band: null,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function makeEmptyVM(questionId: string): QuestionVM {
  return {
    questionId,
    externalId: null,
    questionType: 'mcq',
    stimulusHtml: '',
    stemHtml: '',
    options: [],
    layout: 'single',
    taxonomy: {
      domain_code: null,
      domain_name: null,
      skill_code: null,
      skill_name: null,
      difficulty: null,
      score_band: null,
    },
    qrefOrdinal: null,
  };
}

/** Load the last attempt for one (user, ACT question) pair, optionally
 *  bounded by an assignment-session start timestamp. Mirrors the SAT
 *  loader's lastAttempt logic but reads `act_attempts` instead of
 *  `attempts`. */
export async function loadActLastAttempt(
  supabase: SB,
  userId: string,
  questionId: string,
  since: string | null,
): Promise<ActAttemptRow | null> {
  let q = supabase
    .from('act_attempts')
    .select('id, question_id, selected_option_id, is_correct, created_at')
    .eq('user_id', userId)
    .eq('question_id', questionId);
  if (since) q = q.gte('created_at', since);
  const { data } = await q
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActAttemptRow) ?? null;
}

/** Load every ACT attempt this user has on the session's question
 *  set, used to compute correct/incorrect status per map cell.
 *  Sibling to the SAT loader's sessionAttemptsQuery. */
export async function loadActSessionAttempts(
  supabase: SB,
  userId: string,
  questionIds: string[],
  since: string | null,
): Promise<Array<{ question_id: string; is_correct: boolean; created_at: string }>> {
  if (questionIds.length === 0) return [];
  let q = supabase
    .from('act_attempts')
    .select('question_id, is_correct, created_at')
    .eq('user_id', userId)
    .in('question_id', questionIds);
  if (since) q = q.gte('created_at', since);
  const { data } = await q.order('created_at', { ascending: false });
  return (data ?? []) as Array<{ question_id: string; is_correct: boolean; created_at: string }>;
}

/** Build the navigator map items for an ACT session. Mirrors the
 *  SAT path's `buildMapItems`; differences: we always treat the
 *  question as 'unanswered' or 'correct'/'incorrect' (no separate
 *  removed bucket beyond is_broken), and the `domainCode` tinting
 *  hint carries the section so a future selector can color cells
 *  per ACT subject. */
export async function loadActPublishedFlags(
  supabase: SB,
  questionIds: string[],
): Promise<Map<string, { is_broken: boolean; section: string | null }>> {
  const out = new Map<string, { is_broken: boolean; section: string | null }>();
  if (questionIds.length === 0) return out;
  const { data } = await supabase
    .from('act_questions')
    .select('id, is_broken, section')
    .in('id', questionIds);
  for (const r of (data ?? []) as Array<{ id: string; is_broken: boolean; section: string | null }>) {
    out.set(r.id, { is_broken: r.is_broken, section: r.section });
  }
  return out;
}

/** Build the ACT-side map items array. Same shape as the SAT
 *  buildMapItems output so the navigator strip consumes one type. */
export function buildActMapItems({
  questionIds,
  publishedById,
  attempts,
  markedSet,
}: {
  questionIds: string[];
  publishedById: Map<string, { is_broken: boolean; section: string | null }>;
  attempts: Array<{ question_id: string; is_correct: boolean }>;
  markedSet?: Set<number>;
}): MapItem[] {
  const latestByQid = new Map<string, { question_id: string; is_correct: boolean }>();
  for (const a of attempts) {
    if (!latestByQid.has(a.question_id)) latestByQid.set(a.question_id, a);
  }
  return questionIds.map((qid, i) => {
    const marked = markedSet?.has(i) ?? false;
    const pub = publishedById.get(qid);
    if (!pub || pub.is_broken) {
      return { position: i, status: 'removed' as const, marked, domainCode: null };
    }
    const att = latestByQid.get(qid);
    if (!att) {
      return { position: i, status: 'unanswered' as const, marked, domainCode: pub.section };
    }
    return {
      position: i,
      status: att.is_correct ? ('correct' as const) : ('incorrect' as const),
      marked,
      domainCode: pub.section,
    };
  });
}

/** Load the reveal payload (correct option + rationale) for an ACT
 *  question after the student submits. Sibling to loadReviewData on
 *  the SAT side. */
export async function loadActReviewData(
  supabase: SB,
  userId: string,
  questionId: string,
): Promise<{
  correctOptionId: string | null;
  correctAnswerDisplay: string | null;
  rationaleHtml: string | null;
} | null> {
  if (!questionId) return null;
  const [{ data: question }, { data: options }] = await Promise.all([
    supabase
      .from('act_questions')
      .select('rationale_html')
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('act_answer_options')
      .select('id, is_correct')
      .eq('question_id', questionId)
      .eq('is_correct', true)
      .limit(1)
      .maybeSingle(),
  ]);
  if (!question) return null;
  const correctOptionId =
    options && typeof (options as { id?: string }).id === 'string'
      ? ((options as { id: string }).id)
      : null;
  return {
    correctOptionId,
    // ACT is MCQ-only today, so no SPR display string needed.
    correctAnswerDisplay: null,
    rationaleHtml: applyWatermark(
      ((question as { rationale_html: string | null }).rationale_html) ?? '',
      userId,
    ),
  };
}

/** Grade an ACT MCQ submission. selectedOptionId is the
 *  act_answer_options.id UUID the student picked; we look up the
 *  question's correct option and compare. */
export async function gradeActMcq(
  supabase: SB,
  questionId: string,
  selectedOptionId: string,
): Promise<{ isCorrect: boolean; correctOptionId: string | null }> {
  const { data } = await supabase
    .from('act_answer_options')
    .select('id, is_correct')
    .eq('question_id', questionId)
    .eq('is_correct', true)
    .limit(1)
    .maybeSingle();
  const correctOptionId =
    data && typeof (data as { id?: string }).id === 'string'
      ? ((data as { id: string }).id)
      : null;
  return {
    isCorrect: !!correctOptionId && correctOptionId === selectedOptionId,
    correctOptionId,
  };
}
