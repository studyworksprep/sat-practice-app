// Reusable lesson slideshow runtime.
//
// Extracted from app/learn/[lessonId]/page.js so admin preview
// (and, eventually, the (next)-tree student viewer) can render
// the same block-by-block playthrough — branching knowledge
// checks, Desmos interactives, completion gating — without each
// caller re-implementing the runtime.
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

import { useEffect, useMemo, useRef, useState } from 'react';
import HtmlBlock from '@/components/HtmlBlock';
import {
  isLessonCompletionLocked,
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

  const blockIndexById = useMemo(() => buildBlockIndexMap(blocks), [blocks]);
  const currentBlock = blocks[currentIndex] || null;

  const progressPct =
    blocks.length > 0
      ? Math.round((completedBlockIds.size / blocks.length) * 100)
      : 0;

  const currentIsLocked = Boolean(
    currentBlock &&
      currentBlock.block_type === 'desmos_interactive' &&
      currentBlock.content?.progression?.require_success &&
      !completedBlockIds.has(currentBlock.id) &&
      !forceUnlockedBlockIds.includes(currentBlock.id),
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

  function recordCheckAnswer(blockId, payload) {
    setCheckAnswers((prev) => ({ ...prev, [blockId]: payload }));
    setCompletedBlockIds((prev) => {
      const next = new Set(prev);
      next.add(blockId);
      return next;
    });
  }

  function routeFromAnswer(block, isCorrect) {
    const result = resolveAnswerNavigation({
      block,
      isCorrect,
      currentIndex,
      totalBlocks: blocks.length,
      blockIndexById,
    });
    setCurrentIndex(result.nextIndex);
    setActiveBranchState(result.activeBranchState);
  }

  function goNext() {
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
    <div style={S.container}>
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
                recordCheckAnswer(currentBlock.id, {
                  selected,
                  correct,
                });
                onSubmitCheck?.(currentBlock.id, selected, correct);
                routeFromAnswer(currentBlock, correct);
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
              previousAnswer={checkAnswers[currentBlock.id]}
              onResult={(isCorrect) => {
                recordCheckAnswer(currentBlock.id, {
                  selected: null,
                  correct: isCorrect,
                  type: 'desmos_interactive',
                });
                onSubmitDesmos?.(currentBlock.id, isCorrect);
                routeFromAnswer(currentBlock, isCorrect);
              }}
              onUnlock={() => {
                setForceUnlockedBlockIds((prev) =>
                  prev.includes(currentBlock.id)
                    ? prev
                    : [...prev, currentBlock.id],
                );
              }}
              inheritedWorkflowContext={
                workflowDesmosContext[currentBlock.content?.workflow_id]
              }
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
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex >= blocks.length - 1 || currentIsLocked}
          style={S.navBtn}
        >
          Continue
        </button>
      </div>

      {showCompleteButton &&
        !isComplete &&
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

function CheckBlock({ block, previousAnswer, onSubmit }) {
  const [selected, setSelected] = useState(previousAnswer?.selected ?? null);
  const [submitted, setSubmitted] = useState(!!previousAnswer);
  const [showExplanation, setShowExplanation] = useState(!!previousAnswer);

  const content = block.content || {};
  const choices = content.choices || [];
  const correctIdx = content.correct_index ?? 0;

  function handleSubmit() {
    if (selected === null) return;
    const isCorrect = selected === correctIdx;
    setSubmitted(true);
    setShowExplanation(true);
    onSubmit(selected, isCorrect);
  }

  const borderColor = submitted
    ? selected === correctIdx
      ? 'var(--success, #5ba876)'
      : 'var(--danger, #d97775)'
    : 'var(--border, rgba(17,24,39,0.08))';

  return (
    <div style={{ ...S.card, border: `2px solid ${borderColor}` }}>
      <div style={S.kicker}>Knowledge Check</div>
      <p style={S.checkPrompt}>{content.prompt}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {choices.map((choice, i) => {
          const isCorrectChoice = i === correctIdx;
          const isSelected = i === selected;
          let bg = 'transparent';
          let border = '1px solid var(--border, #ddd)';
          if (submitted) {
            if (isCorrectChoice) {
              bg = 'rgba(91,168,118,0.10)';
              border = '1px solid var(--success, #5ba876)';
            } else if (isSelected) {
              bg = 'rgba(217,119,117,0.10)';
              border = '1px solid var(--danger, #d97775)';
            }
          } else if (isSelected) {
            bg = 'rgba(79,124,224,0.08)';
            border = '1px solid var(--color-app-accent, var(--accent, #4f7ce0))';
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (!submitted) setSelected(i);
              }}
              disabled={submitted}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background: bg,
                border,
                cursor: submitted ? 'default' : 'pointer',
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
              <span>{choice}</span>
              {submitted && isCorrectChoice && (
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
              {submitted && isSelected && !isCorrectChoice && (
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

      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected === null}
          style={{ ...S.primaryBtn, marginTop: 12 }}
        >
          Check Answer
        </button>
      )}

      {showExplanation && content.explanation && (
        <div style={S.explanation}>
          <strong>Explanation:</strong> {content.explanation}
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
  previousAnswer,
  onResult,
  onUnlock,
  onDebug,
  onCaptureWorkflowContext,
  inheritedWorkflowContext,
  debugMode = false,
}) {
  const hostRef = useRef(null);
  const calculatorRef = useRef(null);
  const [feedbackState, setFeedbackState] = useState(
    previousAnswer?.correct ? 'success' : 'idle',
  );
  const [feedbackHtml, setFeedbackHtml] = useState('');
  const [progressiveHintHtml, setProgressiveHintHtml] = useState('');
  const [solutionHtml, setSolutionHtml] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [desmosMountError, setDesmosMountError] = useState(false);

  let content = null;
  let contentError = null;
  try {
    content = parseDesmosInteractiveContent(block.content || {});
  } catch (err) {
    content = null;
    contentError = err.message;
  }

  useEffect(() => {
    if (!content || !hostRef.current) return undefined;
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    let intervalId = null;
    let timeoutId = null;

    const tryMount = () => {
      if (cancelled || calculatorRef.current) return;
      if (!window.Desmos?.GraphingCalculator) return;

      const calculator = window.Desmos.GraphingCalculator(hostRef.current, {
        expressions: content.calculator_options?.expressions ?? true,
        lockViewport: content.calculator_options?.lockViewport ?? false,
        sliders: content.calculator_options?.sliders ?? true,
      });
      calculatorRef.current = calculator;
      setDesmosMountError(false);

      const shouldInherit = Boolean(
        content.inherit_from_previous_workflow_desmos,
      );
      if (
        shouldInherit &&
        inheritedWorkflowContext?.state?.expressions?.list?.length
      ) {
        calculator.setState(inheritedWorkflowContext.state);
      } else {
        for (const expr of content.initial_expressions || []) {
          if (expr?.latex) {
            calculator.setExpression({ id: expr.id, latex: expr.latex });
          }
        }
      }

      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };

    tryMount();
    if (!calculatorRef.current) {
      intervalId = setInterval(tryMount, 200);
      timeoutId = setTimeout(() => {
        if (!calculatorRef.current) setDesmosMountError(true);
        if (intervalId) clearInterval(intervalId);
      }, 5000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
    };
  }, [content, inheritedWorkflowContext]);

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
    const calculator = calculatorRef.current;
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
    if (!content || !calculatorRef.current) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    const entered = extractStudentExpressions(calculatorRef.current);
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
      state: calculatorRef.current?.getState?.() || null,
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
      <div
        ref={hostRef}
        style={{
          minHeight: 320,
          marginTop: 12,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--border, #ddd)',
        }}
      />
      {content.caption_html && (
        <HtmlBlock className="prose muted" html={content.caption_html} />
      )}
      {desmosMountError && (
        <p style={{ color: 'var(--danger, #d97775)', fontSize: 13 }}>
          Desmos failed to load. Refresh and try again.
        </p>
      )}

      <button
        type="button"
        onClick={handleCheck}
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
