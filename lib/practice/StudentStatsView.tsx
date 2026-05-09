// Shared "More statistics" view, rendered identically for the
// student (their own /dashboard/stats) and the tutor
// (/tutor/students/[id]/stats). One server component does the
// data load and renders the page; the two routes are thin auth
// wrappers that pass the right userId + presentation copy.
//
// Sections rendered:
//   - Stat strip (attempts, accuracy, last 7d, days practiced,
//     test date, target)
//   - Performance grid (Math + RW SkillBreakdownCard pair)
//   - Weekly accuracy trend (90d)
//   - Daily activity heatmap (90d)
//   - By-difficulty + by-score-band cards
//   - Per-skill ranked table (weakest first)
//
// All three loads run in parallel — loadDashboardAggregate gives
// the per-domain skill breakdown, get_roster_weekly_trend gives
// the 13-week trend, get_student_extended_stats gives the day /
// difficulty / score-band rollups. RLS uses can_view() on
// attempts so a tutor only sees their own students' rows.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/formatters';
import { loadDashboardAggregate } from './load-dashboard-aggregate';
import { SkillBreakdownCard } from './SkillBreakdownCard';
import { WeeklyTrendChart } from './WeeklyTrendChart';
import { ReviewDailyMap } from './ReviewDailyMap';
import { PerformanceIcon, ProgressIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import s from './StudentStatsView.module.css';

import type { ViewRow } from '@/lib/types';

const LOOKBACK_DAYS = 90;
const TREND_WEEKS = 13;
const SKILL_MIN_ATTEMPTS = 3;

interface Props {
  /** The student to render stats for. Tutor passes the route
   *  param; the student passes their own auth user.id. */
  userId: string;
  /** h1 text. Falls back to the student's name. */
  h1?: string;
  /** Breadcrumb label. Falls back to the student's name. */
  backLabel?: string;
  /** Breadcrumb href. Omit to hide the breadcrumb. */
  backHref?: string;
  /** Eyebrow line above the h1. */
  eyebrow?: string;
  /** Optional intro paragraph beneath the h1. */
  subtitle?: string;
}

export async function StudentStatsView({
  userId,
  h1,
  backLabel,
  backHref,
  eyebrow = `Statistics · last ${LOOKBACK_DAYS} days`,
  subtitle,
}: Props) {
  const supabase = await createClient();

  const lookbackStart = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: studentRows },
    aggregate,
    { data: trendRows },
    { data: extendedRows },
  ] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('user_id, first_name, last_name, email, total_attempts, correct_attempts, week_attempts, last_activity_at, target_sat_score, sat_test_date')
      .eq('user_id', userId),
    loadDashboardAggregate(userId),
    supabase.rpc('get_roster_weekly_trend', {
      p_roster: [userId],
      p_num_weeks: TREND_WEEKS,
    }),
    supabase.rpc('get_student_extended_stats', {
      p_user_id: userId,
      p_lookback_start: lookbackStart,
    }),
  ]);

  if (!studentRows || studentRows.length === 0) notFound();

  const row = studentRows[0] as ViewRow<'student_practice_stats'>;
  const studentName =
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.email ||
    'Student';
  const displayH1 = h1 ?? studentName;
  const displayBackLabel = backLabel ?? studentName;

  const totalAttempts   = Number(row.total_attempts ?? 0);
  const correctAttempts = Number(row.correct_attempts ?? 0);
  const weekAttempts    = Number(row.week_attempts ?? 0);
  const overallAccuracy =
    totalAttempts > 0
      ? Math.round((correctAttempts / totalAttempts) * 100)
      : null;

  const weeklyTrend = (trendRows ?? []).map(
    (r: { start_iso: string; end_iso: string; attempts: number | string; correct: number | string; accuracy: number | string | null }) => ({
      startIso: r.start_iso,
      endIso:   r.end_iso,
      attempts: Number(r.attempts ?? 0),
      correct:  Number(r.correct ?? 0),
      accuracy: r.accuracy == null ? null : Number(r.accuracy),
    }),
  );

  const ext = (extendedRows as Array<{
    by_day:         Array<{ date: string; attempts: number | string; correct: number | string }> | null;
    by_difficulty:  Array<{ difficulty: number; attempts: number | string; correct: number | string }> | null;
    by_score_band:  Array<{ score_band: number; attempts: number | string; correct: number | string }> | null;
  }> | null)?.[0];

  const dailyMap = buildDailyMapFromAgg(ext?.by_day ?? []);
  const byDifficulty = (ext?.by_difficulty ?? []).map((r) => ({
    difficulty: r.difficulty,
    attempts:   Number(r.attempts ?? 0),
    correct:    Number(r.correct  ?? 0),
  }));
  const byScoreBand = (ext?.by_score_band ?? []).map((r) => ({
    scoreBand: r.score_band,
    attempts:  Number(r.attempts ?? 0),
    correct:   Number(r.correct  ?? 0),
  }));

  // Flatten every (domain, skill) row across both subjects for
  // the weakest-first table at the bottom. Skills with fewer
  // than SKILL_MIN_ATTEMPTS are excluded as noise — a 0/1 would
  // dominate the top of a "weakest" list.
  type SkillRow = {
    section: 'math' | 'rw';
    domain: string;
    skill: string;
    correct: number;
    total: number;
    pct: number;
  };
  const allSkills: SkillRow[] = [];
  for (const sect of ['math', 'rw'] as const) {
    for (const dom of aggregate.performance[sect].domains) {
      for (const sk of dom.skills) {
        if (sk.total < SKILL_MIN_ATTEMPTS) continue;
        allSkills.push({
          section: sect,
          domain:  dom.name,
          skill:   sk.name,
          correct: sk.correct,
          total:   sk.total,
          pct:     Math.round((sk.correct / sk.total) * 100),
        });
      }
    }
  }
  allSkills.sort((a, b) => a.pct - b.pct);

  return (
    <main className={s.container}>
      {backHref && (
        <Link href={backHref} className={s.breadcrumb}>
          ← {displayBackLabel}
        </Link>
      )}

      <header className={s.header}>
        <div className={s.eyebrow}>{eyebrow}</div>
        <h1 className={s.h1}>{displayH1}</h1>
        {subtitle && <p className={s.sub}>{subtitle}</p>}
      </header>

      {/* ---------- Stat strip ---------- */}
      <section className={s.statsRow}>
        <StatTile label="Total attempts" value={totalAttempts.toLocaleString()} />
        <StatTile
          label="Accuracy"
          value={overallAccuracy == null ? '—' : `${overallAccuracy}%`}
          sub={
            overallAccuracy == null
              ? undefined
              : `${correctAttempts} / ${totalAttempts}`
          }
          tone={accuracyTone(overallAccuracy)}
        />
        <StatTile label="Last 7 days" value={weekAttempts} />
        <StatTile
          label="Days practiced"
          value={countDaysPracticed(ext?.by_day ?? [])}
          sub={`of ${LOOKBACK_DAYS}`}
        />
        <StatTile
          label="Test date"
          value={row.sat_test_date ? formatDate(row.sat_test_date) ?? '—' : '—'}
        />
        <StatTile label="Target" value={row.target_sat_score ?? '—'} />
      </section>

      {/* ---------- Performance grid (same as the dashboard) ---------- */}
      {(aggregate.performance.math.domains.length > 0 ||
        aggregate.performance.rw.domains.length > 0) && (
        <section>
          <div className={s.sectionLabel}>
            <IconTile icon={PerformanceIcon} palette="cyan" size="sm" />
            Performance by domain
          </div>
          <div className={s.perfGrid}>
            <SkillBreakdownCard
              title="Math"
              tone="math"
              domains={toBreakdownDomains(aggregate.performance.math.domains)}
            />
            <SkillBreakdownCard
              title="Reading & Writing"
              tone="rw"
              domains={toBreakdownDomains(aggregate.performance.rw.domains)}
            />
          </div>
        </section>
      )}

      {/* ---------- Weekly accuracy trend ---------- */}
      {weeklyTrend.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={s.sectionLabel}>
              <IconTile icon={ProgressIcon} palette="success" size="sm" />
              Weekly progress
            </div>
            <p className={s.cardHint}>
              Weekly accuracy (gold line) over the last 90 days
              against attempt volume (cyan bars). Empty weeks are
              gaps so the line doesn&apos;t dip to 0%.
            </p>
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

      {/* ---------- Daily activity heatmap ---------- */}
      {dailyMap.days.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={s.sectionLabel}>
              <IconTile icon={ProgressIcon} palette="cyan" size="sm" />
              Daily activity
            </div>
            <p className={s.cardHint}>
              One bar per calendar day in the last {LOOKBACK_DAYS}{' '}
              days. Bar height shows attempt volume; bar color shows
              accuracy — green ≥80%, amber 50–79%, red &lt;50%.
              Slate marks days with no practice, so cramming vs.
              steady effort reads at a glance.
            </p>
          </div>
          <ReviewDailyMap dailyMap={dailyMap} />
        </section>
      )}

      {/* ---------- By difficulty + by score band ---------- */}
      {(byDifficulty.length > 0 || byScoreBand.length > 0) && (
        <section className={s.cardRow}>
          {byDifficulty.length > 0 && (
            <div className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.h2}>By difficulty</h2>
                <p className={s.cardHint}>
                  How accuracy holds up as questions get harder. A
                  steep drop from medium to hard is the classic
                  &quot;solid fundamentals, struggles when stretched&quot; signal.
                </p>
              </div>
              <div className={s.diffRow}>
                {byDifficulty.map((d) => {
                  const pct =
                    d.attempts > 0
                      ? Math.round((d.correct / d.attempts) * 100)
                      : null;
                  return (
                    <div
                      key={d.difficulty}
                      className={`${s.diffTile} ${diffClass(d.difficulty)}`}
                    >
                      <div className={s.diffLabel}>{difficultyLabel(d.difficulty)}</div>
                      <div className={s.diffValue}>
                        {d.correct} / {d.attempts}
                      </div>
                      {pct != null && (
                        <div className={s.diffPct}>{pct}%</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {byScoreBand.length > 0 && (
            <div className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.h2}>By score band</h2>
                <p className={s.cardHint}>
                  CollegeBoard score-band 1–7. Finer-grained than the
                  three-bucket difficulty split — useful when a
                  student plateaus inside a single difficulty.
                </p>
              </div>
              <div className={s.diffRow}>
                {byScoreBand.map((d) => {
                  const pct =
                    d.attempts > 0
                      ? Math.round((d.correct / d.attempts) * 100)
                      : null;
                  return (
                    <div key={d.scoreBand} className={`${s.diffTile} sw-band-${d.scoreBand}`}>
                      <div className={s.diffLabel}>Band {d.scoreBand}</div>
                      <div className={s.diffValue}>
                        {d.correct} / {d.attempts}
                      </div>
                      {pct != null && (
                        <div className={s.diffPct}>{pct}%</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- Per-skill ranked table ---------- */}
      {allSkills.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.h2}>Per-skill accuracy · weakest first</h2>
            <p className={s.cardHint}>
              Every skill practiced ≥{SKILL_MIN_ATTEMPTS} times in
              the last {LOOKBACK_DAYS} days, sorted lowest accuracy
              first. The top of this list is the lesson plan.
            </p>
          </div>
          <table className={s.skillTable}>
            <thead>
              <tr>
                <th className={s.skillTh}>Skill</th>
                <th className={s.skillThR}>Attempts</th>
                <th className={s.skillThR}>Correct</th>
                <th className={s.skillThR}>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {allSkills.map((sk, i) => (
                <tr key={`${sk.domain}-${sk.skill}-${i}`}>
                  <td>
                    <div className={s.skillName}>{sk.skill}</div>
                    <div className={s.skillSub}>
                      <span
                        className={
                          sk.section === 'math' ? s.subjectMath : s.subjectRw
                        }
                      >
                        {sk.section === 'math' ? 'Math' : 'RW'}
                      </span>
                      {' · '}
                      {sk.domain}
                    </div>
                  </td>
                  <td className={s.skillTd}>{sk.total}</td>
                  <td className={s.skillTd}>{sk.correct}</td>
                  <td className={`${s.skillTd} ${pctToneClass(sk.pct)}`}>
                    {sk.pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function toBreakdownDomains(
  domains: Array<{
    name: string;
    correct: number;
    total: number;
    skills: Array<{ name: string; correct: number; total: number }>;
  }>,
) {
  return domains.map((d) => ({
    name:    d.name,
    correct: d.correct,
    total:   d.total,
    skills:  d.skills ?? [],
  }));
}

// Adapt the SQL aggregate's [{date, attempts, correct}] rows to
// the ReviewDailyMap shape: { days, firstDay, lastDay, totalAttempts },
// with empty calendar days filled in from first practice through
// today so the strip reads as a continuous timeline (gap days =
// "no practice").
function buildDailyMapFromAgg(
  rows: Array<{ date: string; attempts: number | string; correct: number | string }>,
): { days: Array<{ date: string; attempts: number; correct: number }>; firstDay: string | null; lastDay: string | null; totalAttempts: number } {
  if (!rows.length) {
    return { days: [], firstDay: null, lastDay: null, totalAttempts: 0 };
  }
  const byDay = new Map<string, { attempts: number; correct: number }>();
  let totalAttempts = 0;
  for (const r of rows) {
    const att = Number(r.attempts ?? 0);
    const cor = Number(r.correct  ?? 0);
    byDay.set(r.date, { attempts: att, correct: cor });
    totalAttempts += att;
  }
  const firstIso = [...byDay.keys()].sort()[0];
  const lastIso = new Date().toISOString().slice(0, 10);
  const days: Array<{ date: string; attempts: number; correct: number }> = [];
  const cursor = new Date(`${firstIso}T00:00:00Z`);
  const end = new Date(`${lastIso}T00:00:00Z`);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const entry = byDay.get(iso) ?? { attempts: 0, correct: 0 };
    days.push({ date: iso, ...entry });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { days, firstDay: firstIso, lastDay: lastIso, totalAttempts };
}

function countDaysPracticed(rows: Array<{ attempts: number | string }>): number {
  let n = 0;
  for (const r of rows) if (Number(r.attempts ?? 0) > 0) n += 1;
  return n;
}

function difficultyLabel(d: number): string {
  if (d === 1) return 'Easy';
  if (d === 2) return 'Medium';
  if (d === 3) return 'Hard';
  return `Difficulty ${d}`;
}

function diffClass(d: number): string {
  if (d === 1) return s.diffEasy;
  if (d === 2) return s.diffMed;
  if (d === 3) return s.diffHard;
  return '';
}

function pctToneClass(pct: number): string {
  if (pct >= 75) return s.pctGood;
  if (pct >= 50) return s.pctOk;
  return s.pctBad;
}

function accuracyTone(pct: number | null): 'good' | 'ok' | 'bad' | undefined {
  if (pct == null) return undefined;
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'bad';
}

// ──────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'good' | 'ok' | 'bad';
}
function StatTile({ label, value, sub, tone }: StatTileProps) {
  const cls = [
    s.statCard,
    tone === 'good' ? s.statGood : null,
    tone === 'ok'   ? s.statOk   : null,
    tone === 'bad'  ? s.statBad  : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statLabel}>{label}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}
