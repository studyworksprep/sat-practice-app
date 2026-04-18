// Student dashboard client island. See docs/architecture-plan.md
// §3.4 and §3.9.
//
// This is the only 'use client' file in the dashboard. It receives
// its initial data as props from the Server Component in page.js and
// the Server Action references for mutations. No fetch, no useEffect,
// no local state for anything that came from the server.
//
// Forms use React 19's useActionState to handle pending/error state
// natively, and useOptimistic to show the user their edit instantly
// while the Server Action round-trips.

'use client';

import Link from 'next/link';
import { useActionState, useOptimistic } from 'react';
import { StatCard } from '@/lib/ui/StatCard';
import { AssignmentTypeBadge } from '@/lib/ui/AssignmentTypeBadge';
import { formatRelativeShort } from '@/lib/formatters';

/**
 * @param {object} props
 * @param {object} props.stats - server-rendered dashboard stats
 * @param {Function} props.updateTargetScoreAction - Server Action reference
 */
export function DashboardInteractive({ stats, assignments = [], updateTargetScoreAction }) {
  // useOptimistic: while the Server Action is in flight, show the
  // new target immediately. React reconciles back to the real value
  // from the server on resolution (or on error).
  const [optimisticTarget, setOptimisticTarget] = useOptimistic(
    stats.targetScore,
    (_current, next) => next,
  );

  // useActionState: wraps the Server Action so we get pending + last
  // result without any manual useState choreography. The wrapper
  // function sets the optimistic value before awaiting the action so
  // the input reflects the pending state even before the server responds.
  const [state, submitAction, isPending] = useActionState(
    async (prevState, formData) => {
      const next = Number(formData.get('target'));
      if (Number.isFinite(next)) setOptimisticTarget(next);
      return updateTargetScoreAction(prevState, formData);
    },
    null,
  );

  const greeting = stats.firstName ? `Hi, ${stats.firstName}` : 'Welcome back';
  const daysToTest = daysUntil(stats.satTestDate);

  return (
    <main style={{ maxWidth: 960, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        {greeting}
      </h1>
      <p style={{ color: '#4b5563', marginTop: 0 }}>
        Welcome to the rebuild preview. Your dashboard is rendering from a
        Next.js Server Component — no client-side fetching on load.
      </p>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginTop: '1.5rem',
        }}
      >
        <StatCard label="Practice attempts" value={stats.totalAttempts} />
        <StatCard
          label="Correct"
          value={`${stats.correctAttempts} (${stats.accuracy ?? '—'}${stats.accuracy != null ? '%' : ''})`}
        />
        <StatCard
          label="Target SAT score"
          value={optimisticTarget ?? 'Not set'}
        />
        <StatCard
          label="Last activity"
          value={formatRelativeShort(stats.lastActivityAt) ?? 'No activity yet'}
        />
        {daysToTest != null && (
          <StatCard
            label="Days to test date"
            value={daysToTest < 0 ? 'Past' : daysToTest}
          />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Assignments</h2>
          <Link href="/assignments" style={{ fontSize: '0.875rem', color: '#2563eb' }}>
            View all
          </Link>
        </div>
        {assignments.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            You&apos;re all caught up.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {assignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/assignments/${a.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #e5e7eb', borderRadius: 6,
                    textDecoration: 'none', color: '#111827',
                  }}
                >
                  <AssignmentTypeBadge type={a.assignment_type} variant="compact" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.9rem', fontWeight: 500 }}>
                    {a.title}
                  </span>
                  {a.due_date && (
                    <span style={{
                      fontSize: '0.75rem',
                      color: isOverdue(a.due_date) ? '#b91c1c' : '#6b7280',
                    }}>
                      Due {formatShortDate(a.due_date)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
          Update target score
        </h2>
        <form
          action={submitAction}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.5rem' }}
        >
          <label htmlFor="target" style={{ display: 'none' }}>Target SAT score</label>
          <input
            id="target"
            name="target"
            type="number"
            min="400"
            max="1600"
            step="10"
            defaultValue={optimisticTarget ?? ''}
            disabled={isPending}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              width: 120,
              fontSize: '1rem',
            }}
          />
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: '0.5rem 1rem',
              background: isPending ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.95rem',
              cursor: isPending ? 'wait' : 'pointer',
            }}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </form>
        {state && !state.ok && (
          <p role="alert" style={{ color: '#b91c1c', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            {state.error}
          </p>
        )}
        {state && state.ok && (
          <p style={{ color: '#15803d', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Saved.
          </p>
        )}
      </section>
    </main>
  );
}

function isOverdue(iso) {
  return Date.parse(iso) < Date.now();
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
