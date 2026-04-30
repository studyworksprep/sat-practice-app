// Labeled metric tile. The pattern accumulated five copies across
// admin/student/tutor pages before this extraction — visually
// identical, just re-inlined each time. Now a single CSS module
// using design tokens so the look matches the rest of the new
// tree (--card / --border / --shadow-sm / --fg1 / --fg3).

import s from './StatCard.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.value
 * @param {boolean} [props.small] - shrinks the value font for tight layouts
 */
export function StatCard({ label, value, small = false }) {
  return (
    <div className={s.card}>
      <div className={s.label}>{label}</div>
      <div className={small ? s.valueSmall : s.value}>
        {value ?? '—'}
      </div>
    </div>
  );
}
