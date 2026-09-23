// Server Actions for the Techniques catalog
// (docs/foundations-and-question-patterns.md §8).
//
// Techniques are admin-authored reference data in the curriculum_units
// mold, so every mutation here is requireRole(['admin']) on the
// RLS-scoped client — the techniques / technique_skills policies
// (migration 20260923120000) grant admins insert/update/delete. No
// service role needed.
//
// One validator (lib/admin/techniques) serves the catalog form and the
// inline "new technique" form in the curriculum editor, so the two
// cannot drift in what they accept.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { normalizeTechniqueInput, type TechniqueInput } from '@/lib/admin/techniques';
import type { ActionResult, AuthContext } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Supabase = AuthContext['supabase'];

async function adminCtx(): Promise<AuthContext> {
  return requireRole(['admin']);
}

function fromErr(err: unknown): ActionResult {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail('Unexpected error');
}

// Technique names show in the curriculum editor's step cards, the
// review-surface pickers, and the generate-page prefill.
function revalidateTechniqueSurfaces() {
  revalidatePath('/admin/techniques');
  revalidatePath('/admin/curriculum', 'layout');
  revalidatePath('/admin/content/units');
  revalidatePath('/admin/lessons', 'layout');
}

/** Next order slot within a section group, so a blank order appends. */
async function nextSequence(supabase: Supabase, section: string | null): Promise<number> {
  let q = supabase.from('techniques').select('sequence').eq('test_type', 'sat');
  q = section ? q.eq('section', section) : q.is('section', null);
  const { data } = await q.order('sequence', { ascending: false }).limit(1).maybeSingle();
  return (data?.sequence ?? 0) + 1;
}

async function replaceDefaultSkills(
  supabase: Supabase,
  techniqueId: string,
  skillCodes: readonly string[],
): Promise<string | null> {
  const { error: delErr } = await supabase.from('technique_skills').delete().eq('technique_id', techniqueId);
  if (delErr) return delErr.message;
  if (skillCodes.length === 0) return null;
  const { error: insErr } = await supabase
    .from('technique_skills')
    .insert(skillCodes.map((skill_code) => ({ technique_id: techniqueId, skill_code })));
  return insErr ? insErr.message : null;
}

/** Create one technique (catalog form and the curriculum editor's
 *  inline create both land here). */
export async function createTechnique(
  input: TechniqueInput,
): Promise<ActionResult<{ data: { id: string; name: string } }>> {
  const normalized = normalizeTechniqueInput(input);
  if (!normalized.ok) return actionFail(normalized.error);
  const v = normalized.value;

  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { id: string; name: string } }>;
  }
  const { supabase } = ctx;

  const sequence = v.sequence ?? (await nextSequence(supabase, v.section));
  const { data, error } = await supabase
    .from('techniques')
    .insert({
      test_type: 'sat',
      name: v.name,
      description: v.description,
      process_summary: v.processSummary,
      section: v.section,
      sequence,
    })
    .select('id, name')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return actionFail(`A technique called "${v.name}" already exists.`);
    return actionFail(error.message);
  }
  if (!data) return actionFail('Technique was not created.');

  const skillErr = await replaceDefaultSkills(supabase, data.id, v.skillCodes);
  if (skillErr) return actionFail(`Created "${data.name}", but saving its default skills failed: ${skillErr}`);

  revalidateTechniqueSurfaces();
  return actionOk({ id: data.id, name: data.name });
}

/** Edit one technique in place, default skills included. */
export async function updateTechnique(
  input: TechniqueInput & { techniqueId: string },
): Promise<ActionResult<{ data: { id: string; name: string } }>> {
  if (!UUID_RE.test(input.techniqueId ?? '')) return actionFail('techniqueId required');
  const normalized = normalizeTechniqueInput(input);
  if (!normalized.ok) return actionFail(normalized.error);
  const v = normalized.value;

  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { id: string; name: string } }>;
  }
  const { supabase } = ctx;

  const { data: current } = await supabase
    .from('techniques')
    .select('id, section, sequence')
    .eq('id', input.techniqueId)
    .maybeSingle();
  if (!current) return actionFail('Technique not found.');

  // Keep the slot unless the section changed or an order was typed.
  const sequence =
    v.sequence ?? (current.section === v.section ? current.sequence : await nextSequence(supabase, v.section));

  const { data, error } = await supabase
    .from('techniques')
    .update({
      name: v.name,
      description: v.description,
      process_summary: v.processSummary,
      section: v.section,
      sequence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.techniqueId)
    .select('id, name')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return actionFail(`A technique called "${v.name}" already exists.`);
    return actionFail(error.message);
  }
  if (!data) return actionFail('Technique not found.');

  const skillErr = await replaceDefaultSkills(supabase, data.id, v.skillCodes);
  if (skillErr) return actionFail(`Saved "${data.name}", but saving its default skills failed: ${skillErr}`);

  revalidateTechniqueSurfaces();
  return actionOk({ id: data.id, name: data.name });
}

/**
 * Delete a technique. The FKs cascade its question tags, lesson links
 * and default skills; a trigger scrubs it out of any syllabus step's
 * technique_ids. Counts are read first so the confirm dialog can say
 * what the delete actually costs.
 */
export async function deleteTechnique({
  techniqueId,
}: {
  techniqueId: string;
}): Promise<ActionResult<{ data: { name: string; questions: number; lessons: number; steps: number } }>> {
  if (!UUID_RE.test(techniqueId ?? '')) return actionFail('techniqueId required');

  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { name: string; questions: number; lessons: number; steps: number } }>;
  }
  const { supabase } = ctx;

  const [{ count: questions }, { count: lessons }, { count: steps }] = await Promise.all([
    supabase.from('question_techniques').select('question_id', { count: 'exact', head: true }).eq('technique_id', techniqueId),
    supabase.from('lesson_techniques').select('lesson_id', { count: 'exact', head: true }).eq('technique_id', techniqueId),
    supabase.from('curriculum_unit_steps').select('id', { count: 'exact', head: true }).contains('technique_ids', [techniqueId]),
  ]);

  const { data, error } = await supabase
    .from('techniques')
    .delete()
    .eq('id', techniqueId)
    .select('name')
    .maybeSingle();
  if (error) return actionFail(error.message);
  if (!data) return actionFail('Technique not found.');

  revalidateTechniqueSurfaces();
  return actionOk({ name: data.name, questions: questions ?? 0, lessons: lessons ?? 0, steps: steps ?? 0 });
}

/** Bump a technique up or down within its section group. Renumbers the
 *  whole group 1..n from the new order, which also repairs gaps. */
export async function moveTechnique({
  techniqueId,
  direction,
}: {
  techniqueId: string;
  direction: 'up' | 'down';
}): Promise<ActionResult<{ data: { moved: boolean } }>> {
  if (!UUID_RE.test(techniqueId ?? '')) return actionFail('techniqueId required');
  if (direction !== 'up' && direction !== 'down') return actionFail('Unknown direction.');

  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { moved: boolean } }>;
  }
  const { supabase } = ctx;

  const { data: current } = await supabase
    .from('techniques')
    .select('id, test_type, section')
    .eq('id', techniqueId)
    .maybeSingle();
  if (!current) return actionFail('Technique not found.');

  let groupQuery = supabase.from('techniques').select('id, sequence').eq('test_type', current.test_type);
  groupQuery = current.section ? groupQuery.eq('section', current.section) : groupQuery.is('section', null);
  const { data: groupRows, error: groupErr } = await groupQuery
    .order('sequence', { ascending: true })
    .order('name', { ascending: true })
    .order('id', { ascending: true });
  if (groupErr) return actionFail(groupErr.message);

  const ordered = groupRows ?? [];
  const index = ordered.findIndex((r) => r.id === techniqueId);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= ordered.length) return actionOk({ moved: false });
  [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];

  const stamp = new Date().toISOString();
  for (const [i, row] of ordered.entries()) {
    if (row.sequence === i + 1) continue;
    const { error } = await supabase
      .from('techniques')
      .update({ sequence: i + 1, updated_at: stamp })
      .eq('id', row.id);
    if (error) return actionFail(error.message);
  }

  revalidateTechniqueSurfaces();
  return actionOk({ moved: true });
}
