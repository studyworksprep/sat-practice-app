// Stacked-skill breakdown card. One row per domain; the row's bar
// is split into skill segments where:
//   - segment width  ∝ question count for that skill
//   - segment color  = accuracy bucket (red < 50, amber 50–75, green ≥ 75)
//   - 🎯 marker      = skill is in the caller-supplied "priority" set
//                       (top-N rows of the opportunity index)
//   - hover          = tooltip carrying skill name + correct/total + pct
//
// Beneath the bars, a compact Top Opportunities strip surfaces the
// three skills with the highest opportunity_index for this subject:
// learnability + current accuracy + OI score, plus a one-line
// explainer. The marker on the bar is the visual cue; this strip
// is the "what does it mean / where do I focus" companion that the
// old standalone Opportunity Index card used to provide.
//
// Domain shape:
//   { name, correct, total,
//     skills: [{ name, correct, total, isPriority?: boolean }] }
//
// Opportunity row shape (matches buildOpportunity output):
//   { skill_name, domain_name, learnability, correct, total,
//     opportunity_index }

'use client';

import s from './SkillBreakdownCard.module.css';

/**
 * @param {object} props
 * @param {string} props.title - card heading (e.g. "Reading & Writing")
 * @param {'rw'|'math'} props.tone
 * @param {Array<{
 *   name: string,
 *   correct: number,
 *   total: number,
 *   skills: Array<{
 *     name: string,
 *     correct: number,
 *     total: number,
 *     isPriority?: boolean,
 *   }>,
 * }>} props.domains
 * @param {Array<{
 *   skill_name: string,
 *   domain_name: string,
 *   learnability: number,
 *   correct: number,
 *   total: number,
 *   opportunity_index: number,
 * }>} [props.opportunities] - already filtered to this subject and
 *   sorted by opportunity_index DESC. The card slices the top 3.
 */
export function SkillBreakdownCard({ title, tone, domains, opportunities = [] }) {
  if (!domains || domains.length === 0) return null;

  let sectCorrect = 0;
  let sectTotal = 0;
  for (const d of domains) {
    sectCorrect += d.correct ?? 0;
    sectTotal += d.total ?? 0;
  }
  const sectPct = sectTotal > 0 ? Math.round((sectCorrect / sectTotal) * 100) : null;
  const sectPctCls = tone === 'rw' ? s.titlePctRw : s.titlePctMath;

  const topOpps = opportunities.slice(0, 3);

  return (
    <div className={s.card}>
      <div className={s.header}>
        <div className={s.title}>{title}</div>
        <div className={sectPctCls}>{sectPct == null ? '—' : `${sectPct}%`}</div>
      </div>
      <div className={s.legend} aria-hidden="true">
        <span className={`${s.legendDot} ${s.bucketLow}`} /> &lt; 50%
        <span className={`${s.legendDot} ${s.bucketMid}`} /> 50–74%
        <span className={`${s.legendDot} ${s.bucketHigh}`} /> 75%+
        <span className={s.legendSep}>·</span>
        <span className={s.legendPriority}>🎯 priority skill</span>
      </div>
      <ul className={s.domainList}>
        {domains.map((d) => {
          const total = d.total ?? 0;
          const correct = d.correct ?? 0;
          const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
          return (
            <li key={d.name} className={s.domain}>
              <div className={s.domainHead}>
                <div className={s.domainName}>{d.name}</div>
                <div className={s.domainStat}>
                  {correct}/{total} · <span className={s.domainPct}>{pct}%</span>
                </div>
              </div>
              <div
                className={s.bar}
                role="img"
                aria-label={`${d.name}: ${correct} of ${total} correct, ${pct} percent`}
              >
                {(d.skills ?? []).map((sk) => {
                  const skTotal = sk.total ?? 0;
                  if (skTotal <= 0) return null;
                  const skPct = Math.round(((sk.correct ?? 0) / skTotal) * 100);
                  const bucket = bucketClass(s, skPct);
                  return (
                    <div
                      key={sk.name}
                      className={`${s.segment} ${bucket}`}
                      style={{ flexGrow: skTotal }}
                      title={`${sk.name}: ${sk.correct}/${skTotal} · ${skPct}%${
                        sk.isPriority ? ' · priority' : ''
                      }`}
                    >
                      {sk.isPriority && (
                        <span className={s.segmentPriority} aria-hidden="true">🎯</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {topOpps.length > 0 && (
        <div className={s.opps}>
          <div className={s.oppsHeader}>
            <div className={s.oppsTitle}>Top opportunities 🎯</div>
            <div className={s.oppsBlurb}>
              <strong>Opportunity = learnability × wrong-question impact.</strong>{' '}
              Higher = more score lift available. Start here.
            </div>
          </div>
          <ol className={s.oppsList}>
            {topOpps.map((o, i) => {
              const acc = o.total > 0 ? Math.round((o.correct / o.total) * 100) : 0;
              return (
                <li key={`${o.skill_name}-${i}`} className={s.oppsRow}>
                  <span className={s.oppsRank}>{i + 1}</span>
                  <div className={s.oppsBody}>
                    <div className={s.oppsSkill}>{o.skill_name}</div>
                    <div className={s.oppsDomain}>{o.domain_name}</div>
                  </div>
                  <div className={s.oppsStats}>
                    <span className={s.oppsStat}>
                      <span className={s.oppsStatLabel}>Learn</span>
                      <span className={s.oppsStatValue}>
                        {o.learnability != null ? `${Math.round(o.learnability * 10) / 10}/10` : '—'}
                      </span>
                    </span>
                    <span className={s.oppsStat}>
                      <span className={s.oppsStatLabel}>Acc</span>
                      <span className={s.oppsStatValue}>
                        {acc}% <span className={s.oppsStatDim}>({o.correct}/{o.total})</span>
                      </span>
                    </span>
                    <span className={s.oppsScore} title="Opportunity index">
                      {o.opportunity_index.toFixed(1)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function bucketClass(s, pct) {
  if (pct >= 75) return s.bucketHigh;
  if (pct >= 50) return s.bucketMid;
  return s.bucketLow;
}
