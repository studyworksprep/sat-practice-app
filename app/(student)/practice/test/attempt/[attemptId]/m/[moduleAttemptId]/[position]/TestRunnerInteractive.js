// Practice-test runner client island — Bluebook-style shell.
//
// Top bar: "Section N, Module M: Subject" on the left, countdown
// timer in the center. Mark-for-Review is not here — it lives
// inside the question header (see headerNode passed to
// QuestionRenderer) so it sits next to the question number
// exactly like Bluebook shows.
//
// Bottom bar: a centered "Question N of M ▾" pill that opens the
// navigator popup (grid of question bubbles + "Go to Review Page"
// button). Next / Back are on the right.
//
// §6.3b instant-next: the island owns position + per-question state.
// Next/Back/jump within the module are client state changes fed by
// loadTestQuestionAction — no route change, no island remount, so
// the timer interval, cross-outs, and Desmos panel all survive
// navigation. A ±1 prefetch cache keeps the neighbor payloads warm,
// the N+1 question pre-renders in a hidden <Activity> pane, and the
// question area cross-fades via the View Transitions API. The URL
// stays in sync through history.pushState so refresh / deep-link /
// back-forward still resolve through the server page. Leaving the
// module (review page, next module, results, exit) is still a real
// router.push.
//
// Timer derives from moduleInfo.startedAt + timeLimitSeconds;
// timeLimitSeconds arrives already multiplied by the student's
// time-accommodation on the parent attempt, so no client-side
// multiplication here.

'use client';

import {
  Activity,
  startTransition as reactStartTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { DesmosPanel } from '@/lib/ui/DesmosPanel';
import { ReferenceSheetButton } from '@/lib/ui/ReferenceSheetButton';
import { ToolButton } from '@/lib/ui/ToolButton';
import { DesmosSavedStateButton } from '@/lib/practice/DesmosSavedStateButton';
import { BookmarkIcon, CalculatorIcon } from '@/lib/ui/icons';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { NavPopover } from './NavPopover';
import s from './TestRunner.module.css';

const WARNING_REMAINING_SECONDS = 5 * 60;
const CRITICAL_REMAINING_SECONDS = 60;

// Desmos visibility is sticky across questions within a test
// module (and across modules — students who opened it once tend
// to want it open next time too). localStorage key is shared with
// the practice-session runner so the student's preference follows
// them between surfaces.
const DESMOS_TOGGLE_KEY = 'sw:desmos-open';

export function TestRunnerInteractive({
  attemptId,
  moduleAttemptId,
  initialPayload,
  recordItemAnswerAction,
  toggleMarkForReviewAction,
  finishModuleAction,
  pauseTestModuleAction,
  loadQuestionAction,
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();

  // Module-constant data. The item list is fixed for the module's
  // lifetime (no mid-module injection in tests), so total and
  // moduleInfo never change after mount.
  const total = initialPayload.total;
  const moduleInfo = initialPayload.moduleInfo;

  // Position-derived state — swaps atomically in applyPayload when
  // the student moves to a new question.
  const [position, setPosition] = useState(initialPayload.position);
  const [moduleItemId, setModuleItemId] = useState(initialPayload.moduleItemId);
  const [question, setQuestion] = useState(initialPayload.question);
  const [desmosState, setDesmosState] = useState(initialPayload.desmos);
  // Navigator pills. Server-computed once at mount; from then on the
  // client patches answered/marked itself as the student works, so
  // prefetched payloads (whose navItems snapshot may predate an
  // in-flight save) never overwrite live status — applyPayload
  // deliberately ignores payload.navItems.
  const [navItems, setNavItems] = useState(initialPayload.navItems);

  const [selectedId, setSelectedId] = useState(initialPayload.initialAnswer.selectedOptionId ?? null);
  const [responseText, setResponseText] = useState(initialPayload.initialAnswer.responseText ?? '');
  const [marked, setMarked] = useState(!!initialPayload.initialAnswer.markedForReview);
  const [markPending, setMarkPending] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [navOpen, setNavOpen] = useState(false);

  // Render-synced mirrors for async callbacks that must read the
  // current values without re-binding on every keystroke.
  const positionRef = useRef(position);
  positionRef.current = position;
  const formRef = useRef({ selectedId, responseText, marked });
  formRef.current = { selectedId, responseText, marked };

  // Client-authoritative overlay of the student's work this session,
  // keyed by position. Recorded when leaving a question; preferred
  // over a payload's initialAnswer when arriving. This closes the
  // race where a neighbor's payload was prefetched before the
  // fire-and-forget answer save landed — without it, Back to a
  // just-answered question could briefly show the pre-answer state.
  const formByPosRef = useRef(new Map());

  // Cross-out (eliminated MCQ options). Keyed by the test's per-
  // module question position so navigating Prev/Next within the
  // same module preserves what the student has already eliminated.
  // Session-only — refreshing the page wipes, matching Bluebook
  // and the legacy practice-test runner.
  const [crossedByPos, setCrossedByPos] = useState(() => new Map());
  const currentCrossed = crossedByPos.get(position) ?? null;
  const toggleCross = useCallback((optionId) => {
    setCrossedByPos((prev) => {
      const next = new Map(prev);
      const setForPos = new Set(next.get(position) ?? []);
      if (setForPos.has(optionId)) setForPos.delete(optionId);
      else setForPos.add(optionId);
      next.set(position, setForPos);
      return next;
    });
  }, [position]);

  // Desmos — shown during Math modules only. The initial state is
  // read from localStorage in a post-mount effect so server + first
  // client render agree (otherwise a reload flickers the panel).
  const desmosEligible = moduleInfo.subject === 'MATH';
  const [desmosOpen, setDesmosOpen] = useState(false);
  const [desmosAnimate, setDesmosAnimate] = useState(false);
  useEffect(() => {
    if (!desmosEligible) return;
    if (typeof window === 'undefined' || !window.localStorage) return;
    // Default-on for practice tests: if the student has never
    // explicitly toggled the calculator, start it open. An
    // explicit '0' in storage (student closed it) still wins, so
    // a student who prefers the calculator hidden keeps that
    // preference across questions and modules.
    const stored = window.localStorage.getItem(DESMOS_TOGGLE_KEY);
    setDesmosOpen(stored == null ? true : stored === '1');
  }, [desmosEligible]);
  const toggleDesmos = useCallback(() => {
    // Animation is gated behind the first user interaction. Before
    // that, opening/closing happens statically; after, subsequent
    // toggles glide. Same pattern as the practice-session runner.
    setDesmosAnimate(true);
    setDesmosOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(DESMOS_TOGGLE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const desmosVisible = desmosEligible && desmosOpen;

  // Reference sheet — Math modules only. Modal state is local; the
  // sheet is read-only so there's nothing to persist.
  const [refOpen, setRefOpen] = useState(false);

  // Live calc handle for the saved-state button. Populated by
  // DesmosPanel via onCalcReady once the calculator mounts.
  const calcRef = useRef(null);
  const showSavedStateBtn =
    desmosEligible && (desmosState.canSave || desmosState.savedState != null);

  // useTransition renders a "pending" state on the Next/Back buttons
  // for the (now rare) case where the target payload isn't cached
  // yet and the action round-trip is visible.
  const [isNavPending, startNav] = useTransition();

  // ── Prefetch cache (±1 payloads) ──────────────────────────
  // Keyed by position → Promise<ActionResult>. Hot path: by the
  // time the student clicks Next/Back, the call is already in
  // flight (or done), so click-to-render is bounded by the slower
  // of (DB query, network) — and usually by neither, because the
  // N+1 payload has also pre-rendered in the hidden pane below.
  const prefetchRef = useRef(new Map());

  const callLoad = useCallback(
    (pos) => loadQuestionAction({ attemptId, moduleAttemptId, position: pos }),
    [loadQuestionAction, attemptId, moduleAttemptId],
  );

  const prefetch = useCallback(
    (pos) => {
      if (pos < 0 || pos >= total) return;
      const cache = prefetchRef.current;
      if (cache.has(pos)) return;
      cache.set(pos, callLoad(pos).catch(() => null));
    },
    [callLoad, total],
  );

  // Warm prefetch cache for ±1 whenever position changes.
  useEffect(() => {
    prefetch(position - 1);
    prefetch(position + 1);
  }, [position, prefetch]);

  // Keep the module-review route warm — it's the one Next/jump
  // target that is still a real route change.
  useEffect(() => {
    router.prefetch(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
  }, [attemptId, moduleAttemptId, router]);

  // §6.3b instant-next: resolve the NEXT question's prefetched
  // payload into state so a hidden <Activity> pane can pre-render
  // its whole subtree (HTML parse, option layout, math) before the
  // click. Content-wise this exposes nothing new — the identical
  // watermarked bytes already sit in the prefetch cache; they're
  // just also in a hidden DOM subtree now. Deliberately N+1 only.
  // Runs after the prefetch effect above (declaration order), so
  // the promise is already in the cache.
  const [nextPayload, setNextPayload] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setNextPayload(null);
    const pending = prefetchRef.current.get(position + 1);
    if (!pending) return undefined;
    pending.then((res) => {
      if (cancelled || !res?.ok) return;
      if (res.result?.kind === 'ok') setNextPayload(res.result.payload);
    });
    return () => { cancelled = true; };
  }, [position]);

  // ── Timer ─────────────────────────────────────────────────
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    computeRemaining(moduleInfo.startedAt, moduleInfo.timeLimitSeconds),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsRemaining(
        computeRemaining(moduleInfo.startedAt, moduleInfo.timeLimitSeconds),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [moduleInfo.startedAt, moduleInfo.timeLimitSeconds]);

  // ── Per-question stopwatch ─────────────────────────────────
  // lastSaveTimeRef tracks the last moment whose elapsed seconds
  // we've already committed to a save. Every save sends the delta
  // since then. The ref advances OPTIMISTICALLY — at the moment
  // we compute the delta, before the round-trip resolves — so a
  // concurrent beacon or save can't read the same baseline and
  // bill the same seconds twice. The cost is that a failed save
  // drops the delta on the floor; we accept that small leak in
  // exchange for closing the lost-update race that was inflating
  // attempts.time_spent_ms past the module's wall-clock allotment.
  // Resets when moduleItemId changes so question-level timing is
  // independent of navigation.
  const lastSaveTimeRef = useRef(Date.now());
  useEffect(() => {
    lastSaveTimeRef.current = Date.now();
  }, [moduleItemId]);

  // Beacon on visibilitychange / beforeunload so time spent on the
  // current question lands durably even if the student closes the
  // tab, puts the browser to sleep, etc. Uses navigator.sendBeacon
  // against /api/practice-test/time-ping (a regular POST route),
  // since Server Actions can't be addressed by sendBeacon.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function fireBeacon() {
      const now = Date.now();
      const deltaMs = Math.max(0, now - lastSaveTimeRef.current);
      if (deltaMs < 500) return;
      // Advance the baseline BEFORE queuing the beacon so a
      // concurrent flushSave can't read the same baseline and
      // double-bill these seconds.
      lastSaveTimeRef.current = now;
      try {
        const payload = JSON.stringify({
          moduleAttemptId,
          moduleItemId,
          timeSpentMs: deltaMs,
        });
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/practice-test/time-ping', blob);
      } catch { /* sendBeacon unsupported — ignore */ }
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        fireBeacon();
      } else {
        // Back from a hidden tab. The beacon at hide time already
        // billed the active segment; re-baseline so the hidden gap
        // itself is never billed to whichever question happened to
        // be open when the student returns. (The module wall-clock
        // keeps running regardless — per-question time is meant to
        // measure engagement, not elapsed time.)
        lastSaveTimeRef.current = Date.now();
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', fireBeacon);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', fireBeacon);
    };
  }, [moduleAttemptId, moduleItemId]);

  // ── Answer save (debounced for SPR, immediate for MCQ) ────
  const saveTimer = useRef(null);
  const pendingSaveRef = useRef(null);

  // Patch the navigator pill for an item the student just answered.
  // Matches the server's answered semantics (a saved attempts row
  // with a response); never un-sets — re-saves keep the pill solid.
  const markItemAnswered = useCallback((itemId) => {
    setNavItems((prev) => prev.map((it) => (
      it.moduleItemId === itemId && !it.answered
        ? { ...it, answered: true }
        : it
    )));
  }, []);

  const flushSave = useCallback(async (answer) => {
    const now = Date.now();
    const deltaMs = Math.max(0, now - lastSaveTimeRef.current);
    // Advance the baseline before awaiting the round-trip. If a
    // visibilitychange beacon fires while this action is in
    // flight, it'll see a fresh baseline and won't re-bill these
    // seconds. A failed save loses this delta — acceptable to
    // prevent the double-count that was inflating module totals.
    if (deltaMs > 0) lastSaveTimeRef.current = now;
    const fd = new FormData();
    fd.set('moduleAttemptId', moduleAttemptId);
    fd.set('moduleItemId', moduleItemId);
    if (question.questionType === 'spr') {
      fd.set('responseText', answer.responseText ?? '');
    } else if (answer.selectedOptionId) {
      fd.set('optionId', answer.selectedOptionId);
    }
    if (deltaMs > 0) fd.set('timeSpentMs', String(deltaMs));
    try {
      const res = await recordItemAnswerAction(null, fd);
      if (!res?.ok) {
        setSaveError(res?.error ?? 'Could not save');
        return;
      }
      setSaveError(null);
    } catch (err) {
      setSaveError(err.message ?? String(err));
    }
  }, [moduleAttemptId, moduleItemId, question.questionType, recordItemAnswerAction]);

  function scheduleSave(next) {
    pendingSaveRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const delay = question.questionType === 'spr' ? 600 : 0;
    saveTimer.current = setTimeout(() => {
      flushSave(pendingSaveRef.current);
    }, delay);
  }

  function handleSelectOption(id) {
    setSelectedId(id);
    markItemAnswered(moduleItemId);
    scheduleSave({ selectedOptionId: id });
  }

  function handleResponseText(text) {
    setResponseText(text);
    if (text.trim().length > 0) markItemAnswered(moduleItemId);
    scheduleSave({ responseText: text });
  }

  // Mark-for-review toggle. §6.3b: useOptimistic replaces the
  // hand-rolled flip-then-rollback — the optimistic flag applies
  // instantly inside the transition and auto-reverts if the action
  // fails (setMarked never fires). The navigator pill still patches
  // on confirmation only; the header button is the primary feedback
  // surface.
  const [optimisticMarked, addOptimisticMarked] = useOptimistic(marked);
  function handleToggleMark() {
    if (markPending) return;
    const itemId = moduleItemId;
    setMarkPending(true);
    reactStartTransition(async () => {
      addOptimisticMarked(!marked);
      const fd = new FormData();
      fd.set('moduleAttemptId', moduleAttemptId);
      fd.set('moduleItemId', itemId);
      try {
        const res = await toggleMarkForReviewAction(null, fd);
        if (res?.ok && typeof res.marked === 'boolean') {
          setMarked(res.marked);
          setNavItems((prev) => prev.map((it) => (
            it.moduleItemId === itemId ? { ...it, marked: res.marked } : it
          )));
        } else if (!res?.ok) {
          setSaveError(res?.error ?? 'Could not flag question');
        }
      } catch (err) {
        setSaveError(err.message ?? String(err));
      } finally {
        setMarkPending(false);
      }
    });
  }

  // Fire any pending save without awaiting — Server Actions run on
  // their own and we don't need to block navigation on the round-
  // trip. The user already saw the answer selected; the client-side
  // form overlay (formByPosRef) keeps the answer visible if they
  // navigate back before the save lands.
  //
  // Also flushes elapsed time as a time-only save so questions the
  // student only looked at still get attempts.time_spent_ms
  // credit. The time-only path inserts a placeholder attempts row
  // if one doesn't exist yet — same shape mark-for-review uses.
  function flushSavePendingInBackground() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pendingSaveRef.current) {
      const payload = pendingSaveRef.current;
      pendingSaveRef.current = null;
      flushSave(payload).catch(() => {});
      return;
    }
    const now = Date.now();
    const deltaMs = Math.max(0, now - lastSaveTimeRef.current);
    if (deltaMs < 500) return;
    // Advance the baseline immediately — same anti-double-bill
    // reasoning as flushSave / fireBeacon.
    lastSaveTimeRef.current = now;
    const fd = new FormData();
    fd.set('moduleAttemptId', moduleAttemptId);
    fd.set('moduleItemId', moduleItemId);
    fd.set('timeSpentMs', String(deltaMs));
    (async () => {
      try { await recordItemAnswerAction(null, fd); }
      catch { /* fire-and-forget */ }
    })();
  }

  // ── Client-state navigation (§6.3b) ───────────────────────
  const applyPayload = useCallback((payload) => {
    // View Transitions API gives us a free cross-fade across the
    // synchronous state update — the browser snapshots the DOM,
    // our setState swaps the question content, and the browser
    // animates between the two snapshots. The question area
    // carries view-transition-name: sw-question (TestRunner
    // .module.css) so it animates as its own group while the
    // Bluebook chrome — timer, bars — stays visually still.
    // Falls through synchronously on browsers without the API or
    // for users with prefers-reduced-motion: reduce.
    const swap = () => {
      // The student's own work this session beats the payload's
      // server snapshot (which may predate an in-flight save).
      const local = formByPosRef.current.get(payload.position);
      setPosition(payload.position);
      setModuleItemId(payload.moduleItemId);
      setQuestion(payload.question);
      setDesmosState(payload.desmos);
      setSelectedId(local ? local.selectedId : (payload.initialAnswer.selectedOptionId ?? null));
      setResponseText(local ? local.responseText : (payload.initialAnswer.responseText ?? ''));
      setMarked(local ? local.marked : !!payload.initialAnswer.markedForReview);
      setSaveError(null);
      // navItems deliberately NOT taken from the payload — the
      // client's patched copy is authoritative (see declaration).
    };

    const supportsVT =
      typeof document !== 'undefined'
      && typeof document.startViewTransition === 'function';
    const reduceMotion =
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (supportsVT && !reduceMotion) {
      const vt = document.startViewTransition(swap);
      // A hidden document (backgrounded tab) aborts the transition;
      // the swap itself still applies. Swallow the rejection so it
      // doesn't surface as an unhandled-rejection error.
      vt.finished.catch(() => {});
    } else {
      swap();
    }

    // Drop stale prefetch entries from before this hop — adjacents
    // will be re-warmed by the effect above.
    prefetchRef.current = new Map();
    // Keep the URL in sync so refresh / share / deep-link / back-
    // forward all still resolve to the right question. pushState
    // (not replaceState) preserves the existing UX where the
    // browser back button walks back through the module. Skip
    // entirely when the URL already matches — popstate hops
    // (back / forward button) get here AFTER the browser has
    // already updated the URL, and re-pushing would corrupt the
    // history stack.
    if (typeof window !== 'undefined') {
      const url = `/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/${payload.position}`;
      if (window.location.pathname !== url) {
        try { window.history.pushState(null, '', url); } catch {}
      }
    }
  }, [attemptId, moduleAttemptId]);

  const navigateTo = useCallback((target) => {
    if (target < 0 || target >= total) return;
    if (target === positionRef.current) return;
    // Snapshot the question we're leaving so returning to it always
    // shows the student's latest work, even if a prefetched payload
    // raced the fire-and-forget save.
    formByPosRef.current.set(positionRef.current, { ...formRef.current });
    const cache = prefetchRef.current;
    let pending = cache.get(target);
    if (!pending) {
      pending = callLoad(target);
      cache.set(target, pending);
    }
    startNav(async () => {
      try {
        const res = await pending;
        if (!res?.ok) {
          setSaveError(res?.error ?? 'Could not load that question.');
          return;
        }
        if (res.result.kind === 'redirect') {
          router.push(res.result.redirectTo);
          return;
        }
        if (res.result.kind !== 'ok') {
          setSaveError('Could not load that question.');
          return;
        }
        applyPayload(res.result.payload);
      } catch (err) {
        setSaveError(err?.message ?? 'Could not load that question.');
      }
    });
  }, [total, callLoad, applyPayload, router]);

  function goToPosition(newPosition) {
    flushSavePendingInBackground();
    setNavOpen(false);
    navigateTo(newPosition);
  }

  function goNext() {
    if (position + 1 >= total) {
      flushSavePendingInBackground();
      setNavOpen(false);
      startNav(() => {
        router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
      });
      return;
    }
    goToPosition(position + 1);
  }

  function goPrev() {
    if (position === 0) return;
    goToPosition(position - 1);
  }

  function goToReview() {
    flushSavePendingInBackground();
    setNavOpen(false);
    startNav(() => {
      router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
    });
  }

  // popstate keeps the in-page state in sync with the browser's
  // own back/forward buttons. We re-resolve the position from the
  // current URL and load it through the action; if the URL doesn't
  // match this module at all, fall back to a real route change.
  useEffect(() => {
    function onPop() {
      if (typeof window === 'undefined') return;
      const m = window.location.pathname.match(
        new RegExp(
          `^/practice/test/attempt/${escapeRegExp(attemptId)}/m/${escapeRegExp(moduleAttemptId)}/(\\d+)$`,
        ),
      );
      if (!m) {
        // Browser navigated outside the module — let the router
        // handle it.
        router.refresh();
        return;
      }
      const pos = Number(m[1]);
      if (!Number.isInteger(pos) || pos === positionRef.current) return;
      if (pos >= total) return;
      formByPosRef.current.set(positionRef.current, { ...formRef.current });
      void (async () => {
        const res = await callLoad(pos);
        if (!res?.ok) return;
        if (res.result.kind === 'redirect') {
          router.push(res.result.redirectTo);
          return;
        }
        if (res.result.kind === 'ok') applyPayload(res.result.payload);
      })();
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [attemptId, moduleAttemptId, total, callLoad, applyPayload, router]);

  // Save and Exit. We await the pending answer save before pausing
  // so the student's last-edited response and elapsed time per
  // question land on the server first; THEN paused_at is stamped
  // on the module so the entry page kicks them to the resume
  // screen on return. Same await-discipline as the timeout
  // handler — pausing closes the runner, so we need durable
  // writes before we redirect.
  async function handleSaveAndExit() {
    const ok = await confirm({
      title: 'Save your progress and exit?',
      body: 'The timer pauses and your answers are saved — you can pick up right here later from the dashboard.',
      confirmLabel: 'Save & exit',
      cancelLabel: 'Keep working',
    });
    if (!ok) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pendingSaveRef.current) {
      try { await flushSave(pendingSaveRef.current); } catch {}
      pendingSaveRef.current = null;
    } else {
      // No pending answer change, but elapsed time on the current
      // question is still pending — flush it as a time-only save
      // so paused_at doesn't lose the seconds the student spent
      // staring at this question before clicking Save and Exit.
      const now = Date.now();
      const deltaMs = Math.max(0, now - lastSaveTimeRef.current);
      if (deltaMs >= 500) {
        lastSaveTimeRef.current = now;
        const fd = new FormData();
        fd.set('moduleAttemptId', moduleAttemptId);
        fd.set('moduleItemId', moduleItemId);
        fd.set('timeSpentMs', String(deltaMs));
        try { await recordItemAnswerAction(null, fd); }
        catch { /* swallow — pausing should still proceed */ }
      }
    }
    const fd = new FormData();
    fd.set('moduleAttemptId', moduleAttemptId);
    fd.set('position', String(position));
    try {
      const res = await pauseTestModuleAction(null, fd);
      if (!res?.ok) {
        setSaveError(res?.error ?? 'Could not pause');
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setSaveError(err.message ?? String(err));
    }
  }

  // Auto-submit on timeout. We DO await the pending save here
  // (unlike user-driven navigation) because the module is closing
  // and we want the last answer durably recorded before the
  // server-side finishModule counts correct answers.
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (secondsRemaining > 0) return;
    if (autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    (async () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSaveRef.current) {
        try { await flushSave(pendingSaveRef.current); } catch {}
        pendingSaveRef.current = null;
      }
      const fd = new FormData();
      fd.set('moduleAttemptId', moduleAttemptId);
      try {
        const res = await finishModuleAction(null, fd);
        routeAfterFinish(res, router, attemptId);
      } catch (err) {
        setSaveError(err.message ?? String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsRemaining]);

  const timerClass = useMemo(() => {
    if (secondsRemaining <= CRITICAL_REMAINING_SECONDS) return `${s.timer} ${s.timerCritical}`;
    if (secondsRemaining <= WARNING_REMAINING_SECONDS) return `${s.timer} ${s.timerWarn}`;
    return s.timer;
  }, [secondsRemaining]);

  const subjectName = moduleInfo.subject === 'RW' ? 'Reading and Writing' : 'Math';
  const moduleLabel = `Section ${moduleInfo.subject === 'RW' ? 1 : 2}, Module ${moduleInfo.moduleNumber}: ${subjectName}`;

  // Build the question header passed into QuestionRenderer. The
  // Mark-for-Review pill's background doesn't change on toggle —
  // only the bookmark glyph tints gold when marked. That keeps the
  // header chrome stable and echoes the same gold-flag treatment
  // the navigator bubbles use.
  const headerNode = (
    <div className={s.questionHeader}>
      <span className={s.questionNumChip}>{position + 1}</span>
      <button
        type="button"
        onClick={handleToggleMark}
        className={s.markBtn}
        aria-pressed={optimisticMarked}
      >
        <BookmarkIcon
          filled={optimisticMarked}
          className={optimisticMarked ? s.markIconActive : s.markIconInactive}
        />
        Mark for Review
      </button>
    </div>
  );

  // The renderer fully resets its keyed-by-question internal state
  // when the student moves on — only the QuestionRenderer subtree
  // gets the new key, not the whole island.
  const rendererKey = question.questionId;

  return (
    <div className={s.shell}>
      {/* Top bar ———————————————————————————— */}
      <div className={s.topBar}>
        <div className={s.topBarLeft}>
          <div className={s.moduleLabel}>{moduleLabel}</div>
          <div className={s.testName}>{moduleInfo.testName}</div>
        </div>
        <div className={s.topBarCenter}>
          {/* suppressHydrationWarning: the clock text derives from
              Date.now(), so the server-rendered digits are always a
              beat behind the client's first paint. */}
          <div className={timerClass} aria-live="off" suppressHydrationWarning>
            {formatClock(secondsRemaining)}
          </div>
        </div>
        <div className={s.topBarRight}>
          {/* Desmos saved state first — leftmost on the top bar.
              Anchors the math toolset on the live runner the same
              way it does on the report surfaces. */}
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
              title={desmosOpen ? 'Hide calculator' : 'Show calculator'}
            />
          )}
          <button
            type="button"
            className={s.saveExitBtn}
            onClick={handleSaveAndExit}
            title="Save your progress and exit. The timer pauses; you can resume later from the dashboard."
          >
            Save &amp; exit
          </button>
        </div>
      </div>

      {/* Question body ————————————————————— */}
      <main className={s.main}>
        {/* §6.3b instant-next: the visible question and a hidden
            pre-render of the NEXT question live in a keyed array
            of <Activity> panes. On Next, the hidden pane's key
            becomes the visible key, so React flips the SAME
            subtree from hidden to visible — the HTML has already
            been parsed and the tree built, making the swap
            near-instant. Keys are questionId on both the pane
            and the renderer so the instance survives the flip. */}
        {[
        <Activity key={rendererKey} mode="visible">
        <QuestionRenderer
          key={rendererKey}
          mode="practice"
          layout={question.layout ?? 'single'}
          question={question}
          selectedOptionId={selectedId}
          onSelectOption={handleSelectOption}
          responseText={responseText}
          onResponseText={handleResponseText}
          crossedOptionIds={currentCrossed}
          onToggleCross={toggleCross}
          result={null}
          headerNode={headerNode}
          leftSlot={
            desmosEligible ? (
              <DesmosPanel
                isOpen={desmosVisible}
                // Module-scoped storage so the student's graphing
                // work persists across questions within a module
                // (matches Bluebook behavior) but resets between
                // modules.
                storageKey={`desmos:test:${moduleAttemptId}`}
                onCalcReady={(c) => { calcRef.current = c; }}
              />
            ) : null
          }
          leftSlotCollapsed={desmosEligible && !desmosVisible}
          slotAnimate={desmosAnimate}
        />
        </Activity>,
        nextPayload && nextPayload.question.questionId !== rendererKey ? (
          <Activity key={nextPayload.question.questionId} mode="hidden">
            <QuestionRenderer
              key={nextPayload.question.questionId}
              mode="practice"
              layout={nextPayload.question.layout ?? 'single'}
              question={nextPayload.question}
              selectedOptionId={null}
              onSelectOption={() => {}}
              responseText=""
              onResponseText={() => {}}
              crossedOptionIds={null}
              onToggleCross={() => {}}
              result={null}
            />
          </Activity>
        ) : null,
        ]}
        {saveError && (
          <p role="alert" className={s.saveError}>{saveError}</p>
        )}
      </main>

      {/* Bottom bar ———————————————————————— */}
      <div className={s.bottomBar}>
        <div className={s.bottomBarLeft} />
        <div className={s.bottomBarCenter}>
          <NavPopover
            open={navOpen}
            onClose={() => setNavOpen(false)}
            moduleLabel={moduleLabel}
            navItems={navItems}
            currentPosition={position}
            onJump={(p) => goToPosition(p)}
            onReview={goToReview}
          />
          <button
            type="button"
            className={s.reviewTrigger}
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
          >
            Question {position + 1} of {total}
            <span className={s.reviewTriggerChevron} aria-hidden="true">▾</span>
          </button>
        </div>
        <div className={s.bottomBarRight}>
          <button
            type="button"
            className={`${s.navBtnSecondary} ${isNavPending ? s.navBtnBusy : ''}`}
            onClick={goPrev}
            disabled={position === 0 || isNavPending}
          >
            Back
          </button>
          <button
            type="button"
            className={`${s.navBtnPrimary} ${isNavPending ? s.navBtnBusy : ''}`}
            onClick={goNext}
            disabled={isNavPending}
          >
            Next
          </button>
        </div>
      </div>

      {/* Top-of-viewport progress strip while nav is pending.
          Gives the student an instant "something is happening"
          cue for the rare uncached hop (jump via navigator,
          leaving for the review page). */}
      {isNavPending && <div className={s.navProgress} aria-hidden="true" />}

      {confirmDialog}
    </div>
  );
}

function computeRemaining(startedAtIso, timeLimitSeconds) {
  const start = new Date(startedAtIso).getTime();
  const elapsedSec = (Date.now() - start) / 1000;
  return Math.max(0, Math.floor(timeLimitSeconds - elapsedSec));
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function routeAfterFinish(res, router, attemptId) {
  if (!res?.ok) return;
  if (res.step === 'next-module' && res.nextModuleAttemptId) {
    router.push(`/practice/test/attempt/${attemptId}/m/${res.nextModuleAttemptId}/0`);
    return;
  }
  if (res.step === 'section-break' && res.nextModuleAttemptId) {
    router.push(`/practice/test/attempt/${attemptId}/m/${res.nextModuleAttemptId}/0`);
    return;
  }
  if (res.step === 'test-complete') {
    router.push(`/practice/test/attempt/${attemptId}/results`);
  }
}
