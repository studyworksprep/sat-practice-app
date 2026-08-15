// Manager → Teachers tab. Mirrors the tutor's roster page one
// layer up: a manager sees the teachers under them, with each
// teacher's roster size + cohort stats at a glance, and a click
// drills into the per-teacher detail view.
//
// Role gated to manager + admin via the tutor layout. RLS does
// the heavy lifting — the manager_teacher_assignments table is
// scoped via can_view, and the student_practice_stats view is
// can_view-gated on the underlying tables, so a manager only
// reads data for their own team.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatRelativeShort } from '@/lib/formatters';
import { loadTeamEffectiveness } from '@/lib/tutor/load-team-effectiveness';
import s from './Teachers.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorTeachersPage() {
  const { user, profile, supabase } = await requireUser();

  // Page is manager-only (admins included). Teachers without
  // manager scope land back on their dashboard.
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (profile.role === 'teacher') redirect('/tutor/dashboard');
  if (!['manager', 'admin'].includes(profile.role)) redirect('/');

  // 1) Teachers under this manager.
  const { data: teacherJunctions } = await supabase
    .from('manager_teacher_assignments')
    .select('teacher_id, created_at')
    .eq('manager_id', user.id);

  const teacherIds = Array.from(
    new Set((teacherJunctions ?? []).map((r) => r.teacher_id).filter(Boolean)),
  );

  // 2) Teacher profile rows + every (teacher → student) edge so
  //    we can join roster sizes per teacher. Both queries run in
  //    parallel along with the cohort stats fetch below. Reading
  //    profiles directly (rather than profile_cards) because we
  //    need email for the teacher header — profile_cards
  //    deliberately doesn't expose email. The profiles_select
  //    policy uses can_view(id), which permits the manager →
  //    teacher direct path that brought us here.
  const [
    { data: teacherProfiles },
    { data: tsRows },
  ] = teacherIds.length > 0
    ? await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, email, role')
          .in('id', teacherIds),
        supabase
          .from('teacher_student_assignments')
          .select('teacher_id, student_id')
          .in('teacher_id', teacherIds),
      ])
    : [{ data: [] }, { data: [] }];

  // 3) Student-side stats for everyone in any of the teachers'
  //    rosters, in parallel with the §5.2 effectiveness rollups
  //    (mastery movement RPC + assignment completion + plan
  //    adherence). RLS filters; we just feed the union of ids.
  const allStudentIds = Array.from(
    new Set((tsRows ?? []).map((r) => r.student_id).filter(Boolean)),
  );

  // Every teacher gets a roster entry (empty array when no edges)
  // so the rollup map covers the whole team, not just tutors with
  // current students.
  const studentsByTeacher = new Map(teacherIds.map((id) => [id, []]));
  for (const r of tsRows ?? []) {
    if (!studentsByTeacher.has(r.teacher_id)) studentsByTeacher.set(r.teacher_id, []);
    studentsByTeacher.get(r.teacher_id).push(r.student_id);
  }

  const [{ data: studentRows }, effectByTeacher] = await Promise.all([
    allStudentIds.length > 0
      ? supabase
          .from('student_practice_stats')
          .select('user_id, first_name, last_name, total_attempts, correct_attempts, week_attempts, last_activity_at')
          .in('user_id', allStudentIds)
      : Promise.resolve({ data: [] }),
    loadTeamEffectiveness(supabase, studentsByTeacher),
  ]);
  const studentById = new Map(
    (studentRows ?? []).map((r) => [r.user_id, r]),
  );

  const teachers = (teacherProfiles ?? []).map((t) => {
    const sids = studentsByTeacher.get(t.id) ?? [];
    let total = 0;
    let correct = 0;
    let week = 0;
    let activeThisWeek = 0;
    let lastActivityAt = null;
    for (const sid of sids) {
      const s = studentById.get(sid);
      if (!s) continue;
      const sTotal = Number(s.total_attempts ?? 0);
      const sCorrect = Number(s.correct_attempts ?? 0);
      const sWeek = Number(s.week_attempts ?? 0);
      total += sTotal;
      correct += sCorrect;
      week += sWeek;
      if (sWeek > 0) activeThisWeek += 1;
      if (s.last_activity_at && (!lastActivityAt || s.last_activity_at > lastActivityAt)) {
        lastActivityAt = s.last_activity_at;
      }
    }
    const name = [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || 'Teacher';
    return {
      id: t.id,
      name,
      email: t.email,
      students: sids.length,
      activeThisWeek,
      totalAttempts: total,
      weekAttempts: week,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
      lastActivityAt,
      effect: effectByTeacher.get(t.id) ?? null,
    };
  });

  // Sort: most-recently-active first; teachers with no roster
  // sink to the bottom.
  teachers.sort((a, b) => {
    if (!a.lastActivityAt && !b.lastActivityAt) return a.name.localeCompare(b.name);
    if (!a.lastActivityAt) return 1;
    if (!b.lastActivityAt) return -1;
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  });

  // Team-wide stats strip.
  const team = {
    teacherCount: teachers.length,
    studentCount: allStudentIds.length,
    activeStudentsThisWeek: teachers.reduce((acc, t) => acc + t.activeThisWeek, 0),
    weekAttempts: teachers.reduce((acc, t) => acc + t.weekAttempts, 0),
  };

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Manager · Team</div>
        <h1 className={s.h1}>Your teachers</h1>
        <p className={s.sub}>
          The tutors on your team and how their rosters are doing
          this week. Click a teacher for their full roster + the
          assignments they&apos;ve sent.
        </p>
      </header>

      {team.teacherCount === 0 ? (
        <div className={s.emptyCard}>
          <div className={s.emptyTitle}>No teachers assigned to you yet.</div>
          <div className={s.emptyBody}>
            An admin assigns tutors to managers; once that happens
            they&apos;ll show up here with their rosters.
          </div>
        </div>
      ) : (
        <>
          <div className={s.statsStrip}>
            <StatTile
              label="Teachers"
              value={team.teacherCount}
              sub={team.teacherCount === 1 ? 'On your team' : 'Reporting to you'}
            />
            <StatTile
              label="Students"
              value={team.studentCount}
              sub={`Across ${team.teacherCount} teacher${team.teacherCount === 1 ? '' : 's'}`}
            />
            <StatTile
              label="Active this week"
              value={team.activeStudentsThisWeek}
              sub={
                team.studentCount === 0
                  ? '—'
                  : `${Math.round((team.activeStudentsThisWeek / team.studentCount) * 100)}% of roster`
              }
              tone={team.activeStudentsThisWeek > 0 ? 'good' : 'neutral'}
            />
            <StatTile
              label="Attempts · 7d"
              value={team.weekAttempts.toLocaleString()}
              sub="Across the whole team"
            />
          </div>

          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Teachers</h2>
              <span className={s.sectionCount}>
                Sorted by most recent student activity
              </span>
            </div>
            <p className={s.sectionNote}>
              Mastery movement, assignment completion, and plan
              adherence are 4-week signals, not rankings — rosters
              are small and start from different levels.
            </p>
            <ul className={s.cardList}>
              {teachers.map((t) => (
                <li key={t.id}>
                  <TeacherCard teacher={t} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function TeacherCard({ teacher }) {
  return (
    <Link href={`/tutor/teachers/${teacher.id}`} className={s.teacherCard}>
      <div className={s.teacherTop}>
        <div className={s.teacherAvatar} aria-hidden="true">
          {initialsOf(teacher.name)}
        </div>
        <div className={s.teacherMain}>
          <div className={s.teacherName}>{teacher.name}</div>
          {teacher.email && (
            <div className={s.teacherEmail}>{teacher.email}</div>
          )}
        </div>
        <div className={s.teacherChevron} aria-hidden="true">→</div>
      </div>
      <div className={s.teacherMetrics}>
        <Metric label="Students" value={teacher.students} />
        <Metric
          label="Active · 7d"
          value={teacher.activeThisWeek}
          tone={teacher.activeThisWeek > 0 ? 'good' : null}
        />
        <Metric
          label="Attempts · 7d"
          value={teacher.weekAttempts.toLocaleString()}
        />
        <Metric
          label="Accuracy"
          value={teacher.accuracy == null ? '—' : `${teacher.accuracy}%`}
          tone={accuracyTone(teacher.accuracy)}
        />
        <span className={s.teacherLast}>
          {formatRelativeShort(teacher.lastActivityAt) ?? 'No activity'}
        </span>
      </div>
      <EffectivenessRow effect={teacher.effect} />
    </Link>
  );
}

// §5.2 tutor-effectiveness signals: mastery movement, assignment
// completion, plan adherence — all over the 4-week window.
function EffectivenessRow({ effect }) {
  const movement = effect?.movement ?? null;
  const completion = effect?.completion ?? null;
  const adherence = effect?.adherence ?? null;

  const deltaValue = movement == null
    ? '—'
    : `${movement.avgMasteryDelta > 0 ? '▲ +' : movement.avgMasteryDelta < 0 ? '▼ ' : ''}${movement.avgMasteryDelta}`;
  const deltaTone = movement == null ? null
    : movement.avgMasteryDelta > 0 ? 'good'
    : movement.avgMasteryDelta < 0 ? 'warn'
    : null;
  const deltaLabel = movement == null
    ? 'Mastery Δ · 4wk'
    : `Mastery Δ · ${movement.studentsMeasured} student${movement.studentsMeasured === 1 ? '' : 's'}`;

  const completionValue = completion?.rate == null
    ? '—'
    : `${Math.round(completion.rate * 100)}%`;
  const completionLabel = completion?.rate == null
    ? 'Assignments · 4wk'
    : `Assignments · ${completion.completed}/${completion.assigned} done`;

  return (
    <div className={s.effectRow}>
      <Metric label={deltaLabel} value={deltaValue} tone={deltaTone} />
      <Metric
        label={completionLabel}
        value={completionValue}
        tone={completion?.rate == null ? null : completion.rate >= 0.8 ? 'good' : completion.rate >= 0.5 ? 'ok' : 'warn'}
      />
      <AdherencePills adherence={adherence} />
    </div>
  );
}

function AdherencePills({ adherence }) {
  if (!adherence) return null;
  const parts = [];
  if (adherence.onTrack > 0) parts.push({ text: `${adherence.onTrack} on track`, cls: s.adhGood });
  if (adherence.ahead > 0) parts.push({ text: `${adherence.ahead} ahead`, cls: s.adhGood });
  if (adherence.behind > 0) parts.push({ text: `${adherence.behind} behind`, cls: s.adhWarn });
  if (adherence.notStarted > 0) parts.push({ text: `${adherence.notStarted} not started`, cls: s.adhMuted });
  if (adherence.noPlan > 0) parts.push({ text: `${adherence.noPlan} no plan`, cls: s.adhMuted });
  if (parts.length === 0) return null;
  return (
    <span className={s.adhCluster}>
      <span className={s.adhPills}>
        {parts.map((p) => (
          <span key={p.text} className={`${s.adhPill} ${p.cls}`}>{p.text}</span>
        ))}
      </span>
      <span className={s.metricLabel}>Plan adherence</span>
    </span>
  );
}

function Metric({ label, value, tone = null }) {
  const toneCls = tone === 'good' ? s.metricGood
    : tone === 'ok' ? s.metricOk
    : tone === 'warn' ? s.metricWarn
    : '';
  return (
    <span className={s.metric}>
      <strong className={`${s.metricValue} ${toneCls}`}>{value}</strong>
      <span className={s.metricLabel}>{label}</span>
    </span>
  );
}

function StatTile({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className={`${s.statTile} ${s[`statTile_${tone}`] ?? ''}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

function accuracyTone(pct) {
  if (pct == null) return null;
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'warn';
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}
