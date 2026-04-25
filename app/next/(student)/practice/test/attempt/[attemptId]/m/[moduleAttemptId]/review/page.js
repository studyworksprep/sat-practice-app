// Module-end review page — Bluebook's "Check your work" screen
// before the student submits a module. Shows a grid of question
// bubbles (answered / flagged / unanswered), lets them jump back
// to any question, and submits the module via finishModule.
//
// Unlike the per-question runner, this page shares the session
// shell via the (student) layout but doesn't need a custom
// timer panel — the countdown continues from the client island
// below.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { finishModule } from '../../../../../actions';
import { ModuleReviewInteractive } from './ModuleReviewInteractive';

export const dynamic = 'force-dynamic';

export default async function ModuleReviewPage({ params }) {
  const { attemptId, moduleAttemptId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const { data: moduleAttempt } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      id, started_at, finished_at, practice_test_attempt_id,
      practice_test_module:practice_test_modules_v2(
        id, subject_code, module_number, time_limit_seconds,
        practice_test:practice_tests_v2(name)
      ),
      practice_test_attempt:practice_test_attempts_v2(user_id, status, time_multiplier)
    `)
    .eq('id', moduleAttemptId)
    .maybeSingle();
  if (!moduleAttempt) notFound();
  if (moduleAttempt.practice_test_attempt.user_id !== user.id) notFound();
  if (moduleAttempt.practice_test_attempt_id !== attemptId) notFound();
  if (moduleAttempt.finished_at) {
    redirect(`/practice/test/attempt/${attemptId}`);
  }

  const [{ data: moduleItems }, { data: itemAttempts }] = await Promise.all([
    supabase
      .from('practice_test_module_items_v2')
      .select('id, ordinal')
      .eq('practice_test_module_id', moduleAttempt.practice_test_module.id)
      .order('ordinal', { ascending: true }),
    supabase
      .from('practice_test_item_attempts_v2')
      .select(`
        practice_test_module_item_id,
        marked_for_review,
        attempt:attempts(response_text)
      `)
      .eq('practice_test_module_attempt_id', moduleAttemptId),
  ]);

  const itemAttemptsByItemId = new Map();
  for (const ia of itemAttempts ?? []) {
    itemAttemptsByItemId.set(ia.practice_test_module_item_id, ia);
  }

  // `position` is the 0-indexed array index, not the raw ordinal,
  // because the runner's URL parses position as an array offset
  // (`moduleItems[position]`). If we used ordinal here and the
  // seed data was 1-indexed, the bubbles would link to the wrong
  // URLs.
  const items = (moduleItems ?? []).map((it, idx) => {
    const ia = itemAttemptsByItemId.get(it.id);
    const answered = ia?.attempt?.response_text != null && ia.attempt.response_text !== '';
    return {
      position: idx,
      moduleItemId: it.id,
      answered,
      marked: !!ia?.marked_for_review,
    };
  });

  const mod = moduleAttempt.practice_test_module;
  const mult = Number(moduleAttempt.practice_test_attempt.time_multiplier) || 1;
  const moduleInfo = {
    subject: mod.subject_code,
    moduleNumber: mod.module_number,
    timeLimitSeconds: Math.round(mod.time_limit_seconds * mult),
    startedAt: moduleAttempt.started_at,
    testName: mod.practice_test?.name ?? 'Practice test',
  };

  return (
    <ModuleReviewInteractive
      attemptId={attemptId}
      moduleAttemptId={moduleAttemptId}
      moduleInfo={moduleInfo}
      items={items}
      finishModuleAction={finishModule}
    />
  );
}
