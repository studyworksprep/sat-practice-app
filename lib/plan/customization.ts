// Persistent editor metadata lives with the plan/tasks so it survives a
// draft copy as well as in-place regeneration. No content-bank rows change.
import type { ExistingTask, PlanTaskDraft, PlanTaskType } from './generate-plan.ts';

export interface PlanEditorConfig {
  manual: boolean;
  excludedSkills: string[];
  excludedTasks: string[];
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function editorConfig(config: unknown): PlanEditorConfig {
  const editor = record(record(config).editor);
  const strings = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    manual: editor.manual === true,
    excludedSkills: strings(editor.excluded_skills),
    excludedTasks: strings(editor.excluded_tasks),
  };
}

export function planStartDate(config: unknown, createdAt: string, dates: readonly (string | null)[]): string {
  const stored = record(config).plan_start;
  if (typeof stored === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  return dates.filter((d): d is string => Boolean(d)).sort()[0] ?? createdAt.slice(0, 10);
}

export function taskSkill(payload: unknown): string | null {
  const p = record(payload);
  return typeof p.skill_code === 'string' ? p.skill_code : null;
}

/** A unit remains a single block even when its tasks span several weeks.
 *  Legacy generated plans group by skill until they are regenerated. */
export function taskUnitKey(taskType: string, payload: unknown): string | null {
  const p = record(payload);
  if (p.assignment_id || p.standalone === true) return null;
  if (typeof p.plan_unit_key === 'string') return p.plan_unit_key;
  const skill = taskSkill(p);
  return skill && (taskType === 'lesson' || taskType === 'drill') ? `skill:${skill}` : null;
}

export function taskSemanticKey(taskType: string, payload: unknown): string {
  const p = record(payload);
  return [taskType, taskSkill(p) ?? '', p.unit_step_id ?? p.lesson_id ?? '', p.drill_role ?? ''].join(':');
}

export function taskScheduleOrder(payload: unknown): number {
  const value = record(payload).schedule_order;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Learning steps keep their identity even if a new pace moves them to
 *  another week. Recurring practice/review belongs to its original week.
 *  Counters distinguish two otherwise identical drills in that week. */
export function stampGeneratedTasks<T extends PlanTaskDraft>(tasks: readonly T[], elapsedWeeks = 0): T[] {
  const counts = new Map<string, number>();
  return tasks.map((t, i) => {
    if (t.source !== 'generated') return t;
    const unitKey = taskUnitKey(t.taskType, t.payload);
    const learning = t.taskType === 'lesson' || unitKey?.endsWith(':learn');
    const base = `${learning ? 'learn' : `w${t.weekIndex + elapsedWeeks}`}:${taskSemanticKey(t.taskType, t.payload)}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return { ...t, payload: { ...t.payload, schedule_order: i, ...(unitKey ? { plan_unit_key: unitKey } : {}), generation_key: `${base}:${n}` } };
  });
}

export function filterCustomizedTasks(
  tasks: readonly PlanTaskDraft[], config: unknown, existing: readonly ExistingTask[] = [],
): PlanTaskDraft[] {
  const editor = editorConfig(config);
  if (editor.manual) return [];
  const excludedSkills = new Set(editor.excludedSkills);
  const excludedKeys = new Set(editor.excludedTasks);
  const ownedUnits = new Set<string>();
  const manualSkills = new Map<string, string>();
  const legacyOwnedSkills = new Set<string>();
  const ownedStarts = new Map<string, string>();
  const doneLessons = new Set<string>();
  const standaloneSlots = new Map<string, number>();
  for (const t of existing) {
    const p = t.payload;
    if (t.source !== 'generated' && t.status === 'pending' && p.standalone === true && !p.generation_key) {
      const key = taskSemanticKey(t.taskType, p);
      standaloneSlots.set(key, (standaloneSlots.get(key) ?? 0) + 1);
    }
    if (t.source !== 'generated' && t.status === 'pending' && !p.generation_key && !p.plan_unit_key && p.standalone !== true) {
      const skill = taskSkill(p);
      if (skill) legacyOwnedSkills.add(skill);
    }
    if (t.source !== 'generated' || t.status !== 'pending') {
      if (typeof p.generation_key === 'string') excludedKeys.add(p.generation_key);
    }
    if (t.source !== 'generated' && p.editor_unit === true) {
      const skill = taskSkill(p);
      const key = taskUnitKey(t.taskType, p);
      if (key) ownedUnits.add(key);
      if (skill && key) {
        if (key.startsWith('unit:') && t.scheduledDate && (!manualSkills.has(skill) || t.scheduledDate > manualSkills.get(skill)!)) manualSkills.set(skill, t.scheduledDate);
        if ((key.startsWith('unit:') || key.endsWith(':learn')) && t.scheduledDate
          && (!ownedStarts.has(skill) || t.scheduledDate < ownedStarts.get(skill)!)) ownedStarts.set(skill, t.scheduledDate);
      }
    }
    if (t.taskType === 'lesson' && t.status === 'completed' && typeof p.lesson_id === 'string') doneLessons.add(p.lesson_id);
  }
  return tasks.filter((t) => {
    const skill = taskSkill(t.payload);
    const unit = taskUnitKey(t.taskType, t.payload);
    if (skill && (excludedSkills.has(skill) || legacyOwnedSkills.has(skill))) return false;
    if (unit && ownedUnits.has(unit)) return false;
    if (skill && manualSkills.has(skill) && (t.taskType === 'lesson' || unit?.endsWith(':learn')
      || t.scheduledDate <= manualSkills.get(skill)!)) return false;
    if (typeof t.payload.generation_key === 'string' && excludedKeys.has(t.payload.generation_key)) return false;
    if (t.taskType === 'lesson' && typeof t.payload.lesson_id === 'string' && doneLessons.has(t.payload.lesson_id)) return false;
    const semanticKey = taskSemanticKey(t.taskType, t.payload);
    const reserved = standaloneSlots.get(semanticKey) ?? 0;
    if (reserved > 0) {
      standaloneSlots.set(semanticKey, reserved - 1);
      return false;
    }
    return true;
  }).map((t) => {
    // An authored mixed set may explicitly name an excluded unit too.
    const fc = record(t.payload.filter_criteria);
    if (!Array.isArray(fc.skill_codes)) return t;
    const codes = fc.skill_codes.filter((c) => typeof c === 'string' && !excludedSkills.has(c)
      && (!ownedStarts.has(c) || ownedStarts.get(c)! <= t.scheduledDate));
    return { ...t, payload: { ...t.payload, filter_criteria: { ...fc, skill_codes: codes } } };
  }).filter((t) => {
    const codes = record(t.payload.filter_criteria).skill_codes;
    return !Array.isArray(codes) || codes.length > 0;
  });
}

export function asExistingTask(t: {
  week_index: number; scheduled_date: string | null; task_type: string;
  payload: unknown; source: string; status: string;
}): ExistingTask {
  return {
    weekIndex: t.week_index, scheduledDate: t.scheduled_date,
    taskType: t.task_type as PlanTaskType, payload: record(t.payload),
    source: t.source as ExistingTask['source'], status: t.status as ExistingTask['status'],
  };
}
