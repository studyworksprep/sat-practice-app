import { teacherPriceLabel } from '@/lib/billing/teacher-pricing.mjs';
import { studentPriceLabel } from '@/lib/billing/student-pricing.mjs';
// Plan selection / checkout entry. Anyone landing here who already
// has access (paid sub, exempt, or admin/manager role) is bounced
// to /dashboard server-side — the legacy version flashed the picker
// briefly before a useEffect-driven redirect. Anonymous visitors
// see the picker too; Stripe checkout will route them through login
// before billing starts.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { userHasAccess } from '@/lib/subscription';
import { planForRole, homePathForRole } from '@/lib/billing/plan-for-role';
import { SubscribeClient } from './SubscribeClient';
import { publicPageMetadata } from '@/lib/config/site';

export const dynamic = 'force-dynamic';

export const metadata = publicPageMetadata({
  path: '/subscribe',
  title: 'Plans & pricing — Studyworks',
  description:
    'Studyworks plans for students and tutors. Students working with a ' +
    'Studyworks Prep tutor get full access at no cost.',
});

export default async function SubscribePage(props) {
  const searchParams = (await props.searchParams) ?? {};
  const canceled = searchParams.checkout === 'canceled';

  let signedIn = false;
  const prospectiveSignup = new Date().toISOString();
  let studentPrice = studentPriceLabel(prospectiveSignup);
  let teacherPrice = teacherPriceLabel(prospectiveSignup);
  let hasAccess = false;
  let role = null;
  try {
    const ctx = await requireUser();
    signedIn = true;
    role = ctx.profile?.role ?? null;
    studentPrice = studentPriceLabel(ctx.user.created_at);
    teacherPrice = teacherPriceLabel(ctx.user.created_at);
    const access = await userHasAccess(ctx.supabase, ctx.user.id);
    hasAccess = access.hasAccess;
  } catch {
    // No session — render the picker; Stripe will route through
    // login before charging.
  }

  if (hasAccess) redirect(homePathForRole(role));

  // A signed-in account sees only the plan its role may buy (a tutor
  // can't pick the cheaper student plan); visitors see both.
  const onlyPlan = signedIn ? planForRole(role) : null;

  return (
    <SubscribeClient
      teacherPrice={teacherPrice}
      studentPrice={studentPrice}
      canceled={canceled}
      signedIn={signedIn}
      onlyPlan={onlyPlan}
    />
  );
}
