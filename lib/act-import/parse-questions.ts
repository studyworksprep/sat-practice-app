// Per-section question parsers for english / reading / science / math.
//
// Shape:
//   1. Download the whole-test PDF (and answer-key PDF, if present)
//      from the act-imports bucket as base64.
//   2. Hand both to Claude with the section-specific system
//      prompt from ./prompts.
//   3. Parse the JSON response, apply the section's difficulty
//      formula, and shape rows for act_question_drafts.
//
// Returns the row payloads — the caller (the per-section
// Server Action) is responsible for the actual insert, status
// updates, and log entries so this stays a pure transform.

import type { SupabaseClient } from '@supabase/supabase-js';
import { callClaude, parseClaudeJson, type ContentBlock } from './anthropic';
import { downloadAsBase64, downloadAsText } from './storage';
import { mathDifficulty, scienceDifficulty } from './difficulty';
import { SECTION_PROMPTS } from './prompts';
import type { ActSection } from '@/lib/practice/act-taxonomy';

export interface RawParsedOption {
  label?: string;
  content_html?: string;
  is_correct?: boolean;
}

export interface RawParsedQuestion {
  source_ordinal: number;
  section?: string;
  category?: string | null;
  category_code?: string | null;
  subcategory?: string | null;
  subcategory_code?: string | null;
  difficulty?: number | null;
  is_modeling?: boolean | null;
  passage_index?: number | null;
  questions_in_passage?: number | null;
  stimulus_html?: string | null;
  stem_html: string;
  rationale_html?: string | null;
  options: RawParsedOption[];
  needs_figure?: boolean;
  parse_warnings?: string[];
}

export interface DraftInsertRow {
  import_job_id: string;
  source_test: string;
  section: ActSection;
  source_ordinal: number;
  stimulus_html: string | null;
  stem_html: string;
  rationale_html: string | null;
  difficulty: number | null;
  category: string | null;
  category_code: string | null;
  subcategory: string | null;
  subcategory_code: string | null;
  options_json: Array<{ label: string; content_html: string; is_correct: boolean }>;
  needs_figure: boolean;
  parse_warnings: string[];
  status: 'ready_for_review';
}

export interface ParseSectionInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  jobId: string;
  sourceTest: string;
  section: ActSection;
  testPdfPath: string;
  answerKeyPath?: string | null;
  /** Optional Mathpix HTML export — used by the math parser as
   *  a higher-fidelity LaTeX source alongside the test PDF.
   *  Ignored on other sections. */
  mathHtmlPath?: string | null;
}

export interface ParseSectionResult {
  drafts: DraftInsertRow[];
  warnings: string[];
}

/** Parse one ACT section from the uploaded source PDFs. Returns
 *  the rows ready for insert into act_question_drafts plus any
 *  pipeline-level warnings (separate from per-question
 *  parse_warnings). */
export async function parseSection(input: ParseSectionInput): Promise<ParseSectionResult> {
  const { supabase, jobId, sourceTest, section, testPdfPath, answerKeyPath, mathHtmlPath } = input;

  const testPdf = await downloadAsBase64(supabase, testPdfPath);
  const userBlocks: ContentBlock[] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: testPdf.base64 },
    },
    { type: 'text', text: `Parse the ${section.toUpperCase()} section of source test "${sourceTest}".` },
  ];

  if (answerKeyPath) {
    const keyPdf = await downloadAsBase64(supabase, answerKeyPath);
    userBlocks.splice(1, 0, {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: keyPdf.base64 },
    });
    (userBlocks[2] as { text: string }).text +=
      ' The second PDF is the answer key — use it to set is_correct on each option and to confirm taxonomy.';
  }

  // Math-section enrichment: when the admin uploaded a Mathpix
  // HTML export, append it as a text block so Claude has the
  // pre-OCR'd LaTeX for every equation alongside the PDF vision.
  if (section === 'math' && mathHtmlPath) {
    try {
      const html = await downloadAsText(supabase, mathHtmlPath);
      userBlocks.push({
        type: 'text',
        text:
          'The following is the Mathpix HTML export of the math section, with equations already in LaTeX.' +
          ' Use it as the primary source for any equation that appears in both the PDF and the HTML:\n\n' +
          html,
      });
    } catch {
      // Soft-fail: parser still runs from the PDF alone.
    }
  }

  const text = await callClaude({
    system: SECTION_PROMPTS[section],
    userBlocks,
    maxTokens: 32000,
  });

  const raw = parseClaudeJson<RawParsedQuestion[]>(text);
  if (!Array.isArray(raw)) {
    throw new Error('Parser returned non-array JSON');
  }

  const warnings: string[] = [];
  const totalInSection = raw.length;

  // Group science questions by passage so the rising-wave
  // difficulty formula has its denominators.
  const sciencePassageSizes = new Map<number, number>();
  if (section === 'science') {
    for (const q of raw) {
      const p = q.passage_index ?? 0;
      sciencePassageSizes.set(p, (sciencePassageSizes.get(p) ?? 0) + 1);
    }
  }
  const sciencePassageCount = sciencePassageSizes.size;

  // Per-passage "withinPassage" counters so consecutive ordinals
  // map to 1..N inside their passage.
  const sciencePassageSeen = new Map<number, number>();

  const drafts: DraftInsertRow[] = raw.map((q) => {
    const ordinal = Number(q.source_ordinal);
    let difficulty: number | null = null;

    if (section === 'math') {
      difficulty = mathDifficulty(ordinal, totalInSection);
    } else if (section === 'science') {
      const p = q.passage_index ?? 0;
      const qsInPassage = q.questions_in_passage ?? sciencePassageSizes.get(p) ?? 0;
      const within = (sciencePassageSeen.get(p) ?? 0) + 1;
      sciencePassageSeen.set(p, within);
      difficulty = scienceDifficulty({
        passageIndex: Math.max(0, p - 1),
        passageCount: Math.max(1, sciencePassageCount),
        withinPassage: within,
        questionsInPassage: Math.max(1, qsInPassage),
      });
    }

    const options = Array.isArray(q.options) ? q.options : [];
    if (options.length !== expectedOptionCount(section)) {
      warnings.push(
        `Q${ordinal}: ${options.length} options, expected ${expectedOptionCount(section)}`,
      );
    }

    const normalizedOptions = options.map((o, i) => ({
      label: o.label ?? defaultLabel(i),
      content_html: o.content_html ?? '',
      is_correct: Boolean(o.is_correct),
    }));
    if (!normalizedOptions.some((o) => o.is_correct)) {
      warnings.push(`Q${ordinal}: no option marked correct`);
    }

    return {
      import_job_id: jobId,
      source_test: sourceTest,
      section,
      source_ordinal: ordinal,
      stimulus_html: q.stimulus_html?.trim() || null,
      stem_html: q.stem_html ?? '',
      rationale_html: q.rationale_html?.trim() || null,
      difficulty,
      category: q.category?.trim() || null,
      category_code: q.category_code?.trim() || null,
      subcategory: q.subcategory?.trim() || null,
      subcategory_code: q.subcategory_code?.trim() || null,
      options_json: normalizedOptions,
      needs_figure: Boolean(q.needs_figure),
      parse_warnings: Array.isArray(q.parse_warnings) ? q.parse_warnings.filter(Boolean) : [],
      status: 'ready_for_review',
    };
  });

  return { drafts, warnings };
}

function expectedOptionCount(section: ActSection): number {
  return section === 'math' ? 5 : 4;
}

function defaultLabel(zeroIndex: number): string {
  return ['A', 'B', 'C', 'D', 'E'][zeroIndex] ?? String.fromCharCode(65 + zeroIndex);
}
