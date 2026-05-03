// Stacked-skill breakdown card. One row per domain; the row's bar
// is split into skill segments where:
//   - segment width  ∝ question count for that skill
//   - segment color  = accuracy bucket (red < 50, amber 50–75, green ≥ 75)
//   - 🎯 marker      = skill is in the caller-supplied "priority" set
//                       (typically the top-N rows of the opportunity index)
//
// Replaces the old <DomainBreakdownCard> + <OpportunityTable> pair on
// the practice-test results surface. The two used to surface the same
// underlying signal (per-skill accuracy × volume) twice in two long
// vertical lists; this component fuses them into a single compact
// row per domain so the page stops paging endlessly through 30+
// skill rows.
//
// Specificity preserved: every per-skill correct/total + accuracy
// number still appears in the caption row beneath each bar; hovering
// a segment surfaces the same numbers as a tooltip for fine targets.
//
// Domain shape (same as DomainBreakdownCard):
//   { name, correct, total,
//     skills: [{ name, correct, total, isPriority?: boolean }] }

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
 */
export function SkillBreakdownCard({ title, tone, domains }) {
  if (!domains || domains.length === 0) return null;

  let sectCorrect = 0;
  let sectTotal = 0;
  for (const d of domains) {
    sectCorrect += d.correct ?? 0;
    sectTotal += d.total ?? 0;
  }
  const sectPct = sectTotal > 0 ? Math.round((sectCorrect / sectTotal) * 100) : null;
  const sectPctCls = tone === 'rw' ? s.titlePctRw : s.titlePctMath;

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
              <ul className={s.skillCaptions}>
                {(d.skills ?? []).map((sk) => {
                  const skTotal = sk.total ?? 0;
                  const skPct = skTotal > 0
                    ? Math.round(((sk.correct ?? 0) / skTotal) * 100)
                    : 0;
                  return (
                    <li
                      key={sk.name}
                      className={`${s.skillCaption} ${
                        sk.isPriority ? s.skillCaptionPriority : ''
                      }`}
                    >
                      {sk.isPriority && (
                        <span className={s.captionPriority} aria-hidden="true">🎯</span>
                      )}
                      <span className={s.captionName}>{sk.name}</span>
                      <span className={s.captionStat}>
                        {sk.correct}/{skTotal} · {skPct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function bucketClass(s, pct) {
  if (pct >= 75) return s.bucketHigh;
  if (pct >= 50) return s.bucketMid;
  return s.bucketLow;
}
