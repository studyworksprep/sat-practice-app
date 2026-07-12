// Server actions for the tutor's Lesson Packs feature. Each action
// goes through requireUser + role gate; the RLS policy on
// lesson_packs already scopes by teacher_id, but the role gate keeps
// students out of the surface area entirely. The supabase client is
// the caller's RLS-scoped one, so we never need a service-role
// bypass.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import type { ActionResult, Fail } from '@/lib/types';

const MAX_QUESTIONS_PER_PACK = 200;
const SEARCH_PAGE_SIZE = 25;

// Concept tags are admin-curated and the rest of the app gates the
// surface to manager/admin (see lib/practice/question-search-actions
// for the canonical list). We mirror that here so the pack-builder
// tag picker doesn't widen access to who-sees-what tags.
const TAG_SEARCH_ROLES = new Set(['manager', 'admin']);

type Ctx = {
  user: { id: string };
  profile: { role: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

async function ensureTutor(): Promise<Ctx | Fail> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const c = ctx as Ctx;
  if (!['teacher', 'manager', 'admin'].includes(c.profile.role)) {
    return actionFail('Only tutors can manage lesson packs.');
  }
  return c;
}

// ─── createPack ─────────────────────────────────────────────
// Called from the list page's "New pack" form. Inserts a row and
// redirects straight into the builder so the tutor can start adding
// questions immediately.
export async function createPack(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  const rl = await rateLimit(`lesson-pack-create:${ctx.user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) return actionFail('Too many packs created in a short time.');

  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim() || null;
  if (!name) return actionFail('Give the pack a name.');
  if (name.length > 200) return actionFail('Name is too long (max 200 chars).');

  const { data, error } = await ctx.supabase
    .from('lesson_packs')
    .insert({ teacher_id: ctx.user.id, name, description })
    .select('id')
    .single();

  if (error || !data) {
    return actionFail(`Failed to create pack: ${error?.message ?? 'unknown'}`);
  }

  revalidatePath('/tutor/lesson-packs');
  redirect(`/tutor/lesson-packs/${data.id}`);
}

// ─── renamePack ─────────────────────────────────────────────
// Updates name + description from the builder header form.
export async function renamePack(
  packId: string,
  name: string,
  description: string | null,
): Promise<ActionResult> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  const trimmedName = name.trim();
  if (!trimmedName) return actionFail('Name cannot be empty.');
  if (trimmedName.length > 200) return actionFail('Name is too long (max 200 chars).');

  const desc = description?.trim() || null;
  if (desc && desc.length > 2000) return actionFail('Description is too long (max 2000 chars).');

  const { error } = await ctx.supabase
    .from('lesson_packs')
    .update({ name: trimmedName, description: desc })
    .eq('id', packId);

  if (error) return actionFail(`Failed to rename: ${error.message}`);

  revalidatePath('/tutor/lesson-packs');
  revalidatePath(`/tutor/lesson-packs/${packId}`);
  return actionOk(null);
}

// ─── deletePack ─────────────────────────────────────────────
// Hard delete. The cascade on lesson_pack_questions cleans up
// junction rows. Called from the list view's per-row delete button.
export async function deletePack(packId: string): Promise<ActionResult> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  const { error } = await ctx.supabase
    .from('lesson_packs')
    .delete()
    .eq('id', packId);

  if (error) return actionFail(`Failed to delete: ${error.message}`);

  revalidatePath('/tutor/lesson-packs');
  return actionOk(null);
}

// ─── addQuestionToPack ──────────────────────────────────────
// Appends a question at the end (max(position)+1). Idempotent via
// the PK on (pack_id, question_id) — a second add returns the
// existing row count unchanged.
export async function addQuestionToPack(
  packId: string,
  questionId: string,
): Promise<ActionResult<{ data: { position: number; total: number } }>> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  // Count first so we can enforce the per-pack cap and pick the
  // next position in one round-trip pair. RLS scopes both queries
  // to packs the caller owns.
  const { data: existing, error: countErr } = await ctx.supabase
    .from('lesson_pack_questions')
    .select('question_id, position')
    .eq('pack_id', packId);

  if (countErr) return actionFail(`Failed to read pack: ${countErr.message}`);

  const rows: { question_id: string; position: number }[] = existing ?? [];
  if (rows.some((r) => r.question_id === questionId)) {
    return actionOk({ position: -1, total: rows.length });
  }
  if (rows.length >= MAX_QUESTIONS_PER_PACK) {
    return actionFail(`Packs are capped at ${MAX_QUESTIONS_PER_PACK} questions.`);
  }

  const nextPos = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;

  const { error: insErr } = await ctx.supabase
    .from('lesson_pack_questions')
    .insert({ pack_id: packId, question_id: questionId, position: nextPos });

  if (insErr) return actionFail(`Failed to add: ${insErr.message}`);

  revalidatePath(`/tutor/lesson-packs/${packId}`);
  return actionOk({ position: nextPos, total: rows.length + 1 });
}

// ─── removeQuestionFromPack ─────────────────────────────────
// Drops the junction row and compacts positions so the remaining
// rows stay 0..n-1 contiguous. The trailing positions don't have
// to be contiguous for the UI to work (we always sort by position
// and the order is what matters), but compacting keeps the values
// small and predictable on inspection.
export async function removeQuestionFromPack(
  packId: string,
  questionId: string,
): Promise<ActionResult> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  const { error: delErr } = await ctx.supabase
    .from('lesson_pack_questions')
    .delete()
    .eq('pack_id', packId)
    .eq('question_id', questionId);

  if (delErr) return actionFail(`Failed to remove: ${delErr.message}`);

  const { data: remaining, error: readErr } = await ctx.supabase
    .from('lesson_pack_questions')
    .select('question_id, position')
    .eq('pack_id', packId)
    .order('position', { ascending: true });

  if (readErr) return actionFail(`Failed to re-read pack: ${readErr.message}`);

  // Renumber, only writing rows whose position would actually change.
  const updates = (remaining ?? [])
    .map((r: { question_id: string; position: number }, i: number) =>
      r.position === i ? null : { question_id: r.question_id, position: i },
    )
    .filter((x: unknown): x is { question_id: string; position: number } => x !== null);

  for (const u of updates) {
    const { error: updErr } = await ctx.supabase
      .from('lesson_pack_questions')
      .update({ position: u.position })
      .eq('pack_id', packId)
      .eq('question_id', u.question_id);
    if (updErr) return actionFail(`Failed to compact order: ${updErr.message}`);
  }

  revalidatePath(`/tutor/lesson-packs/${packId}`);
  return actionOk(null);
}

// ─── reorderPackQuestions ───────────────────────────────────
// Accepts the new full order (array of question_ids). We trust the
// client's order but validate that the set matches the pack's
// current questions — drift means a stale tab is racing with the
// DB and we'd corrupt the order if we wrote anyway.
export async function reorderPackQuestions(
  packId: string,
  orderedQuestionIds: string[],
): Promise<ActionResult> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  const { data: current, error: readErr } = await ctx.supabase
    .from('lesson_pack_questions')
    .select('question_id')
    .eq('pack_id', packId);

  if (readErr) return actionFail(`Failed to read pack: ${readErr.message}`);

  const have = new Set((current ?? []).map((r: { question_id: string }) => r.question_id));
  const want = new Set(orderedQuestionIds);
  if (have.size !== want.size || ![...have].every((id) => want.has(id as string))) {
    return actionFail(
      'Pack contents changed in another tab. Reload and try again.',
    );
  }

  // No unique constraint on (pack_id, position), so we can update
  // each row's position directly in one pass. (An earlier two-phase
  // shuffle through negative positions tripped the position >= 0
  // check constraint; the staging step was forward-compat defense
  // for a unique index we never added.)
  for (let i = 0; i < orderedQuestionIds.length; i += 1) {
    const { error } = await ctx.supabase
      .from('lesson_pack_questions')
      .update({ position: i })
      .eq('pack_id', packId)
      .eq('question_id', orderedQuestionIds[i]);
    if (error) return actionFail(`Failed to apply reorder: ${error.message}`);
  }

  revalidatePath(`/tutor/lesson-packs/${packId}`);
  return actionOk(null);
}

// ─── searchQuestions ────────────────────────────────────────
// Library-pane filter for the builder. Mirrors the admin browser's
// shape — text search across display_code/stem, plus optional
// domain / skill / difficulty / question_type filters — but
// also excludes questions already in the pack (the caller passes
// the current pack's question_ids) so a tutor doesn't accidentally
// re-add the same row from the library.
export async function searchQuestions(input: {
  packId: string;
  q?: string;
  domain?: string;
  skill?: string;
  scoreBands?: number[];
  questionType?: 'mcq' | 'spr' | '';
  tagIds?: string[];
  page?: number;
  excludeIds?: string[];
}): Promise<
  ActionResult<{
    data: {
      rows: Array<{
        id: string;
        display_code: string | null;
        question_type: string;
        domain_name: string | null;
        skill_name: string | null;
        difficulty: number | null;
        score_band: number | null;
        stem_html: string | null;
      }>;
      total: number;
      page: number;
      pageSize: number;
    };
  }>
> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  const page = Math.max(1, Math.floor(input.page ?? 1));
  const offset = (page - 1) * SEARCH_PAGE_SIZE;

  // Resolve tag filters before the main query — question_concept_tags
  // is v2-keyed (FK to questions_v2), so each tag resolves directly
  // to v2 question ids and we AND-intersect across tags. An empty
  // intersection short-circuits the whole search.
  const tagIds = (input.tagIds ?? []).filter(Boolean);
  let tagFilteredV2Ids: string[] | null = null;
  if (tagIds.length > 0) {
    if (!TAG_SEARCH_ROLES.has(ctx.profile.role)) {
      return actionFail('Concept-tag filtering is not available for your role.');
    }
    const intersection = await intersectTaggedV2Ids(ctx.supabase, tagIds);
    if (intersection == null) return actionFail('Failed to resolve tag filter.');
    if (intersection.size === 0) {
      return actionOk({ rows: [], total: 0, page, pageSize: SEARCH_PAGE_SIZE });
    }
    tagFilteredV2Ids = Array.from(intersection);
  }

  let query = ctx.supabase
    .from('questions_v2')
    .select(
      'id, display_code, question_type, domain_name, skill_name, difficulty, score_band, stem_html',
      { count: 'exact' },
    )
    .eq('is_published', true)
    .eq('is_broken', false);

  if (tagFilteredV2Ids) query = query.in('id', tagFilteredV2Ids);

  const q = (input.q ?? '').trim();
  if (q) {
    // ilike inputs are user-supplied — escape PostgREST's "or"
    // separator so a comma in the query doesn't split the
    // expression server-side. Backslash also gets escaped because
    // ilike treats it as the literal escape character.
    const safe = q.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/[()]/g, '');
    query = query.or(
      `display_code.ilike.%${safe}%,stem_html.ilike.%${safe}%`,
    );
  }
  if (input.domain) query = query.eq('domain_name', input.domain);
  if (input.skill) query = query.eq('skill_name', input.skill);
  if (input.scoreBands && input.scoreBands.length > 0) {
    query = query.in('score_band', input.scoreBands);
  }
  if (input.questionType) query = query.eq('question_type', input.questionType);
  if (input.excludeIds && input.excludeIds.length > 0) {
    // PostgREST `not.in.(a,b,c)` — wrap UUIDs in parens.
    const list = input.excludeIds.join(',');
    query = query.not('id', 'in', `(${list})`);
  }

  const { data, count, error } = await query
    .order('display_code', { ascending: true, nullsFirst: false })
    .range(offset, offset + SEARCH_PAGE_SIZE - 1);

  if (error) return actionFail(`Search failed: ${error.message}`);

  return actionOk({
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize: SEARCH_PAGE_SIZE,
  });
}

// ─── listDomainsAndSkills ───────────────────────────────────
// Used by the builder once on mount to populate the domain / skill
// dropdowns. Distinct values from questions_v2; deliberately cheap
// (no count, no aggregation server-side, the result set is < 50
// rows even unfiltered).
export async function listDomainsAndSkills(): Promise<
  ActionResult<{ data: Array<{ domain: string; skill: string }> }>
> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;

  const { data, error } = await ctx.supabase
    .from('questions_v2')
    .select('domain_name, skill_name')
    .eq('is_published', true)
    .eq('is_broken', false)
    .not('domain_name', 'is', null)
    .not('skill_name', 'is', null)
    .limit(10_000);

  if (error) return actionFail(`Failed to load taxonomy: ${error.message}`);

  const seen = new Set<string>();
  const out: Array<{ domain: string; skill: string }> = [];
  for (const r of data ?? []) {
    const key = `${r.domain_name}::${r.skill_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ domain: r.domain_name as string, skill: r.skill_name as string });
  }
  out.sort((a, b) =>
    a.domain === b.domain ? a.skill.localeCompare(b.skill) : a.domain.localeCompare(b.domain),
  );
  return actionOk(out);
}

// ─── listConceptTags ────────────────────────────────────────
// Returns the concept-tag catalog so the builder can render a
// chip-style tag picker. Restricted to manager+admin to match the
// existing question-search surface; teachers get an empty list and
// the UI hides the "Tags" button.
export async function listConceptTags(): Promise<
  ActionResult<{ data: Array<{ id: string; name: string }> }>
> {
  const ctx = await ensureTutor();
  if ('ok' in ctx) return ctx;
  if (!TAG_SEARCH_ROLES.has(ctx.profile.role)) {
    return actionOk([]);
  }
  const { data, error } = await ctx.supabase
    .from('concept_tags')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) return actionFail(`Failed to load tags: ${error.message}`);
  return actionOk((data ?? []) as Array<{ id: string; name: string }>);
}

// ─── intersectTaggedV2Ids ──────────────────────────────────
// question_concept_tags.question_id is v2-keyed (FK to questions_v2).
// AND across tags is the intersection of per-tag id sets.
async function intersectTaggedV2Ids(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tagIds: string[],
): Promise<Set<string> | null> {
  const { data: linkRows, error: linkErr } = await supabase
    .from('question_concept_tags')
    .select('tag_id, question_id')
    .in('tag_id', tagIds);
  if (linkErr) return null;

  const idsByTag = new Map<string, Set<string>>();
  for (const row of linkRows ?? []) {
    if (!row?.tag_id || !row?.question_id) continue;
    let bucket = idsByTag.get(row.tag_id);
    if (!bucket) {
      bucket = new Set();
      idsByTag.set(row.tag_id, bucket);
    }
    bucket.add(row.question_id);
  }
  for (const tagId of tagIds) {
    if (!idsByTag.has(tagId)) return new Set();
  }

  const setsByTag = Array.from(idsByTag.values());
  if (setsByTag.length === 0) return new Set();
  setsByTag.sort((a, b) => a.size - b.size);
  const out = new Set(setsByTag[0]);
  for (let i = 1; i < setsByTag.length; i += 1) {
    for (const id of out) {
      if (!setsByTag[i].has(id)) out.delete(id);
    }
  }
  return out;
}
