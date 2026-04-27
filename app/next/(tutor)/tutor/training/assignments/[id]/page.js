// Tutor → training assignment detail.
//
// Same product framing as the student /assignments/[id] page —
// branches on assignment_type and shows progress + a Start /
// Continue button — but in design-kit vocabulary and scoped to
// the teacher as the "trainee" via assignment_students_v2.
// Manager-assigned-to-teacher work uses the same junction so a
// manager creating a Trainee assignment lands here on the
// teacher's side.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { AssignmentTypeBadge } from '@/lib/ui/AssignmentTypeBadge';
import { formatDate } from '@/lib/formatters';
import { startTrainingAssignment } from './actions';
import { StartTrainingButton } from './StartTrainingButton';
import s from './AssignmentDetail.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorTrainingAssignmentDetailPage({ params }) {
  const { id: assignmentId } = await params;
  if (!assignmentId) notFound();

  const { user, profile, supabase } = await requireUser();
  if (profile.role === 'student' || profile.role === 'practice') redirect('/assignments');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const [parentRes, enrolledRes] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select(`
        id, teacher_id, assignment_type, title, description,
        due_date, archived_at, deleted_at, question_ids,
        filter_criteria, lesson_id, practice_test_id,
        lesson:lessons (id, title, description),
        practice_test:practice_tests_v2 (id, code, name)
      `)
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select('completed_at')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .maybeSingle(),
  ]);

  const assignment = parentRes.data;
  const enrolled = enrolledRes.data;
  if (!assignment || assignment.deleted_at) notFound();
  if (!enrolled) notFound();

  // Manager / teacher who created the assignment — pulled via
  // profile_cards (the public-within-hierarchy minimal subset).
  const { data: managerCard } = await supabase
    .from('profile_cards')
    .select('first_name, last_name')
    .eq('id', assignment.teacher_id)
    .maybeSingle();
  const managerName = managerCard
    ? [managerCard.first_name, managerCard.last_name].filter(Boolean).join(' ')
    : null;

  // For questions-type assignments, load per-question status from
  // attempts (latest attempt wins for correctness).
  let questionRows = null;
  if (assignment.assignment_type === 'questions') {
    const questionIds = Array.isArray(assignment.question_ids) ? assignment.question_ids : [];
    if (questionIds.length > 0) {
      const [qRes, aRes] = await Promise.all([
        supabase
          .from('questions_v2')
          .select('id, display_code, domain_name, skill_name, difficulty')
          .in('id', questionIds),
        supabase
          .from('attempts')
          .select('question_id, is_correct, created_at')
          .eq('user_id', user.id)
          .in('question_id', questionIds)
          .order('created_at', { ascending: false }),
      ]);
      const byId = new Map((qRes.data ?? []).map((q) => [q.id, q]));
      const latestByQ = new Map();
      for (const a of aRes.data ?? []) {
        if (!latestByQ.has(a.question_id)) latestByQ.set(a.question_id, a);
      }
      questionRows = questionIds.map((qid, i) => {
        const q = byId.get(qid) ?? { id: qid };
        const latest = latestByQ.get(qid) ?? null;
        return {
          ordinal: i + 1,
          question_id: qid,
          display_code: q.display_code ?? null,
          domain_name: q.domain_name ?? null,
          skill_name: q.skill_name ?? null,
          difficulty: q.difficulty ?? null,
          is_done: latest != null,
          is_correct: latest?.is_correct ?? null,
        };
      });
    } else {
      questionRows = [];
    }
  }

  const title = displayTitle(assignment);
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const isOverdue =
    assignment.due_date
    && enrolled.completed_at == null
    && Date.parse(assignment.due_date) < nowMs;

  return (
    <main className={s.container}>
      <Link href="/tutor/training/assignments" className={s.breadcrumb}>
        ← All assignments
      </Link>

      <header className={s.header}>
        <div className={s.eyebrow}>Train · Assignment</div>
        <h1 className={s.h1}>{title}</h1>
        <div className={s.metaRow}>
          <AssignmentTypeBadge type={assignment.assignment_type} />
          {managerName && <span className={s.metaItem}>From {managerName}</span>}
          {assignment.due_date && (
            <span className={isOverdue ? s.metaOverdue : s.metaItem}>
              {isOverdue ? 'Overdue' : 'Due'} · {formatDate(assignment.due_date)}
            </span>
          )}
          {enrolled.completed_at && (
            <span className={s.metaCompleted}>
              ✓ Completed {formatDate(enrolled.completed_at)}
            </span>
          )}
        </div>
        {assignment.description && (
          <p className={s.description}>{assignment.description}</p>
        )}
      </header>

      {assignment.assignment_type === 'questions' && (
        <QuestionsView
          assignmentId={assignment.id}
          rows={questionRows ?? []}
          completed={enrolled.completed_at != null}
        />
      )}
      {assignment.assignment_type === 'practice_test' && (
        <PracticeTestView assignment={assignment} />
      )}
      {assignment.assignment_type === 'lesson' && (
        <LessonView assignment={assignment} />
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function QuestionsView({ assignmentId, rows, completed }) {
  if (rows.length === 0) {
    return (
      <section className={s.card}>
        <p className={s.empty}>This assignment has no questions.</p>
      </section>
    );
  }
  const total = rows.length;
  const doneCount = rows.filter((r) => r.is_done).length;
  const correctCount = rows.filter((r) => r.is_done && r.is_correct).length;
  const allDone = doneCount === total;
  const accuracyPct = doneCount > 0
    ? Math.round((correctCount / doneCount) * 100)
    : null;

  return (
    <>
      <div className={s.statsStrip}>
        <StatTile label="Progress" value={`${doneCount} / ${total}`} />
        <StatTile
          label="Accuracy"
          value={accuracyPct == null ? '—' : `${accuracyPct}%`}
          tone={accuracyPct == null ? 'neutral' : accuracyPct >= 80 ? 'good' : accuracyPct >= 50 ? 'ok' : 'warn'}
        />
        <StatTile
          label="Status"
          value={completed ? 'Completed' : doneCount === 0 ? 'Not started' : 'In progress'}
          tone={completed ? 'good' : 'neutral'}
        />
      </div>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Questions</div>
            <div className={s.cardHint}>
              Click Start (or Continue) to walk through the set in
              your training context.
            </div>
          </div>
          <StartTrainingButton
            assignmentId={assignmentId}
            label={allDone ? 'Review' : doneCount > 0 ? `Continue · ${total - doneCount} left` : 'Start'}
            disabled={false}
            startAction={startTrainingAssignment}
          />
        </div>
        <ul className={s.questionList}>
          {rows.map((r) => (
            <li
              key={r.question_id}
              className={`${s.qRow} ${r.is_done ? (r.is_correct ? s.qRowCorrect : s.qRowWrong) : ''}`}
            >
              <span className={s.qIndex}>
                {r.is_done ? (r.is_correct ? '✓' : '✗') : r.ordinal}
              </span>
              <div className={s.qInfo}>
                <div className={s.qCode}>
                  {r.display_code ?? r.domain_name ?? 'Question'}
                </div>
                <div className={s.qMeta}>
                  {r.domain_name && <span>{r.domain_name}</span>}
                  {r.skill_name && (
                    <>
                      {r.domain_name && <span className={s.muted}> · </span>}
                      <span>{r.skill_name}</span>
                    </>
                  )}
                </div>
              </div>
              {r.difficulty != null && (
                <span className={`${s.diffPill} ${diffClass(r.difficulty, s)}`}>
                  {difficultyLabel(r.difficulty)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function PracticeTestView({ assignment }) {
  const pt = assignment.practice_test;
  const sections = assignment.filter_criteria?.sections;
  return (
    <section className={s.card}>
      <div className={s.h2}>{pt?.name ?? 'Practice Test'}</div>
      {pt?.code && <div className={s.cardHint}>Code: {pt.code}</div>}
      {sections && sections !== 'both' && (
        <div className={s.cardHint}>Section: {sections.toUpperCase()} only</div>
      )}
      <div className={s.ctaRow}>
        <Link
          href={`/practice/test/${assignment.practice_test_id}`}
          className={s.startBtn}
        >
          Launch practice test
        </Link>
      </div>
    </section>
  );
}

function LessonView({ assignment }) {
  const lesson = assignment.lesson;
  return (
    <section className={s.card}>
      <div className={s.h2}>{lesson?.title ?? 'Lesson'}</div>
      {lesson?.description && <p className={s.description}>{lesson.description}</p>}
      {assignment.lesson_id && (
        <div className={s.ctaRow}>
          <a href={`/lessons/${assignment.lesson_id}`} className={s.startBtn}>
            Open lesson
          </a>
        </div>
      )}
    </section>
  );
}

function StatTile({ label, value, tone = 'neutral' }) {
  return (
    <div className={`${s.statTile} ${s[`statTile_${tone}`] ?? ''}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
    </div>
  );
}

function displayTitle(a) {
  if (a.title) return a.title;
  if (a.assignment_type === 'lesson') return a.lesson?.title ?? 'Lesson';
  if (a.assignment_type === 'practice_test') return a.practice_test?.name ?? 'Practice Test';
  return 'Training assignment';
}

function difficultyLabel(d) {
  return { 1: 'Easy', 2: 'Medium', 3: 'Hard' }[d] ?? '?';
}

function diffClass(d, styles) {
  return { 1: styles.diffEasy, 2: styles.diffMed, 3: styles.diffHard }[d] ?? '';
}
