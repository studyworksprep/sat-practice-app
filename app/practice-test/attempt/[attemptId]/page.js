'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { useRouter, useParams } from 'next/navigation';
import HtmlBlock from '../../../../components/HtmlBlock';
import QuestionNotes from '../../../../components/QuestionNotes';

const SUBJECT_LABEL = { rw: 'Reading & Writing', RW: 'Reading & Writing', math: 'Math', Math: 'Math', MATH: 'Math', m: 'Math', M: 'Math' };

const htmlHasContent = (html) => {
  if (!html) return false;
  if (/<img\s/i.test(html)) return true;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
};

const MIN_CALC_W = 550;
const MAX_CALC_W = 1200;

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconCalculator({ className = '' }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="16" x2="16" y1="14" y2="18" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 10h.01" />
      <path d="M12 14h.01" />
      <path d="M8 14h.01" />
      <path d="M12 18h.01" />
      <path d="M8 18h.01" />
    </svg>
  );
}

function IconReference({ className = '' }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function IconBookmark({ filled = false }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

// ─── Desmos panel ─────────────────────────────────────────────────────────────

function DesmosPanel({ isOpen, storageKey }) {
  const hostRef = useRef(null);
  const calcRef = useRef(null);
  const savedStateRef = useRef(null);
  const prevOpenRef = useRef(isOpen);

  const roRef = useRef(null);
  const rafRef = useRef(null);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Desmos) setReady(true);
  }, []);

  const safeResize = () => {
    if (!calcRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      try { calcRef.current.resize(); } catch {}
    });
  };

  const saveState = () => {
    if (!calcRef.current) return;
    try {
      const st = calcRef.current.getState();
      savedStateRef.current = st;
      if (storageKey && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storageKey, JSON.stringify(st));
      }
    } catch {}
  };

  const restoreState = () => {
    if (!calcRef.current) return;
    let st = savedStateRef.current;
    try {
      if (!st && storageKey && typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) st = JSON.parse(raw);
      }
    } catch {}
    if (st) {
      try { calcRef.current.setState(st, { allowUndo: false }); } catch {}
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!window.Desmos) return;

    if (!calcRef.current) {
      calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
        autosize: true,
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
        forceEnableGeometryFunctions: true,
        degreeMode: true,
        clearIntoDegreeMode: true,
        images: false,
        folders: false,
        notes: false,
        links: false,
        restrictedFunctions: true,
      });
      restoreState();
      safeResize();
    }

    return () => {
      saveState();
      try { calcRef.current?.destroy?.(); } catch {}
      calcRef.current = null;
      try { roRef.current?.disconnect?.(); } catch {}
      roRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!calcRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;

    try { roRef.current?.disconnect?.(); } catch {}
    roRef.current = new ResizeObserver(() => safeResize());
    roRef.current.observe(hostRef.current);

    return () => {
      try { roRef.current?.disconnect?.(); } catch {}
      roRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const prev = prevOpenRef.current;
    if (prev && !isOpen) saveState();
    if (!prev && isOpen) { restoreState(); safeResize(); }
    prevOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const apiKey =
    (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_DESMOS_API_KEY) ||
    'bac289385bcd4778a682276b95f5f116';

  return (
    <>
      <Script
        src={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${apiKey}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={hostRef} className="desmosHost" />
    </>
  );
}

// ─── Timer display ────────────────────────────────────────────────────────────

function fmtTime(secs) {
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TimerChip({ seconds }) {
  const urgent = seconds !== null && seconds <= 300;
  return (
    <div className={`ptTimer${urgent ? ' ptTimerUrgent' : ''}`}>
      {seconds === null ? '—' : fmtTime(seconds)}
    </div>
  );
}

// ─── Question map ─────────────────────────────────────────────────────────────

function QuestionMap({ questions, answers, currentIdx, onJump, marked }) {
  return (
    <div className="ptQMap">
      {questions.map((q, i) => {
        const answered = !!answers[q.question_version_id];
        const active = i === currentIdx;
        const isMarked = !!marked?.[q.question_version_id];
        return (
          <button
            key={q.question_version_id}
            className={`ptQChip${active ? ' active' : answered ? ' answered' : ''}${isMarked ? ' marked' : ''}`}
            onClick={() => onJump(i)}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

// ─── MCQ options ──────────────────────────────────────────────────────────────

function McqOptions({ options, selected, onChange, disabled, crossedOut = {}, onCrossOut }) {
  return (
    <div className="optionList">
      {options.map((opt) => {
        const letter = opt.label || String.fromCharCode(65 + (opt.ordinal - 1));
        const isCrossed = !!crossedOut[opt.id];
        return (
          <div
            key={opt.id}
            className={`option${selected === opt.id ? ' selected' : ''}${disabled ? ' disabled' : ''}${isCrossed ? ' crossed' : ''}`}
            onClick={() => !disabled && onChange(opt.id)}
            role="radio"
            aria-checked={selected === opt.id}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) onChange(opt.id); }}
          >
            <span className="optionBadge">{letter}</span>
            <HtmlBlock html={opt.content_html} className="optionContent" />
            {!disabled && onCrossOut && (
              <button
                type="button"
                className={`crossOutBtn${isCrossed ? ' active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onCrossOut(opt.id); }}
                aria-label={isCrossed ? `Undo cross out for option ${letter}` : `Cross out option ${letter}`}
                title={isCrossed ? 'Undo cross-out' : 'Cross out this option'}
              >
                {letter}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TestSessionPage() {
  const { attemptId } = useParams();
  const router = useRouter();

  // Core test state
  const [moduleData, setModuleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const timerRef = useRef(null);

  // Question map drawer + mark-for-review (session-only, not persisted to DB)
  const [showMap, setShowMap] = useState(false);
  const [marked, setMarked] = useState({});
  const toggleMark = (vid) => setMarked((m) => ({ ...m, [vid]: !m[vid] }));

  // Per-question cumulative time tracking (milliseconds)
  // questionTimesRef: { [question_version_id]: accumulated_ms }
  const questionTimesRef = useRef({});
  // Track when we started viewing the current question
  const questionStartRef = useRef(null);
  // Track which question_version_id is currently being viewed
  const activeQvIdRef = useRef(null);

  // Cross-out answer choices (session-only, not persisted to DB)
  const [crossedOut, setCrossedOut] = useState({});
  const toggleCrossOut = (optId) => setCrossedOut((c) => ({ ...c, [optId]: !c[optId] }));

  // Draggable passage/answers split (reading two-column layout)
  const [qaLeftPct, setQaLeftPct] = useState(50);
  const qaSplitRef = useRef(null);
  const qaLeftPctRef = useRef(50);

  // Math tools state
  const [calcMinimized, setCalcMinimized] = useState(false);
  const [calcWidth, setCalcWidth] = useState(MIN_CALC_W);
  const [showRef, setShowRef] = useState(false);
  const [refPos, setRefPos] = useState({ x: 0, y: 0 });

  // Refs for math shell drag
  const shellRef = useRef(null);
  const liveWidthRef = useRef(MIN_CALC_W);
  const dragRef = useRef({ dragging: false, startX: 0, startW: MIN_CALC_W, pendingW: MIN_CALC_W });

  // Refs for reference sheet drag
  const refCardRef = useRef(null);
  const refDrag = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const refPosRef = useRef({ x: 0, y: 0 });
  const refDragRafRef = useRef(null);

  // Keep refs in sync
  useEffect(() => { liveWidthRef.current = calcWidth; }, [calcWidth]);
  useEffect(() => { refPosRef.current = refPos; }, [refPos]);

  // Apply persisted ref-card transform when it opens
  useEffect(() => {
    if (!showRef) return;
    const card = refCardRef.current;
    if (!card) return;
    const { x, y } = refPosRef.current;
    card.style.transform = `translate(calc(-50% + ${x}px), ${y}px)`;
  }, [showRef]);

  // Reset calculator width when question changes
  useEffect(() => {
    setCalcWidth(MIN_CALC_W);
    liveWidthRef.current = MIN_CALC_W;
    dragRef.current.pendingW = MIN_CALC_W;
    shellRef.current?.style.setProperty('--calcW', `${MIN_CALC_W}px`);
  }, [currentIdx]);

  // ─── Per-question timing helpers ───────────────────────────────────────────

  // Flush elapsed time for the currently-viewed question into the cumulative map
  const flushQuestionTime = useCallback(() => {
    if (activeQvIdRef.current && questionStartRef.current) {
      const elapsed = Date.now() - questionStartRef.current;
      const prev = questionTimesRef.current[activeQvIdRef.current] || 0;
      questionTimesRef.current[activeQvIdRef.current] = prev + elapsed;
    }
    questionStartRef.current = null;
  }, []);

  // Persist per-question times to localStorage (for pause & resume)
  const saveQuestionTimes = useCallback(() => {
    if (!moduleData) return;
    const key = `pt_qtimes_${attemptId}_${moduleData.subject_code}_${moduleData.module_number}`;
    try { localStorage.setItem(key, JSON.stringify(questionTimesRef.current)); } catch {}
  }, [attemptId, moduleData]);

  // When the current question index changes, flush the previous question's time
  // and start the timer for the new question
  useEffect(() => {
    const q = moduleData?.questions?.[currentIdx];
    if (!q) return;

    // Flush time for the previous question
    flushQuestionTime();
    saveQuestionTimes();

    // Start timing the new question
    activeQvIdRef.current = q.question_version_id;
    questionStartRef.current = Date.now();
  }, [currentIdx, moduleData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush timing on page unload / visibility change so pausing preserves data
  useEffect(() => {
    const handleUnload = () => {
      flushQuestionTime();
      saveQuestionTimes();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushQuestionTime();
        saveQuestionTimes();
      } else if (document.visibilityState === 'visible' && activeQvIdRef.current) {
        // Resume timing when user returns
        questionStartRef.current = Date.now();
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushQuestionTime, saveQuestionTimes]);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadModule = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTimeRemaining(null); // reset so timer effect re-fires when new value arrives
    try {
      const res = await fetch(`/api/practice-tests/attempt/${attemptId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load'); setLoading(false); return; }
      if (data.status === 'completed') { router.replace(`/practice-test/attempt/${attemptId}/results`); return; }

      setModuleData(data);
      setCurrentIdx(0);

      // Restore any saved answers from a previous session (Pause & Exit)
      const ansKey = `pt_answers_${attemptId}_${data.subject_code}_${data.module_number}`;
      let restored = {};
      try {
        const raw = localStorage.getItem(ansKey);
        if (raw) restored = JSON.parse(raw);
      } catch {}
      setAnswers(restored);

      // Restore per-question cumulative times from localStorage
      const qtKey = `pt_qtimes_${attemptId}_${data.subject_code}_${data.module_number}`;
      try {
        const rawQt = localStorage.getItem(qtKey);
        questionTimesRef.current = rawQt ? JSON.parse(rawQt) : {};
      } catch { questionTimesRef.current = {}; }
      // Start timing the first question
      activeQvIdRef.current = data.questions?.[0]?.question_version_id || null;
      questionStartRef.current = Date.now();

      // Timer — use API value or fall back to SAT defaults (32 min RW, 35 min math)
      const isMathSubject = ['M', 'm', 'math', 'Math', 'MATH'].includes(data.subject_code);
      const timeFactor = parseFloat(localStorage.getItem(`pt_factor_${attemptId}`) || '1');
      const timeLimitSecs = Math.round(
        (data.time_limit_seconds || (isMathSubject ? 35 * 60 : 32 * 60)) * timeFactor
      );
      // Store accumulated elapsed seconds so time doesn't tick while the user is away
      const elapsedKey = `pt_elapsed_${attemptId}_${data.subject_code}_${data.module_number}`;
      const savedElapsed = parseInt(localStorage.getItem(elapsedKey) || '0', 10);
      setTimeRemaining(Math.max(0, timeLimitSecs - savedElapsed));

      setLoading(false);
    } catch {
      setError('Network error — please refresh.');
      setLoading(false);
    }
  }, [attemptId, router]);

  useEffect(() => { loadModule(); }, [loadModule]);

  useEffect(() => {
    if (timeRemaining === null || submitting || !moduleData) return;
    clearInterval(timerRef.current);
    if (timeRemaining <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((t) => {
        const next = t <= 1 ? 0 : t - 1;
        // Persist elapsed seconds so pausing / leaving preserves the timer
        if (moduleData) {
          const isMathSubject = ['M', 'm', 'math', 'Math', 'MATH'].includes(moduleData.subject_code);
          const timeFactor = parseFloat(localStorage.getItem(`pt_factor_${attemptId}`) || '1');
          const timeLimitSecs = Math.round(
            (moduleData.time_limit_seconds || (isMathSubject ? 35 * 60 : 32 * 60)) * timeFactor
          );
          const elapsedKey = `pt_elapsed_${attemptId}_${moduleData.subject_code}_${moduleData.module_number}`;
          localStorage.setItem(elapsedKey, String(timeLimitSecs - next));
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timeRemaining === null, submitting, moduleData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeRemaining === 0 && !submitting && moduleData) {
      clearInterval(timerRef.current);
      submitModule(true);
    }
  }, [timeRemaining]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function submitModule(autoSubmit = false) {
    if (submitting || !moduleData) return;
    setSubmitting(true);
    clearInterval(timerRef.current);

    // Flush the in-progress question's time before building the answer list
    flushQuestionTime();

    const elapsedKey = `pt_elapsed_${attemptId}_${moduleData.subject_code}_${moduleData.module_number}`;
    const ansKey = `pt_answers_${attemptId}_${moduleData.subject_code}_${moduleData.module_number}`;
    const qtKey = `pt_qtimes_${attemptId}_${moduleData.subject_code}_${moduleData.module_number}`;
    localStorage.removeItem(elapsedKey);
    localStorage.removeItem(ansKey);
    localStorage.removeItem(qtKey);

    // Clean up Desmos calculator state for this module's questions
    (moduleData.questions || []).forEach((q) => {
      try { localStorage.removeItem(`desmos:pt:${attemptId}:${q.question_version_id}`); } catch {}
    });

    const answerList = (moduleData.questions || []).map((q) => ({
      question_version_id: q.question_version_id,
      question_id: q.question_id,
      ...(answers[q.question_version_id] || {}),
      time_spent_ms: Math.round(questionTimesRef.current[q.question_version_id] || 0),
    }));

    try {
      const res = await fetch(`/api/practice-tests/attempt/${attemptId}/submit-module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_code: moduleData.subject_code,
          module_number: moduleData.module_number,
          route_code: moduleData.route_code,
          answers: answerList,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Submit failed'); setSubmitting(false); return; }

      if (data.is_complete) {
        router.replace(`/practice-test/attempt/${attemptId}/results`);
      } else {
        setSubmitting(false);
        setShowConfirm(false);
        loadModule();
      }
    } catch {
      setError('Network error during submit.');
      setSubmitting(false);
    }
  }

  function setAnswer(versionId, field, value) {
    setAnswers((prev) => {
      const next = {
        ...prev,
        [versionId]: { ...(prev[versionId] || {}), [field]: value },
      };
      // Persist to localStorage so answers survive Pause & Exit
      if (moduleData) {
        const key = `pt_answers_${attemptId}_${moduleData.subject_code}_${moduleData.module_number}`;
        try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }

  // ─── Drag: calculator divider ──────────────────────────────────────────────

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function onDividerPointerDown(e) {
    if (calcMinimized) return;
    e.preventDefault();

    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startW = liveWidthRef.current;
    dragRef.current.pendingW = liveWidthRef.current;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      if (!dragRef.current.dragging) return;
      const dx = ev.clientX - dragRef.current.startX;
      const next = Math.min(Math.max(dragRef.current.startW + dx, MIN_CALC_W), MAX_CALC_W);
      dragRef.current.pendingW = next;
      liveWidthRef.current = next;
      shellRef.current?.style.setProperty('--calcW', `${next}px`);
    };

    const onUp = () => {
      dragRef.current.dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setCalcWidth(dragRef.current.pendingW);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ─── Drag: reference sheet header ─────────────────────────────────────────

  function onRefHeaderPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    const card = refCardRef.current;
    if (!card) return;

    refDrag.current.dragging = true;
    refDrag.current.startX = e.clientX;
    refDrag.current.startY = e.clientY;
    const cur = refPosRef.current;
    refDrag.current.origX = cur.x;
    refDrag.current.origY = cur.y;

    const applyTransform = (x, y) => {
      const el = refCardRef.current;
      if (!el) return;
      el.style.transform = `translate(calc(-50% + ${x}px), ${y}px)`;
    };

    const onMove = (ev) => {
      if (!refDrag.current.dragging) return;
      const el = refCardRef.current;
      if (!el) return;

      const dx = ev.clientX - refDrag.current.startX;
      const dy = ev.clientY - refDrag.current.startY;
      let nx = refDrag.current.origX + dx;
      let ny = refDrag.current.origY + dy;

      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const minDx = margin - rect.left;
      const maxDx = vw - margin - rect.right;
      const minDy = margin - rect.top;
      const maxDy = vh - margin - rect.bottom;
      const curPos = refPosRef.current;
      nx = curPos.x + clamp(nx - curPos.x, minDx, maxDx);
      ny = curPos.y + clamp(ny - curPos.y, minDy, maxDy);
      refPosRef.current = { x: nx, y: ny };

      if (refDragRafRef.current) cancelAnimationFrame(refDragRafRef.current);
      refDragRafRef.current = requestAnimationFrame(() => applyTransform(nx, ny));
    };

    const onUp = () => {
      refDrag.current.dragging = false;
      if (refDragRafRef.current) cancelAnimationFrame(refDragRafRef.current);
      refDragRafRef.current = null;
      setRefPos(refPosRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ─── Drag: reading passage/answers divider ────────────────────────────────

  function onQaDividerPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    const container = qaSplitRef.current;
    if (!container) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    const startX = e.clientX;
    const startPct = qaLeftPctRef.current;
    const containerW = container.getBoundingClientRect().width;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dpct = (dx / containerW) * 100;
      const next = Math.min(68, Math.max(32, startPct + dpct));
      qaLeftPctRef.current = next;
      container.style.setProperty('--qa-split', `${next}%`);
    };

    const onUp = () => {
      setQaLeftPct(qaLeftPctRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ─── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}>
        <p className="muted">Loading module…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
          <button className="btn secondary" onClick={loadModule}>Retry</button>
        </div>
      </div>
    );
  }

  const q = moduleData?.questions?.[currentIdx];
  if (!q) return null;

  const ans = answers[q.question_version_id] || {};
  const answeredCount = Object.keys(answers).length;
  const totalCount = moduleData.questions.length;
  const unansweredCount = totalCount - answeredCount;

  const subjectLabel = SUBJECT_LABEL[moduleData.subject_code] || moduleData.subject_code;
  const moduleLabel = `${subjectLabel} — Module ${moduleData.module_number} of 2`;

  const isMath = ['M', 'm', 'math', 'Math', 'MATH'].includes(moduleData.subject_code);
  const isReading = !isMath && htmlHasContent(q.stimulus_html);

  // ─── Answer area (shared between layouts) ─────────────────────────────────

  const answerArea = q.question_type === 'mcq' || q.options?.length > 0 ? (
    <McqOptions
      options={q.options}
      selected={ans.selected_option_id}
      onChange={(id) => setAnswer(q.question_version_id, 'selected_option_id', id)}
      disabled={submitting}
      crossedOut={crossedOut}
      onCrossOut={toggleCrossOut}
    />
  ) : (
    <div className="ptSprWrap">
      <input
        className="input"
        type="text"
        placeholder="Your answer"
        value={ans.response_text || ''}
        onChange={(e) => setAnswer(q.question_version_id, 'response_text', e.target.value)}
        disabled={submitting}
      />
    </div>
  );

  // ─── Math shell (inlined to preserve Desmos DOM across re-renders) ─────────

  const mathShellJsx = (rightContent) => (
    <div
      ref={shellRef}
      className={`mathShell ${calcMinimized ? 'min' : 'withCalc'}`}
      style={{ '--calcW': `${calcMinimized ? 0 : calcWidth}px` }}
    >
      <aside className={`mathLeft ${calcMinimized ? 'min' : ''}`} aria-label="Calculator panel">
        <div className="mathLeftHeader">
          <div className="mathToolTitle">{calcMinimized ? 'Calc' : 'Calculator'}</div>
          <button type="button" className="btn secondary" onClick={() => setCalcMinimized((m) => !m)}>
            {calcMinimized ? 'Expand' : 'Minimize'}
          </button>
        </div>
        <div className={`calcBody ${calcMinimized ? 'hidden' : ''}`}>
          <DesmosPanel
            isOpen={!calcMinimized}
            storageKey={`desmos:pt:${attemptId}:${q.question_version_id}`}
          />
        </div>
        {calcMinimized ? <div className="calcMinBody" /> : null}
      </aside>

      {!calcMinimized ? (
        <div
          className="mathDivider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize calculator panel"
          onPointerDown={onDividerPointerDown}
          title="Drag to resize"
        />
      ) : (
        <div className="mathDivider min" aria-hidden="true" />
      )}

      <main className="mathRight">{rightContent}</main>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ptSession">

      {/* Header: 3-column — module label | timer (center) | tools */}
      <div className="ptSessionHeader">
        <div className="ptModuleLabel">
          {moduleLabel}
          <button
            className="btn secondary ptPauseBtn"
            onClick={() => {
              clearInterval(timerRef.current);
              router.push('/practice-test');
            }}
          >
            Pause & Exit
          </button>
        </div>

        <TimerChip seconds={timeRemaining} />

        <div className="ptHeaderRight">
          {isMath && (
            <div className="toolTabs" role="tablist" aria-label="Math tools">
              <button
                type="button"
                className={`toolTab ${!calcMinimized ? 'active' : ''}`}
                onClick={() => setCalcMinimized((m) => !m)}
                aria-pressed={!calcMinimized}
                title={!calcMinimized ? 'Minimize calculator' : 'Expand calculator'}
              >
                <IconCalculator className="toolTabIcon" />
                <span className="toolTabLabel">Calculator</span>
              </button>
              <button
                type="button"
                className={`toolTab ${showRef ? 'active' : ''}`}
                onClick={() => setShowRef(true)}
                aria-pressed={showRef}
                title="Open reference sheet"
              >
                <IconReference className="toolTabIcon" />
                <span className="toolTabLabel">Reference</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Question content */}
      <div className="ptQuestionPanel">
        {(() => {
          const qNumRow = (
            <div className="ptQNumRow">
              <span className="ptQNumBadge">{currentIdx + 1}</span>
              <button
                className={`ptMarkBtn${marked[q.question_version_id] ? ' marked' : ''}`}
                onClick={() => toggleMark(q.question_version_id)}
                aria-pressed={!!marked[q.question_version_id]}
              >
                <IconBookmark filled={!!marked[q.question_version_id]} />
                {marked[q.question_version_id] ? 'Marked for Review' : 'Mark for Review'}
              </button>
              <QuestionNotes questionId={q.question_id} />
            </div>
          );

          if (isReading) return (
            /* Two-column: passage left | draggable divider | stem + answers right */
            <div
              className="qaTwoCol"
              ref={qaSplitRef}
              style={{ '--qa-split': `${qaLeftPct}%` }}
            >
              <div className="qaLeft">
                <HtmlBlock className="prose" html={q.stimulus_html} />
              </div>
              <div
                className="qaDivider"
                onPointerDown={onQaDividerPointerDown}
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to resize passage and question panels"
              />
              <div className="qaRight">
                {qNumRow}
                {q.stem_html && <HtmlBlock className="prose" html={q.stem_html} />}
                {answerArea}
              </div>
            </div>
          );

          if (isMath) return mathShellJsx(
            /* Math shell: Desmos left, stem + answers right */
            <>
              {qNumRow}
              {htmlHasContent(q.stimulus_html) && (
                <div className="ptStimulus">
                  <HtmlBlock className="prose" html={q.stimulus_html} />
                </div>
              )}
              {q.stem_html && <HtmlBlock className="prose" html={q.stem_html} />}
              {answerArea}
            </>
          );

          /* Single column: rw question without a passage */
          return (
            <div className="ptSingleCol">
              {qNumRow}
              {htmlHasContent(q.stimulus_html) && (
                <div className="ptStimulus">
                  <HtmlBlock html={q.stimulus_html} />
                </div>
              )}
              <HtmlBlock className="ptStem" html={q.stem_html} />
              {answerArea}
            </div>
          );
        })()}
      </div>

      {/* Bottom nav: chip drawer + 3-column Bluebook-style footer */}
      <div className="ptNavBar">
        {showMap && (
          <div className="ptQMap">
            <QuestionMap
              questions={moduleData.questions}
              answers={answers}
              currentIdx={currentIdx}
              onJump={(i) => { setCurrentIdx(i); setShowMap(false); }}
              marked={marked}
            />
          </div>
        )}
        <div className="ptNavFooter">
          {/* Left column — reserved for future "Mark for Review" */}
          <div />

          {/* Center — question navigator pill */}
          <button
            className="ptQPill"
            onClick={() => setShowMap((m) => !m)}
            aria-expanded={showMap}
          >
            Question {currentIdx + 1} of {totalCount}
            <span className={`ptQPillArrow${showMap ? ' open' : ''}`}>▲</span>
          </button>

          {/* Right — Back / Next / Submit */}
          <div className="ptNavRight">
            <button
              className="btn secondary"
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0 || submitting}
            >
              Back
            </button>
            {currentIdx < totalCount - 1 ? (
              <button
                className="btn"
                onClick={() => setCurrentIdx((i) => Math.min(totalCount - 1, i + 1))}
                disabled={submitting}
              >
                Next
              </button>
            ) : (
              <button
                className="btn"
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
              >
                Submit Module
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reference sheet modal (math only) */}
      {showRef && (
        <div
          className="modalOverlay"
          onClick={() => setShowRef(false)}
          role="dialog"
          aria-modal="true"
          aria-label="SAT Math reference sheet"
        >
          <div
            ref={refCardRef}
            className="modalCard"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(980px, 96vw)',
              maxHeight: 'calc(100vh - 120px)',
              position: 'fixed',
              left: '50%',
              top: 80,
              transform: `translate(calc(-50% + ${refPos.x}px), ${refPos.y}px)`,
              willChange: 'transform',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="refModalHeader" onPointerDown={onRefHeaderPointerDown}>
              <div className="h2" style={{ margin: 0 }}>
                SAT Math Reference Sheet
              </div>
              <button
                type="button"
                className="refModalClose"
                onClick={() => setShowRef(false)}
                aria-label="Close reference sheet"
              >
                ×
              </button>
            </div>
            <div className="refSheetContent" aria-label="SAT Math Reference sheet image">
              <img
                className="refSheetImg"
                src="/math_reference_sheet.png"
                alt="SAT Math Reference Sheet"
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Submit confirmation overlay */}
      {showConfirm && (
        <div className="ptOverlay">
          <div className="ptConfirmCard card">
            <div className="h2">Submit Module?</div>
            {unansweredCount > 0 ? (
              <p className="muted" style={{ marginTop: 8 }}>
                You have <strong>{unansweredCount}</strong> unanswered question{unansweredCount !== 1 ? 's' : ''}.
                Unanswered questions will be marked incorrect.
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>
                All {totalCount} questions answered. Ready to submit?
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn" onClick={() => submitModule(false)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <button className="btn secondary" onClick={() => setShowConfirm(false)} disabled={submitting}>
                Go back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
