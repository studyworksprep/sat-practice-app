// Student → practice-tests hub.
//
// Landing this page shows, at a glance:
//   - Header + page intro
//   - At-a-glance stats strip (tests taken, latest composite,
//     best composite, trend since previous)
//   - Resume callout when a test is mid-flight
//   - Launcher panel (dropdown + accommodations + Launch button)
//     — extracted from the legacy /practice/start page
//   - Performance trend: recent composite scores as a mini chart
//   - Full history table at the bottom
//
// All data is loaded server-side in one shot.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { TestLauncher } from '@/lib/practice/TestLauncher';
import s from './PracticeTestsPage.module.css';

export const dynamic = 'force-dynamic';

export default async function PracticeTestsPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const [
    { data: completedRows },
    { data: inProgress },
    { data: publishedTests },
  ] = await Promise.all([
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, practice_test_id, status, started_at, finished_at,
        composite_score, rw_scaled, math_scaled,
        time_multiplier, adaptive_version,
        practice_test:practice_tests_v2 (name, code, is_adaptive)
      `)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false }),
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, practice_test_id, started_at,
        practice_test:practice_tests_v2 (name, code)
      `)
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('practice_tests_v2')
      .select('id, code, name, is_adaptive')
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('code', { ascending: true }),
  ]);

  const completedAttempts = completedRows ?? [];
  const completedTestIds = new Set(
    completedAttempts.map((a) => a.practice_test_id).filter(Boolean),
  );

  const testOptions = (publishedTests ?? []).map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    isAdaptive: t.is_adaptive,
    completed: completedTestIds.has(t.id),
  }));

  const stats = buildStats(completedAttempts);
  const recentForChart = completedAttempts
    .filter((a) => Number.isFinite(a.composite_score))
    .slice(0, 6)  // newest 6
    .reverse();   // chart reads left = oldest, right = newest

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Practice tests</div>
        <h1 className={s.h1}>Practice tests</h1>
        <p className={s.sub}>
          Full-length SAT simulations under timed conditions. Your
          progress and history are below the launcher.
        </p>
      </header>

      <StatsStrip stats={stats} />

      {inProgress && (
        <div className={s.resumeCard} role="status">
          <div>
            <strong>You have a test in progress:</strong>{' '}
            {inProgress.practice_test?.name ?? 'Practice test'}
            {inProgress.practice_test?.code
              ? ` · ${inProgress.practice_test.code}`
              : ''}
          </div>
          <Link
            href={`/practice/test/attempt/${inProgress.id}`}
            className={s.resumeLink}
          >
            Continue →
          </Link>
        </div>
      )}

      <section className={s.launcherCard}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Launch a test</div>
            <div className={s.cardHint}>
              Pick a test, choose your accommodation, and jump in.
              You&apos;ll see the module summary before the timer starts.
            </div>
          </div>
        </div>
        <TestLauncher tests={testOptions} basePath="/practice" />
      </section>

      {recentForChart.length >= 2 && (
        <section className={s.card}>
          <div className={s.sectionLabel}>Recent composites</div>
          <TrendChart attempts={recentForChart} />
        </section>
      )}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.h2}>History</div>
          <div className={s.cardHint}>
            {completedAttempts.length} completed test
            {completedAttempts.length === 1 ? '' : 's'}
          </div>
        </div>
        {completedAttempts.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No tests completed yet.</div>
            <div className={s.emptyBody}>
              Launch one above and it&apos;ll appear here with scores
              and a link to its results.
            </div>
          </div>
        ) : (
          <HistoryTable attempts={completedAttempts} />
        )}
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────
// Stats.
// ──────────────────────────────────────────────────────────────

function buildStats(completedAttempts) {
  const withScore = completedAttempts.filter(
    (a) => Number.isFinite(a.composite_score),
  );
  if (withScore.length === 0) {
    return {
      taken: completedAttempts.length,
      latestComposite: null,
      bestComposite: null,
      delta: null,
      bestRw: null,
      bestMath: null,
    };
  }
  // completedAttempts is ordered finished_at desc, so [0] is latest.
  const latest = withScore[0];
  const previous = withScore[1] ?? null;
  const bestComposite = withScore.reduce(
    (m, a) => Math.max(m, a.composite_score),
    0,
  );
  const bestRw = withScore.reduce(
    (m, a) => Math.max(m, a.rw_scaled ?? 0),
    0,
  );
  const bestMath = withScore.reduce(
    (m, a) => Math.max(m, a.math_scaled ?? 0),
    0,
  );

  return {
    taken: completedAttempts.length,
    latestComposite: latest.composite_score,
    bestComposite,
    delta: previous && Number.isFinite(previous.composite_score)
      ? latest.composite_score - previous.composite_score
      : null,
    bestRw: bestRw > 0 ? bestRw : null,
    bestMath: bestMath > 0 ? bestMath : null,
  };
}

function StatsStrip({ stats }) {
  const trendTone =
    stats.delta == null
      ? 'neutral'
      : stats.delta > 0
        ? 'good'
        : stats.delta < 0
          ? 'warn'
          : 'neutral';

  return (
    <div className={s.statsStrip}>
      <StatTile
        label="Tests taken"
        value={stats.taken}
        sub={stats.taken === 0
          ? 'First one is waiting for you'
          : stats.taken === 1
            ? 'Keep going'
            : 'Full-length practice'}
        tone="neutral"
      />
      <StatTile
        label="Latest composite"
        value={stats.latestComposite == null
          ? '—'
          : stats.latestComposite.toLocaleString()}
        sub={stats.delta == null
          ? 'Your most recent score'
          : stats.delta === 0
            ? 'Steady — no change from last test'
            : stats.delta > 0
              ? `↑ ${stats.delta} from previous`
              : `↓ ${Math.abs(stats.delta)} from previous`}
        tone={trendTone}
      />
      <StatTile
        label="Best composite"
        value={stats.bestComposite == null
          ? '—'
          : stats.bestComposite.toLocaleString()}
        sub={stats.bestRw != null && stats.bestMath != null
          ? `Best RW ${stats.bestRw} · Best Math ${stats.bestMath}`
          : 'Your personal best'}
        tone="neutral"
      />
      <StatTile
        label="Trend"
        value={stats.delta == null
          ? '—'
          : stats.delta === 0
            ? '—'
            : stats.delta > 0
              ? `+${stats.delta}`
              : String(stats.delta)}
        sub={stats.delta == null
          ? 'Finish two tests to see a trend'
          : stats.delta > 0
            ? 'You are trending up'
            : stats.delta < 0
              ? 'Keep drilling — you have got this'
              : 'Flat — push for a new personal best'}
        tone={trendTone}
      />
    </div>
  );
}

function StatTile({ label, value, sub, tone }) {
  return (
    <div className={`${s.statTile} ${s[`statTile_${tone}`] ?? ''}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Trend chart — compact SVG bar chart of recent composite scores.
// Pure server-rendered SVG; no charting library.
// ──────────────────────────────────────────────────────────────

function TrendChart({ attempts }) {
  const W = 680;
  const H = 140;
  const PAD_X = 36;
  const PAD_Y = 24;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;

  const scores = attempts.map((a) => a.composite_score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const lo = Math.max(400, Math.floor((minScore - 50) / 50) * 50);
  const hi = Math.min(1600, Math.ceil((maxScore + 50) / 50) * 50);
  const range = Math.max(hi - lo, 50);

  const bandW = innerW / attempts.length;
  const barW = Math.min(48, bandW * 0.55);

  return (
    <div className={s.chartWrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={s.chart}
        role="img"
        aria-label="Recent composite scores"
      >
        {/* reference line — gridline at midpoint */}
        {[lo, Math.round((lo + hi) / 2), hi].map((tick) => {
          const y = PAD_Y + innerH - ((tick - lo) / range) * innerH;
          return (
            <g key={tick}>
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeDasharray="2 4"
              />
              <text
                x={PAD_X - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                opacity="0.5"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {attempts.map((a, i) => {
          const cx = PAD_X + bandW * (i + 0.5);
          const barX = cx - barW / 2;
          const h = ((a.composite_score - lo) / range) * innerH;
          const y = PAD_Y + innerH - h;
          const label = a.practice_test?.code ?? '—';
          return (
            <g key={a.id}>
              <rect
                x={barX}
                y={y}
                width={barW}
                height={Math.max(h, 2)}
                fill="var(--color-app-accent, #0a66c2)"
                opacity="0.85"
                rx="3"
              />
              <text
                x={cx}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="currentColor"
              >
                {a.composite_score}
              </text>
              <text
                x={cx}
                y={PAD_Y + innerH + 14}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                opacity="0.6"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// History table.
// ──────────────────────────────────────────────────────────────

function HistoryTable({ attempts }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th}>Test</th>
            <th className={s.th}>Finished</th>
            <th className={s.thNum}>RW</th>
            <th className={s.thNum}>Math</th>
            <th className={s.thNum}>Composite</th>
            <th className={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <tr key={a.id}>
              <td className={s.td}>
                <div className={s.testName}>
                  {a.practice_test?.name ?? 'Practice test'}
                </div>
                <div className={s.testMeta}>
                  {a.practice_test?.code ?? ''}
                  {a.practice_test?.is_adaptive ? ' · Adaptive' : ''}
                  {a.time_multiplier && a.time_multiplier > 1
                    ? ` · ${a.time_multiplier}× time`
                    : ''}
                </div>
              </td>
              <td className={s.td}>{formatDate(a.finished_at)}</td>
              <td className={s.tdNum}>
                {Number.isFinite(a.rw_scaled) ? a.rw_scaled : '—'}
              </td>
              <td className={s.tdNum}>
                {Number.isFinite(a.math_scaled) ? a.math_scaled : '—'}
              </td>
              <td className={`${s.tdNum} ${s.tdComposite}`}>
                {Number.isFinite(a.composite_score)
                  ? a.composite_score
                  : '—'}
              </td>
              <td className={s.tdAction}>
                <Link
                  href={`/practice/test/attempt/${a.id}/results`}
                  className={s.viewLink}
                >
                  View report →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
