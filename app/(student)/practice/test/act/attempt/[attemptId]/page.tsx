// ACT attempt entry page (Phase 3 multi-section test mode).
//
//   /practice/test/act/attempt/[attemptId]
//
// Works out where inside the attempt the student should be:
//   - completed  → results
//   - abandoned  → hub with a note
//   - a section in progress whose deadline is still ahead → the
//     runner at the saved position
//   - a section in progress whose deadline passed while the student
//     was away → score it (expireOverdueSection), then fall through
//   - the next section pending → the intermission panel: the
//     "before you begin" summary for section 1, the break countdown
//     after Math, and the Start button that opens the section
//     (startActSection creates the timed session)
//   - nothing left → finalize, then results
//
// The section plan lives on the attempt row (lib/practice/
// act-test-plan.ts); session rows are created lazily per section so
// a section's clock starts when the student starts it, not at test
// start.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import {
  ACT_FORMAT_LABELS,
  breakRemainingMs,
  parsePlan,
  sectionOverdue,
} from '@/lib/practice/act-test-plan';
import {
  attemptFormat,
  attemptResultsPath,
  completeActSection,
  expireOverdueSection,
  finalizeActAttempt,
  loadOwnActAttempt,
} from '@/lib/practice-test/act-attempt';
import { abandonActPracticeTest, startActSection } from '@/app/(student)/practice/tests/actions';
import { ActAttemptPanel } from './ActAttemptPanel';

export const dynamic = 'force-dynamic';

export default async function ActAttemptEntryPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  let attempt = await loadOwnActAttempt(supabase, user.id, attemptId);
  if (!attempt) notFound();

  if (attempt.status === 'completed') redirect(attemptResultsPath(attemptId));
  if (attempt.status === 'abandoned') redirect('/practice/tests?test=act&abandoned=1');

  let plan = parsePlan(attempt.sections);
  if (plan.length === 0) {
    // Pre-Phase-3 attempt still in progress: its single session is
    // the whole test. Send the student back into it if it is open,
    // else to the hub.
    if (attempt.practice_session_id) {
      const { data: s } = await supabase
        .from('practice_sessions')
        .select('current_position, status')
        .eq('id', attempt.practice_session_id)
        .maybeSingle();
      if (s?.status === 'in_progress') {
        redirect(`/practice/s/${attempt.practice_session_id}/${s.current_position ?? 0}`);
      }
    }
    redirect('/practice/tests?test=act');
  }

  let idx = attempt.current_section_index ?? 0;
  let cur = plan[idx];

  if (cur?.status === 'in_progress' && cur.session_id) {
    const overdue = sectionOverdue(cur);
    const { data: s } = await supabase
      .from('practice_sessions')
      .select('current_position, status')
      .eq('id', cur.session_id)
      .maybeSingle();
    if (!overdue && s?.status === 'in_progress') {
      redirect(`/practice/s/${cur.session_id}/${s.current_position ?? 0}`);
    }
    // Deadline passed, or the session closed without the attempt
    // hearing about it: score the section now and re-read.
    const res = overdue
      ? await expireOverdueSection(supabase, user.id, cur)
      : await completeActSection(supabase, user.id, cur.session_id);
    if (res.ok && res.done) redirect(attemptResultsPath(attemptId));
    attempt = await loadOwnActAttempt(supabase, user.id, attemptId);
    if (!attempt) notFound();
    plan = parsePlan(attempt.sections);
    idx = attempt.current_section_index ?? 0;
    cur = plan[idx];
  }

  if (!cur) {
    await finalizeActAttempt(supabase, attempt, plan);
    redirect(attemptResultsPath(attemptId));
  }

  const previous = idx > 0 ? plan[idx - 1] : null;
  const breakLeftMs = previous ? breakRemainingMs(previous) : 0;
  const format = attemptFormat(attempt);

  return (
    <ActAttemptPanel
      attemptId={attemptId}
      sourceTest={attempt.source_test}
      formatLabel={ACT_FORMAT_LABELS[format]}
      timeMultiplier={Number(attempt.time_multiplier ?? 1)}
      sections={plan.map((s) => ({
        index: s.index,
        label: sectionLabel(s.section),
        questionCount: s.question_count,
        timeLimitMs: s.time_limit_ms,
        breakAfterMs: s.break_after_ms,
        status: s.status,
      }))}
      currentIndex={idx}
      breakLeftMs={breakLeftMs}
      breakTotalMs={previous?.break_after_ms ?? 0}
      startSectionAction={startActSection}
      abandonAction={abandonActPracticeTest}
    />
  );
}
