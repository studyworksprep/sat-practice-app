import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { satisfiesActAssignmentScope } from '../practice/act-assignment-scope.ts';
import { parsePlanTaskId } from './student-task.ts';

export function recordedTaskReport(type: string, status: string | null, completedVia: string | null) {
  if (type === 'lesson' && status === 'completed' && completedVia?.startsWith('lesson:')) {
    const lessonId = parsePlanTaskId(completedVia.slice(7));
    return lessonId ? `/learn/${lessonId}/report` : undefined;
  }
  const id = parsePlanTaskId(completedVia);
  if (status !== 'completed' || !id) return undefined;
  if (type === 'full_test') return `/practice/test/attempt/${id}/results`;
  if (['drill', 'practice_set', 'review'].includes(type)) return `/practice/review/${id}`;
  return undefined;
}

interface Assignment {
  id: string;
  assignment_type: string;
  test_type: string;
  practice_test_id: string | null;
  lesson_id: string | null;
  act_source_test: string | null;
  created_at: string;
  sections: unknown;
}

// Mirrored assignments record an assignment ID instead of a report ID. Read
// only report metadata, in batches limited to the student's completed assignments.
export async function assignedTaskReports(db: TypedSupabaseClient, student: string, assignments: Assignment[]) {
  const sets = assignments.filter(a => ['questions', 'lesson_pack'].includes(a.assignment_type));
  const tests = assignments.filter(a => a.assignment_type === 'practice_test');
  const sat = tests.flatMap(a => a.test_type === 'sat' && a.practice_test_id ? [a.practice_test_id] : []);
  const act = tests.flatMap(a => a.test_type === 'act' && a.act_source_test ? [a.act_source_test] : []);
  const [{ data: sessions }, { data: satAttempts }, { data: actAttempts }] = await Promise.all([
    sets.length ? db.from('practice_sessions').select('id, assignment_id:filter_criteria->>assignment_id')
      .eq('user_id', student).eq('status', 'completed').in('filter_criteria->>assignment_id', sets.map(a => a.id))
      .order('created_at', { ascending: false }) : { data: [] },
    sat.length ? db.from('practice_test_attempts_v2').select('id, practice_test_id, finished_at')
      .eq('user_id', student).eq('status', 'completed').in('practice_test_id', sat)
      .order('finished_at', { ascending: false, nullsFirst: false }) : { data: [] },
    act.length ? db.from('act_practice_test_attempts').select('id, source_test, started_at, sections, format')
      .eq('user_id', student).eq('status', 'completed').in('source_test', act)
      .order('finished_at', { ascending: false, nullsFirst: false }) : { data: [] },
  ]);
  const reports = new Map<string, string>();
  for (const a of assignments) {
    if (a.assignment_type === 'lesson' && a.lesson_id) reports.set(a.id, `/learn/${a.lesson_id}/report`);
  }
  for (const session of sessions ?? []) {
    if (typeof session.assignment_id === 'string' && !reports.has(session.assignment_id))
      reports.set(session.assignment_id, `/practice/review/${session.id}`);
  }
  for (const a of tests) {
    if (a.test_type === 'act') {
      const attempt = actAttempts?.find(t => t.source_test === a.act_source_test &&
        Date.parse(t.started_at) >= Date.parse(a.created_at) && satisfiesActAssignmentScope(t.sections, t.format, a.sections));
      if (attempt) reports.set(a.id, `/practice/test/act/attempt/${attempt.id}/results`);
    } else {
      const attempt = satAttempts?.find(t => t.practice_test_id === a.practice_test_id &&
        t.finished_at && Date.parse(t.finished_at) >= Date.parse(a.created_at));
      if (attempt) reports.set(a.id, `/practice/test/attempt/${attempt.id}/results`);
    }
  }
  return reports;
}
