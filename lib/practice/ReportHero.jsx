// Shared hero block for the assignment + practice-session report
// surfaces. Mirrors the visual treatment of the practice-test
// score report (compositeCard + sectionTile pair) so all three
// review surfaces share one visual rhythm.
//
// Two pieces:
//
//   <ReportHero
//     primary={{ label, value, sub }}
//     tiles={[{ label, value, sub, tone }]}
//   />
//
// The primary block becomes the gradient "hero" card with the
// gold accent strip; the tiles render in a 1xN grid beneath. On
// narrow viewports the grid collapses to a stack.

import s from './ReportHero.module.css';

/**
 * @typedef {object} HeroPrimary
 * @property {string} label   — eyebrow over the headline number
 * @property {string} value   — headline number / text
 * @property {string} [sub]   — supporting line beneath
 *
 * @typedef {object} HeroTile
 * @property {string} label
 * @property {string} value
 * @property {string} [sub]
 * @property {'good' | 'ok' | 'bad' | 'neutral'} [tone]
 *
 * @param {{ primary: HeroPrimary, tiles?: HeroTile[] }} props
 */
export function ReportHero({ primary, tiles = [] }) {
  return (
    <div className={s.wrap}>
      <section className={s.hero}>
        <div className={s.heroLabel}>{primary.label}</div>
        <div className={s.heroValueRow}>
          <div className={s.heroValue}>{primary.value}</div>
          {primary.sub && <div className={s.heroSub}>{primary.sub}</div>}
        </div>
      </section>
      {tiles.length > 0 && (
        <section className={s.tiles}>
          {tiles.map((t, i) => (
            <div key={t.label + i} className={`${s.tile} ${toneClass(t.tone)}`}>
              <div className={s.tileLabel}>{t.label}</div>
              <div className={s.tileValue}>{t.value}</div>
              {t.sub && <div className={s.tileSub}>{t.sub}</div>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function toneClass(tone) {
  switch (tone) {
    case 'good': return s.toneGood;
    case 'ok':   return s.toneOk;
    case 'bad':  return s.toneBad;
    default:     return '';
  }
}
