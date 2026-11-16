import { daysBetween } from '@/lib/plan/generate-plan';
import { editorConfig, planStartDate, record, taskSkill, taskUnitKey } from '@/lib/plan/customization';
import { planTaskTitle, planTaskWhy } from '@/lib/plan/task-labels';
import type { PlanRow, PlanTaskRow } from '@/lib/plan/load-plan-state';
import { AddTaskForm, RegenerateWeekButton, TaskControls, UnitControls, type UnitOption } from './PlanEditor';
import { addTaskAction, moveTaskAction, swapSkillAction, removeTaskAction, regenerateWeekAction, moveUnitAction, removeUnitAction } from './actions';
import s from './StudyPlan.module.css';

const LABELS: Record<string, string> = { lesson: 'Lesson', drill: 'Drill', review: 'Review', practice_set: 'Practice set', full_test: 'Full test', vocab: 'Vocabulary', flashcards: 'Flashcards' };

export function PlanSchedule({ plan, tasks, studentId, units }: { plan: PlanRow; tasks: PlanTaskRow[]; studentId: string; units: UnitOption[] }) {
  const anchor = planStartDate(plan.config, plan.created_at, tasks.map((t) => t.scheduled_date));
  const weekCount = Math.min(52, Math.max(1,
    plan.test_date ? Math.ceil(daysBetween(anchor, plan.test_date) / 7) : 1,
    ...tasks.map((t) => t.week_index + 1)));
  const manual = editorConfig(plan.config).manual;
  const titles = new Map(units.map((u) => [u.skillCode, u.title]));
  const unitTasks = new Map<string, PlanTaskRow[]>();
  for (const t of tasks) {
    const key = taskUnitKey(t.task_type, t.payload);
    if (key) unitTasks.set(key, [...(unitTasks.get(key) ?? []), t]);
  }
  const renderTask = (t: PlanTaskRow) => (
    <li key={t.id} data-task-id={t.id} className={`${s.task} ${t.status === 'completed' ? s.taskDone : t.status === 'skipped' ? s.taskSkipped : ''}`}>
      <span className={`${s.badge} ${s[`badge_${t.task_type}`] ?? ''}`}>{LABELS[t.task_type] ?? t.task_type}</span>
      <div className={s.taskBody}>
        <div className={s.taskTitle}>
          {planTaskTitle(t.task_type, t.payload)}
          {t.source !== 'generated' ? <span className={s.sourceTag}>kept</span> : null}
          {t.status !== 'pending' ? <span className={s.doneTag}>{t.status === 'completed' ? 'done' : 'skipped'}</span> : null}
        </div>
        {planTaskWhy(t.payload) ? <div className={s.taskWhy}>{planTaskWhy(t.payload)}</div> : null}
      </div>
      {t.status === 'pending' ? <TaskControls taskId={t.id} studentId={studentId} weekIndex={t.week_index} weekCount={weekCount}
        canSwap={['drill', 'lesson', 'practice_set'].includes(t.task_type)} units={units}
        moveAction={moveTaskAction} swapAction={swapSkillAction} removeAction={removeTaskAction} /> : null}
      {t.scheduled_date ? <time className={s.taskDate}>{t.scheduled_date}</time> : null}
    </li>
  );
  return (
    <div>
      <p className={s.cardSub}>{manual
        ? 'You build this plan. Add units or individual tasks to any week; automatic rebuilds leave your schedule intact.'
        : 'Move or remove whole units, or edit their tasks individually. Tutor changes are kept during regeneration.'}</p>
      <AddTaskForm planId={plan.id} studentId={studentId} weekCount={weekCount} units={units} action={addTaskAction} />
      <ol className={s.weeks}>
        {Array.from({ length: weekCount }, (_, w) => {
          const weekTasks = tasks.filter((t) => t.week_index === w);
          const groups = new Map<string, PlanTaskRow[]>();
          for (const t of weekTasks) {
            const key = taskUnitKey(t.task_type, t.payload) ?? `task:${t.id}`;
            groups.set(key, [...(groups.get(key) ?? []), t]);
          }
          return (
            <li key={w} className={s.week}>
              <details open={w < 2 || weekTasks.length === 0 && manual && w === 0}>
                <summary className={s.weekSummary}>Week {w + 1}<span>{weekTasks.length} tasks · {weekTasks.filter((t) => t.task_type === 'lesson').length} lessons · {weekTasks.filter((t) => t.task_type === 'drill' || t.task_type === 'practice_set').length} practice sets</span></summary>
                {!manual ? <div className={s.weekHead}><RegenerateWeekButton planId={plan.id} studentId={studentId} weekIndex={w} action={regenerateWeekAction} /></div> : null}
                {weekTasks.length === 0 ? <p className={s.cardSub}>No work scheduled. Add a unit or task above.</p> : null}
                <ul className={s.tasks}>
                  {[...groups].map(([key, group]) => {
                    const all = unitTasks.get(key);
                    if (!all) return renderTask(group[0]);
                    const open = all.filter((t) => t.status === 'pending');
                    const firstOpenWeek = Math.min(...open.map((t) => t.week_index));
                    const payload = record(group[0].payload);
                    const title = typeof payload.plan_unit_title === 'string' ? payload.plan_unit_title : titles.get(taskSkill(payload) ?? '') ?? 'Curriculum unit';
                    return <li key={key} data-unit-key={key} className={s.unitCard}>
                      <div className={s.unitHead}>
                        <div><h3 className={s.unitTitle}>{title}</h3><span className={s.cardSub}>{group.length} tasks this week · {open.length} open in this unit</span></div>
                        {w === firstOpenWeek ? <UnitControls planId={plan.id} studentId={studentId} unitKey={key} weekIndex={firstOpenWeek}
                          weekCount={weekCount} openCount={open.length} moveAction={moveUnitAction} removeAction={removeUnitAction} /> : null}
                      </div>
                      <ul className={s.tasks}>{group.map(renderTask)}</ul>
                    </li>;
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
