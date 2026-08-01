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
        <div className={s.row}>
          <span className={s.value}>
            {daysToTest === 0 ? 'Test day' : `${daysToTest} day${daysToTest === 1 ? '' : 's'}`}
          </span>
          <span className={s.label}>
            {daysToTest === 0 ? 'good luck!' : `to test${testDateLabel ? ` · ${testDateLabel}` : ''}`}
          </span>
        </div>
      )}
      <div className={s.row}>
        {currentStreak > 0 ? (
          <>
            <span className={`${s.value} ${practicedToday ? s.valueLit : ''}`}>
              {currentStreak}-day streak
            </span>
            <span className={s.label}>
              {practicedToday ? 'practiced today' : 'practice today to keep it'}
            </span>
          </>
        ) : (
          <>
            <span className={s.value}>No streak yet</span>
            <span className={s.label}>one question starts one</span>
          </>
        )}
      </div>
    </div>
  );
}
