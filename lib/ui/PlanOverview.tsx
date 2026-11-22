// The intake preview shows the full outline. On the student hub each phase
// is a tab, with the same server-rendered week details and task actions.

import { PlanPhaseTabs } from './PlanPhaseTabs';
import { taskProgress, weekFocus } from '@/lib/plan/outline';
import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { planTaskTitle, planTaskWhy } from '@/lib/plan/task-labels';
import { taskScheduleOrder } from '@/lib/plan/customization';
import { currentPlanRationale } from '@/lib/plan/rationale';
import type { PlanMode, PlanPhase, PlanPhaseType, PlanTaskType } from '@/lib/plan/generate-plan';
import s from './PlanOverview.module.css';

export interface OverviewTask {
  id?: string;
  weekIndex: number;
  scheduledDate: string | null;
  taskType: PlanTaskType | string;
  payload: Record<string, unknown>;
  status?: 'pending' | 'completed' | 'skipped';
  resumeHref?: string;
  byline?: string;
  reportHref?: string;
}

export interface PlanOverviewProps {
  hub?: { today: string; openWeek?: number; totalWeeks: number };
  goalScore: number | null;
  testDate: string;
  mode: PlanMode | null;
  rationale: string | null;
  phases: PlanPhase[];
  tasks: OverviewTask[];
  /** Weeks rendered open; the rest collapse. Default 2. */
  expandWeeks?: number;
  /** 0-based week to highlight as "now" (the hub); omit on a preview. */
  currentWeek?: number | null;
  /** Tuck the rationale paragraph behind a "Why this plan" toggle. */
  rationaleCollapsed?: boolean;
  /** When given (the hub), every pending task gets a Start button that
   *  posts its id to this Server Action — so a student can get ahead
   *  from any week, not just from Today. */
  startAction?: (formData: FormData) => Promise<void>;
}

export const MODE_LABEL: Record<PlanMode, string> = {
  foundations: 'Foundations plan',
  targeted: 'Targeted plan',
  self_directed: 'Your own plan',
};

export const PHASE_LABEL: Record<PlanPhaseType, string> = {
  coverage: 'Coverage',
  focus: 'Focus',
  rehearsal: 'Rehearsal',
  targets: 'Your targets',
};

const PHASE_PURPOSE: Record<PlanPhaseType, string> = {
  coverage: 'Learn each topic',
  focus: 'Build weaker skills',
  rehearsal: 'Practice for test day',
  targets: 'Practice your chosen skills',
};

const TYPE_LABEL: Record<string, string> = {
  lesson: 'Lesson',
  drill: 'Drill',
  practice_set: 'Practice set',
  review: 'Review',
  full_test: 'Full test',
  vocab: 'Vocab',
  flashcards: 'Flashcards',
};

function phaseFor(phases: PlanPhase[], week: number): PlanPhase | null {
  return phases.find((p) => week >= p.startWeek && week <= p.endWeek) ?? null;
}

/** Read stored phases (snake_case jsonb) or in-memory ones (camelCase). */
export function normalizePhases(raw: unknown): PlanPhase[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanPhase[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const type = r.type;
    const start = typeof r.startWeek === 'number' ? r.startWeek : r.start_week;
    const end = typeof r.endWeek === 'number' ? r.endWeek : r.end_week;
    if (
      (type === 'coverage' || type === 'focus' || type === 'rehearsal' || type === 'targets') &&
      typeof start === 'number' &&
      typeof end === 'number'
    ) {
      out.push({
        type,
        startWeek: start,
        endWeek: end,
        summary: typeof r.summary === 'string' ? r.summary : '',
      });
    }
  }
  return out;
}

export function PlanOverview({
  hub,
  goalScore,
  testDate,
  mode,
  rationale,
  phases,
  tasks,
  expandWeeks = 2,
  currentWeek = null,
  rationaleCollapsed = false,
  startAction,
}: PlanOverviewProps) {
  const explanation = currentPlanRationale(rationale, goalScore);
  const weekCount = tasks.reduce((m, t) => Math.max(m, t.weekIndex + 1), 0);
  const totalWeeks = Math.max(hub?.totalWeeks ?? 0, weekCount, ...phases.map((p) => p.endWeek + 1), 0);
  const byWeek = new Map<number, OverviewTask[]>();
  for (const t of tasks) {
    if (!byWeek.has(t.weekIndex)) byWeek.set(t.weekIndex, []);
    byWeek.get(t.weekIndex)!.push(t);
  }
  for (const list of byWeek.values()) {
    list.sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '')
      || taskScheduleOrder(a.payload) - taskScheduleOrder(b.payload));
  }

  const weekCards = Array.from({ length: totalWeeks }, (_, w) => {
    const list = byWeek.get(w) ?? [];
    const phase = phaseFor(phases, w);
    const dates = list.map((t) => t.scheduledDate).filter((d): d is string => Boolean(d)).sort();
    const range =
      dates.length > 0
        ? `${formatDate(dates[0]) ?? dates[0]}${dates[0] !== dates[dates.length - 1] ? ` – ${formatDate(dates[dates.length - 1]) ?? dates[dates.length - 1]}` : ''}`
        : '';
    const done = list.filter((t) => t.status === 'completed').length;
    const isNow = currentWeek === w;
    const open = hub ? w === hub.openWeek : w < expandWeeks || isNow;
    const skipped = list.filter((t) => t.status === 'skipped').length;
    const focus = hub && weekFocus(list);
    return (
      <details id={hub ? `plan-week-${w + 1}` : undefined} key={w} className={`${s.week} ${isNow ? s.weekNow : ''}`} open={open}>
        <summary className={s.weekSummary}>
          <span className={s.weekHeading}><span className={s.weekTitle}>
            Week {w + 1}
            {isNow && <span className={s.nowPill}>This week</span>}
          </span>
          {focus && <span className={s.focus}>{focus}</span>}</span>
          <span className={s.weekMeta}>
            {[
              !hub && phase ? PHASE_LABEL[phase.type] : '',
              range,
              list.length === 0
                ? 'no tasks'
                : hub && (done || skipped)
                  ? taskProgress(done, list.length, skipped)
                : done > 0
                  ? `${done} of ${list.length} done`
                  : `${list.length} task${list.length === 1 ? '' : 's'}`,
            ].filter(Boolean).join(' · ')}
          </span>
        </summary>
        <ul className={s.taskList}>
          {list.map((t, i) => {
            const why = planTaskWhy(t.payload);
            const minutes = typeof t.payload.minutes === 'number' ? t.payload.minutes : null;
            const completed = t.status === 'completed';
            return (
              <li key={t.id ?? `${w}-${i}`} className={`${s.task} ${completed ? s.taskDone : ''}`}>
                <span className={`${s.typeTag} ${t.payload.assignment_id ? s.type_assigned : (s[`type_${t.taskType}`] ?? '')}`}>
                  {t.payload.assignment_id && !t.byline ? 'Assigned' : (TYPE_LABEL[t.taskType] ?? 'Task')}
                </span>
                <span className={s.taskBody}>
                  <span className={s.taskTitle}>{planTaskTitle(String(t.taskType), t.payload)}</span>
                  {t.byline && <span className={s.taskWhy}>{t.byline}</span>}
                  {why && <span className={s.taskWhy}>{why}</span>}
                </span>
                <div className={s.taskMeta}>
                  {t.scheduledDate ? formatDate(t.scheduledDate) ?? t.scheduledDate : ''}
                  {minutes != null ? ` · ~${minutes} min` : ''}
                  {completed ? ' · done' : t.status === 'skipped' ? ' · skipped' : ''}
                  {hub && completed && t.reportHref && (
                    <Link href={t.reportHref} prefetch={false} className={s.reportLink}
                      aria-label={`View Report for ${planTaskTitle(String(t.taskType), t.payload)}`}>View Report</Link>
                  )}
                  {startAction && t.id && (t.status ?? 'pending') === 'pending' && (
                    t.resumeHref ? (
                      <Link href={t.resumeHref} className={s.startBtn}>Resume</Link>
                    ) : (
                      <form action={startAction} className={s.startForm}>
                        <input type="hidden" name="task_id" value={t.id} />
                        <button type="submit" className={s.startBtn}>{hub && t.scheduledDate && t.scheduledDate > hub.today ? 'Start early' : 'Start'}</button>
                      </form>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </details>
    );
  });

  // Group by actual membership so older plans with a gap keep every week reachable.
  const groups = new Map<PlanPhase | null, number[]>();
  if (hub && phases.length) {
    weekCards.forEach((_, week) => {
      const phase = phaseFor(phases, week);
      const group = groups.get(phase);
      if (group) group.push(week);
      else groups.set(phase, [week]);
    });
  }
  const panels = Array.from(groups, ([phase, weeks]) => ({
    label: phase ? PHASE_LABEL[phase.type] : 'Other weeks',
    purpose: phase ? PHASE_PURPOSE[phase.type] : 'More scheduled work',
    summary: phase?.summary ?? '',
    weeks,
    content: <div className={s.weeks}>{weeks.map((w) => weekCards[w])}</div>,
  }));

  return (
    <div className={s.root}>
      {!hub && <div className={s.summaryRow}>
        <span className={s.modePill}>{mode ? MODE_LABEL[mode] : 'Study plan'}</span>
        <span className={s.summaryMeta}>
          {totalWeeks} week{totalWeeks === 1 ? '' : 's'} · {tasks.length} tasks ·{' '}
          {goalScore != null ? <>target <strong>{goalScore}</strong> by </> : 'test date '}
          <strong>{formatDate(testDate) ?? testDate}</strong>
        </span>
      </div>}

      {explanation && !rationaleCollapsed && <p className={s.rationale}>{explanation}</p>}

      {!hub && phases.length > 0 && (
        <ol className={s.phaseStrip} aria-label="Plan phases">
          {phases.map((p) => {
            const span = p.endWeek - p.startWeek + 1;
            const isNow =
              currentWeek != null && currentWeek >= p.startWeek && currentWeek <= p.endWeek;
            return (
              <li
                key={`${p.type}-${p.startWeek}`}
                className={`${s.phase} ${s[`phase_${p.type}`]} ${isNow ? s.phaseNow : ''}`}
                aria-current={isNow ? 'step' : undefined}
                style={{ flexGrow: span }}
              >
                <div className={s.phaseLabel}>
                  {PHASE_LABEL[p.type]}
                  <span className={s.phaseWeeks}>
                    {span === 1
                      ? `week ${p.startWeek + 1}`
                      : `weeks ${p.startWeek + 1}–${p.endWeek + 1}`}
                  </span>
                </div>
                {p.summary && <div className={s.phaseSummary}>{p.summary}</div>}
              </li>
            );
          })}
        </ol>
      )}

      {explanation && rationaleCollapsed && (
        <details className={s.why}>
          <summary className={s.whySummary}>Why this plan</summary>
          <p className={s.rationale}>{explanation}</p>
        </details>
      )}

      {hub && phases.length > 0 && weekCards.length > 0 ? (
        <PlanPhaseTabs key={`${currentWeek}-${panels.map((p) => p.weeks.join(',')).join('|')}`}
          panels={panels} currentWeek={currentWeek} />
      ) : <div className={s.weeks}>{weekCards}</div>}
    </div>
  );
}
