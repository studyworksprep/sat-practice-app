// Account settings hub. One Server Component pulls every read in
// parallel — profile, linked teachers, subscription, access — and
// hands a single snapshot to the client island. No useEffect, no
// loading flashes; the page renders fully formed in the first
// paint. See docs/architecture-plan.md §3.4.
//
// Four sections render in the island:
//   - Profile (name, school, grad year, target SAT, test date, email)
//   - Practice experience (§3.2 step-back offers — students only)
//   - Teachers (linked list + add-by-code form)
//   - Subscription (status snapshot + manage / choose plan)
//
// The legacy /account/billing surface still works for direct
// links; this page links over to it for portal-style management.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { resolveDetoursEnabled } from '@/lib/practice/detour-preference.mjs';
import { userHasAccess } from '@/lib/subscription';
import {
  updateProfile,
  updateEmail,
  updateDetourPreference, updateTimeAccommodation,
  addTeacherCode,
  leaveTeacher,
} from './actions';
import { AccountClient } from './AccountClient';
import { parseTimeAccommodation } from '@/lib/practice/time-accommodation';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  let ctx;
  try {
    ctx = await requireUser();
  } catch {
    redirect('/login?next=/account');
  }
  const { user, supabase } = ctx;

  const [
    { data: profile },
    access,
    { data: tutorRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'first_name, last_name, email, high_school, graduation_year, target_sat_score, sat_test_date, role, user_type, subscription_exempt, teacher_invite_code, practice_detours_enabled, time_accommodation',
      )
      .eq('id', user.id)
      .maybeSingle(),
    userHasAccess(supabase, user.id),
    // The caller's tutors. Profiles RLS gives a student no path to
    // their tutor's row (a nested join here always came back null), so
    // my_tutors() returns just the shown fields — migration
    // 20261114012820.
    supabase.rpc('my_tutors'),
  ]);

  let subscription = null;
  if (access.reason === 'subscription') {
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, trial_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .maybeSingle();
    subscription = data;
  }

  const teachers = (tutorRows ?? []).map((t) => ({
    id: t.id,
    first_name: t.first_name,
    last_name: t.last_name,
    email: t.email,
    subscription_exempt: t.is_studyworks,
    sponsored: t.sponsored,
  }));

  // §3.2 step-back offers. The tutor-link read above already tells us
  // whether the derived default is off, so this costs no extra trip.
  const detourPreference = profile?.practice_detours_enabled ?? null;
  const hasAssignedTutor = teachers.length > 0;

  return (
    <AccountClient
      user={{ id: user.id, email: user.email ?? null }}
      profile={profile ?? {}}
      access={access}
      subscription={subscription}
      teachers={teachers}
      detours={{
        enabled: resolveDetoursEnabled({
          preference: detourPreference,
          hasAssignedTutor,
        }),
        isExplicit: typeof detourPreference === 'boolean',
        hasAssignedTutor,
      }}
      updateProfileAction={updateProfile}
      updateEmailAction={updateEmail}
      updateDetourPreferenceAction={updateDetourPreference}
      timeAccommodation={parseTimeAccommodation(profile?.time_accommodation)}
      updateTimeAccommodationAction={updateTimeAccommodation}
      addTeacherCodeAction={addTeacherCode}
      leaveTeacherAction={leaveTeacher}
    />
  );
}
