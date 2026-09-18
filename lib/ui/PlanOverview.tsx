// Plan overview — the one rendering of a whole plan, shared by the
// wizard's preview step (docs/student-onboarding-and-plan-redesign-
// 2026-09.md §3.2 step 6) and, in Phase 2, the /plan hub. Server
// Component: rationale, phase strip, and the week-by-week task list
// with the first `expandWeeks` weeks open and the rest behind native
// <details> — no client state anywhere on the surface.

import { formatDate } from '@/lib/formatters';
import { planTaskTitle, planTaskWhy } from '@/lib/plan/task-labels';
import type { PlanMode, PlanPhase, PlanPhaseType, PlanTaskType } from '@/lib/plan/generate-plan';
import s from './PlanOverview.module.css';

export interface OverviewTask {
  id?: string;
  weekIndex: number;
  scheduledDate: string | null;
  taskType: PlanTaskType | string;
  payload: Record<string, unknown>;
  status?: 'pending' | 'completed' | 'skipped';
}

export interface PlanOverviewProps {
  goalScore: number;
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
}

export const MODE_LABEL: Record<PlanMode, string> = {
  foundations: 'Foundations plan',
  targeted: 'Targeted plan',
  self_directed: 'Your own plan',
};

const PHASE_LABEL: Record<PlanPhaseType, string> = {
  coverage: 'Coverage',
  focus: 'Focus',
  rehearsal: 'Rehearsal',
  targets: 'Your targets',
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
  goalScore,
  testDate,
  mode,
  rationale,
  phases,
  tasks,
  expandWeeks = 2,
  currentWeek = null,
  rationaleCollapsed = false,
}: PlanOverviewProps) {
  const weekCount = tasks.reduce((m, t) => Math.max(m, t.weekIndex + 1), 0);
  const totalWeeks = Math.max(weekCount, ...phases.map((p) => p.endWeek + 1), 0);
  const byWeek = new Map<number, OverviewTask[]>();
  for (const t of tasks) {
    if (!byWeek.has(t.weekIndex)) byWeek.set(t.weekIndex, []);
    byWeek.get(t.weekIndex)!.push(t);
  }
  for (const list of byWeek.values()) {
    list.sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
  }

  return (
    <div className={s.root}>
      <div className={s.summaryRow}>
        <span className={s.modePill}>{mode ? MODE_LABEL[mode] : 'Study plan'}</span>
        <span className={s.summaryMeta}>
          {totalWeeks} week{totalWeeks === 1 ? '' : 's'} · {tasks.length} tasks · target{' '}
          <strong>{goalScore}</strong> by <strong>{formatDate(testDate) ?? testDate}</strong>
        </span>
      </div>

      {rationale && !rationaleCollapsed && <p className={s.rationale}>{rationale}</p>}

      {phases.length > 0 && (
        <ol className={s.phaseStrip} aria-label="Plan phases">
          {phases.map((p) => {
            const span = p.endWeek - p.startWeek + 1;
            const isNow =
              currentWeek != null && currentWeek >= p.startWeek && currentWeek <= p.endWeek;
            return (
              <li
                key={`${p.type}-${p.startWeek}`}
                className={`${s.phase} ${s[`phase_${p.type}`]} ${isNow ? s.phaseNow : ''}`}
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

      {rationale && rationaleCollapsed && (
        <details className={s.why}>
          <summary className={s.whySummary}>Why this plan</summary>
          <p className={s.rationale}>{rationale}</p>
        </details>
      )}

      <div className={s.weeks}>
        {Array.from({ length: totalWeeks }, (_, w) => {
          const list = byWeek.get(w) ?? [];
          const phase = phaseFor(phases, w);
          const dates = list.map((t) => t.scheduledDate).filter((d): d is string => Boolean(d)).sort();
          const range =
            dates.length > 0
              ? `${formatDate(dates[0]) ?? dates[0]}${dates.length > 1 ? ` – ${formatDate(dates[dates.length - 1]) ?? dates[dates.length - 1]}` : ''}`
              : '';
          const done = list.filter((t) => t.status === 'completed').length;
          const isNow = currentWeek === w;
          const open = w < expandWeeks || isNow;
          return (
            <details key={w} className={`${s.week} ${isNow ? s.weekNow : ''}`} open={open}>
              <summary className={s.weekSummary}>
                <span className={s.weekTitle}>
                  Week {w + 1}
                  {isNow && <span className={s.nowPill}>now</span>}
                </span>
                <span className={s.weekMeta}>
                  {phase ? `${PHASE_LABEL[phase.type]} · ` : ''}
                  {range}
                  {list.length > 0 && (
                    <>
                      {' · '}
                      {done > 0 ? `${done} of ${list.length} done` : `${list.length} task${list.length === 1 ? '' : 's'}`}
                    </>
                  )}
                </span>
              </summary>
              <ul className={s.taskList}>
                {list.map((t, i) => {
                  const why = planTaskWhy(t.payload);
                  const minutes = typeof t.payload.minutes === 'number' ? t.payload.minutes : null;
                  const completed = t.status === 'completed';
                  return (
                    <li key={t.id ?? `${w}-${i}`} className={`${s.task} ${completed ? s.taskDone : ''}`}>
                      <span className={`${s.typeTag} ${s[`type_${t.taskType}`] ?? ''}`}>
                        {TYPE_LABEL[t.taskType] ?? 'Task'}
                      </span>
                      <span className={s.taskBody}>
                        <span className={s.taskTitle}>{planTaskTitle(String(t.taskType), t.payload)}</span>
                        {why && <span className={s.taskWhy}>{why}</span>}
                      </span>
                      <span className={s.taskMeta}>
                        {t.scheduledDate ? formatDate(t.scheduledDate) ?? t.scheduledDate : ''}
                        {minutes != null ? ` · ~${minutes} min` : ''}
                        {completed ? ' · done' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
