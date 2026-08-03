// Shared per-position loader for the practice-test runner. The
// server page (app/(student)/practice/test/attempt/[attemptId]/m/
// [moduleAttemptId]/[position]/page.js) calls this on initial
// render, and the loadTestQuestionAction Server Action calls it for
// client-driven Next/Back navigation — one canonical query path,
// one canonical view-model, same as lib/practice/load-question.ts
// does for the practice-session runner (§6.3b).
//
// The runner's Next used to be a full route change to a new
// [position] segment, which re-ran page.js end-to-end and
// re-mounted the client island (losing cross-outs, re-initializing
// Desmos, restarting the timer interval). Centralizing the load
// here lets TestRunnerInteractive ask for "the data for position N"
// without re-routing.
//
// Returns a discriminated union:
//
//   ok        → render the question
//   redirect  → caller should redirect (server) or router.push
//               (client) to `redirectTo` — covers finished/paused/
//               not-in-progress modules, role bounces, and
//               past-the-end positions (module review)
//   not_found → caller should call notFound() (server) or surface
//               an error (client)
//
// The loader does NOT call requireUser() — the caller passes its
// already-resolved auth context, keeping this a pure data step.
// RLS still gates every table; a forged moduleAttemptId returns
// not_found rather than another user's module.
//
// Bluebook parity note: `questions_v2.hints` is deliberately never
// selected here — no hints during a test module (see
// docs/design/runner-spec.md §7 and lib/practice/load-question.ts).

import { applyWatermark } from '@/lib/content/watermark';
import { inferLayoutMode } from '@/lib/ui/question-layout';
// .js helper without type declarations.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { loadDesmosSavedState } from '@/lib/practice/load-desmos-saved-state';
import type { UserRole } from '@/lib/types';

export interface TestAuthCtx {
  userId: string;
  role: UserRole;
  // Loose type: server-side Supabase client. Typed where it bites.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}

export interface LoadTestQuestionInput {
  attemptId: string;
  moduleAttemptId: string;
  position: number;
}

export interface TestNavItem {
  moduleItemId: string;
  position: number;
  answered: boolean;
  marked: boolean;
}

interface OptionVM {
  id: string;
  ordinal: number;
  label: string;
  content_html: string;
}

export interface TestQuestionVM {
  questionId: string;
  externalId: string | null;
  questionType: string;
  stimulusHtml: string | null;
  stemHtml: string | null;
  options: OptionVM[];
  layout: string;
  taxonomy: {
    domain_code: string | null;
    domain_name: string | null;
    skill_name: string | null;
    difficulty: string | null;
  };
}

export interface TestModuleInfo {
  subject: string;
  moduleNumber: number;
  routeCode: string | null;
  timeLimitSeconds: number;
  timeMultiplier: number;
  startedAt: string;
  testName: string;
}

export interface TestQuestionPayload {
  attemptId: string;
  moduleAttemptId: string;
  position: number;
  total: number;
  moduleItemId: string;
  question: TestQuestionVM;
  initialAnswer: {
    selectedOptionId: string | null;
    responseText: string;
    markedForReview: boolean;
  };
  navItems: TestNavItem[];
  moduleInfo: TestModuleInfo;
  desmos: { savedState: unknown | null; canSave: boolean };
}

export type LoadTestQuestionResult =
  | { kind: 'ok'; payload: TestQuestionPayload }
  | { kind: 'redirect'; redirectTo: string }
  | { kind: 'not_found' };

export async function loadTestQuestion(
  ctx: TestAuthCtx,
  input: LoadTestQuestionInput,
): Promise<LoadTestQuestionResult> {
  const { attemptId, moduleAttemptId, position } = input;
  const { userId, role, supabase } = ctx;

  // Shared infra — tutors take their own tests via the same runner.
  if (role === 'admin') return { kind: 'redirect', redirectTo: '/admin' };
  if (role === 'practice') return { kind: 'redirect', redirectTo: '/subscribe' };

  if (!Number.isInteger(position) || position < 0) return { kind: 'not_found' };

  // Fetch the module attempt with enough related data to render
  // everything. The embedded selects pull module, test, and the
  // full item list in one trip.
  const { data: moduleAttempt } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      id, started_at, finished_at, paused_at, practice_test_attempt_id,
      practice_test_module:practice_test_modules_v2(
        id, subject_code, module_number, route_code, time_limit_seconds,
        practice_test:practice_tests_v2(id, name, code)
      ),
      practice_test_attempt:practice_test_attempts_v2(user_id, status, practice_test_id, time_multiplier)
    `)
    .eq('id', moduleAttemptId)
    .maybeSingle();
  if (!moduleAttempt) return { kind: 'not_found' };
  if (moduleAttempt.practice_test_attempt.user_id !== userId) return { kind: 'not_found' };
  if (moduleAttempt.practice_test_attempt_id !== attemptId) return { kind: 'not_found' };

  // Module closed / attempt not live / paused — the attempt entry
  // page resolves what the student should actually see (results,
  // resume screen, etc.). Without the paused guard, a direct hit
  // on a paused module would render the runner with a frozen timer.
  if (
    moduleAttempt.finished_at
    || moduleAttempt.practice_test_attempt.status !== 'in_progress'
    || moduleAttempt.paused_at
  ) {
    return { kind: 'redirect', redirectTo: `/practice/test/attempt/${attemptId}` };
  }

  // All items for this module. The full list feeds the client's
  // navigator (total count + answered/marked pills) and bounds-
  // checks the requested position.
  const { data: moduleItems } = await supabase
    .from('practice_test_module_items_v2')
    .select('id, ordinal, question_id')
    .eq('practice_test_module_id', moduleAttempt.practice_test_module.id)
    .order('ordinal', { ascending: true });
  const total = moduleItems?.length ?? 0;
  if (total === 0) return { kind: 'not_found' };
  if (position >= total) {
    // Past the end → module review.
    return {
      kind: 'redirect',
      redirectTo: `/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`,
    };
  }

  const currentItem = moduleItems[position];

  // Load the current question's content and all item-attempts for
  // the module (navigator pills) in parallel.
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
  if (!question) return { kind: 'not_found' };

  // Index item-attempts by module_item_id for O(1) lookups.
  const itemAttemptsByItemId = new Map<string, (typeof itemAttempts)[number]>();
  for (const ia of itemAttempts ?? []) {
    itemAttemptsByItemId.set(ia.practice_test_module_item_id, ia);
  }

  // Per-item navigation pills. `position` is the array index
  // (0-indexed) — not the raw `ordinal` field, which may be
  // 1-indexed depending on how the test was seeded. The URL /
  // runner uses array-index semantics via `moduleItems[position]`,
  // so this keeps the navigator and the URL in sync.
  const navItems: TestNavItem[] = moduleItems.map(
    (it: { id: string }, idx: number) => {
      const ia = itemAttemptsByItemId.get(it.id);
      const answered = ia?.attempt != null
        && (ia.attempt.response_text != null || ia.attempt.selected_option_id != null);
      return {
        moduleItemId: it.id,
        position: idx,
        answered,
        marked: !!ia?.marked_for_review,
      };
    },
  );

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
    userId,
  );
  const stemHtml = applyWatermark(
    question.stem_rendered ?? question.stem_html,
    userId,
  );

  const optionsSource = Array.isArray(question.options_rendered)
    ? question.options_rendered
    : Array.isArray(question.options)
      ? question.options
      : [];
  const options: OptionVM[] = optionsSource.map(
    (
      opt: { label?: string; id?: string; content_html_rendered?: string; content_html?: string; text?: string },
      idx: number,
    ) => {
      const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
      const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
      return {
        id: label,
        ordinal: idx,
        label,
        content_html: applyWatermark(content, userId),
      };
    },
  );

  const questionVM: TestQuestionVM = {
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
  const mult = Number(moduleAttempt.practice_test_attempt.time_multiplier) || 1;
  const moduleInfo: TestModuleInfo = {
    subject: mod.subject_code,
    moduleNumber: mod.module_number,
    routeCode: mod.route_code,
    timeLimitSeconds: Math.round(mod.time_limit_seconds * mult),
    timeMultiplier: mult,
    startedAt: moduleAttempt.started_at,
    testName: mod.practice_test?.name ?? 'Practice test',
  };

  // Saved Desmos state (manager-supplied solutions). Math modules
  // only — reading/writing modules don't get the calculator panel
  // and never have saved states.
  const desmos = moduleInfo.subject === 'MATH'
    ? await loadDesmosSavedState({ questionId: question.id, role })
    : { savedState: null, canSave: false };

  return {
    kind: 'ok',
    payload: {
      attemptId,
      moduleAttemptId,
      position,
      total,
      moduleItemId: currentItem.id,
      question: questionVM,
      initialAnswer,
      navItems,
      moduleInfo,
      desmos,
    },
  };
}
