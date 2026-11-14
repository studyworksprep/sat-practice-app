// Roster badge for a student's access (roster_plan_status(), migration
// 20261114115405). Students a tutor invites subscribe themselves, and
// until they do they can't open practice, lessons or assignments — so
// the tutor needs to see that before assigning work. Only actionable
// states get a badge; sponsored and paying students show nothing.

export interface RosterAccessRow {
  access: string;
  subscription_status: string | null;
  trial_end: string | null;
}

export interface RosterAccessBadge {
  tone: 'warn' | 'info';
  label: string;
  /** Hover text explaining what the state means for the tutor. */
  title: string;
}

const LOCKED_OUT =
  'They can’t open practice, lessons or assignments until they subscribe.';

function shortDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function rosterAccessBadge(row: RosterAccessRow | null | undefined): RosterAccessBadge | null {
  if (!row) return null;

  if (row.access === 'trial') {
    const until = row.trial_end ? shortDate(row.trial_end) : null;
    return {
      tone: 'info',
      label: until ? `Trial until ${until}` : 'On free trial',
      title: 'On the 7-day free trial. Their subscription starts when the trial ends.',
    };
  }

  if (row.access === 'none') {
    if (row.subscription_status === 'past_due' || row.subscription_status === 'unpaid') {
      return {
        tone: 'warn',
        label: 'Payment failed',
        title: `Their subscription payment failed. ${LOCKED_OUT}`,
      };
    }
    return { tone: 'warn', label: 'Needs a subscription', title: LOCKED_OUT };
  }

  return null;
}
