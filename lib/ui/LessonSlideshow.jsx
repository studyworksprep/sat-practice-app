// Reusable lesson slideshow runtime.
//
// Shared by the admin lesson preview AND the student viewer
// (app/(student)/learn/[lessonId]/LessonViewerInteractive.jsx) —
// both render the same block-by-block playthrough: branching
// knowledge checks (on_correct/on_incorrect/rejoin, executed for
// students via lib/lesson/runtime-navigation.mjs), Desmos
// interactives, and completion gating.
//
// Side effects are wired through optional callbacks:
//   onMarkBlockComplete(blockId)
//   onSubmitCheck(blockId, selectedIndex, isCorrect)
//   onSubmitDesmos(blockId, isCorrect)
//   onMarkComplete()
//
// Student viewer wires these to /api/lessons/[id]/progress; admin
// preview leaves them undefined and the runtime keeps progress in
// local state only, so admins can step through a lesson exactly
// the way a student would without writing to lesson_progress.
//
// questionLinkHref is a function (questionId) => href used by
// question_link blocks. Pass null to render question_link blocks
// as inert info cards (admin preview's default — preview should
// not navigate the user away into the practice runner).
//
// Desmos requires window.Desmos.GraphingCalculator at runtime;
// app/layout.js loads the script globally so any descendant of
// the root layout has it available.
//
// All styling lives in LessonSlideshow.module.css — add classes there
// rather than reaching for inline styles, which can't express the
// hover / focus / disabled / reduced-motion states this runtime needs.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HtmlBlock from '@/components/HtmlBlock';
import { MathText } from '@/lib/ui/MathText';
import { LessonCalculatorPane } from '@/lib/ui/LessonCalculatorPane';
import s from './LessonSlideshow.module.css';
import {
  isLessonCompletionLocked,
  normalizeLessonCalculatorPresentation,
  parseDesmosInteractiveContent,
  validateDesmosSubmission,
} from '@/lib/lesson/desmos-interactive.mjs';
import {
  buildBlockIndexMap,
  resolveAnswerNavigation,
  resolveContinueNavigation,
  resolveResumeIndex,
} from '@/lib/lesson/runtime-navigation.mjs';
import {
  skippedBlockIdsForForwardJump,
  shouldCompleteDesmosResult,
  shouldCompleteOnContinue,
} from '@/lib/lesson/runtime-progress.mjs';

// Above this many blocks the per-step segments get too thin to read, so
// the progress meter falls back to a continuous bar.
const MAX_SEGMENTED_BLOCKS = 30;

export function LessonSlideshow({
  blocks = [],
  initialCompletedBlockIds = [],
  initialCheckAnswers = {},
  initialIsComplete = false,
  onMarkBlockComplete,
  onSubmitCheck,
  onSubmitDesmos,
  onMarkComplete,
  questionLinkHref = null,
  showProgressBar = true,
  showCompleteButton = true,
  debugMode = false,
  calculatorStoragePrefix = 'lesson-desmos',
  // Optional call-to-action on the completion banner. The admin preview
  // leaves these unset so a read-only playthrough has no exit ramp.
  completionHref = null,
  completionLabel = 'Back to lessons',
}) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    resolveResumeIndex({
      blocks,
      completedBlockIds: initialCompletedBlockIds,
      isComplete: initialIsComplete,
    }),
  );
  const [showResumeNotice, setShowResumeNotice] = useState(
    () =>
      resolveResumeIndex({
        blocks,
        completedBlockIds: initialCompletedBlockIds,
        isComplete: initialIsComplete,
      }) > 0,
  );
  const [completedBlockIds, setCompletedBlockIds] = useState(
    () => new Set(initialCompletedBlockIds),
  );
  const completedBlockIdsRef = useRef(new Set(initialCompletedBlockIds));
  const progressWriteQueueRef = useRef(Promise.resolve());
  const [checkAnswers, setCheckAnswers] = useState(initialCheckAnswers);
  const [isComplete, setIsComplete] = useState(initialIsComplete);
  const [forceUnlockedBlockIds, setForceUnlockedBlockIds] = useState([]);
  const [debugByBlock, setDebugByBlock] = useState({});
  const [workflowDesmosContext, setWorkflowDesmosContext] = useState({});
  const [activeBranchState, setActiveBranchState] = useState(null);
  // Where the currently-answered block should go on the next Continue.
  // Set at answer time but applied only when the learner clicks
  // Continue, so feedback stays visible and desmos answers can be
  // retried. Shape: { fromIndex, nextIndex, activeBranchState }.
  const [pendingAdvance, setPendingAdvance] = useState(null);
  const [lessonCalculator, setLessonCalculator] = useState(null);
  const [calculatorOpenOverride, setCalculatorOpenOverride] = useState(null);
  // Scopes the arrow-key shortcuts: Desmos binds arrows for its own
  // graph navigation, and it lives outside this column.
  const lessonColumnRef = useRef(null);

  const blockIndexById = useMemo(() => buildBlockIndexMap(blocks), [blocks]);
  const currentBlock = blocks[currentIndex] || null;
  const baseCalculatorPresentation = useMemo(
    () => normalizeLessonCalculatorPresentation(currentBlock),
    [currentBlock],
  );
  const calculatorPresentation = useMemo(() => {
    if (
      currentBlock?.block_type === 'desmos_interactive' &&
      currentBlock.content?.inherit_from_previous_workflow_desmos
    ) {
      const inherited = workflowDesmosContext[currentBlock.content?.workflow_id];
      if (inherited?.state) {
        return { ...baseCalculatorPresentation, initial_state: inherited.state };
      }
    }
    return baseCalculatorPresentation;
  }, [baseCalculatorPresentation, currentBlock, workflowDesmosContext]);
  const currentCalculatorOverride = calculatorOpenOverride?.blockId === currentBlock?.id
    ? calculatorOpenOverride.open
    : null;
  const calculatorOpen = calculatorPresentation.display !== 'hidden' && (
    currentCalculatorOverride ?? calculatorPresentation.display === 'open'
  );
  const calculatorStorageKey = `${calculatorStoragePrefix}:${calculatorPresentation.scope}${
    calculatorPresentation.seed_version ? `:${calculatorPresentation.seed_version}` : ''
  }`;

  const progressPct =
    blocks.length > 0
      ? Math.round((completedBlockIds.size / blocks.length) * 100)
      : 0;

  // Answered-check tally for the completion banner. Counts only blocks
  // the learner actually submitted, so a lesson finished without doing
  // every optional check still reports an honest denominator.
  const checkTally = useMemo(() => {
    let answered = 0;
    let correct = 0;
    for (const block of blocks) {
      if (block.block_type !== 'check' && block.block_type !== 'desmos_interactive') {
        continue;
      }
      const answer = checkAnswers[block.id];
      if (!answer) continue;
      answered += 1;
      if (answer.correct) correct += 1;
    }
    return { answered, correct };
  }, [blocks, checkAnswers]);

  // Why Continue is disabled, as learner-facing copy — null when it
  // isn't. A silently dead button reads as a broken page, so the footer
  // renders this alongside it.
  const lockReason = (() => {
    if (!currentBlock) return null;
    if (
      currentBlock.block_type === 'desmos_interactive' &&
      currentBlock.content?.progression?.require_success &&
      !completedBlockIds.has(currentBlock.id) &&
      !forceUnlockedBlockIds.includes(currentBlock.id)
    ) {
      return 'Finish this activity in Desmos and check your work to continue.';
    }
    // A retry check gates Continue until it's answered correctly, the
    // same way a require_success desmos block does. It completes only on
    // a correct answer (see the check onSubmit wiring), so a
    // not-yet-completed retry check keeps the learner on the slide.
    if (
      currentBlock.block_type === 'check' &&
      currentBlock.content?.allow_retry &&
      !completedBlockIds.has(currentBlock.id)
    ) {
      return 'Answer correctly to continue.';
    }
    return null;
  })();
  const currentIsLocked = Boolean(lockReason);

  const enqueueProgressWrite = useCallback((write) => {
    if (typeof write !== 'function') return;
    progressWriteQueueRef.current = progressWriteQueueRef.current
      .catch(() => undefined)
      .then(write);
  }, []);

  const recordBlocksComplete = useCallback((blockIds) => {
    const freshIds = [...new Set(blockIds || [])]
      .filter(Boolean)
      .filter((blockId) => !completedBlockIdsRef.current.has(blockId));
    if (freshIds.length === 0) return;
    const next = new Set(completedBlockIdsRef.current);
    freshIds.forEach((blockId) => next.add(blockId));
    completedBlockIdsRef.current = next;
    setCompletedBlockIds(next);
    if (onMarkBlockComplete) {
      enqueueProgressWrite(async () => {
        for (const blockId of freshIds) {
          await onMarkBlockComplete(blockId);
        }
      });
    }
  }, [enqueueProgressWrite, onMarkBlockComplete]);

  const recordBlockComplete = useCallback((blockId) => {
    recordBlocksComplete([blockId]);
  }, [recordBlocksComplete]);

  function recordCheckAnswer(blockId, payload, { markComplete = true } = {}) {
    setCheckAnswers((prev) => ({ ...prev, [blockId]: payload }));
    if (markComplete) {
      const next = new Set(completedBlockIdsRef.current);
      next.add(blockId);
      completedBlockIdsRef.current = next;
      setCompletedBlockIds(next);
    }
  }

  // Record where an answered block should navigate next, but stay put:
  // the learner reads the correct/incorrect feedback (and can retry a
  // desmos block) before advancing. The footer Continue button applies
  // this via goNext, honouring any on_correct/on_incorrect target.
  function recordAnswerNav(block, isCorrect) {
    const result = resolveAnswerNavigation({
      block,
      isCorrect,
      currentIndex,
      totalBlocks: blocks.length,
      blockIndexById,
    });
    setPendingAdvance({
      fromIndex: currentIndex,
      nextIndex: result.nextIndex,
      activeBranchState: result.activeBranchState,
    });
  }

  const goNext = useCallback(() => {
    setShowResumeNotice(false);
    const departingBlock = blocks[currentIndex];
    if (shouldCompleteOnContinue(departingBlock)) {
      recordBlockComplete(departingBlock.id);
    }
    // First Continue after answering: jump to the recorded branch /
    // linear target. Subsequent Continues use rejoin-aware navigation.
    if (pendingAdvance && pendingAdvance.fromIndex === currentIndex) {
      recordBlocksComplete(
        skippedBlockIdsForForwardJump(blocks, currentIndex, pendingAdvance.nextIndex),
      );
      setCurrentIndex(pendingAdvance.nextIndex);
      setActiveBranchState(pendingAdvance.activeBranchState);
      setPendingAdvance(null);
      return;
    }
    const result = resolveContinueNavigation({
      blocks,
      currentIndex,
      activeBranchState,
      blockIndexById,
    });
    recordBlocksComplete(
      skippedBlockIdsForForwardJump(blocks, currentIndex, result.nextIndex),
    );
    setCurrentIndex(result.nextIndex);
    setActiveBranchState(result.activeBranchState);
  }, [activeBranchState, blockIndexById, blocks, currentIndex, pendingAdvance, recordBlockComplete, recordBlocksComplete]);

  const goPrev = useCallback(() => {
    setShowResumeNotice(false);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  function restartFromBeginning() {
    setShowResumeNotice(false);
    setCurrentIndex(0);
    setActiveBranchState(null);
    setPendingAdvance(null);
  }

  const canGoNext = currentIndex < blocks.length - 1 && !currentIsLocked;
  const canGoPrev = currentIndex > 0;

  // ← / → step through the lesson. Scoped to the lesson column so the
  // shortcut never steals arrow keys from Desmos (which owns them for
  // graph navigation) or from a text field; `document.body` is included
  // so the keys work before anything has been focused.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;

      const target = event.target;
      const inScope =
        target === document.body ||
        (lessonColumnRef.current && lessonColumnRef.current.contains(target));
      if (!inScope) return;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft' && canGoPrev) {
        event.preventDefault();
        goPrev();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canGoNext, canGoPrev, goNext, goPrev]);

  function captureWorkflowDesmosState(block, payload) {
    const workflowId = block?.content?.workflow_id;
    if (!workflowId || !payload?.state) return;
    setWorkflowDesmosContext((prev) => ({
      ...prev,
      [workflowId]: payload,
    }));
  }

  function handleMarkComplete() {
    if (currentBlock?.block_type === 'lesson_complete') {
      recordBlockComplete(currentBlock.id);
    }
    setIsComplete(true);
    if (onMarkComplete) {
      enqueueProgressWrite(() => onMarkComplete());
    }
  }

  if (blocks.length === 0) {
    return (
      <div className={s.empty}>
        <p className={s.muted}>This lesson has no blocks yet.</p>
      </div>
    );
  }

  const calculatorToggleVisible =
    calculatorPresentation.display !== 'hidden' && !calculatorOpen;

  return (
    <div className={s.viewer}>
      {/* One full-width band above both columns: progress + the Desmos
          re-open affordance. Keeping it out of the lesson column means
          the lesson card and the calculator pane top-align, instead of
          the ragged edge the old in-column placement produced. */}
      {(showProgressBar || calculatorToggleVisible) && (
        <div className={s.topBand}>
          {showProgressBar && (
            <>
              {blocks.length <= MAX_SEGMENTED_BLOCKS ? (
                <div className={s.progressSegments} aria-hidden="true">
                  {blocks.map((block, i) => (
                    <span
                      key={block.id ?? i}
                      className={`${s.segment} ${
                        completedBlockIds.has(block.id) ? s.segmentDone : ''
                      } ${i === currentIndex ? s.segmentCurrent : ''}`}
                    />
                  ))}
                </div>
              ) : (
                <div className={s.progressTrack} aria-hidden="true">
                  <div
                    className={`${s.progressFill} ${isComplete ? s.progressFillComplete : ''}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
              <span className={s.progressPct}>
                {isComplete ? 'Complete' : `${progressPct}%`}
              </span>
            </>
          )}
          {calculatorToggleVisible && (
            <button
              type="button"
              className={s.calculatorToggle}
              onClick={() => setCalculatorOpenOverride({ blockId: currentBlock?.id, open: true })}
            >
              Open Desmos
              {calculatorPresentation.required ? ' · required' : ''}
            </button>
          )}
        </div>
      )}

      <div className={`${s.workspace} ${calculatorOpen ? '' : s.workspaceSingle}`}>
      <div className={s.lessonColumn} ref={lessonColumnRef}>
      {showResumeNotice && (
        <div className={s.resumeNotice} role="status">
          <span>Picking up where you left off.</span>
          <button
            type="button"
            className={s.resumeRestart}
            onClick={restartFromBeginning}
          >
            Start from the beginning
          </button>
        </div>
      )}

      {currentBlock && (
        <div key={currentBlock.id} className={s.blockHost}>
          {currentBlock.block_type === 'text' && (
            <TextBlock
              block={currentBlock}
              isRead={completedBlockIds.has(currentBlock.id)}
              onRead={() => recordBlockComplete(currentBlock.id)}
            />
          )}
          {currentBlock.block_type === 'video' && (
            <VideoBlock
              block={currentBlock}
              isWatched={completedBlockIds.has(currentBlock.id)}
              onWatched={() => recordBlockComplete(currentBlock.id)}
            />
          )}
          {currentBlock.block_type === 'check' && (
            <CheckBlock
              block={currentBlock}
              previousAnswer={checkAnswers[currentBlock.id]}
              onSubmit={(selected, correct) => {
                // In retry mode an incorrect attempt is purely a
                // client-side nudge: it must not be persisted (the
                // progress action marks any submitted check complete,
                // which would let the gate be bypassed on reload) and
                // must not arm navigation. Only a correct answer — or
                // any answer when retry is off — finalizes the block.
                const allowRetry = Boolean(currentBlock.content?.allow_retry);
                if (allowRetry && !correct) return;
                recordCheckAnswer(currentBlock.id, {
                  selected,
                  correct,
                });
                if (onSubmitCheck) {
                  enqueueProgressWrite(() =>
                    onSubmitCheck(currentBlock.id, selected, correct),
                  );
                }
                recordAnswerNav(currentBlock, correct);
              }}
            />
          )}
          {currentBlock.block_type === 'question_link' && (
            <QuestionLinkBlock
              block={currentBlock}
              isComplete={completedBlockIds.has(currentBlock.id)}
              hrefFor={questionLinkHref}
              onOpen={() => recordBlockComplete(currentBlock.id)}
              debugMode={debugMode}
            />
          )}
          {currentBlock.block_type === 'desmos_interactive' && (
            <DesmosInteractiveBlock
              block={currentBlock}
              calculator={lessonCalculator}
              previousAnswer={checkAnswers[currentBlock.id]}
              onResult={(isCorrect) => {
                // For a require_success block, only a correct answer
                // completes it (and so unlocks Continue) — an incorrect
                // attempt leaves it locked so the learner can retry.
                const markComplete = shouldCompleteDesmosResult(currentBlock, isCorrect);
                recordCheckAnswer(
                  currentBlock.id,
                  {
                    selected: null,
                    correct: isCorrect,
                    type: 'desmos_interactive',
                  },
                  { markComplete },
                );
                if (markComplete && onSubmitDesmos) {
                  enqueueProgressWrite(() =>
                    onSubmitDesmos(currentBlock.id, isCorrect),
                  );
                }
                recordAnswerNav(currentBlock, isCorrect);
              }}
              onUnlock={() => {
                setForceUnlockedBlockIds((prev) =>
                  prev.includes(currentBlock.id)
                    ? prev
                    : [...prev, currentBlock.id],
                );
              }}
              onCaptureWorkflowContext={(payload) =>
                captureWorkflowDesmosState(currentBlock, payload)
              }
              debugMode={debugMode}
              onDebug={(payload) => {
                setDebugByBlock((prev) => ({
                  ...prev,
                  [currentBlock.id]: payload,
                }));
              }}
            />
          )}
          {currentBlock.block_type === 'lesson_complete' && (
            <LessonCompleteBlock
              block={currentBlock}
              isComplete={isComplete}
              onComplete={handleMarkComplete}
            />
          )}
        </div>
      )}

      {debugMode && currentBlock && (
        <details className={s.debugCard}>
          <summary className={s.debugSummary}>Debug info</summary>
          <div className={s.debugGrid}>
            <DebugRow k="block_id" v={currentBlock.id} />
            <DebugRow k="block_type" v={currentBlock.block_type} />
            <DebugRow
              k="workflow"
              v={`${currentBlock.content?.workflow_id || '—'} · step ${
                currentBlock.content?.step_index ?? '—'
              }/${currentBlock.content?.total_steps ?? '—'}`}
            />
            <DebugRow
              k="validation_mode"
              v={currentBlock.content?.validation?.mode || '—'}
            />
            <DebugRow
              k="attempts"
              v={debugByBlock[currentBlock.id]?.attempts ?? 0}
            />
            <DebugRow
              k="result"
              v={debugByBlock[currentBlock.id]?.success ? 'pass' : 'fail'}
            />
            <DebugRow
              k="reasons"
              v={(debugByBlock[currentBlock.id]?.reasons || []).join(', ') || '—'}
            />
            <DebugRow
              k="next_block"
              v={
                debugByBlock[currentBlock.id]?.nextBlockId ||
                blocks[currentIndex + 1]?.id ||
                '—'
              }
            />
            <DebugRow
              k="rejoin_target"
              v={currentBlock.content?.rejoin_at_block_id || '—'}
            />
          </div>
        </details>
      )}

      {/* margin-top:auto pins this to the column's bottom edge, so in
          two-column mode the nav lines up with the calculator pane's
          bottom instead of floating mid-column. */}
      <div className={s.navFooter}>
      <div className={s.navRow}>
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className={s.navBtn}
        >
          Previous
        </button>
        <span className={s.navLabel}>
          Step {Math.min(currentIndex + 1, blocks.length)} of {blocks.length}
        </span>
        {/* The lesson_complete block is a terminal — it carries its own
            "Complete Lesson" button, so no Continue is shown on it. */}
        {currentBlock?.block_type === 'lesson_complete' ? (
          <span className={s.navSpacer} aria-hidden />
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex >= blocks.length - 1 || currentIsLocked}
            className={`${s.primaryBtn} ${s.navBtnNext}`}
          >
            Continue
          </button>
        )}
      </div>

      {currentIsLocked && (
        <p className={s.lockHint} role="status" aria-live="polite">
          {lockReason}
        </p>
      )}

      {showCompleteButton &&
        !isComplete &&
        currentBlock?.block_type !== 'lesson_complete' &&
        currentIndex >= blocks.length - 1 && (
          <div className={s.completeWrap}>
            <button
              type="button"
              onClick={handleMarkComplete}
              disabled={isLessonCompletionLocked(blocks, [...completedBlockIds])}
              className={s.completeBtn}
            >
              Mark Lesson Complete
            </button>
          </div>
        )}

      {isComplete && (
        <div className={s.completeBanner} role="status">
          <div className={s.completeCheck} aria-hidden="true">
            ✓
          </div>
          <div className={s.completeText}>Lesson complete</div>
          {checkTally.answered > 0 && (
            <p className={s.completeScore}>
              You answered {checkTally.correct} of {checkTally.answered}{' '}
              {checkTally.answered === 1 ? 'check' : 'checks'} correctly.
            </p>
          )}
          {completionHref && (
            <a href={completionHref} className={s.completeCta}>
              {completionLabel}
            </a>
          )}
        </div>
      )}
      </div>
      </div>
      {calculatorPresentation.display !== 'hidden' && (
        <LessonCalculatorPane
          open={calculatorOpen}
          presentation={calculatorPresentation}
          storageKey={calculatorStorageKey}
          onClose={() => setCalculatorOpenOverride({ blockId: currentBlock?.id, open: false })}
          onCalcReady={setLessonCalculator}
        />
      )}
      </div>
    </div>
  );
}

// ─── Block renderers ─────────────────────────────────────────────

function TextBlock({ block, isRead, onRead }) {
  useEffect(() => {
    if (isRead) return undefined;
    const timer = setTimeout(() => onRead(), 2000);
    return () => clearTimeout(timer);
  }, [isRead, onRead]);

  return (
    <div className={s.card}>
      <HtmlBlock
        className={`prose lesson-prose ${s.prosePane}`}
        html={block.content?.html || ''}
      />
    </div>
  );
}

// Terminal block: closing content plus a single "Complete Lesson" button
// that finishes the lesson. No Continue button and no dead-end.
function LessonCompleteBlock({ block, isComplete, onComplete }) {
  const label = block.content?.button_label || 'Complete Lesson';
  return (
    <div className={s.card}>
      <HtmlBlock
        className={`prose lesson-prose ${s.prosePane}`}
        html={block.content?.html || ''}
      />
      <div className={s.completeBlockActions}>
        <button
          type="button"
          onClick={onComplete}
          disabled={isComplete}
          className={s.completeBtn}
        >
          {isComplete ? 'Lesson Complete' : label}
        </button>
      </div>
    </div>
  );
}

function VideoBlock({ block, isWatched, onWatched }) {
  const embedUrl = getEmbedUrl(block.content?.url);

  return (
    <div className={`${s.card} ${s.cardFlush}`}>
      {embedUrl ? (
        <div
          className={s.videoFrame}
          onClick={() => {
            if (!isWatched) onWatched();
          }}
        >
          <iframe
            src={embedUrl}
            title="lesson video"
            className={s.videoIframe}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className={s.videoFallback}>
          {block.content?.url ? (
            <a
              href={block.content.url}
              target="_blank"
              rel="noopener noreferrer"
              className={s.link}
            >
              {block.content.url}
            </a>
          ) : (
            <span className={s.muted}>No video URL set</span>
          )}
        </div>
      )}
      {block.content?.caption && (
        <p className={s.videoCaption}>{block.content.caption}</p>
      )}
    </div>
  );
}

function getEmbedUrl(url) {
  if (!url) return null;
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

// Knowledge-check renderer with two modes:
//   - default (one-shot): the first submit reveals the correct answer
//     and explanation and locks the block.
//   - retry (content.allow_retry): a wrong answer shows a hint and lets
//     the learner pick again without revealing the answer; the block
//     reveals + locks only once they're correct. The parent gates
//     Continue and completion on that correct answer.
function CheckBlock({ block, previousAnswer, onSubmit }) {
  const content = block.content || {};
  const choices = content.choices || [];
  const correctIdx = content.correct_index ?? 0;
  const allowRetry = Boolean(content.allow_retry);
  const hintHtml = content.hint || 'Not quite — take another look and try again.';

  const [selected, setSelected] = useState(previousAnswer?.selected ?? null);
  // `revealed` = block finalized: choices lock, correct answer + the
  // explanation show. In retry mode this happens only once correct; in
  // one-shot mode it happens on the first submit. A restored answer is
  // revealed when it was correct, or whenever retry is off.
  const [revealed, setRevealed] = useState(() => {
    if (!previousAnswer) return false;
    return allowRetry ? Boolean(previousAnswer.correct) : true;
  });
  // Set after a wrong attempt in retry mode: show the hint and keep the
  // choices live. Cleared the moment the learner changes their pick.
  const [showHint, setShowHint] = useState(false);

  function handleSelect(i) {
    if (revealed) return;
    setSelected(i);
    if (showHint) setShowHint(false);
  }

  function handleSubmit() {
    if (selected === null) return;
    const isCorrect = selected === correctIdx;
    onSubmit(selected, isCorrect);
    if (allowRetry && !isCorrect) {
      setShowHint(true);
      return;
    }
    setShowHint(false);
    setRevealed(true);
  }

  const stateClass = revealed
    ? selected === correctIdx
      ? s.checkCardCorrect
      : s.checkCardWrong
    : showHint
      ? s.checkCardWrong
      : '';

  return (
    <div className={`${s.card} ${s.checkCard} ${stateClass}`}>
      <div className={s.kicker}>Knowledge Check</div>
      <MathText as="p" className={s.checkPrompt}>{content.prompt}</MathText>

      <div className={s.choiceList}>
        {choices.map((choice, i) => {
          const isCorrectChoice = i === correctIdx;
          const isSelected = i === selected;
          // Flag a wrong pick in retry mode without giving away which
          // choice is correct — that stays hidden until the learner
          // gets there themselves.
          const isWrongPick = showHint && isSelected && !isCorrectChoice;
          let choiceState = '';
          if (revealed) {
            if (isCorrectChoice) choiceState = s.choiceCorrect;
            else if (isSelected) choiceState = s.choiceWrong;
          } else if (isWrongPick) {
            choiceState = s.choiceWrong;
          } else if (isSelected) {
            choiceState = s.choiceSelected;
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(i)}
              disabled={revealed}
              className={`${s.choice} ${choiceState}`}
            >
              <span className={s.choiceLetter}>
                {String.fromCharCode(65 + i)}
              </span>
              <MathText as="span">{choice}</MathText>
              {revealed && isCorrectChoice && (
                <span className={s.choiceMark}>✓</span>
              )}
              {((revealed && isSelected && !isCorrectChoice) || isWrongPick) && (
                <span className={s.choiceMark}>✗</span>
              )}
            </button>
          );
        })}
      </div>

      {!revealed && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected === null}
          className={`${s.primaryBtn} ${s.checkSubmit}`}
        >
          {showHint ? 'Try Again' : 'Check Answer'}
        </button>
      )}

      {showHint && !revealed && (
        <div className={s.hint} role="status" aria-live="polite">
          <strong>Try again.</strong> <MathText as="span">{hintHtml}</MathText>
        </div>
      )}

      {revealed && content.explanation && (
        <div className={s.explanation}>
          <strong>Explanation:</strong> <MathText as="span">{content.explanation}</MathText>
        </div>
      )}
    </div>
  );
}

function QuestionLinkBlock({ block, isComplete, hrefFor, onOpen, debugMode = false }) {
  const questionId = block.content?.question_id;
  if (!questionId) return null;

  const href = typeof hrefFor === 'function' ? hrefFor(questionId) : null;

  return (
    <div className={s.card}>
      <div className={s.questionRow}>
        <div>
          <div className={s.kicker}>Practice Question</div>
          {/* The raw question id is authoring detail — learners get a
              sentence, authors get the id back under debug. */}
          <span className={s.questionLabel}>
            {isComplete
              ? 'Open this question again to review your work.'
              : 'Try this question from the question bank.'}
          </span>
          {debugMode && <div className={s.questionId}>{questionId}</div>}
        </div>
        {href ? (
          <a
            href={href}
            className={s.secondaryBtn}
            onClick={() => {
              if (!isComplete) onOpen?.();
            }}
          >
            {isComplete ? 'Review' : 'Practice'} <span aria-hidden="true">→</span>
          </a>
        ) : (
          <span className={s.inertPill}>Linked question (preview · inert)</span>
        )}
      </div>
    </div>
  );
}

function DesmosInteractiveBlock({
  block,
  calculator,
  previousAnswer,
  onResult,
  onUnlock,
  onDebug,
  onCaptureWorkflowContext,
  debugMode = false,
}) {
  const [feedbackState, setFeedbackState] = useState(
    previousAnswer?.correct ? 'success' : 'idle',
  );
  const [feedbackHtml, setFeedbackHtml] = useState('');
  const [progressiveHintHtml, setProgressiveHintHtml] = useState('');
  const [solutionHtml, setSolutionHtml] = useState('');
  const [attempts, setAttempts] = useState(0);

  // Parse once per authored content object; feedback rerenders should not
  // repeat schema work while the shared calculator remains mounted.
  const { content, contentError } = useMemo(() => {
    try {
      return { content: parseDesmosInteractiveContent(block.content || {}), contentError: null };
    } catch (err) {
      return { content: null, contentError: err.message };
    }
  }, [block.content]);

  function extractStudentExpressions(calculator) {
    const expressionList = calculator?.getExpressions?.() || [];
    const stateList = calculator?.getState?.()?.expressions?.list || [];
    const byId = new Map(stateList.map((row) => [row.id, row]));

    return expressionList
      .map((expr) => ({
        latex: expr?.latex || byId.get(expr?.id)?.latex || '',
        hidden: Boolean(expr?.hidden ?? byId.get(expr?.id)?.hidden),
        type: expr?.type || byId.get(expr?.id)?.type || 'expression',
        sliderBounds:
          expr?.sliderBounds || byId.get(expr?.id)?.sliderBounds || null,
      }))
      .filter((expr) => expr.latex);
  }

  function toEvaluableExpression(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const eqIndex = value.indexOf('=');
    return eqIndex >= 0 ? value.slice(eqIndex + 1).trim() : value;
  }

  function evaluateWithDesmos(rawExpression, x) {
    if (!calculator || !calculator.HelperExpression) return NaN;

    const expression = toEvaluableExpression(rawExpression);
    if (!expression) return NaN;

    try {
      const helper = calculator.HelperExpression({
        latex: expression,
        variables: { x },
      });
      const value = helper.numericValue;
      helper?.destroy?.();
      return Number.isFinite(value) ? value : NaN;
    } catch {
      return NaN;
    }
  }

  function handleCheck() {
    if (!content || !calculator) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    const entered = extractStudentExpressions(calculator);
    const sliderNames = entered
      .map((row) => {
        const match = String(row.latex || '')
          .trim()
          .match(/^([A-Za-z][A-Za-z0-9_]*)\s*=/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    const result = validateDesmosSubmission({
      content,
      studentExpressions: entered,
      evaluateAtX: evaluateWithDesmos,
      attempts: nextAttempts,
    });
    onCaptureWorkflowContext?.({
      state: calculator.getState?.() || null,
      expressions: entered,
      capturedAt: Date.now(),
    });

    if (result.success) {
      setFeedbackState('success');
      setFeedbackHtml(
        result.feedbackHtml || content.feedback.success_message_html,
      );
      setProgressiveHintHtml(result.progressiveHintHtml || '');
      setSolutionHtml(result.solutionHtml || '');
      onResult?.(true);
    } else {
      setFeedbackState('retry');
      setFeedbackHtml(
        result.feedbackHtml || content.feedback.retry_message_html,
      );
      setProgressiveHintHtml(result.progressiveHintHtml || '');
      setSolutionHtml(result.solutionHtml || '');
      onResult?.(false);
      if (result.solutionHtml && content.progression?.require_success) {
        onUnlock?.();
      }
    }

    if (debugMode) {
      const branchTarget = result.success
        ? content.on_correct_block_id
        : content.on_incorrect_block_id;
      onDebug?.({
        attempts: nextAttempts,
        success: result.success,
        reasons: result.reasons || [result.reason].filter(Boolean),
        nextBlockId: branchTarget || content.rejoin_at_block_id || null,
        expressionCount: entered.length,
        sliders: [...new Set(sliderNames)],
      });
    }
  }

  if (contentError) {
    return (
      <div className={s.card}>
        <p className={s.errorText}>
          Invalid desmos_interactive block: {contentError}
        </p>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className={s.card}>
      {content.title && <h3 className={s.desmosTitle}>{content.title}</h3>}
      <HtmlBlock
        className={`prose lesson-prose ${s.prosePane}`}
        html={content.instructions_html}
      />
      <div className={s.calculatorCallout}>
        Complete this activity in the Desmos pane, then check your work here.
      </div>
      {content.caption_html && (
        <HtmlBlock className="prose lesson-prose muted" html={content.caption_html} />
      )}
      {!calculator && (
        <p className={s.loadingText}>
          Desmos is still loading. If it does not appear, refresh and try again.
        </p>
      )}

      <button
        type="button"
        onClick={handleCheck}
        disabled={!calculator}
        className={`${s.primaryBtn} ${s.checkSubmit}`}
      >
        Check Answer
      </button>

      {feedbackState === 'success' && (
        <div role="status" aria-live="polite" className={s.feedbackSuccess}>
          <HtmlBlock
            html={feedbackHtml || content.feedback.success_message_html}
          />
        </div>
      )}
      {feedbackState === 'retry' && (
        <div role="status" aria-live="polite" className={s.feedbackRetry}>
          <HtmlBlock html={feedbackHtml || content.feedback.retry_message_html} />
        </div>
      )}
      {progressiveHintHtml && (
        <div aria-live="polite" className={s.progressiveHint}>
          <HtmlBlock html={progressiveHintHtml} />
        </div>
      )}
      {solutionHtml && (
        <div aria-live="polite" className={s.solution}>
          <HtmlBlock html={solutionHtml} />
        </div>
      )}
    </div>
  );
}

function DebugRow({ k, v }) {
  return (
    <div>
      {k}: <code>{String(v)}</code>
    </div>
  );
}
