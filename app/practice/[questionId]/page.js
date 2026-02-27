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

/**
 * Desmos panel:
 * - Initialize exactly once.
 * - Never unmount when minimized.
 * - Save state on minimize + on unmount.
 * - Restore state on expand.
 */
function DesmosPanel({ isOpen, storageKey, desmosApiKey }) {
  const hostRef = useRef(null);
  const calcRef = useRef(null);
  const savedStateRef = useRef(null);
  const prevOpenRef = useRef(isOpen);
  const roRef = useRef(null);
  const rafRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);

  // If Desmos already present, avoid waiting on Script onLoad
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Desmos) setReady(true);
  }, []);

  const safeResize = () => {
    if (!calcRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      try {
        calcRef.current.resize();
      } catch {}
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
      try {
        // If allowUndo option isn't supported, this still won't break (wrapped).
        calcRef.current.setState(st, { allowUndo: false });
      } catch {
        try {
          calcRef.current.setState(st);
        } catch {}
      }
    }
  };

  // Init calculator exactly once when ready
  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!window.Desmos?.GraphingCalculator) return;
    if (calcRef.current) return;

    try {
      calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
        border: false,
      });

      restoreState();
      safeResize();

      // ResizeObserver for container
      if (typeof ResizeObserver !== 'undefined') {
        roRef.current = new ResizeObserver(() => safeResize());
        roRef.current.observe(hostRef.current);
      }

      // Nudge after mount
      window.setTimeout(() => safeResize(), 0);
      window.setTimeout(() => safeResize(), 80);
    } catch {
      // If init fails, we keep UI stable but do nothing.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Save/restore on minimize/expand
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = isOpen;

    if (!calcRef.current) return;

    if (prev && !isOpen) saveState();
    if (!prev && isOpen) {
      restoreState();
      safeResize();
      window.setTimeout(() => safeResize(), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        saveState();
      } catch {}
      try {
        roRef.current?.disconnect?.();
      } catch {}
      roRef.current = null;

      try {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } catch {}
      rafRef.current = null;

      try {
        calcRef.current?.destroy?.();
      } catch {}
      calcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IMPORTANT: Keep Desmos API v1.6 (stable) + key in URL (as in your handoff notes)
  const key = desmosApiKey || 'bac289385bcd4778a682276b95f5f116';

  return (
    <>
      <Script
        src={`https://www.desmos.com/api/v1.6/calculator.js?apiKey=${key}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onError={() => setLoadErr(true)}
      />
      {loadErr ? (
        <div className="muted" style={{ padding: 10 }}>
          Calculator failed to load.
        </div>
      ) : null}
      <div ref={hostRef} className="desmosHost" />
    </>
  );
}

/**
 * PDF.js renderer:
 * Uses a UMD build that reliably sets a global.
 * If it fails, we show a fallback Open button.
 */
function PdfJsSheet({ url }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [err, setErr] = useState(null);

  // PDF.js 2.x UMD sets window['pdfjs-dist/build/pdf']
  const getPdfLib = () => {
    if (typeof window === 'undefined') return null;
    return window['pdfjs-dist/build/pdf'] || window.pdfjsLib || null;
  };

  useEffect(() => {
    if (getPdfLib()) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function run() {
      setErr(null);
      setLoadingPdf(true);

      try {
        const pdfjsLib = getPdfLib();
        if (!pdfjsLib?.getDocument) throw new Error('PDF engine unavailable');

        // Worker must match this version
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

        const task = pdfjsLib.getDocument(url);
        const pdf = await task.promise;
        if (cancelled) return;

        const el = containerRef.current;
        if (!el) return;
        el.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const targetW = Math.min(920, el.clientWidth || 920);
          const scale = targetW / baseViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          const wrap = document.createElement('div');
          wrap.style.display = 'grid';
          wrap.style.justifyContent = 'center';
          wrap.style.margin = '0 0 14px';
          wrap.appendChild(canvas);
          el.appendChild(wrap);

          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setLoadingPdf(false);
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || 'Failed to load reference sheet');
          setLoadingPdf(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [ready, url]);

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onError={() => {
          setErr('Failed to load PDF engine');
          setLoadingPdf(false);
        }}
      />
      {err ? <div className="muted">Error: {err}</div> : null}
      {loadingPdf ? <div className="muted">Loading reference sheet…</div> : null}
      <div ref={containerRef} style={{ width: '100%' }} />
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
  const DEFAULT_CALC_W = 660;
  const MIN_CALC_W = 360;
  const MAX_CALC_W = 760;
  const MINIMIZED_W = 56;

  const [calcMinimized, setCalcMinimized] = useState(false);
  const [calcWidth, setCalcWidth] = useState(DEFAULT_CALC_W);

  const shellRef = useRef(null);
  const liveWidthRef = useRef(DEFAULT_CALC_W);
  const dragRef = useRef({ dragging: false, startX: 0, startW: DEFAULT_CALC_W, pendingW: DEFAULT_CALC_W });

  const [showRef, setShowRef] = useState(false);

  // Option A neighbor nav
  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navMode, setNavMode] = useState('neighbors');
  const [navForId, setNavForId] = useState(null);

  // Instant navigation metadata
  const [total, setTotal] = useState(null);
  const [index1, setIndex1] = useState(null);

  // ✅ Question Map modal (existing)
  const MAP_PAGE_SIZE = 100;
  const [showMap, setShowMap] = useState(false);
  const [mapOffset, setMapOffset] = useState(0);
  const [mapIds, setMapIds] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [jumpTo, setJumpTo] = useState('');

  const startedAtRef = useRef(Date.now());

  const sessionParams = useMemo(() => {
    const keys = ['difficulty', 'score_bands', 'domain', 'topic', 'marked_only', 'q', 'session'];
    const p = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v !== null && v !== '') p.set(k, v);
    }
    return p;
  }, [searchParams]);

  const sessionParamsString = useMemo(() => sessionParams.toString(), [sessionParams]);
  const inSessionContext = sessionParams.get('session') === '1';

  useEffect(() => {
    liveWidthRef.current = calcWidth;
  }, [calcWidth]);

  function buildHref(targetId, t, o, p, i) {
    const qs = new URLSearchParams(sessionParams);
    if (t != null) qs.set('t', String(t));
    if (o != null) qs.set('o', String(o));
    if (p != null) qs.set('p', String(p));
    if (i != null) qs.set('i', String(i));
    return `/practice/${targetId}?${qs.toString()}`;
  }

  function getIndexFromUrl() {
    const i = Number(searchParams.get('i'));
    if (Number.isFinite(i) && i >= 1) return i;

    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));
    if (Number.isFinite(o) && o >= 0 && Number.isFinite(p) && p >= 0) return o + p + 1;

    return null;
  }

  async function fetchQuestion() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/questions/${questionId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load question');

      setData(json);

      if (json?.status?.status_json?.last_selected_option_id) setSelected(json.status.status_json.last_selected_option_id);
      else setSelected(null);

      if (json?.status?.status_json?.last_response_text) setResponseText(json.status.status_json.last_response_text);
      else setResponseText('');

      startedAtRef.current = Date.now();
      setShowExplanation(false);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function submitAttempt() {
    if (!data) return;

    const qTypeLocal = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    const body = {
      question_id: data.question_id,
      selected_option_id: qTypeLocal === 'mcq' ? selected : null,
      response_text: qTypeLocal === 'spr' ? responseText : null,
      time_spent_ms,
    };

    try {
      setMsg(null);
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit attempt');

      await fetchQuestion();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  // ✅ consolidated top button (only mark UI change)
  async function toggleMarkForReview() {
    if (!data?.question_id) return;
    const next = !Boolean(data?.status?.marked_for_review);
    try {
      setMsg(null);

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: {
            ...(prev.status || {}),
            marked_for_review: next,
          },
        };
      });

      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: data.question_id, patch: { marked_for_review: next } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to update status');

      setMsg({ kind: 'success', text: next ? 'Marked for review' : 'Unmarked for review' });
    } catch (e) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: {
            ...(prev.status || {}),
            marked_for_review: !next,
          },
        };
      });
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  // Reference sheet modal: ESC + lock scroll
  useEffect(() => {
    if (!showRef) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowRef(false);
    };
    window.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showRef]);

  // Neighbor fetch (existing)
  useEffect(() => {
    if (!questionId) {
      setNavLoading(false);
      setPrevId(null);
      setNextId(null);
      setNavForId(null);
      return;
    }

    setNavMode('neighbors');
    setNavLoading(true);
    setPrevId(null);
    setNextId(null);
    setNavForId(null);

    (async () => {
      try {
        const res = await fetch(`/api/questions/${questionId}/neighbors?${sessionParamsString}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load neighbors');

        setPrevId(json.prev_id || null);
        setNextId(json.next_id || null);
        setNavForId(questionId);
      } catch (e) {
        setPrevId(null);
        setNextId(null);
        setNavForId(null);
        setNavMode('index');
        setMsg({ kind: 'danger', text: `Neighbors failed (fallback enabled): ${e.message}` });
      } finally {
        setNavLoading(false);
      }
    })();
  }, [questionId, sessionParamsString]);

  useEffect(() => {
    if (!questionId) return;
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Load saved calc UI state (existing)
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
    try {
      localStorage.setItem('calcWidth', String(calcWidth));
    } catch {}
  }, [calcWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('calcMinimized', calcMinimized ? '1' : '0');
    } catch {}
  }, [calcMinimized]);

  const qType = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  const locked = Boolean(status?.is_done);
  const correctOptionId = data?.correct_option_id || null;
  const correctText = data?.correct_text || null;

  const domainCode = String(data?.taxonomy?.domain_code || '').toUpperCase().trim();
  const useTwoColReading = qType === 'mcq' && ['EOI', 'INI', 'CAS', 'SEC'].includes(domainCode);
  const isMath = ['H', 'P', 'S', 'Q'].includes(domainCode);

  const headerPills = [
    { label: 'Attempts', value: status?.attempts_count ?? 0 },
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
  ];

  const neighborsReady = navMode === 'neighbors' && navForId === questionId && !navLoading;
  const prevDisabled = navLoading || !index1 || index1 <= 1 || !prevId;
  const nextDisabled = navLoading || !index1 || !total || index1 >= total || !nextId;

  const PromptBlocks = ({ compactLabels = false, hideQuestionLabel = false, mbWhenNotCompact = 12 }) => (
    <>
      {version?.stimulus_html ? (
        <div className="card subcard" style={{ marginBottom: compactLabels ? 0 : mbWhenNotCompact }}>
          <div className={compactLabels ? 'srOnly' : 'sectionLabel'}>Stimulus</div>
          <HtmlBlock className="prose" html={version.stimulus_html} />
        </div>
      ) : null}

      {version?.stem_html ? (
        <div className="card subcard" style={{ marginBottom: compactLabels ? 0 : mbWhenNotCompact }}>
          {/* ✅ Math: hide "Question" label, keep srOnly */}
          <div className={compactLabels || hideQuestionLabel ? 'srOnly' : 'sectionLabel'}>Question</div>
          <HtmlBlock className="prose" html={version.stem_html} />
        </div>
      ) : null}
    </>
  );

  const MathToolRow = ({ align = 'flex-end' } = {}) =>
    isMath ? (
      <div className="mathRightHeader" style={{ justifyContent: align }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => setCalcMinimized((m) => !m)}
          aria-label={calcMinimized ? 'Expand calculator' : 'Minimize calculator'}
          title={calcMinimized ? 'Expand calculator' : 'Minimize calculator'}
        >
          {calcMinimized ? 'Expand Calculator' : 'Minimize Calculator'}
        </button>

        <button type="button" className="btn secondary" onClick={() => setShowRef(true)}>
          Reference Sheet
        </button>
      </div>
    ) : null;

  const McqOptionsArea = ({ showAnswerHeader = true }) => (
    <>
      {/* ✅ Math: hide "Answer choices" header */}
      {showAnswerHeader ? <div className="h2">Answer choices</div> : <div className="srOnly">Answer choices</div>}

      <div className="optionList">
        {options
          .slice()
          .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
          .map((opt) => {
            const isSelected = selected === opt.id;

            return (
              <div
                key={opt.id}
                className={(() => {
                  let cls = 'option' + (isSelected ? ' selected' : '');
                  if (locked) {
                    const isCorrect = String(opt.id) === String(correctOptionId);
                    if (isSelected && isCorrect) cls += ' correct';
                    else if (isSelected && !isCorrect) cls += ' incorrect';
                  }
                  return cls;
                })()}
                onClick={() => {
                  if (locked) return;
                  setSelected(opt.id);
                }}
                style={{ cursor: locked ? 'default' : 'pointer' }}
              >
                <div className="optionBadge">{opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0))}</div>
                <div className="optionContent">
                  <HtmlBlock className="prose" html={opt.content_html} />
                </div>
              </div>
            );
          })}
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <div className="btnRow">
          <button className="btn primary" onClick={submitAttempt} disabled={locked || !selected}>
            Submit
          </button>
        </div>

        {locked && (version?.rationale_html || version?.explanation_html) ? (
          <button className="btn secondary" onClick={() => setShowExplanation((s) => !s)}>
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        ) : null}

        <div className="btnRow">
          <button className="btn secondary" disabled={prevDisabled}>
            Prev
          </button>

          <button className="btn secondary" disabled={nextDisabled || (navMode === 'neighbors' && !neighborsReady)}>
            Next
          </button>
        </div>
      </div>
    </>
  );

  const SprAnswerArea = () => (
    <>
      <div className="h2">Your answer</div>

      {locked ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span className="pill">
            <span className="muted">Result</span> <span className="kbd">{status?.last_is_correct ? 'Correct' : 'Incorrect'}</span>
          </span>

          {!status?.last_is_correct && correctText ? (
            <span className="pill">
              <span className="muted">Correct answer</span> <span className="kbd">{formatCorrectText(correctText)?.join(' or ')}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <textarea
        className="input"
        value={responseText}
        onChange={(e) => setResponseText(e.target.value)}
        placeholder="Type your answer…"
        rows={4}
        disabled={locked}
        style={{ marginTop: 10 }}
      />

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={submitAttempt} disabled={locked || !responseText.trim()}>
          Submit
        </button>

        {locked && (version?.rationale_html || version?.explanation_html) ? (
          <button className="btn secondary" onClick={() => setShowExplanation((s) => !s)}>
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        ) : null}
      </div>
    </>
  );

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
      let nextW = dragRef.current.startW + dx;
      nextW = Math.max(MIN_CALC_W, Math.min(MAX_CALC_W, nextW));
      dragRef.current.pendingW = nextW;
      if (shellRef.current) shellRef.current.style.setProperty('--calcW', `${nextW}px`);
    };

    const onUp = () => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setCalcWidth(dragRef.current.pendingW);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const MathShell = ({ children }) => (
    <div
      ref={shellRef}
      className="mathShell"
      style={{
        '--calcW': `${calcMinimized ? MINIMIZED_W : calcWidth}px`,
      }}
    >
      <aside className={`mathCalc ${calcMinimized ? 'min' : ''}`} aria-label="Calculator panel">
        <div className="calcHeader">
          <div className="muted small">{calcMinimized ? 'Calc' : 'Desmos Calculator'}</div>
        </div>

        {/* keep mounted; hide visually (no height:0) */}
        <div className={`calcBody ${calcMinimized ? 'hidden' : ''}`}>
          <DesmosPanel
            isOpen={!calcMinimized}
            storageKey={questionId ? `desmos:${questionId}` : null}
            desmosApiKey={process.env.NEXT_PUBLIC_DESMOS_API_KEY || 'bac289385bcd4778a682276b95f5f116'}
          />
        </div>
      </aside>

      {!calcMinimized ? (
        <div
          className="mathDivider"
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={onDividerPointerDown}
          title="Drag to resize calculator"
        />
      ) : (
        <div className="mathDivider min" aria-hidden="true" />
      )}

      <main className="mathRight">{children}</main>
    </div>
  );

  if (loading) {
    return (
      <main className="container">
        <div className="muted">Loading…</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="container">
        <div className="muted">No question data found.</div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="h2">Practice</div>

          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link className="btn secondary" href="/practice">
              ← Back to list
            </Link>

            {/* (unchanged) Question Map trigger stays where it is */}
            <button type="button" className="qmapTrigger" disabled={!inSessionContext}>
              <span className="qmapTriggerCount">…</span>
              <span className="qmapTriggerChevron" aria-hidden="true">
                ▾
              </span>
            </button>
          </div>
        </div>

        {/* ✅ consolidated Mark button at top (only mark UI change) */}
        <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn secondary"
            onClick={toggleMarkForReview}
            aria-pressed={Boolean(status?.marked_for_review)}
            title={status?.marked_for_review ? 'Marked for Review' : 'Mark for Review'}
          >
            {status?.marked_for_review ? 'Marked for Review' : 'Mark for Review'}
          </button>

          {headerPills.map((p) => (
            <span key={p.label} className="pill">
              <span className="muted">{p.label}</span> <span className="kbd">{p.value}</span>
            </span>
          ))}
        </div>
      </div>

      <Toast kind={msg?.kind} message={msg?.text} />

      <hr />

      {qType === 'mcq' ? (
        useTwoColReading ? (
          <div className="qaTwoCol">
            <div className="qaLeft">
              <PromptBlocks compactLabels={true} mbWhenNotCompact={12} />
            </div>
            <div className="qaRight">
              <McqOptionsArea showAnswerHeader={false} />
            </div>
          </div>
        ) : isMath ? (
          <MathShell>
            <MathToolRow />
            <PromptBlocks compactLabels={false} hideQuestionLabel={true} mbWhenNotCompact={12} />
            <McqOptionsArea showAnswerHeader={false} />
          </MathShell>
        ) : (
          <div>
            <PromptBlocks compactLabels={false} mbWhenNotCompact={12} />
            <McqOptionsArea showAnswerHeader={true} />
          </div>
        )
      ) : isMath ? (
        <MathShell>
          <MathToolRow />
          <PromptBlocks compactLabels={false} hideQuestionLabel={true} mbWhenNotCompact={12} />
          <SprAnswerArea />
        </MathShell>
      ) : (
        <div>
          <PromptBlocks compactLabels={false} mbWhenNotCompact={12} />
          <SprAnswerArea />
        </div>
      )}

      {(version?.rationale_html || version?.explanation_html) && locked && showExplanation ? (
        <>
          <hr />
          <div className="card explanation" style={{ marginTop: 10 }}>
            <div className="sectionLabel">Explanation</div>
            <HtmlBlock className="prose" html={version.rationale_html || version.explanation_html} />
          </div>
        </>
      ) : null}

      {/* ✅ Reference Sheet Modal: PDF.js render + fallback */}
      {showRef ? (
        <div className="modalOverlay" onClick={() => setShowRef(false)} role="dialog" aria-modal="true">
          <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, 96vw)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div className="h2" style={{ margin: 0 }}>
                SAT Math Reference Sheet
              </div>
              <div className="btnRow">
                <a className="btn secondary" href="/math_reference_sheet.pdf" target="_blank" rel="noreferrer noopener">
                  Open
                </a>
                <button className="btn secondary" onClick={() => setShowRef(false)}>
                  Close
                </button>
              </div>
            </div>

            <hr />

            <div
              style={{
                height: '75vh',
                overflow: 'auto',
                borderRadius: 12,
                border: '1px solid var(--border)',
                padding: 12,
              }}
            >
              <PdfJsSheet url="/math_reference_sheet.pdf" />
              <div style={{ marginTop: 10 }} className="muted">
                If the preview doesn’t load, use “Open” above.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .mathShell {
          display: grid;
          gap: 0;
          align-items: stretch;
          grid-template-columns: var(--calcW, ${DEFAULT_CALC_W}px) 12px minmax(0, 1fr);
        }

        .mathCalc {
          position: sticky;
          top: 14px;
          align-self: start;
          min-width: 0;
        }

        .calcHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 2px 10px;
        }

        .calcBody.hidden {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        .desmosHost {
          width: 100%;
          height: min(560px, calc(100vh - 220px));
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
        }

        .mathDivider {
          cursor: col-resize;
          position: relative;
        }
        .mathDivider::before {
          content: '';
          position: absolute;
          inset: 0;
          margin: 0 auto;
          width: 1px;
          background: var(--border);
        }

        .mathRight {
          min-width: 0;
          padding-left: 22px;
        }

        @media (max-width: 920px) {
          .mathShell {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .mathDivider {
            display: none;
          }
          .mathCalc {
            position: relative;
            top: auto;
          }
          .desmosHost {
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
