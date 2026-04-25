// Attempt-entry router. Works out where inside the attempt the
// student should land:
//
//   - status='completed'   → /results
//   - status='abandoned'   → /practice/start with a note
//   - status='in_progress' → the current module's runner, picking
//     the most recent un-finished module attempt
//
// Keeps the deep URL for each module runner stable so bookmarks /
// back-button behave predictably, while still giving the student
// a single /practice/test/attempt/[id] URL they can come back to.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

export default async function AttemptEntryPage({ params }) {
  const { attemptId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const { data: attempt } = await supabase
    .from('practice_test_attempts_v2')
    .select('id, user_id, status')
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt) notFound();
  if (attempt.user_id !== user.id) notFound();

  if (attempt.status === 'completed') {
    redirect(`/practice/test/attempt/${attemptId}/results`);
  }
  if (attempt.status === 'abandoned') {
    redirect('/practice/start?abandoned=1');
  }

  // In-progress — find the most recent module attempt that hasn't
  // been finished yet. Order by started_at desc so a test resumed
  // mid-flight picks up in the right module.
  const { data: current } = await supabase
    .from('practice_test_module_attempts_v2')
    .select('id, started_at, finished_at')
    .eq('practice_test_attempt_id', attemptId)
    .is('finished_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!current) {
    // All modules finished but the attempt isn't marked completed.
    // Belt-and-suspenders: shouldn't happen, but don't dead-end.
    redirect(`/practice/test/attempt/${attemptId}/results`);
  }

  redirect(`/practice/test/attempt/${attemptId}/m/${current.id}/0`);
}
