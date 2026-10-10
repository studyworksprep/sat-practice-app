// Generate one ACT rationale with Claude and validate it against
// the key. Server-only (reads ANTHROPIC_API_KEY through the shared
// admin helper). Callers persist the result to act_rationale_drafts.
//
// Transport: the repo's raw-fetch helper (lib/admin/claude.js) rather
// than the SDK — same convention as the SAT alternate-question
// generator and the ACT importer, so retries/backoff live in one
// place. Thinking is adaptive (always on for this model); effort is
// set explicitly because the model's default is medium and the Math
// rationales need the work actually done.

import { fetchClaudeMessages, extractToolUse } from '../admin/claude.js';
import {
  RATIONALE_MODEL,
  PROMPT_VERSION,
  RATIONALE_SYSTEM_PROMPT,
  RETURN_RATIONALE_TOOL,
  sectionReminder,
} from './prompt.ts';
import { extractFigureUrls, validateRationale } from './validate.ts';

export interface RationaleSourceOption {
  label: string;
  content_html: string;
  is_correct: boolean;
}

export interface RationaleSource {
  id: string;
  section: string;
  category: string | null;
  subcategory: string | null;
  stimulus_html: string | null;
  stem_html: string;
  options: RationaleSourceOption[];
}

export interface GeneratedRationale {
  rationaleHtml: string;
  answerLetter: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  model: string;
  promptVersion: string;
  figureUrls: string[];
  errors: string[];
  warnings: string[];
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } };

/** Build the user turn: figure images first (if any), then the
 *  question as JSON plus the section reminder. Exported for tests. */
export function buildUserContent(src: RationaleSource): ContentBlock[] {
  const figureUrls = extractFigureUrls(
    src.stimulus_html,
    src.stem_html,
    ...src.options.map((o) => o.content_html),
  );
  const payload = {
    section: src.section,
    category: src.category,
    subcategory: src.subcategory,
    stimulus_html: src.stimulus_html || null,
    stem_html: src.stem_html,
    options: src.options.map((o) => ({
      label: o.label,
      content_html: o.content_html,
      is_correct: o.is_correct,
    })),
    figures_attached: figureUrls.length,
  };
  const blocks: ContentBlock[] = figureUrls.map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }));
  blocks.push({
    type: 'text',
    text: `${sectionReminder(src.section)}\n\nQuestion:\n${JSON.stringify(payload)}`,
  });
  return blocks;
}

export async function generateRationale(src: RationaleSource): Promise<GeneratedRationale> {
  const correct = src.options.find((o) => o.is_correct);
  if (!correct) throw new Error('Question has no keyed option.');
  const content = buildUserContent(src);
  const figureUrls = content
    .filter((b): b is Extract<ContentBlock, { type: 'image' }> => b.type === 'image')
    .map((b) => b.source.url);

  const response = await fetchClaudeMessages({
    model: RATIONALE_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: [
      { type: 'text', text: RATIONALE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [RETURN_RATIONALE_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  });

  if (response?.stop_reason === 'refusal') {
    const why = response?.stop_details?.explanation ?? 'no explanation';
    throw new Error(`Model declined the request (${why}).`);
  }
  if (response?.stop_reason === 'max_tokens') {
    throw new Error('Model response was truncated at max_tokens.');
  }

  const out = extractToolUse(response, RETURN_RATIONALE_TOOL.name) as {
    rationale_html?: unknown;
    answer_letter?: unknown;
    confidence?: unknown;
    notes?: unknown;
  } | null;
  if (!out || typeof out.rationale_html !== 'string') {
    throw new Error('Model did not return a rationale.');
  }

  const rationaleHtml = out.rationale_html.trim();
  const answerLetter = typeof out.answer_letter === 'string' ? out.answer_letter.trim() : '';
  const confidence: GeneratedRationale['confidence'] =
    out.confidence === 'low' || out.confidence === 'medium' ? out.confidence : 'high';
  const notes = typeof out.notes === 'string' ? out.notes.trim() : '';

  const check = validateRationale({
    rationaleHtml,
    answerLetter,
    correctLabel: correct.label,
    labels: src.options.map((o) => o.label),
    confidence,
  });

  return {
    rationaleHtml,
    answerLetter,
    confidence,
    notes,
    model: RATIONALE_MODEL,
    promptVersion: PROMPT_VERSION,
    figureUrls,
    errors: check.errors,
    warnings: check.warnings,
  };
}
