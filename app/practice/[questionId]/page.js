'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import HtmlBlock from '../../../components/HtmlBlock';

function formatCorrectText(ct) {
  if (!ct) return null;
  if (Array.isArray(ct)) return ct;
  if (typeof ct === 'string') {
    const t = ct.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [t];
  }
  return [String(ct)];
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Desmos panel: keep a single mounted instance, persist state across minimize/resize,
// and nudge Desmos with resize() on container size changes.
function DesmosPanel({ isOpen, storageKey }) {
  const hostRef = useRef(null);
  const calcRef = useRef(null);
  const savedStateRef = useRef(null);
  const prevOpenRef = useRef(isOpen);
  const roRef = useRef(null);
  const rafRef = useRef(null);
  const [ready, setReady] = useState(false);

  // If the script was already loaded, onLoad might not fire.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Desmos) setReady(true);
  }, []);

  const safeResize = () => {
    if (!calcRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      try {
        calcRef.current.resize();
      } catch {
        // ignore
      }
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
    } catch {
      // ignore
    }
  };

  const restoreState = () => {
    if (!calcRef.current) return;

    let st = savedStateRef.current;

    try {
      if (!st && storageKey && typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) st = JSON.parse(raw);
      }
    } catch {
      // ignore
    }

    if (st) {
      try {
        // Avoid polluting undo history when restoring.
        calcRef.current.setState(st, { allowUndo: false });
      } catch {
        // ignore
      }
    }
  };

  // Initialize exactly once.
  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!window.Desmos) return;

    if (!calcRef.current) {
      calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
        autosize: true, // Desmos can resize itself, but we still call resize() on hard layout commits.
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
      });

      restoreState();
      safeResize();
    }

    return () => {
      // If this component ever unmounts, persist and destroy cleanly.
      saveState();
      try {
        calcRef.current?.destroy?.();
      } catch {
        // ignore
      }
      calcRef.current = null;

      try {
        roRef.current?.disconnect?.();
      } catch {
        // ignore
      }
      roRef.current = null;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Observe container size changes -> resize().
  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!calcRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;

    try {
      roRef.current?.disconnect?.();
    } catch {
      // ignore
    }
    roRef.current = new ResizeObserver(() => safeResize());
    roRef.current.observe(hostRef.current);

    return () => {
      try {
        roRef.current?.disconnect?.();
      } catch {
        // ignore
      }
      roRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Save on close; restore + resize on open.
  useEffect(() => {
    const prev = prevOpenRef.current;

    if (prev && !isOpen) saveState();
    if (!prev && isOpen) {
      restoreState();
      safeResize();
    }

    prevOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Use env var on Vercel; fallback keeps dev from breaking if env not yet set.
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

export default function PracticeQuestionPage() {
  const { questionId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const [selected, setSelected] = useState(null);
  const [responseText, setResponseText] = useState('');

  const [showExplanation, setShowExplanation] = useState(false);

  // Math tools
  // ✅ Draggable divider + minimize (not close)
  const DEFAULT_CALC_W = 660; // wide enough that Desmos starts in its roomier layout
  const MIN_CALC_W = 360;
  const MAX_CALC_W = 760;
  const MINIMIZED_W = 56;

  const [calcMinimized, setCalcMinimized] = useState(false);
  const [calcWidth, setCalcWidth] = useState(DEFAULT_CALC_W);

  // IMPORTANT: prevent flicker by avoiding React updates during drag
  const shellRef = useRef(null);
  const liveWidthRef = useRef(DEFAULT_CALC_W);
  const dragRef = useRef({ dragging: false, startX: 0, startW: DEFAULT_CALC_W, pendingW: DEFAULT_CALC_W });

  const [showRef, setShowRef] = useState(false);

  // Option A neighbor nav
  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);

  // Load persisted calculator UI prefs (width/min) once.
  useEffect(() => {
    try {
      const savedW = Number(localStorage.getItem('calcWidth'));
      if (Number.isFinite(savedW)) setCalcWidth(Math.min(Math.max(savedW, MIN_CALC_W), MAX_CALC_W));
      const savedMin = localStorage.getItem('calcMinimized');
      if (savedMin === '1') setCalcMinimized(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    liveWidthRef.current = calcWidth;
    try {
      localStorage.setItem('calcWidth', String(calcWidth));
    } catch {}
  }, [calcWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('calcMinimized', calcMinimized ? '1' : '0');
    } catch {}
  }, [calcMinimized]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        const res = await fetch(`/api/questions/${questionId}`);
        const json = await res.json();
        if (ignore) return;
        setData(json);

        // Neighbor navigation ids (Option A flow)
        setPrevId(json?.nav?.prev_id || null);
        setNextId(json?.nav?.next_id || null);

        // Reset UI per question
        setSelected(null);
        setResponseText('');
        setShowExplanation(false);
        setShowRef(false);
      } catch (e) {
        if (!ignore) {
          setData(null);
          setMsg({ kind: 'error', text: 'Failed to load question.' });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    if (questionId) load();
    return () => {
      ignore = true;
    };
  }, [questionId]);

  const domainCode = useMemo(() => String(data?.taxonomy?.domain_code || '').toUpperCase().trim(), [data]);
  const isMath = useMemo(() => ['H', 'P', 'S', 'Q'].includes(domainCode), [domainCode]);

  const question = data?.question || {};
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};

  const correctOptionId = data?.correct?.correct_option_id || null;
  const correctTexts = data?.correct?.correct_texts || null;

  const isMcq = useMemo(() => String(version?.question_type || question?.question_type || '').toLowerCase() === 'mcq', [
    version,
    question,
  ]);
  const isSpr = useMemo(() => String(version?.question_type || question?.question_type || '').toLowerCase() === 'spr', [
    version,
    question,
  ]);

  const revealed = Boolean(status?.is_revealed);
  const isCorrect = Boolean(status?.is_correct);

  const correctTextList = useMemo(() => formatCorrectText(correctTexts), [correctTexts]);

  const selectedLabel = useMemo(() => {
    const opt = options.find((o) => o.id === selected);
    return opt?.option_label || null;
  }, [options, selected]);

  const correctLabel = useMemo(() => {
    const opt = options.find((o) => o.id === correctOptionId);
    return opt?.option_label || null;
  }, [options, correctOptionId]);

  function toast(kind, text) {
    setMsg({ kind, text });
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setMsg(null), 2600);
  }

  async function submitAnswer() {
    if (!questionId) return;

    if (isMcq && !selected) return toast('error', 'Select an answer first.');
    if (isSpr && !responseText.trim()) return toast('error', 'Enter an answer first.');

    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          selected_option_id: isMcq ? selected : null,
          response_text: isSpr ? responseText : null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to submit answer.');

      setData((d) => ({
        ...(d || {}),
        status: {
          ...(d?.status || {}),
          is_revealed: true,
          is_correct: Boolean(json?.is_correct),
        },
        correct: {
          ...(d?.correct || {}),
          correct_option_id: json?.correct_option_id ?? d?.correct?.correct_option_id ?? null,
          correct_texts: json?.correct_texts ?? d?.correct?.correct_texts ?? null,
        },
      }));

      toast('success', 'Saved.');
    } catch (e) {
      toast('error', e?.message || 'Failed to submit.');
    }
  }

  // Divider drag
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

  // Math shell wrapper (calculator left, question right; draggable divider; minimize)
  const MathShell = ({ children }) => (
    <div
      ref={shellRef}
      className={`mathShell ${calcMinimized ? 'min' : 'withCalc'}`}
      style={{ '--calcW': `${calcMinimized ? MINIMIZED_W : calcWidth}px` }}
    >
      <aside className={`mathLeft ${calcMinimized ? 'min' : ''}`} aria-label="Calculator panel">
        <div className="mathLeftHeader">
          <div className="mathToolTitle">{calcMinimized ? 'Calc' : 'Calculator'}</div>

          <button type="button" className="btn secondary" onClick={() => setCalcMinimized((m) => !m)}>
            {calcMinimized ? 'Expand' : 'Minimize'}
          </button>
        </div>

        {/* Keep mounted; hide visually when minimized */}
        <div className={`calcBody ${calcMinimized ? 'hidden' : ''}`}>
          <DesmosPanel
            isOpen={!calcMinimized}
            storageKey={questionId ? `desmos:${questionId}` : 'desmos:unknown'}
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

      <main className="mathRight">{children}</main>
    </div>
  );

  const AnswerBlock = () => (
    <div className="card" style={{ padding: 20 }}>
      {version?.stimulus_html ? (
        <div style={{ marginBottom: 12 }}>
          <HtmlBlock html={version.stimulus_html} />
        </div>
      ) : null}

      {version?.stem_html ? (
        <div style={{ marginBottom: 12 }}>
          <HtmlBlock html={version.stem_html} />
        </div>
      ) : null}

      {isMcq ? (
        <div className="options">
          {options.map((o) => {
            const id = o.id;
            const label = o.option_label;
            const html = o.option_html;

            const selectedNow = selected === id;
            const correctNow = revealed && correctOptionId && id === correctOptionId;
            const wrongSel = revealed && selectedNow && !correctNow;

            const cls = [
              'option',
              selectedNow ? 'selected' : '',
              correctNow ? 'correct' : '',
              wrongSel ? 'incorrect' : '',
              revealed && correctOptionId && selected !== correctOptionId && correctNow ? 'revealCorrect' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={id}
                type="button"
                className={cls}
                onClick={() => (!revealed ? setSelected(id) : null)}
                disabled={revealed}
              >
                <span className="optionBadge">{label}</span>
                <span className="optionText">
                  <HtmlBlock html={html} />
                </span>
              </button>
            );
          })}
        </div>
      ) : isSpr ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="muted" style={{ fontSize: 13 }}>
            Your answer
          </label>
          <input
            className="input"
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            disabled={revealed}
            placeholder="Type your answer…"
            autoComplete="off"
            spellCheck="false"
          />
        </div>
      ) : null}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, gap: 10 }}>
        {!revealed ? (
          <button
            type="button"
            className="btn"
            onClick={submitAnswer}
            disabled={isMcq ? !selected : isSpr ? !responseText.trim() : true}
          >
            Check answer
          </button>
        ) : (
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn secondary" onClick={() => setShowExplanation((s) => !s)}>
              {showExplanation ? 'Hide explanation' : 'Show explanation'}
            </button>
          </div>
        )}

        <div className="row" style={{ gap: 10 }}>
          {prevId ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => router.push(`/practice/${prevId}${searchParams?.toString() ? `?${searchParams}` : ''}`)}
            >
              ← Prev
            </button>
          ) : null}

          {nextId ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => router.push(`/practice/${nextId}${searchParams?.toString() ? `?${searchParams}` : ''}`)}
            >
              Next →
            </button>
          ) : null}
        </div>
      </div>

      {revealed ? (
        <div style={{ marginTop: 14 }}>
          <div className={`resultBanner ${isCorrect ? 'good' : 'bad'}`}>{isCorrect ? 'Correct' : 'Incorrect'}</div>

          {isMcq && correctLabel ? (
            <div className="muted" style={{ marginTop: 10 }}>
              Correct answer: <span className="mono">{correctLabel}</span>
              {selectedLabel && !isCorrect ? (
                <>
                  {' '}
                  (you chose <span className="mono">{selectedLabel}</span>)
                </>
              ) : null}
            </div>
          ) : null}

          {isSpr && correctTextList ? (
            <div className="muted" style={{ marginTop: 10 }}>
              Correct answer{correctTextList.length > 1 ? 's' : ''}:{' '}
              <span className="mono">{correctTextList.join(', ')}</span>
            </div>
          ) : null}

          {showExplanation && version?.explanation_html ? (
            <div style={{ marginTop: 14 }}>
              <div className="h3" style={{ marginBottom: 8 }}>
                Explanation
              </div>
              <HtmlBlock html={version.explanation_html} />
            </div>
          ) : null}

          {version?.references_html ? (
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn secondary" onClick={() => setShowRef((s) => !s)}>
                {showRef ? 'Hide references' : 'Show references'}
              </button>
              {showRef ? (
                <div style={{ marginTop: 10 }}>
                  <HtmlBlock html={version.references_html} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="h2">Practice</div>

          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link className="btn secondary" href="/practice">
              ← Back to list
            </Link>
          </div>
        </div>

        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <div className="pill">
            <span className="muted">Difficulty</span> <span className="mono">{question?.difficulty ?? '—'}</span>
          </div>
          <div className="pill">
            <span className="muted">Band</span> <span className="mono">{question?.score_band ?? '—'}</span>
          </div>
        </div>
      </div>

      {msg ? <Toast kind={msg.kind} msg={msg.text} /> : null}

      {loading ? (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          Loading…
        </div>
      ) : !questionId || !data ? (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          No question data found.
        </div>
      ) : isMath ? (
        <div style={{ marginTop: 16 }}>
          <MathShell>
            <AnswerBlock />
          </MathShell>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <AnswerBlock />
        </div>
      )}

      <style jsx global>{`
        .pill {
          border: 1px solid var(--border);
          background: #fff;
          border-radius: 999px;
          padding: 8px 12px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }

        .mathShell {
          display: grid;
          gap: 0;
          align-items: stretch;
          grid-template-columns: var(--calcW, 660px) 12px minmax(0, 1fr);
        }

        .mathShell.min {
          grid-template-columns: var(--calcW, 56px) 12px minmax(0, 1fr);
        }

        .mathLeft {
          position: sticky;
          top: 12px;
          align-self: start;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: #f9fafb;
          max-height: calc(100vh - 24px);
          overflow: hidden;
        }

        .mathLeftHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          background: rgba(17, 24, 39, 0.03);
        }

        .mathToolTitle {
          font-weight: 700;
        }

        .calcBody.hidden {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          /* Keep a stable layout box so Desmos doesn't see a 0px container */
        }

        .desmosHost {
          width: 100%;
          height: min(560px, calc(100vh - 220px));
          background: #fff;
        }

        .calcMinBody {
          height: calc(100vh - 92px);
        }

        .mathDivider {
          cursor: col-resize;
          position: relative;
          align-self: stretch;
          min-height: 360px;
          touch-action: none;
        }

        .mathDivider::before {
          content: '';
          position: absolute;
          inset: 0;
          margin: 0 auto;
          width: 1px;
          background: var(--border);
        }

        .mathDivider:hover::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.06);
        }

        .mathDivider.min {
          cursor: default;
        }

        .mathRight {
          min-width: 0;
          padding-left: 22px;
        }

        .resultBanner {
          border-radius: 14px;
          padding: 10px 12px;
          font-weight: 800;
          display: inline-block;
        }

        .resultBanner.good {
          border: 1px solid #15803d;
          background: #f0fdf4;
        }

        .resultBanner.bad {
          border: 1px solid #b91c1c;
          background: #fef2f2;
        }

        .options {
          display: grid;
          gap: 10px;
        }

        .option {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 16px 18px;
          background: #fff;
          cursor: pointer;
          text-align: left;
        }

        .option.selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.12);
        }

        .option.correct {
          border-color: #15803d;
          background: #f0fdf4;
        }

        .option.correct .optionBadge {
          border-color: #15803d;
          background: #15803d;
          color: white;
        }

        .option.incorrect {
          border-color: #b91c1c;
          background: #fef2f2;
        }

        .option.incorrect .optionBadge {
          border-color: #b91c1c;
          background: #b91c1c;
          color: white;
        }

        .option.revealCorrect {
          border-color: #15803d;
        }

        .option.revealCorrect .optionBadge {
          border-color: #15803d;
        }

        .optionBadge {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid var(--border);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          flex: 0 0 auto;
        }

        .optionText {
          flex: 1;
        }

        @media (max-width: 920px) {
          .mathShell,
          .mathShell.min {
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .mathDivider,
          .mathDivider.min {
            display: none;
          }

          .mathLeft {
            position: relative;
            top: auto;
          }

          .desmosHost,
          .calcMinBody {
            height: 420px;
          }

          .mathRight {
            padding-left: 0;
          }
        }
      `}</style>
    </main>
  );
}
