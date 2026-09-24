// Admin Server Actions for the curriculum editor (curriculum_unit_steps;
// docs/foundations-and-question-patterns.md §7 and §8.5 step D).
//
// A syllabus belongs to one TARGET: a curriculum unit, or a section's
// foundation syllabus ("Before Math" / "Before Reading & Writing" —
// rows with a section and no unit). Every mutation takes or derives
// that target and is requireRole(['admin']) on the RLS-scoped client —
// the table's policies (migration 20260922120000) grant admins
// insert/update/delete, and feature_flags' ff_write policy is
// is_admin() too, so the "plans use these syllabi" switch needs no
// service role.
//
// Positions are unique per syllabus, so inserting or reordering
// renumbers through a +1000 offset (two passes) rather than shifting
// values in place — a direct shift would trip the unique index
// mid-write.

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
const TEST_TYPE = 'sat';

export type SyllabusSection = 'math' | 'reading_writing';

/** Which syllabus a step belongs to. */
export type SyllabusTarget = { unitId: string; section?: undefined } | { section: SyllabusSection; unitId?: undefined };

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

function validTarget(target: SyllabusTarget | null | undefined): SyllabusTarget | null {
  if (!target) return null;
  if (target.unitId) return UUID_RE.test(target.unitId) ? { unitId: target.unitId } : null;
  if (target.section === 'math' || target.section === 'reading_writing') return { section: target.section };
  return null;
}

/** The target a stored step belongs to. */
function targetOfRow(row: { unit_id: string | null; section: string | null }): SyllabusTarget | null {
  if (row.unit_id) return { unitId: row.unit_id };
  if (row.section === 'math' || row.section === 'reading_writing') return { section: row.section };
  return null;
}

function editorPath(target: SyllabusTarget): string {
  return target.unitId ? `/admin/curriculum/${target.unitId}` : `/admin/curriculum/section/${target.section}`;
}

// Syllabi feed plan generation everywhere a plan is composed; the
// units worklist shows their outlines; the tutor tree reads them on
// demand, so its layout cache goes too.
function revalidateSyllabusSurfaces(target?: SyllabusTarget) {
  revalidatePath('/admin/curriculum');
  if (target) revalidatePath(editorPath(target));
  revalidatePath('/admin/content/units');
  revalidatePath('/tutor/students', 'layout');
}

interface TargetCtx {
  target: SyllabusTarget;
  /** The unit's skill, for unit targets. */
  skillCode: string | null;
  lessonIds: Set<string>;
  /** The whole catalog: techniques cut across skills, so any may narrow a drill. */
  techniques: Array<{ id: string; name: string }>;
}

async function loadTargetCtx(supabase: Supabase, target: SyllabusTarget): Promise<TargetCtx | null> {
  let skillCode: string | null = null;
  if (target.unitId) {
    const { data: unit } = await supabase
      .from('curriculum_units')
      .select('id, skill_code')
      .eq('id', target.unitId)
      .maybeSingle();
    if (!unit) return null;
    skillCode = unit.skill_code;
  }
  const [{ data: lessons }, { data: techniques }] = await Promise.all([
    supabase.from('lessons').select('id'),
    supabase.from('techniques').select('id, name').eq('test_type', TEST_TYPE),
  ]);
  return {
    target,
    skillCode,
    lessonIds: new Set((lessons ?? []).map((l) => l.id)),
    techniques: techniques ?? [],
  };
}

function rowFor(target: SyllabusTarget, position: number, step: NormalizedStep) {
  return {
    unit_id: target.unitId ?? null,
    section: target.section ?? null,
    test_type: TEST_TYPE,
    position,
    kind: step.kind,
    lesson_id: step.lessonId,
    role: step.role,
    skill_codes: step.skillCodes,
    technique_ids: step.techniqueIds,
    technique_source: step.techniqueSource,
    question_count: step.questionCount,
    minutes: step.minutes,
    skip_if_completed: step.skipIfCompleted,
    updated_at: new Date().toISOString(),
  };
}

/** Marks a unit whose syllabus a human authored. Section syllabi have
 *  no backfilled default, so "built" is simply "has steps". */
async function stampAuthored(supabase: Supabase, target: SyllabusTarget, authored: boolean) {
  if (!target.unitId) return;
  await supabase
    .from('curriculum_units')
    .update({ syllabus_authored_at: authored ? new Date().toISOString() : null })
    .eq('id', target.unitId);
}

function stepsOf(supabase: Supabase, target: SyllabusTarget) {
  const q = supabase.from('curriculum_unit_steps').select('id, position');
  if (target.unitId) return q.eq('unit_id', target.unitId);
  return q.eq('section', target.section ?? '').eq('test_type', TEST_TYPE).is('unit_id', null);
}

async function orderedStepIds(supabase: Supabase, target: SyllabusTarget): Promise<string[]> {
  const { data } = await stepsOf(supabase, target)
    .order('position', { ascending: true })
    .order('id', { ascending: true });
  return (data ?? []).map((r) => r.id);
}

/** Renumber a syllabus's steps 1..n in the given id order. Two passes
 *  through an offset so no intermediate state violates the unique
 *  position index. */
async function renumber(supabase: Supabase, target: SyllabusTarget, orderedIds: string[]): Promise<string | null> {
  const { data: rows, error } = await stepsOf(supabase, target);
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
  target,
  input,
  afterStepId,
}: {
  target: SyllabusTarget;
  input: StepFormInput;
  /** Insert after this step; omitted (or null) appends. */
  afterStepId?: string | null;
}): Promise<ActionResult<{ data: { id: string } }>> {
  const t = validTarget(target);
  if (!t) return actionFail('A unit or a section is required.');
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { id: string } }>;
  }
  const { supabase } = ctx;
  const targetCtx = await loadTargetCtx(supabase, t);
  if (!targetCtx) return actionFail('Curriculum unit not found.');
  const normalized = normalizeStepInput(input, {
    unitSkillCode: targetCtx.skillCode ?? undefined,
    lessonIds: targetCtx.lessonIds,
    techniques: targetCtx.techniques,
  });
  if (!normalized.ok) return actionFail(normalized.error);

  const ids = await orderedStepIds(supabase, t);
  // Append past every existing position (offset-safe), then renumber
  // into the requested slot.
  const { data, error } = await supabase
    .from('curriculum_unit_steps')
    .insert(rowFor(t, ids.length + 1 + RENUMBER_OFFSET, normalized.value))
    .select('id')
    .maybeSingle();
  if (error) return actionFail(error.message);
  if (!data) return actionFail('Step was not created.');

  const at = afterStepId ? ids.indexOf(afterStepId) : -1;
  const ordered = [...ids];
  if (afterStepId && at >= 0) ordered.splice(at + 1, 0, data.id);
  else ordered.push(data.id);
  const renumErr = await renumber(supabase, t, ordered);
  if (renumErr) return actionFail(renumErr);

  await stampAuthored(supabase, t, true);
  revalidateSyllabusSurfaces(t);
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
    .select('id, unit_id, section, position')
    .eq('id', stepId)
    .maybeSingle();
  if (!existing) return actionFail('Step not found.');
  const t = targetOfRow(existing);
  if (!t) return actionFail('Step has no syllabus.');
  const targetCtx = await loadTargetCtx(supabase, t);
  if (!targetCtx) return actionFail('Curriculum unit not found.');
  const normalized = normalizeStepInput(input, {
    unitSkillCode: targetCtx.skillCode ?? undefined,
    lessonIds: targetCtx.lessonIds,
    techniques: targetCtx.techniques,
  });
  if (!normalized.ok) return actionFail(normalized.error);

  const { error } = await supabase
    .from('curriculum_unit_steps')
    .update(rowFor(t, existing.position, normalized.value))
    .eq('id', stepId);
  if (error) return actionFail(error.message);
  await stampAuthored(supabase, t, true);
  revalidateSyllabusSurfaces(t);
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
    .select('unit_id, section')
    .maybeSingle();
  if (error) return actionFail(error.message);
  if (!removed) return actionFail('Step not found.');
  const t = targetOfRow(removed);
  if (!t) return { ok: true };
  const renumErr = await renumber(supabase, t, await orderedStepIds(supabase, t));
  if (renumErr) return actionFail(renumErr);
  await stampAuthored(supabase, t, true);
  revalidateSyllabusSurfaces(t);
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
    .select('id, unit_id, section')
    .eq('id', stepId)
    .maybeSingle();
  if (!step) return actionFail('Step not found.');
  const t = targetOfRow(step);
  if (!t) return actionFail('Step has no syllabus.');
  const ids = await orderedStepIds(supabase, t);
  const index = ids.indexOf(stepId);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= ids.length) return actionOk({ moved: false });
  [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
  const renumErr = await renumber(supabase, t, ids);
  if (renumErr) return actionFail(renumErr);
  await stampAuthored(supabase, t, true);
  revalidateSyllabusSurfaces(t);
  return actionOk({ moved: true });
}

/** Put a unit back on the backfilled default: the published
 *  skill-tagged lesson the launcher would have opened (first by title),
 *  then one practice drill — and clear the authored stamp. Units only;
 *  a section syllabus has no default (empty = no foundations). */
export async function resetUnitSyllabus({ unitId }: { unitId: string }): Promise<ActionResult<{ data: { steps: number } }>> {
  if (!UUID_RE.test(unitId)) return actionFail('unitId required');
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    return fromErr(err) as ActionResult<{ data: { steps: number } }>;
  }
  const { supabase } = ctx;
  const t: SyllabusTarget = { unitId };
  const targetCtx = await loadTargetCtx(supabase, t);
  if (!targetCtx || !targetCtx.skillCode) return actionFail('Curriculum unit not found.');

  const { data: tagged } = await supabase
    .from('lesson_topics')
    .select('lesson_id, lessons!inner(id, title, status)')
    .eq('skill_code', targetCtx.skillCode)
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
    rows.push(rowFor(t, 1, {
      kind: 'lesson', lessonId: lesson.id, role: null, skillCodes: null, techniqueIds: null, techniqueSource: 'lesson',
      questionCount: null, minutes: null, skipIfCompleted: true,
    }));
  }
  rows.push(rowFor(t, rows.length + 1, {
    kind: 'drill', lessonId: null, role: 'practice', skillCodes: null, techniqueIds: null, techniqueSource: 'lesson',
    questionCount: DEFAULT_DRILL_COUNT, minutes: null, skipIfCompleted: true,
  }));
  const { error: insErr } = await supabase.from('curriculum_unit_steps').insert(rows);
  if (insErr) return actionFail(insErr.message);
  await stampAuthored(supabase, t, false);
  revalidateSyllabusSurfaces(t);
  return actionOk({ steps: rows.length });
}

/** The "study plans use these syllabi" switch — feature flag
 *  `unit_syllabus`, read by lib/plan/unit-steps.ts on every plan
 *  generation. Off = every unit falls back to the simple pair and no
 *  foundations are front-loaded. */
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
          'Plan generator walks curriculum_unit_steps (section foundations, then lessons in teaching order with drills tied to lessons) instead of the built-in lesson-then-drill pair. on | off.',
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
