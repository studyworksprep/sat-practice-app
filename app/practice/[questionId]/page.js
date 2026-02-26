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

// Desmos panel relying on autosize (default true); adds ResizeObserver + getState/setState persistence.
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
      if (storageKey && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(storageKey, JSON.stringify(st));
      }
    } catch {
      // ignore
    }
  };

  const restoreState = () => {
    if (!calcRef.current) return;
    let st = savedStateRef.current;

    try {
      if (!st && storageKey && typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(storageKey);
        if (raw) st = JSON.parse(raw);
      }
    } catch {
      // ignore
    }

    if (st) {
      try {
        calcRef.current.setState(st, { allowUndo: false });
      } catch {
        // ignore
      }
    }
  };

  // Initialize exactly once, and keep the instance even when closed.
  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!window.Desmos) return;

    if (!calcRef.current) {
      calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
        autosize: true, // let Desmos handle container resizes
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
      });

      // If we have a persisted state (e.g., sessionStorage), load it on first init.
      restoreState();
      safeResize();
    }

    return () => {
      // If this component ever truly unmounts, persist state and clean up.
      saveState();
      try {
        calcRef.current?.destroy?.();
      } catch {
        // ignore
      }
      calcRef.current = null;

      try {
        roRef.current?.disconnect?.();
      } catch {}
      roRef.current = null;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Observe container size changes and force a resize on the Desmos instance.
  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!calcRef.current) return;

    try {
      roRef.current?.disconnect?.();
    } catch {}
    roRef.current = null;

    if (typeof ResizeObserver === 'undefined') return;

    roRef.current = new ResizeObserver(() => safeResize());
    roRef.current.observe(hostRef.current);

    return () => {
      try {
        roRef.current?.disconnect?.();
      } catch {}
      roRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Save on close; restore + resize on open.
  useEffect(() => {
    const prev = prevOpenRef.current;

    if (prev && !isOpen) {
      saveState();
    }

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

function isMathLike(domain, subtopic) {
  const d = (domain || '').toLowerCase();
  const s = (subtopic || '').toLowerCase();
  return (
    d.includes('math') ||
    d.includes('algebra') ||
    d.includes('advanced') ||
    d.includes('problem') ||
    d.includes('geometry') ||
    d.includes('trig') ||
    s.includes('math') ||
    s.includes('algebra') ||
    s.includes('geometry') ||
    s.includes('trig')
  );
}

function formatTime(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function isCorrectSpr(userText, correctTextList) {
  const a = (userText || '').trim();
  if (!a) return false;
  const corr = formatCorrectText(correctTextList) || [];
  return corr.some((ct) => String(ct).trim() === a);
}

export default function PracticeQuestionPage() {
  const { questionId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Answer input
  const [selected, setSelected] = useState(null); // option uuid for mcq
  const [responseText, setResponseText] = useState(''); // for spr

  // UX state
  const [toast, setToast] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attemptId, setAttemptId] = useState(null);

  // Timing
  const startedAtRef = useRef(null);

  // Question map/session context
  const sessionId = searchParams?.get('session') || null;
  const index1 = useMemo(() => {
    const v = searchParams?.get('i');
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);
  const total = useMemo(() => {
    const v = searchParams?.get('n');
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);
  const inSessionContext = !!(sessionId && index1 != null && total != null);

  // Calculator panel width state (math only)
  const DEFAULT_CALC_W = 520;
  const MIN_CALC_W = 360;
  const MAX_CALC_W = 760;
  const MINIMIZED_W = 56;

  const [calcMinimized, setCalcMinimized] = useState(false);
  const [calcWidth, setCalcWidth] = useState(DEFAULT_CALC_W);

  // IMPORTANT: prevent flicker by avoiding React updates during drag
  const shellRef = useRef(null);
  const liveWidthRef = useRef(DEFAULT_CALC_W);
  const dragRef = useRef({ dragging: false, startX: 0, startW: DEFAULT_CALC_W });

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [questionId]);

  // Fetch question
  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setRevealed(false);
      setSelected(null);
      setResponseText('');
      setAttemptId(null);

      try {
        const res = await fetch(`/api/questions/${questionId}`);
        const json = await res.json();
        if (!ignore) setData(json);
      } catch (e) {
        if (!ignore) setData(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    if (questionId) load();
    return () => {
      ignore = true;
    };
  }, [questionId]);

  const q = data?.question || null;
  const ver = data?.version || null;
  const opts = data?.options || [];
  const correct = data?.correct || null;

  const questionType = ver?.question_type || q?.question_type || null;

  const mathMode = useMemo(() => {
    return isMathLike(q?.domain, q?.subtopic);
  }, [q?.domain, q?.subtopic]);

  const correctOptionId = correct?.correct_option_id || null;
  const correctTexts = correct?.correct_texts || null;

  const isCorrect = useMemo(() => {
    if (!revealed) return null;
    if (questionType === 'spr') return isCorrectSpr(responseText, correctTexts);
    if (questionType === 'mcq') return selected && correctOptionId ? selected === correctOptionId : false;
    return false;
  }, [revealed, questionType, responseText, correctTexts, selected, correctOptionId]);

  function showToast(msg, kind = 'success') {
    setToast({ msg, kind });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2200);
  }

  async function submitAttempt() {
    if (!q?.id || !ver?.id) return;
    if (submitting) return;

    const now = Date.now();
    const timeSpentMs = startedAtRef.current ? now - startedAtRef.current : null;

    setSubmitting(true);
    try {
      const body = {
        question_id: q.id,
        selected_option_id: questionType === 'mcq' ? selected : null,
        response_text: questionType === 'spr' ? responseText : null,
        time_spent_ms: timeSpentMs,
      };

      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Attempt failed');
      setAttemptId(json?.attempt_id || null);
      setRevealed(true);
      showToast('Saved!', 'success');
    } catch (e) {
      showToast(e?.message || 'Error saving attempt', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForRetry() {
    setRevealed(false);
    setAttemptId(null);
    showToast('Try again', 'success');
  }

  function openMap() {
    if (!inSessionContext) return;
    const params = new URLSearchParams();
    params.set('session', sessionId);
    params.set('i', String(index1));
    params.set('n', String(total));
    router.push(`/practice?${params.toString()}`);
  }

  // Drag handler for divider
  function onDividerPointerDown(e) {
    if (calcMinimized) return;
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startW = liveWidthRef.current;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const next = Math.max(MIN_CALC_W, Math.min(MAX_CALC_W, dragRef.current.startW + dx));
      liveWidthRef.current = next;
      // Update only CSS var; no React re-render during drag
      if (shellRef.current) shellRef.current.style.setProperty('--calcW', `${next}px`);
    }

    function onUp() {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      // Commit at end so UI is consistent for future renders
      setCalcWidth(liveWidthRef.current);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const QuestionCard = ({ children }) => (
    <div className="card" style={{ padding: 20 }}>
      {children}
    </div>
  );

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

        {/* Keep mounted; hide visually when minimized (do NOT collapse height to 0) */}
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

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="h2">Practice</div>

          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link className="btn secondary" href="/practice">
              ← Back to list
            </Link>

            <button
              type="button"
              className="qmapTrigger"
              onClick={openMap}
              disabled={!inSessionContext}
              title={inSessionContext ? 'Open question map' : 'Map available when opened from the practice list'}
              aria-label="Open question map"
            >
              <span className="qmapTriggerCount">
                {index1 != null && total != null ? (
                  <>
                    <span className="mono">{index1}</span> / <span className="mono">{total}</span>
                  </>
                ) : (
                  'Map'
                )}
              </span>
            </button>
          </div>
        </div>

        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <div className="pill">
            <span className="muted">Difficulty</span> <span className="mono">{q?.difficulty ?? '—'}</span>
          </div>
          <div className="pill">
            <span className="muted">Band</span> <span className="mono">{q?.score_band ?? '—'}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          Loading…
        </div>
      ) : !q || !ver ? (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          No question data found.
        </div>
      ) : mathMode ? (
        <div style={{ marginTop: 16 }}>
          <MathShell>
            <QuestionCard>
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                {q?.domain ? <span>{q.domain}</span> : null}
                {q?.subtopic ? <span>{q?.domain ? ' • ' : ''}{q.subtopic}</span> : null}
              </div>

              {ver?.stimulus_html ? (
                <div style={{ marginBottom: 12 }}>
                  <HtmlBlock html={ver.stimulus_html} />
                </div>
              ) : null}

              {ver?.stem_html ? (
                <div style={{ marginBottom: 12 }}>
                  <HtmlBlock html={ver.stem_html} />
                </div>
              ) : null}

              {questionType === 'mcq' ? (
                <div className="options">
                  {opts.map((o) => {
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
              ) : (
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
              )}

              <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, gap: 10 }}>
                {!revealed ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={submitAttempt}
                    disabled={submitting || (questionType === 'mcq' ? !selected : !responseText.trim())}
                  >
                    {submitting ? 'Saving…' : 'Check answer'}
                  </button>
                ) : (
                  <div className="row" style={{ gap: 10 }}>
                    <button type="button" className="btn secondary" onClick={resetForRetry}>
                      Try again
                    </button>
                  </div>
                )}

                <div className="muted" style={{ fontSize: 13 }}>
                  {attemptId ? (
                    <>
                      Attempt saved • <span className="mono">{attemptId.slice(0, 8)}</span>
                    </>
                  ) : (
                    <>Time: {formatTime(Date.now() - (startedAtRef.current || Date.now()))}</>
                  )}
                </div>
              </div>

              {revealed ? (
                <div style={{ marginTop: 14 }}>
                  <div className={`resultBanner ${isCorrect ? 'good' : 'bad'}`}>
                    {isCorrect ? 'Correct' : 'Incorrect'}
                  </div>

                  {questionType === 'spr' && correctTexts ? (
                    <div className="muted" style={{ marginTop: 10 }}>
                      Correct answer{(formatCorrectText(correctTexts) || []).length > 1 ? 's' : ''}:{' '}
                      <span className="mono">{(formatCorrectText(correctTexts) || []).join(', ')}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </QuestionCard>
          </MathShell>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <QuestionCard>
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              {q?.domain ? <span>{q.domain}</span> : null}
              {q?.subtopic ? <span>{q?.domain ? ' • ' : ''}{q.subtopic}</span> : null}
            </div>

            {ver?.stimulus_html ? (
              <div style={{ marginBottom: 12 }}>
                <HtmlBlock html={ver.stimulus_html} />
              </div>
            ) : null}

            {ver?.stem_html ? (
              <div style={{ marginBottom: 12 }}>
                <HtmlBlock html={ver.stem_html} />
              </div>
            ) : null}

            {questionType === 'mcq' ? (
              <div className="options">
                {opts.map((o) => {
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
            ) : (
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
            )}

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, gap: 10 }}>
              {!revealed ? (
                <button
                  type="button"
                  className="btn"
                  onClick={submitAttempt}
                  disabled={submitting || (questionType === 'mcq' ? !selected : !responseText.trim())}
                >
                  {submitting ? 'Saving…' : 'Check answer'}
                </button>
              ) : (
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="btn secondary" onClick={resetForRetry}>
                    Try again
                  </button>
                </div>
              )}

              <div className="muted" style={{ fontSize: 13 }}>
                {attemptId ? (
                  <>
                    Attempt saved • <span className="mono">{attemptId.slice(0, 8)}</span>
                  </>
                ) : (
                  <>Time: {formatTime(Date.now() - (startedAtRef.current || Date.now()))}</>
                )}
              </div>
            </div>

            {revealed ? (
              <div style={{ marginTop: 14 }}>
                <div className={`resultBanner ${isCorrect ? 'good' : 'bad'}`}>
                  {isCorrect ? 'Correct' : 'Incorrect'}
                </div>

                {questionType === 'spr' && correctTexts ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Correct answer{(formatCorrectText(correctTexts) || []).length > 1 ? 's' : ''}:{' '}
                    <span className="mono">{(formatCorrectText(correctTexts) || []).join(', ')}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </QuestionCard>
        </div>
      )}

      {toast ? <Toast msg={toast.msg} kind={toast.kind} /> : null}

      <style jsx global>{`
        .qmapTrigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 8px 12px;
          background: #fff;
          font-weight: 700;
          cursor: pointer;
        }

        .qmapTrigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .qmapTriggerCount {
          display: inline-flex;
          gap: 6px;
        }

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
          --calcW: 520px;
          display: grid;
          grid-template-columns: var(--calcW) 10px 1fr;
          gap: 0;
          align-items: stretch;
          border-radius: 22px;
          overflow: hidden;
        }

        .mathShell.min {
          grid-template-columns: ${MINIMIZED_W}px 10px 1fr;
        }

        .mathLeft {
          background: #fff;
          border: 1px solid var(--border);
          border-right: none;
          border-top-left-radius: 22px;
          border-bottom-left-radius: 22px;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr;
          min-height: 520px;
        }

        .mathLeftHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
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
          height: min(440px, calc(100vh - 240px));
        }

        .calcMinBody {
          width: 100%;
          height: min(440px, calc(100vh - 240px));
        }

        .mathDivider {
          background: rgba(17, 24, 39, 0.06);
          cursor: col-resize;
          width: 10px;
        }

        .mathDivider:hover {
          background: rgba(17, 24, 39, 0.12);
        }

        .mathDivider.min {
          cursor: default;
          background: rgba(17, 24, 39, 0.04);
        }

        .mathRight {
          border: 1px solid var(--border);
          border-left: none;
          border-top-right-radius: 22px;
          border-bottom-right-radius: 22px;
          background: #fff;
          padding: 0;
          overflow: hidden;
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

        @media (max-width: 980px) {
          .mathShell,
          .mathShell.min {
            grid-template-columns: 1fr;
            border-radius: 22px;
          }

          .mathLeft,
          .mathRight {
            border-radius: 22px;
            border: 1px solid var(--border);
          }

          .mathDivider {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
