// Server Action for the ACT difficulty backfill (Phase 2 PR C).
//
//   estimateActDifficultyBatch — pick the live questions that still
//     have no difficulty (optionally narrowed to a section / form),
//     bucket them by passage, send the next few passage groups to
//     Claude in parallel, and write each rating straight onto
//     act_questions with difficulty_source = 'ai_estimate'.
//
// Direct write, no drafts table: a difficulty is a sort/filter key,
// not student-facing text, the admin list marks AI values with an
// asterisk and the editor names the source, and editing a value in
// the editor flips its source to 'manual'. The update is guarded with
// `difficulty is null` so a rating never overwrites an import, manual
// or performance value that landed while the batch was running.
//
// Admin-only (requireRole); RLS double-gates the write through
// act_questions_admin_write.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';
import { isActSection } from '@/lib/practice/act-taxonomy';
import {
  estimateGroupDifficulty,
  groupByPassage,
  questionKey,
  type DifficultyGroup,
  type DifficultySourceQuestion,
} from '@/lib/act-difficulty/estimate';

/** Passage groups per click. Every group is one Claude call and they
 *  run concurrently, so wall time is the slowest group, not the sum;
 *  the cap keeps one click inside the page's maxDuration. */
const MAX_GROUPS = 5;
const DEFAULT_GROUPS = 3;

export interface DifficultyBatchDetail {
  questionId: string;
  sourceTest: string | null;
  section: string;
  ordinal: number | null;
  difficulty: number;
  reason: string;
}

export type DifficultyBatchResult = ActionResult<{
  rated: number;
  groups: number;
  failed: Array<{ group: string; error: string }>;
  remaining: number;
  details: DifficultyBatchDetail[];
}>;

async function getAdminCtx() {
  try {
    const ctx = await requireRole(['admin']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ctx as { supabase: any; user: { id: string } };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Unexpected error', 500);
  }
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

interface CandidateRow {
  id: string;
  source_test: string | null;
  section: string;
  source_ordinal: number | null;
  stimulus_html: string | null;
  stem_html: string;
}

interface OptionRow {
  question_id: string;
  label: string;
  content_html: string;
  is_correct: boolean;
}

export async function estimateActDifficultyBatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<DifficultyBatchResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;

  const section = str(formData.get('section'));
  const form = str(formData.get('form'));
  const limitRaw = Number.parseInt(str(formData.get('groups')) || String(DEFAULT_GROUPS), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(MAX_GROUPS, Math.max(1, limitRaw)) : DEFAULT_GROUPS;
  if (section && !isActSection(section)) return actionFail('Unknown section.');

  // Candidates: live questions with no difficulty, in bank order so
  // consecutive clicks walk a form passage by passage.
  let q = supabase
    .from('act_questions')
    .select('id, source_test, section, source_ordinal, stimulus_html, stem_html')
    .is('deleted_at', null)
    .is('difficulty', null)
    .order('source_test', { ascending: true, nullsFirst: false })
    .order('section', { ascending: true })
    .order('source_ordinal', { ascending: true, nullsFirst: false });
  if (section) q = q.eq('section', section);
  if (form) q = q.eq('source_test', form);
  const { data: candidates, error: candErr } = await q;
  if (candErr) return actionFail(`Could not list questions: ${candErr.message}`);
  const rows = (candidates ?? []) as CandidateRow[];
  if (rows.length === 0) {
    return { ok: true, rated: 0, groups: 0, failed: [], remaining: 0, details: [] };
  }

  const allGroups = groupByPassage(rows.map((r) => ({ ...r, options: [] })));
  const picked = allGroups.slice(0, limit);
  const pickedIds = picked.flatMap((g) => g.questions.map((x) => x.id));

  const { data: optionRows, error: optErr } = await supabase
    .from('act_answer_options')
    .select('question_id, label, content_html, is_correct')
    .in('question_id', pickedIds)
    .order('ordinal', { ascending: true });
  if (optErr) return actionFail(`Could not load options: ${optErr.message}`);
  const optionsByQ = new Map<string, OptionRow[]>();
  for (const o of (optionRows ?? []) as OptionRow[]) {
    const arr = optionsByQ.get(o.question_id) ?? [];
    arr.push(o);
    optionsByQ.set(o.question_id, arr);
  }

  const failed: Array<{ group: string; error: string }> = [];

  // Attach options; a question with no keyed option can't be rated
  // (the model is told which answer is right) and is reported rather
  // than sent.
  const groups: DifficultyGroup[] = [];
  for (const g of picked) {
    const questions: DifficultySourceQuestion[] = [];
    for (const x of g.questions) {
      const options = (optionsByQ.get(x.id) ?? []).map((o) => ({
        label: o.label,
        content_html: o.content_html,
        is_correct: o.is_correct,
      }));
      if (!options.some((o) => o.is_correct)) {
        failed.push({ group: g.label, error: `Q${questionKey(x)} has no keyed option; skipped.` });
        continue;
      }
      questions.push({ ...x, options });
    }
    if (questions.length > 0) groups.push({ ...g, questions });
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const details: DifficultyBatchDetail[] = [];
  let rated = 0;
  const now = new Date().toISOString();

  await Promise.all(
    groups.map(async (g) => {
      let result;
      try {
        result = await estimateGroupDifficulty(g);
      } catch (err) {
        failed.push({ group: g.label, error: (err as Error).message || 'estimate failed' });
        return;
      }
      for (const e of result.errors) failed.push({ group: g.label, error: e });
      for (const est of result.estimates) {
        const { data: updated, error: upErr } = await supabase
          .from('act_questions')
          .update({
            difficulty: est.difficulty,
            difficulty_source: 'ai_estimate',
            updated_at: now,
            updated_by: user.id,
          })
          .eq('id', est.questionId)
          .is('difficulty', null)
          .select('id');
        if (upErr) {
          failed.push({ group: g.label, error: `Q${est.key}: save failed: ${upErr.message}` });
          continue;
        }
        if (!updated || updated.length === 0) {
          failed.push({ group: g.label, error: `Q${est.key}: already had a difficulty; left as is.` });
          continue;
        }
        rated += 1;
        const src = byId.get(est.questionId);
        details.push({
          questionId: est.questionId,
          sourceTest: src?.source_test ?? g.sourceTest,
          section: g.section,
          ordinal: src?.source_ordinal ?? null,
          difficulty: est.difficulty,
          reason: est.reason,
        });
      }
    }),
  );

  details.sort((a, b) => {
    const t = (a.sourceTest ?? '').localeCompare(b.sourceTest ?? '');
    if (t !== 0) return t;
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return (a.ordinal ?? 0) - (b.ordinal ?? 0);
  });

  revalidatePath('/admin/act/questions');
  return {
    ok: true,
    rated,
    groups: groups.length,
    failed,
    remaining: Math.max(0, rows.length - rated),
    details,
  };
}
