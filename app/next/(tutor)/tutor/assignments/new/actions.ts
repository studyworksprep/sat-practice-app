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
//   - unanswered_only  : "1" to keep only questions none of the
//       assignment's students have attempted. Any attempt by any
//       selected student disqualifies a question, so the set is new
//       to every student.
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
import { fetchAll } from '@/lib/supabase/fetchAll';
import type { ActionResult } from '@/lib/types';

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
  lesson_pack_id?: string;
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
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  // Cast once — requireUser returns { supabase: unknown } in our
  // AuthContext type until the auth helper itself migrates to .ts.
  const { user, profile, supabase } = ctx as {
    user: { id: string };
    profile: { role: string };
    supabase: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    return actionFail('Only teachers can create assignments.');
  }

  const rl = await rateLimit(`assignment-create:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many assignments in a short time. Please slow down.');
  }

  const assignmentType = String(formData.get('assignment_type') || '');
  if (!['questions', 'practice_test', 'lesson', 'lesson_pack'].includes(assignmentType)) {
    return actionFail('Select an assignment type.');
  }

  let title = String(formData.get('title') || '').trim() || null;
  const description = String(formData.get('description') || '').trim() || null;
  // assignments_v2.due_date is a calendar `date`. The form field is
  // an <input type="date">, which already submits bare YYYY-MM-DD —
  // pass it through unchanged. (Previously we round-tripped through
  // new Date(...).toISOString(), which silently anchored every date
  // to midnight UTC and produced an off-by-one in every renderer.)
  const dueDateRaw = String(formData.get('due_date') || '').trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : null;

  const studentIds = formData
    .getAll('student_id')
    .map((s) => String(s))
    .filter(Boolean);
  if (studentIds.length === 0) {
    return actionFail('Select at least one student.');
  }
  if (studentIds.length > MAX_STUDENTS_PER_ASSIGNMENT) {
    return actionFail(
      `You can assign to at most ${MAX_STUDENTS_PER_ASSIGNMENT} students at a time.`,
    );
  }

  let typePayload: PayloadResult;
  if (assignmentType === 'questions') {
    typePayload = await buildQuestionsPayload(supabase, formData, studentIds);
  } else if (assignmentType === 'practice_test') {
    typePayload = await buildPracticeTestPayload(supabase, formData);
  } else if (assignmentType === 'lesson_pack') {
    typePayload = await buildLessonPackPayload(supabase, formData, user.id);
  } else {
    typePayload = await buildLessonPayload(supabase, formData);
  }
  if (!typePayload.ok) {
    return actionFail(typePayload.error);
  }

  // Lesson-pack assignments default their title to the pack's name
  // so every downstream read site (assignment lists, dashboards,
  // student detail) renders a real label without needing a new
  // lesson_packs join. Tutor's explicit title still wins.
  if (assignmentType === 'lesson_pack' && !title) {
    const packId = typePayload.row.lesson_pack_id;
    if (packId) {
      const { data: pack } = await supabase
        .from('lesson_packs')
        .select('name')
        .eq('id', packId)
        .maybeSingle();
      if (pack?.name) title = pack.name;
    }
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
      test_type: 'sat',
      ...typePayload.row,
    })
    .select('id')
    .single();

  if (insertErr || !assignment) {
    return actionFail(
      `Failed to create assignment: ${insertErr?.message ?? 'unknown'}`,
    );
  }

  const junctionRows = studentIds.map((sid) => ({
    assignment_id: assignment.id,
    student_id: sid,
    test_type: 'sat',
  }));
  const { error: studentsErr } = await supabase
    .from('assignment_students_v2')
    .insert(junctionRows);

  if (studentsErr) {
    return actionFail(
      `Assignment created but students could not be added: ${studentsErr.message}`,
    );
  }

  redirect(`/tutor/assignments/${assignment.id}`);
}

// ──────────────────────────────────────────────────────────────
// Questions payload: per-skill weighted sampling.
// ──────────────────────────────────────────────────────────────

async function buildQuestionsPayload(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  formData: FormData,
  studentIds: string[],
): Promise<PayloadResult> {
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

  // "Not attempted" filter: when on, drop any question that any of
  // the assignment's students already has an attempt row for.
  const unansweredOnly = String(formData.get('unanswered_only') || '') === '1';

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
  // When the "not attempted" filter is on, the students' attempt
  // history is fetched alongside so the two waves overlap.
  const [candidatePools, attempted] = await Promise.all([
    Promise.all(
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
    ),
    unansweredOnly
      ? fetchAttemptedIds(supabase, studentIds)
      : Promise.resolve<{ ids: Set<string>; error?: string }>({
          ids: new Set<string>(),
        }),
  ]);

  const firstErr = candidatePools.find((p) => p.error);
  if (firstErr) {
    return { ok: false, error: `Failed to load questions: ${firstErr.error}` };
  }
  if (attempted.error) {
    return { ok: false, error: `Failed to check attempt history: ${attempted.error}` };
  }

  // Drop every candidate any selected student has already attempted,
  // so a "not attempted" set is genuinely new to all of them. Done
  // before sampling so the deficit-redistribution below works
  // against the post-filter pools.
  if (unansweredOnly && attempted.ids.size > 0) {
    for (const pool of candidatePools) {
      pool.ids = pool.ids.filter((id: string) => !attempted.ids.has(id));
    }
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
    return {
      ok: false,
      error: unansweredOnly
        ? 'No unattempted questions match those filters — every matching question has already been attempted by one of the selected students.'
        : 'No questions match those filters.',
    };
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
        unansweredOnly,
      },
    },
  };
}

// Collect every question_id that any of the given students has at
// least one `attempts` row for. A question counts as "attempted" for
// the set if even one selected student has touched it, so the Set is
// the union across all students.
//
// Runs on the caller's RLS-scoped client. The attempts_select policy
// is `can_view(user_id)`, which already grants a teacher their own
// students' (and a manager their trainees') attempt rows — i.e. every
// person the New Assignment picker can list — so no service-role
// bypass is needed. Paged via fetchAll rather than a single capped
// query, since PostgREST silently truncates at max-rows (the
// db-max-rows bug the rebuild exists to kill; CLAUDE.md, Finding #1).
//
// Only v2-era attempts match: `attempts.question_id` holds whichever
// id space the question was practiced under, and v1 ids never collide
// with questions_v2 ids, so legacy v1 practice is not considered.
async function fetchAttemptedIds(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  studentIds: string[],
): Promise<{ ids: Set<string>; error?: string }> {
  const ids = new Set<string>();
  if (studentIds.length === 0) return { ids };

  try {
    const rows = await fetchAll<{ question_id: string }>((from: number, to: number) =>
      supabase
        .from('attempts')
        .select('question_id')
        .in('user_id', studentIds)
        .order('id', { ascending: true })
        .range(from, to),
    );
    for (const r of rows) ids.add(r.question_id);
  } catch (err) {
    return {
      ids,
      error: err instanceof Error ? err.message : 'Failed to load attempt history.',
    };
  }
  return { ids };
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
  const leftover = size - floored.reduce((a, b) => a + b, 0);

  if (leftover > 0) {
    // Largest-remainder distribution. When fractional parts tie
    // (the common case is uniform weights with size < N: every
    // selection raw = size/N, every frac equal), break ties with
    // a per-call random tag rather than ascending array index.
    // Without this, a tutor who hit "Add all in domain" for
    // Reading first and then Math at size=10 with all weights=1
    // ended up with 0 Math questions: every leftover unit went
    // to the first leftover-many indices in input order, which
    // were entirely RW. The random tiebreaker spreads the units
    // across the tied set in expectation. Two assignments built
    // with the same shape get independent draws.
    const order = raw
      .map((r, i) => ({ i, frac: r - Math.floor(r), tieBreak: Math.random() }))
      .sort((a, b) => b.frac - a.frac || a.tieBreak - b.tieBreak);
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

// ──────────────────────────────────────────────────────────────
// Lesson-pack payload: snapshot the pack's questions into
// question_ids in position order. Students get a stable snapshot
// at the moment of assignment — pack edits afterwards don't
// retroactively change what's already been handed out.
// RLS on lesson_packs is owner-only, so the maybeSingle below
// silently returns nothing if a teacher tries to assign someone
// else's pack id; that surfaces as "Pack not found" rather than
// leaking ownership info.
// ──────────────────────────────────────────────────────────────
async function buildLessonPackPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  formData: FormData,
  teacherId: string,
): Promise<PayloadResult> {
  const packId = String(formData.get('lesson_pack_id') || '').trim();
  if (!packId) return { ok: false, error: 'Select a lesson pack.' };

  const { data: pack } = await supabase
    .from('lesson_packs')
    .select('id, teacher_id')
    .eq('id', packId)
    .maybeSingle();
  if (!pack) return { ok: false, error: 'Lesson pack not found.' };
  // RLS would already have hidden a pack the caller doesn't own
  // from a SELECT, but admins (who can read everyone's packs)
  // reach here too — the explicit owner check keeps an admin
  // who accidentally enters someone else's pack id from creating
  // a cross-tutor assignment that nobody can manage.
  if (pack.teacher_id !== teacherId) {
    return { ok: false, error: 'You can only assign your own lesson packs.' };
  }

  // !inner drops junction rows whose underlying question has been
  // unpublished or flagged broken since it was added to the pack,
  // so a snapshot can never include a question that won't load for
  // the student. The pack viewer applies the same filter, so the
  // assignment matches what the tutor saw at the moment they hit
  // create.
  const { data: rows, error } = await supabase
    .from('lesson_pack_questions')
    .select('question_id, position, question:questions_v2!inner(id)')
    .eq('pack_id', packId)
    .eq('question.is_published', true)
    .eq('question.is_broken', false)
    .order('position', { ascending: true });
  if (error) return { ok: false, error: `Failed to read pack: ${error.message}` };

  const questionIds = (rows ?? []).map((r: { question_id: string }) => r.question_id);
  if (questionIds.length === 0) {
    return {
      ok: false,
      error:
        'This pack has no available questions to assign — every question in it has been unpublished or flagged.',
    };
  }
  if (questionIds.length > MAX_QUESTIONS) {
    return {
      ok: false,
      error: `Packs over ${MAX_QUESTIONS} questions can't be assigned in one go.`,
    };
  }

  return {
    ok: true,
    row: {
      lesson_pack_id: packId,
      question_ids: questionIds,
      filter_criteria: {
        type: 'lesson_pack',
        lesson_pack_id: packId,
        size: questionIds.length,
      },
    },
  };
}
