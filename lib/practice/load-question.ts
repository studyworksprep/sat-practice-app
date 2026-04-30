// Shared per-position loader for the practice / training session
// runners. Both server pages (app/next/(student)/practice/s/...
// and app/next/(tutor)/tutor/training/practice/s/...) call this on
// initial render, and the loadQuestionAction Server Action calls it
// for client-driven next/prev navigation. One canonical query path,
// one canonical view-model.
//
// The runner's "next button" used to be a full route change to a new
// [position] segment, which forced page.js to re-run end-to-end and
// re-mounted the client island. Centralizing the load here is what
// lets PracticeInteractive ask for "the data for position N" without
// re-routing — see lib/practice/load-question-action.ts and
// docs/architecture-plan.md §3.7 (Server-Component-protected content
// + client-driven question navigation).
//
// Returns a discriminated union so callers can switch on `.kind`:
//
//   ok      → render the question
//   removed → question is unavailable; render the soft "removed"
//             state with the question map still visible
//   expired / completed / abandoned / past_end → caller should
//             redirect to the URL in `redirectTo`
//   not_found → caller should call notFound() (server) or surface
//             an error (action)
//
// The loader does NOT call requireUser() — the caller passes its
// already-resolved auth context. Both server pages already have it
// (from their own requireUser()); the Server Action calls
// requireUser() once and passes it down. This keeps the loader
// itself a pure data step, so wrapping it in React.cache or a unit
// test doesn't need to mock auth.

import { applyWatermark } from '@/lib/content/watermark';
import { loadReviewData } from '@/lib/practice/load-review-data';
import { loadDesmosSavedState } from '@/lib/practice/load-desmos-saved-state';
import { loadConceptTags } from '@/lib/practice/load-concept-tags';
import { loadQuestionNotes } from '@/lib/practice/load-question-notes';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import type { UserRole } from '@/lib/types';

const DESMOS_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

export type SessionMode = 'practice' | 'training' | 'review';
export type MapItemStatus = 'unanswered' | 'correct' | 'incorrect' | 'removed';

export interface MapItem {
  position: number;
  status: MapItemStatus;
  marked?: boolean;
}

export interface QuestionOption {
  id: string;
  ordinal: number;
  label: string;
  content_html: string;
}

export interface QuestionTaxonomy {
  domain_code: string | null;
  domain_name: string | null;
  skill_name: string | null;
  difficulty: number | null;
  score_band: string | null;
}

export interface QuestionVM {
  questionId: string;
  externalId: string | null;
  questionType: string;
  stimulusHtml: string;
  stemHtml: string;
  options: QuestionOption[];
  layout: string;
  taxonomy: QuestionTaxonomy;
}

export interface InitialAttempt {
  isCorrect: boolean;
  selectedOptionId: string | null;
  responseText: string | null;
  submittedAt: string;
  correctOptionId: string | null;
  correctAnswerDisplay: string | null;
  rationaleHtml: string | null;
}

export interface DesmosPayload {
  savedState: unknown | null;
  canSave: boolean;
}

export type ConceptTagsPayload = Awaited<ReturnType<typeof loadConceptTags>>;
export type QuestionNotesPayload = Awaited<ReturnType<typeof loadQuestionNotes>>;

export interface LoadQuestionInput {
  sessionId: string;
  position: number;
  /** Pin the practice_sessions row to a particular mode. The student
   *  runner accepts any non-training mode; the tutor runner pins to
   *  'training'. Pass null to skip the filter. */
  expectedMode?: 'training' | null;
  /** Tutor runner adds concept-tag and question-note panels to the
   *  per-question payload. Off for the student runner — students
   *  never see those tools, and we don't want to pay the queries. */
  includeTutorTools?: boolean;
}

export interface AuthCtx {
  userId: string;
  role: UserRole;
  // Loose type: server-side Supabase client. Typed where it bites.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}

export interface QuestionPayload {
  sessionId: string;
  position: number;
  total: number;
  sessionMode: SessionMode;
  question: QuestionVM;
  initialAttempt: InitialAttempt | null;
  desmos: DesmosPayload;
  mapItems: MapItem[];
  conceptTags: ConceptTagsPayload | null;
  questionNotes: QuestionNotesPayload | null;
  /** Whether the current position is marked-for-review on the
   *  session row. Drives the runner's toggle-button highlight. */
  marked: boolean;
}

export type LoadQuestionResult =
  | { kind: 'ok'; payload: QuestionPayload }
  | { kind: 'removed'; mapItems: MapItem[]; total: number; sessionMode: SessionMode }
  | { kind: 'expired'; redirectTo: string }
  | { kind: 'completed'; redirectTo: string }
  | { kind: 'abandoned'; redirectTo: string }
  | { kind: 'past_end'; redirectTo: string }
  | { kind: 'not_found' };

export async function loadQuestion(
  ctx: AuthCtx,
  input: LoadQuestionInput,
): Promise<LoadQuestionResult> {
  const {
    sessionId,
    position,
    expectedMode = null,
    includeTutorTools = false,
  } = input;
  const { userId, role, supabase } = ctx;

  if (!Number.isInteger(position) || position < 0) return { kind: 'not_found' };

  let q = supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, current_position, test_type, mode, expires_at, status, marked_positions')
    .eq('id', sessionId);
  if (expectedMode) q = q.eq('mode', expectedMode);
  const { data: session, error: sessionErr } = await q.maybeSingle();

  if (sessionErr || !session) return { kind: 'not_found' };
  if (session.user_id !== userId) return { kind: 'not_found' };

  const sessionMode: SessionMode = session.mode;

  if (new Date(session.expires_at) < new Date()) {
    return {
      kind: 'expired',
      redirectTo: expectedMode === 'training'
        ? '/tutor/training/practice?expired=1'
        : '/practice/start?expired=1',
    };
  }
  if (session.status === 'completed') {
    return {
      kind: 'completed',
      redirectTo: completedRedirect(sessionMode, sessionId, expectedMode),
    };
  }
  if (session.status === 'abandoned') {
    return {
      kind: 'abandoned',
      redirectTo: expectedMode === 'training'
        ? '/tutor/training/practice?abandoned=1'
        : '/practice/start?abandoned=1',
    };
  }

  const questionIds: string[] = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) return { kind: 'not_found' };

  if (position >= questionIds.length) {
    // Idempotent close-out — guarded on status='in_progress' so a
    // racing reload doesn't double-flip.
    await supabase
      .from('practice_sessions')
      .update({
        status: 'completed',
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', 'in_progress');
    return {
      kind: 'past_end',
      redirectTo: completedRedirect(sessionMode, sessionId, expectedMode),
    };
  }

  const questionId = questionIds[position];

  // Cursor update is fire-and-forget here. The server pages used to
  // await it; for client-driven nav (where we may fire 100+ of these
  // per session) the latency cost matters more than guaranteeing
  // every cursor write lands. submitAnswer still updates last_activity_at
  // synchronously, so the cursor never drifts more than one click
  // behind a real interaction.
  if (position !== session.current_position) {
    void supabase
      .from('practice_sessions')
      .update({
        current_position: position,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.error(
            JSON.stringify({
              event: 'practice_cursor_update_failed',
              session_id: sessionId,
              position,
              message: error.message,
            }),
          );
        }
      });
  }

  const [
    { data: question },
    { data: lastAttempt },
    { data: sessionAttempts },
    { data: sessionPublished },
  ] = await Promise.all([
    supabase
      .from('questions_v2')
      .select(
        'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, domain_code, domain_name, skill_name, difficulty, score_band, display_code, is_broken, is_published, deleted_at',
      )
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id, is_correct, selected_option_id, response_text, created_at')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('questions_v2')
      .select('id, is_published, deleted_at')
      .in('id', questionIds),
  ]);

  const markedSet = new Set<number>(
    Array.isArray(session.marked_positions) ? session.marked_positions : [],
  );
  const mapItems = buildMapItems({
    questionIds,
    publishedRows: sessionPublished ?? [],
    attempts: sessionAttempts ?? [],
    markedSet,
  });

  const questionRemoved = !question || question.deleted_at || !question.is_published;
  if (questionRemoved) {
    return { kind: 'removed', mapItems, total: questionIds.length, sessionMode };
  }

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
  const wmOptions: QuestionOption[] = optionsSource.map((opt: Record<string, unknown>, idx: number) => {
    const label = (opt.label as string | undefined) ?? (opt.id as string | undefined) ?? String.fromCharCode(65 + idx);
    const content =
      (opt.content_html_rendered as string | undefined)
      ?? (opt.content_html as string | undefined)
      ?? (opt.text as string | undefined)
      ?? '';
    return {
      id: label,
      ordinal: idx,
      label,
      content_html: applyWatermark(content, userId),
    };
  });

  const questionVM: QuestionVM = {
    questionId: question.id,
    externalId: question.display_code ?? null,
    questionType: question.question_type,
    stimulusHtml,
    stemHtml,
    options: wmOptions,
    layout: inferLayoutMode(question.domain_code),
    taxonomy: {
      domain_code: question.domain_code ?? null,
      domain_name: question.domain_name ?? null,
      skill_name: question.skill_name ?? null,
      difficulty: question.difficulty ?? null,
      score_band: question.score_band ?? null,
    },
  };

  let reviewData: Awaited<ReturnType<typeof loadReviewData>> | null = null;
  if (lastAttempt) {
    reviewData = await loadReviewData({ supabase, userId, questionId });
  }

  const initialAttempt: InitialAttempt | null = lastAttempt
    ? {
        isCorrect: lastAttempt.is_correct,
        selectedOptionId: lastAttempt.selected_option_id,
        responseText: lastAttempt.response_text,
        submittedAt: lastAttempt.created_at,
        correctOptionId: reviewData?.correctOptionId ?? null,
        correctAnswerDisplay: reviewData?.correctAnswerDisplay ?? null,
        rationaleHtml: reviewData?.rationaleHtml ?? null,
      }
    : null;

  const desmosEligible = DESMOS_DOMAINS.has(question.domain_code ?? '');

  // Side-fetches for the per-question payload. Run in parallel — the
  // tutor-tool branches are no-ops for student callers since
  // includeTutorTools is false.
  const [desmos, conceptTags, questionNotes] = await Promise.all([
    desmosEligible
      ? loadDesmosSavedState({ questionId, role })
      : Promise.resolve<DesmosPayload>({ savedState: null, canSave: false }),
    includeTutorTools
      ? loadConceptTags({ questionId, role })
      : Promise.resolve(null),
    includeTutorTools
      ? loadQuestionNotes({ questionId, role, userId })
      : Promise.resolve(null),
  ]);

  return {
    kind: 'ok',
    payload: {
      sessionId,
      position,
      total: questionIds.length,
      sessionMode,
      question: questionVM,
      initialAttempt,
      desmos,
      mapItems,
      conceptTags,
      questionNotes,
      marked: markedSet.has(position),
    },
  };
}

function completedRedirect(
  mode: SessionMode,
  sessionId: string,
  expectedMode: 'training' | null,
): string {
  if (expectedMode === 'training') {
    return `/tutor/training/practice/review/${sessionId}`;
  }
  return mode === 'review'
    ? '/review?complete=1'
    : `/practice/review/${sessionId}`;
}

function buildMapItems({
  questionIds,
  publishedRows,
  attempts,
  markedSet,
}: {
  questionIds: string[];
  publishedRows: { id: string; is_published: boolean; deleted_at: string | null }[];
  attempts: { question_id: string; is_correct: boolean; created_at: string }[];
  markedSet?: Set<number>;
}): MapItem[] {
  const publishedById = new Map(publishedRows.map((r) => [r.id, r]));
  const latestByQid = new Map<string, { question_id: string; is_correct: boolean }>();
  for (const a of attempts) {
    if (!latestByQid.has(a.question_id)) latestByQid.set(a.question_id, a);
  }
  return questionIds.map((qid, i) => {
    const marked = markedSet?.has(i) ?? false;
    const pub = publishedById.get(qid);
    const isRemoved = !pub || pub.deleted_at || !pub.is_published;
    if (isRemoved) return { position: i, status: 'removed' as const, marked };
    const att = latestByQid.get(qid);
    if (!att) return { position: i, status: 'unanswered' as const, marked };
    return {
      position: i,
      status: att.is_correct ? ('correct' as const) : ('incorrect' as const),
      marked,
    };
  });
}
