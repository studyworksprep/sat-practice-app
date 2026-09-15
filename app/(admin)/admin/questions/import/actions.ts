'use server';

import { logger } from '@/lib/api/logger';
import { actionOk, actionFail } from '@/lib/api/response';
import type { AuthContext } from '@/lib/api/auth';
import type { Row } from '@/lib/types';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { parseQuestions, parseMetadata, mmdToHtml, matchIdentifiers } from '@/lib/sat-import/parse';
import { readMathpix } from '@/lib/sat-import/archive';
import { renderHtml, renderRow } from '@/lib/content/render-math.mjs';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';

import { signReview, readReview, mergeOptions, canCombineMathStimulus } from '@/lib/sat-import/review';
import { scorableAnswer } from '@/lib/sat-import/answers';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

// A stable server-only key makes reviews valid across workers; never sent to clients.
const reviewSecret = () => process.env.IMPORT_REVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type BankRow = Pick<Row<'questions_v2'>, 'id' | 'question_type' | 'stem_html' | 'options' | 'correct_answer' | 'domain_name' | 'skill_name' | 'difficulty' | 'source'> & Partial<Row<'questions_v2'>>;
function viewModel(row: BankRow) {
  const fallback = renderRow(row);
  const rendered = {
    stem_rendered: row.stem_rendered ?? fallback.stem_rendered,
    stimulus_rendered: row.stimulus_rendered ?? fallback.stimulus_rendered,
    rationale_rendered: row.rationale_rendered ?? fallback.rationale_rendered,
    options_rendered: row.options_rendered ?? fallback.options_rendered,
  };
  return {
    question: {
      questionId: row.id, questionType: row.question_type === 'mcq' ? 'mcq' as const : 'spr' as const,
      stemHtml: rendered.stem_rendered ?? row.stem_html,
      stimulusHtml: rendered.stimulus_rendered ?? row.stimulus_html,
      options: ((rendered.options_rendered ?? row.options ?? []) as Array<{label: string; content_html: string; content_html_rendered?: string}>).map(o => ({ id: o.label, label: o.label, content_html: o.content_html_rendered ?? o.content_html })),
      taxonomy: { domain_name: row.domain_name, skill_name: row.skill_name, difficulty: row.difficulty, source: row.source },
    },
    result: { correctOptionId: row.question_type === 'mcq' ? extractMcqCorrectId(row.correct_answer) : null, correctAnswerDisplay: row.question_type === 'spr' ? formatSprCorrect(row.correct_answer) : null, rationaleHtml: rendered.rationale_rendered ?? row.rationale_html },
  };
}

async function mapInGroups<T,R>(values:T[],fn:(value:T)=>Promise<R>):Promise<R[]> {
  const results:R[]=[];
  for(let i=0;i<values.length;i+=5) results.push(...await Promise.all(values.slice(i,i+5).map(fn)));
  return results;
}

type ReferenceSnapshot = { capturedAt: string; rows: Row<'questions_v2'>[] };
async function compare(supabase: AuthContext['supabase'], bytes: Uint8Array, name: string, rawMetadata: string, reference?: ReferenceSnapshot, actor?: string) {
  const { mmd, images } = readMathpix(bytes, name);
  const parsed = parseQuestions(mmd, parseMetadata(rawMetadata));
  const identifiers = [...new Set(parsed.questions.flatMap(q => [q.id, q.originalId, q.metadata.external_id, q.metadata.ibn]).filter(Boolean))];
  const columns = 'id, display_code, source, source_id, source_external_id, question_type, stem_html, stimulus_html, rationale_html, options, stem_rendered, stimulus_rendered, rationale_rendered, options_rendered, correct_answer, domain_name, skill_name, difficulty, score_band, updated_at, is_published, is_broken, deleted_at';
  // Two parameterized IN queries avoid interpolating imported IDs into filters.
  const results = reference ? [{ data: reference.rows, error: null }] : await Promise.all(['source_id','source_external_id'].map(column => supabase.from('questions_v2').select(columns).in(column, identifiers)));
  if (results.some(r => r.error)) throw new Error('Could not check the question bank. Please retry.');
  const rows = [...new Map(results.flatMap(r => r.data ?? []).map(r => [r.id, r])).values()];
  const items = await mapInGroups(parsed.questions, async q => {
    const candidate = {
      id: q.id, question_type: q.questionType,
      stem_html: mmdToHtml(q.stem, images), rationale_html: mmdToHtml(q.rationale, images),
      options: q.options.map(o => ({ label: o.label, content_html: mmdToHtml(o.mmd, images, { equationAlign: 'left' }) })),
      correct_answer: q.correctAnswer, domain_name: q.metadata.primary_class_cd_desc ?? null,
      skill_name: q.metadata.skill_desc ?? null, difficulty: ({E:1,M:2,H:3} as Record<string, number>)[q.metadata.difficulty ?? ''] ?? null,
      score_band: q.metadata.score_band_range_cd ?? null, source: 'Import preview',
    };
    for (const html of [candidate.stem_html,candidate.rationale_html,...candidate.options.map(o => o.content_html)]) {
      if (/data-mjx-error|merror/.test(renderHtml(html))) throw new Error(`Math rendering failed in ${q.id}. Review the export.`);
    }
    let candidateRows = rows;
    if (!reference) {
      const found = await supabase.rpc('find_question_import_matches', { p_stem: candidate.stem_html, p_identifiers: [q.id, q.originalId, q.metadata.external_id, q.metadata.ibn].filter((v): v is string => !!v) });
      if (found.error) {
        logger.error({ action: 'compareImport', questionId: q.id, code: found.error.code }, 'Question duplicate check failed');
        const message = found.error.code === '57014'
          ? 'Duplicate checking timed out. No questions were imported. Please retry; if this persists, contact support.'
          : ['42883', 'PGRST202'].includes(found.error.code)
            ? 'The duplicate-check function is unavailable. An administrator needs to verify the importer migration.'
            : found.error.code === '42501'
              ? 'Duplicate checking was denied. Sign in again with an admin account and retry.'
              : 'Duplicate checking failed. No questions were imported. Please retry or contact support.';
        throw new Error(`Question ${q.id}: ${message}`);
      }
      if (found.data.length) {
        const loaded = await supabase.from('questions_v2').select(columns).in('id', found.data.map(r => r.id));
        if (loaded.error) throw new Error('Could not load possible duplicates.');
        candidateRows = loaded.data;
      } else candidateRows = [];
    } else candidateRows = matchIdentifiers(q, rows);
    const insertToken = !reference && actor && reviewSecret() && !candidateRows.length ? signReview({
      purpose: 'insert', actor, target: randomUUID(), updatedAt: '', expires: Date.now() + 2 * 60 * 60 * 1000,
      presentation: { stem_html: candidate.stem_html, rationale_html: candidate.rationale_html, options: candidate.options },
      details: { question_type: candidate.question_type, correct_answer: candidate.correct_answer, domain_name: candidate.domain_name,
        skill_name: candidate.skill_name, difficulty: candidate.difficulty, score_band: candidate.score_band,
        source_id: q.id, original_source_id: q.originalId, source_external_id: q.metadata.external_id || q.metadata.ibn || q.id, hasAnswer: scorableAnswer(q.questionType,q.answer) },
    }, reviewSecret()) : null;
    return {
      insertToken, hasAnswer: scorableAnswer(q.questionType,q.answer),
      id: q.id, originalId: q.originalId, warnings: q.warnings, answer: q.answer || 'Not supplied', difficulty: candidate.difficulty, scoreBand: candidate.score_band,
      imported: viewModel(candidate),
      matches: candidateRows.map(row => {
        let applyToken: string | null = null;
        let applyBlocked: string | null = null;
        try {
          if (reference) throw new Error('The pilot snapshot is review-only. Upload the files against the live bank to apply.');
          if (!actor || !reviewSecret()) throw new Error('Server review signing is not configured.');
          if (!row.updated_at || row.deleted_at || row.is_broken !== false || !row.is_published) throw new Error('Only published, active questions can be replaced here.');
          if (row.stimulus_html?.trim() && !canCombineMathStimulus(row.domain_name)) throw new Error('This question has a separate passage. Edit it separately to preserve its structure.');
          if (row.question_type !== candidate.question_type) throw new Error('Answer formats differ.');
          const normalize = (v: string | null) => String(v ?? '').split(/\s+or\s+|,/).map(x => x.trim()).sort().join('|');
          const answer = row.question_type === 'mcq' ? extractMcqCorrectId(row.correct_answer) : formatSprCorrect(row.correct_answer);
          if (!q.answer || normalize(answer) !== normalize(q.answer)) throw new Error('Correct answers differ or are missing. Resolve this separately.');
          if (row.question_type === 'mcq' && typeof row.correct_answer === 'object' && row.correct_answer && 'option_labels' in row.correct_answer && Array.isArray(row.correct_answer.option_labels) && row.correct_answer.option_labels.length > 1) throw new Error('Multiple-answer questions require separate review.');
          const options = mergeOptions(row.options ?? [], candidate.options);
          applyToken = signReview({ ...(row.stimulus_html?.trim() ? { clearStimulus: true as const } : {}), actor, target: row.id, updatedAt: row.updated_at, expires: Date.now() + 2 * 60 * 60 * 1000, presentation: { stem_html: candidate.stem_html, rationale_html: candidate.rationale_html || row.rationale_html || '', options } }, reviewSecret());
        } catch (error) { applyBlocked = error instanceof Error ? error.message : 'Cannot apply this match.'; }
        return { id: row.id, code: row.display_code, updatedAt: row.updated_at, deleted: !!row.deleted_at, published: row.is_published, broken: row.is_broken, difficulty: row.difficulty, scoreBand: row.score_band, answer: row.question_type === 'mcq' ? extractMcqCorrectId(row.correct_answer) : formatSprCorrect(row.correct_answer), ...viewModel(row), requiresStimulusConfirmation: !!row.stimulus_html?.trim() && canCombineMathStimulus(row.domain_name), applyToken, applyBlocked };
      }),
    };
  });
  return { items, warnings: parsed.warnings, name, isSnapshot: !!reference, referenceLabel: reference ? `Production pilot snapshot captured ${reference.capturedAt.slice(0,10)}. Review only; this is not a live bank query.` : 'Compared with both question pools using identifiers and normalized prompt text. Review possible duplicates; matching is not semantic proof.' };
}

export async function compareImport(formData: FormData) {
  try {
    const { supabase, user } = await requireRole(['admin']);
    const file = formData.get('export');
    const metadata = formData.get('metadata');
    if (!(file instanceof File) || file.size > 8_000_000) throw new Error('Choose a Mathpix export under 8 MB.');
    if (metadata instanceof File && metadata.size > 1_000_000) throw new Error('Metadata must be under 1 MB.');
    return actionOk({ batch: await compare(supabase, new Uint8Array(await file.arrayBuffer()), file.name, metadata instanceof File ? await metadata.text() : '', undefined, user.id), pdf: null as string | null });
  } catch (error) { return actionFail(error instanceof Error ? error : 'Import could not be read.'); }
}

// Convenience for the local pilot. No filesystem path comes from the client;
// deployed installs without these sample files simply use the upload form.
export async function loadMathPilot() {
  try {
    if (process.env.NODE_ENV === 'production') throw new Error('Local pilot loading is unavailable in production. Upload your files to compare with the live bank.');
    const { supabase } = await requireRole(['admin']);
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const root = join(process.cwd(), 'content/import/pilot');
    const [zip, metadata, pdf, snapshotText] = await Promise.all([
      readFile(join(root, 'Algebra 10 questions and answers.mmd.zip')),
      readFile(join(root, 'Algebra 10 questions metadata.rtf'), 'utf8'),
      readFile(join(root, 'Algebra 10 questions and answers.pdf')),
      readFile(join(root, 'analysis/bank-comparison.json'), 'utf8'),
    ]);
    return actionOk({ batch: await compare(supabase, zip, 'Algebra 10 questions and answers.mmd.zip', metadata, JSON.parse(snapshotText) as ReferenceSnapshot), pdf: pdf.toString('base64') });
  } catch (error) { return actionFail(error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'Pilot files are not installed here. Please upload your files below.' : error instanceof Error ? error : 'Unable to load pilot.'); }
}

export type ComparisonBatch = Awaited<ReturnType<typeof compare>>;


export async function applyImportedPresentation(token: string, confirmed: boolean, stimulusConfirmed = false) {
  try {
    const ctx = await requireRole(['admin']);
    assertWriter(ctx);
    if (confirmed !== true) throw new Error('Confirm that the question, choices, figures, and explanation have identical meaning.');
    if (!reviewSecret()) throw new Error('Server review signing is not configured.');
    const review = readReview(token, reviewSecret(), ctx.user.id);
    if (review.purpose === 'insert') throw new Error('This review is for a new question, not a replacement.');
    if (review.clearStimulus && stimulusConfirmed !== true) throw new Error('Confirm that the imported prompt includes all stimulus content.');
    // Only server-signed presentation fields can reach this update. The timestamp
    // condition is checked in the same database statement as the mutation.
    const rendered = renderRow(review.presentation);
    const { data, error } = await ctx.supabase.from('questions_v2').update({
      ...review.presentation,
      ...(review.clearStimulus ? { stimulus_html: null, stimulus_rendered: null } : {}),
      stem_rendered: rendered.stem_rendered,
      rationale_rendered: rendered.rationale_rendered,
      options_rendered: rendered.options_rendered,
      rendered_source_hash: null,
      updated_by: ctx.user.id,
    }).eq('id', review.target).eq('updated_at', review.updatedAt)
      .eq('is_published', true).eq('is_broken', false).is('deleted_at', null)
      .select('id, display_code').maybeSingle();
    if (error) throw new Error('The update could not be confirmed. Compare again before retrying.');
    if (!data) throw new Error('This question changed or was already applied. Compare again before replacing it.');
    revalidatePath('/admin/questions');
    revalidatePath(`/admin/questions/${data.id}`);
    return actionOk({ id: data.id, code: data.display_code });
  } catch (error) { return actionFail(error instanceof Error ? error : 'Unable to apply this review.'); }
}
