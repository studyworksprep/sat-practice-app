// Session workspace (§4.1) — the tutor cockpit's anchor surface.
// One screen composing what the platform already knows, so a
// 60-minute session runs here instead of page-to-page: student
// snapshot (predicted band, adherence, countdown), the prep card
// ("since last session…"), per-unit coverage with 4-week trends
// (first UI for get_student_coverage), review-queue state, recent
// assignments with report deep-links, session notes, and one-tap
// starts for assign/plan/profile.
//
// Reads are two-stage: everything student-shaped loads in one
// Promise.all; the prep card's window-dependent reads (mastery
// as-of, struggle scan, session count) need the "since last
// session" anchor — the newest tutor_notes.session_at — so they
// go in a second batch. All reads ride the RLS-scoped client:
// an invisible student 404s on the profile read, same as the
// plan page.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { adherenceSummaryLine, ADHERENCE_LABELS } from '@/lib/plan/adherence';
import { loadStudentPlanState } from '@/lib/plan/load-plan-state';
import { buildPrepCard } from '@/lib/tutor/prep';
import { getDueReviewItems, summarizeDue } from '@/lib/review/queue';
import type { Database } from '@/lib/types';
import { addTutorNote, deleteTutorNote } from './actions';
import { NoteForm, DeleteNoteButton } from './NotesPanel';
import s from './SessionWorkspace.module.css';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ studentId: string }> };

type CoverageRow = Database['public']['Functions']['get_student_coverage']['Returns'][number];
type MasteryRow = Database['public']['Functions']['get_skill_mastery_asof']['Returns'][number];
type BandRow = Database['public']['Functions']['get_predicted_score_band']['Returns'][number];
type PerformanceRow =
  Database['public']['Functions']['get_roster_skill_performance']['Returns'][number];
type NoteRow = Pick<
  Database['public']['Tables']['tutor_notes']['Row'],
  'id' | 'author_id' | 'body' | 'session_at'
>;

/** With no session note yet, the prep window defaults to two weeks. */
const DEFAULT_WINDOW_DAYS = 14;
/** Struggle scan floors tuned for one student, not a roster. */
const MIN_SKILL_ATTEMPTS = 3;
const MIN_STUDENT_ATTEMPTS = 3;
const STRUGGLING_THRESHOLD = 0.6;

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  practiced: 'Practiced',
  mastered: 'Mastered',
  decayed: 'Decayed',
};

function studentName(p: { first_name: string | null; last_name: string | null; email: string | null }) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Student';
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string | null | undefined, today: string) {
  if (!iso) return null;
  const target = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - now) / 86_400_000);
}

export default async function SessionWorkspacePage({ params }: PageProps) {
  const { studentId } = await params;
  const { user, profile, supabase } = await requireUser();

  // Belt-and-suspenders role gate (the (tutor) layout enforces it too).
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  // ── Stage 1: everything that only needs the student id ──────────
  const [
    { data: student },
    { data: noteRows },
    planState,
    { data: coverageRows },
    { data: bandRows },
    dueItems,
    { data: assignmentRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, email, target_sat_score, sat_test_date')
      .eq('id', studentId)
      .maybeSingle(),
    supabase
      .from('tutor_notes')
      .select('id, author_id, body, session_at')
      .eq('student_id', studentId)
      .order('session_at', { ascending: false })
      .limit(6),
    loadStudentPlanState(supabase, studentId, today),
    supabase.rpc('get_student_coverage', { p_student: studentId }),
    supabase.rpc('get_predicted_score_band', { p_student: studentId, p_test_type: 'sat' }),
    getDueReviewItems(supabase, studentId, nowIso).catch(() => []),
    supabase
      .from('assignment_students_v2')
      .select(
        `
        completed_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, archived_at, deleted_at, created_at
        )
      `,
      )
      .eq('student_id', studentId)
      .eq('test_type', 'sat'),
  ]);

  // RLS: a student this tutor can't see reads as absent → 404.
  if (!student) notFound();

  const notes = (noteRows ?? []) as NoteRow[];
  const coverage = (coverageRows ?? []) as CoverageRow[];
  const band = ((bandRows ?? []) as BandRow[])[0] ?? null;
  const dueSummary = summarizeDue(dueItems);
  const { active, adherence } = planState;

  // "Since last session" anchor: newest note, else the default window.
  const lastNoteIso = notes[0]?.session_at ?? null;
  const sinceIso =
    lastNoteIso ?? new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const assignments = (assignmentRows ?? [])
    .map((r) => ({ completedAt: r.completed_at, a: r.assignment }))
    .filter((r) => r.a && !r.a.deleted_at && !r.a.archived_at)
    .sort((x, y) => (y.a!.created_at ?? '').localeCompare(x.a!.created_at ?? ''))
    .slice(0, 3);
  const assignmentIds = assignments.map((r) => r.a!.id);

  // ── Stage 2: reads bound to the prep window / stage-1 output ────
  const [
    { data: masteryThenRows },
    { data: masteryNowRows },
    { data: performanceRows },
    { count: sessionsSince },
    { data: reportSessions },
  ] = await Promise.all([
    supabase.rpc('get_skill_mastery_asof', { p_student: studentId, p_asof: sinceDate }),
    supabase.rpc('get_skill_mastery_asof', { p_student: studentId, p_asof: today }),
    supabase.rpc('get_roster_skill_performance', {
      p_roster: [studentId],
      p_since: sinceIso,
      p_min_skill_attempts: MIN_SKILL_ATTEMPTS,
      p_min_student_attempts: MIN_STUDENT_ATTEMPTS,
      p_struggling_threshold: STRUGGLING_THRESHOLD,
    }),
    supabase
      .from('practice_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', studentId)
      .gte('created_at', sinceIso),
    assignmentIds.length
      ? supabase
          .from('practice_sessions')
          .select('id, status, filter_criteria')
          .eq('user_id', studentId)
          .in('filter_criteria->>assignment_id', assignmentIds)
      : Promise.resolve({ data: [] as { id: string; status: string | null; filter_criteria: unknown }[] }),
  ]);

  // Latest report per assignment, preferring completed sessions —
  // same ranking the student detail page uses.
  const reportByAssignment = new Map<string, string>();
  const rank = (status: string | null) => (status === 'completed' ? 2 : status === 'in_progress' ? 1 : 0);
  const seenRank = new Map<string, number>();
  for (const sess of reportSessions ?? []) {
    const fc = sess.filter_criteria as Record<string, unknown> | null;
    const aid = typeof fc?.assignment_id === 'string' ? fc.assignment_id : null;
    if (!aid) continue;
    if (rank(sess.status) >= (seenRank.get(aid) ?? -1)) {
      seenRank.set(aid, rank(sess.status));
      reportByAssignment.set(aid, sess.id);
    }
  }

  const prep = buildPrepCard({
    masteryThen: ((masteryThenRows ?? []) as MasteryRow[]).filter((r) => r.test_type === 'sat'),
    masteryNow: ((masteryNowRows ?? []) as MasteryRow[]).filter((r) => r.test_type === 'sat'),
    skillPerformance: (performanceRows ?? []) as PerformanceRow[],
    coverage,
    adherence,
  });

  const name = studentName(student);
  const testDate = active?.test_date ?? student.sat_test_date;
  const countdown = daysUntil(testDate, today);
  const sortedCoverage = [...coverage].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  // Non-plan focus suggestions deep-link into "assign from
  // weaknesses" (§4.3): the form opens with this student's weak
  // skills already weighted in the picker.
  const focusHref = prep.focus.kind === 'catch_up'
    ? `/tutor/students/${studentId}/plan`
    : `/tutor/assignments/new?student=${studentId}&from_student=${studentId}`;

  return (
    <main className={s.container}>
      <a href={`/tutor/students/${studentId}`} className={s.breadcrumb}>
        ← {name}&rsquo;s full profile
      </a>

      <header className={s.header}>
        <div className={s.eyebrow}>Session workspace · SAT</div>
        <h1 className={s.h1}>{name}</h1>
        <p className={s.sub}>
          {student.email ? <span>{student.email}</span> : null}
          {student.target_sat_score ? <span>· target {student.target_sat_score}</span> : null}
          {testDate ? (
            <span>
              · test {fmtDate(testDate)}
              {countdown != null && countdown >= 0 ? ` (${countdown} days)` : ''}
            </span>
          ) : null}
        </p>
      </header>

      <div className={s.statsRow}>
        <div className={s.stat}>
          <div className={s.statLabel}>Predicted score</div>
          <div className={s.statValue}>
            {band?.total_scaled ?? '—'}
            {band?.total_low != null && band?.total_high != null ? (
              <span className={s.statRange}>
                {band.total_low}–{band.total_high}
              </span>
            ) : null}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>Plan</div>
          <div className={s.statValue}>
            {adherence ? (
              <>
                <span className={`${s.chip} ${s[`adherence_${adherence.status}`] ?? ''}`}>
                  {ADHERENCE_LABELS[adherence.status]}
                </span>
                <span className={s.statDetail}>{adherenceSummaryLine(adherence)}</span>
              </>
            ) : (
              <a className={s.statLink} href={`/tutor/students/${studentId}/plan`}>
                No active plan — create one
              </a>
            )}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>Due for review</div>
          <div className={s.statValue}>
            {dueSummary.total}
            {dueSummary.total > 0 ? (
              <span className={s.statDetail}>
                {dueSummary.questions} questions · {dueSummary.skills} skills ·{' '}
                {dueSummary.flashcards} cards
              </span>
            ) : null}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>Since last session</div>
          <div className={s.statValue}>
            {sessionsSince ?? 0}
            <span className={s.statDetail}>
              practice session{(sessionsSince ?? 0) === 1 ? '' : 's'} since{' '}
              {lastNoteIso ? fmtDate(lastNoteIso) : `${fmtDate(sinceIso)} (no notes yet)`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Prep card ─────────────────────────────────────────── */}
      <section className={s.prepCard}>
        <div className={s.prepHead}>
          <h2 className={s.cardTitle}>Prep</h2>
          <span className={s.prepWindow}>
            since {fmtDate(sinceIso)}
            {lastNoteIso ? '' : ` · last ${DEFAULT_WINDOW_DAYS} days (no session notes yet)`}
          </span>
        </div>

        <div className={s.prepGrid}>
          <div className={s.prepCol}>
            <h3 className={s.prepColTitle}>Mastery moved</h3>
            {prep.movers.up.length === 0 && prep.movers.down.length === 0 ? (
              <p className={s.prepEmpty}>No skill moved this window.</p>
            ) : (
              <ul className={s.prepList}>
                {prep.movers.up.map((mv) => (
                  <li key={`u-${mv.domainCode}-${mv.skillCode}`} className={s.moverUp}>
                    ▲ {mv.title} <span className={s.moverDelta}>{mv.from}→{mv.to}</span>
                  </li>
                ))}
                {prep.movers.down.map((mv) => (
                  <li key={`d-${mv.domainCode}-${mv.skillCode}`} className={s.moverDown}>
                    ▼ {mv.title} <span className={s.moverDelta}>{mv.from}→{mv.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={s.prepCol}>
            <h3 className={s.prepColTitle}>Struggled with</h3>
            {prep.struggles.length === 0 ? (
              <p className={s.prepEmpty}>No low-accuracy skill in this window.</p>
            ) : (
              <ul className={s.prepList}>
                {prep.struggles.map((st) => (
                  <li key={st.skillCode}>
                    {st.skillName}{' '}
                    <span className={s.moverDelta}>
                      {st.missed} missed of {st.attempts} ({Math.round(st.accuracy * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={s.prepFocus}>
            <h3 className={s.prepColTitle}>Suggested focus</h3>
            <p className={s.focusTitle}>{prep.focus.title}</p>
            <p className={s.focusReason}>{prep.focus.reason}</p>
            <a className={s.focusAction} href={focusHref}>
              {prep.focus.kind === 'catch_up' ? 'Open the plan →' : 'Assign a drill →'}
            </a>
          </div>
        </div>
      </section>

      <div className={s.columns}>
        {/* ── Left: coverage ──────────────────────────────────── */}
        <section className={s.card}>
          <h2 className={s.cardTitle}>Coverage &amp; trend</h2>
          <p className={s.cardSub}>
            Mastery per curriculum unit, with the 4-week trend. Decayed units are slipping from
            their peak.
          </p>
          {sortedCoverage.length === 0 ? (
            <p className={s.prepEmpty}>No coverage data yet — it appears after first attempts.</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.coverageTable}>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th className={s.num}>Mastery</th>
                    <th className={s.num}>4-wk</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCoverage.map((c) => {
                    const trend = Math.round(c.trend_4w ?? 0);
                    return (
                      <tr
                        key={`${c.domain_code}-${c.skill_code}`}
                        className={c.status === 'decayed' ? s.decayedRow : undefined}
                      >
                        <td>{c.title}</td>
                        <td className={s.num}>
                          {c.attempts_count > 0 ? Math.round(c.mastery) : '—'}
                        </td>
                        <td
                          className={`${s.num} ${trend > 0 ? s.trendUp : trend < 0 ? s.trendDown : ''}`}
                        >
                          {c.attempts_count > 0 && trend !== 0
                            ? `${trend > 0 ? '+' : ''}${trend}`
                            : '·'}
                        </td>
                        <td>
                          <span className={`${s.chip} ${s[`status_${c.status}`] ?? ''}`}>
                            {STATUS_LABELS[c.status] ?? c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Right rail ──────────────────────────────────────── */}
        <div className={s.rail}>
          <section className={s.card}>
            <h2 className={s.cardTitle}>Quick actions</h2>
            <div className={s.actionsRow}>
              <a
                className={s.actionBtn}
                href={`/tutor/assignments/new?student=${studentId}&from_student=${studentId}`}
                title="Assignment form prefilled with this student's weakest recent skills"
              >
                Assign from weaknesses
              </a>
              <a className={s.actionBtn} href={`/tutor/assignments/new?student=${studentId}`}>
                Assign practice
              </a>
              <a className={s.actionBtn} href={`/tutor/students/${studentId}/plan`}>
                Study plan
              </a>
              <a className={s.actionBtn} href={`/tutor/students/${studentId}`}>
                Full profile
              </a>
            </div>
          </section>

          <section className={s.card}>
            <h2 className={s.cardTitle}>Recent assignments</h2>
            {assignments.length === 0 ? (
              <p className={s.prepEmpty}>Nothing assigned yet.</p>
            ) : (
              <ul className={s.assignmentList}>
                {assignments.map(({ a, completedAt }) => {
                  const sessionId = reportByAssignment.get(a!.id);
                  const href = sessionId
                    ? `/tutor/sessions/${sessionId}`
                    : `/tutor/assignments/${a!.id}`;
                  return (
                    <li key={a!.id}>
                      <a className={s.assignmentLink} href={href}>
                        <span className={s.assignmentTitle}>
                          {a!.title || a!.assignment_type}
                        </span>
                        <span className={s.assignmentMeta}>
                          {completedAt
                            ? `Completed ${fmtDate(completedAt)}`
                            : a!.due_date
                              ? `Due ${fmtDate(a!.due_date)}`
                              : 'Open'}
                          {sessionId ? ' · report →' : ''}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={s.card}>
            <h2 className={s.cardTitle}>Session notes</h2>
            <NoteForm studentId={studentId} action={addTutorNote} />
            {notes.length > 0 ? (
              <ul className={s.noteList}>
                {notes.map((n) => (
                  <li key={n.id} className={s.noteItem}>
                    <div className={s.noteMeta}>
                      <span>{fmtDate(n.session_at)}</span>
                      {n.author_id === user.id ? (
                        <DeleteNoteButton
                          noteId={n.id}
                          studentId={studentId}
                          action={deleteTutorNote}
                        />
                      ) : null}
                    </div>
                    <p className={s.noteBody}>{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
