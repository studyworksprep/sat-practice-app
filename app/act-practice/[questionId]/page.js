'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import HtmlBlock from '../../../components/HtmlBlock';
import DesmosStateButton from '../../../components/DesmosStateButton';
import { useTestType } from '../../../lib/TestTypeContext';

const htmlHasContent = (html) => {
  if (!html) return false;
  if (/<img\s/i.test(html)) return true;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
};

const SECTION_LABELS = { english: 'English', math: 'Math', reading: 'Reading', science: 'Science' };
const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

/**
 * Desmos panel — identical to the SAT version.
 * Creates a single GraphingCalculator instance, persists state in localStorage.
 */
function DesmosPanel({ isOpen, storageKey, calcInstanceRef }) {
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
    if (!ready || !hostRef.current || !window.Desmos) return;
    if (!calcRef.current) {
      calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
        autosize: true, keypad: true, expressions: true, settingsMenu: true,
        zoomButtons: true, forceEnableGeometryFunctions: true, degreeMode: true,
        clearIntoDegreeMode: true, images: false, folders: false, notes: false,
        links: false, restrictedFunctions: false,
      });
      restoreState();
      safeResize();
      if (calcInstanceRef) calcInstanceRef.current = calcRef.current;
    }
    return () => {
      saveState();
      if (calcInstanceRef) calcInstanceRef.current = null;
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
    if (!ready || !hostRef.current || !calcRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;
    try { roRef.current?.disconnect?.(); } catch {}
    roRef.current = new ResizeObserver(() => safeResize());
    roRef.current.observe(hostRef.current);
    return () => { try { roRef.current?.disconnect?.(); } catch {} roRef.current = null; };
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

export default function ActQuestionDetailPage() {
  const { questionId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { testType } = useTestType();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [gotCorrect, setGotCorrect] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [wrongOptionIds, setWrongOptionIds] = useState([]);
  const [showRationale, setShowRationale] = useState(false);
  const startedAtRef = useRef(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef(null);

  // Broken / correction state
  const [userRole, setUserRole] = useState(null);
  const [showCorrectModal, setShowCorrectModal] = useState(false);
  const [correctForm, setCorrectForm] = useState({});
  const [correctSubmitting, setCorrectSubmitting] = useState(false);
  const [filterData, setFilterData] = useState(null);

  // Calculator state
  const MIN_CALC_W = 550;
  const MAX_CALC_W = 1200;
  const [calcMinimized, setCalcMinimized] = useState(false);
  const [calcWidth, setCalcWidth] = useState(MIN_CALC_W);
  const calcInstanceRef = useRef(null);
  const shellRef = useRef(null);
  const liveWidthRef = useRef(MIN_CALC_W);
  const dragRef = useRef({ dragging: false, startX: 0, startW: MIN_CALC_W, pendingW: MIN_CALC_W });

  // Session nav params
  const sid = searchParams.get('sid');
  const totalFromUrl = parseInt(searchParams.get('t') || '0', 10);
  const indexFromUrl = parseInt(searchParams.get('i') || '0', 10);

  // Redirect to SAT practice if user switches
  useEffect(() => {
    if (testType === 'sat') router.replace('/practice');
  }, [testType, router]);

  // Fetch user role
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.role) setUserRole(d.role); })
      .catch(() => {});
  }, []);

  // Lazy-load filter data when correction modal opens
  useEffect(() => {
    if (!showCorrectModal || filterData) return;
    fetch('/api/act/filters')
      .then(r => r.json())
      .then(d => setFilterData(d))
      .catch(() => {});
  }, [showCorrectModal]);

  // Fetch question
  useEffect(() => {
    if (!questionId) return;
    setLoading(true);
    setMsg(null);
    setSelected(null);
    setGotCorrect(false);
    setGaveUp(false);
    setWrongOptionIds([]);
    setShowRationale(false);
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    fetch(`/api/act/questions/${questionId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
        if (json.status?.is_done) {
          setGotCorrect(json.status.last_is_correct);
          if (json.status.last_selected_option_id) setSelected(json.status.last_selected_option_id);
        }
      })
      .catch(e => setMsg({ kind: 'danger', text: e.message }))
      .finally(() => setLoading(false));
  }, [questionId]);

  // Timer
  useEffect(() => {
    if (!questionId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [questionId]);

  useEffect(() => {
    if ((gotCorrect || gaveUp) && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [gotCorrect, gaveUp]);

  // Calculator state persistence
  useEffect(() => {
    try {
      const savedMin = localStorage.getItem('actCalcMinimized');
      if (savedMin === '1') setCalcMinimized(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!questionId) return;
    const resetW = MIN_CALC_W;
    setCalcWidth(resetW);
    liveWidthRef.current = resetW;
    dragRef.current.pendingW = resetW;
    shellRef.current?.style.setProperty('--calcW', `${resetW}px`);
  }, [questionId]);

  useEffect(() => {
    try { localStorage.setItem('actCalcMinimized', calcMinimized ? '1' : '0'); } catch {}
  }, [calcMinimized]);

  useEffect(() => {
    liveWidthRef.current = calcWidth;
  }, [calcWidth]);

  // Divider drag handler
  function onDividerPointerDown(e) {
    if (calcMinimized) return;
    e.preventDefault();
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startW = liveWidthRef.current;
    dragRef.current.pendingW = liveWidthRef.current;

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

  // Session navigation
  function getSessionIds() {
    if (!sid) return null;
    const raw = localStorage.getItem(`act_session_${sid}`);
    return raw ? raw.split(',') : null;
  }

  function navigateTo(targetId, targetIndex) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('i', String(targetIndex));
    router.push(`/act-practice/${encodeURIComponent(targetId)}?${qs.toString()}`);
  }

  const sessionIds = getSessionIds();
  const currentIdx = sessionIds ? sessionIds.indexOf(questionId) : -1;
  const hasPrev = currentIdx > 0;
  const hasNext = sessionIds && currentIdx >= 0 && currentIdx < sessionIds.length - 1;

  function goPrev() {
    if (!hasPrev) return;
    navigateTo(sessionIds[currentIdx - 1], indexFromUrl - 1);
  }
  function goNext() {
    if (!hasNext) return;
    navigateTo(sessionIds[currentIdx + 1], indexFromUrl + 1);
  }

  // Submit answer
  async function handleSubmit() {
    if (!selected || !data?.question_id) return;

    if (data.status?.is_done || wrongOptionIds.length > 0) {
      const correctId = data.correct_option_id;
      if (correctId && String(selected) === String(correctId)) {
        setGotCorrect(true);
      } else {
        setWrongOptionIds(prev => prev.includes(selected) ? prev : [...prev, selected]);
      }
      return;
    }

    setSubmitting(true);
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    try {
      const res = await fetch('/api/act/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: data.question_id,
          selected_option_id: selected,
          time_spent_ms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit');

      setData(prev => ({
        ...prev,
        correct_option_id: json.correct_option_id,
        status: { is_done: true, last_is_correct: json.is_correct, last_selected_option_id: selected },
        options: (prev?.options || []).map(o => ({
          ...o,
          is_correct: o.id === json.correct_option_id,
        })),
      }));

      if (json.is_correct) {
        setGotCorrect(true);
      } else {
        setWrongOptionIds(prev => [...prev, selected]);
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleGiveUp() {
    setGaveUp(true);
    setShowRationale(true);
  }

  // Broken / correction flow
  const isPrivileged = userRole === 'admin' || userRole === 'manager';
  const canSeeBroken = isPrivileged || userRole === 'teacher';

  function openBrokenFlow() {
    if (!data?.question_id) return;
    if (isPrivileged) {
      const opts = {};
      if (Array.isArray(data?.options)) {
        for (const opt of data.options) opts[String(opt.id)] = opt.content_html || '';
      }
      setCorrectForm({
        stimulus_html: data?.stimulus_html || '',
        stem_html: data?.stem_html || '',
        rationale_html: data?.rationale_html || '',
        options: opts,
        difficulty: data?.difficulty ?? '',
        section: data?.section || '',
        category_code: data?.category_code || '',
        category: data?.category || '',
        subcategory_code: data?.subcategory_code || '',
        subcategory: data?.subcategory || '',
        is_modeling: data?.is_modeling || false,
      });
      setShowCorrectModal(true);
    }
  }

  async function submitCorrection(flagBroken) {
    if (!data?.question_id) return;
    setCorrectSubmitting(true);
    try {
      setMsg(null);
      const body = { flag_broken: flagBroken };

      if (correctForm.stimulus_html !== (data?.stimulus_html || '')) body.stimulus_html = correctForm.stimulus_html;
      if (correctForm.stem_html !== (data?.stem_html || '')) body.stem_html = correctForm.stem_html;
      if (correctForm.rationale_html !== (data?.rationale_html || '')) body.rationale_html = correctForm.rationale_html;

      const changedOpts = {};
      if (correctForm.options && Array.isArray(data?.options)) {
        for (const opt of data.options) {
          const newVal = correctForm.options[String(opt.id)];
          if (newVal !== undefined && newVal !== (opt.content_html || '')) changedOpts[String(opt.id)] = newVal;
        }
      }
      if (Object.keys(changedOpts).length > 0) body.options = changedOpts;

      const taxChanges = {};
      if (String(correctForm.difficulty) !== String(data?.difficulty ?? '')) taxChanges.difficulty = correctForm.difficulty;
      if (correctForm.section !== (data?.section || '')) taxChanges.section = correctForm.section;
      if (correctForm.category_code !== (data?.category_code || '')) {
        taxChanges.category_code = correctForm.category_code;
        taxChanges.category = correctForm.category || null;
      }
      if (correctForm.subcategory_code !== (data?.subcategory_code || '')) {
        taxChanges.subcategory_code = correctForm.subcategory_code;
        taxChanges.subcategory = correctForm.subcategory || null;
      }
      if (correctForm.is_modeling !== (data?.is_modeling || false)) taxChanges.is_modeling = correctForm.is_modeling;
      if (Object.keys(taxChanges).length > 0) body.taxonomy = taxChanges;

      const res = await fetch(`/api/act/questions/${data.question_id}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit correction');

      setShowCorrectModal(false);
      // Reload question
      const reloadRes = await fetch(`/api/act/questions/${questionId}`, { cache: 'no-store' });
      const reloadJson = await reloadRes.json();
      if (!reloadJson.error) setData(reloadJson);
      setMsg({ kind: 'success', text: flagBroken ? 'Saved and flagged as broken.' : 'Saved and marked as not broken.' });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setCorrectSubmitting(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const locked = gotCorrect || gaveUp;
      if (e.key === 'ArrowLeft' && hasPrev) goPrev();
      if (e.key === 'ArrowRight' && hasNext) goNext();
      if (e.key === 'Enter' && !locked && selected) handleSubmit();
      if (['a', 'b', 'c', 'd', 'e'].includes(e.key.toLowerCase()) && !locked) {
        const options = data?.options || [];
        const idx = e.key.toLowerCase().charCodeAt(0) - 97;
        if (idx < options.length) setSelected(options[idx].id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const formatElapsed = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (loading) return <main className="container"><div className="muted" style={{ marginTop: 40 }}>Loading...</div></main>;

  const options = data?.options || [];
  const locked = gotCorrect || gaveUp;
  const correctOptionId = data?.correct_option_id || null;
  const isMath = data?.section === 'math';
  const hasStimulusContent = htmlHasContent(data?.stimulus_html);
  // Reading/English/Science with stimulus = two-col layout; Math = calc + question
  const useTwoCol = hasStimulusContent && !isMath;

  // Question content JSX (shared between math and non-math layouts)
  const questionContent = (
    <div className="card" style={{ padding: 20 }}>
      {/* Taxonomy breadcrumb */}
      <div className="muted small" style={{ marginBottom: 8 }}>
        {data?.category || ''}
        {data?.subcategory ? ` > ${data.subcategory}` : ''}
        {data?.external_id ? ` · ${data.external_id}` : ''}
        {data?.is_modeling && <span style={{ marginLeft: 8, color: '#92400e', fontWeight: 600 }}>Modeling</span>}
      </div>

      {/* Stimulus (inline for math, since we use the calc for the second column) */}
      {isMath && hasStimulusContent && (
        <div style={{ marginBottom: 16 }}>
          <HtmlBlock className="prose" html={data.stimulus_html} />
        </div>
      )}

      {/* Stem */}
      <div style={{ marginBottom: 16 }}>
        <HtmlBlock className="prose" html={data?.stem_html} />
      </div>

      {/* Options */}
      <div style={{ display: 'grid', gap: 8 }}>
        {options.map((opt) => {
          const isSelected = String(selected) === String(opt.id);
          const isWrong = wrongOptionIds.includes(opt.id);
          const isCorrect = locked && correctOptionId && String(opt.id) === String(correctOptionId);

          let cls = 'option';
          if (isSelected) cls += ' selected';
          if (isWrong) cls += ' incorrect';
          if (locked) {
            if (isCorrect && (isSelected || gaveUp || gotCorrect)) cls += ' correct';
            if (!isSelected && isCorrect && (gaveUp || gotCorrect)) cls += ' revealCorrect';
          }

          return (
            <div
              key={opt.id}
              className={cls}
              onClick={() => { if (!locked && !isWrong) setSelected(opt.id); }}
              style={{ cursor: locked || isWrong ? 'default' : 'pointer' }}
            >
              <div className="optionBadge">{opt.label}</div>
              <div className="optionContent"><HtmlBlock className="prose" html={opt.content_html} /></div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        {!locked && (
          <>
            <button
              className="btn"
              disabled={!selected || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting...' : wrongOptionIds.length > 0 ? 'Retry' : 'Submit'}
            </button>
            <button className="btn secondary" onClick={handleGiveUp}>
              Give Up
            </button>
          </>
        )}
        {locked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {gotCorrect && <span style={{ color: 'var(--green)', fontWeight: 600 }}>Correct!</span>}
            {gaveUp && <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Answer revealed</span>}
            {hasNext && (
              <button className="btn" onClick={goNext}>Next Question</button>
            )}
          </div>
        )}
      </div>

      {/* Rationale */}
      {locked && htmlHasContent(data?.rationale_html) && (
        <div style={{ marginTop: 16 }}>
          <button
            className="btn secondary"
            style={{ fontSize: 12, marginBottom: 8 }}
            onClick={() => setShowRationale(r => !r)}
          >
            {showRationale ? 'Hide Explanation' : 'Show Explanation'}
          </button>
          {showRationale && (
            <div className="card" style={{ padding: 16, background: 'var(--bg)' }}>
              <HtmlBlock html={data.rationale_html} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Math layout: calculator left, question right (matches SAT pattern)
  const mathShellJsx = (rightContent) => (
    <div
      ref={shellRef}
      className={`mathShell ${calcMinimized ? 'min' : 'withCalc'}`}
      style={{ '--calcW': `${calcMinimized ? 0 : calcWidth}px` }}
    >
      <aside className={`mathLeft ${calcMinimized ? 'min' : ''}`} aria-label="Calculator panel">
        <div className="mathLeftHeader">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="mathToolTitle">{calcMinimized ? 'Calc' : 'Calculator'}</div>
            {!calcMinimized && (
              <DesmosStateButton
                questionId={questionId}
                getCalcState={() => { try { return calcInstanceRef.current?.getState?.(); } catch { return null; } }}
                setCalcState={(st) => { try { calcInstanceRef.current?.setState?.(st, { allowUndo: false }); } catch {} }}
              />
            )}
          </div>
          <button type="button" className="btn secondary" onClick={() => setCalcMinimized(m => !m)}>
            {calcMinimized ? 'Expand' : 'Minimize'}
          </button>
        </div>
        <div className={`calcBody ${calcMinimized ? 'hidden' : ''}`}>
          <DesmosPanel isOpen={!calcMinimized} storageKey={questionId ? `desmos:act:${questionId}` : 'desmos:act:unknown'} calcInstanceRef={calcInstanceRef} />
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

  return (
    <main className="container containerWide">
      {msg && <Toast kind={msg?.kind} message={msg?.text} />}

      {/* Top bar */}
      <div className="card" style={{ padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/act-practice" className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }}>
            Back
          </Link>
          {sid && totalFromUrl > 0 && (
            <span className="muted small">
              Question {indexFromUrl} of {totalFromUrl}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="pill">{SECTION_LABELS[data?.section] || data?.section}</span>
          {data?.difficulty != null && (
            <span className="pill">{DIFF_LABEL[data.difficulty] || `D${data.difficulty}`}</span>
          )}
          <span className="muted small">{formatElapsed(elapsedMs)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canSeeBroken && (
            <button
              type="button"
              className={`brokenBtn${data?.is_broken ? ' isBroken' : ''}`}
              onClick={openBrokenFlow}
              title={data?.is_broken ? 'Flagged as broken' : 'Flag as broken'}
            >
              <span className="brokenBtnIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path fill="currentColor" d="M5 3v18M5 3h14l-4 6 4 6H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </span>
              {data?.is_broken ? 'Broken' : 'Broken?'}
            </button>
          )}
          <button className="btn secondary" disabled={!hasPrev} onClick={goPrev}>Prev</button>
          <button className="btn secondary" disabled={!hasNext} onClick={goNext}>Next</button>
        </div>
      </div>

      {/* Main content area */}
      {isMath ? (
        // Math: calculator + question in mathShell
        mathShellJsx(questionContent)
      ) : useTwoCol ? (
        // Reading/English/Science with stimulus: two-column layout
        <div className="qaTwoCol">
          <div className="qaLeft">
            <div className="card subcard">
              <HtmlBlock className="prose" html={data.stimulus_html} />
            </div>
          </div>
          <div className="qaDivider" aria-hidden="true" />
          <div className="qaRight">
            {questionContent}
          </div>
        </div>
      ) : (
        // Default single-column
        questionContent
      )}

      {/* Correction modal */}
      {showCorrectModal && (
        <div className="modalOverlay" onClick={() => setShowCorrectModal(false)} role="dialog" aria-modal="true" aria-label="Correction form">
          <div className="modalCard correctModal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h2" style={{ margin: 0 }}>Flag &amp; Correct Question</div>
              <button className="btn secondary" onClick={() => setShowCorrectModal(false)}>Close</button>
            </div>

            {data?.is_broken && (
              <div style={{ background: 'rgba(217,119,117,0.10)', border: '1px solid var(--danger, #dc2626)', borderRadius: 8, padding: '10px 14px', marginTop: 4, fontSize: 14, color: 'var(--danger, #dc2626)' }}>
                Currently flagged as <strong>broken</strong>
              </div>
            )}

            <hr />

            <div className="correctFields">
              <label className="correctLabel">
                <span className="correctLabelText">Stimulus</span>
                <textarea
                  className="input correctTextarea"
                  rows={5}
                  value={correctForm.stimulus_html || ''}
                  onChange={(e) => setCorrectForm(f => ({ ...f, stimulus_html: e.target.value }))}
                  placeholder="Paste corrected stimulus HTML..."
                />
              </label>

              <label className="correctLabel">
                <span className="correctLabelText">Stem</span>
                <textarea
                  className="input correctTextarea"
                  rows={4}
                  value={correctForm.stem_html || ''}
                  onChange={(e) => setCorrectForm(f => ({ ...f, stem_html: e.target.value }))}
                  placeholder="Paste corrected stem HTML..."
                />
              </label>

              {Array.isArray(data?.options) && data.options.length > 0 && (
                data.options
                  .slice()
                  .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
                  .map((opt) => (
                    <label key={opt.id} className="correctLabel">
                      <span className="correctLabelText">Answer Option {opt.label}</span>
                      <textarea
                        className="input correctTextarea"
                        rows={3}
                        value={correctForm.options?.[String(opt.id)] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCorrectForm(f => ({ ...f, options: { ...(f.options || {}), [String(opt.id)]: val } }));
                        }}
                        placeholder={`Paste corrected Option ${opt.label} HTML...`}
                      />
                    </label>
                  ))
              )}

              <label className="correctLabel">
                <span className="correctLabelText">Rationale / Explanation</span>
                <textarea
                  className="input correctTextarea"
                  rows={4}
                  value={correctForm.rationale_html || ''}
                  onChange={(e) => setCorrectForm(f => ({ ...f, rationale_html: e.target.value }))}
                  placeholder="Paste corrected rationale HTML..."
                />
              </label>
            </div>

            <hr />
            <div className="correctFields">
              <div className="h3" style={{ margin: '0 0 8px' }}>Taxonomy</div>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                  <span className="correctLabelText">Section</span>
                  <select
                    className="input"
                    value={correctForm.section || ''}
                    onChange={(e) => setCorrectForm(f => ({ ...f, section: e.target.value }))}
                  >
                    <option value="">--</option>
                    <option value="english">English</option>
                    <option value="math">Math</option>
                    <option value="reading">Reading</option>
                    <option value="science">Science</option>
                  </select>
                </label>
                <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                  <span className="correctLabelText">Difficulty</span>
                  <select
                    className="input"
                    value={correctForm.difficulty ?? ''}
                    onChange={(e) => setCorrectForm(f => ({ ...f, difficulty: e.target.value ? Number(e.target.value) : '' }))}
                  >
                    <option value="">--</option>
                    <option value="1">1 - Easy</option>
                    <option value="2">2 - Medium</option>
                    <option value="3">3 - Hard</option>
                  </select>
                </label>
                <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                  <span className="correctLabelText">Modeling</span>
                  <select
                    className="input"
                    value={correctForm.is_modeling ? 'true' : 'false'}
                    onChange={(e) => setCorrectForm(f => ({ ...f, is_modeling: e.target.value === 'true' }))}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
              </div>

              {/* Category / Subcategory dropdowns from filter data */}
              {filterData?.categories ? (() => {
                const sec = correctForm.section || data?.section;
                const cats = filterData.categories[sec] || [];
                const selectedCat = cats.find(c => (c.category_code || c.category) === correctForm.category_code);
                const subs = selectedCat?.subcategories || [];
                return (
                  <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                    <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                      <span className="correctLabelText">Category</span>
                      <select
                        className="input"
                        value={correctForm.category_code || ''}
                        onChange={(e) => {
                          const cat = cats.find(c => (c.category_code || c.category) === e.target.value);
                          setCorrectForm(f => ({
                            ...f,
                            category_code: e.target.value,
                            category: cat?.category || '',
                            subcategory_code: '',
                            subcategory: '',
                          }));
                        }}
                      >
                        <option value="">--</option>
                        {cats.map(c => (
                          <option key={c.category_code || c.category} value={c.category_code || c.category}>
                            {c.category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                      <span className="correctLabelText">Subcategory</span>
                      <select
                        className="input"
                        value={correctForm.subcategory_code || ''}
                        onChange={(e) => {
                          const sub = subs.find(s => (s.subcategory_code || s.subcategory) === e.target.value);
                          setCorrectForm(f => ({
                            ...f,
                            subcategory_code: e.target.value,
                            subcategory: sub?.subcategory || '',
                          }));
                        }}
                      >
                        <option value="">--</option>
                        {subs.map(s => (
                          <option key={s.subcategory_code || s.subcategory} value={s.subcategory_code || s.subcategory}>
                            {s.subcategory}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })() : <p className="muted small">Loading taxonomy options...</p>}
            </div>

            <div className="row" style={{ gap: 10, marginTop: 16, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={() => setShowCorrectModal(false)} disabled={correctSubmitting}>
                Cancel
              </button>
              <button className="btn primary" style={{ background: 'var(--color-success, #22c55e)' }} onClick={() => submitCorrection(false)} disabled={correctSubmitting}>
                {correctSubmitting ? 'Saving...' : 'Mark Not Broken & Save'}
              </button>
              <button className="btn primary" onClick={() => submitCorrection(true)} disabled={correctSubmitting}>
                {correctSubmitting ? 'Saving...' : 'Flag as Broken & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
