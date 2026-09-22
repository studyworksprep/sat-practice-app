// True iff the student has answered at least one question on the
// platform. Used by the login routing gate (student layout) and the
// /welcome page: a student with practice history is an existing
// user, not a new signup, and is never bounced into the onboarding
// intake (docs/student-onboarding-and-plan-redesign-2026-09.md §3.1).
//
// A `limit(1)` existence probe rather than an exact count — attempts
// is the largest table and this runs on every dashboard render for
// a student without a plan.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

export async function hasPracticeHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('attempts')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return (data ?? []).length > 0;
}
