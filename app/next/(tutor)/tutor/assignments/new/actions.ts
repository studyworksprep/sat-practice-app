// Teacher assignment-creation Server Action. See
// docs/architecture-plan.md §3.9.
//
// One action handles all three assignment_type values. The form posts
// a single assignment_type + the type-specific payload fields, we
// validate per type, then INSERT into assignments_v2 + junction.
//
// Questions payload shape (new, as of the per-skill-weighting update):
//   - skill_selections : JSON string of
//       [{ domain, skill, scoreBands: number[], weight: number }, ...]
//   - difficulty[]     : optional global difficulty filter
//   - unanswered_only  : reserved (not yet wired)
//   - size             : int 1..MAX_QUESTIONS
//
// We materialize question_ids at creation time by weighted sampling:
// each skill entry gets an allocation proportional to its weight,
// and we shuffle + slice each skill's candidate pool independently
// then union the IDs. If a skill has fewer matches than its
// allocation, we redistribute the deficit across the others.
//
// Legacy "flat filter" shape is still parsed for API-only callers
// (domain[], skill[], score_band[]) — mostly for completeness; the UI
// now always posts skill_selections.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import type { ActionResult } from '@/lib/types';

// Helper: actionFail() is a .js helper that returns a widened shape.
// Narrow it here so Server Action return type matches ActionResult.
function fail(msg: string): ActionResult {
  return actionFail(msg) as ActionResult;
}

const MAX_QUESTIONS = 50;
const MAX_STUDENTS_PER_ASSIGNMENT = 200;

type SkillSelection = {
  domain: string;
  skill: string;
  scoreBands: number[];
  weight: number;
};

type PayloadRow = {
  question_ids?: string[];
  practice_test_id?: string;
  lesson_id?: string;
  filter_criteria?: Record<string, unknown>;
};

type PayloadResult =
  | { ok: true; row: PayloadRow }
  | { ok: false; error: string };

export async function createAssignment(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult() as ActionResult;
    return fail('Unexpected error loading user');
  }
  // Cast once — requireUser returns { supabase: unknown } in our
  // AuthContext type until the auth helper itself migrates to .ts.
  const { user, profile, supabase } = ctx as {
    user: { id: string };
    profile: { role: string };
    supabase: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    return fail('Only teachers can create assignments.');
  }

  const rl = await rateLimit(`assignment-create:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return fail('Too many assignments in a short time. Please slow down.');
  }

  const assignmentType = String(formData.get('assignment_type') || '');
  if (!['questions', 'practice_test', 'lesson'].includes(assignmentType)) {
    return fail('Select an assignment type.');
  }

  const title = String(formData.get('title') || '').trim() || null;
  const description = String(formData.get('description') || '').trim() || null;
  const dueDateRaw = String(formData.get('due_date') || '').trim();
  const dueDate = dueDateRaw ? new Date(dueDateRaw).toISOString() : null;

  const studentIds = formData
    .getAll('student_id')
    .map((s) => String(s))
    .filter(Boolean);
  if (studentIds.length === 0) {
    return fail('Select at least one student.');
  }
  if (studentIds.length > MAX_STUDENTS_PER_ASSIGNMENT) {
    return fail(
      `You can assign to at most ${MAX_STUDENTS_PER_ASSIGNMENT} students at a time.`,
    );
  }

  let typePayload: PayloadResult;
  if (assignmentType === 'questions') {
    typePayload = await buildQuestionsPayload(supabase, formData);
  } else if (assignmentType === 'practice_test') {
    typePayload = await buildPracticeTestPayload(supabase, formData);
  } else {
    typePayload = await buildLessonPayload(supabase, formData);
  }
  if (!typePayload.ok) {
    return fail(typePayload.error);
  }

  const { data: assignment, error: insertErr } = await supabase
    .from('assignments_v2')
    .insert({
      teacher_id: user.id,
      assignment_type: assignmentType,
      title,
      description,
      due_date: dueDate,
      created_by: user.id,
      updated_by: user.id,
      ...typePayload.row,
    })
    .select('id')
    .single();

  if (insertErr || !assignment) {
    return fail(
      `Failed to create assignment: ${insertErr?.message ?? 'unknown'}`,
    );
  }

  const junctionRows = studentIds.map((sid) => ({
    assignment_id: assignment.id,
    student_id: sid,
  }));
  const { error: studentsErr } = await supabase
    .from('assignment_students_v2')
    .insert(junctionRows);

  if (studentsErr) {
    return fail(
      `Assignment created but students could not be added: ${studentsErr.message}`,
    );
  }

  redirect(`/tutor/assignments/${assignment.id}`);
}

// ──────────────────────────────────────────────────────────────
// Questions payload: per-skill weighted sampling.
// ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildQuestionsPayload(supabase: any, formData: FormData): Promise<PayloadResult> {
  const selections = parseSkillSelections(formData.get('skill_selections'));
  const difficulties = formData
    .getAll('difficulty')
    .map((d) => Number(d))
    .filter(Number.isFinite);

  const rawSize = Number(formData.get('size') ?? 10);
  const size = Math.min(
    Math.max(Number.isFinite(rawSize) ? Math.floor(rawSize) : 10, 1),
    MAX_QUESTIONS,
  );

  if (selections.length === 0) {
    return { ok: false, error: 'Pick at least one skill.' };
  }

  // Allocate the `size` across selections proportional to weight,
  // using the largest-remainder method so the sum is exactly `size`.
  const allocations = allocateByWeight(
    selections.map((s) => s.weight),
    size,
  );

  // Fetch candidates per selection in parallel. Each query applies
  // that skill's own score-band filter plus the global difficulty
  // filter; the is_published + is_broken=false gate is shared.
  const candidatePools = await Promise.all(
    selections.map(async (sel) => {
      let q = supabase
        .from('questions_v2')
        .select('id')
        .eq('is_published', true)
        .eq('is_broken', false)
        .eq('domain_name', sel.domain)
        .eq('skill_name', sel.skill);

      if (sel.scoreBands.length > 0) {
        q = q.in('score_band', sel.scoreBands);
      }
      if (difficulties.length > 0) {
        q = q.in('difficulty', difficulties);
      }

      const { data, error } = await q.limit(500);
      if (error) return { ids: [] as string[], error: error.message };
      return { ids: (data ?? []).map((r: { id: string }) => r.id) };
    }),
  );

  const firstErr = candidatePools.find((p) => p.error);
  if (firstErr) {
    return { ok: false, error: `Failed to load questions: ${firstErr.error}` };
  }

  // Sample per skill; if any skill's pool is smaller than its
  // allocation, the overflow is passed to the next skill with
  // remaining capacity. That keeps the total close to `size` even
  // when the tutor picks a very narrow skill.
  const picked = new Set<string>();
  const perSkillPicks: string[][] = selections.map(() => []);
  let deficit = 0;

  for (let i = 0; i < selections.length; i += 1) {
    const ids = [...candidatePools[i].ids].filter((id) => !picked.has(id));
    shuffleInPlace(ids);
    const want = allocations[i] + deficit;
    const take = ids.slice(0, Math.min(want, ids.length));
    take.forEach((id) => picked.add(id));
    perSkillPicks[i] = take;
    deficit = want - take.length;
  }

  // If still under size after a first pass, top up from any pool
  // that had spare candidates. This is rare.
  if (picked.size < size && deficit > 0) {
    for (let i = 0; i < selections.length && picked.size < size; i += 1) {
      const leftovers = candidatePools[i].ids.filter((id: string) => !picked.has(id));
      shuffleInPlace(leftovers);
      const want = size - picked.size;
      leftovers.slice(0, want).forEach((id: string) => picked.add(id));
    }
  }

  if (picked.size === 0) {
    return { ok: false, error: 'No questions match those filters.' };
  }

  const questionIds = Array.from(picked);
  shuffleInPlace(questionIds);

  return {
    ok: true,
    row: {
      question_ids: questionIds,
      filter_criteria: {
        skillSelections: selections,
        difficulties,
        size,
      },
    },
  };
}

function parseSkillSelections(raw: FormDataEntryValue | null): SkillSelection[] {
  if (raw == null) return [];
  const str = String(raw).trim();
  if (!str) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: SkillSelection[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const domain = typeof e.domain === 'string' ? e.domain : '';
    const skill = typeof e.skill === 'string' ? e.skill : '';
    if (!domain || !skill) continue;

    const scoreBands = Array.isArray(e.scoreBands)
      ? e.scoreBands.map(Number).filter((b) => Number.isFinite(b))
      : [];
    const weightRaw = Number(e.weight);
    const weight =
      Number.isFinite(weightRaw) && weightRaw > 0
        ? Math.min(Math.max(weightRaw, 0.1), 10)
        : 1;
    out.push({ domain, skill, scoreBands, weight });
  }
  return out;
}

// Largest-remainder allocation: each weight gets floor(size * w/W)
// questions, then the leftover units go to the selections with the
// largest fractional remainders. Guarantees the sum is exactly `size`.
function allocateByWeight(weights: number[], size: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (size * w) / total);
  const floored = raw.map((r) => Math.floor(r));
  let leftover = size - floored.reduce((a, b) => a + b, 0);

  if (leftover > 0) {
    const order = raw
      .map((r, i) => ({ i, frac: r - Math.floor(r) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < leftover; k += 1) {
      floored[order[k % order.length].i] += 1;
    }
  }
  return floored;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ──────────────────────────────────────────────────────────────
// Practice test + lesson payloads. Unchanged from the JS version.
// ──────────────────────────────────────────────────────────────

async function buildPracticeTestPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  formData: FormData,
): Promise<PayloadResult> {
  const practiceTestId = String(formData.get('practice_test_id') || '').trim();
  const sections = String(formData.get('sections') || 'both');
  if (!practiceTestId) return { ok: false, error: 'Select a practice test.' };
  if (!['both', 'rw', 'math'].includes(sections)) {
    return { ok: false, error: 'Invalid section selection.' };
  }

  const { data: pt } = await supabase
    .from('practice_tests_v2')
    .select('id')
    .eq('id', practiceTestId)
    .maybeSingle();
  if (!pt) return { ok: false, error: 'Practice test not found.' };

  return {
    ok: true,
    row: {
      practice_test_id: practiceTestId,
      filter_criteria: {
        type: 'practice_test',
        practice_test_id: practiceTestId,
        sections,
      },
    },
  };
}

async function buildLessonPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  formData: FormData,
): Promise<PayloadResult> {
  const lessonId = String(formData.get('lesson_id') || '').trim();
  if (!lessonId) return { ok: false, error: 'Select a lesson.' };

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id')
    .eq('id', lessonId)
    .maybeSingle();
  if (!lesson) return { ok: false, error: 'Lesson not found.' };

  return {
    ok: true,
    row: { lesson_id: lessonId },
  };
}
