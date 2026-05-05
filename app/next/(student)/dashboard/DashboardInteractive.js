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
import { StudyCountdown } from '@/lib/practice/StudyCountdown';
import { WeeklyTrendChart } from '@/lib/practice/WeeklyTrendChart';
import { Sparkline } from '@/lib/ui/Sparkline';
import { Delta } from '@/lib/ui/Delta';
import {
  ClipboardCheckIcon,
  GoalIcon,
  InboxIcon,
  ProgressIcon,
} from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import s from './Dashboard.module.css';

export function DashboardInteractive({
  stats,
  performance,
  weeklyTrend = [],
  recentlyFinished,
  assignments,
  resumeInfo,
  todayMs,
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

      {/* ---------- Test-date countdown ---------- */}
      {stats.satTestDate && (
        <StudyCountdown
          isoDate={stats.satTestDate}
          todayMs={todayMs}
          compact
        />
      )}

      {/* ---------- Stats row ---------- */}
      <section className={s.statsRow}>
        <StatTile
          value={formatInt(stats.totalAttempts)}
          label="Questions attempted"
          spark={
            weeklyTrend.length > 0 ? (
              <Sparkline
                data={weeklyTrend}
                field="attempts"
                tone="cyan"
                ariaLabel="Weekly attempts trend"
              />
            ) : null
          }
        />
        <StatTile
          value={stats.accuracy == null ? '—' : `${stats.accuracy}%`}
          label="Overall accuracy"
          spark={
            weeklyTrend.length > 0 ? (
              <Sparkline
                data={weeklyTrend}
                field="accuracy"
                tone="gold"
                ariaLabel="Weekly accuracy trend"
                treatZeroAsNull
              />
            ) : null
          }
          delta={
            weeklyTrend.length > 0
              ? (() => {
                  const latest = lastNonNull(weeklyTrend, 'accuracy');
                  const prior = priorAverage(weeklyTrend, 'accuracy', 'attempts');
                  return latest != null && prior != null
                    ? <Delta current={latest} prior={prior} format="percent" />
                    : null;
                })()
              : null
          }
        />
        <StatTile
          value={formatInt(stats.weekAttempts)}
          label="This week"
          delta={
            weeklyTrend.length >= 2
              ? (() => {
                  const last = weeklyTrend[weeklyTrend.length - 1];
                  const prev = weeklyTrend[weeklyTrend.length - 2];
                  return (
                    <Delta
                      current={last?.attempts ?? 0}
                      prior={prev?.attempts ?? 0}
                      format="count"
                      suffix="vs last week"
                    />
                  );
                })()
              : null
          }
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
            <div className={s.sectionLabel}>
              <IconTile icon={ClipboardCheckIcon} palette="success" size="sm" />
              Recently finished
            </div>
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

      {/* ---------- Weekly progress trend ---------- */}
      {weeklyTrend.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <div className={s.sectionLabel}>
                <IconTile icon={ProgressIcon} palette="success" size="sm" />
                Your weekly progress
              </div>
              <div className={s.cardSub}>
                Weekly accuracy (gold line) over the last 90 days, against
                attempt volume (cyan bars). Empty weeks are gaps so the line
                doesn&apos;t dip to 0 % when you take a break.
              </div>
            </div>
          </div>
          <WeeklyTrendChart
            trend={weeklyTrend}
            labels={{
              latest: 'This week',
              average: '90-day avg',
              delta: 'Δ vs prior',
              latestSubEmpty: 'No practice this week',
              deltaSub: 'This week vs prior weeks',
            }}
          />
        </section>
      )}

      {/* ---------- Performance grid ---------- */}
      <section className={s.perfGrid}>
        <PerformanceCard title="Math" tone="math" data={performance.math} />
        <PerformanceCard title="Reading & Writing" tone="rw" data={performance.rw} />
      </section>

      {/* ---------- Pending assignments ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.sectionLabel}>
              <IconTile icon={InboxIcon} palette="navy" size="sm" />
              Pending assignments
            </div>
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
        <div className={s.sectionLabel}>
          <IconTile icon={GoalIcon} palette="gold" size="sm" />
          Target SAT score
        </div>
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

function StatTile({ value, label, spark, delta }) {
  return (
    <div className={s.statCard}>
      <div className={s.statValueRow}>
        <div className={s.statValue}>{value}</div>
        {spark}
      </div>
      <div className={s.statLabelRow}>
        <div className={s.statLabel}>{label}</div>
        {delta}
      </div>
    </div>
  );
}

// Latest non-null value of a field across the trend buckets.
// Used for "where the student stands today" reads.
function lastNonNull(rows, field) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const v = rows[i]?.[field];
    if (v != null) return v;
  }
  return null;
}

// Weighted average of a "rate-style" field (accuracy etc.) across
// all buckets EXCEPT the latest non-null one. Weighting by an
// `attempts`-like field keeps weeks with more activity from
// being washed out by quiet weeks.
function priorAverage(rows, valueField, weightField) {
  // Find the latest non-null bucket so we exclude it from the
  // prior average — comparing latest against itself would
  // dilute the delta.
  let latestIdx = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.[valueField] != null) { latestIdx = i; break; }
  }
  if (latestIdx <= 0) return null;
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < latestIdx; i += 1) {
    const v = rows[i]?.[valueField];
    const w = rows[i]?.[weightField] ?? 0;
    if (v == null || w <= 0) continue;
    weighted += v * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : null;
}

function PerformanceCard({ title, tone, data }) {
  const toneCls = tone === 'rw' ? s.perfToneRw : s.perfToneMath;
  // Section-level mastery: weight by attempt volume across the
  // section's domains so a section with one well-mastered domain
  // and one weak domain reads as the volume-weighted average,
  // matching how the per-domain bars roll up visually.
  let sectionMasteryWeighted = 0;
  let sectionMasteryDenom = 0;
  for (const d of data.domains) {
    if (d.mastery == null || d.total <= 0) continue;
    sectionMasteryWeighted += d.mastery * d.total;
    sectionMasteryDenom += d.total;
  }
  const sectionMastery = sectionMasteryDenom > 0
    ? sectionMasteryWeighted / sectionMasteryDenom
    : null;
  const noData = data.domains.length === 0;
  return (
    <div className={`${s.perfCard} ${toneCls}`}>
      <div className={s.perfCardHeader}>
        <div className={s.perfTitle}>{title}</div>
        <div className={s.perfPct}>
          {sectionMastery == null ? '—' : `${Math.round(sectionMastery)}%`}
        </div>
      </div>
      {noData ? (
        <p className={s.empty}>
          No attempts yet. Practice some {title.toLowerCase()} questions to see your mastery here.
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
  // Bar fill + headline number are the mastery score (difficulty-
  // and band-weighted, with a volume curve and a recency bonus)
  // rather than raw accuracy. See migration
  // 20260505000000_dashboard_stats_with_mastery and
  // lib/mastery.js for the formula. Mastery null → 0 so the empty
  // bar reads the same as "no signal yet".
  const mastery = domain.mastery == null ? 0 : domain.mastery;
  const fillCls = tone === 'rw' ? s.barFillRw : s.barFillMath;
  return (
    <div className={s.domainRow}>
      <div className={s.domainName}>{domain.name}</div>
      <div className={s.domainCount}>{domain.total}</div>
      <div className={s.domainBar}>
        <div className={s.bar}>
          <div className={fillCls} style={{ width: `${mastery}%` }} />
        </div>
        <span className={s.barPct}>{mastery}%</span>
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
