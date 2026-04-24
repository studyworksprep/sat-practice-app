// Student dashboard client island. Renders the design-kit
// dashboard layout (banner, stats row, performance grid, recent
// sessions + assignments) from server-side data passed in as
// props. The only interactive bits are the target-score editor
// and the optimistic update around it.
//
// Phase 2 §3.4 / §3.9 pattern: page.js loads, this island
// renders. No fetch, no useEffect, no local copies of server data.

'use client';

import Link from 'next/link';
import { useActionState, useOptimistic } from 'react';
import s from './Dashboard.module.css';

export function DashboardInteractive({
  stats,
  performance,
  recentlyFinished,
  assignments,
  resumeInfo,
  updateTargetScoreAction,
}) {
  const [optimisticTarget, setOptimisticTarget] = useOptimistic(
    stats.targetScore,
    (_current, next) => next,
  );
  const [state, submitAction, isPending] = useActionState(
    async (prevState, formData) => {
      const next = Number(formData.get('target'));
      if (Number.isFinite(next)) setOptimisticTarget(next);
      return updateTargetScoreAction(prevState, formData);
    },
    null,
  );

  const greeting = stats.firstName
    ? `Welcome back, ${stats.firstName}.`
    : 'Welcome back.';
  const daysToTest = daysUntil(stats.satTestDate);

  return (
    <main className={s.main}>
      {/* ---------- Banner ---------- */}
      <section className={s.banner}>
        <div className={s.bannerText}>
          <div className={s.bannerGreeting}>{greeting}</div>
          <div className={s.bannerSub}>
            {bannerStatusLine(stats, daysToTest)}
          </div>
          <div className={s.bannerChips}>
            <span className={`${s.bannerChip} ${s.bannerChipAccent}`}>
              Target · {optimisticTarget ?? 'Not set'}
            </span>
            {stats.accuracy != null && (
              <span className={s.bannerChip}>
                Accuracy · {stats.accuracy}%
              </span>
            )}
            {daysToTest != null && (
              <span className={s.bannerChip}>
                {daysToTest < 0 ? 'Test passed' : `${daysToTest} days to test day`}
              </span>
            )}
          </div>
        </div>
        <div className={s.bannerActions}>
          {resumeInfo && (
            <Link
              href={`/practice/s/${resumeInfo.sessionId}/${resumeInfo.position}`}
              className={s.btnSecondary}
            >
              Resume session
            </Link>
          )}
          <Link href="/practice/start" className={s.btnPrimary}>
            Start practice
          </Link>
        </div>
      </section>

      {/* ---------- Stats row ---------- */}
      <section className={s.statsRow}>
        <StatTile
          value={formatInt(stats.totalAttempts)}
          label="Questions attempted"
        />
        <StatTile
          value={stats.accuracy == null ? '—' : `${stats.accuracy}%`}
          label="Overall accuracy"
        />
        <StatTile
          value={formatInt(stats.weekAttempts)}
          label="This week"
        />
        <StatTile
          value={daysToTest == null ? '—' : daysToTest < 0 ? 'Past' : daysToTest}
          label={daysToTest == null
            ? 'Set test date'
            : daysToTest < 0 ? 'Test date'  : 'Days to test'}
        />
      </section>

      {/* ---------- Recently finished ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.sectionLabel}>Recently finished</div>
            <div className={s.cardSub}>
              The work you&apos;ve closed out most recently — click to
              jump to its report.
            </div>
          </div>
        </div>
        {recentlyFinished.length === 0 ? (
          <p className={s.empty}>
            Nothing here yet.{' '}
            <Link href="/practice/start" className={s.inlineLink}>
              Start a practice session →
            </Link>
          </p>
        ) : (
          <ul className={s.finishedList}>
            {recentlyFinished.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <Link href={row.href} className={s.finishedRow}>
                  <span className={`${s.typeBadge} ${s[`typeBadge_${row.kind}`]}`}>
                    {kindLabel(row.kind)}
                  </span>
                  <div className={s.finishedMain}>
                    <div className={s.finishedTitle}>
                      {row.title}
                      {row.subtitle && (
                        <span className={s.finishedSubtitle}>
                          {' '}· {row.subtitle}
                        </span>
                      )}
                    </div>
                    <div className={s.finishedMeta}>
                      <span className={`${s.finishedMetric} ${s[`metricTone_${row.tone}`]}`}>
                        {row.metric}
                      </span>
                      <span className={s.finishedDot}>·</span>
                      <span className={s.finishedDate}>
                        {formatRowDate(row.finishedAt)}
                      </span>
                    </div>
                  </div>
                  <span className={s.finishedChevron} aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Performance grid ---------- */}
      <section className={s.perfGrid}>
        <PerformanceCard title="Math" tone="math" data={performance.math} />
        <PerformanceCard title="Reading & Writing" tone="rw" data={performance.rw} />
      </section>

      {/* ---------- Pending assignments ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.sectionLabel}>Pending assignments</div>
            <div className={s.cardSub}>
              {assignments.length === 0
                ? "You're all caught up."
                : 'What your tutor has assigned you, soonest first.'}
            </div>
          </div>
          <Link href="/assignments" className={s.cardHeaderLink}>
            View all →
          </Link>
        </div>
        {assignments.length > 0 && (
          <ul className={s.assignmentList}>
            {assignments.map((a) => (
              <li key={a.id}>
                <Link href={`/assignments/${a.id}`} className={s.assignmentRow}>
                  <span className={s.assignmentTitle}>{a.title}</span>
                  {a.due_date && (
                    <span className={isOverdue(a.due_date) ? s.dueOverdue : s.due}>
                      Due {formatRowDate(a.due_date)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Target score editor ---------- */}
      <section className={s.targetCard}>
        <div className={s.sectionLabel}>Target SAT score</div>
        <form action={submitAction} className={s.targetForm}>
          <label htmlFor="target" className={s.srOnly}>Target SAT score</label>
          <input
            id="target"
            name="target"
            type="number"
            min="400"
            max="1600"
            step="10"
            defaultValue={optimisticTarget ?? ''}
            disabled={isPending}
            className={s.targetInput}
          />
          <button
            type="submit"
            disabled={isPending}
            className={s.targetBtn}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          {state && !state.ok && (
            <span role="alert" className={s.targetError}>{state.error}</span>
          )}
          {state && state.ok && (
            <span className={s.targetOk}>Saved</span>
          )}
        </form>
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function StatTile({ value, label }) {
  return (
    <div className={s.statCard}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

function PerformanceCard({ title, tone, data }) {
  const toneCls = tone === 'rw' ? s.perfToneRw : s.perfToneMath;
  const pct = data.pct;
  const noData = data.domains.length === 0;
  return (
    <div className={`${s.perfCard} ${toneCls}`}>
      <div className={s.perfCardHeader}>
        <div className={s.perfTitle}>{title}</div>
        <div className={s.perfPct}>
          {pct == null ? '—' : `${pct}%`}
        </div>
      </div>
      {noData ? (
        <p className={s.empty}>
          No attempts yet. Practice some {title.toLowerCase()} questions to see your accuracy here.
        </p>
      ) : (
        <div className={s.domainList}>
          {data.domains.map((d) => (
            <DomainRow key={d.name} domain={d} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainRow({ domain, tone }) {
  const pct = domain.total > 0 ? Math.round((domain.correct / domain.total) * 100) : 0;
  const fillCls = tone === 'rw' ? s.barFillRw : s.barFillMath;
  return (
    <div className={s.domainRow}>
      <div className={s.domainName}>{domain.name}</div>
      <div className={s.domainCount}>{domain.total}</div>
      <div className={s.domainBar}>
        <div className={s.bar}>
          <div className={fillCls} style={{ width: `${pct}%` }} />
        </div>
        <span className={s.barPct}>{pct}%</span>
      </div>
    </div>
  );
}

function kindLabel(kind) {
  if (kind === 'assignment') return 'Assignment';
  if (kind === 'test') return 'Practice test';
  if (kind === 'session') return 'Practice';
  return kind;
}

function bannerStatusLine(stats, daysToTest) {
  const bits = [];
  if (stats.weekAttempts > 0) {
    bits.push(`${stats.weekAttempts} attempt${stats.weekAttempts === 1 ? '' : 's'} this week`);
  }
  if (stats.totalAttempts > 0 && stats.accuracy != null) {
    bits.push(`${stats.accuracy}% accuracy overall`);
  }
  if (bits.length === 0) {
    return 'Start your first practice session to see your stats here.';
  }
  if (daysToTest != null && daysToTest >= 0 && daysToTest <= 60) {
    bits.push(`${daysToTest} day${daysToTest === 1 ? '' : 's'} to test day`);
  }
  return bits.join(' · ');
}

function isOverdue(iso) {
  return Date.parse(iso) < Date.now();
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatInt(n) {
  if (n == null) return '0';
  return n.toLocaleString();
}

function formatRowDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
