// Student review page. See docs/architecture-plan.md §3.4.
//
// The review entry point. Lists the questions the student should
// review (wrong answers + items marked for review) and lets them
// start a review-mode session. The session itself is served by the
// existing /practice/s/[sessionId]/[position] page — review-mode
// sessions look almost identical to practice sessions, with two
// differences:
//
//   - practice_sessions.mode = 'review' so the rows are
//     distinguishable later
//   - the session-complete redirect goes back here instead of to
//     the dashboard (handled in the practice page via mode-aware
//     sessionCompleteHref)
//
// The student session page also pre-loads rationale + correct
// answer when there's a prior attempt, so review-mode sessions
// land directly in the reviewed state without forcing a
// re-submission. See lib/practice/load-review-data.js.
//
// No client island on this first commit — read-only list with two
// "start session" buttons. Filtering, sorting, and per-question
// drill-down land in follow-ups.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { createReviewSession } from './actions';
import { ReviewLauncher } from './ReviewLauncher';

export const dynamic = 'force-dynamic';

export default async function StudentReviewPage({ searchParams }) {
  const sp = await searchParams;
  const completed = sp?.complete === '1';

  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Reviewable items: anything the student got wrong on their last
  // attempt, OR anything they marked for review. Includes light
  // metadata so the page header can show counts and the most recent
  // activity. RLS pins this to user_id = auth.uid().
  const { data: statusRows } = await supabase
    .from('question_status')
    .select('question_id, last_is_correct, marked_for_review, last_attempt_at')
    .eq('user_id', user.id)
    .or('last_is_correct.eq.false,marked_for_review.eq.true')
    .order('last_attempt_at', { ascending: false })
    .limit(2000);

  const wrongCount = (statusRows ?? []).filter(
    (r) => r.last_is_correct === false,
  ).length;
  const markedCount = (statusRows ?? []).filter((r) => r.marked_for_review === true).length;
  const totalReviewable = (statusRows ?? []).length;

  const lastReviewedAt = (statusRows ?? [])[0]?.last_attempt_at ?? null;

  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>Review</h1>
        <p style={S.sub}>
          Revisit questions you got wrong or saved for later. Each review
          session shows the correct answer and rationale immediately —
          no re-submission required.
        </p>
      </header>

      {completed && (
        <div style={S.completedBanner} role="status">
          Review session complete. Pick another set below to keep going.
        </div>
      )}

      <section style={S.summary}>
        <SummaryCard label="Wrong answers" value={wrongCount} />
        <SummaryCard label="Marked for review" value={markedCount} />
        <SummaryCard label="Total reviewable" value={totalReviewable} />
        <SummaryCard
          label="Last activity"
          value={formatRelative(lastReviewedAt)}
          small
        />
      </section>

      {totalReviewable === 0 ? (
        <section style={S.emptyCard}>
          <p style={{ margin: 0 }}>
            Nothing to review yet. Practice some questions first, and
            anything you get wrong (or mark for review) will show up here.
          </p>
        </section>
      ) : (
        <ReviewLauncher
          counts={{ wrong: wrongCount, marked: markedCount, total: totalReviewable }}
          createReviewSessionAction={createReviewSession}
        />
      )}
    </main>
  );
}

function SummaryCard({ label, value, small = false }) {
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={small ? S.cardValueSmall : S.cardValue}>{value ?? '—'}</div>
    </div>
  );
}

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

const S = {
  main: { maxWidth: 860, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  header: { marginBottom: '1.5rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', marginTop: 0 },
  completedBanner: {
    padding: '0.75rem 1rem',
    background: '#dcfce7',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    color: '#166534',
    marginBottom: '1.25rem',
    fontSize: '0.95rem',
  },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  card: {
    padding: '1rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  cardLabel: { fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' },
  cardValue: { fontSize: '1.5rem', fontWeight: 600, color: '#111827' },
  cardValueSmall: { fontSize: '1rem', fontWeight: 500, color: '#374151' },
  emptyCard: {
    padding: '1.25rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    color: '#4b5563',
  },
};
