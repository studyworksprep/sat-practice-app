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
import { isCalculatorEligible } from '@/lib/practice/act-taxonomy';
import {
  loadActQuestionContent,
  loadActLastAttempt,
  loadActSessionAttempts,
  loadActPublishedFlags,
  buildActMapItems,
  loadActReviewData,
} from '@/lib/practice/load-act-question';
import type { UserRole } from '@/lib/types';

// Mirrors CALCULATOR_DOMAINS in PracticeInteractive / ReviewInteractive.
// Drives whether the loader fires loadDesmosSavedState — SAT math
// codes + ACT 'math'.
const DESMOS_DOMAINS = new Set(['H', 'P', 'Q', 'S', 'math']);

export type SessionMode = 'practice' | 'training' | 'review';
export type MapItemStatus = 'unanswered' | 'correct' | 'incorrect' | 'removed';

export interface MapItem {
  position: number;
  status: MapItemStatus;
  marked?: boolean;
  /** Domain code for the underlying questions_v2 row. Used by the
   *  navigator strip to tint cells by subject so the strip reads as
   *  a session map (RW orange / Math blue). Null on removed rows. */
  domainCode?: string | null;
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
  skill_code: string | null;
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
  /** ACT question-reference ordinal. The renderer highlights
   *  the matching `[data-q="N"]` span inside the stimulus when
   *  this is set — the marker is emitted by the import parser
   *  for English (underlined portions) and Reading (line-
   *  referenced spans). Null on questions without a marker. */
  qrefOrdinal: number | null;
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
  /** Student-private error-log note for the current question, if
   *  any. Surfaces in PracticeInteractive's Error Log toggle. */
  errorNote: { body: string; updatedAt: string } | null;
  /** Student-private rich-text note (TipTap doc) for this question.
   *  Powers the StudentQuestionNotes popover next to the Error Log
   *  button. At most one row per (user, question); see migration
   *  20240101000040_student_notes.sql. */
  studentNote: {
    id: string;
    title: string | null;
    bodyJson: unknown;
    bodyText: string;
    subjectCode: string | null;
    domainCode: string | null;
    domainName: string | null;
    skillCode: string | null;
    skillName: string | null;
    updatedAt: string;
  } | null;
  /** Whether the current position is marked-for-review on the
   *  session row. Drives the runner's toggle-button highlight. */
  marked: boolean;
  /** ACT practice-test session — null for everything else. When set,
   *  the runner renders a SectionTimer pegged to deadlineIso and
   *  auto-submits the set on expiry; on Submit Set the action returns
   *  an act_practice_test_attempts id and the runner routes to the
   *  ACT results page. See docs/architecture-plan.md §3.4. */
  practiceTest: {
    deadlineIso: string | null;
    sectionLabel: string | null;
    sourceTest: string | null;
  } | null;
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
    .select('id, user_id, question_ids, current_position, test_type, mode, expires_at, status, marked_positions, created_at, filter_criteria')
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

  // Assignment sessions and review drills act like a fresh attempt:
  // historical attempts on these question ids from other sessions
  // don't pre-seed the answer state and don't count toward this
  // session's "answered N of M" progress. Without this, a student
  // who'd already done one of the questions in a prior practice
  // session would land on the question pre-filled (with feedback /
  // Reveal unlocked) and the navigator would mark it complete before
  // they'd touched it in this session.
  //
  // Review drills (mode='review' — the Weak Questions Drill, skill
  // drills, ACT category drills) especially need this: the queue is
  // built entirely from questions the student has already gotten
  // wrong, so EVERY question carries a prior attempt. With the old
  // history-aware scope those drills loaded every question pre-filled
  // with the previous (usually wrong) answer and Reveal already
  // unlocked — the student never got to re-attempt anything.
  //
  // Regular practice (mode='practice' without an assignment_id) and
  // training stay history-aware so the "you got this right last
  // time" affordance keeps working there. The submit-side already
  // uses the same created_at gate to avoid double-recording, so this
  // just brings the load-side into agreement with it — a re-attempt
  // in the drill records a new attempt that feeds back into the
  // weak-queue scoring next time.
  const isAssignmentSession =
    !!session.filter_criteria
    && typeof session.filter_criteria === 'object'
    && !!(session.filter_criteria as Record<string, unknown>).assignment_id;
  const isReviewSession = sessionMode === 'review';
  const isFreshAttemptSession = isAssignmentSession || isReviewSession;
  const sessionCreatedAt = session.created_at ?? '1970-01-01T00:00:00Z';

  // Fork on the session's test_type. SAT reads questions_v2 + attempts;
  // ACT reads act_questions + act_answer_options + act_attempts.
  // Same shape comes out the other side so the per-question side-fetches
  // below + the QuestionPayload return shape are unchanged.
  const isAct = session.test_type === 'act';
  const since = isFreshAttemptSession ? sessionCreatedAt : null;
  // ACT practice sessions get a stricter lastAttempt scope than
  // the question-map data does: a fresh session shouldn't
  // pre-fill the runner with an answer the student submitted in
  // a different surface (Error Log → review, an earlier
  // solo-practice session, etc.). Map colors keep their existing
  // global scope so a question previously answered correctly
  // still shows green on the question map — the student just
  // doesn't see their old radio pre-selected on the question
  // itself. SAT path keeps its existing semantics.
  const sinceForLastAttempt = isAct ? sessionCreatedAt : since;
  const markedSet = new Set<number>(
    Array.isArray(session.marked_positions) ? session.marked_positions : [],
  );

  let questionVM: QuestionVM;
  let mapItems: MapItem[];
  let initialAttempt: InitialAttempt | null;
  let desmosEligible: boolean;

  if (isAct) {
    const [contentResult, lastAttempt, sessionAttempts, publishedById] = await Promise.all([
      loadActQuestionContent(supabase, questionId, userId),
      loadActLastAttempt(supabase, userId, questionId, sinceForLastAttempt),
      loadActSessionAttempts(supabase, userId, questionIds, since),
      loadActPublishedFlags(supabase, questionIds),
    ]);

    mapItems = buildActMapItems({ questionIds, publishedById, attempts: sessionAttempts, markedSet });

    if (!contentResult || contentResult.isRemoved) {
      return { kind: 'removed', mapItems, total: questionIds.length, sessionMode };
    }

    questionVM = contentResult.vm;
    desmosEligible = isCalculatorEligible(questionVM.taxonomy.domain_code);

    let reviewData: Awaited<ReturnType<typeof loadActReviewData>> = null;
    if (lastAttempt) {
      reviewData = await loadActReviewData(supabase, userId, questionId);
    }

    initialAttempt = lastAttempt
      ? {
          isCorrect: lastAttempt.is_correct,
          selectedOptionId: lastAttempt.selected_option_id,
          responseText: null, // ACT is MCQ-only — no typed response.
          submittedAt: lastAttempt.created_at,
          correctOptionId: reviewData?.correctOptionId ?? null,
          correctAnswerDisplay: reviewData?.correctAnswerDisplay ?? null,
          rationaleHtml: reviewData?.rationaleHtml ?? null,
        }
      : null;
  } else {
    const lastAttemptQuery = supabase
      .from('attempts')
      .select('id, is_correct, selected_option_id, response_text, created_at')
      .eq('user_id', userId)
      .eq('question_id', questionId);
    const sessionAttemptsQuery = supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .in('question_id', questionIds);
    if (since) {
      lastAttemptQuery.gte('created_at', since);
      sessionAttemptsQuery.gte('created_at', since);
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
          'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, domain_code, domain_name, skill_code, skill_name, difficulty, score_band, display_code, is_broken, is_published, deleted_at',
        )
        .eq('id', questionId)
        .maybeSingle(),
      lastAttemptQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      sessionAttemptsQuery
        .order('created_at', { ascending: false }),
      supabase
        .from('questions_v2')
        .select('id, is_published, deleted_at, domain_code')
        .in('id', questionIds),
    ]);

    mapItems = buildMapItems({
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

    questionVM = {
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
        skill_code: question.skill_code ?? null,
        skill_name: question.skill_name ?? null,
        difficulty: question.difficulty ?? null,
        score_band: question.score_band ?? null,
      },
      // SAT side has no qref markers — passages don't carry
      // ACT-style underlined-portion numerals or line references.
      qrefOrdinal: null,
    };

    let reviewData: Awaited<ReturnType<typeof loadReviewData>> | null = null;
    if (lastAttempt) {
      reviewData = await loadReviewData({ supabase, userId, questionId });
    }

    // v2 MCQ answers are persisted in attempts.response_text (the
    // option label); selected_option_id is a legacy v1 FK column that
    // stays null for v2. Derive the selected option from response_text
    // for MCQ so the previously chosen tile re-highlights on Continue.
    // SPR keeps selectedOptionId null and reads its typed answer from
    // responseText. Honor selected_option_id first in case it's ever set.
    const isSprQuestion = question.question_type === 'spr';
    initialAttempt = lastAttempt
      ? {
          isCorrect: lastAttempt.is_correct,
          selectedOptionId:
            lastAttempt.selected_option_id ??
            (isSprQuestion ? null : lastAttempt.response_text),
          responseText: lastAttempt.response_text,
          submittedAt: lastAttempt.created_at,
          correctOptionId: reviewData?.correctOptionId ?? null,
          correctAnswerDisplay: reviewData?.correctAnswerDisplay ?? null,
          rationaleHtml: reviewData?.rationaleHtml ?? null,
        }
      : null;

    desmosEligible = DESMOS_DOMAINS.has(question.domain_code ?? '');
  }

  // Side-fetches for the per-question payload. Run in parallel — the
  // tutor-tool branches are no-ops for student callers since
  // includeTutorTools is false. The error-note read is always on
  // since the Error Log is a student-private surface.
  const [desmos, conceptTags, questionNotes, errorNoteRow, studentNoteRow] = await Promise.all([
    desmosEligible
      ? loadDesmosSavedState({ questionId, role, testType: session.test_type })
      : Promise.resolve<DesmosPayload>({ savedState: null, canSave: false }),
    // Concept tags are an SAT-only feature today — the join table FKs
    // to v1 questions. Skip for ACT.
    includeTutorTools && !isAct
      ? loadConceptTags({ questionId, role })
      : Promise.resolve(null),
    includeTutorTools
      ? loadQuestionNotes({ questionId, role, userId, testType: session.test_type })
      : Promise.resolve(null),
    supabase
      .from('question_error_notes')
      .select('body, updated_at')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .eq('test_type', session.test_type)
      .maybeSingle(),
    supabase
      .from('student_notes')
      .select(
        'id, title, body_json, body_text, subject_code, domain_code, domain_name, skill_code, skill_name, updated_at',
      )
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .eq('test_type', session.test_type)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const errorNote = errorNoteRow?.data
    ? {
        body: errorNoteRow.data.body as string,
        updatedAt: errorNoteRow.data.updated_at as string,
      }
    : null;

  const studentNote = studentNoteRow?.data
    ? {
        id: studentNoteRow.data.id as string,
        title: (studentNoteRow.data.title as string | null) ?? null,
        bodyJson: studentNoteRow.data.body_json,
        bodyText: studentNoteRow.data.body_text as string,
        subjectCode: (studentNoteRow.data.subject_code as string | null) ?? null,
        domainCode:  (studentNoteRow.data.domain_code as string | null) ?? null,
        domainName:  (studentNoteRow.data.domain_name as string | null) ?? null,
        skillCode:   (studentNoteRow.data.skill_code as string | null) ?? null,
        skillName:   (studentNoteRow.data.skill_name as string | null) ?? null,
        updatedAt: studentNoteRow.data.updated_at as string,
      }
    : null;

  // Extract the practice-test payload off the session row's
  // filter_criteria. ACT practice tests carry kind='practice_test'
  // + source_test + sectionsOnly + deadlineAt; the runner reads
  // these to render a SectionTimer and route Submit Set to the ACT
  // results page (PR 7).
  const fcAny = session.filter_criteria as Record<string, unknown> | null;
  const fcKind = typeof fcAny?.kind === 'string' ? fcAny.kind : null;
  const isPracticeTest = isAct && fcKind === 'practice_test';
  const practiceTest = isPracticeTest
    ? {
        deadlineIso: typeof fcAny?.deadlineAt === 'string' ? fcAny.deadlineAt : null,
        sectionLabel: typeof fcAny?.sectionsOnly === 'string' ? fcAny.sectionsOnly : null,
        sourceTest: typeof fcAny?.source_test === 'string' ? fcAny.source_test : null,
      }
    : null;

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
      errorNote,
      studentNote,
      practiceTest,
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
  publishedRows: {
    id: string;
    is_published: boolean;
    deleted_at: string | null;
    domain_code: string | null;
  }[];
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
    if (isRemoved) {
      return { position: i, status: 'removed' as const, marked, domainCode: null };
    }
    const domainCode = pub?.domain_code ?? null;
    const att = latestByQid.get(qid);
    if (!att) {
      return { position: i, status: 'unanswered' as const, marked, domainCode };
    }
    return {
      position: i,
      status: att.is_correct ? ('correct' as const) : ('incorrect' as const),
      marked,
      domainCode,
    };
  });
}
