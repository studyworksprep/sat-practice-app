// Which subscription plan an account may buy, decided by its role.
//
// The plan used to come straight from the checkout request body, and
// the access resolver doesn't look at which plan was bought — so a
// tutor could buy the cheaper student plan and still get every tutor
// feature. Checkout and the plan picker both read the plan from here
// instead (owner request 2026-11-14).

export type PurchasablePlan = 'student' | 'teacher';

/**
 * The one plan this role may buy, or null when the role never needs one
 * (admins and managers are staff and always have access).
 */
export function planForRole(role: string | null | undefined): PurchasablePlan | null {
  switch (role) {
    case 'teacher':
      return 'teacher';
    case 'admin':
    case 'manager':
      return null;
    // student, practice (exploring), contributor, or a missing profile:
    // the student plan is the only one that fits.
    default:
      return 'student';
  }
}

/**
 * Where Stripe sends the buyer after checkout. A tutor goes straight to
 * the tutor dashboard: routing them through /dashboard dropped the
 * `checkout=success` marker on the role redirect, so the proxy could
 * bounce a tutor who had just paid back to /subscribe before Stripe's
 * webhook arrived.
 */
export function checkoutReturnPath(plan: PurchasablePlan): string {
  return plan === 'teacher'
    ? '/tutor/dashboard?checkout=success'
    : '/dashboard?checkout=success';
}

/** Where an account that already has access belongs. */
export function homePathForRole(role: string | null | undefined): string {
  if (role === 'teacher' || role === 'manager') return '/tutor/dashboard';
  if (role === 'admin') return '/admin';
  return '/dashboard';
}
