// Student · Plan — the plan hub (docs/student-onboarding-and-plan-
// redesign-2026-09.md §6): the whole plan, where the student is in it,
// progress by section, what's coming up (startable now, so a student
// who is ahead can keep going), and the adjust/rebuild verbs. Today
// stays the daily surface; this is the map.
//
// Server Component: the active plan, its tasks, and the coverage rows
// load here; the week/phase arithmetic reuses buildTodayView so the
// two pages never disagree about "this week". Task starts reuse
// Today's startPlanTask; adjust/rebuild are route-local actions.

import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { PageHeader } from '@/lib/ui/PageHeader';
import { formatDate } from '@/lib/formatters';
import { buildTodayView } from '@/lib/plan/today';
import { planStartDate } from '@/lib/plan/customization';
import { loadPlanTaskResumes, practiceResume, type TaskResume } from '@/lib/plan/student-task';
import { currentPlanRationale } from '@/lib/plan/rationale';
import type { TodayTaskRow } from '@/lib/plan/today';
import { assignedTaskReports, recordedTaskReport } from '@/lib/plan/task-reports';
import { WeeklyPlanCard } from './WeeklyPlanCard';
import type { PlanMode, PlanTaskType } from '@/lib/plan/generate-plan';
import { findDomain } from '@/lib/practice/sat-taxonomy';
import { normalizePhases, PHASE_LABEL, PlanOverview } from '@/lib/ui/PlanOverview';
import { dashboardTutorNames, tutorAssignmentLabel } from '@/lib/plan/dashboard-tasks';
import { planPosition, taskProgress } from '@/lib/plan/outline';
import { startPlanTask } from '../dashboard/task-actions';
import { adjustPlanAction, rebuildPlanAction } from './actions';
import { AdjustPlanForm, RebuildPlanButton } from './PlanInteractive';
import s from './Plan.module.css';

import { storedSectionFocus } from '@/lib/plan/section-focus';

export const dynamic = 'force-dynamic';


const STATUS_ORDER = ['mastered', 'practiced', 'in_progress', 'decayed', 'not_started'] as const;
type CoverageStatus = (typeof STATUS_ORDER)[number];
const STATUS_LABEL: Record<CoverageStatus, string> = {
  mastered: 'Mastered',
  practiced: 'Practiced',
  in_progress: 'Getting started',
  decayed: 'To revisit',
  not_started: 'Not started',
};

interface SectionProgress {
  label: string;
  total: number;
  counts: Record<CoverageStatus, number>;
}

export default async function PlanPage() {
  const { user, supabase } = await requireUser();


  const [{ data: fullProfile }, { data: plan }] = await Promise.all([
    supabase.from('profiles').select('target_sat_score').eq('id', user.id).maybeSingle(),
    supabase
      .from('study_plans')
      .select('id, test_type, goal_score, test_date, mode, rationale, phases, config, created_by, created_at')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .order('test_type', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!plan) {
    return (
      <main className={s.container}>
        <PageHeader eyebrow="Your plan" title="No plan yet" />
        <section className={s.card}>
          <p className={s.body}>
            A few quick questions and you get a week-by-week plan built around where you are and
            when you can study.
          </p>
          <p className={s.body}>
            <Link href="/welcome" className={s.inlineLink}>Set up my study plan →</Link>
          </p>
        </section>
      </main>
    );
  }

  const testType = (plan.test_type ?? 'sat') as 'sat' | 'act';
  const now = new Date().toISOString();
  const [{ data: taskRows }, { data: coverageRows }, resumes] = await Promise.all([
    supabase
      .from('plan_tasks')
      .select('id, week_index, scheduled_date, task_type, payload, status, completed_at, completed_via, source')
      .eq('plan_id', plan.id)
      .order('scheduled_date', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true }),
    supabase.rpc('get_student_coverage', { p_student: user.id, p_test_type: testType }),
    loadPlanTaskResumes(supabase, user.id, now),
  ]);

  const rows: (TodayTaskRow & { resumeProgress?: string; reportHref?: string })[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    weekIndex: t.week_index,
    scheduledDate: t.scheduled_date,
    taskType: t.task_type as PlanTaskType,
    payload: (t.payload ?? {}) as Record<string, unknown>,
    status: (t.status ?? 'pending') as TodayTaskRow['status'],
    completedAt: t.completed_at,
    reportHref: recordedTaskReport(t.task_type, t.status, t.completed_via),
    source: t.source ?? 'generated',
    resumeHref: t.payload && typeof t.payload === 'object' && 'assignment_id' in t.payload
      ? undefined : resumes.get(t.id)?.href,
    resumeProgress: resumes.get(t.id)?.progress,
  }));

  const assignmentIds = rows.flatMap((t) =>
    typeof t.payload.assignment_id === 'string' ? [t.payload.assignment_id] : []);
  const [{ data: assigned }, { data: roster }, { data: activeSessions }] = assignmentIds.length
    ? await Promise.all([
        supabase.from('assignments_v2').select('id, teacher_id, assignment_type, test_type, practice_test_id, act_source_test, created_at, sections:filter_criteria->sections').in('id', assignmentIds),
        supabase.from('teacher_student_assignments').select('teacher_id').eq('student_id', user.id),
        supabase.from('practice_sessions').select('id, current_position, question_ids, filter_criteria')
          .eq('user_id', user.id).eq('status', 'in_progress').gt('expires_at', now)
          .in('filter_criteria->>assignment_id', assignmentIds)
          .order('last_activity_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }] as const;
  const teacherIds = [...new Set([...(assigned ?? []), ...(roster ?? [])].map((r) => r.teacher_id))];
  const finishedAssignments = new Set(rows.filter(t => t.status === 'completed' && !t.reportHref)
    .map(t => t.payload.assignment_id));
  const [{ data: tutorCards }, reports] = await Promise.all([
    teacherIds.length ? supabase.from('profile_cards').select('id, first_name, last_name, tutor_name').in('id', teacherIds) : { data: [] },
    assignedTaskReports(supabase, user.id, (assigned ?? []).filter(a => finishedAssignments.has(a.id))),
  ]);
  const tutors = dashboardTutorNames(tutorCards ?? []);
  const authors = new Map((assigned ?? []).map((a) => [a.id, a.teacher_id] as const));
  const sessionLinks = new Map<string, TaskResume>();
  for (const session of activeSessions ?? []) {
    const criteria = session.filter_criteria as Record<string, unknown> | null;
    const id = criteria?.assignment_id;
    if (typeof id === 'string' && criteria?.kind !== 'practice_test' && !sessionLinks.has(id))
      sessionLinks.set(id, practiceResume(session));
  }
  const tasks = rows.map((t) => {
    const id = t.payload.assignment_id;
    return typeof id === 'string'
      ? {
        ...t,
        reportHref: t.reportHref ?? (t.status === 'completed' ? reports.get(id) : undefined),
        byline: tutorAssignmentLabel(tutors, authors.get(id)),
        resumeHref: sessionLinks.get(id)?.href,
        resumeProgress: sessionLinks.get(id)?.progress,
      }
      : { ...t, byline: undefined };
  });

  const today = now.slice(0, 10);
  const view = buildTodayView(tasks, today, plan.test_date,
    planStartDate(plan.config, plan.created_at, tasks.map((t) => t.scheduledDate)));
  const phases = normalizePhases(plan.phases);
  const { task, openWeek, weekClosed } = planPosition(view, tasks);
  const week = view.week;
  const next = task ? tasks.find((t) => t.id === task.id) : undefined;
  const phase = week && phases.find((p) => week.index >= p.startWeek && week.index <= p.endWeek);
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const skipped = tasks.filter((t) => t.status === 'skipped').length;

  // Skill coverage and task completion measure different parts of preparation.
  const sections: Record<'math' | 'rw', SectionProgress> = {
    math: { label: 'Math', total: 0, counts: emptyCounts() },
    rw: { label: 'Reading & Writing', total: 0, counts: emptyCounts() },
  };
  for (const row of coverageRows ?? []) {
    const subject = findDomain(row.domain_code)?.subjectCode;
    if (!subject || testType !== 'sat') continue;
    const bucket = sections[subject];
    const status = (STATUS_ORDER as readonly string[]).includes(row.status)
      ? (row.status as CoverageStatus)
      : 'not_started';
    bucket.total += 1;
    bucket.counts[status] += 1;
  }

  const config = (plan.config && typeof plan.config === 'object' && !Array.isArray(plan.config)
    ? (plan.config as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const weeklyHours = typeof config.weekly_hours === 'number' ? config.weekly_hours : 5;
  const studyDays = Array.isArray(config.study_days)
    ? (config.study_days as unknown[]).filter((d): d is number => Number.isInteger(d))
    : [0, 1, 2, 3, 4, 5, 6];

  return (
    <main className={s.container}>
      <PageHeader
        title={`My ${testType.toUpperCase()} Study Plan`}
        description={[
          plan.goal_score != null && `Target score ${plan.goal_score}`,
          plan.test_date && `Test date ${formatDate(plan.test_date)}`,
        ].filter(Boolean).join(' · ')}
      />
      <details className={s.settings}>
        <summary>Plan settings</summary>
        <AdjustPlanForm
          action={adjustPlanAction}
          profileTarget={fullProfile?.target_sat_score ?? null}
          defaults={{
            target: fullProfile?.target_sat_score ?? plan.goal_score ?? '',
            testDate: plan.test_date ? String(plan.test_date).slice(0, 10) : today,
            weeklyHours,
            studyDays,
            sectionFocus: testType === 'sat' ? storedSectionFocus(config) : undefined,
          }}
        />
        <RebuildPlanButton action={rebuildPlanAction} />
      </details>

      <WeeklyPlanCard week={week} phase={phase ? PHASE_LABEL[phase.type] : undefined}
        weekClosed={weekClosed} weekTasks={tasks.filter((t) => t.weekIndex === week?.index)}
        next={next} today={today} finished={view.planFinished} skipped={skipped} />

      <section className={s.card} aria-labelledby="plan-outline">
        <div className={s.sectionHeading}>
          <h2 className={s.h2} id="plan-outline">Week by week</h2>
          <a href="#preparation" className={s.inlineLink}>Preparation summary</a>
        </div>
        <PlanOverview
          goalScore={plan.goal_score}
          testDate={plan.test_date ?? today}
          mode={(plan.mode as PlanMode | null) ?? null}
          rationale={null}
          phases={phases}
          tasks={tasks}
          currentWeek={week?.index}
          hub={{ today, openWeek, totalWeeks: week?.total ?? 0 }}
          startAction={startPlanTask}
        />
        {plan.rationale && <details className={s.why}>
          <summary className={s.whySummary}>Why this plan</summary>
          <p className={s.rationale}>{currentPlanRationale(plan.rationale, plan.goal_score)}</p>
        </details>}
      </section>

      <section className={s.card} id="preparation" aria-labelledby="prep-title">
        <h2 className={s.h2} id="prep-title">Your preparation so far</h2>
        <div className={s.completion}>
          <strong>Plan tasks</strong><span>{taskProgress(completed, tasks.length, skipped)}</span>
        </div>
        {testType === 'sat' && <>
          <h3 className={s.coverageTitle}>Skill coverage</h3>
          <div className={s.sections}>
            {Object.values(sections).map((sec) => (
              <div key={sec.label} className={s.sectionBlock}>
                <strong>{sec.label}</strong>
                {sec.total ? <>
                  <span>{sec.total - sec.counts.not_started} of {sec.total} skills started · {sec.counts.mastered} mastered</span>
                  {sec.counts.decayed > 0 && <span>{sec.counts.decayed} to revisit</span>}
                </> : <span>Coverage unavailable</span>}
              </div>
            ))}
          </div>
          <details className={s.why}>
            <summary className={s.whySummary}>Skill breakdown and how progress is measured</summary>
            <div className={s.breakdown}>
              {Object.values(sections).filter((sec) => sec.total > 0).map((sec) => (
                <div key={sec.label}><strong>{sec.label}</strong>
                  <ul>{STATUS_ORDER.map((st) => <li key={st}>{STATUS_LABEL[st]} · {sec.counts[st]}</li>)}</ul>
                </div>
              ))}
            </div>
            <p className={s.body}>A skill counts as started after your first practice question. Mastery also takes into account the number, difficulty, and recency of your answers. Skills marked to revisit have slipped from an earlier high.</p>
          </details>
        </>}
      </section>
    </main>
  );
}

function emptyCounts(): Record<CoverageStatus, number> {
  return { mastered: 0, practiced: 0, in_progress: 0, decayed: 0, not_started: 0 };
}
