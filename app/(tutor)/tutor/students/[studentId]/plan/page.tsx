// Tutor Study Plan page (§2.4). The first visible surface of the plan
// engine: a tutor picks a target + test date + weekly hours, generates a
// draft (generateStudyPlan §2.2), reviews the week-by-week schedule, and
// activates it as the student's one live plan (activatePlan §2.4).
//
// Server-Component-first (CLAUDE.md rule 2): this page reads the current
// draft / active plan and their tasks on the server and renders them. The
// client islands (StudyPlanInteractive) only own the intake inputs and the
// activate button; after either action writes, its route-local wrapper
// revalidates this path and the plan sections below re-render server-side.
//
// Scope + auth: the route lives under /tutor/students/[studentId], so a
// plan is always bound to a specific student. RLS (can_view) governs every
// read and every write the actions perform — an invisible student 404s.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { adherenceSummaryLine, ADHERENCE_LABELS, computeAdherence } from '@/lib/plan/adherence';
import {
  generatePlanAction,
  activatePlanAction,
  addTaskAction,
  moveTaskAction,
  regenerateWeekAction,
  removeTaskAction,
  swapSkillAction,
} from './actions';
import { GeneratePlanForm, ActivatePlanButton } from './StudyPlanInteractive';
import { AddTaskForm, RegenerateWeekButton, TaskControls } from './PlanEditor';
import type { UnitOption } from './PlanEditor';
import styles from './StudyPlan.module.css';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ studentId: string }> };

const TASK_LABELS: Record<string, string> = {
  lesson: 'Lesson',
  drill: 'Drill',
  review: 'Review',
  practice_set: 'Practice set',
  full_test: 'Full test',
  vocab: 'Vocabulary',
  flashcards: 'Flashcards',
};

interface TaskRow {
  id: string;
  plan_id: string;
  week_index: number;
  scheduled_date: string | null;
  task_type: string;
  payload: unknown;
  source: string;
  status: string;
}

function str(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && typeof (obj as Record<string, unknown>)[key] === 'string') {
    return (obj as Record<string, string>)[key];
  }
  return null;
}

function num(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && typeof (obj as Record<string, unknown>)[key] === 'number') {
    return (obj as Record<string, number>)[key];
  }
  return null;
}

function studentName(p: { first_name: string | null; last_name: string | null; email: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Student';
}

/** Render one plan's tasks grouped by week — the reviewable, editable
 *  schedule (§2.4). Controls appear on open tasks only; completed and
 *  skipped rows are history and render locked. */
function PlanWeeks({
  tasks,
  planId,
  studentId,
  units,
}: {
  tasks: TaskRow[];
  planId: string;
  studentId: string;
  units: UnitOption[];
}) {
  const byWeek = new Map<number, TaskRow[]>();
  for (const t of tasks) {
    if (!byWeek.has(t.week_index)) byWeek.set(t.week_index, []);
    byWeek.get(t.week_index)!.push(t);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  const weekCount = weeks.length ? weeks[weeks.length - 1] + 1 : 1;

  return (
    <>
      <ol className={styles.weeks}>
        {weeks.map((w) => (
          <li key={w} className={styles.week}>
            <div className={styles.weekHead}>
              <span>Week {w + 1}</span>
              <RegenerateWeekButton
                planId={planId}
                studentId={studentId}
                weekIndex={w}
                action={regenerateWeekAction}
              />
            </div>
            <ul className={styles.tasks}>
              {byWeek.get(w)!.map((t) => {
                const title = str(t.payload, 'title') ?? TASK_LABELS[t.task_type] ?? t.task_type;
                const why = str(t.payload, 'why');
                const open = t.status === 'pending';
                const stateClass =
                  t.status === 'completed'
                    ? styles.taskDone
                    : t.status === 'skipped'
                      ? styles.taskSkipped
                      : '';
                return (
                  <li key={t.id} className={`${styles.task} ${stateClass}`}>
                    <span className={`${styles.badge} ${styles[`badge_${t.task_type}`] ?? ''}`}>
                      {TASK_LABELS[t.task_type] ?? t.task_type}
                    </span>
                    <div className={styles.taskBody}>
                      <div className={styles.taskTitle}>
                        {title}
                        {t.source !== 'generated' ? (
                          <span className={styles.sourceTag}>{t.source === 'tutor' ? 'tutor' : 'student'}</span>
                        ) : null}
                        {t.status === 'completed' ? <span className={styles.doneTag}>done</span> : null}
                        {t.status === 'skipped' ? <span className={styles.skippedTag}>skipped</span> : null}
                      </div>
                      {why ? <div className={styles.taskWhy}>{why}</div> : null}
                    </div>
                    {open ? (
                      <TaskControls
                        taskId={t.id}
                        studentId={studentId}
                        weekIndex={t.week_index}
                        weekCount={weekCount}
                        canSwap={t.task_type === 'drill' || t.task_type === 'lesson'}
                        units={units}
                        moveAction={moveTaskAction}
                        swapAction={swapSkillAction}
                        removeAction={removeTaskAction}
                      />
                    ) : null}
                    {t.scheduled_date ? (
                      <time className={styles.taskDate}>{t.scheduled_date}</time>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      <AddTaskForm
        planId={planId}
        studentId={studentId}
        weekCount={weekCount}
        units={units}
        action={addTaskAction}
      />
    </>
  );
}

export default async function StudentPlanPage({ params }: PageProps) {
  const { studentId } = await params;
  const { profile, supabase } = await requireUser();

  // Belt-and-suspenders role gate (the (tutor) layout enforces it too).
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const { data: student } = await supabase
    .from('profiles')
    .select('first_name, last_name, email, target_sat_score, sat_test_date')
    .eq('id', studentId)
    .maybeSingle();
  // RLS: a student this tutor can't see reads as absent → 404.
  if (!student) notFound();

  const { data: plans } = await supabase
    .from('study_plans')
    .select('id, status, goal_score, starting_score, test_date, config, created_at')
    .eq('student_id', studentId)
    .eq('test_type', 'sat')
    .in('status', ['draft', 'active'])
    .order('created_at', { ascending: false });

  const draft = (plans ?? []).find((p) => p.status === 'draft') ?? null;
  const active = (plans ?? []).find((p) => p.status === 'active') ?? null;

  const planIds = [draft?.id, active?.id].filter((v): v is string => Boolean(v));
  const tasksByPlan = new Map<string, TaskRow[]>();
  if (planIds.length) {
    const { data: taskRows } = await supabase
      .from('plan_tasks')
      .select('id, plan_id, week_index, scheduled_date, task_type, payload, source, status')
      .in('plan_id', planIds)
      .order('scheduled_date', { ascending: true });
    for (const t of (taskRows ?? []) as TaskRow[]) {
      if (!tasksByPlan.has(t.plan_id)) tasksByPlan.set(t.plan_id, []);
      tasksByPlan.get(t.plan_id)!.push(t);
    }
  }

  // Unit options for the editor's skill selects (swap + manual drill/lesson).
  const { data: unitRows } = await supabase
    .from('curriculum_units')
    .select('domain_code, skill_code, title')
    .eq('test_type', 'sat')
    .order('sequence', { ascending: true });
  const units: UnitOption[] = (unitRows ?? []).map((u) => ({
    domainCode: u.domain_code,
    skillCode: u.skill_code,
    title: u.title,
  }));

  // Adherence (§2.4): completion vs. schedule on the active plan.
  const today = new Date().toISOString().slice(0, 10);
  const adherence = active
    ? computeAdherence(
        (tasksByPlan.get(active.id) ?? []).map((t) => ({
          scheduledDate: t.scheduled_date,
          status: t.status as 'pending' | 'completed' | 'skipped',
        })),
        today,
      )
    : null;

  const name = studentName(student);
  const defaults = {
    goalScore: (draft?.goal_score ?? student.target_sat_score ?? '') as number | '',
    testDate: (draft?.test_date ?? student.sat_test_date ?? '') as string,
    weeklyHours: num(draft?.config, 'weekly_hours') ?? 5,
  };

  return (
    <main className={styles.container}>
      <a href={`/tutor/students/${studentId}`} className={styles.breadcrumb}>
        ← Back to {name}
      </a>

      <header className={styles.header}>
        <div className={styles.eyebrow}>Study plan · SAT</div>
        <h1 className={styles.h1}>Study plan for {name}</h1>
        <p className={styles.sub}>
          Generate a week-by-week plan from {name}&rsquo;s current skill mastery, then review
          and activate it. Regenerating replaces the working draft; the active plan is left
          untouched until you activate a new one.
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{active ? 'Regenerate' : 'Create a plan'}</h2>
        <GeneratePlanForm
          studentId={studentId}
          action={generatePlanAction}
          defaults={defaults}
          hasActive={Boolean(active)}
        />
      </section>

      {draft ? (
        <section className={`${styles.card} ${styles.draftCard}`}>
          <div className={styles.draftHead}>
            <div>
              <h2 className={styles.cardTitle}>Draft plan</h2>
              <p className={styles.cardSub}>
                {(tasksByPlan.get(draft.id) ?? []).length} tasks
                {draft.starting_score ? ` · from ${draft.starting_score}` : ''}
                {draft.goal_score ? ` toward ${draft.goal_score}` : ''}
                {draft.test_date ? ` · test ${draft.test_date}` : ''}
              </p>
            </div>
            <ActivatePlanButton planId={draft.id} studentId={studentId} action={activatePlanAction} />
          </div>
          <PlanWeeks tasks={tasksByPlan.get(draft.id) ?? []} planId={draft.id} studentId={studentId} units={units} />
        </section>
      ) : null}

      {active ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Active plan</h2>
          <p className={styles.cardSub}>
            {(tasksByPlan.get(active.id) ?? []).length} tasks
            {active.goal_score ? ` · toward ${active.goal_score}` : ''}
            {active.test_date ? ` · test ${active.test_date}` : ''}
          </p>
          {adherence ? (
            <p className={styles.adherenceRow}>
              <span className={`${styles.adherenceChip} ${styles[`adherence_${adherence.status}`] ?? ''}`}>
                {ADHERENCE_LABELS[adherence.status]}
              </span>
              <span className={styles.adherenceDetail}>{adherenceSummaryLine(adherence)}</span>
            </p>
          ) : null}
          <PlanWeeks tasks={tasksByPlan.get(active.id) ?? []} planId={active.id} studentId={studentId} units={units} />
        </section>
      ) : null}

      {!draft && !active ? (
        <p className={styles.empty}>No plan yet — fill in the target above to generate one.</p>
      ) : null}
    </main>
  );
}
