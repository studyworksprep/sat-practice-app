'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import HtmlBlock from '../../../components/HtmlBlock';
import { isLessonCompletionLocked, parseDesmosInteractiveContent, validateDesmosSubmission } from '../../../lib/lesson/desmos-interactive.mjs';

export default function LessonViewerPage() {
  return <Suspense><LessonViewer /></Suspense>;
}

function LessonViewer() {
  const { lessonId } = useParams();
  const searchParams = useSearchParams();
  const [lesson, setLesson] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [forceUnlockedBlockIds, setForceUnlockedBlockIds] = useState([]);
  const [debugByBlock, setDebugByBlock] = useState({});
  const [workflowDesmosContext, setWorkflowDesmosContext] = useState({});
  const [activeBranchState, setActiveBranchState] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/lessons/${lessonId}`).then(r => r.json()),
      fetch(`/api/lessons/${lessonId}/progress`).then(r => r.json()),
    ])
      .then(([lessonData, progressData]) => {
        if (lessonData.error) throw new Error(lessonData.error);
        setLesson(lessonData.lesson);
        setProgress(progressData.progress);
        setForceUnlockedBlockIds([]);
        // Start progress if first visit
        if (!progressData.progress) {
          fetch(`/api/lessons/${lessonId}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [lessonId]);

  // Mark a block as read
  async function markBlockComplete(blockId) {
    const res = await fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_id: blockId }),
    });
    const data = await res.json();
    if (data.progress) setProgress(data.progress);
  }

  // Submit a knowledge check answer
  async function submitCheck(blockId, selectedIndex, isCorrect) {
    const res = await fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        block_id: blockId,
        check_answer: { selected: selectedIndex, correct: isCorrect },
      }),
    });
    const data = await res.json();
    if (data.progress) setProgress(data.progress);
  }

  async function submitDesmosResult(blockId, isCorrect) {
    const res = await fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        block_id: blockId,
        check_answer: { selected: null, correct: isCorrect, type: 'desmos_interactive' },
      }),
    });
    const data = await res.json();
    if (data.progress) setProgress(data.progress);
  }

  // Mark lesson as complete
  async function markComplete() {
    const res = await fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_complete: true }),
    });
    const data = await res.json();
    if (data.progress) setProgress(data.progress);
  }

  const blocks = useMemo(() => lesson?.blocks || [], [lesson?.blocks]);
  const debugMode = process.env.NODE_ENV !== 'production' && searchParams?.get('debug') === '1';
  const completedBlocks = new Set(progress?.completed_blocks || []);
  const checkAnswers = progress?.check_answers || {};
  const isComplete = !!progress?.completed_at;

  const progressPct = blocks.length > 0
    ? Math.round((completedBlocks.size / blocks.length) * 100)
    : 0;

  const currentBlock = blocks[currentIndex] || null;
  const blockIndexById = useMemo(() => {
    const map = new Map();
    blocks.forEach((block, index) => {
      if (block?.id != null) map.set(String(block.id), index);
    });
    return map;
  }, [blocks]);

  if (loading) return <div className="container" style={{ paddingTop: 48 }}><p className="muted">Loading…</p></div>;
  if (error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!lesson) return <div className="container" style={{ paddingTop: 48 }}><p className="muted">Lesson not found.</p></div>;
  const currentIsLocked = Boolean(
    currentBlock
      && currentBlock.block_type === 'desmos_interactive'
      && currentBlock.content?.progression?.require_success
      && !completedBlocks.has(currentBlock.id)
      && !forceUnlockedBlockIds.includes(currentBlock.id)
  );

  function indexForBlockId(blockId) {
    if (!blockId) return null;
    const idx = blockIndexById.get(String(blockId));
    return Number.isInteger(idx) ? idx : null;
  }

  function goNext() {
    setCurrentIndex((prev) => {
      const current = blocks[prev];
      if (!current) return prev;

      const nextLinear = Math.min(prev + 1, Math.max(blocks.length - 1, 0));

      if (activeBranchState?.sourceBlockId) {
        const isChosenBranchBlock = current.id === activeBranchState.chosenBlockId;
        if (isChosenBranchBlock && activeBranchState.rejoinBlockId && activeBranchState.rejoinBlockId !== current.id) {
          const rejoinIdx = indexForBlockId(activeBranchState.rejoinBlockId);
          if (rejoinIdx != null) return rejoinIdx;
        }

        if (current.id === activeBranchState.rejoinBlockId) {
          setActiveBranchState(null);
        }
      }

      return nextLinear;
    });
  }

  function goToBlockId(blockId, fallbackIndex = currentIndex + 1) {
    const idx = indexForBlockId(blockId);
    if (idx != null) {
      setCurrentIndex(idx);
      return true;
    }
    setCurrentIndex(Math.min(fallbackIndex, Math.max(blocks.length - 1, 0)));
    return false;
  }

  function routeFromAnswer(block, isCorrect) {
    const content = block?.content || {};
    const targetId = isCorrect ? content.on_correct_block_id : content.on_incorrect_block_id;
    const resolved = goToBlockId(targetId, currentIndex + 1);
    if (resolved && targetId) {
      setActiveBranchState({
        sourceBlockId: block.id,
        chosenBlockId: String(targetId),
        rejoinBlockId: content.rejoin_at_block_id ? String(content.rejoin_at_block_id) : null,
      });
      return;
    }
    setActiveBranchState(null);
  }

  function captureWorkflowDesmosState(block, payload) {
    const workflowId = block?.content?.workflow_id;
    if (!workflowId || !payload?.state) return;
    setWorkflowDesmosContext((prev) => ({
      ...prev,
      [workflowId]: payload,
    }));
  }

  function goPrev() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  return (
    <div className="container" style={{ paddingTop: 24, maxWidth: 800, paddingBottom: 80 }}>
      {/* Header */}
      <Link href="/learn" style={{ fontSize: 13, color: 'var(--accent)' }}>&larr; Back to Learn</Link>

      <div style={{ marginTop: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>{lesson.title}</h1>
        {lesson.description && (
          <p className="muted" style={{ fontSize: 14, margin: '0 0 8px' }}>{lesson.description}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 13 }}>by {lesson.author_name}</span>
          {lesson.topics?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {lesson.topics.map((t, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '1px 6px', borderRadius: 3,
                  background: 'var(--bg-alt, #f0f4ff)', color: 'var(--accent)',
                }}>
                  {t.skill_code || t.domain_name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border, #eee)', overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 3, background: isComplete ? 'var(--success)' : 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: isComplete ? 'var(--success)' : 'var(--muted)' }}>
            {isComplete ? 'Complete' : `${progressPct}%`}
          </span>
        </div>
      </div>

      {/* Block slideshow */}
      {currentBlock && (
        <div key={currentBlock.id} style={{ marginBottom: 16 }}>
          {currentBlock.block_type === 'text' && (
            <TextBlock block={currentBlock} isRead={completedBlocks.has(currentBlock.id)} onRead={() => markBlockComplete(currentBlock.id)} />
          )}
          {currentBlock.block_type === 'video' && (
            <VideoBlock block={currentBlock} isWatched={completedBlocks.has(currentBlock.id)} onWatched={() => markBlockComplete(currentBlock.id)} />
          )}
          {currentBlock.block_type === 'check' && (
            <CheckBlock
              block={currentBlock}
              previousAnswer={checkAnswers[currentBlock.id]}
              onSubmit={(selected, correct) => {
                submitCheck(currentBlock.id, selected, correct);
                routeFromAnswer(currentBlock, correct);
              }}
            />
          )}
          {currentBlock.block_type === 'question_link' && (
            <QuestionLinkBlock block={currentBlock} isComplete={completedBlocks.has(currentBlock.id)} />
          )}
          {currentBlock.block_type === 'desmos_interactive' && (
            <DesmosInteractiveBlock
              block={currentBlock}
              previousAnswer={checkAnswers[currentBlock.id]}
              onSuccess={() => {
                submitDesmosResult(currentBlock.id, true);
                routeFromAnswer(currentBlock, true);
              }}
              onUnlock={() => {
                setForceUnlockedBlockIds((prev) => (
                  prev.includes(currentBlock.id) ? prev : [...prev, currentBlock.id]
                ));
              }}
              inheritedWorkflowContext={workflowDesmosContext[currentBlock.content?.workflow_id]}
              onCaptureWorkflowContext={(payload) => captureWorkflowDesmosState(currentBlock, payload)}
              debugMode={debugMode}
              onDebug={(payload) => {
                setDebugByBlock((prev) => ({ ...prev, [currentBlock.id]: payload }));
              }}
            />
          )}
        </div>
      )}

      {debugMode && currentBlock && (
        <details className="card" style={{ padding: 10, marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Debug info</summary>
          <div style={{ fontSize: 12, marginTop: 8, display: 'grid', gap: 4 }}>
            <div>block_id: <code>{currentBlock.id}</code></div>
            <div>block_type: <code>{currentBlock.block_type}</code></div>
            <div>workflow: <code>{currentBlock.content?.workflow_id || '—'}</code> step <code>{currentBlock.content?.step_index || '—'}</code>/<code>{currentBlock.content?.total_steps || '—'}</code></div>
            <div>validation_mode: <code>{currentBlock.content?.validation?.mode || '—'}</code></div>
            <div>attempts: <code>{debugByBlock[currentBlock.id]?.attempts ?? 0}</code></div>
            <div>result: <code>{debugByBlock[currentBlock.id]?.success ? 'pass' : 'fail'}</code></div>
            <div>reason_codes: <code>{(debugByBlock[currentBlock.id]?.reasons || []).join(', ') || '—'}</code></div>
            <div>next_block: <code>{debugByBlock[currentBlock.id]?.nextBlockId || blocks[currentIndex + 1]?.id || '—'}</code></div>
            <div>rejoin_target: <code>{currentBlock.content?.rejoin_at_block_id || '—'}</code></div>
            <div>desmos_inherited: <code>{String(Boolean(currentBlock.content?.inherit_from_previous_workflow_desmos))}</code></div>
            <div>desmos_inherited_context_available: <code>{String(Boolean(workflowDesmosContext[currentBlock.content?.workflow_id]?.state))}</code></div>
            <div>expression_count: <code>{debugByBlock[currentBlock.id]?.expressionCount ?? 0}</code></div>
            <div>detected_sliders: <code>{(debugByBlock[currentBlock.id]?.sliders || []).join(', ') || '—'}</code></div>
          </div>
        </details>
      )}

      {blocks.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button className="btn secondary" onClick={goPrev} disabled={currentIndex === 0}>
            Previous
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Block {Math.min(currentIndex + 1, blocks.length)} of {blocks.length}
          </span>
          <button className="btn secondary" onClick={goNext} disabled={currentIndex >= blocks.length - 1 || currentIsLocked}>
            Continue
          </button>
        </div>
      )}

      {/* Complete button */}
      {blocks.length > 0 && !isComplete && currentIndex >= blocks.length - 1 && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button
            className="btn primary"
            onClick={markComplete}
            disabled={isLessonCompletionLocked(blocks, [...completedBlocks])}
            style={{ fontSize: 15, padding: '10px 32px' }}
          >
            Mark Lesson Complete
          </button>
        </div>
      )}

      {isComplete && (
        <div className="card" style={{ textAlign: 'center', padding: 24, marginTop: 24, background: 'var(--bg-alt, #f0faf0)' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>Lesson Complete!</span>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
            <Link href="/learn" style={{ color: 'var(--accent)' }}>Browse more lessons</Link>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Text block renderer ─────────────────────────────────
function TextBlock({ block, isRead, onRead }) {
  useEffect(() => {
    if (!isRead) {
      // Mark as read after a short delay (user has seen it)
      const timer = setTimeout(() => onRead(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isRead, onRead]);

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <HtmlBlock className="prose" html={block.content.html || ''} />
    </div>
  );
}

// ─── Video block renderer ────────────────────────────────
function VideoBlock({ block, isWatched, onWatched }) {
  const embedUrl = getEmbedUrl(block.content.url);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {embedUrl ? (
        <div
          style={{ position: 'relative', paddingBottom: '56.25%', height: 0, background: '#000' }}
          onClick={() => { if (!isWatched) onWatched(); }}
        >
          <iframe
            src={embedUrl}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div style={{ padding: 20 }}>
          <a href={block.content.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            {block.content.url || 'No video URL set'}
          </a>
        </div>
      )}
      {block.content.caption && (
        <p className="muted" style={{ fontSize: 13, padding: '8px 16px', margin: 0 }}>{block.content.caption}</p>
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

// ─── Knowledge check renderer ────────────────────────────
function CheckBlock({ block, previousAnswer, onSubmit }) {
  const [selected, setSelected] = useState(previousAnswer?.selected ?? null);
  const [submitted, setSubmitted] = useState(!!previousAnswer);
  const [showExplanation, setShowExplanation] = useState(!!previousAnswer);

  const content = block.content;
  const choices = content.choices || [];
  const correctIdx = content.correct_index ?? 0;

  function handleSubmit() {
    if (selected === null) return;
    const isCorrect = selected === correctIdx;
    setSubmitted(true);
    setShowExplanation(true);
    onSubmit(selected, isCorrect);
  }

  return (
    <div className="card" style={{ padding: '20px 24px', border: submitted ? `2px solid ${selected === correctIdx ? 'var(--success)' : 'var(--danger)'}` : undefined }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>Knowledge Check</div>
      <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>{content.prompt}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {choices.map((choice, i) => {
          const isCorrectChoice = i === correctIdx;
          const isSelected = i === selected;
          let bg = 'transparent';
          let border = '1px solid var(--border, #ddd)';
          if (submitted) {
            if (isCorrectChoice) { bg = 'rgba(76,175,80,0.1)'; border = '1px solid var(--success)'; }
            else if (isSelected && !isCorrectChoice) { bg = 'rgba(224,82,82,0.1)'; border = '1px solid var(--danger)'; }
          } else if (isSelected) {
            bg = 'var(--bg-alt, #f0f4ff)';
            border = '1px solid var(--accent)';
          }

          return (
            <button
              key={i}
              onClick={() => { if (!submitted) setSelected(i); }}
              disabled={submitted}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, background: bg, border,
                cursor: submitted ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, width: '100%',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--muted)', width: 20, flexShrink: 0 }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span>{choice}</span>
              {submitted && isCorrectChoice && <span style={{ marginLeft: 'auto', color: 'var(--success)', fontWeight: 700 }}>&#10003;</span>}
              {submitted && isSelected && !isCorrectChoice && <span style={{ marginLeft: 'auto', color: 'var(--danger)', fontWeight: 700 }}>&#10007;</span>}
            </button>
          );
        })}
      </div>

      {!submitted && (
        <button className="btn primary" onClick={handleSubmit} disabled={selected === null} style={{ marginTop: 12, fontSize: 13 }}>
          Check Answer
        </button>
      )}

      {showExplanation && content.explanation && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, background: 'var(--bg-alt, #f8f9fb)', fontSize: 14 }}>
          <strong>Explanation:</strong> {content.explanation}
        </div>
      )}
    </div>
  );
}

// ─── Question link renderer ──────────────────────────────
function QuestionLinkBlock({ block, isComplete }) {
  const questionId = block.content.question_id;
  if (!questionId) return null;

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>Practice Question</div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{questionId}</span>
        </div>
        <Link href={`/practice/${questionId}`} className="btn secondary" style={{ fontSize: 13 }}>
          {isComplete ? 'Review' : 'Practice'} &rarr;
        </Link>
      </div>
    </div>
  );
}

function DesmosInteractiveBlock({
  block,
  previousAnswer,
  onSuccess,
  onUnlock,
  onDebug,
  onCaptureWorkflowContext,
  inheritedWorkflowContext,
  debugMode = false,
}) {
  const hostRef = useRef(null);
  const calculatorRef = useRef(null);
  const [feedbackState, setFeedbackState] = useState(previousAnswer?.correct ? 'success' : 'idle');
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

      const shouldInherit = Boolean(content.inherit_from_previous_workflow_desmos);
      if (shouldInherit && inheritedWorkflowContext?.state?.expressions?.list?.length) {
        calculator.setState(inheritedWorkflowContext.state);
      } else {
        for (const expr of content.initial_expressions || []) {
          if (expr?.latex) calculator.setExpression({ id: expr.id, latex: expr.latex });
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
        sliderBounds: expr?.sliderBounds || byId.get(expr?.id)?.sliderBounds || null,
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
      const helper = calculator.HelperExpression({ latex: expression, variables: { x } });
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
        const match = String(row.latex || '').trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*=/);
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
      setFeedbackHtml(result.feedbackHtml || content.feedback.success_message_html);
      setProgressiveHintHtml(result.progressiveHintHtml || '');
      setSolutionHtml(result.solutionHtml || '');
      onSuccess();
    } else {
      setFeedbackState('retry');
      setFeedbackHtml(result.feedbackHtml || content.feedback.retry_message_html);
      setProgressiveHintHtml(result.progressiveHintHtml || '');
      setSolutionHtml(result.solutionHtml || '');
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
      <div className="card" style={{ padding: '20px 24px' }}>
        <p style={{ color: 'var(--danger)' }}>Invalid desmos_interactive block: {contentError}</p>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      {content.title && <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>{content.title}</h3>}
      <HtmlBlock className="prose" html={content.instructions_html} />
      <div
        ref={hostRef}
        className="desmosHost"
        style={{ minHeight: 320, marginTop: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border, #ddd)' }}
      />
      {content.caption_html && (
        <HtmlBlock className="prose muted" html={content.caption_html} />
      )}
      {desmosMountError && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>Desmos failed to load. Refresh and try again.</p>
      )}

      <button className="btn primary" onClick={handleCheck} style={{ marginTop: 10, fontSize: 13 }}>
        Check Answer
      </button>

      {feedbackState === 'success' && (
        <div role="status" aria-live="polite" style={{ marginTop: 12, color: 'var(--success)' }}>
          <HtmlBlock html={feedbackHtml || content.feedback.success_message_html} />
        </div>
      )}
      {feedbackState === 'retry' && (
        <div role="status" aria-live="polite" style={{ marginTop: 12, color: 'var(--danger)' }}>
          <HtmlBlock html={feedbackHtml || content.feedback.retry_message_html} />
        </div>
      )}
      {progressiveHintHtml && (
        <div aria-live="polite" style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
          <HtmlBlock html={progressiveHintHtml} />
        </div>
      )}
      {solutionHtml && (
        <div aria-live="polite" style={{ marginTop: 8, borderTop: '1px solid var(--border, #ddd)', paddingTop: 8, color: 'var(--accent)' }}>
          <HtmlBlock html={solutionHtml} />
        </div>
      )}
    </div>
  );
}
