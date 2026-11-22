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

import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { adherenceSummaryLine, ADHERENCE_LABELS } from '@/lib/plan/adherence';
import { loadStudentPlanState } from '@/lib/plan/load-plan-state';
import { generatePlanAction, activatePlanAction } from './actions';
import { GeneratePlanForm, ActivatePlanButton } from './StudyPlanInteractive';
import { PlanSchedule } from './PlanSchedule';
import type { UnitOption } from './PlanEditor';
import styles from './StudyPlan.module.css';

import { storedSectionFocus } from '@/lib/plan/section-focus';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ studentId: string }> };

function num(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && typeof (obj as Record<string, unknown>)[key] === 'number') {
    return (obj as Record<string, number>)[key];
  }
  return null;
}

function studentName(p: { first_name: string | null; last_name: string | null; email: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Student';
}

export default async function StudentPlanPage({ params }: PageProps) {
  const { studentId } = await params;
  const { supabase } = await requireRole(['teacher', 'manager', 'admin']);

  const { data: student } = await supabase
    .from('profiles')
    .select('first_name, last_name, email, target_sat_score, sat_test_date')
    .eq('id', studentId)
    .maybeSingle();
  // RLS: a student this tutor can't see reads as absent → 404.
  if (!student) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const { draft, active, tasksByPlan, adherence } = await loadStudentPlanState(
    supabase,
    studentId,
    today,
  );

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

  const name = studentName(student);
  const defaults = {
    goalScore: (student.target_sat_score ?? draft?.goal_score ?? active?.goal_score ?? '') as number | '',
    testDate: (draft?.test_date ?? active?.test_date ?? student.sat_test_date ?? '') as string,
    sectionFocus: storedSectionFocus((draft ?? active)?.config),
    weeklyHours: num(draft?.config, 'weekly_hours') ?? num(active?.config, 'weekly_hours') ?? 5,
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
          Start with a suggested schedule or build from scratch. Add, move, and remove units or
          individual tasks, then activate the draft when it is ready. Regeneration keeps your edits.
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{active || draft ? 'Build or regenerate a draft' : 'Create a plan'}</h2>
        <GeneratePlanForm
          profileTarget={student.target_sat_score}
          studentId={studentId}
          action={generatePlanAction}
          defaults={defaults}
          hasActive={Boolean(active || draft)}
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
          <PlanSchedule plan={draft} tasks={tasksByPlan.get(draft.id) ?? []} studentId={studentId} units={units} />
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
          <PlanSchedule plan={active} tasks={tasksByPlan.get(active.id) ?? []} studentId={studentId} units={units} />
        </section>
      ) : null}

      {!draft && !active ? (
        <p className={styles.empty}>No plan yet — generate a starting schedule or create a blank draft above.</p>
      ) : null}
    </main>
  );
}
