// Profile status badge — Active / Inactive / Banned. Three-state
// pill rendered on the user list + detail pages. Banned wins over
// Inactive (a banned user is also is_active=false in practice, but
// the ban supersedes the manual archive). Subscription state is a
// separate concern; see SubscriptionBadge.

import s from './StatusBadge.module.css';

/**
 * @param {object} props
 * @param {boolean} props.active   — profile.is_active !== false
 * @param {boolean} [props.banned] — profile.banned_at != null
 */
export function StatusBadge({ active, banned }) {
  if (banned) {
    return <span className={`${s.badge} ${s.banned}`}>Banned</span>;
  }
  if (active === false) {
    return <span className={`${s.badge} ${s.inactive}`}>Inactive</span>;
  }
  return <span className={`${s.badge} ${s.active}`}>Active</span>;
}
