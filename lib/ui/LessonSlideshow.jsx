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

'use client';

import { useEffect, useMemo, useState } from 'react';
import HtmlBlock from '@/components/HtmlBlock';
import { MathText } from '@/lib/ui/MathText';
import { LessonCalculatorPane } from '@/lib/ui/LessonCalculatorPane';
import slideshowStyles from './LessonSlideshow.module.css';
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
} from '@/lib/lesson/runtime-navigation.mjs';

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
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedBlockIds, setCompletedBlockIds] = useState(
    () => new Set(initialCompletedBlockIds),
  );
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

  const currentIsLocked = Boolean(
    currentBlock &&
      ((currentBlock.block_type === 'desmos_interactive' &&
        currentBlock.content?.progression?.require_success &&
        !completedBlockIds.has(currentBlock.id) &&
        !forceUnlockedBlockIds.includes(currentBlock.id)) ||
        // A retry check gates Continue until it's answered correctly,
        // the same way a require_success desmos block does. It completes
        // only on a correct answer (see the check onSubmit wiring), so a
        // not-yet-completed retry check keeps the learner on the slide.
        (currentBlock.block_type === 'check' &&
          currentBlock.content?.allow_retry &&
          !completedBlockIds.has(currentBlock.id))),
  );

  function recordBlockComplete(blockId) {
    if (!blockId) return;
    setCompletedBlockIds((prev) => {
      if (prev.has(blockId)) return prev;
      const next = new Set(prev);
      next.add(blockId);
      return next;
    });
    onMarkBlockComplete?.(blockId);
  }

  function recordCheckAnswer(blockId, payload, { markComplete = true } = {}) {
    setCheckAnswers((prev) => ({ ...prev, [blockId]: payload }));
    if (markComplete) {
      setCompletedBlockIds((prev) => {
        const next = new Set(prev);
        next.add(blockId);
        return next;
      });
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

  function goNext() {
    // First Continue after answering: jump to the recorded branch /
    // linear target. Subsequent Continues use rejoin-aware navigation.
    if (pendingAdvance && pendingAdvance.fromIndex === currentIndex) {
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
    setCurrentIndex(result.nextIndex);
    setActiveBranchState(result.activeBranchState);
  }

  function goPrev() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  function captureWorkflowDesmosState(block, payload) {
    const workflowId = block?.content?.workflow_id;
    if (!workflowId || !payload?.state) return;
    setWorkflowDesmosContext((prev) => ({
      ...prev,
      [workflowId]: payload,
    }));
  }

  function handleMarkComplete() {
    setIsComplete(true);
    onMarkComplete?.();
  }

  if (blocks.length === 0) {
    return (
      <div style={S.empty}>
        <p style={S.muted}>This lesson has no blocks yet.</p>
      </div>
    );
  }

  return (
    <div className={`${slideshowStyles.workspace} ${calculatorOpen ? '' : slideshowStyles.workspaceSingle}`}>
      <div className={slideshowStyles.lessonColumn}>
      <div style={S.container}>
      {calculatorPresentation.display !== 'hidden' && !calculatorOpen && (
        <div className={slideshowStyles.calculatorToggleRow}>
          <button
            type="button"
            className={slideshowStyles.calculatorToggle}
            onClick={() => setCalculatorOpenOverride({ blockId: currentBlock?.id, open: true })}
          >
            Open Desmos
            {calculatorPresentation.required ? ' · required' : ''}
          </button>
        </div>
      )}
      {showProgressBar && (
        <div style={S.progressRow}>
          <div style={S.progressTrack}>
            <div
              style={{
                ...S.progressFill,
                width: `${progressPct}%`,
                background: isComplete
                  ? 'var(--success, #5ba876)'
                  : 'var(--color-app-accent, var(--accent, #4f7ce0))',
              }}
            />
          </div>
          <span style={S.progressPct}>
            {isComplete ? 'Complete' : `${progressPct}%`}
          </span>
        </div>
      )}

      {currentBlock && (
        <div key={currentBlock.id} style={S.blockHost}>
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
                onSubmitCheck?.(currentBlock.id, selected, correct);
                recordAnswerNav(currentBlock, correct);
              }}
            />
          )}
          {currentBlock.block_type === 'question_link' && (
            <QuestionLinkBlock
              block={currentBlock}
              isComplete={completedBlockIds.has(currentBlock.id)}
              hrefFor={questionLinkHref}
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
                const requireSuccess = Boolean(
                  currentBlock.content?.progression?.require_success,
                );
                recordCheckAnswer(
                  currentBlock.id,
                  {
                    selected: null,
                    correct: isCorrect,
                    type: 'desmos_interactive',
                  },
                  { markComplete: isCorrect || !requireSuccess },
                );
                onSubmitDesmos?.(currentBlock.id, isCorrect);
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
        <details style={S.debugCard}>
          <summary style={S.debugSummary}>Debug info</summary>
          <div style={S.debugGrid}>
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

      <div style={S.navRow}>
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          style={S.navBtn}
        >
          Previous
        </button>
        <span style={S.navLabel}>
          Block {Math.min(currentIndex + 1, blocks.length)} of {blocks.length}
        </span>
        {/* The lesson_complete block is a terminal — it carries its own
            "Complete Lesson" button, so no Continue is shown on it. */}
        {currentBlock?.block_type === 'lesson_complete' ? (
          <span style={{ width: 96 }} aria-hidden />
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex >= blocks.length - 1 || currentIsLocked}
            style={S.navBtn}
          >
            Continue
          </button>
        )}
      </div>

      {showCompleteButton &&
        !isComplete &&
        currentBlock?.block_type !== 'lesson_complete' &&
        currentIndex >= blocks.length - 1 && (
          <div style={S.completeWrap}>
            <button
              type="button"
              onClick={handleMarkComplete}
              disabled={isLessonCompletionLocked(blocks, [...completedBlockIds])}
              style={S.completeBtn}
            >
              Mark Lesson Complete
            </button>
          </div>
        )}

      {isComplete && (
        <div style={S.completeBanner}>
          <span style={S.completeText}>Lesson Complete!</span>
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
    <div style={S.card}>
      <HtmlBlock className="prose" html={block.content?.html || ''} />
    </div>
  );
}

// Terminal block: closing content plus a single "Complete Lesson" button
// that finishes the lesson. No Continue button and no dead-end.
function LessonCompleteBlock({ block, isComplete, onComplete }) {
  const label = block.content?.button_label || 'Complete Lesson';
  return (
    <div style={S.card}>
      <HtmlBlock className="prose" html={block.content?.html || ''} />
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button
          type="button"
          onClick={onComplete}
          disabled={isComplete}
          style={S.completeBtn}
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
    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
      {embedUrl ? (
        <div
          style={{
            position: 'relative',
            paddingBottom: '56.25%',
            height: 0,
            background: '#000',
          }}
          onClick={() => {
            if (!isWatched) onWatched();
          }}
        >
          <iframe
            src={embedUrl}
            title="lesson video"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div style={{ padding: 20 }}>
          {block.content?.url ? (
            <a
              href={block.content.url}
              target="_blank"
              rel="noopener noreferrer"
              style={S.link}
            >
              {block.content.url}
            </a>
          ) : (
            <span style={S.muted}>No video URL set</span>
          )}
        </div>
      )}
      {block.content?.caption && (
        <p style={{ ...S.muted, padding: '8px 16px', margin: 0 }}>
          {block.content.caption}
        </p>
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

  const borderColor = revealed
    ? selected === correctIdx
      ? 'var(--success, #5ba876)'
      : 'var(--danger, #d97775)'
    : showHint
      ? 'var(--danger, #d97775)'
      : 'var(--border, rgba(17,24,39,0.08))';

  return (
    <div style={{ ...S.card, border: `2px solid ${borderColor}` }}>
      <div style={S.kicker}>Knowledge Check</div>
      <MathText as="p" style={S.checkPrompt}>{content.prompt}</MathText>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {choices.map((choice, i) => {
          const isCorrectChoice = i === correctIdx;
          const isSelected = i === selected;
          // Flag a wrong pick in retry mode without giving away which
          // choice is correct — that stays hidden until the learner
          // gets there themselves.
          const isWrongPick = showHint && isSelected && !isCorrectChoice;
          let bg = 'transparent';
          let border = '1px solid var(--border, #ddd)';
          if (revealed) {
            if (isCorrectChoice) {
              bg = 'rgba(91,168,118,0.10)';
              border = '1px solid var(--success, #5ba876)';
            } else if (isSelected) {
              bg = 'rgba(217,119,117,0.10)';
              border = '1px solid var(--danger, #d97775)';
            }
          } else if (isWrongPick) {
            bg = 'rgba(217,119,117,0.10)';
            border = '1px solid var(--danger, #d97775)';
          } else if (isSelected) {
            bg = 'rgba(79,124,224,0.08)';
            border = '1px solid var(--color-app-accent, var(--accent, #4f7ce0))';
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(i)}
              disabled={revealed}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background: bg,
                border,
                cursor: revealed ? 'default' : 'pointer',
                textAlign: 'left',
                fontSize: 14,
                width: '100%',
                fontFamily: 'inherit',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: 'var(--muted, #6b7280)',
                  width: 20,
                  flexShrink: 0,
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <MathText as="span">{choice}</MathText>
              {revealed && isCorrectChoice && (
                <span
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--success, #5ba876)',
                    fontWeight: 700,
                  }}
                >
                  ✓
                </span>
              )}
              {((revealed && isSelected && !isCorrectChoice) || isWrongPick) && (
                <span
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--danger, #d97775)',
                    fontWeight: 700,
                  }}
                >
                  ✗
                </span>
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
          style={{ ...S.primaryBtn, marginTop: 12 }}
        >
          {showHint ? 'Try Again' : 'Check Answer'}
        </button>
      )}

      {showHint && !revealed && (
        <div style={S.hint} role="status" aria-live="polite">
          <strong>Try again.</strong> <MathText as="span">{hintHtml}</MathText>
        </div>
      )}

      {revealed && content.explanation && (
        <div style={S.explanation}>
          <strong>Explanation:</strong> <MathText as="span">{content.explanation}</MathText>
        </div>
      )}
    </div>
  );
}

function QuestionLinkBlock({ block, isComplete, hrefFor }) {
  const questionId = block.content?.question_id;
  if (!questionId) return null;

  const href = typeof hrefFor === 'function' ? hrefFor(questionId) : null;

  return (
    <div style={S.card}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={S.kicker}>Practice Question</div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{questionId}</span>
        </div>
        {href ? (
          <a href={href} style={S.secondaryBtn}>
            {isComplete ? 'Review' : 'Practice'} →
          </a>
        ) : (
          <span style={S.inertPill}>Linked question (preview · inert)</span>
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
      <div style={S.card}>
        <p style={{ color: 'var(--danger, #d97775)' }}>
          Invalid desmos_interactive block: {contentError}
        </p>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div style={S.card}>
      {content.title && (
        <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>{content.title}</h3>
      )}
      <HtmlBlock className="prose" html={content.instructions_html} />
      <div style={S.calculatorCallout}>
        Complete this activity in the Desmos pane, then check your work here.
      </div>
      {content.caption_html && (
        <HtmlBlock className="prose muted" html={content.caption_html} />
      )}
      {!calculator && (
        <p style={{ color: 'var(--danger, #d97775)', fontSize: 13 }}>
          Desmos is still loading. If it does not appear, refresh and try again.
        </p>
      )}

      <button
        type="button"
        onClick={handleCheck}
        disabled={!calculator}
        style={{ ...S.primaryBtn, marginTop: 10 }}
      >
        Check Answer
      </button>

      {feedbackState === 'success' && (
        <div
          role="status"
          aria-live="polite"
          style={{ marginTop: 12, color: 'var(--success, #5ba876)' }}
        >
          <HtmlBlock
            html={feedbackHtml || content.feedback.success_message_html}
          />
        </div>
      )}
      {feedbackState === 'retry' && (
        <div
          role="status"
          aria-live="polite"
          style={{ marginTop: 12, color: 'var(--danger, #d97775)' }}
        >
          <HtmlBlock html={feedbackHtml || content.feedback.retry_message_html} />
        </div>
      )}
      {progressiveHintHtml && (
        <div
          aria-live="polite"
          style={{ marginTop: 8, color: 'var(--muted, #6b7280)', fontSize: 13 }}
        >
          <HtmlBlock html={progressiveHintHtml} />
        </div>
      )}
      {solutionHtml && (
        <div
          aria-live="polite"
          style={{
            marginTop: 8,
            borderTop: '1px solid var(--border, #ddd)',
            paddingTop: 8,
            color: 'var(--color-app-accent, var(--accent, #4f7ce0))',
          }}
        >
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

const S = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    fontFamily: 'inherit',
  },
  empty: { padding: 24, textAlign: 'center' },
  muted: { color: 'var(--muted, #6b7280)', fontSize: 13 },
  link: { color: 'var(--color-app-accent, var(--accent, #4f7ce0))' },

  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: 'var(--border, #eee)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  progressPct: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--muted, #6b7280)',
  },

  blockHost: { marginBottom: 4 },

  card: {
    padding: '20px 24px',
    background: 'var(--card, #ffffff)',
    border: '1px solid var(--border, rgba(17,24,39,0.08))',
    borderRadius: 12,
  },

  kicker: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-app-accent, var(--accent, #4f7ce0))',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  checkPrompt: { fontSize: 15, fontWeight: 600, margin: '0 0 12px' },
  explanation: {
    marginTop: 12,
    padding: '10px 14px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.04)',
    fontSize: 14,
  },
  hint: {
    marginTop: 12,
    padding: '10px 14px',
    borderRadius: 6,
    background: 'rgba(217,119,117,0.10)',
    border: '1px solid var(--danger, #d97775)',
    fontSize: 14,
  },
  calculatorCallout: {
    marginTop: 12,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--color-app-accent, #4f7ce0)',
    background: 'var(--color-app-accent-bg, rgba(79,124,224,0.08))',
    color: 'var(--fg2, #374151)',
    fontSize: 13,
  },

  primaryBtn: {
    background: 'var(--color-app-accent, var(--accent, #4f7ce0))',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'transparent',
    color: 'var(--color-app-accent, var(--accent, #4f7ce0))',
    border: '1px solid var(--color-app-accent, var(--accent, #4f7ce0))',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  inertPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: 'var(--color-slate-100, rgba(0,0,0,0.05))',
    color: 'var(--muted, #6b7280)',
    border: '1px solid var(--border, #ddd)',
  },

  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    background: 'transparent',
    border: '1px solid var(--border, #ddd)',
    color: 'inherit',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  navLabel: { color: 'var(--muted, #6b7280)', fontSize: 12 },

  completeWrap: { textAlign: 'center', marginTop: 8 },
  completeBtn: {
    background: 'var(--color-app-accent, var(--accent, #4f7ce0))',
    color: '#fff',
    border: 'none',
    padding: '10px 32px',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  completeBanner: {
    textAlign: 'center',
    padding: 24,
    borderRadius: 12,
    background: 'rgba(91,168,118,0.10)',
    border: '1px solid var(--success, #5ba876)',
  },
  completeText: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--success, #5ba876)',
  },

  debugCard: {
    padding: 10,
    border: '1px solid var(--border, #ddd)',
    borderRadius: 8,
    background: 'var(--card, #fff)',
  },
  debugSummary: { cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  debugGrid: {
    fontSize: 12,
    marginTop: 8,
    display: 'grid',
    gap: 4,
  },
};
