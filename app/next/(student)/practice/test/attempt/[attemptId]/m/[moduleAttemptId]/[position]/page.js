// Practice-test runner — one module question at a time.
//
// Server-renders the stem + options + stimulus (all watermarked),
// plus the student's existing answer (if any) and mark-for-review
// flag. The client island handles:
//   - the countdown timer (reads module started_at + time limit)
//   - navigating Prev/Next within the module (router.push)
//   - sending the answer to the recordItemAnswer Server Action
//     on change
//   - toggling mark-for-review
//   - jumping to the module-end review page
//
// Bluebook-style: no correct-answer reveal during the test.
// QuestionRenderer is invoked in mode='practice' with result=null,
// so the inputs stay editable and no reveal styling appears.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { applyWatermark } from '@/lib/content/watermark';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import {
  recordItemAnswer,
  toggleMarkForReview,
  finishModule,
} from '../../../../../actions';
import { TestRunnerInteractive } from './TestRunnerInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeTestRunnerPage({ params }) {
  const { attemptId, moduleAttemptId, position: positionStr } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const position = Number(positionStr);
  if (!Number.isInteger(position) || position < 0) notFound();

  // Fetch the module attempt with enough related data to render
  // everything. The embedded selects pull module, test, and the
  // full item list in one trip.
  const { data: moduleAttempt } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      id, started_at, finished_at, practice_test_attempt_id,
      practice_test_module:practice_test_modules_v2(
        id, subject_code, module_number, route_code, time_limit_seconds,
        practice_test:practice_tests_v2(id, name, code)
      ),
      practice_test_attempt:practice_test_attempts_v2(user_id, status, practice_test_id)
    `)
    .eq('id', moduleAttemptId)
    .maybeSingle();
  if (!moduleAttempt) notFound();
  if (moduleAttempt.practice_test_attempt.user_id !== user.id) notFound();
  if (moduleAttempt.practice_test_attempt_id !== attemptId) notFound();

  if (moduleAttempt.finished_at) {
    // Module is closed — student shouldn't be navigating back into
    // its runner. Send them to results (attempt might be
    // completed) or back to the attempt entry.
    redirect(`/practice/test/attempt/${attemptId}`);
  }
  if (moduleAttempt.practice_test_attempt.status !== 'in_progress') {
    redirect(`/practice/test/attempt/${attemptId}`);
  }

  // All items for this module. We need the full list so the
  // client island knows the total count (for Next/Prev bounds and
  // the "Q N / M" display) and so we can reserve the URL for an
  // invalid position.
  const { data: moduleItems } = await supabase
    .from('practice_test_module_items_v2')
    .select('id, ordinal, question_id')
    .eq('practice_test_module_id', moduleAttempt.practice_test_module.id)
    .order('ordinal', { ascending: true });
  const total = moduleItems?.length ?? 0;
  if (total === 0) notFound();
  if (position >= total) {
    // Clicked past end → bounce to module review.
    redirect(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
  }

  const currentItem = moduleItems[position];

  // Load the current question's content and any existing attempt
  // for it, in parallel. We also need all item-attempts for the
  // module so the client can mark-pill the navigation with
  // answered/flagged status.
  const [{ data: question }, { data: itemAttempts }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select(
        'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, domain_code, domain_name, skill_name, difficulty, display_code',
      )
      .eq('id', currentItem.question_id)
      .maybeSingle(),
    supabase
      .from('practice_test_item_attempts_v2')
      .select(`
        practice_test_module_item_id,
        marked_for_review,
        attempt:attempts(selected_option_id, response_text, is_correct)
      `)
      .eq('practice_test_module_attempt_id', moduleAttemptId),
  ]);
  if (!question) notFound();

  // Index item-attempts by module_item_id for O(1) lookups.
  const itemAttemptsByItemId = new Map();
  for (const ia of itemAttempts ?? []) {
    itemAttemptsByItemId.set(ia.practice_test_module_item_id, ia);
  }

  // Pre-build per-item navigation pills so the bottom bar can show
  // answered / flagged status without any additional client-side
  // fetches.
  const navItems = moduleItems.map((it) => {
    const ia = itemAttemptsByItemId.get(it.id);
    const answered = ia?.attempt != null
      && (ia.attempt.response_text != null || ia.attempt.selected_option_id != null);
    return {
      moduleItemId: it.id,
      position: it.ordinal,
      answered,
      marked: !!ia?.marked_for_review,
    };
  });

  // Current item's existing answer + flag.
  const currentItemAttempt = itemAttemptsByItemId.get(currentItem.id) ?? null;
  const initialAnswer = {
    selectedOptionId: question.question_type !== 'spr'
      ? (currentItemAttempt?.attempt?.response_text ?? null)
      : null,
    responseText: question.question_type === 'spr'
      ? (currentItemAttempt?.attempt?.response_text ?? '')
      : '',
    markedForReview: !!currentItemAttempt?.marked_for_review,
  };

  // Watermark the HTML before handing off to the client.
  const stimulusHtml = applyWatermark(
    question.stimulus_rendered ?? question.stimulus_html,
    user.id,
  );
  const stemHtml = applyWatermark(
    question.stem_rendered ?? question.stem_html,
    user.id,
  );

  const optionsSource = Array.isArray(question.options_rendered)
    ? question.options_rendered
    : Array.isArray(question.options)
      ? question.options
      : [];
  const options = optionsSource.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
    return {
      id: label,
      ordinal: idx,
      label,
      content_html: applyWatermark(content, user.id),
    };
  });

  const questionVM = {
    questionId: question.id,
    externalId: question.display_code,
    questionType: question.question_type,
    stimulusHtml,
    stemHtml,
    options,
    layout: inferLayoutMode(question.domain_code),
    taxonomy: {
      domain_code: question.domain_code,
      domain_name: question.domain_name,
      skill_name: question.skill_name,
      difficulty: question.difficulty,
    },
  };

  const mod = moduleAttempt.practice_test_module;
  const moduleInfo = {
    subject: mod.subject_code,
    moduleNumber: mod.module_number,
    routeCode: mod.route_code,
    timeLimitSeconds: mod.time_limit_seconds,
    startedAt: moduleAttempt.started_at,
    testName: mod.practice_test?.name ?? 'Practice test',
  };

  return (
    <TestRunnerInteractive
      attemptId={attemptId}
      moduleAttemptId={moduleAttemptId}
      moduleItemId={currentItem.id}
      position={position}
      total={total}
      moduleInfo={moduleInfo}
      navItems={navItems}
      question={questionVM}
      initialAnswer={initialAnswer}
      recordItemAnswerAction={recordItemAnswer}
      toggleMarkForReviewAction={toggleMarkForReview}
      finishModuleAction={finishModule}
    />
  );
}
