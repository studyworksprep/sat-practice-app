// Plan selection / checkout entry. Anyone landing here who already
// has access (paid sub, exempt, or admin/manager role) is bounced
// to /dashboard server-side — the legacy version flashed the picker
// briefly before a useEffect-driven redirect. Anonymous visitors
// see the picker too; Stripe checkout will route them through login
// before billing starts.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { userHasAccess } from '@/lib/subscription';
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
  try {
    const ctx = await requireUser();
    signedIn = true;
    const access = await userHasAccess(ctx.supabase, ctx.user.id);
    if (access.hasAccess) redirect('/dashboard');
  } catch {
    // No session — render the picker; Stripe will route through
    // login before charging.
  }

  return <SubscribeClient canceled={canceled} signedIn={signedIn} />;
}
