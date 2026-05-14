// Domain / skill breakdown card. Per-subject card showing each
// domain's correct/total + per-skill subrows, with an accuracy
// bar in the subject color.
//
// Originally inlined inside TestResultsInteractive; lifted here
// so the assignment report uses the same look and the styles
// stay in one place. Caller decides which subject to show by
// passing tone='rw' or 'math' and the matching domains array.
//
// Domain shape:
//   { name, correct, total, skills: [{ name, correct, total }] }
//
// (TestResultsInteractive's `domain_name` / `skill_name` shape
// gets normalized to `name` via the helpers in this file's
// companion module if a caller is on the older shape.)

'use client';

import s from './DomainBreakdownCard.module.css';

/**
 * @param {object} props
 * @param {string} props.title - card heading (e.g. "Reading & Writing")
 * @param {'rw' | 'math'} props.tone
 * @param {Array<{
 *   name: string,
 *   correct: number,
 *   total: number,
 *   skills: Array<{ name: string, correct: number, total: number }>,
 * }>} props.domains
 */
export function DomainBreakdownCard({ title, tone, domains }) {
  if (!domains || domains.length === 0) return null;
  const fillCls = tone === 'rw' ? s.barFillRw : s.barFillMath;
  const sectPctCls = tone === 'rw' ? s.titlePctRw : s.titlePctMath;
  let sectCorrect = 0;
  let sectTotal = 0;
  for (const d of domains) {
    sectCorrect += d.correct ?? 0;
    sectTotal += d.total ?? 0;
  }
  const sectPct = sectTotal > 0 ? Math.round((sectCorrect / sectTotal) * 100) : null;

  return (
    <div className={s.card}>
      <div className={s.header}>
        <div className={s.title}>{title}</div>
        <div className={sectPctCls}>{sectPct == null ? '—' : `${sectPct}%`}</div>
      </div>
      {domains.map((d) => {
        const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
        return (
          <div key={d.name} className={s.domain}>
            <div className={s.domainHead}>
              <div className={s.domainName}>{d.name}</div>
              <div className={s.domainStat}>
                {d.correct}/{d.total}
                <span className={s.domainPct}> · {pct}%</span>
              </div>
            </div>
            <div className={s.bar}>
              <div className={fillCls} style={{ width: `${pct}%` }} />
            </div>
            {d.skills && d.skills.length > 0 && (
              <ul className={s.skillList}>
                {d.skills.map((sk) => {
                  const sp = sk.total > 0 ? Math.round((sk.correct / sk.total) * 100) : 0;
                  return (
                    <li key={sk.name} className={s.skillRow}>
                      <span className={s.skillName}>{sk.name}</span>
                      <span className={s.skillStat}>
                        {sk.correct}/{sk.total}
                        <span className={s.skillPct}> · {sp}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Domain code → 'RW' | 'MATH' bucket. SAT math codes are H/P/Q/S
// and RW codes are INI/CAS/EOI/SEC. ACT carries the section string
// in the same slot via the loader fork (lib/practice/load-act-question.ts)
// — 'math' / 'science' route to MATH, 'english' / 'reading' route
// to RW so the existing 2-column SkillBreakdownCard layout keeps
// working unchanged. Unknown codes fall through to MATH (safer
// default than RW, since most unknowns historically come from
// math-side legacy taxonomy).
const MATH_DOMAIN_CODES = new Set(['H', 'P', 'Q', 'S', 'math', 'science']);
const RW_DOMAIN_CODES = new Set(['CAS', 'EOI', 'INI', 'SEC', 'english', 'reading']);

export function subjectFromDomainCode(code) {
  if (!code) return null;
  if (MATH_DOMAIN_CODES.has(code)) return 'MATH';
  if (RW_DOMAIN_CODES.has(code)) return 'RW';
  return 'MATH';
}
