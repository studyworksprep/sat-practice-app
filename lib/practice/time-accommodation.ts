// Standing extended-time accommodation (profiles.time_accommodation).
//
// One setting per student, applied by default to every timed practice
// test: the SAT launch page and compact launcher pre-select it, the ACT
// hub's timing select starts on it, and starts that offer no choice
// (an ACT practice-test assignment) use it outright. A launch surface
// may still override it per attempt — the attempt rows keep recording
// the multiplier they actually ran with.
//
// Values mirror the ACT plan's multipliers (1, 1.5, 2); the SAT
// attempt column accepts a wider range but the UI only ever offers
// these three.

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTimeMultiplier, type ActTimeMultiplier } from './act-test-plan';

export type TimeAccommodation = ActTimeMultiplier;

export const TIME_ACCOMMODATIONS: readonly TimeAccommodation[] = [1, 1.5, 2] as const;

export const TIME_ACCOMMODATION_LABELS: Record<TimeAccommodation, string> = {
  1: 'Standard time',
  1.5: '1.5× time',
  2: '2× time',
};

/** Coerces a form value / DB value to 1, 1.5 or 2 (1 for anything else). */
export const parseTimeAccommodation: (v: unknown) => TimeAccommodation = parseTimeMultiplier;

/** The student's standing accommodation; 1 when unset or unreadable. */
export async function loadTimeAccommodation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<TimeAccommodation> {
  const { data } = await supabase
    .from('profiles')
    .select('time_accommodation')
    .eq('id', userId)
    .maybeSingle();
  return parseTimeMultiplier((data as { time_accommodation?: unknown } | null)?.time_accommodation);
}
