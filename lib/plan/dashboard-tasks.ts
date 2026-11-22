import { buildTodayView, type TodayTaskRow } from './today.ts';

type TutorCard = {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  tutor_name: string | null;
};

export function dashboardTutorNames(cards: TutorCard[]) {
  const tutors = cards.flatMap((card) => {
    const full = [card.first_name?.trim(), card.last_name?.trim()].filter(Boolean).join(' ');
    const display = card.tutor_name?.trim() || full;
    if (!card.id || !display) return [];
    const short = display === full ? card.first_name?.trim() || display : display;
    return [{ id: card.id, display, short, full }];
  });
  return new Map(
    tutors.map((tutor) => {
      const duplicate = tutors.some(
        (other) => other.id !== tutor.id && other.short.toLowerCase() === tutor.short.toLowerCase(),
      );
      return [
        tutor.id,
        { display: tutor.display, byline: duplicate ? tutor.full || tutor.display : tutor.short },
      ];
    }),
  );
}

type Assignment = {
  id: string;
  teacher_id: string;
  title: string;
  due_date: string | null;
  student_completed_at: string | null;
  resumeHref?: string;
};
export type DashboardTask = TodayTaskRow & {
  byline?: string;
  assignmentHref?: string;
  outsidePlan?: boolean;
};

export function dashboardTasks(
  plan: DashboardTask[],
  assignments: Assignment[],
  tutors: ReturnType<typeof dashboardTutorNames>,
  today: string,
) {
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const represented = new Set<string>();
  const describe = (teacherId?: string) => {
    const name = teacherId && tutors.get(teacherId)?.byline;
    return name ? `Assigned by ${name}` : 'Tutor assignment';
  };
  const tasks = plan.map((task) => {
    const id = task.payload.assignment_id;
    if (typeof id !== 'string') return task;
    const assignment = byId.get(id);
    if (task.status === 'pending') represented.add(id);
    return {
      ...task,
      byline: describe(assignment?.teacher_id),
      resumeHref: assignment?.resumeHref ?? task.resumeHref,
      assignmentHref: `/assignments/${id}`,
    };
  });
  for (const a of assignments) {
    if (a.student_completed_at || represented.has(a.id)) continue;
    tasks.push({
      id: `assignment-${a.id}`,
      weekIndex: 0,
      scheduledDate: a.due_date?.slice(0, 10) ?? null,
      taskType: 'drill',
      payload: { title: a.title, assignment_id: a.id },
      source: 'assignment',
      status: 'pending',
      completedAt: null,
      outsidePlan: true,
      resumeHref: a.resumeHref,
      assignmentHref: `/assignments/${a.id}`,
      byline: describe(a.teacher_id),
    });
  }
  // Calendar progress is calculated separately, from the active plan alone.
  const view = buildTodayView(tasks, today, null);
  const due = [...view.due, ...view.remainingDue] as DashboardTask[];
  const ahead = view.ahead as DashboardTask[];
  const urgentAssignment = due.find((t) => t.assignmentHref && t.scheduledDate && t.scheduledDate <= today);
  return {
    due,
    ahead,
    done: view.doneToday as DashboardTask[],
    hero: urgentAssignment ?? due[0] ?? ahead[0] ?? null,
  };
}
