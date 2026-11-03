// Shared statistics view, rendered for the student (their own
// /performance) and the tutor (/tutor/students/[id]/stats). One
// server component does the data load and renders the page; the two
// routes are thin auth wrappers that pass the right userId, tab,
// and presentation copy.
//
// Layout: PageHeader, a stat strip, then one tab at a time (links,
// `?tab=`, so each tab is a plain server render):
//   - Overview     — "Work on these next" (weakest well-sampled skills,
//                    with Drill links for the student) + per-domain
//                    summaries
//   - All skills   — the full ranked table, weakest first
//   - Weekly trend — 13-week accuracy vs volume
//   - Daily activity — 90-day heatmap
//   - By difficulty — difficulty + score-band tiles
//
// `focus` picks the test: the student page follows the sidebar
// SAT/ACT switch; the tutor sees both. Stat tiles count only the
// focused test (the view's totals include ACT, so SAT = all − ACT).
//
// All loads run in parallel — loadDashboardAggregate gives the
// per-domain skill breakdown, get_roster_weekly_trend the 13-week
// trend, get_student_extended_stats the day / difficulty /
// score-band rollups, get_act_student_stats the ACT breakdown. RLS
// uses can_view() on attempts so a tutor only sees their own
// students' rows.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { formatCalendarDate } from '@/lib/formatters';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import { PageHeader } from '@/lib/ui/PageHeader';
import { loadDashboardAggregate } from './load-dashboard-aggregate';
import { WeeklyTrendChart } from './WeeklyTrendChart';
import { ReviewDailyMap } from './ReviewDailyMap';
import {
  FOCUS_MIN_SAMPLE,
  STATS_TABS,
  pickFocusSkills,
} from './stats-focus';
import type { FocusInput, StatsTab } from './stats-focus';
import s from './StudentStatsView.module.css';

import type { ViewRow } from '@/lib/types';

const LOOKBACK_DAYS = 90;
const TREND_WEEKS = 13;
const SKILL_MIN_ATTEMPTS = 3;

export type StatsFocus = 'sat' | 'act' | 'both';

interface Props {
  /** The student to render stats for. Tutor passes the route
   *  param; the student passes their own auth user.id. */
  userId: string;
  /** The route the tab links point at. */
  basePath: string;
  /** Query kept on every tab link (the student page's `?test=`). */
  keepQuery?: Record<string, string>;
  tab?: StatsTab;
  focus?: StatsFocus;
  /** Student only: show Drill links into the practice builder. */
  drill?: boolean;
  /** h1 text. Falls back to the student's name. */
  h1?: string;
  /** Breadcrumb label. Falls back to the student's name. */
  backLabel?: string;
  /** Breadcrumb href. Omit to hide the breadcrumb. */
  backHref?: string;
  /** Eyebrow line above the h1. */
  eyebrow?: string;
  /** Optional intro line beneath the h1. */
  subtitle?: string;
}

export async function StudentStatsView({
  userId,
  basePath,
  keepQuery = {},
  tab = 'overview',
  focus = 'both',
  drill = false,
  h1,
  backLabel,
  backHref,
  eyebrow = `Statistics · last ${LOOKBACK_DAYS} days`,
  subtitle,
}: Props) {
  const supabase = await createClient();

  const nowMs = Date.now();
  const lookbackStart = new Date(
    nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: studentRows },
    aggregate,
    { data: trendRows },
    { data: extendedRows },
    { data: actRows },
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
    // ACT counterpart (Phase 4): totals, per-section → per-category
    // accuracy, 1–5 difficulty split.
    supabase.rpc('get_act_student_stats', {
      p_user_id: userId,
      p_week_ago: sevenDaysAgo,
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

  // ACT breakdown. The view's totals / weekly trend / daily activity
  // already count ACT attempts (migration 20261013100000); this is
  // the ACT-shaped breakdown — sections and categories, not domains
  // and skills — plus the ACT 1–5 difficulty split.
  const act = (actRows as Array<{
    total_attempts: number | string;
    correct_attempts: number | string;
    week_attempts: number | string;
    per_section: Array<{
      section: string;
      correct: number | string;
      total: number | string;
      categories: Array<{ category: string; correct: number | string; total: number | string }> | null;
    }> | null;
    by_difficulty: Array<{ difficulty: number; attempts: number | string; correct: number | string }> | null;
  }> | null)?.[0];
  const actTotal   = Number(act?.total_attempts ?? 0);
  const actCorrect = Number(act?.correct_attempts ?? 0);
  const actWeek    = Number(act?.week_attempts ?? 0);
  const actSections = (act?.per_section ?? []).map((sec) => ({
    section: sec.section,
    label: sectionLabel(sec.section),
    correct: Number(sec.correct ?? 0),
    total: Number(sec.total ?? 0),
    categories: (sec.categories ?? [])
      .map((c) => ({
        name: c.category,
        correct: Number(c.correct ?? 0),
        total: Number(c.total ?? 0),
      }))
      // Weakest first inside the section, like the SAT skill table.
      .sort((a, b) => a.correct / a.total - b.correct / b.total),
  }));
  const actByDifficulty = (act?.by_difficulty ?? []).map((r) => ({
    difficulty: r.difficulty,
    attempts:   Number(r.attempts ?? 0),
    correct:    Number(r.correct  ?? 0),
  }));

  const showSat = focus !== 'act';
  const showAct = focus !== 'sat';

  // Stat-strip numbers for the focused test.
  const totals =
    focus === 'act'
      ? { total: actTotal, correct: actCorrect, week: actWeek }
      : focus === 'sat'
        ? {
            total:   Math.max(0, totalAttempts - actTotal),
            correct: Math.max(0, correctAttempts - actCorrect),
            week:    Math.max(0, weekAttempts - actWeek),
          }
        : { total: totalAttempts, correct: correctAttempts, week: weekAttempts };
  const accuracy = totals.total > 0 ? Math.round((totals.correct / totals.total) * 100) : null;
  const daysPracticed = countDaysPracticed(ext?.by_day ?? []);

  // Flatten every (domain, skill) row across both SAT subjects.
  type SkillRow = {
    section: 'math' | 'rw';
    domain: string;
    skill: string;
    correct: number;
    total: number;
    pct: number;
  };
  const satSkills: SkillRow[] = [];
  for (const sect of ['math', 'rw'] as const) {
    for (const dom of aggregate.performance[sect].domains) {
      for (const sk of dom.skills) {
        satSkills.push({
          section: sect,
          domain:  dom.name,
          skill:   sk.name,
          correct: sk.correct,
          total:   sk.total,
          pct:     sk.total > 0 ? Math.round((sk.correct / sk.total) * 100) : 0,
        });
      }
    }
  }
  // The ranked table drops skills under SKILL_MIN_ATTEMPTS as noise —
  // a 0/1 would dominate the top of a "weakest" list.
  const rankedSatSkills = satSkills
    .filter((sk) => sk.total >= SKILL_MIN_ATTEMPTS)
    .sort((a, b) => a.pct - b.pct);
  const satFocus = pickFocusSkills(
    satSkills.map((sk): FocusInput => ({ name: sk.skill, group: sk.domain, correct: sk.correct, total: sk.total })),
  );
  const actFocus = pickFocusSkills(
    actSections.flatMap((sec) =>
      sec.categories.map((c): FocusInput => ({ name: c.name, group: sec.label, correct: c.correct, total: c.total })),
    ),
  );

  const hasSatData = satSkills.some((sk) => sk.total > 0);
  const tabHref = (id: StatsTab) => {
    const qs = new URLSearchParams(keepQuery);
    if (id !== 'overview') qs.set('tab', id);
    const q = qs.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const drillHref = (skill: string) =>
    `/practice/start?test=sat&skill=${encodeURIComponent(skill)}`;

  return (
    <main className={s.container}>
      {backHref && (
        <Link href={backHref} className={s.breadcrumb}>
          ← {displayBackLabel}
        </Link>
      )}

      <PageHeader eyebrow={eyebrow} title={displayH1} description={subtitle} />

      {/* ---------- Stat strip ---------- */}
      <section className={s.statsRow} aria-label="Summary">
        <StatTile
          label="Questions answered"
          value={totals.total.toLocaleString()}
          sub={`${totals.week.toLocaleString()} this week`}
        />
        <StatTile
          label="Accuracy"
          value={accuracy == null ? '—' : `${accuracy}%`}
          sub={accuracy == null ? 'No answers yet' : `${totals.correct.toLocaleString()} of ${totals.total.toLocaleString()} correct`}
          tone={accuracyTone(accuracy)}
        />
        <StatTile
          label="Days practiced"
          value={`${daysPracticed} of ${LOOKBACK_DAYS}`}
          sub={`Last ${LOOKBACK_DAYS} days`}
        />
        {showSat && (
          <StatTile
            label="Test date"
            value={formatCalendarDate(row.sat_test_date) || '—'}
            sub={row.target_sat_score ? `Target ${row.target_sat_score.toLocaleString()}` : 'No target set'}
          />
        )}
      </section>

      {/* ---------- Tabs ---------- */}
      <nav className={s.tabs} aria-label="Statistics views">
        {STATS_TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            className={t.id === tab ? `${s.tab} ${s.tabOn}` : s.tab}
            aria-current={t.id === tab ? 'page' : undefined}
            scroll={false}
          >
            {t.id === 'skills' && focus === 'act' ? 'All categories' : t.label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          {showSat && (hasSatData ? (
            <>
              <FocusCard
                title={focus === 'both' ? 'SAT · work on these next' : 'Work on these next'}
                items={satFocus.focus.map((f) => ({
                  key: f.name,
                  name: f.name,
                  meta: `${f.group} · ${f.correct} of ${f.total} correct`,
                  pct: f.pct,
                  href: drill ? drillHref(f.name) : null,
                }))}
                thin={satFocus.thin}
                thinNoun={{ one: 'skill', many: 'skills' }}
              />
              <div className={s.perfGrid}>
                {(['math', 'rw'] as const).map((sect) => (
                  <DomainSummary
                    key={sect}
                    title={sect === 'math' ? 'Math' : 'Reading & Writing'}
                    tone={sect}
                    rows={aggregate.performance[sect].domains.map((d) => ({
                      name: d.name,
                      correct: d.correct,
                      total: d.total,
                    }))}
                  />
                ))}
              </div>
              <Link href={tabHref('skills')} className={s.moreLink} scroll={false}>
                See every skill, weakest first →
              </Link>
            </>
          ) : (
            focus === 'sat' && (
              <EmptyCard>
                No SAT practice in the last {LOOKBACK_DAYS} days yet.
                {drill && <> <Link href="/practice/start?test=sat">Build a practice set</Link> and your numbers start here.</>}
              </EmptyCard>
            )
          ))}

          {showAct && (actTotal > 0 ? (
            <>
              <FocusCard
                title={focus === 'both' ? 'ACT · work on these next' : 'Work on these next'}
                items={actFocus.focus.map((f) => ({
                  key: `${f.group}-${f.name}`,
                  name: f.name,
                  meta: `${f.group} · ${f.correct} of ${f.total} correct`,
                  pct: f.pct,
                  href: null,
                }))}
                thin={actFocus.thin}
                thinNoun={{ one: 'category', many: 'categories' }}
              />
              <DomainSummary
                title="ACT sections"
                tone="act"
                rows={actSections.map((sec) => ({ name: sec.label, correct: sec.correct, total: sec.total }))}
              />
            </>
          ) : (
            focus === 'act' && (
              <EmptyCard>
                No ACT practice in the last {LOOKBACK_DAYS} days yet.
                {drill && <> <Link href="/practice/start?test=act">Start an ACT set</Link> and your numbers start here.</>}
              </EmptyCard>
            )
          ))}
        </>
      )}

      {tab === 'skills' && (
        <>
          {showSat && (rankedSatSkills.length > 0 ? (
            <section className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.h2}>{focus === 'both' ? 'SAT skills · weakest first' : 'Every skill · weakest first'}</h2>
                <p className={s.cardHint}>
                  Every skill practiced at least {SKILL_MIN_ATTEMPTS} times in
                  the last {LOOKBACK_DAYS} days, lowest accuracy first.
                </p>
              </div>
              <table className={s.skillTable}>
                <thead>
                  <tr>
                    <th className={s.skillTh}>Skill</th>
                    <th className={s.skillThR}>Attempts</th>
                    <th className={s.skillThR}>Correct</th>
                    <th className={s.skillThR}>Accuracy</th>
                    {drill && <th className={s.skillThR}><span className={s.srOnly}>Drill</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {rankedSatSkills.map((sk, i) => (
                    <tr key={`${sk.domain}-${sk.skill}-${i}`}>
                      <td>
                        <div className={s.skillName}>{sk.skill}</div>
                        <div className={s.skillSub}>
                          <span className={sk.section === 'math' ? s.subjectMath : s.subjectRw}>
                            {sk.section === 'math' ? 'Math' : 'RW'}
                          </span>
                          {' · '}
                          {sk.domain}
                        </div>
                      </td>
                      <td className={s.skillTd}>{sk.total}</td>
                      <td className={s.skillTd}>{sk.correct}</td>
                      <td className={`${s.skillTd} ${pctToneClass(sk.pct)}`}>{sk.pct}%</td>
                      {drill && (
                        <td className={s.skillTd}>
                          <Link href={drillHref(sk.skill)} className={s.drillBtn} aria-label={`Drill ${sk.skill}`}>
                            Drill
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            focus === 'sat' && <EmptyCard>No skill has {SKILL_MIN_ATTEMPTS} or more answers yet.</EmptyCard>
          ))}

          {showAct && (actSections.length > 0 ? (
            <section className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.h2}>ACT sections · categories weakest first</h2>
                <p className={s.cardHint}>
                  ACT practice is scored by section and category. Last {LOOKBACK_DAYS} days.
                </p>
              </div>
              <table className={s.skillTable}>
                <thead>
                  <tr>
                    <th className={s.skillTh}>Section · category</th>
                    <th className={s.skillThR}>Attempts</th>
                    <th className={s.skillThR}>Correct</th>
                    <th className={s.skillThR}>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {actSections.map((sec) => {
                    const secPct = sec.total > 0 ? Math.round((sec.correct / sec.total) * 100) : 0;
                    return [
                      <tr key={sec.section}>
                        <td><div className={s.skillName}>{sec.label}</div></td>
                        <td className={s.skillTd}>{sec.total}</td>
                        <td className={s.skillTd}>{sec.correct}</td>
                        <td className={`${s.skillTd} ${pctToneClass(secPct)}`}>{secPct}%</td>
                      </tr>,
                      ...sec.categories.map((cat) => {
                        const pct = cat.total > 0 ? Math.round((cat.correct / cat.total) * 100) : 0;
                        return (
                          <tr key={`${sec.section}-${cat.name}`}>
                            <td>
                              <div className={s.skillSub}>
                                <span className={s.subjectAct}>{sec.label}</span>
                                {' · '}
                                {cat.name}
                              </div>
                            </td>
                            <td className={s.skillTd}>{cat.total}</td>
                            <td className={s.skillTd}>{cat.correct}</td>
                            <td className={`${s.skillTd} ${pctToneClass(pct)}`}>{pct}%</td>
                          </tr>
                        );
                      }),
                    ];
                  })}
                </tbody>
              </table>
            </section>
          ) : (
            focus === 'act' && <EmptyCard>No ACT practice in the last {LOOKBACK_DAYS} days yet.</EmptyCard>
          ))}
        </>
      )}

      {tab === 'trend' && (weeklyTrend.length > 0 ? (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.h2}>Weekly progress</h2>
            <p className={s.cardHint}>
              Weekly accuracy (gold line) over the last {LOOKBACK_DAYS} days
              against question volume (cyan bars), SAT and ACT together.
              Empty weeks are gaps so the line doesn&apos;t dip to 0%.
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
      ) : (
        <EmptyCard>No practice in the last {TREND_WEEKS} weeks yet.</EmptyCard>
      ))}

      {tab === 'activity' && (dailyMap.days.length > 0 ? (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.h2}>Daily activity</h2>
            <p className={s.cardHint}>
              One bar per calendar day in the last {LOOKBACK_DAYS} days, SAT
              and ACT together. Bar height shows question volume; color
              shows accuracy — green ≥80%, amber 50–79%, red &lt;50%. Slate
              marks days with no practice.
            </p>
          </div>
          <ReviewDailyMap dailyMap={dailyMap} />
        </section>
      ) : (
        <EmptyCard>No practice in the last {LOOKBACK_DAYS} days yet.</EmptyCard>
      ))}

      {tab === 'difficulty' && (
        <>
          {showSat && (byDifficulty.length > 0 || byScoreBand.length > 0) && (
            <section className={s.cardRow}>
              {byDifficulty.length > 0 && (
                <div className={s.card}>
                  <div className={s.cardHead}>
                    <h2 className={s.h2}>{focus === 'both' ? 'SAT by difficulty' : 'By difficulty'}</h2>
                    <p className={s.cardHint}>
                      How accuracy holds up as questions get harder. A steep
                      drop from medium to hard is the classic &quot;solid
                      fundamentals, struggles when stretched&quot; signal.
                    </p>
                  </div>
                  <DiffTiles
                    tiles={byDifficulty.map((d) => ({
                      key: d.difficulty,
                      label: difficultyLabel(d.difficulty),
                      className: diffClass(d.difficulty),
                      correct: d.correct,
                      attempts: d.attempts,
                    }))}
                  />
                </div>
              )}
              {byScoreBand.length > 0 && (
                <div className={s.card}>
                  <div className={s.cardHead}>
                    <h2 className={s.h2}>By score band</h2>
                    <p className={s.cardHint}>
                      College Board score bands 1–7. Finer-grained than the
                      three difficulty buckets — useful for spotting a plateau
                      inside one difficulty.
                    </p>
                  </div>
                  <DiffTiles
                    tiles={byScoreBand.map((d) => ({
                      key: d.scoreBand,
                      label: `Band ${d.scoreBand}`,
                      className: `sw-band-${d.scoreBand}`,
                      correct: d.correct,
                      attempts: d.attempts,
                    }))}
                  />
                </div>
              )}
            </section>
          )}
          {showAct && actByDifficulty.length > 0 && (
            <section className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.h2}>{focus === 'both' ? 'ACT by difficulty' : 'By difficulty'}</h2>
                <p className={s.cardHint}>ACT questions are rated 1 (easiest) to 5 (hardest).</p>
              </div>
              <DiffTiles
                tiles={actByDifficulty.map((d) => ({
                  key: d.difficulty,
                  label: `Difficulty ${d.difficulty}`,
                  className: actDiffClass(d.difficulty),
                  correct: d.correct,
                  attempts: d.attempts,
                }))}
              />
            </section>
          )}
          {!(showSat && (byDifficulty.length > 0 || byScoreBand.length > 0)) &&
            !(showAct && actByDifficulty.length > 0) && (
              <EmptyCard>No practice in the last {LOOKBACK_DAYS} days yet.</EmptyCard>
            )}
        </>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

interface FocusRow {
  key: string;
  name: string;
  meta: string;
  pct: number;
  href: string | null;
}

function FocusCard({
  title,
  items,
  thin,
  thinNoun,
}: {
  title: string;
  items: FocusRow[];
  thin: FocusInput[];
  thinNoun: { one: string; many: string };
}) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.h2}>{title}</h2>
        <p className={s.cardHint}>
          Your weakest {thinNoun.many} with at
          least {FOCUS_MIN_SAMPLE} answers, so the number can be trusted.
        </p>
      </div>
      {items.length > 0 ? (
        <ol className={s.focusList}>
          {items.map((it, i) => (
            <li key={it.key} className={s.focusRow}>
              <span className={s.focusRank} aria-hidden="true">{i + 1}</span>
              <span className={s.focusText}>
                <span className={s.focusName}>{it.name}</span>
                <span className={s.focusMeta}>{it.meta}</span>
              </span>
              <span className={`${s.focusPct} ${pctToneClass(it.pct)}`}>{it.pct}%</span>
              {it.href && (
                <Link href={it.href} className={s.drillBtn} aria-label={`Drill ${it.name}`}>
                  Drill
                </Link>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.focusEmpty}>
          Nothing has {FOCUS_MIN_SAMPLE} answers yet — keep practicing and
          the list fills in.
        </p>
      )}
      {thin.length > 0 && (
        <p className={s.thinNote}>
          {thin.length === 1
            ? `${thin[0].name} has`
            : `${thin[0].name} and ${thin.length - 1} more ${thin.length === 2 ? thinNoun.one : thinNoun.many} have`}
          {' '}fewer than {FOCUS_MIN_SAMPLE} answers — practice{' '}
          {thin.length === 1 ? 'it' : 'them'} before we rank {thin.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </section>
  );
}

function DomainSummary({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: 'math' | 'rw' | 'act';
  rows: Array<{ name: string; correct: number; total: number }>;
}) {
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  const toneClass = tone === 'math' ? s.toneMath : tone === 'rw' ? s.toneRw : s.toneAct;
  return (
    <section className={`${s.card} ${s.domainCard}`}>
      <div className={s.domainHead}>
        <h2 className={`${s.domainTitle} ${toneClass}`}>{title}</h2>
        <span className={s.domainTotal}>{correct} of {total} correct</span>
      </div>
      <ul className={s.domainList}>
        {rows.map((r) => {
          const enough = r.total >= FOCUS_MIN_SAMPLE;
          const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
          return (
            <li key={r.name} className={s.domainRow}>
              <span className={s.domainName}>{r.name}</span>
              <span className={s.domainNums}>
                {r.total === 0
                  ? '0 answered · not enough yet'
                  : enough
                    ? <>{r.correct} / {r.total} · <span className={pctToneClass(pct)}>{pct}%</span></>
                    : `${r.correct} / ${r.total} · not enough yet`}
              </span>
              <span className={s.domainBar} aria-hidden="true">
                <span
                  className={`${s.domainFill} ${enough ? pctFillClass(pct) : s.fillThin}`}
                  style={{ width: `${r.total > 0 ? Math.max(pct, 2) : 0}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DiffTiles({
  tiles,
}: {
  tiles: Array<{ key: number; label: string; className: string; correct: number; attempts: number }>;
}) {
  return (
    <div className={s.diffRow}>
      {tiles.map((d) => {
        const pct = d.attempts > 0 ? Math.round((d.correct / d.attempts) * 100) : null;
        return (
          <div key={d.key} className={`${s.diffTile} ${d.className}`}>
            <div className={s.diffLabel}>{d.label}</div>
            <div className={s.diffValue}>{d.correct} / {d.attempts}</div>
            {pct != null && <div className={s.diffPct}>{pct}%</div>}
          </div>
        );
      })}
    </div>
  );
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <section className={`${s.card} ${s.emptyCard}`}>{children}</section>;
}

// ──────────────────────────────────────────────────────────────

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

/** ACT difficulty is 1–5: 1–2 read as easy, 3 as medium, 4–5 as hard. */
function actDiffClass(d: number): string {
  if (d <= 2) return s.diffEasy;
  if (d === 3) return s.diffMed;
  return s.diffHard;
}

function pctToneClass(pct: number): string {
  if (pct >= 75) return s.pctGood;
  if (pct >= 50) return s.pctOk;
  return s.pctBad;
}

function pctFillClass(pct: number): string {
  if (pct >= 75) return s.fillGood;
  if (pct >= 50) return s.fillOk;
  return s.fillBad;
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
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}
