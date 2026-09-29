import type { ImportMetadata } from './parse.ts';
import type { ImportCandidate } from './review.ts';

// Fetch-by-ID import from the College Board question bank. The bank's
// `collegeboard` rows store this endpoint's HTML verbatim (underlines as
// "Referenced Content" spans, poem excerpts, blanks, entities), so pulling a
// question here is lossless where a Mathpix OCR export is not. Only this fixed
// endpoint is contacted, from the server, with a per-request timeout.
export const COLLEGE_BOARD_QUESTION_URL = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question';
export const MAX_COLLEGE_BOARD_IDS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_ID = /^[0-9a-f]{8}$/i;
const BANK_CODE = /^(?:RW|M)-\d{5,}$/i;
// Active content is refused before review; the shared sanitizer still runs at
// render, exactly as for every existing bank question.
const UNSAFE_MARKUP = /<\s*(?:script|iframe|object|embed)\b|\son[a-z]+\s*=\s*["']|javascript:|data:text\/html|\bsrcdoc\s*=/i;

export type RequestedId = { raw: string; kind: 'external' | 'question' | 'code'; value: string };
export type BankIdentity = { id: string; display_code: string | null; source_id: string | null; source_external_id: string | null };
export type ResolvedId = { id: string; originalId: string; externalId: string; metadata: ImportMetadata };

/** IDs separated by lines, spaces or commas: College Board question IDs (8 hex characters), external IDs (UUID) or bank codes such as RW-01748. */
export function parseCollegeBoardIds(raw: string): RequestedId[] {
  if (typeof raw !== 'string' || raw.length > 20_000) throw new Error(`Paste up to ${MAX_COLLEGE_BOARD_IDS} question IDs.`);
  const seen = new Set<string>();
  const ids: RequestedId[] = [];
  for (const token of raw.split(/[\s,;]+/).filter(Boolean)) {
    const kind = UUID.test(token) ? 'external' : QUESTION_ID.test(token) ? 'question' : BANK_CODE.test(token) ? 'code' : null;
    if (!kind) throw new Error(`"${token.slice(0, 40)}" is not a College Board question ID, external ID, or bank code.`);
    const value = kind === 'code' ? token.toUpperCase() : token.toLowerCase();
    if (seen.has(value)) continue;
    seen.add(value);
    ids.push({ raw: token, kind, value });
  }
  if (!ids.length) throw new Error('Paste at least one question ID.');
  if (ids.length > MAX_COLLEGE_BOARD_IDS) throw new Error(`Fetch at most ${MAX_COLLEGE_BOARD_IDS} questions at a time.`);
  return ids;
}

/** Every request needs the College Board external ID: from the ID itself, supplied metadata, or the bank row that already carries it. */
export function resolveCollegeBoardIds(requested: RequestedId[], metadata: ImportMetadata[], bank: BankIdentity[]): { resolved: ResolvedId[]; warnings: string[] } {
  const lower = (value: string | null | undefined) => (value ?? '').toLowerCase();
  const resolved: ResolvedId[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const request of requested) {
    let externalId: string | null = null;
    let questionId: string | null = null;
    let meta: ImportMetadata | undefined;
    if (request.kind === 'external') {
      externalId = request.value;
      meta = metadata.find(m => lower(m.external_id) === request.value);
      questionId = meta?.questionId ?? bank.find(r => lower(r.source_external_id) === request.value)?.source_id ?? null;
    } else if (request.kind === 'question') {
      meta = metadata.find(m => lower(m.questionId) === request.value);
      const row = bank.find(r => lower(r.source_id) === request.value);
      questionId = meta?.questionId ?? row?.source_id ?? request.value;
      externalId = meta?.external_id ?? row?.source_external_id ?? null;
    } else {
      const row = bank.find(r => (r.display_code ?? '').toUpperCase() === request.value);
      if (!row) { warnings.push(`${request.raw}: no bank question has this code.`); continue; }
      questionId = row.source_id;
      externalId = row.source_external_id;
      meta = metadata.find(m => (questionId && lower(m.questionId) === lower(questionId)) || (externalId && lower(m.external_id) === lower(externalId)));
    }
    if (!externalId || !UUID.test(externalId)) { warnings.push(`${request.raw}: no College Board external ID is known for this question, so it cannot be fetched. Supply metadata that includes it.`); continue; }
    externalId = externalId.toLowerCase();
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const id = questionId ?? externalId;
    resolved.push({ id, originalId: request.raw, externalId, metadata: meta ?? { questionId: id, external_id: externalId } });
  }
  return { resolved, warnings };
}

export async function fetchCollegeBoardQuestion(externalId: string, fetchImpl: typeof fetch = fetch, timeoutMs = 12_000): Promise<unknown> {
  if (!UUID.test(externalId)) throw new Error('Invalid external ID.');
  let response: Response;
  try {
    response = await fetchImpl(COLLEGE_BOARD_QUESTION_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ external_id: externalId }), signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === 'TimeoutError' ? 'College Board did not respond in time.' : 'College Board could not be reached.');
  }
  if (response.status === 404) throw new Error('College Board has no question with this external ID.');
  if (!response.ok) throw new Error(`College Board returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('College Board response is too large.');
  try { return JSON.parse(text); } catch { throw new Error('College Board returned an unreadable response.'); }
}

type CollegeBoardQuestion = {
  type?: unknown; externalid?: unknown; stem?: unknown; stimulus?: unknown; rationale?: unknown;
  answerOptions?: unknown; keys?: unknown; correct_answer?: unknown;
};
const LABELS = ['A', 'B', 'C', 'D'];

/** Map one question-bank response to the same candidate shape a Mathpix export produces. The markup is kept verbatim. */
export function collegeBoardCandidate(json: unknown, resolved: ResolvedId): ImportCandidate {
  const q = json as CollegeBoardQuestion | null;
  if (!q || typeof q !== 'object') throw new Error(`Question ${resolved.id}: College Board returned no question data.`);
  if (q.externalid != null && String(q.externalid).toLowerCase() !== resolved.externalId) throw new Error(`Question ${resolved.id}: College Board returned a different question (${String(q.externalid).slice(0, 40)}).`);
  const type = q.type === 'spr' ? 'spr' : q.type === 'mcq' ? 'mcq' : null;
  if (!type) throw new Error(`Question ${resolved.id}: unsupported question type "${String(q.type).slice(0, 20)}".`);
  const html = (value: unknown, field: string) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') throw new Error(`Question ${resolved.id}: the ${field} is not text.`);
    const trimmed = value.trim();
    if (UNSAFE_MARKUP.test(trimmed)) throw new Error(`Question ${resolved.id}: the ${field} contains unsupported markup.`);
    return trimmed || null;
  };
  const stem = html(q.stem, 'prompt');
  if (!stem) throw new Error(`Question ${resolved.id}: College Board returned no prompt.`);
  const stimulus = html(q.stimulus, 'passage');
  const rationale = html(q.rationale, 'explanation') ?? '';
  const warnings: string[] = [];
  let options: ImportCandidate['presentation']['options'] = [];
  let answer = '';
  if (type === 'mcq') {
    const raw = Array.isArray(q.answerOptions) ? (q.answerOptions as Array<{ id?: unknown; content?: unknown } | null>) : [];
    if (raw.length !== LABELS.length) throw new Error(`Question ${resolved.id}: expected four answer choices, found ${raw.length}.`);
    options = raw.map((option, index) => {
      const content = html(option?.content, `choice ${LABELS[index]}`);
      if (!content) throw new Error(`Question ${resolved.id}: choice ${LABELS[index]} is empty.`);
      return { label: LABELS[index], content_html: content };
    });
    const letters = Array.isArray(q.correct_answer) ? [...new Set(q.correct_answer.map(v => String(v).trim().toUpperCase()))] : [];
    const fromKeys = Array.isArray(q.keys) ? [...new Set(q.keys.map(key => LABELS[raw.findIndex(o => o?.id === key)]).filter(Boolean))] : [];
    const keys = letters.length ? letters : fromKeys;
    if (keys.length === 1 && /^[A-D]$/.test(keys[0])) answer = keys[0];
    else if (keys.length > 1) warnings.push('College Board lists more than one correct choice. Verify the answer before publishing.');
    else warnings.push('No correct answer supplied.');
    if (letters.length && fromKeys.length && letters.join() !== fromKeys.join()) warnings.push('College Board answer letters and answer keys disagree. Verify the answer before publishing.');
  } else {
    const values = Array.isArray(q.correct_answer) ? q.correct_answer.map(v => String(v).trim()).filter(Boolean) : [];
    if (!values.length) warnings.push('No correct answer supplied.');
    answer = values.join(', ');
  }
  if (!rationale) warnings.push('No explanation supplied.');
  const size = stem.length + (stimulus?.length ?? 0) + rationale.length + options.reduce((total, o) => total + o.content_html.length, 0);
  if (size > 1_000_000) throw new Error(`Question ${resolved.id}: content exceeds 1 MB.`);
  const values = answer ? answer.split(',').map(v => v.trim()).filter(Boolean) : [];
  return {
    id: resolved.id, originalId: resolved.originalId, questionType: type, answer, warnings, metadata: resolved.metadata,
    correctAnswer: type === 'mcq' ? { option_label: answer || null } : { text: JSON.stringify(values) },
    presentation: { stem_html: stem, stimulus_html: stimulus, rationale_html: rationale, options },
  };
}
