// Tutor → Performance. Roster-wide aggregations to answer "what
// should I focus on?". Server-rendered; one loader call does
// the whole aggregation and the page renders the result.
//
// Layout: stats strip on top, then a "cohort progress" card
// (weekly accuracy trend + volume) for the time-series view,
// then the skill heatmap as a grid of colored tiles grouped by
// domain. The standalone Common-errors card was folded into
// the heatmap's sort dropdown ("Most missed (cohort)").

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import {
  PerformanceIcon,
  ProgressIcon,
} from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { Sparkline } from '@/lib/ui/Sparkline';
import { Delta } from '@/lib/ui/Delta';
import { loadRosterPerformance, sortSkills } from './loader';
import { PerformanceSortToolbar } from './PerformanceSortToolbar';
import { WeeklyTrendChart } from '@/lib/practice/WeeklyTrendChart';
import s from './Performance.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorPerformancePage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const sort = typeof sp.sort === 'string' ? sp.sort : 'struggling';

  const { profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const data = await loadRosterPerformance(supabase);
  const sortedSkills = sortSkills(data.skills, sort);

  // Group skills by domain (subject + domain_name) for the
  // heatmap grid. Order RW domains first, then Math, with the
  // user's chosen sort applied within each domain. We lean on
  // a stable subject prefix on domain_code (R*/M*) where
  // available; falls back to the subject_code we don't have
  // here, so we just split by RW vs Math via the standard
  // domain_code prefixes.
  const byDomain = new Map();
  for (const sk of sortedSkills) {
    const key = sk.domain_name ?? '—';
    if (!byDomain.has(key)) {
      byDomain.set(key, {
        domain_code: sk.domain_code,
        domain_name: sk.domain_name,
        skills: [],
      });
    }
    byDomain.get(key).skills.push(sk);
  }
  const domainGroups = Array.from(byDomain.values()).sort((a, b) => {
    const aMath = isMathDomain(a.domain_code);
    const bMath = isMathDomain(b.domain_code);
    if (aMath !== bMath) return aMath ? 1 : -1;
    return (a.domain_name ?? '').localeCompare(b.domain_name ?? '');
  });

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Tutor · Performance</div>
        <h1 className={s.h1}>Roster performance</h1>
        <p className={s.sub}>
          Skill-level rollup across your students, last {data.windowDays} days
          of practice. Helps surface where the cohort is collectively weakest
          so you can plan the next lesson or assignment.
        </p>
      </header>

      <div className={s.statsStrip}>
        <StatTile
          label="Students in roster"
          value={data.rosterSize}
          sub={
            data.studentsWithActivity === 0
              ? 'No practice activity yet'
              : `${data.studentsWithActivity} active in window`
          }
        />
        <StatTile
          label="Cohort attempts"
          value={data.totalAttempts.toLocaleString()}
          sub={
            data.totalAttempts === 0
              ? 'Nothing recorded'
              : `Across ${data.skills.length} skill${data.skills.length === 1 ? '' : 's'}`
          }
          spark={
            data.trend?.length > 0 ? (
              <Sparkline
                data={data.trend}
                field="attempts"
                tone="cyan"
                ariaLabel="Cohort weekly attempt volume"
              />
            ) : null
          }
          delta={
            data.trend?.length >= 2 ? (() => {
              const last = data.trend[data.trend.length - 1];
              const prev = data.trend[data.trend.length - 2];
              return (
                <Delta
                  current={last?.attempts ?? 0}
                  prior={prev?.attempts ?? 0}
                  format="count"
                  suffix="vs last week"
                />
              );
            })() : null
          }
        />
        <StatTile
          label="Lookback window"
          value={`${data.windowDays}d`}
          sub="Practice attempts only"
        />
        <StatTile
          label="Skills evaluated"
          value={data.skills.length}
          sub={
            data.skills.length === 0
              ? 'Need 5+ cohort attempts'
              : 'Min 5 cohort attempts each'
          }
        />
      </div>

      {/* Cohort progress — weekly trend over the lookback window */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <div>
            <h2 className={s.h2}>
              <IconTile icon={ProgressIcon} palette="success" size="md" />
              Cohort progress
            </h2>
            <p className={s.cardHint}>
              Weekly cohort accuracy (gold line) over the last {data.windowDays}
              {' '}days, layered against attempt volume (cyan bars). Empty weeks
              are gaps — the line skips over them rather than dipping to 0%.
            </p>
          </div>
        </div>
        {data.totalAttempts === 0 ? (
          <EmptyHint
            title="No activity yet."
            body="Once your students start answering questions, the weekly trend lights up here."
          />
        ) : (
          <WeeklyTrendChart trend={data.trend} />
        )}
      </section>

      {/* Skill heatmap */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <div>
            <h2 className={s.h2}>
              <IconTile icon={PerformanceIcon} palette="cyan" size="md" />
              Skill heatmap
            </h2>
            <p className={s.cardHint}>
              Every skill the roster has worked on at least 5 times in the
              last {data.windowDays} days, grouped by domain. Each tile is
              colored by cohort accuracy — red &lt; 60%, amber 60–80%,
              green ≥ 80%. The "N below" pill counts students whose own
              accuracy on the skill is under 60% (3+ attempts only).
            </p>
          </div>
          <PerformanceSortToolbar initialSort={sort} />
        </div>

        {sortedSkills.length === 0 ? (
          <EmptyHint
            title="Not enough activity yet."
            body="Once your roster has 5+ attempts on a skill, it will appear here."
          />
        ) : (
          <div className={s.domainStack}>
            {domainGroups.map((group) => (
              <div key={group.domain_name ?? '—'} className={s.domainBlock}>
                <div className={s.domainHead}>
                  <span
                    className={
                      isMathDomain(group.domain_code) ? s.domainPillMath : s.domainPillRw
                    }
                  >
                    {isMathDomain(group.domain_code) ? 'Math' : 'RW'}
                  </span>
                  <span className={s.domainName}>{group.domain_name ?? 'Other'}</span>
                  <span className={s.domainCount}>
                    {group.skills.length} skill{group.skills.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className={s.skillGrid}>
                  {group.skills.map((sk) => (
                    <SkillTile key={sk.skill_code} skill={sk} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SkillTile({ skill }) {
  const accPct = Math.round(skill.accuracy * 100);
  const tone = accuracyToneClass(accPct);
  return (
    <div
      className={`${s.skillTile} ${tone}`}
      title={`${skill.skill_name} · ${accPct}% on ${skill.attempts} attempts · ${skill.studentsTouched} student${skill.studentsTouched === 1 ? '' : 's'} touched`}
    >
      <div className={s.skillTileTop}>
        <div className={s.skillTileName}>{skill.skill_name}</div>
        {skill.studentsBelow60 > 0 && (
          <span className={s.belowPill} title={`${skill.studentsBelow60} students below 60%`}>
            {skill.studentsBelow60}
          </span>
        )}
      </div>
      <div className={s.skillTilePct}>{accPct}%</div>
      <div className={s.skillTileSub}>
        {skill.attempts} attempt{skill.attempts === 1 ? '' : 's'}
        {' · '}
        {skill.studentsTouched} student{skill.studentsTouched === 1 ? '' : 's'}
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, spark, delta }) {
  return (
    <div className={s.statTile}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValueRow}>
        <div className={s.statValue}>{value}</div>
        {spark}
      </div>
      <div className={s.statSubRow}>
        {sub && <div className={s.statSub}>{sub}</div>}
        {delta}
      </div>
    </div>
  );
}

function EmptyHint({ title, body }) {
  return (
    <div className={s.empty}>
      <div className={s.emptyTitle}>{title}</div>
      <div className={s.emptyBody}>{body}</div>
    </div>
  );
}

function accuracyToneClass(pct) {
  if (pct >= 80) return s.toneGood;
  if (pct >= 60) return s.toneOk;
  return s.toneBad;
}

// SAT domain codes are single letters; Math uses H/P/Q/S
// (Algebra, Advanced Math, Problem solving / Data analysis,
// Geometry & trig). Anything else falls into RW.
function isMathDomain(code) {
  return code === 'H' || code === 'P' || code === 'Q' || code === 'S';
}
