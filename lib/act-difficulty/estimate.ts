// Estimate ACT question difficulty with Claude, one passage group per
// request. Server-only (reads ANTHROPIC_API_KEY through the shared
// admin helper). Callers write the result onto act_questions.
//
// Transport mirrors lib/act-rationale/generate.ts: the repo's raw-fetch
// helper (lib/admin/claude.js) rather than the SDK, so retries and
// backoff live in one place. Thinking is adaptive (always on for this
// model); effort is set explicitly. It stays at 'medium' here — the
// rationale generator needs 'high' because it must produce worked
// solutions, whereas a rating is a judgment call, and a group call has
// to finish inside the Server Action's 60-second ceiling.

import { fetchClaudeMessages, extractToolUse } from '../admin/claude.js';
import {
  DIFFICULTY_MODEL,
  DIFFICULTY_PROMPT_VERSION,
  DIFFICULTY_SYSTEM_PROMPT,
  RETURN_DIFFICULTY_TOOL,
} from './prompt.ts';

export interface DifficultyOption {
  label: string;
  content_html: string;
  is_correct: boolean;
}

export interface DifficultySourceQuestion {
  id: string;
  source_test: string | null;
  section: string;
  source_ordinal: number | null;
  stimulus_html: string | null;
  stem_html: string;
  options: DifficultyOption[];
}

export interface DifficultyGroup {
  /** Human-readable id for logs and the admin UI, e.g.
   *  "ACT-2022-April-E25 · english · Q1–Q15". */
  label: string;
  section: string;
  sourceTest: string | null;
  stimulusHtml: string | null;
  questions: DifficultySourceQuestion[];
}

export interface DifficultyEstimate {
  questionId: string;
  key: string;
  difficulty: number;
  reason: string;
}

export interface GroupEstimateResult {
  estimates: DifficultyEstimate[];
  /** Ratings the model returned that could not be used (unknown key,
   *  out of range, duplicate) and questions it left unrated. The
   *  caller stores the good ones; a later batch picks the rest up. */
  errors: string[];
  model: string;
  promptVersion: string;
}

/** A passage group never exceeds this many questions — an ACT English
 *  passage carries 15 and a Reading passage 10, so the cap only trips
 *  on malformed data, where it keeps one request from ballooning. */
export const MAX_GROUP_SIZE = 20;

const SECTION_LABEL: Record<string, string> = {
  english: 'English',
  math: 'Math',
  reading: 'Reading',
  science: 'Science',
};

/** The key the model echoes back: the test-level question number when
 *  the row has one (it matches the data-q markers in an English
 *  passage), otherwise the row id. */
export function questionKey(q: DifficultySourceQuestion): string {
  return q.source_ordinal != null ? String(q.source_ordinal) : q.id;
}

function byOrdinal(a: DifficultySourceQuestion, b: DifficultySourceQuestion): number {
  const ao = a.source_ordinal ?? Number.MAX_SAFE_INTEGER;
  const bo = b.source_ordinal ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.id.localeCompare(b.id);
}

function groupLabel(section: string, sourceTest: string | null, qs: DifficultySourceQuestion[]): string {
  const ordinals = qs.map((q) => q.source_ordinal).filter((o): o is number => o != null);
  const range =
    ordinals.length === qs.length && qs.length > 0
      ? qs.length === 1
        ? `Q${ordinals[0]}`
        : `Q${Math.min(...ordinals)}–Q${Math.max(...ordinals)}`
      : `${qs.length} question${qs.length === 1 ? '' : 's'}`;
  return `${sourceTest ?? 'untagged'} · ${section} · ${range}`;
}

/** Bucket questions that share a passage (same form, section and
 *  stimulus HTML) into groups; standalone questions (no stimulus) form
 *  groups of one. Groups keep the caller's first-seen order, questions
 *  inside a group are sorted by ordinal, and a group larger than
 *  MAX_GROUP_SIZE is chunked. Exported for tests. */
export function groupByPassage(questions: DifficultySourceQuestion[]): DifficultyGroup[] {
  const buckets = new Map<string, DifficultySourceQuestion[]>();
  for (const q of questions) {
    const stimulus = q.stimulus_html?.trim() ?? '';
    const key = stimulus
      ? `passage\u0000${q.source_test ?? ''}\u0000${q.section}\u0000${stimulus}`
      : `solo\u0000${q.id}`;
    const arr = buckets.get(key);
    if (arr) arr.push(q);
    else buckets.set(key, [q]);
  }

  const groups: DifficultyGroup[] = [];
  for (const members of buckets.values()) {
    const sorted = [...members].sort(byOrdinal);
    for (let i = 0; i < sorted.length; i += MAX_GROUP_SIZE) {
      const chunk = sorted.slice(i, i + MAX_GROUP_SIZE);
      const first = chunk[0];
      groups.push({
        label: groupLabel(first.section, first.source_test, chunk),
        section: first.section,
        sourceTest: first.source_test,
        stimulusHtml: first.stimulus_html?.trim() || null,
        questions: chunk,
      });
    }
  }
  return groups;
}

/** The user turn: passage once, then the questions as JSON with the
 *  keys the model must echo. Exported for tests. */
export function buildUserContent(group: DifficultyGroup): string {
  const sectionLabel = SECTION_LABEL[group.section] ?? group.section;
  const payload = group.questions.map((q) => ({
    key: questionKey(q),
    number: q.source_ordinal,
    stem_html: q.stem_html,
    options: q.options.map((o) => ({
      label: o.label,
      content_html: o.content_html,
      is_correct: o.is_correct,
    })),
  }));
  const header =
    `Section: ${sectionLabel}. Form: ${group.sourceTest ?? 'unknown'}. ` +
    `Questions in this group: ${group.questions.length}.`;
  const passage = group.stimulusHtml
    ? `\n\nPassage (HTML):\n${group.stimulusHtml}`
    : '\n\nNo shared passage; the question stands alone.';
  return `${header}${passage}\n\nQuestions (JSON):\n${JSON.stringify(payload)}`;
}

/** Validate the tool output against the group. Partial results are
 *  returned alongside the errors so one bad entry doesn't discard the
 *  rest of the passage. Exported for tests. */
export function parseRatings(
  input: unknown,
  group: DifficultyGroup,
): { estimates: DifficultyEstimate[]; errors: string[] } {
  const errors: string[] = [];
  const byKey = new Map<string, DifficultySourceQuestion>(
    group.questions.map((q) => [questionKey(q), q]),
  );
  const ratings =
    input && typeof input === 'object' && Array.isArray((input as { ratings?: unknown }).ratings)
      ? ((input as { ratings: unknown[] }).ratings)
      : null;
  if (!ratings) {
    return { estimates: [], errors: ['Model did not return a ratings array.'] };
  }

  const seen = new Set<string>();
  const estimates: DifficultyEstimate[] = [];
  ratings.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      errors.push(`Rating ${i + 1}: not an object.`);
      return;
    }
    const rec = raw as Record<string, unknown>;
    const key = typeof rec.key === 'string' ? rec.key.trim() : String(rec.key ?? '');
    const q = byKey.get(key);
    if (!q) {
      errors.push(`Rating ${i + 1}: unknown question key "${key}".`);
      return;
    }
    if (seen.has(key)) {
      errors.push(`Question ${key}: rated more than once; kept the first rating.`);
      return;
    }
    const level = Number.parseInt(String(rec.difficulty ?? ''), 10);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      errors.push(`Question ${key}: difficulty "${String(rec.difficulty)}" is not 1–5.`);
      return;
    }
    seen.add(key);
    estimates.push({
      questionId: q.id,
      key,
      difficulty: level,
      reason: typeof rec.reason === 'string' ? rec.reason.trim() : '',
    });
  });

  const missing = group.questions.map(questionKey).filter((k) => !seen.has(k));
  if (missing.length > 0) {
    errors.push(`Unrated question${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);
  }
  return { estimates, errors };
}

export async function estimateGroupDifficulty(group: DifficultyGroup): Promise<GroupEstimateResult> {
  if (group.questions.length === 0) throw new Error('Empty group.');
  for (const q of group.questions) {
    if (!q.options.some((o) => o.is_correct)) {
      throw new Error(`Question ${questionKey(q)} has no keyed option.`);
    }
  }

  const response = await fetchClaudeMessages({
    model: DIFFICULTY_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: [
      { type: 'text', text: DIFFICULTY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [RETURN_DIFFICULTY_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: [{ type: 'text', text: buildUserContent(group) }] }],
  });

  if (response?.stop_reason === 'refusal') {
    const why = response?.stop_details?.explanation ?? 'no explanation';
    throw new Error(`Model declined the request (${why}).`);
  }
  if (response?.stop_reason === 'max_tokens') {
    throw new Error('Model response was truncated at max_tokens.');
  }

  const out = extractToolUse(response, RETURN_DIFFICULTY_TOOL.name);
  if (!out) throw new Error('Model did not return ratings.');

  const { estimates, errors } = parseRatings(out, group);
  return {
    estimates,
    errors,
    model: DIFFICULTY_MODEL,
    promptVersion: DIFFICULTY_PROMPT_VERSION,
  };
}
