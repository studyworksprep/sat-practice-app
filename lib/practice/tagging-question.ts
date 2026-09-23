// The question view-model the technique tagging screen renders
// (docs/foundations-and-question-patterns.md §8.5 step B).
//
// One loader serves both the Server Component (first question, server
// rendered) and the Server Action the screen calls as the editor moves
// to the next question, so the shape a tagger sees is the same either
// way. Mirrors QuestionReviewPage's view-model: rendered HTML where it
// exists, options normalized to {id, label, content_html}, and the
// correct answer + rationale revealed — deciding *how* a question is
// solved is easier with the solution in view.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { inferLayoutMode } from '@/lib/ui/question-layout';

const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

export interface TaggingQuestionVM {
  questionId: string;
  displayCode: string | null;
  questionType: 'mcq' | 'spr';
  /** Absent (not null) when there is no passage — the renderer's prop shape. */
  stimulusHtml?: string;
  stemHtml: string;
  options: Array<{ id: string; label: string; content_html: string }>;
  taxonomy: {
    domain_name: string | null;
    skill_name: string | null;
    difficulty: number | null;
    source: string | null;
  };
  subject: 'math' | 'rw';
  layout: 'single' | 'two-column';
  result: {
    correctOptionId: string | null;
    correctAnswerDisplay: string | null;
    rationaleHtml: string;
  };
  /** Seam for AI-suggested tags (later): techniques a model proposed
   *  for this question, shown as one-click suggestions. Always null
   *  today — nothing proposes yet. */
  suggestions: Array<{ techniqueId: string; reason: string }> | null;
}

interface OptionRow {
  id?: string;
  label?: string;
  text?: string;
  content_html?: string;
  content_html_rendered?: string;
}

export async function loadTaggingQuestionVM(
  supabase: TypedSupabaseClient,
  questionId: string,
): Promise<TaggingQuestionVM | null> {
  const { data: q } = await supabase
    .from('questions_v2')
    // One literal, not a concatenation: the client's select parser
    // types the row from the string, and a computed string is opaque
    // to it.
    .select(
      'id, question_type, display_code, stimulus_html, stem_html, options, correct_answer, rationale_html, stimulus_rendered, stem_rendered, options_rendered, rationale_rendered, domain_code, domain_name, skill_name, difficulty, source, deleted_at',
    )
    .eq('id', questionId)
    .maybeSingle();
  if (!q || q.deleted_at) return null;

  const optionsSource = (Array.isArray(q.options_rendered)
    ? q.options_rendered
    : Array.isArray(q.options)
      ? q.options
      : []) as OptionRow[];
  const options = optionsSource.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    return {
      id: label,
      label,
      content_html: opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '',
    };
  });

  const isSpr = q.question_type === 'spr';
  const layout = inferLayoutMode(q.domain_code) as 'single' | 'two-column';
  return {
    questionId: q.id,
    displayCode: q.display_code,
    questionType: isSpr ? 'spr' : 'mcq',
    stimulusHtml: (q.stimulus_rendered ?? q.stimulus_html) || undefined,
    stemHtml: q.stem_rendered ?? q.stem_html ?? '',
    options,
    taxonomy: {
      domain_name: q.domain_name,
      skill_name: q.skill_name,
      difficulty: q.difficulty,
      source: q.source,
    },
    subject: MATH_DOMAINS.has(q.domain_code ?? '') ? 'math' : 'rw',
    layout,
    result: {
      correctOptionId: !isSpr ? extractMcqCorrectId(q.correct_answer) : null,
      correctAnswerDisplay: isSpr ? formatSprCorrect(q.correct_answer) : null,
      rationaleHtml: q.rationale_rendered ?? q.rationale_html ?? '',
    },
    suggestions: null,
  };
}
