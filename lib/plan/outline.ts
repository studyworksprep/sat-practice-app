import { planTaskTitle } from './task-labels.ts';
import type { TodayTaskRow, TodayView } from './today.ts';

export function weekFocus(tasks: { taskType: string; payload: Record<string, unknown> }[]) {
  // A full test or a lesson communicates the week's focus better than a recurring review.
  const priority: Record<string, number> = { full_test: 0, lesson: 1, drill: 2, practice_set: 3 };
  const ordered = [...tasks].sort((a, b) => (priority[a.taskType] ?? 4) - (priority[b.taskType] ?? 4));
  const topics = ordered.map((t) => {
    const title = planTaskTitle(t.taskType, t.payload);
    return t.payload.assignment_id ? title : title.replace(/^(?:Foundation|Lesson|Drill|Practice):\s*/i, '');
  });
  return [...new Set(topics)].slice(0, 2).join(' · ');
}

export function planPosition(view: TodayView, tasks: TodayTaskRow[]) {
  const due = [...view.due, ...view.remainingDue];
  const task = due.find((t) => t.resumeHref) ?? due[0]
    ?? tasks.find((t) => t.status === 'pending' && t.resumeHref) ?? view.upNext;
  const week = view.week;
  const weekClosed = !!week && week.count > 0 && week.done + week.skipped === week.count;
  const openWeek = week && week.count && !weekClosed ? week.index : task?.weekIndex;
  return { task, openWeek, weekClosed };
}

export function taskProgress(done: number, total: number, skipped: number) {
  return `${done} of ${total} completed${skipped ? ` · ${skipped} skipped` : ''}`;
}
