// Profile status badge — Active / Inactive / Exempt. Used on
// the user list + detail pages to make subscription / activation
// state legible at a glance.
//
// Two-prop API:
//   <StatusBadge active={profile.is_active !== false} exempt={profile.subscription_exempt} />
// `inactive` wins, then `exempt`, then `active` is the default.

import s from './StatusBadge.module.css';

/**
 * @param {object} props
 * @param {boolean} props.active
 * @param {boolean} [props.exempt]
 */
export function StatusBadge({ active, exempt }) {
  if (active === false) {
    return <span className={`${s.badge} ${s.inactive}`}>Inactive</span>;
  }
  if (exempt) {
    return <span className={`${s.badge} ${s.exempt}`}>Exempt</span>;
  }
  return <span className={`${s.badge} ${s.active}`}>Active</span>;
}
