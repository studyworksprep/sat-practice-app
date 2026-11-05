// Tutor → individual student. See docs/architecture-plan.md §3.8.
//
//   PageHeader — name, email · school · class, and the three things a
//     tutor does from here: Study plan, Assign work, Start session.
//   Five tiles — latest score against the goal, test date, plan,
//     accuracy, last active (with curriculum coverage).
//   Tabs (?tab=) — Overview, Assignments, Tests & scores, Practice,
//     Settings. Plain links, so a tab is shareable and works without
//     JavaScript; only the selected tab renders.
//
// Data: ./load.ts (one RLS-scoped batch; a student the caller can't
// see 404s). Mutations sit on small client islands inside the tabs.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatCalendarDate, formatRelativeShort } from '@/lib/formatters';
import { adherenceSummaryLine, ADHERENCE_LABELS } from '@/lib/plan/adherence';
import { PageHeader } from '@/lib/ui/PageHeader';
import { loadStudentDetail, type StudentDetail } from './load';
import { OverviewTab } from './_tabs/OverviewTab';
import { AssignmentsTab, PracticeTab } from './_tabs/WorkTabs';
import { TestsTab } from './_tabs/TestsTab';
import { SettingsTab } from './_tabs/SettingsTab';
import s from './StudentDetail.module.css';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'assignments', 'tests', 'practice', 'settings'] as const;
type Tab = (typeof TABS)[number];

interface PageProps {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function TutorStudentDetailPage({ params, searchParams }: PageProps) {
  const { studentId } = await params;
  const sp = (await searchParams) ?? {};
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'overview';
  const { user, profile, supabase } = await requireUser();

  // The (tutor) layout already gates roles; this keeps direct hits safe.
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const result = await loadStudentDetail(supabase, studentId, user.id);
  if (result.kind === 'notFound') notFound();
  if (result.kind === 'error') return <ErrorState message={result.message} />;
  const d = result;
  const { student } = d;

  const tabHref = (t: string) => (t === 'overview' ? `/tutor/students/${student.id}` : `/tutor/students/${student.id}?tab=${t}`);
  const tabLabels: Record<Tab, string> = {
    overview: 'Overview',
    assignments: `Assignments · ${d.assignments.length}`,
    tests: `Tests & scores · ${d.testRows.length + d.officialScores.length}`,
    practice: 'Practice',
    settings: 'Settings',
  };

  const description = [
    student.email,
    student.highSchool,
    student.graduationYear ? `class of ${student.graduationYear}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <main className={s.container}>
      <Link href="/tutor/roster" className={s.breadcrumb}>← Roster</Link>

      <PageHeader
        eyebrow="Teach · Student"
        title={student.name}
        description={description || undefined}
        actions={
          <>
            <Link href={`/tutor/students/${student.id}/plan`} className={s.headerBtn}>Study plan</Link>
            <Link href={`/tutor/assignments/new?student=${student.id}`} className={s.headerBtn}>Assign work</Link>
            <Link href={`/tutor/session/${student.id}`} className={s.headerBtnPrimary}>Start session</Link>
          </>
        }
      />

      <SnapshotTiles d={d} />

      <nav className={s.tabs} aria-label="Student sections">
        {TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={s.tab}
            aria-current={t === tab ? 'page' : undefined}
            scroll={false}
          >
            {tabLabels[t]}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab d={d} tabHref={tabHref} />}
      {tab === 'assignments' && <AssignmentsTab d={d} />}
      {tab === 'tests' && <TestsTab d={d} />}
      {tab === 'practice' && <PracticeTab d={d} />}
      {tab === 'settings' && <SettingsTab d={d} />}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function SnapshotTiles({ d }: { d: StudentDetail }) {
  const { student, scoreSummary, planState, coverage } = d;
  const days = daysUntil(student.satTestDate);
  const adherence = planState.adherence;
  const scoreSub = [
    student.targetScore != null ? `goal ${student.targetScore}` : 'no goal set',
    scoreSummary.startingScore != null ? `started ${scoreSummary.startingScore}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section aria-label="Snapshot" className={s.tiles}>
      <Tile label="Latest score" value={scoreSummary.finalScore ?? '—'} sub={scoreSub} />
      <Tile
        label="Test date"
        value={days == null ? 'Not set' : days < 0 ? 'Past' : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}
        sub={student.satTestDate ? `SAT · ${formatCalendarDate(student.satTestDate)}` : 'Add one under Tests & scores'}
      />
      <Tile
        label="Plan"
        value={adherence ? ADHERENCE_LABELS[adherence.status] : planState.draft ? 'Draft' : 'No plan'}
        sub={adherence ? adherenceSummaryLine(adherence) : planState.draft ? 'Awaiting your review' : 'Build one from Study plan'}
        tone={adherence?.status === 'behind' ? 'bad' : adherence?.status === 'on_track' || adherence?.status === 'ahead' ? 'good' : undefined}
      />
      <Tile
        label="Accuracy"
        value={student.accuracy != null ? `${student.accuracy}%` : '—'}
        sub={student.totalAttempts > 0
          ? `${student.correctAttempts.toLocaleString()} of ${student.totalAttempts.toLocaleString()} · ${student.weekAttempts} this week`
          : 'No questions answered yet'}
        tone={student.accuracy == null ? undefined : student.accuracy >= 80 ? 'good' : student.accuracy < 50 ? 'bad' : undefined}
      />
      <Tile
        label="Last active"
        value={formatRelativeShort(student.lastActivityAt) ?? '—'}
        sub={coverage.total > 0
          ? `${coverage.started} of ${coverage.total} units covered${coverage.decayed > 0 ? ` · ${coverage.decayed} decayed` : ''}`
          : undefined}
      />
    </section>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={s.tile}>
      <div className={s.tileLabel}>{label}</div>
      <div className={[s.tileValue, tone === 'good' ? s.tileGood : tone === 'bad' ? s.tileBad : null].filter(Boolean).join(' ')}>
        {value}
      </div>
      {sub && <div className={s.tileSub}>{sub}</div>}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className={s.container}>
      <Link href="/tutor/roster" className={s.breadcrumb}>← Roster</Link>
      <PageHeader eyebrow="Teach · Student" title="Student" description="Something went wrong loading this student." />
      <div className={s.errorCard} role="alert">{message}</div>
    </main>
  );
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}
