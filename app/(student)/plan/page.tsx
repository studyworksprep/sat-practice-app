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
import { formatDate } from '@/lib/formatters';
import { buildTodayView } from '@/lib/plan/today';
import type { TodayTaskRow } from '@/lib/plan/today';
import { planTaskTitle, planTaskWhy } from '@/lib/plan/task-labels';
import type { PlanMode, PlanPhaseType, PlanTaskType } from '@/lib/plan/generate-plan';
import { findDomain } from '@/lib/practice/sat-taxonomy';
import { MODE_LABEL, normalizePhases, PlanOverview } from '@/lib/ui/PlanOverview';
import { startPlanTask } from '../today/actions';
import { adjustPlanAction, rebuildPlanAction } from './actions';
import { AdjustPlanForm, RebuildPlanButton } from './PlanInteractive';
import s from './Plan.module.css';

export const dynamic = 'force-dynamic';

const PHASE_LABEL: Record<PlanPhaseType, string> = {
  coverage: 'Coverage',
  focus: 'Focus',
  rehearsal: 'Rehearsal',
  targets: 'Your targets',
};

const STATUS_ORDER = ['mastered', 'practiced', 'in_progress', 'decayed', 'not_started'] as const;
type CoverageStatus = (typeof STATUS_ORDER)[number];
const STATUS_LABEL: Record<CoverageStatus, string> = {
  mastered: 'Mastered',
  practiced: 'Practiced',
  in_progress: 'Started',
  decayed: 'Slipping',
  not_started: 'Not yet',
};

interface SectionProgress {
  label: string;
  total: number;
  counts: Record<CoverageStatus, number>;
}

export default async function PlanPage() {
  const { user, profile, supabase } = await requireUser();
  const firstName = profile.first_name ?? null;

  const { data: plan } = await supabase
    .from('study_plans')
    .select('id, test_type, goal_score, test_date, mode, rationale, phases, config, created_by, created_at')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('test_type', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return (
      <main className={s.container}>
        <header className={s.header}>
          <div>
            <div className={s.eyebrow}>Your plan</div>
            <h1 className={s.h1}>No plan yet</h1>
          </div>
        </header>
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
  const [{ data: taskRows }, { data: coverageRows }] = await Promise.all([
    supabase
      .from('plan_tasks')
      .select('id, week_index, scheduled_date, task_type, payload, status, completed_at, source')
      .eq('plan_id', plan.id)
      .order('scheduled_date', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true }),
    supabase.rpc('get_student_coverage', { p_student: user.id, p_test_type: testType }),
  ]);

  const tasks: TodayTaskRow[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    weekIndex: t.week_index,
    scheduledDate: t.scheduled_date,
    taskType: t.task_type as PlanTaskType,
    payload: (t.payload ?? {}) as Record<string, unknown>,
    status: (t.status ?? 'pending') as TodayTaskRow['status'],
    completedAt: t.completed_at,
    source: t.source ?? 'generated',
  }));

  const today = new Date().toISOString().slice(0, 10);
  const view = buildTodayView(tasks, today, plan.test_date);
  const phases = normalizePhases(plan.phases);
  const currentWeek = view.week?.index ?? 0;
  const currentPhase = phases.find((p) => currentWeek >= p.startWeek && currentWeek <= p.endWeek) ?? null;
  const doneCount = tasks.filter((t) => t.status === 'completed').length;
  const upcoming = [...view.due, ...view.ahead].slice(0, 3);

  // Progress by section from the coverage rows (design doc §6.2 item 3).
  const sections: Record<'math' | 'rw', SectionProgress> = {
    math: { label: 'Math', total: 0, counts: emptyCounts() },
    rw: { label: 'Reading & Writing', total: 0, counts: emptyCounts() },
  };
  for (const row of coverageRows ?? []) {
    const subject = findDomain(row.domain_code)?.subjectCode ?? 'math';
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
      <header className={s.header}>
        <div>
          <div className={s.eyebrow}>Your plan</div>
          <h1 className={s.h1}>
            {plan.mode ? MODE_LABEL[plan.mode as PlanMode] : 'Study plan'}
            {firstName ? ` for ${firstName}` : ''}
          </h1>
        </div>
        <div className={s.pills}>
          {plan.goal_score != null && <span className={s.pill}>Target <strong>{plan.goal_score}</strong></span>}
          {plan.test_date && (
            <span className={s.pill}>
              Test <strong>{formatDate(plan.test_date) ?? plan.test_date}</strong>
            </span>
          )}
          {view.daysToTest != null && view.daysToTest >= 0 && (
            <span className={`${s.pill} ${s.pillAccent}`}>
              {view.daysToTest === 0 ? 'Test day' : `${view.daysToTest} day${view.daysToTest === 1 ? '' : 's'} to go`}
            </span>
          )}
          <span className={s.pill}>
            <strong>{doneCount}</strong> of {tasks.length} tasks done
          </span>
        </div>
      </header>

      {/* ---------- Where you are ---------- */}
      <section className={s.card}>
        <div className={s.nowRow}>
          <div>
            <div className={s.nowLabel}>Right now</div>
            <div className={s.nowTitle}>
              Week {currentWeek + 1}
              {view.week ? ` of ${view.week.total}` : ''}
              {currentPhase ? ` · ${PHASE_LABEL[currentPhase.type]}` : ''}
            </div>
            {currentPhase?.summary && <p className={s.nowSummary}>{currentPhase.summary}</p>}
          </div>
          {view.week && view.week.count > 0 && (
            <div className={s.weekProgress}>
              <div className={s.weekCount}>{view.week.done} of {view.week.count} this week</div>
              <div className={s.weekBar} role="progressbar" aria-valuemin={0} aria-valuemax={view.week.count} aria-valuenow={view.week.done}>
                <div className={s.weekFill} style={{ width: `${Math.round((view.week.done / view.week.count) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
        {plan.rationale && (
          <details className={s.why}>
            <summary className={s.whySummary}>Why this plan</summary>
            <p className={s.rationale}>{plan.rationale}</p>
          </details>
        )}
      </section>

      {/* ---------- Coming up (startable now) ---------- */}
      <section className={s.card}>
        <h2 className={s.h2}>{view.due.length > 0 ? 'Up next' : 'Want to get ahead?'}</h2>
        {upcoming.length === 0 ? (
          <p className={s.body}>
            {view.planFinished ? 'Every task on the plan is done.' : 'Nothing left to schedule.'}
          </p>
        ) : (
          <>
            {view.due.length === 0 && (
              <p className={s.body}>Today is clear — start one of these to get ahead.</p>
            )}
            <ul className={s.upList}>
              {upcoming.map((t) => {
                const why = planTaskWhy(t.payload);
                return (
                  <li key={t.id} className={s.upRow}>
                    <div className={s.upBody}>
                      <div className={s.upTitle}>{planTaskTitle(t.taskType, t.payload)}</div>
                      <div className={s.upMeta}>
                        {t.scheduledDate ? formatDate(t.scheduledDate) ?? t.scheduledDate : 'Any time'}
                        {why ? ` · ${why}` : ''}
                      </div>
                    </div>
                    <form action={startPlanTask}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <button type="submit" className={s.startBtn}>Start</button>
                    </form>
                  </li>
                );
              })}
            </ul>
            <p className={s.body}>
              <Link href="/today" className={s.inlineLink}>Go to Today →</Link>
            </p>
          </>
        )}
      </section>

      {/* ---------- Progress by section ---------- */}
      <section className={s.card}>
        <h2 className={s.h2}>Progress by section</h2>
        <p className={s.body}>Every SAT skill, by how far along you are.</p>
        <div className={s.sections}>
          {(['math', 'rw'] as const).map((key) => {
            const sec = sections[key];
            return (
              <div key={key} className={s.sectionBlock}>
                <div className={s.sectionHead}>
                  <span className={s.sectionName}>{sec.label}</span>
                  <span className={s.sectionCount}>
                    {sec.counts.mastered + sec.counts.practiced} of {sec.total} skills practiced or mastered
                  </span>
                </div>
                <div className={s.stack} aria-hidden="true">
                  {STATUS_ORDER.map((st) =>
                    sec.total > 0 && sec.counts[st] > 0 ? (
                      <div
                        key={st}
                        className={`${s.seg} ${s[`seg_${st}`]}`}
                        style={{ width: `${(sec.counts[st] / sec.total) * 100}%` }}
                        title={`${STATUS_LABEL[st]}: ${sec.counts[st]}`}
                      />
                    ) : null,
                  )}
                </div>
                <div className={s.legend}>
                  {STATUS_ORDER.map((st) => (
                    <span key={st} className={s.legendItem}>
                      <span className={`${s.legendDot} ${s[`seg_${st}`]}`} />
                      {STATUS_LABEL[st]} {sec.counts[st]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- The whole plan ---------- */}
      <section className={s.card}>
        <h2 className={s.h2}>Week by week</h2>
        <PlanOverview
          goalScore={plan.goal_score ?? 0}
          testDate={plan.test_date ?? today}
          mode={(plan.mode as PlanMode | null) ?? null}
          rationale={null}
          phases={phases}
          tasks={tasks}
          expandWeeks={0}
          currentWeek={currentWeek}
          startAction={startPlanTask}
        />
      </section>

      {/* ---------- Adjust ---------- */}
      <section className={s.card}>
        <h2 className={s.h2}>Adjust</h2>
        <AdjustPlanForm
          action={adjustPlanAction}
          defaults={{
            target: plan.goal_score ?? 1200,
            testDate: plan.test_date ? String(plan.test_date).slice(0, 10) : today,
            weeklyHours,
            studyDays,
          }}
        />
        <RebuildPlanButton action={rebuildPlanAction} />
      </section>

      <details className={s.masteryNote}>
        <summary className={s.masteryNoteSummary}>How progress is measured</summary>
        <div className={s.masteryNoteBody}>
          <p>
            Every skill has a mastery score out of 100, and 80 counts as mastered. It goes up
            when you answer correctly — faster on harder questions — but it only climbs as high as
            your practice count allows, because four right answers in a row aren&rsquo;t enough to
            be sure of anything. Getting a few right in the last couple of weeks adds a small
            bonus on top.
          </p>
          <p>
            So a skill you&rsquo;re doing well on can still sit low: you haven&rsquo;t done enough
            of it yet. That&rsquo;s also why this isn&rsquo;t your accuracy percentage — that one
            lives on your <Link href="/dashboard" className={s.inlineLink}>dashboard</Link>.
          </p>
        </div>
      </details>
    </main>
  );
}

function emptyCounts(): Record<CoverageStatus, number> {
  return { mastered: 0, practiced: 0, in_progress: 0, decayed: 0, not_started: 0 };
}
