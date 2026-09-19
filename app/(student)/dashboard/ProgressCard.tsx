// Dashboard · Progress box — the reduced read on how it's going: three
// stat tiles (with the weekly sparklines and deltas) and one accuracy
// bar per domain. Everything deeper — per-skill segments, difficulty
// bands, the daily heatmap, the weekly trend chart, the ranked skill
// table — lives on /performance (StudentStatsView), which the header
// link opens.
//
// Server Component. Sparkline and Delta are plain SVG/markup with no
// client hooks, so the box ships no JS.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sparkline } from '@/lib/ui/Sparkline';
import { Delta } from '@/lib/ui/Delta';
import { ProgressIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import s from './Dashboard.module.css';

export interface TrendBucket {
  startIso: string;
  endIso: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface DomainStat {
  name: string;
  correct: number;
  total: number;
}

export interface ProgressGroup {
  title: string;
  tone: 'math' | 'rw' | 'act';
  domains: DomainStat[];
}

export interface ProgressCardProps {
  totalAttempts: number;
  accuracy: number | null;
  weekAttempts: number;
  weeklyTrend: TrendBucket[];
  /** Math, Reading & Writing, and ACT when the student has ACT attempts.
   *  Groups with no domains are skipped. */
  groups: ProgressGroup[];
}

export function ProgressCard({
  totalAttempts,
  accuracy,
  weekAttempts,
  weeklyTrend,
  groups,
}: ProgressCardProps) {
  const visibleGroups = groups.filter((g) => g.domains.length > 0);
  const hasTrend = weeklyTrend.length > 0;
  // Sparkline reads numeric fields off each bucket; hand it just those.
  const sparkData = weeklyTrend.map(({ attempts, accuracy: acc }) => ({ attempts, accuracy: acc }));

  return (
    <section className={`${s.card} ${s.progressCard}`} aria-labelledby="dashboard-progress">
      <div className={s.cardHeader}>
        <div>
          <h2 id="dashboard-progress" className={s.sectionLabel}>
            <IconTile icon={ProgressIcon} palette="success" size="sm" />
            Progress
          </h2>
          <div className={s.cardSub}>Last 90 days, by domain.</div>
        </div>
        <Link href="/performance" className={s.cardHeaderLink}>See full performance →</Link>
      </div>

      <div className={s.statsRow}>
        <StatTile
          value={formatInt(totalAttempts)}
          label="Questions"
          spark={hasTrend ? (
            <Sparkline data={sparkData} field="attempts" tone="cyan" ariaLabel="Weekly attempts trend" />
          ) : null}
        />
        <StatTile
          value={accuracy == null ? '—' : `${accuracy}%`}
          label="Accuracy"
          spark={hasTrend ? (
            <Sparkline
              data={sparkData}
              field="accuracy"
              tone="gold"
              ariaLabel="Weekly accuracy trend"
              treatZeroAsNull
            />
          ) : null}
          delta={accuracyDelta(weeklyTrend)}
        />
        <StatTile
          value={formatInt(weekAttempts)}
          label="This week"
          delta={weekDelta(weeklyTrend)}
        />
      </div>

      {visibleGroups.length === 0 ? (
        <p className={s.empty}>
          Nothing here yet.{' '}
          <Link href="/practice/start" className={s.inlineLink}>Start a practice session →</Link>
        </p>
      ) : (
        <div className={s.domainGroups}>
          {visibleGroups.map((g) => (
            <div key={g.title} className={s.domainGroup}>
              <div className={`${s.domainGroupTitle} ${s[`domainTone_${g.tone}`]}`}>{g.title}</div>
              <ul className={s.domainList}>
                {g.domains.map((d) => {
                  const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
                  return (
                    <li key={d.name} className={s.domainRow}>
                      <span className={s.domainName}>{d.name}</span>
                      <span
                        className={s.domainBar}
                        role="progressbar"
                        aria-label={`${d.name} accuracy`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct ?? 0}
                      >
                        <span
                          className={`${s.domainFill} ${s[`domainFill_${accuracyTone(pct)}`]}`}
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </span>
                      <span className={s.domainPct}>
                        {pct == null ? '—' : `${pct}%`}
                        <span className={s.domainCount}> · {d.correct}/{d.total}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────

function StatTile({
  value,
  label,
  spark = null,
  delta = null,
}: {
  value: string;
  label: string;
  spark?: ReactNode;
  delta?: ReactNode;
}) {
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

function accuracyDelta(rows: TrendBucket[]): ReactNode {
  if (rows.length === 0) return null;
  const latest = lastNonNull(rows);
  const prior = priorAverage(rows);
  return latest != null && prior != null
    ? <Delta current={latest} prior={prior} format="percent" />
    : null;
}

function weekDelta(rows: TrendBucket[]): ReactNode {
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  return (
    <Delta
      current={last?.attempts ?? 0}
      prior={prev?.attempts ?? 0}
      format="count"
      suffix="vs last week"
    />
  );
}

// Latest non-null accuracy across the trend buckets — where the
// student stands now.
function lastNonNull(rows: TrendBucket[]): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const v = rows[i]?.accuracy;
    if (v != null) return v;
  }
  return null;
}

// Attempt-weighted average accuracy across every bucket EXCEPT the
// latest non-null one, so the delta compares "now" against "before"
// and quiet weeks don't wash out busy ones.
function priorAverage(rows: TrendBucket[]): number | null {
  let latestIdx = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.accuracy != null) { latestIdx = i; break; }
  }
  if (latestIdx <= 0) return null;
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < latestIdx; i += 1) {
    const v = rows[i]?.accuracy;
    const w = rows[i]?.attempts ?? 0;
    if (v == null || w <= 0) continue;
    weighted += v * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : null;
}

function accuracyTone(pct: number | null): 'good' | 'ok' | 'warn' | 'neutral' {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'warn';
}

function formatInt(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString();
}
