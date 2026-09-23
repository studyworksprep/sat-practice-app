// Admin Server Actions for the curriculum editor (curriculum_unit_steps;
// docs/foundations-and-question-patterns.md §7).
//
// Admin-authored reference data in the curriculum_units mold: every
// mutation is requireRole(['admin']) on the RLS-scoped client — the
// table's policies (migration 20260922120000) grant admins
// insert/update/delete, and feature_flags' ff_write policy is
// is_admin() too, so the "plans use these syllabi" switch needs no
// service role.
//
// Positions are unique per unit, so inserting or reordering renumbers
// through a +1000 offset (two passes) rather than shifting values in
// place — a direct shift would trip the (unit_id, position) unique
// index mid-write.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { normalizeStepInput, type NormalizedStep, type StepInput } from '@/lib/admin/unitSyllabus';
import { UNIT_SYLLABUS_FLAG } from '@/lib/plan/unit-steps';
import type { ActionResult, AuthContext } from '@/lib/types';

const RENUMBER_OFFSET = 1000;
const DEFAULT_DRILL_COUNT = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StepFormInput extends StepInput {
  kind: string;
}

type Supabase = AuthContext['supabase'];

async function adminCtx(): Promise<AuthContext> {
  return requireRole(['admin']);
}

function fromErr(err: unknown): ActionResult {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail('Unexpected error');
}

// Syllabi feed plan generation everywhere a plan is composed; the
// units worklist shows their outlines; the tutor tree reads them on
// demand, so its layout cache goes too.
function revalidateSyllabusSurfaces(unitId?: string) {
  revalidatePath('/admin/curriculum');
  if (unitId) revalidatePath(`/admin/curriculum/${unitId}`);
  revalidatePath('/admin/content/units');
  revalidatePath('/tutor/students', 'layout');
}

interface UnitCtx {
  unit: { id: string; skill_code: string; domain_code: string };
  lessonIds: Set<string>;
  patterns: Array<{ id: string; name: string; skill_code: string }>;
}

async function loadUnitCtx(supabase: Supabase, unitId: string): Promise<UnitCtx | null> {
  const { data: unit } = await supabase
    .from('curriculum_units')
    .select('id, skill_code, domain_code')
    .eq('id', unitId)
    .maybeSingle();
  if (!unit) return null;
  const [{ data: lessons }, { data: patterns }] = await Promise.all([
    supabase.from('lessons').select('id'),
    supabase.from('question_patterns').select('id, name, skill_code').eq('skill_code', unit.skill_code),
  ]);
  return {
    unit,
    lessonIds: new Set((lessons ?? []).map((l) => l.id)),
    patterns: patterns ?? [],
  };
}

function rowFor(unitId: string, position: number, step: NormalizedStep) {
  return {
    unit_id: unitId,
    position,
    kind: step.kind,
    lesson_id: step.lessonId,
    role: step.role,
    skill_codes: step.skillCodes,
    pattern_id: step.patternId,
    question_count: step.questionCount,
    minutes: step.minutes,
    skip_if_completed: step.skipIfCompleted,
    updated_at: new Date().toISOString(),
  };
}

async function stampAuthored(supabase: Supabase, unitId: string, authored: boolean) {
  await supabase
    .from('curriculum_units')
    .update({ syllabus_authored_at: authored ? new Date().toISOString() : null })
    .eq('id', unitId);
}

async function orderedStepIds(supabase: Supabase, unitId: string): Promise<string[]> {
  const { data } = await supabase
    .from('curriculum_unit_steps')
    .select('id')
    .eq('unit_id', unitId)
    .order('position', { ascending: true })
    .order('id', { ascending: true });
  return (data ?? []).map((r) => r.id);
}

/** Renumber a unit's steps 1..n in the given id order. Two passes
 *  through an offset so no intermediate state violates the unique
 *  (unit_id, position) index. */
async function renumber(supabase: Supabase, unitId: string, orderedIds: string[]): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from('curriculum_unit_steps')
    .select('id, position')
    .eq('unit_id', unitId);
  if (error) return error.message;
  const current = new Map((rows ?? []).map((r) => [r.id, r.position]));
  const changes = orderedIds
    .map((id, i) => ({ id, position: i + 1 }))
    .filter(({ id, position }) => current.get(id) !== position);
  if (changes.length === 0) return null;
  const stamp = new Date().toISOString();
  for (const { id, position } of changes) {
    const { error: e1 } = await supabase
      .from('curriculum_unit_steps')
      .update({ position: position + RENUMBER_OFFSET, updated_at: stamp })
      .eq('id', id);
    if (e1) return e1.message;
  }
  for (const { id, position } of changes) {
    const { error: e2 } = await supabase
      .from('curriculum_unit_steps')
      .update({ position, updated_at: stamp })
      .eq('id', id);
    if (e2) return e2.message;
  }
  return null;
}

/** Add one step: at the end, or right after `afterStepId`. */
export async function addUnitStep({
  unitId,
  input,
  afterStepId,
}: {
  unitId: string;
  input: StepFormInput;
  /** Insert after this step; omitted (or null) appends. */
  afterStepId?: string | null;
}): Promise<ActionResult<{ data: { id: string } }>> {
  if (!UUID_RE.test(unitId)) return actionFail('unitId required');
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { id: string } }>;
  }
  const { supabase } = ctx;
  const unitCtx = await loadUnitCtx(supabase, unitId);
  if (!unitCtx) return actionFail('Curriculum unit not found.');
  const normalized = normalizeStepInput(input, {
    unitSkillCode: unitCtx.unit.skill_code,
    lessonIds: unitCtx.lessonIds,
    patterns: unitCtx.patterns,
  });
  if (!normalized.ok) return actionFail(normalized.error);

  const ids = await orderedStepIds(supabase, unitId);
  // Append past every existing position (offset-safe), then renumber
  // into the requested slot.
  const { data, error } = await supabase
    .from('curriculum_unit_steps')
    .insert(rowFor(unitId, ids.length + 1 + RENUMBER_OFFSET, normalized.value))
    .select('id')
    .maybeSingle();
  if (error) return actionFail(error.message);
  if (!data) return actionFail('Step was not created.');

  const at = afterStepId ? ids.indexOf(afterStepId) : -1;
  const ordered = [...ids];
  if (afterStepId && at >= 0) ordered.splice(at + 1, 0, data.id);
  else ordered.push(data.id);
  const renumErr = await renumber(supabase, unitId, ordered);
  if (renumErr) return actionFail(renumErr);

  await stampAuthored(supabase, unitId, true);
  revalidateSyllabusSurfaces(unitId);
  return actionOk({ id: data.id });
}

/** Edit one step in place. */
export async function updateUnitStep({
  stepId,
  input,
}: {
  stepId: string;
  input: StepFormInput;
}): Promise<ActionResult<{ data: { id: string } }>> {
  if (!UUID_RE.test(stepId)) return actionFail('stepId required');
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { id: string } }>;
  }
  const { supabase } = ctx;
  const { data: existing } = await supabase
    .from('curriculum_unit_steps')
    .select('id, unit_id, position')
    .eq('id', stepId)
    .maybeSingle();
  if (!existing) return actionFail('Step not found.');
  const unitCtx = await loadUnitCtx(supabase, existing.unit_id);
  if (!unitCtx) return actionFail('Curriculum unit not found.');
  const normalized = normalizeStepInput(input, {
    unitSkillCode: unitCtx.unit.skill_code,
    lessonIds: unitCtx.lessonIds,
    patterns: unitCtx.patterns,
  });
  if (!normalized.ok) return actionFail(normalized.error);

  const { error } = await supabase
    .from('curriculum_unit_steps')
    .update(rowFor(existing.unit_id, existing.position, normalized.value))
    .eq('id', stepId);
  if (error) return actionFail(error.message);
  await stampAuthored(supabase, existing.unit_id, true);
  revalidateSyllabusSurfaces(existing.unit_id);
  return actionOk({ id: stepId });
}

export async function deleteUnitStep({ stepId }: { stepId: string }): Promise<ActionResult> {
  if (!UUID_RE.test(stepId)) return actionFail('stepId required');
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err);
  }
  const { supabase } = ctx;
  const { data: removed, error } = await supabase
    .from('curriculum_unit_steps')
    .delete()
    .eq('id', stepId)
    .select('unit_id')
    .maybeSingle();
  if (error) return actionFail(error.message);
  if (!removed) return actionFail('Step not found.');
  const renumErr = await renumber(supabase, removed.unit_id, await orderedStepIds(supabase, removed.unit_id));
  if (renumErr) return actionFail(renumErr);
  await stampAuthored(supabase, removed.unit_id, true);
  revalidateSyllabusSurfaces(removed.unit_id);
  return { ok: true };
}

export async function moveUnitStep({
  stepId,
  direction,
}: {
  stepId: string;
  direction: 'up' | 'down';
}): Promise<ActionResult<{ data: { moved: boolean } }>> {
  if (!UUID_RE.test(stepId)) return actionFail('stepId required');
  if (direction !== 'up' && direction !== 'down') return actionFail('Unknown direction.');
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { moved: boolean } }>;
  }
  const { supabase } = ctx;
  const { data: step } = await supabase
    .from('curriculum_unit_steps')
    .select('id, unit_id')
    .eq('id', stepId)
    .maybeSingle();
  if (!step) return actionFail('Step not found.');
  const ids = await orderedStepIds(supabase, step.unit_id);
  const index = ids.indexOf(stepId);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= ids.length) return actionOk({ moved: false });
  [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
  const renumErr = await renumber(supabase, step.unit_id, ids);
  if (renumErr) return actionFail(renumErr);
  await stampAuthored(supabase, step.unit_id, true);
  revalidateSyllabusSurfaces(step.unit_id);
  return actionOk({ moved: true });
}

/** Put the unit back on the backfilled default: the published
 *  skill-tagged lesson the launcher would have opened (first by title),
 *  then one practice drill — and clear the authored stamp. */
export async function resetUnitSyllabus({ unitId }: { unitId: string }): Promise<ActionResult<{ data: { steps: number } }>> {
  if (!UUID_RE.test(unitId)) return actionFail('unitId required');
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { steps: number } }>;
  }
  const { supabase } = ctx;
  const unitCtx = await loadUnitCtx(supabase, unitId);
  if (!unitCtx) return actionFail('Curriculum unit not found.');

  const { data: tagged } = await supabase
    .from('lesson_topics')
    .select('lesson_id, lessons!inner(id, title, status)')
    .eq('skill_code', unitCtx.unit.skill_code)
    .eq('lessons.status', 'published');
  const candidates = (tagged ?? [])
    .map((r) => (Array.isArray(r.lessons) ? r.lessons[0] : r.lessons))
    .filter((l): l is { id: string; title: string; status: string } => Boolean(l))
    .sort((x, y) => x.title.localeCompare(y.title) || x.id.localeCompare(y.id));
  const lesson = candidates[0] ?? null;

  const { error: delErr } = await supabase.from('curriculum_unit_steps').delete().eq('unit_id', unitId);
  if (delErr) return actionFail(delErr.message);
  const rows = [];
  if (lesson) {
    rows.push(rowFor(unitId, 1, {
      kind: 'lesson', lessonId: lesson.id, role: null, skillCodes: null, patternId: null,
      questionCount: null, minutes: null, skipIfCompleted: true,
    }));
  }
  rows.push(rowFor(unitId, rows.length + 1, {
    kind: 'drill', lessonId: null, role: 'practice', skillCodes: null, patternId: null,
    questionCount: DEFAULT_DRILL_COUNT, minutes: null, skipIfCompleted: true,
  }));
  const { error: insErr } = await supabase.from('curriculum_unit_steps').insert(rows);
  if (insErr) return actionFail(insErr.message);
  await stampAuthored(supabase, unitId, false);
  revalidateSyllabusSurfaces(unitId);
  return actionOk({ steps: rows.length });
}

/** The "study plans use these syllabi" switch — feature flag
 *  `unit_syllabus`, read by lib/plan/unit-steps.ts on every plan
 *  generation. Off = every unit falls back to the simple pair. */
export async function setUnitSyllabusFlag({ on }: { on: boolean }): Promise<ActionResult<{ data: { on: boolean } }>> {
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { on: boolean } }>;
  }
  const { supabase } = ctx;
  const { data, error } = await supabase
    .from('feature_flags')
    .upsert(
      {
        key: UNIT_SYLLABUS_FLAG,
        value: on ? 'on' : 'off',
        description:
          'Plan generator walks curriculum_unit_steps (lessons in teaching order, drills tied to lessons) instead of the built-in lesson-then-drill pair. on | off.',
        updated_at: new Date().toISOString(),
        updated_by: ctx.user.id,
      },
      { onConflict: 'key' },
    )
    .select('value')
    .maybeSingle();
  if (error) return actionFail(error.message);
  revalidateSyllabusSurfaces();
  return actionOk({ on: data?.value === 'on' });
}
