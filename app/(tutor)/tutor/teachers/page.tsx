// Manager → Teachers. How each teacher's students did over the last
// 7 days, as signals for a check-in rather than a ranking:
//
//   PageHeader (+ Assign training)
//   Four tiles — teachers, students practiced, plans behind, overdue
//     assignments.
//   Teachers table (TeamTable, sortable) — students, practiced · 7d,
//     accuracy · 7d, plans behind, overdue work, the §5.2 4-week
//     signals (mastery Δ, assignments done) and the teacher's own
//     training. Flagged rows are highlighted.
//   Worth a check-in — one plain sentence per flagged teacher
//     (lib/tutor/team-checkin) with a link to their roster.
//
// Role gated to manager + admin. RLS scopes every read: the manager
// sees only their own team's teachers, students and assignments.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadTeamEffectiveness } from '@/lib/tutor/load-team-effectiveness';
import { isLateAssignment, type AssignmentRow } from '@/lib/tutor/nav-badges';
import { checkInNote, needsCheckIn } from '@/lib/tutor/team-checkin';
import { PageHeader } from '@/lib/ui/PageHeader';
import { TeamTable, type TeamTableRow } from './TeamTable';
import s from './Teachers.module.css';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

export default async function TutorTeachersPage() {
  const { user, profile, supabase } = await requireUser();

  // Manager-only (admins included).
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (profile.role === 'teacher') redirect('/tutor/dashboard');
  if (!['manager', 'admin'].includes(profile.role)) redirect('/');

  const { data: teacherJunctions } = await supabase
    .from('manager_teacher_assignments')
    .select('teacher_id')
    .eq('manager_id', user.id);
  const teacherIds = [...new Set((teacherJunctions ?? []).map((r) => r.teacher_id).filter(Boolean))] as string[];

  const header = (
    <PageHeader
      eyebrow="Team · Teachers"
      title="Your team"
      description="How each teacher's students did over the last 7 days. These are signals for a check-in, not a ranking."
      actions={teacherIds.length > 0
        ? <Link href="/tutor/assignments/new?target=trainees" className={s.headerBtn}>Assign training</Link>
        : undefined}
    />
  );

  if (teacherIds.length === 0) {
    return (
      <main className={s.container}>
        {header}
        <div className={s.emptyCard}>
          <div className={s.emptyTitle}>No teachers assigned to you yet.</div>
          <div className={s.emptyBody}>
            An admin assigns tutors to managers; once that happens they&apos;ll show up here with their rosters.
          </div>
        </div>
      </main>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- one request-time snapshot
  const nowMs = Date.now();
  const since7 = new Date(nowMs - 7 * DAY_MS).toISOString();
  const [{ data: teacherProfiles }, { data: tsRows }, { data: teacherAssignments }, { data: trainingOpen }, { data: trainingSessions }] =
    await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, email').in('id', teacherIds),
      supabase.from('teacher_student_assignments').select('teacher_id, student_id').in('teacher_id', teacherIds),
      // Each teacher's open, dated work, for the overdue count.
      supabase.from('assignments_v2')
        .select('teacher_id, due_date, archived_at, assignment_students_v2(completed_at)')
        .in('teacher_id', teacherIds)
        .is('deleted_at', null).is('archived_at', null).not('due_date', 'is', null),
      // Own training: open work assigned to the teacher as a trainee…
      supabase.from('assignment_students_v2')
        .select('student_id, completed_at, assignment:assignments_v2!inner(archived_at, deleted_at)')
        .in('student_id', teacherIds).is('completed_at', null)
        .is('assignment.archived_at', null).is('assignment.deleted_at', null),
      // …and their own practice in the last 7 days.
      supabase.from('practice_sessions')
        .select('user_id')
        .in('user_id', teacherIds).gte('last_activity_at', since7),
    ]);

  const studentsByTeacher = new Map<string, string[]>(teacherIds.map((id) => [id, []]));
  for (const r of tsRows ?? []) {
    if (!studentsByTeacher.has(r.teacher_id)) studentsByTeacher.set(r.teacher_id, []);
    studentsByTeacher.get(r.teacher_id)!.push(r.student_id);
  }
  const allStudentIds = [...new Set((tsRows ?? []).map((r) => r.student_id))];

  const [{ data: studentRows }, effectByTeacher, weekly] = await Promise.all([
    allStudentIds.length > 0
      ? supabase.from('student_practice_stats')
          .select('user_id, first_name, last_name, email, week_attempts, last_activity_at')
          .in('user_id', allStudentIds)
      : Promise.resolve({ data: [] as never[] }),
    loadTeamEffectiveness(supabase, studentsByTeacher),
    // 7-day accuracy per roster (SAT + ACT attempts), one call per
    // teacher — a manager's team is a handful of rosters.
    Promise.all(teacherIds.map(async (id) => {
      const roster = studentsByTeacher.get(id) ?? [];
      if (roster.length === 0) return [id, null] as const;
      const { data } = await supabase.rpc('get_roster_weekly_trend', { p_roster: roster, p_num_weeks: 1 });
      const w = (data ?? [])[0];
      return [id, w ? { attempts: Number(w.attempts ?? 0), accuracy: w.accuracy == null ? null : Math.round(Number(w.accuracy) * 100) } : null] as const;
    })),
  ]);
  const weeklyByTeacher = new Map(weekly);
  const studentById = new Map((studentRows ?? []).map((r) => [r.user_id as string, r]));

  const overdueByTeacher = new Map<string, number>();
  for (const a of (teacherAssignments ?? []) as Array<AssignmentRow & { teacher_id: string }>) {
    if (isLateAssignment(a, nowMs)) overdueByTeacher.set(a.teacher_id, (overdueByTeacher.get(a.teacher_id) ?? 0) + 1);
  }
  const openTraining = new Map<string, number>();
  for (const r of trainingOpen ?? []) openTraining.set(r.student_id, (openTraining.get(r.student_id) ?? 0) + 1);
  const trainingSessionCount = new Map<string, number>();
  for (const r of trainingSessions ?? []) trainingSessionCount.set(r.user_id, (trainingSessionCount.get(r.user_id) ?? 0) + 1);

  const rows: TeamTableRow[] = (teacherProfiles ?? []).map((t) => {
    const roster = studentsByTeacher.get(t.id) ?? [];
    let practicedThisWeek = 0;
    let lastActivityAt: string | null = null;
    let idleStudent: TeamTableRow['idleStudent'] = null;
    for (const sid of roster) {
      const st = studentById.get(sid);
      if (!st) continue;
      if (Number(st.week_attempts ?? 0) > 0) practicedThisWeek += 1;
      const last = st.last_activity_at as string | null;
      if (last && (!lastActivityAt || last > lastActivityAt)) lastActivityAt = last;
      if (last) {
        const days = Math.floor((nowMs - Date.parse(last)) / DAY_MS);
        if (!idleStudent || days > idleStudent.days) {
          idleStudent = { name: [st.first_name, st.last_name].filter(Boolean).join(' ') || (st.email as string) || 'A student', days };
        }
      }
    }
    const effect = effectByTeacher.get(t.id) ?? null;
    const week = weeklyByTeacher.get(t.id) ?? null;
    const base = {
      id: t.id,
      name: [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || 'Teacher',
      email: t.email,
      students: roster.length,
      practicedThisWeek,
      plansBehind: effect?.adherence.behind ?? 0,
      overdue: overdueByTeacher.get(t.id) ?? 0,
      idleStudent,
    };
    return {
      ...base,
      accuracy7d: week?.accuracy ?? null,
      attempts7d: week?.attempts ?? 0,
      lastActivityAt,
      masteryDelta: effect?.movement?.avgMasteryDelta ?? null,
      completionRate: effect?.completion.rate ?? null,
      training: { open: openTraining.get(t.id) ?? 0, sessions: trainingSessionCount.get(t.id) ?? 0 },
      adherenceDetail: effect ? adherenceDetail(effect.adherence) : null,
      flagged: needsCheckIn(base),
      note: checkInNote(base),
    };
  });

  const totals = {
    teachers: rows.length,
    students: allStudentIds.length,
    practiced: rows.reduce((n, r) => n + r.practicedThisWeek, 0),
    behind: rows.reduce((n, r) => n + r.plansBehind, 0),
    overdue: rows.reduce((n, r) => n + r.overdue, 0),
  };
  const flagged = rows.filter((r) => r.flagged).sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));

  return (
    <main className={s.container}>
      {header}

      <section aria-label="Team this week" className={s.statsStrip}>
        <Tile label="Teachers" value={totals.teachers} />
        <Tile label="Students practiced" value={totals.practiced} of={totals.students} />
        <Tile label="Plans behind" value={totals.behind} tone={totals.behind > 0 ? 'warn' : undefined} />
        <Tile label="Overdue assignments" value={totals.overdue} tone={totals.overdue > 0 ? 'alert' : undefined} />
      </section>

      <TeamTable rows={rows} />

      <section className={s.checkCard} aria-labelledby="checkin-heading">
        <h2 id="checkin-heading" className={s.checkTitle}>Worth a check-in</h2>
        {flagged.length === 0 ? (
          <p className={s.checkEmpty}>
            Nobody stands out this week: every roster is mostly practicing and no one has more than a handful of overdue assignments.
          </p>
        ) : (
          <ul className={s.checkList}>
            {flagged.map((r) => (
              <li key={r.id} className={s.checkRow}>
                <p className={s.checkText}><strong>{r.name}</strong> — {r.note}</p>
                <Link href={`/tutor/teachers/${r.id}`} className={s.checkBtn}>Open their roster</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function adherenceDetail(a: { onTrack: number; ahead: number; notStarted: number; noPlan: number }): string | null {
  const parts = [
    a.onTrack > 0 ? `${a.onTrack} on track` : null,
    a.ahead > 0 ? `${a.ahead} ahead` : null,
    a.notStarted > 0 ? `${a.notStarted} not started` : null,
    a.noPlan > 0 ? `${a.noPlan} no plan` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function Tile({ label, value, of, tone }: { label: string; value: number; of?: number; tone?: 'warn' | 'alert' }) {
  return (
    <div className={s.statTile}>
      <div className={s.statLabel}>{label}</div>
      <div className={[s.statValue, tone === 'warn' ? s.statWarn : tone === 'alert' ? s.statAlert : null].filter(Boolean).join(' ')}>
        {value}
        {of != null && <span className={s.statOf}> of {of}</span>}
      </div>
    </div>
  );
}
