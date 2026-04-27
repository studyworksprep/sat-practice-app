// Tutor → Performance. Roster-wide aggregations to answer "what
// should I focus on?". Tier 1 of the planned performance surface
// (handoff doc §performance) — skill heatmap + common-errors
// rollup. Trends and per-test breakdowns are queued for later
// tiers.
//
// Server-rendered; one loader call does the whole aggregation
// and the page renders the result. The sort dropdown is the only
// interactive element, and lives in PerformanceSortToolbar.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { PerformanceIcon, SparklesIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { loadRosterPerformance, sortSkills } from './loader';
import { PerformanceSortToolbar } from './PerformanceSortToolbar';
import s from './Performance.module.css';

export const dynamic = 'force-dynamic';

const COMMON_ERRORS_TOP_N = 10;

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

  // Common errors: independent of the heatmap's sort, always
  // ranked by raw cohort misses so the headline weak-spot list
  // doesn't shift when the user re-sorts the heatmap.
  const commonErrors = [...data.skills]
    .filter((sk) => sk.attempts - sk.correct > 0)
    .sort((a, b) => {
      const missA = a.attempts - a.correct;
      const missB = b.attempts - b.correct;
      return missB - missA
        || b.studentsBelow60 - a.studentsBelow60
        || a.accuracy - b.accuracy;
    })
    .slice(0, COMMON_ERRORS_TOP_N);

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

      <section className={s.card}>
        <div className={s.cardHead}>
          <div>
            <h2 className={s.h2}>
              <IconTile icon={SparklesIcon} palette="amber" size="md" />
              Common errors
            </h2>
            <p className={s.cardHint}>
              Skills with the most missed questions across the roster.
              Static ranking — independent of the heatmap sort below.
            </p>
          </div>
        </div>
        {commonErrors.length === 0 ? (
          <EmptyHint
            title="No errors yet."
            body="As your students answer questions, the toughest skills surface here."
          />
        ) : (
          <ol className={s.errorsList}>
            {commonErrors.map((sk, i) => {
              const missed = sk.attempts - sk.correct;
              const accPct = Math.round(sk.accuracy * 100);
              return (
                <li key={sk.skill_code} className={s.errorRow}>
                  <span className={s.errorRank}>{i + 1}</span>
                  <div className={s.errorBody}>
                    <div className={s.errorSkill}>{sk.skill_name}</div>
                    <div className={s.errorMeta}>
                      {sk.domain_name && (
                        <span className={s.errorDomain}>{sk.domain_name}</span>
                      )}
                      <span>{missed} missed of {sk.attempts}</span>
                      <span>·</span>
                      <span className={accuracyToneClass(accPct)}>{accPct}% cohort</span>
                      {sk.studentsBelow60 > 0 && (
                        <>
                          <span>·</span>
                          <span className={s.errorStrugglers}>
                            {sk.studentsBelow60} student
                            {sk.studentsBelow60 === 1 ? '' : 's'} below 60%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={s.card}>
        <div className={s.cardHead}>
          <div>
            <h2 className={s.h2}>
              <IconTile icon={PerformanceIcon} palette="cyan" size="md" />
              Skill heatmap
            </h2>
            <p className={s.cardHint}>
              Every skill the roster has worked on at least 5 times in the last{' '}
              {data.windowDays} days. The default order surfaces skills where
              the most students are below 60% accuracy.
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
          <div className={s.heatmapWrap}>
            <table className={s.heatmap}>
              <thead>
                <tr>
                  <th className={s.thSkill}>Skill</th>
                  <th className={s.thNum}>Attempts</th>
                  <th className={s.thNum}>Cohort accuracy</th>
                  <th className={s.thNum}>Students touched</th>
                  <th className={s.thNum}>Students &lt; 60%</th>
                </tr>
              </thead>
              <tbody>
                {sortedSkills.map((sk) => {
                  const accPct = Math.round(sk.accuracy * 100);
                  return (
                    <tr key={sk.skill_code}>
                      <td className={s.tdSkill}>
                        <div className={s.skillName}>{sk.skill_name}</div>
                        {sk.domain_name && (
                          <div className={s.skillDomain}>{sk.domain_name}</div>
                        )}
                      </td>
                      <td className={s.tdNum}>{sk.attempts}</td>
                      <td className={s.tdNum}>
                        <span className={`${s.accBar} ${accuracyTone(accPct)}`}>
                          <span
                            className={s.accFill}
                            style={{ width: `${accPct}%` }}
                          />
                          <span className={s.accValue}>{accPct}%</span>
                        </span>
                      </td>
                      <td className={s.tdNum}>{sk.studentsTouched}</td>
                      <td className={s.tdNum}>
                        {sk.studentsBelow60 > 0 ? (
                          <span className={s.belowPill}>{sk.studentsBelow60}</span>
                        ) : (
                          <span className={s.belowZero}>0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className={s.statTile}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
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

function accuracyTone(pct) {
  if (pct >= 80) return s.accGood;
  if (pct >= 60) return s.accOk;
  return s.accBad;
}

function accuracyToneClass(pct) {
  if (pct >= 80) return s.pctGood;
  if (pct >= 60) return s.pctOk;
  return s.pctBad;
}
