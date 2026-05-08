// Tutor → group assignment report. The peer to the per-student
// AssignmentReport, but rendered for the cohort: one set of
// metrics across every enrolled student, a question map that
// flags any item where someone got it wrong, and a per-question
// detail card that shows the question (with reveal) plus a
// per-student breakdown — Correct / Incorrect / Omitted, names
// visible on hover. Useful for a tutor leading a review session
// with the whole group instead of a 1:1.
//
// dynamic = 'force-dynamic' so each navigation re-aggregates
// from the latest attempts, matching the user's expectation that
// the report "regenerates when clicked."
//
// Data shape mirrors lib/practice/build-session-review.js item
// shape (stem/options/reveal) so the same QuestionRenderer in
// 'review' mode can power the detail panel — but with no
// per-student studentAnswer; instead a `cohort` payload listing
// who answered correctly, who got it wrong, and who hasn't
// attempted at all yet.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { expandToAttemptIds } from '@/lib/practice/weak-queue';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import { GroupAssignmentReport } from '@/lib/practice/GroupAssignmentReport';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentGroupReportPage({ params }) {
  const { id: assignmentId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const [{ data: assignment }, { data: junctionRows }] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select(`
        id, assignment_type, title, description, due_date, archived_at, deleted_at,
        created_at, question_ids
      `)
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select(`
        student_id, completed_at, created_at,
        student:profiles!assignment_students_v2_student_id_fkey (id, first_name, last_name, email, role)
      `)
      .eq('assignment_id', assignmentId),
  ]);

  if (!assignment || assignment.deleted_at) notFound();

  // Group reports only make sense for question-pool assignments.
  // Lesson + practice-test assignments don't have the per-question
  // attempt grain we'd need to aggregate, so kick those back to
  // the detail page with a friendly empty state.
  if (assignment.assignment_type !== 'questions') {
    return (
      <EmptyReport
        title={assignment.title ?? 'Assignment'}
        backHref={`/tutor/assignments/${assignmentId}`}
        body="Group reports are only available for question-pool assignments."
      />
    );
  }

  const questionIds = Array.isArray(assignment.question_ids)
    ? assignment.question_ids.filter(Boolean)
    : [];
  if (questionIds.length === 0) {
    return (
      <EmptyReport
        title={assignment.title ?? 'Assignment'}
        backHref={`/tutor/assignments/${assignmentId}`}
        body="This assignment has no question pool, so there's no report to render."
      />
    );
  }

  const students = (junctionRows ?? [])
    .map((r) => ({
      id: r.student_id,
      name:
        [r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ')
        || r.student?.email
        || 'Student',
      email: r.student?.email ?? null,
      role: r.student?.role ?? null,
      completedAt: r.completed_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (students.length === 0) {
    return (
      <EmptyReport
        title={assignment.title ?? 'Assignment'}
        backHref={`/tutor/assignments/${assignmentId}`}
        body="No students are enrolled on this assignment yet."
      />
    );
  }

  const studentIds = students.map((s) => s.id);

  // Expand to legacy v1 attempt ids so pre-cutover work counts.
  const { allIds: attemptQuestionIds, v2ByLegacy } = await expandToAttemptIds(
    supabase,
    questionIds,
  );

  // Fetch attempts and question content in parallel. Floor every
  // attempt at assignment.created_at — pre-assignment work on the
  // same questions doesn't count toward the cohort's progress on
  // this assignment, matching the per-student report and the
  // assignment detail page.
  const assignmentFloor = assignment.created_at ?? '1970-01-01T00:00:00Z';
  const [
    { data: questions },
    { data: attemptRows },
  ] = await Promise.all([
    supabase
      .from('questions_v2')
      .select(
        'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, rationale_html, rationale_rendered, correct_answer, domain_code, domain_name, skill_code, skill_name, difficulty, score_band, display_code',
      )
      .in('id', questionIds),
    studentIds.length > 0 && attemptQuestionIds.length > 0
      ? supabase
          .from('attempts')
          .select('user_id, question_id, is_correct, created_at')
          .in('user_id', studentIds)
          .in('question_id', attemptQuestionIds)
          .gte('created_at', assignmentFloor)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  // First in-window attempt per (student, question) wins. attempts
  // returned ascending so the first .set hit is the earliest. Both
  // sides (assignment qids and attempt qids) get normalized through
  // v2ByLegacy so v1- and v2-era ids line up on the same key.
  const firstByPair = new Map();
  for (const a of attemptRows ?? []) {
    const qKey = v2ByLegacy.get(a.question_id) ?? a.question_id;
    const key = `${a.user_id}::${qKey}`;
    if (!firstByPair.has(key)) firstByPair.set(key, a);
  }
  function v2KeyForAssignmentQid(qid) {
    return v2ByLegacy.get(qid) ?? qid;
  }

  // Per-question cohort breakdown. correct/incorrect/omitted each
  // hold { id, name } so the client can render names on hover.
  const questionContentById = new Map((questions ?? []).map((q) => [q.id, q]));

  let cohortDone = 0;
  let cohortCorrect = 0;
  const items = questionIds.map((qid, position) => {
    const qKey = v2KeyForAssignmentQid(qid);
    const q = questionContentById.get(qKey);

    const correct = [];
    const incorrect = [];
    const omitted = [];

    for (const stu of students) {
      const a = firstByPair.get(`${stu.id}::${qKey}`);
      if (!a) {
        omitted.push({ id: stu.id, name: stu.name });
        continue;
      }
      if (a.is_correct) {
        correct.push({ id: stu.id, name: stu.name });
        cohortCorrect += 1;
      } else {
        incorrect.push({ id: stu.id, name: stu.name });
      }
      cohortDone += 1;
    }

    // Map the cohort breakdown to the QuestionMapGrid's three
    // statuses. "anyone wrong" wins the visual — that's the user's
    // explicit ask. Otherwise green if at least one attempt
    // landed, gray when nobody has attempted.
    let status;
    if (incorrect.length > 0) {
      status = 'incorrect';
    } else if (correct.length > 0) {
      status = 'correct';
    } else {
      status = 'unanswered';
    }

    if (!q) {
      return {
        position,
        questionId: qid,
        missing: true,
        externalId: null,
        questionType: null,
        status,
        cohort: { correct, incorrect, omitted },
      };
    }

    const isSpr = q.question_type === 'spr';
    const stimulusHtml = applyWatermark(
      q.stimulus_rendered ?? q.stimulus_html,
      user.id,
    );
    const stemHtml = applyWatermark(
      q.stem_rendered ?? q.stem_html,
      user.id,
    );
    const optionsSource = Array.isArray(q.options_rendered)
      ? q.options_rendered
      : Array.isArray(q.options)
        ? q.options
        : [];
    const options = optionsSource.map((opt, idx) => {
      const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
      const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
      return {
        id: label,
        ordinal: idx,
        label,
        content_html: applyWatermark(content, user.id),
      };
    });
    return {
      position,
      questionId: qid,
      missing: false,
      externalId: q.display_code,
      questionType: q.question_type,
      stimulusHtml,
      stemHtml,
      options,
      layout: inferLayoutMode(q.domain_code),
      taxonomy: {
        domain_code: q.domain_code,
        domain_name: q.domain_name,
        skill_code: q.skill_code ?? null,
        skill_name: q.skill_name,
        difficulty: q.difficulty,
        score_band: q.score_band,
      },
      reveal: {
        correctOptionId: !isSpr ? extractMcqCorrectId(q.correct_answer) : null,
        correctAnswerDisplay: isSpr ? formatSprCorrect(q.correct_answer) : null,
        rationaleHtml: applyWatermark(
          q.rationale_rendered ?? q.rationale_html ?? '',
          user.id,
        ),
      },
      status,
      cohort: { correct, incorrect, omitted },
    };
  });

  const cohortAccuracy =
    cohortDone > 0 ? cohortCorrect / cohortDone : null;
  const completedCount = students.filter((s) => s.completedAt).length;
  // Questions where at least one student got it wrong — what the
  // tutor will most want to spend the meeting on.
  const wrongQuestionCount = items.filter((it) => it.cohort.incorrect.length > 0).length;

  return (
    <GroupAssignmentReport
      assignment={{
        id: assignment.id,
        title: assignment.title ?? 'Assignment',
        description: assignment.description ?? null,
        dueDate: assignment.due_date ?? null,
        createdAt: assignment.created_at,
      }}
      students={students.map((s) => ({
        id: s.id,
        name: s.name,
        completedAt: s.completedAt,
      }))}
      items={items}
      metrics={{
        cohortAccuracy,
        cohortDone,
        cohortCorrect,
        totalStudents: students.length,
        completedCount,
        totalQuestions: questionIds.length,
        wrongQuestionCount,
      }}
      backHref={`/tutor/assignments/${assignmentId}`}
    />
  );
}

// ──────────────────────────────────────────────────────────────

function EmptyReport({ title, backHref, body }) {
  return (
    <main style={{
      maxWidth: 720, margin: '2rem auto', padding: '0 1.5rem',
      fontFamily: 'var(--font-sans)',
    }}>
      <a href={backHref} style={{
        display: 'inline-block', marginBottom: '1rem',
        color: 'var(--fg3)', fontSize: 13, textDecoration: 'none',
      }}>← Back to assignment</a>
      <h1 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--app-title-1)',
        fontWeight: 700,
        color: 'var(--fg1)',
        margin: 0,
      }}>{title}</h1>
      <div style={{
        marginTop: '1.5rem',
        padding: '1.5rem',
        background: 'var(--card)',
        border: '1px dashed var(--border)',
        borderRadius: 12,
        color: 'var(--fg2)',
        fontSize: 14,
      }}>{body}</div>
    </main>
  );
}
