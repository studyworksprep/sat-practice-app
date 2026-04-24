// Practice-test launch screen. Shows test name + a brief summary
// of what the student's about to sit through, and a form with a
// single Server Action that creates a fresh attempt + first
// module attempt, then redirects into the runner.
//
// Intentionally minimal. The full "directions" screen that
// Bluebook shows before each module lives inside the runner
// module transitions (future follow-up); this page exists only
// so a student doesn't start a timed test by clicking one link.

import { redirect, notFound } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { startTestAttempt } from '../actions';
import { LaunchInteractive } from './LaunchInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeTestLaunchPage({ params }) {
  const { testId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const { data: test } = await supabase
    .from('practice_tests_v2')
    .select('id, code, name, is_published, is_adaptive, deleted_at')
    .eq('id', testId)
    .maybeSingle();
  if (!test || !test.is_published || test.deleted_at) notFound();

  // Summarize the modules so the student sees what's coming.
  // Group by subject/module; ignore the routing twins (easy/hard)
  // in the display — a student sees one RW mod 1 + one RW mod 2 +
  // one MATH mod 1 + one MATH mod 2 on the summary, not six rows.
  const { data: modules } = await supabase
    .from('practice_test_modules_v2')
    .select('subject_code, module_number, route_code, time_limit_seconds')
    .eq('practice_test_id', testId);

  // Count items per module to show question count.
  const { data: itemCounts } = await supabase
    .from('practice_test_module_items_v2')
    .select('practice_test_module_id, practice_test_module:practice_test_modules_v2(subject_code, module_number, route_code)');

  const countsByKey = new Map();
  for (const it of itemCounts ?? []) {
    const m = it.practice_test_module;
    if (!m) continue;
    const key = `${m.subject_code}|${m.module_number}|${m.route_code}`;
    countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
  }

  const summary = summarizeModules(modules ?? [], countsByKey);

  // Check for an existing in-progress attempt on this test so we
  // can warn the student that starting a new one abandons the old.
  const { data: inProgress } = await supabase
    .from('practice_test_attempts_v2')
    .select('id, practice_test_id')
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .maybeSingle();

  return (
    <LaunchInteractive
      test={{
        id: test.id,
        code: test.code,
        name: test.name,
        isAdaptive: test.is_adaptive,
      }}
      summary={summary}
      inProgress={inProgress
        ? { attemptId: inProgress.id, sameTest: inProgress.practice_test_id === test.id }
        : null}
      startTestAttemptAction={startTestAttempt}
    />
  );
}

// One row per (subject, module_number), deduping the adaptive
// route twins for the summary. Time shown is the std-route time
// which matches module 1 exactly and is the midpoint for module
// 2 easy/hard (they're typically the same time limit anyway).
function summarizeModules(modules, countsByKey) {
  const seen = new Map();
  for (const m of modules) {
    const key = `${m.subject_code}|${m.module_number}`;
    if (seen.has(key)) continue;
    // Prefer 'std' route for the display time; fall back to first seen.
    const stdMatch = modules.find((x) =>
      x.subject_code === m.subject_code &&
      x.module_number === m.module_number &&
      x.route_code === 'std',
    ) ?? m;
    const countKey = `${m.subject_code}|${m.module_number}|${stdMatch.route_code}`;
    seen.set(key, {
      subject: m.subject_code,
      moduleNumber: m.module_number,
      timeSeconds: stdMatch.time_limit_seconds,
      itemCount: countsByKey.get(countKey) ?? null,
    });
  }
  return Array.from(seen.values()).sort((a, b) => {
    if (a.subject !== b.subject) return a.subject === 'RW' ? -1 : 1;
    return a.moduleNumber - b.moduleNumber;
  });
}
