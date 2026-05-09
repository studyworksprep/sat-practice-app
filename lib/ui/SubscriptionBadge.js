// Subscription badge — separate from StatusBadge so the diagnostic
// signal (what the subscriptions table actually says) isn't tangled
// with the moderation flag (is_active / banned_at on profiles).
//
// Role qualifier (Teacher/Student) comes from subscriptions.plan, NOT
// profiles.role. That way a profile-vs-Stripe mismatch is visible at
// a glance — e.g. a profile.role='student' user whose Stripe
// subscription is on a teacher plan reads as "Teacher Subscription".
//
// Combinations rendered:
//   exempt + plan='teacher'   → "Teacher Exempt"
//   exempt + plan='student'   → "Student Exempt"
//   exempt + no row           → "Exempt"   (no plan to read from)
//   status='trialing'         → "<Plan> Trial"
//   status='active'           → "<Plan> Subscription"
//   status='past_due'         → "<Plan> Past Due"   (warning tone)
//   status='canceled'         → "<Plan> Canceled"   (muted tone)
//   status='unpaid' / other   → "<Plan> Unpaid"     (warning tone)
//   no row at all, not exempt → "None"              (muted tone)

import s from './SubscriptionBadge.module.css';

/**
 * @param {object} props
 * @param {boolean} [props.exempt]
 * @param {{ plan?: string|null, status?: string|null } | null} [props.subscription]
 */
export function SubscriptionBadge({ exempt, subscription }) {
  const plan = subscription?.plan ?? null;
  const status = subscription?.status ?? null;
  const planLabel = plan ? capitalize(plan) : null;

  if (exempt) {
    const label = planLabel ? `${planLabel} Exempt` : 'Exempt';
    return <span className={`${s.badge} ${s.exempt}`}>{label}</span>;
  }

  if (!subscription) {
    return <span className={`${s.badge} ${s.none}`}>None</span>;
  }

  const prefix = planLabel ?? 'Unknown';

  if (status === 'trialing') {
    return <span className={`${s.badge} ${s.trial}`}>{prefix} Trial</span>;
  }
  if (status === 'active') {
    return <span className={`${s.badge} ${s.active}`}>{prefix} Subscription</span>;
  }
  if (status === 'past_due') {
    return <span className={`${s.badge} ${s.warn}`}>{prefix} Past Due</span>;
  }
  if (status === 'canceled') {
    return <span className={`${s.badge} ${s.muted}`}>{prefix} Canceled</span>;
  }
  return <span className={`${s.badge} ${s.warn}`}>{prefix} Unpaid</span>;
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
