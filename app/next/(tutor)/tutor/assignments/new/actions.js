// Teacher assignment-creation Server Action. See
// docs/architecture-plan.md §3.9.
//
// One action handles all three assignment_type values. The form posts
// a single assignment_type + the type-specific payload fields, we
// validate per type, then INSERT into assignments_v2 + junction.
//
// Payload:
//   - assignment_type: 'questions' | 'practice_test' | 'lesson'
//   - title, description, due_date        (common)
//   - student_ids[]                       (common, at least one)
//
//   questions:
//     - domain[], skill[], difficulty[], score_band[] (filters)
//     - unanswered_only ('1' | missing)
//     - size                              (int 1..MAX_QUESTIONS)
//
//   practice_test:
//     - practice_test_id                  (uuid)
//     - sections                          ('both' | 'rw' | 'math')
//
//   lesson:
//     - lesson_id                         (uuid)
//
// For 'questions', the Server Action materializes the filtered
// question_ids at creation time (snapshots the pool), so the student
// always sees exactly the set the teacher intended even if the
// question bank changes afterwards. This mirrors v1 behavior.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';

const MAX_QUESTIONS = 50;
const MAX_STUDENTS_PER_ASSIGNMENT = 200;

export async function createAssignment(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, profile, supabase } = ctx;

  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    return actionFail('Only teachers can create assignments.');
  }

  // 10/min — creating an assignment is a deliberate action; this is
  // loose enough for a teacher making many in a row, tight enough
  // against runaway scripts.
  const rl = await rateLimit(`assignment-create:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many assignments in a short time. Please slow down.');
  }

  const assignmentType = String(formData.get('assignment_type') || '');
  if (!['questions', 'practice_test', 'lesson'].includes(assignmentType)) {
    return actionFail('Select an assignment type.');
  }

  // Common fields.
  const title = String(formData.get('title') || '').trim() || null;
  const description = String(formData.get('description') || '').trim() || null;
  const dueDateRaw = String(formData.get('due_date') || '').trim();
  const dueDate = dueDateRaw ? new Date(dueDateRaw).toISOString() : null;

  const studentIds = formData
    .getAll('student_id')
    .map((s) => String(s))
    .filter(Boolean);
  if (studentIds.length === 0) {
    return actionFail('Select at least one student.');
  }
  if (studentIds.length > MAX_STUDENTS_PER_ASSIGNMENT) {
    return actionFail(`You can assign to at most ${MAX_STUDENTS_PER_ASSIGNMENT} students at a time.`);
  }

  // Build the row's type-specific payload.
  let typePayload;
  if (assignmentType === 'questions') {
    typePayload = await buildQuestionsPayload(supabase, user.id, formData);
  } else if (assignmentType === 'practice_test') {
    typePayload = await buildPracticeTestPayload(supabase, formData);
  } else {
    typePayload = await buildLessonPayload(supabase, formData);
  }
  if (!typePayload.ok) {
    return actionFail(typePayload.error);
  }

  // Insert the parent row.
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
    return actionFail(`Failed to create assignment: ${insertErr?.message ?? 'unknown'}`);
  }

  // Junction rows. RLS allows the teacher to insert these because
  // is_v2_assignment_teacher(assignment_id, auth.uid()) is true
  // for the row we just created.
  const junctionRows = studentIds.map((sid) => ({
    assignment_id: assignment.id,
    student_id: sid,
  }));
  const { error: studentsErr } = await supabase
    .from('assignment_students_v2')
    .insert(junctionRows);

  if (studentsErr) {
    return actionFail(`Assignment created but students could not be added: ${studentsErr.message}`);
  }

  redirect(`/tutor/assignments/${assignment.id}`);
}

// ──────────────────────────────────────────────────────────────
// Per-type payload builders. Each returns { ok: true, row } on
// success or { ok: false, error } on validation failure.
// ──────────────────────────────────────────────────────────────

async function buildQuestionsPayload(supabase, teacherId, formData) {
  const domains = formData.getAll('domain').map(String).filter(Boolean);
  const skills = formData.getAll('skill').map(String).filter(Boolean);
  const difficulties = formData
    .getAll('difficulty')
    .map((d) => Number(d))
    .filter(Number.isFinite);
  const scoreBands = formData
    .getAll('score_band')
    .map((b) => Number(b))
    .filter(Number.isFinite);
  const rawSize = Number(formData.get('size') ?? 10);
  const size = Math.min(
    Math.max(Number.isFinite(rawSize) ? Math.floor(rawSize) : 10, 1),
    MAX_QUESTIONS,
  );

  // Query matching questions. is_published + is_broken=false is the
  // published-bank gate used everywhere in the new tree.
  let query = supabase
    .from('questions_v2')
    .select('id')
    .eq('is_published', true)
    .eq('is_broken', false);

  if (domains.length) query = query.in('domain_name', domains);
  if (skills.length) query = query.in('skill_name', skills);
  if (difficulties.length) query = query.in('difficulty', difficulties);
  if (scoreBands.length) query = query.in('score_band', scoreBands);

  const { data: candidates, error } = await query.limit(2000);
  if (error) return { ok: false, error: `Failed to load questions: ${error.message}` };
  if (!candidates || candidates.length === 0) {
    return { ok: false, error: 'No questions match those filters.' };
  }

  const ids = candidates.map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const questionIds = ids.slice(0, size);

  return {
    ok: true,
    row: {
      question_ids: questionIds,
      filter_criteria: {
        domains,
        skills,
        difficulties,
        scoreBands,
        size,
      },
    },
  };
}

async function buildPracticeTestPayload(supabase, formData) {
  const practiceTestId = String(formData.get('practice_test_id') || '').trim();
  const sections = String(formData.get('sections') || 'both');
  if (!practiceTestId) return { ok: false, error: 'Select a practice test.' };
  if (!['both', 'rw', 'math'].includes(sections)) {
    return { ok: false, error: 'Invalid section selection.' };
  }

  // Verify the PT exists and the caller can see it. RLS on
  // practice_tests_v2 allows SELECT to all authenticated users, so
  // this is mostly a "did you pass a real uuid" check.
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
      // filter_criteria mirrors the legacy jerry-rig shape so the
      // legacy app (which still reads question_assignments) can keep
      // working while we migrate. When the legacy tree retires this
      // can collapse to just the column.
      filter_criteria: {
        type: 'practice_test',
        practice_test_id: practiceTestId,
        sections,
      },
    },
  };
}

async function buildLessonPayload(supabase, formData) {
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
