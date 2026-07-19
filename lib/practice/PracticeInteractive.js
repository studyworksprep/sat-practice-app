// Practice session client island. Owns position + per-question state
// (selection, submit, navigation, question map) so adjacent-question
// clicks are local state changes — no server route re-render, no
// component remount, no Desmos / scroll / selection state lost.
//
// Direct hits / refreshes still land on the server page.js, which
// renders the requested position end-to-end and hands the payload
// here as `initial*` props. From then on the client owns the runner:
// next / prev / submit / map clicks all flow through state, with the
// URL kept in sync via history.pushState. Everything is still backed
// by server actions — nothing reaches around requireUser() or RLS.
// See lib/practice/load-question.ts (the loader) and
// lib/practice/load-question-action.ts (the action this island calls).
//
// Design notes per docs/architecture-plan.md §3.7:
//   - We never fetch data from the server outside of Server Action
//     invocations. No useEffect + bare fetch pattern.
//   - The question HTML strings are server-rendered (watermarked)
//     and arrive as props to the renderer, which inserts them via
//     dangerouslySetInnerHTML.
//   - The correct answer and rationale arrive only from the
//     submitAnswer action result, after the server has verified
//     the attempt row exists.
//   - basePath and sessionCompleteHref are parameters so the same
//     client island works for both /practice/* and /tutor/training/*
//     without branching on role.

'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { domainSection } from '@/lib/ui/question-layout';
import { DesmosPanel } from '@/lib/ui/DesmosPanel';
import { ReferenceSheetButton } from '@/lib/ui/ReferenceSheetButton';
import { ToolButton } from '@/lib/ui/ToolButton';
import { BookmarkIcon, CalculatorIcon, ChevronLeftIcon, ChevronRightIcon } from '@/lib/ui/icons';
import { ConceptTags } from './ConceptTags';
import { DesmosSavedStateButton } from './DesmosSavedStateButton';
import { ErrorLogButton } from './ErrorLogButton';
import { FlashcardsButton } from './FlashcardsButton';
import { QuestionMap } from './QuestionMap';
import { QuestionNotes } from './QuestionNotes';
import { SectionTimer } from './SectionTimer';
import { StudentQuestionNotes } from './StudentQuestionNotes';
import {
  getDetourOptions,
  injectEasierQuestion,
  submitPracticeSession,
  togglePracticeMark,
} from './session-actions';
import { sectionLabel } from './act-taxonomy';
import { sanitizeQuestionHtml } from '@/lib/sanitize';
import s from './PracticeInteractive.module.css';

// Which domains justify showing the Desmos toggle. SAT math codes
// (H / P / Q / S), plus the ACT 'math' section. ACT 'science' could
// arguably qualify too, but ACT science permits calculators only for
// quantitative questions — keep it off until the data layer signals
// per-question eligibility. SAT RW codes (CAS / EOI / INI / SEC) and
// the verbal ACT sections (English / Reading) don't show the toggle.
const CALCULATOR_DOMAINS = new Set(['H', 'P', 'Q', 'S', 'math']);

// LocalStorage key for the student's open/closed preference.
// Sticky across navigations so a student doesn't have to reopen
// the calculator on every question.
const DESMOS_TOGGLE_KEY = 'sw:desmos-open';

export function PracticeInteractive({
  sessionId,
  total: initialTotal,
  initialPosition,
  initialQuestion,
  initialAttempt,
  initialDesmos = { savedState: null, canSave: false },
  initialMapItems = [],
  initialConceptTags = null,
  initialQuestionNotes = null,
  initialErrorNote = null,
  initialStudentNote = null,
  initialMarked = false,
  // Set on ACT practice-test sessions only. Carries the section
  // deadline that drives the countdown timer, plus the section label
  // + source_test used by the Submit Set redirect path. See
  // docs/architecture-plan.md §3.4 and lib/practice/load-question.ts.
  practiceTest = null,
  // Session mode ('practice' | 'review' | 'training'). Drives the
  // §3.2 dynamic-detour offer — student practice/review only.
  sessionMode = null,
  submitAnswerAction,
  loadQuestionAction,
  loadQuestionActionInput = {},
  basePath = '/practice',
  sessionCompleteHref = '/dashboard?session_complete=1',
  canSubmitSet = true,
  // Where "Save & exit" leads. Every answer, mark, and the cursor
  // are already persisted server-side as the student works, so
  // exiting is lossless — the session stays in_progress and resumes
  // from the same question. The tutor-training mount overrides this
  // to its own hub.
  exitHref = '/dashboard',
}) {
  const router = useRouter();
  const [pendingTransition, startTransition] = useTransition();

  // Position-derived state. These all swap atomically when the
  // student moves to a new question — server action returns a new
  // payload, we set them in one batch. The latest attempt itself
  // isn't held as state because everything we render off it
  // (selectedId, responseText, feedback, the stashed reveal payload)
  // gets seeded from initialAttempt and then evolves on its own.
  const [position, setPosition] = useState(initialPosition);
  const [question, setQuestion] = useState(initialQuestion);
  // Walk length. A prop everywhere else in the runner's life, but
  // §3.2 detours can APPEND a question mid-session — so it's state,
  // with a ref mirror for callbacks that must see the new length
  // synchronously (navigateTo's bounds check runs before React
  // re-renders their closures).
  const [total, setTotal] = useState(initialTotal);
  const totalRef = useRef(initialTotal);
  totalRef.current = total;
  // Render-synced position mirror for async callbacks that need to
  // know whether the student has moved on (detour probe below).
  const positionRef = useRef(initialPosition);
  positionRef.current = position;
  const [desmosState, setDesmosState] = useState(initialDesmos);
  const [mapItems, setMapItems] = useState(initialMapItems);
  const [conceptTags, setConceptTags] = useState(initialConceptTags);
  const [questionNotes, setQuestionNotes] = useState(initialQuestionNotes);
  const [errorNote, setErrorNote] = useState(initialErrorNote);
  const [studentNote, setStudentNote] = useState(initialStudentNote);
  // Mark-for-review state for the current position. Loaded from the
  // session row via load-question; toggled through togglePracticeMark
  // below. Kept in sync with mapItems[position].marked so the
  // bottom strip's flag and the top-bar button state can't drift.
  const [marked, setMarked] = useState(initialMarked);
  const [markPending, setMarkPending] = useState(false);

  const isSpr = question.questionType === 'spr';

  // Per-question form state — selected option, written response,
  // feedback after submit, reveal payload, errors. All reset when
  // position changes (see the resetForNewQuestion call inside
  // applyPayload below).
  const [selectedId, setSelectedId] = useState(initialAttempt?.selectedOptionId ?? null);
  const [responseText, setResponseText] = useState(initialAttempt?.responseText ?? '');
  // Cross-out (eliminated MCQ options). Keyed by questionId so
  // navigating back to a question still shows the eliminations
  // the student made earlier in the session. Session-only — not
  // persisted to the DB; matches the legacy practice-test
  // behavior students already know.
  const [crossedByQuestion, setCrossedByQuestion] = useState(() => new Map());
  const currentCrossed = crossedByQuestion.get(question.questionId) ?? null;
  const toggleCross = useCallback((optionId) => {
    setCrossedByQuestion((prev) => {
      const qid = question.questionId;
      const next = new Map(prev);
      const setForQ = new Set(next.get(qid) ?? []);
      if (setForQ.has(optionId)) setForQ.delete(optionId);
      else setForQ.add(optionId);
      next.set(qid, setForQ);
      return next;
    });
  }, [question.questionId]);
  const [feedback, setFeedback] = useState(
    initialAttempt ? { isCorrect: initialAttempt.isCorrect } : null,
  );
  const [revealPayload, setRevealPayload] = useState(null);
  const stashedRevealRef = useRef(
    initialAttempt
      ? {
          isCorrect: initialAttempt.isCorrect,
          correctOptionId: initialAttempt.correctOptionId ?? null,
          correctAnswerDisplay: initialAttempt.correctAnswerDisplay ?? null,
          rationaleHtml: initialAttempt.rationaleHtml ?? null,
        }
      : null,
  );
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // §3.2 progressive hints — how many of this question's hints the
  // student has revealed. Counts into the attempt record on submit
  // (attempts.response_json.hints_used) so hint-assisted corrects
  // score partial weight in mastery. Resets on every question swap.
  const [hintsShown, setHintsShown] = useState(0);
  const hints = Array.isArray(question.hints) ? question.hints : [];

  // §3.2 dynamic detours. After two consecutive misses the runner
  // probes the server for what a step back could offer (an easier
  // same-skill question, the skill's tagged lesson) and shows the
  // card only when something exists. Student practice/review modes
  // only — training is tutor self-drill, and the test runner is a
  // separate component entirely. Offers are capped client-side to
  // match the server's per-session injection cap.
  const detourEligible = sessionMode === 'practice' || sessionMode === 'review';
  const [detour, setDetour] = useState(null); // {skillName, easierAvailable, lesson} | null
  const [detourPending, setDetourPending] = useState(false);
  const missStreakRef = useRef(0);
  const detourOffersRef = useRef(0);
  // Injected position → where handleNext should return to afterwards,
  // so the detour reads as an aside, not a teleport to the end of the
  // walk. Session-local; a mid-detour refresh just falls back to the
  // natural next/finish flow.
  const detourReturnRef = useRef(new Map());

  // probeDetour / handleDetourEasier are defined below navigateTo —
  // they navigate into the freshly-appended position.

  // Prefetch cache for adjacent positions. Keyed by position →
  // Promise<ActionResult>. Hot path: by the time the student clicks
  // next/prev, the call is already in flight (or done), so click-
  // to-render is bounded by the slower of (DB query, network). We
  // re-prefetch on every position change.
  const prefetchRef = useRef(new Map());

  // Drop every prefetched payload. Each cached payload carries
  // a snapshot of mapItems for the entire session — once we
  // mutate any position's status (submit) or marked flag (toggle
  // mark), every other position's prefetched mapItems is stale
  // and would silently overwrite the live mapItems on navigation.
  const invalidatePrefetchCache = useCallback(() => {
    prefetchRef.current.clear();
  }, []);

  // loadQuestionActionInput is stashed in a ref so callers don't
  // have to memoize it — passing a fresh object literal each render
  // would otherwise invalidate the action callback's identity and
  // re-fire the prefetch effect on every state change.
  const loadInputRef = useRef(loadQuestionActionInput);
  loadInputRef.current = loadQuestionActionInput;

  const callLoad = useCallback(
    (pos) => loadQuestionAction({ sessionId, position: pos, ...loadInputRef.current }),
    [loadQuestionAction, sessionId],
  );

  const prefetch = useCallback(
    (pos) => {
      if (pos < 0 || pos >= totalRef.current) return;
      const cache = prefetchRef.current;
      if (cache.has(pos)) return;
      cache.set(pos, callLoad(pos).catch(() => null));
    },
    [callLoad],
  );

  // Warm prefetch cache for ±1 whenever position changes.
  useEffect(() => {
    prefetch(position - 1);
    prefetch(position + 1);
  }, [position, prefetch]);

  // An injected detour question at the end of the walk isn't "last"
  // in the UX sense — Next hops back into the walk (handleNext), so
  // the button shouldn't read "Finish". The ref is set before the
  // jump lands, so this render-time read is stable.
  const isLastPosition = position + 1 >= total && !detourReturnRef.current.has(position);
  const isRevealed = !!revealPayload;
  const canSubmit = !isRevealed
    && (isSpr ? responseText.trim().length > 0 : !!selectedId);
  const canReveal = !isRevealed && stashedRevealRef.current != null;

  const applyPayload = useCallback((payload) => {
    // View Transitions API gives us a free cross-fade across the
    // synchronous state update — the browser snapshots the DOM,
    // our setState swaps the question content, and the browser
    // animates between the two snapshots. No JS animation, no
    // framer dependency. Falls through synchronously on browsers
    // without the API (currently Firefox + older Safari) or for
    // users with prefers-reduced-motion: reduce.
    const swap = () => {
      setPosition(payload.position);
      setQuestion(payload.question);
      setDesmosState(payload.desmos);
      setMapItems(payload.mapItems);
      setConceptTags(payload.conceptTags ?? null);
      setQuestionNotes(payload.questionNotes ?? null);
      setErrorNote(payload.errorNote ?? null);
      setStudentNote(payload.studentNote ?? null);
      setMarked(!!payload.marked);
      // Reset answer-form state to match the new question's
      // last-attempt (or empty if never attempted).
      const a = payload.initialAttempt;
      setSelectedId(a?.selectedOptionId ?? null);
      setResponseText(a?.responseText ?? '');
      setFeedback(a ? { isCorrect: a.isCorrect } : null);
      setRevealPayload(null);
      stashedRevealRef.current = a
        ? {
            isCorrect: a.isCorrect,
            correctOptionId: a.correctOptionId ?? null,
            correctAnswerDisplay: a.correctAnswerDisplay ?? null,
            rationaleHtml: a.rationaleHtml ?? null,
          }
        : null;
      setSubmitError(null);
      setSubmitting(false);
      setHintsShown(0);
      // A pending detour offer belongs to the question it was made
      // on — navigating anywhere dismisses it. The miss streak
      // itself carries across questions (that's the point).
      setDetour(null);
    };

    const supportsVT =
      typeof document !== 'undefined'
      && typeof document.startViewTransition === 'function';
    const reduceMotion =
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (supportsVT && !reduceMotion) {
      document.startViewTransition(swap);
    } else {
      swap();
    }

    // Drop any stale prefetch entries from before this hop —
    // adjacents will be re-warmed by the effect above.
    prefetchRef.current = new Map();
    // Keep the URL in sync so refresh / share / deep-link / back-
    // forward all still resolve to the right question. pushState
    // (not replaceState) preserves the existing UX where the
    // browser back button walks back through the session. Skip
    // entirely when the URL already matches — popstate hops
    // (back / forward button) get here AFTER the browser has
    // already updated the URL, and re-pushing would corrupt the
    // history stack.
    if (typeof window !== 'undefined') {
      const url = `${basePath}/s/${sessionId}/${payload.position}`;
      if (window.location.pathname !== url) {
        try { window.history.pushState(null, '', url); } catch {}
      }
    }
  }, [basePath, sessionId]);

  // Handle direct-load fallbacks (popstate from back/forward
  // landing on a position the action returned a non-ok kind for).
  // We surface the redirect via router.push so Next runs the
  // server-side gate.
  const handleNonOkResult = useCallback((result) => {
    switch (result?.kind) {
      case 'expired':
      case 'completed':
      case 'abandoned':
      case 'past_end':
        router.push(result.redirectTo);
        return true;
      case 'removed':
      case 'not_found':
        // Hard-reload through the route so the server's removed-
        // state UI takes over.
        if (typeof window !== 'undefined') window.location.reload();
        return true;
      default:
        return false;
    }
  }, [router]);

  const navigateTo = useCallback(
    async (target) => {
      if (target < 0 || target >= totalRef.current) return;
      if (target === position) return;
      const cache = prefetchRef.current;
      let pending = cache.get(target);
      if (!pending) {
        pending = callLoad(target);
        cache.set(target, pending);
      }
      startTransition(async () => {
        try {
          const res = await pending;
          if (!res?.ok) {
            setSubmitError(res?.error ?? 'Could not load that question.');
            return;
          }
          if (handleNonOkResult(res.result)) return;
          if (res.result.kind === 'ok') {
            applyPayload(res.result.payload);
          }
        } catch (err) {
          setSubmitError(err?.message ?? 'Could not load that question.');
        }
      });
    },
    [callLoad, handleNonOkResult, applyPayload, position],
  );

  // §3.2 detours (state + refs declared above, near the hints state).
  const probeDetour = useCallback(async (skillName) => {
    const atPosition = position;
    try {
      const fd = new FormData();
      fd.set('sessionId', sessionId);
      fd.set('position', String(position));
      const res = await getDetourOptions(null, fd);
      // If the student navigated while the probe was in flight, the
      // offer belongs to a question they've left — drop it.
      if (positionRef.current !== atPosition) return;
      if (res?.ok && (res.easierAvailable || res.lesson)) {
        detourOffersRef.current += 1;
        missStreakRef.current = 0;
        setDetour({
          skillName: skillName ?? null,
          easierAvailable: res.easierAvailable,
          lesson: res.lesson ?? null,
        });
      }
    } catch {
      // Probe is best-effort — a failure just means no card.
    }
  }, [sessionId, position]);

  const handleDetourEasier = useCallback(async () => {
    if (detourPending) return;
    setDetourPending(true);
    try {
      const fd = new FormData();
      fd.set('sessionId', sessionId);
      fd.set('position', String(position));
      const res = await injectEasierQuestion(null, fd);
      if (res?.ok) {
        const prevTotal = totalRef.current;
        // Grow the walk synchronously so navigateTo's bounds check
        // admits the appended position before React re-renders.
        totalRef.current = res.total;
        setTotal(res.total);
        // Return hop: after the detour question, come back to the
        // question after the one the student was stuck on — unless
        // they were already on the last question, where the natural
        // finish flow is right.
        if (position + 1 < prevTotal) {
          detourReturnRef.current.set(res.position, position + 1);
        }
        // Prefetched payloads captured the shorter walk (total +
        // mapItems); drop them before jumping.
        invalidatePrefetchCache();
        setDetour(null);
        void navigateTo(res.position);
      } else {
        setDetour(null);
        setSubmitError(res?.error ?? 'Could not add an easier question.');
      }
    } catch (err) {
      setDetour(null);
      setSubmitError(err?.message ?? 'Could not add an easier question.');
    } finally {
      setDetourPending(false);
    }
  }, [detourPending, sessionId, position, invalidatePrefetchCache, navigateTo]);

  // popstate keeps the in-page state in sync with the browser's
  // own back/forward buttons. We re-resolve the position from the
  // current URL and load it through the action; if the URL doesn't
  // match this session at all, fall back to a real route change.
  useEffect(() => {
    function onPop() {
      if (typeof window === 'undefined') return;
      const m = window.location.pathname.match(
        new RegExp(`^${escapeRegExp(basePath)}/s/${escapeRegExp(sessionId)}/(\\d+)$`),
      );
      if (!m) {
        // Browser navigated outside the session — let the router
        // handle it.
        router.refresh();
        return;
      }
      const pos = Number(m[1]);
      if (!Number.isInteger(pos) || pos === position) return;
      void (async () => {
        const res = await callLoad(pos);
        if (!res?.ok) return;
        if (handleNonOkResult(res.result)) return;
        if (res.result.kind === 'ok') applyPayload(res.result.payload);
      })();
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [basePath, sessionId, position, callLoad, applyPayload, handleNonOkResult, router]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isRevealed || submitting || !canSubmit) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const fd = new FormData();
        fd.set('sessionId', sessionId);
        fd.set('position', String(position));
        if (isSpr) fd.set('responseText', responseText);
        else if (selectedId) fd.set('optionId', selectedId);
        // Hint usage rides with the answer; the server only records
        // it on the first attempt in the session window (same
        // first-attempt-wins rule as the answer itself).
        if (hintsShown > 0) fd.set('hintsUsed', String(hintsShown));
        const res = await submitAnswerAction(null, fd);
        if (res?.ok) {
          setFeedback({ isCorrect: res.isCorrect });
          if (!stashedRevealRef.current) {
            stashedRevealRef.current = {
              isCorrect: res.isCorrect,
              correctOptionId: res.correctOptionId ?? null,
              correctAnswerDisplay: res.correctAnswerDisplay ?? null,
              rationaleHtml: res.rationaleHtml ?? null,
            };
          }
          // Reflect the new attempt status on the question-map pill
          // immediately. Latest attempt wins on the server too, so
          // re-submits flip the pill correctly.
          setMapItems((prev) => prev.map((it) =>
            it.position === position
              ? { ...it, status: res.isCorrect ? 'correct' : 'incorrect' }
              : it,
          ));
          // Prefetched payloads for adjacent positions captured
          // mapItems[position].status='unanswered' — drop them so
          // navigating off this question doesn't apply stale state.
          invalidatePrefetchCache();
          // §3.2 detour trigger: two consecutive misses → probe what
          // a step back could offer. Correct answers reset the
          // streak; the probe itself only shows a card when an
          // easier question or a tagged lesson actually exists.
          if (res.isCorrect) {
            missStreakRef.current = 0;
          } else if (detourEligible) {
            missStreakRef.current += 1;
            if (
              missStreakRef.current >= 2
              && detourOffersRef.current < 2
              && !detour
              && question.taxonomy?.skill_code
            ) {
              void probeDetour(question.taxonomy?.skill_name ?? null);
            }
          }
        } else {
          setSubmitError(res?.error ?? 'Unable to grade this question.');
        }
      } catch (err) {
        setSubmitError(err.message ?? 'Unable to grade this question.');
      } finally {
        setSubmitting(false);
      }
    },
    [
      sessionId, position, responseText, selectedId, submitAnswerAction,
      isRevealed, canSubmit, isSpr, submitting, invalidatePrefetchCache,
      hintsShown, detourEligible, detour, probeDetour, question.taxonomy,
    ],
  );

  const handleReveal = useCallback(() => {
    if (!stashedRevealRef.current) return;
    setRevealPayload(stashedRevealRef.current);
  }, []);

  // Shared submit-and-route helper. Called by handleNext when the
  // student lands past the last question, by the SectionTimer when
  // an ACT practice-test deadline passes, and could be wired to a
  // dedicated "Submit Set" button later. Idempotent — re-firing is
  // safe (submitPracticeSession is a no-op on an already-completed
  // session) and the router.push at the end is the single source
  // of truth for where the student lands.
  const submittedRef = useRef(false);
  const submitSetAndRoute = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('sessionId', sessionId);
      let actAttemptId = null;
      try {
        const res = await submitPracticeSession(null, fd);
        if (res && res.ok && res.actAttemptId) {
          actAttemptId = res.actAttemptId;
        }
      } catch {
        // Best-effort — fall through to the default route.
      }
      // ACT practice-test sessions route to the cached-scores
      // results page; everything else falls back to the prop's
      // sessionCompleteHref (defaults to /dashboard?session_complete=1).
      const dest = actAttemptId
        ? `/practice/test/act/attempt/${actAttemptId}/results`
        : sessionCompleteHref;
      router.push(dest);
    });
  }, [sessionId, sessionCompleteHref, router]);

  const handleNext = useCallback(() => {
    // §3.2 detour return hop: leaving an injected question goes back
    // to where the student left off, not onward past the end.
    const returnTo = detourReturnRef.current.get(position);
    if (returnTo != null) {
      detourReturnRef.current.delete(position);
      if (returnTo < totalRef.current) {
        void navigateTo(returnTo);
        return;
      }
    }
    const nextPosition = position + 1;
    if (nextPosition < total) {
      void navigateTo(nextPosition);
      return;
    }
    // Last question — submit + route via the shared helper.
    submitSetAndRoute();
  }, [position, total, navigateTo, submitSetAndRoute]);

  const handlePrev = useCallback(() => {
    if (position <= 0) return;
    void navigateTo(position - 1);
  }, [position, navigateTo]);

  // Mark-for-review toggle. Optimistic — flip local state + the
  // current cell on the bottom strip first, then send the action.
  // On failure roll the optimistic update back so the UI matches
  // the server. Persisted on practice_sessions.marked_positions.
  const handleToggleMark = useCallback(async () => {
    if (markPending) return;
    const prevMarked = marked;
    const nextMarked = !marked;
    setMarked(nextMarked);
    setMapItems((prev) =>
      prev.map((it) =>
        it.position === position ? { ...it, marked: nextMarked } : it,
      ),
    );
    // Same staleness story as submit: prefetched payloads for
    // adjacent positions captured the old marked array, and would
    // overwrite this toggle when the student navigates. Drop the
    // cache so the next prev/next re-fetches fresh state.
    invalidatePrefetchCache();
    setMarkPending(true);
    try {
      const fd = new FormData();
      fd.set('sessionId', sessionId);
      fd.set('position', String(position));
      const res = await togglePracticeMark(null, fd);
      if (!res?.ok) {
        // Roll back.
        setMarked(prevMarked);
        setMapItems((prev) =>
          prev.map((it) =>
            it.position === position ? { ...it, marked: prevMarked } : it,
          ),
        );
      }
    } catch {
      setMarked(prevMarked);
      setMapItems((prev) =>
        prev.map((it) =>
          it.position === position ? { ...it, marked: prevMarked } : it,
        ),
      );
    } finally {
      setMarkPending(false);
    }
  }, [marked, markPending, position, sessionId, invalidatePrefetchCache]);

  const handleJumpToPosition = useCallback((target) => {
    void navigateTo(target);
  }, [navigateTo]);

  const isNavigating = pendingTransition;

  // Desmos visibility. Only offered for math-domain questions;
  // the toggle state is sticky via localStorage so a student who
  // opens it once stays opened-in across navigations. The initial
  // localStorage restore runs in an effect — not in useState's
  // initializer — so server + first-client renders agree and the
  // grid-track transition doesn't fire on mount.
  const desmosEligible = CALCULATOR_DOMAINS.has(question.taxonomy?.domain_code ?? '');
  // Subject identity drives the question card's top rail and
  // the left-column wash (cream for RW passages, soft math-blue
  // around the Desmos panel). domainSection() returns 'math' or
  // 'rw'; we strip to null when the taxonomy is missing so the
  // renderer falls back to the pre-visual-pass look.
  const subject = question.taxonomy?.domain_code
    ? domainSection(question.taxonomy.domain_code)
    : null;
  const [desmosOpen, setDesmosOpen] = useState(false);
  const [desmosAnimate, setDesmosAnimate] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const stored = window.localStorage.getItem(DESMOS_TOGGLE_KEY);
    setDesmosOpen(stored == null ? true : stored === '1');
  }, []);
  const toggleDesmos = useCallback(() => {
    setDesmosAnimate(true);
    setDesmosOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(DESMOS_TOGGLE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const desmosVisible = desmosEligible && desmosOpen;

  // Reference sheet — Math-domain questions only. Static modal,
  // local state, no need to persist.
  const [refOpen, setRefOpen] = useState(false);

  const calcRef = useRef(null);
  const showSavedStateBtn = desmosEligible && (desmosState.canSave || desmosState.savedState != null);

  // The renderer needs to fully reset its keyed-by-question
  // internal state when the student moves on. Cheaper than
  // unmounting the whole island — only the QuestionRenderer
  // subtree gets the new key.
  const rendererKey = question.questionId;

  return (
    <>
      <main className={s.main}>
        {/* Top-of-runner progress sliver. Shows whenever a
            navigation transition is pending — even if the action
            is fast (~100ms) the bar still fires and gives the
            student sub-frame feedback that the click landed.
            CSS-only animation; pointer-events disabled so it
            never intercepts clicks on the header below. */}
        <div
          className={`${s.navProgress} ${isNavigating ? s.navProgressActive : ''}`}
          aria-hidden="true"
        />
        <header className={s.header}>
          <div className={s.headerLeft}>
            <span className={s.progress}>
              Question {position + 1} of {total}
            </span>
            {question.taxonomy && (
              <span className={s.meta}>
                {question.taxonomy.domain_name}
                {question.taxonomy.skill_name ? ` · ${question.taxonomy.skill_name}` : ''}
                {question.taxonomy.difficulty ? ` · difficulty ${question.taxonomy.difficulty}` : ''}
              </span>
            )}
          </div>
          <div className={s.headerCenter}>
            <button
              type="button"
              onClick={handlePrev}
              disabled={position <= 0 || isNavigating}
              className={s.navArrowBtn}
              aria-label="Previous question"
              title="Previous question"
            >
              <ChevronLeftIcon />
            </button>
            <span className={s.progressPill}>
              <span className={s.progressPillCurrent}>
                {String(position + 1).padStart(2, '0')}
              </span>
              <span className={s.progressPillDivider}>/</span>
              <span className={s.progressPillTotal}>{total}</span>
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={isNavigating}
              className={s.navArrowBtn}
              aria-label="Next question"
              title="Next question"
            >
              <ChevronRightIcon />
            </button>
          </div>
          <div className={s.headerRight}>
            {/* Practice-test timer — rendered only when the session
                carries a deadline (ACT practice tests today). When
                the deadline passes, the helper below fires the
                Submit Set + route flow exactly once via the
                submittedRef guard inside submitSetAndRoute. */}
            {practiceTest?.deadlineIso && (
              <SectionTimer
                deadlineIso={practiceTest.deadlineIso}
                onExpire={submitSetAndRoute}
                label={practiceTest.sectionLabel
                  ? sectionLabel(practiceTest.sectionLabel)
                  : 'Section'}
              />
            )}
            {/* Mark for review — gold when marked. Persists on
                practice_sessions.marked_positions; the bottom-
                strip flag and the assignment / practice review
                report's question map both read from there. */}
            <button
              type="button"
              onClick={handleToggleMark}
              aria-pressed={marked}
              disabled={markPending}
              className={`${s.markBtn} ${marked ? s.markBtnActive : ''}`}
              title={marked ? 'Unmark this question' : 'Mark this question for review'}
            >
              <BookmarkIcon filled={marked} size={14} />
              {marked ? 'Marked' : 'Mark for review'}
            </button>
            {/* Desmos saved state first — leftmost on every
                math-question row, distinct from the ref + calc
                toggles to its right. */}
            {showSavedStateBtn && (
              <DesmosSavedStateButton
                key={`saved-${question.questionId}`}
                questionId={question.questionId}
                initialSavedState={desmosState.savedState}
                canSave={desmosState.canSave}
                calcRef={calcRef}
              />
            )}
            {desmosEligible && (
              <ReferenceSheetButton
                open={refOpen}
                onOpenChange={setRefOpen}
              />
            )}
            {desmosEligible && (
              <ToolButton
                icon={<CalculatorIcon />}
                label="Calculator"
                active={desmosOpen}
                onClick={toggleDesmos}
                aria-pressed={desmosOpen}
                title="Toggle the Desmos graphing calculator"
              />
            )}
            {questionNotes?.canView && (
              <QuestionNotes
                key={`notes-${question.questionId}`}
                questionId={question.questionId}
                initialNotes={questionNotes.notes}
                isAdmin={questionNotes.isAdmin}
                currentUserId={questionNotes.currentUserId}
                canView={questionNotes.canView}
              />
            )}
            <StudentQuestionNotes
              key={`mynote-${question.questionId}`}
              questionId={question.questionId}
              initialNote={studentNote}
              questionTaxonomy={question.taxonomy}
            />
            <FlashcardsButton />
            {/* Error Log lives in its own position-relative
                wrapper so the popover anchors to the trigger. */}
            <div className={s.errorLogSlot}>
              <ErrorLogButton
                key={`elog-${question.questionId}`}
                questionId={question.questionId}
                initialNote={errorNote}
                onSaved={invalidatePrefetchCache}
              />
            </div>
            {/* Save & exit — the runner suppresses all app chrome,
                so this is the one graceful way out mid-session
                (mirrors the test runner's control). Hidden on
                deadline-carrying sessions (ACT practice-test
                sections): their wall-clock timer has no pause, so
                "save & exit" would be a false promise there. */}
            {!practiceTest?.deadlineIso && (
              <Link
                href={exitHref}
                className={s.saveExitBtn}
                title="Save your progress and exit. Your answers are saved as you go; resume this session anytime."
              >
                Save &amp; exit
              </Link>
            )}
          </div>
        </header>

        <form onSubmit={handleSubmit} className={s.article}>
          <QuestionRenderer
            key={rendererKey}
            mode="practice"
            layout={question.layout ?? 'single'}
            question={question}
            subject={subject}
            selectedOptionId={selectedId}
            onSelectOption={setSelectedId}
            responseText={responseText}
            onResponseText={setResponseText}
            feedback={feedback}
            result={revealPayload}
            crossedOptionIds={currentCrossed}
            onToggleCross={toggleCross}
            leftSlot={
              desmosEligible ? (
                <DesmosPanel
                  isOpen={desmosVisible}
                  storageKey={`desmos:practice:${question.questionId}`}
                  onCalcReady={(c) => { calcRef.current = c; }}
                />
              ) : null
            }
            leftSlotCollapsed={desmosEligible && !desmosVisible}
            slotAnimate={desmosAnimate}
            controlsNode={
              <>
                {/* §3.2 progressive hints — revealed one at a time,
                    gentlest first, only before the answer is
                    revealed. Static per-question content delivered
                    on the question payload (never via the reveal
                    stash), sanitized like rationale HTML. */}
                {hintsShown > 0 && (
                  <div className={s.hintsPanel}>
                    {hints.slice(0, hintsShown).map((h, i) => (
                      <div key={i} className={s.hintItem}>
                        <span className={s.hintLabel}>Hint {i + 1}</span>
                        <div
                          className="sw-prose"
                          dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(h) }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {/* §3.2 dynamic detour offer — shown after repeated
                    misses when a step back actually exists (easier
                    same-skill question and/or a tagged lesson).
                    Dismissed by navigation or "Keep going". */}
                {detour && (
                  <div className={s.detourPanel}>
                    <div className={s.detourTitle}>
                      Tough stretch. Want to step back?
                    </div>
                    <p className={s.detourBody}>
                      You&apos;ve missed a couple in a row
                      {detour.skillName ? ` on ${detour.skillName}` : ''}.
                      A quick reset can help more than pushing through.
                    </p>
                    <div className={s.detourActions}>
                      {detour.easierAvailable && (
                        <Button
                          type="button"
                          onClick={handleDetourEasier}
                          disabled={detourPending}
                        >
                          {detourPending ? 'Finding one…' : 'Try an easier question'}
                        </Button>
                      )}
                      {detour.lesson && (
                        <Link
                          href={`/learn/${detour.lesson.lessonId}`}
                          className={s.detourLessonLink}
                          title="Your progress is saved — you can resume this session anytime."
                        >
                          Review the lesson: {detour.lesson.title} →
                        </Link>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setDetour(null)}
                      >
                        Keep going
                      </Button>
                    </div>
                  </div>
                )}
                <div className={s.controls}>
                  {!isRevealed && (
                    <Button type="submit" disabled={submitting || !canSubmit}>
                      {submitting
                        ? 'Checking…'
                        : feedback
                          ? 'Submit again'
                          : 'Submit'}
                    </Button>
                  )}
                  {!isRevealed && hintsShown < hints.length && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setHintsShown((n) => n + 1)}
                    >
                      {hintsShown === 0
                        ? 'Need a nudge?'
                        : `Another hint (${hintsShown}/${hints.length} used)`}
                    </Button>
                  )}
                  {canReveal && (
                    <Button type="button" variant="secondary" onClick={handleReveal}>
                      Reveal answer
                    </Button>
                  )}
                  {submitError && (
                    <p role="alert" className={s.error}>
                      {submitError}
                    </p>
                  )}
                  {isRevealed && (
                    <Button type="button" onClick={handleNext}>
                      {isLastPosition ? 'Finish →' : 'Next question →'}
                    </Button>
                  )}
                </div>
                {conceptTags?.canTag && (
                  // Lives inside the form so it sits with the Submit
                  // button on the same card. Enter inside the
                  // tag-search input would otherwise submit the
                  // parent answer form, so the wrapper preventDefaults
                  // any Enter that bubbles up. ConceptTags' own
                  // handleKeyDown already calls preventDefault when
                  // there's text; this covers the empty-input case.
                  <div
                    className={s.tutorTools}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                  >
                    <ConceptTags
                      key={`tags-${question.questionId}`}
                      questionId={question.questionId}
                      initialTags={conceptTags.tags}
                      initialQuestionTagIds={conceptTags.questionTagIds}
                      canTag={conceptTags.canTag}
                      canDelete={conceptTags.canDelete}
                    />
                  </div>
                )}
              </>
            }
          />
        </form>
      </main>

      <QuestionMap
        basePath={basePath}
        sessionId={sessionId}
        currentPosition={position}
        items={mapItems}
        canSubmit={canSubmitSet}
        onJump={handleJumpToPosition}
      />
    </>
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
