// Student sidebar footer strip (§6.1) — the countdown + streak
// slot AppSidebar reserved when the shell shipped. Pure render:
// the student layout computes everything server-side (plan test
// date with profile fallback — dashboard precedence — and the
// get_practice_streak RPC) and passes plain values, matching the
// StudyCountdown convention of snapshotting "now" once per render.

import s from './SidebarFooterStrip.module.css';

export interface SidebarFooterStripProps {
  /** Whole days until the test; null when no date is set. */
  daysToTest: number | null;
  /** Short label for the date, e.g. "Aug 26". */
  testDateLabel: string | null;
  currentStreak: number;
  practicedToday: boolean;
}

export function SidebarFooterStrip({
  daysToTest,
  testDateLabel,
  currentStreak,
  practicedToday,
}: SidebarFooterStripProps) {
  const showCountdown = daysToTest != null && daysToTest >= 0;

  return (
    <div className={s.strip}>
      {showCountdown && (
        <div className={s.tile}>
          <span className={s.value}>{daysToTest === 0 ? 'Today' : daysToTest}</span>
          <span className={s.label}>
            {daysToTest === 0
              ? 'is test day'
              : `day${daysToTest === 1 ? '' : 's'} to ${testDateLabel ?? 'test'}`}
          </span>
        </div>
      )}
      <div className={practicedToday && currentStreak > 0 ? `${s.tile} ${s.tileLit}` : s.tile}>
        <span className={s.value}>{currentStreak}</span>
        <span className={s.label}>
          {currentStreak === 0
            ? 'day streak — one question starts it'
            : practicedToday
              ? 'day streak · done today'
              : 'day streak · practice today'}
        </span>
      </div>
    </div>
  );
}
