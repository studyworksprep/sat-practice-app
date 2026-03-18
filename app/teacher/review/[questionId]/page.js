'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import HtmlBlock from '../../../../components/HtmlBlock';

const htmlHasContent = (html) => {
  if (!html) return false;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
};

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

const DIFF_CLASS = { 1: 'diffEasy', 2: 'diffMed', 3: 'diffHard' };

export default function TeacherReviewPage() {
  const { questionId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const studentId = searchParams.get('studentId');
  const sid = searchParams.get('sid');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [total, setTotal] = useState(null);
  const [index1, setIndex1] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  // Read session IDs from localStorage
  function getSessionIds() {
    if (!sid) return null;
    try {
      const raw = localStorage.getItem(`teacher_review_session_${sid}`);
      if (raw) {
        const ids = raw.split(',').filter(Boolean);
        if (ids.length > 0) return ids;
      }
    } catch {}
    return null;
  }

  // Read session metadata from localStorage
  function getSessionMeta() {
    if (!sid) return null;
    try {
      const raw = localStorage.getItem(`teacher_review_meta_${sid}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  useEffect(() => {
    const t = Number(searchParams.get('t'));
    const i = Number(searchParams.get('i'));
    if (Number.isFinite(t) && t >= 0) setTotal(t);
    if (Number.isFinite(i) && i >= 1) setIndex1(i);
  }, [searchParams]);

  useEffect(() => {
    if (!questionId || !studentId) return;
    setLoading(true);
    setError(null);
    setShowAnswer(false);
    fetch(`/api/teacher/student/${studentId}/question/${questionId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [questionId, studentId]);

  // Ensure total from session
  useEffect(() => {
    if (total != null) return;
    const ids = getSessionIds();
    if (ids) setTotal(ids.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  // Close map on Escape
  useEffect(() => {
    if (!showMap) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowMap(false);
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showMap]);

  function buildHref(targetId, targetIndex) {
    const qs = new URLSearchParams();
    qs.set('studentId', studentId);
    if (sid) qs.set('sid', sid);
    const t = total ?? (Number(searchParams.get('t')) || 0);
    qs.set('t', String(t));
    qs.set('i', String(targetIndex));
    return `/teacher/review/${targetId}?${qs.toString()}`;
  }

  function goToIndex(targetIndex1) {
    const ids = getSessionIds();
    if (!ids) return;
    const idx = targetIndex1 - 1;
    if (idx < 0 || idx >= ids.length) return;
    router.push(buildHref(ids[idx], targetIndex1));
  }

  const prevDisabled = !index1 || index1 <= 1;
  const nextDisabled = !index1 || !total || index1 >= total;

  const qType = String(data?.version?.question_type || '').toLowerCase();
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  const correctOptionId = data?.correct_option_id || null;
  const correctText = data?.correct_text || null;
  const studentAttempt = data?.student_attempt || null;

  // Determine what the student selected
  const studentSelectedOptionId =
    studentAttempt?.selected_option_id ||
    status?.status_json?.last_selected_option_id ||
    null;
  const studentResponseText =
    studentAttempt?.response_text ||
    status?.status_json?.last_response_text ||
    '';
  const studentIsCorrect = studentAttempt?.is_correct ?? status?.last_is_correct ?? null;

  const domainCode = String(data?.taxonomy?.domain_code || '').toUpperCase().trim();
  const useTwoColReading = qType === 'mcq' && ['EOI', 'INI', 'CAS', 'SEC'].includes(domainCode);

  if (loading) {
    return (
      <main className="container" style={{ paddingTop: 40 }}>
        <p className="muted">Loading question...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container" style={{ paddingTop: 40 }}>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <Link className="btn secondary" href="/teacher">Go Back</Link>
      </main>
    );
  }

  if (!data) return null;

  const PromptBlocks = ({ mb = 12 }) => (
    <>
      {htmlHasContent(version?.stimulus_html) ? (
        <div className="card subcard" style={{ marginBottom: mb }}>
          <HtmlBlock className="prose" html={version.stimulus_html} />
        </div>
      ) : null}
      {version?.stem_html ? (
        <div className="card subcard" style={{ marginBottom: mb }}>
          <HtmlBlock className="prose" html={version.stem_html} />
        </div>
      ) : null}
    </>
  );

  const ResultBadge = () => {
    if (studentIsCorrect === null) return null;
    return (
      <span
        className="pill"
        style={{
          background: studentIsCorrect ? 'var(--success)' : 'var(--danger)',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        {studentIsCorrect ? 'Correct' : 'Incorrect'}
      </span>
    );
  };

  const McqOptions = () => (
    <div className="optionList">
      {options
        .slice()
        .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .map((opt) => {
          const isStudentSelected = String(opt.id) === String(studentSelectedOptionId);
          const isCorrect = String(opt.id) === String(correctOptionId);

          let cls = 'option';
          if (showAnswer) {
            if (isStudentSelected) cls += ' selected';
            if (isStudentSelected && isCorrect) cls += ' correct';
            if (isStudentSelected && !isCorrect) cls += ' incorrect';
            if (!isStudentSelected && isCorrect) cls += ' revealCorrect';
          }

          return (
            <div
              key={opt.id}
              className={cls}
              style={{ cursor: 'default' }}
            >
              <div className="optionBadge">{opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0))}</div>
              <div className="optionContent">
                <HtmlBlock className="prose" html={opt.content_html} />
              </div>
            </div>
          );
        })}
    </div>
  );

  const SprAnswer = () => {
    const accepted = formatCorrectText(correctText);
    return (
      <div style={{ marginTop: 8 }}>
        {studentResponseText ? (
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="pill">
              <span className="muted">Student answered</span>{' '}
              <span className="kbd">{studentResponseText}</span>
            </span>
          </div>
        ) : (
          <p className="muted small">No answer recorded.</p>
        )}
        {showAnswer && accepted && (
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill">
              <span className="muted">Correct answer</span>{' '}
              <span className="kbd">{accepted.join(' or ')}</span>
            </span>
          </div>
        )}
      </div>
    );
  };

  const NavButtons = () => (
    <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
      <button className="btn secondary" onClick={() => goToIndex(index1 - 1)} disabled={prevDisabled}>
        Prev
      </button>
      <button className="btn secondary" onClick={() => goToIndex(index1 + 1)} disabled={nextDisabled}>
        Next
      </button>
      <button
        className={`btn ${showAnswer ? 'primary' : 'secondary'}`}
        onClick={() => setShowAnswer((v) => !v)}
        title={showAnswer ? 'Hide answer and explanation' : 'Show answer and explanation'}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" style={{ verticalAlign: '-3px', marginRight: 4 }}>
          {showAnswer ? (
            <path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
          ) : (
            <path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
          )}
        </svg>
        {showAnswer ? 'Hide Answer' : 'Show Answer'}
      </button>
      <button
        className="btn secondary"
        onClick={() => setShowCalc((v) => !v)}
        title="Open calculator"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" style={{ verticalAlign: '-3px', marginRight: 4 }}>
          <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM6.25 7.72h11.5v2.5H6.25zM6.25 12h2.5v5.5h-2.5zm4.25 0h2.5v5.5h-2.5zm4.25 0h2.5v5.5h-2.5z" />
        </svg>
        Calculator
      </button>
      <Link className="btn secondary" href={studentId ? `/teacher?selected=${studentId}` : '/teacher'}>
        Back to Student Dashboard
      </Link>
    </div>
  );

  const Explanation = () => {
    if (!showAnswer || !version?.rationale_html) return null;
    return (
      <div className="card subcard" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: 'var(--muted)' }}>Explanation</div>
        <HtmlBlock className="prose" html={version.rationale_html} />
      </div>
    );
  };

  // Question map data from localStorage
  const mapMeta = getSessionMeta();
  const mapIds = getSessionIds();

  const QuestionMapModal = () => {
    if (!showMap || !mapIds) return null;
    return (
      <div
        className="modalOverlay"
        onClick={() => setShowMap(false)}
        role="dialog"
        aria-modal="true"
        aria-label="Question map"
      >
        <div className="modalCard" onClick={(e) => e.stopPropagation()}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div className="h2" style={{ margin: 0 }}>Question Map</div>
              <div className="muted small">
                {total != null ? (
                  <><span className="kbd">{total}</span> questions in this session</>
                ) : null}
              </div>
            </div>
            <button className="btn secondary" onClick={() => setShowMap(false)}>Close</button>
          </div>

          <hr />

          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
            <div className="pill">
              <span className="muted">Current</span> <span className="kbd">{index1 ?? '—'}</span>
            </div>
          </div>

          <div className="questionGrid" style={{ marginTop: 8 }}>
            {mapIds.map((id, pos) => {
              const i = pos + 1;
              const active = index1 != null && i === index1;
              const meta = mapMeta?.[pos];
              const diff = Number(meta?.difficulty);
              const diffClass = DIFF_CLASS[diff] || 'diffUnknown';
              const isCorrect = meta?.is_correct === true;
              const isIncorrect = meta?.is_correct === false;

              return (
                <button
                  key={String(id)}
                  type="button"
                  className={`mapItem ${diffClass}${active ? ' active' : ''}`}
                  onClick={() => {
                    setShowMap(false);
                    router.push(buildHref(id, i));
                  }}
                  title={meta?.skill_name || meta?.domain_name || `Go to #${i}`}
                >
                  <span className="mapNum">{i}</span>

                  {isCorrect || isIncorrect ? (
                    <span className="mapIconCorner mapIconRight" aria-hidden="true">
                      {isCorrect ? (
                        <span className="mapIconBadge correct" title="Correct">
                          <svg viewBox="0 0 24 24" width="14" height="14">
                            <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                          </svg>
                        </span>
                      ) : (
                        <span className="mapIconBadge incorrect" title="Incorrect">
                          <svg viewBox="0 0 24 24" width="14" height="14">
                            <path
                              fill="currentColor"
                              d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3 10.6 10.6 16.9 4.3z"
                            />
                          </svg>
                        </span>
                      )}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="container" style={{ maxWidth: 960, paddingTop: 24, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {index1 != null && (
            <div className="qNumBadge" aria-label={`Question ${index1}`}>
              {index1}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="pill" style={{ background: 'var(--accent)', color: '#fff', fontWeight: 600 }}>
              Teacher Review
            </span>
            {showAnswer && <ResultBadge />}
          </div>
        </div>

        {total != null && index1 != null && mapIds && (
          <button
            type="button"
            className="qmapTrigger"
            onClick={() => setShowMap(true)}
            aria-label="Open question map"
          >
            <span className="qmapTriggerCount">{index1} / {total}</span>
            <span className="qmapTriggerChevron" aria-hidden="true">&#9662;</span>
          </button>
        )}
        {total != null && index1 != null && !mapIds && (
          <span className="muted small">{index1} of {total}</span>
        )}
      </div>

      {/* Info pills */}
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {data?.taxonomy?.domain_name && (
          <span className="pill"><span className="muted">Domain</span> <span className="kbd">{data.taxonomy.domain_name}</span></span>
        )}
        {data?.taxonomy?.skill_name && (
          <span className="pill"><span className="muted">Topic</span> <span className="kbd">{data.taxonomy.skill_name}</span></span>
        )}
        {data?.taxonomy?.difficulty != null && (
          <span className="pill"><span className="muted">Difficulty</span> <span className="kbd">{data.taxonomy.difficulty}</span></span>
        )}
        {data?.taxonomy?.score_band && (
          <span className="pill"><span className="muted">Score Band</span> <span className="kbd">{data.taxonomy.score_band}</span></span>
        )}
        {data?.source_external_id && (
          <span className="pill"><span className="muted">External ID</span> <span className="kbd">{data.source_external_id}</span></span>
        )}
      </div>

      {/* Question content */}
      {useTwoColReading ? (
        <div className="twoCol">
          <div className="twoColLeft">
            {htmlHasContent(version?.stimulus_html) ? (
              <div className="card subcard">
                <HtmlBlock className="prose" html={version.stimulus_html} />
              </div>
            ) : null}
          </div>
          <div className="twoColRight">
            {version?.stem_html ? (
              <div className="card subcard" style={{ marginBottom: 12 }}>
                <HtmlBlock className="prose" html={version.stem_html} />
              </div>
            ) : null}
            {qType === 'mcq' ? <McqOptions /> : <SprAnswer />}
            <NavButtons />
            <Explanation />
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 24 }}>
          <PromptBlocks />
          {qType === 'mcq' ? <McqOptions /> : <SprAnswer />}
          <NavButtons />
          <Explanation />
        </div>
      )}

      <QuestionMapModal />
      <DesmosPopup isOpen={showCalc} onClose={() => setShowCalc(false)} />
    </main>
  );
}

/* ── Resizable Desmos Calculator Popup ── */
const DESMOS_INIT_W = 560;
const DESMOS_INIT_H = 440;
const DESMOS_MIN_W = 320;
const DESMOS_MIN_H = 280;

function DesmosPopup({ isOpen, onClose }) {
  const hostRef = useRef(null);
  const calcRef = useRef(null);
  const cardRef = useRef(null);
  const boundsRef = useRef({ left: 0, top: 0, w: DESMOS_INIT_W, h: DESMOS_INIT_H });

  const [ready, setReady] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Desmos) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !isOpen || minimized) return;
    if (!hostRef.current || calcRef.current) return;
    calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
      autosize: true, keypad: true, expressions: true,
      settingsMenu: true, zoomButtons: true, degreeMode: true,
      clearIntoDegreeMode: true, images: false, folders: false,
      notes: false, links: false, restrictedFunctions: true,
    });
    return () => {
      try { calcRef.current?.destroy?.(); } catch {}
      calcRef.current = null;
    };
  }, [ready, isOpen, minimized]);

  // Reset position/size when opened
  useEffect(() => {
    if (!isOpen) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const l = vw - DESMOS_INIT_W - 24;
    const t = vh - DESMOS_INIT_H - 24;
    boundsRef.current = { left: l, top: t, w: DESMOS_INIT_W, h: DESMOS_INIT_H };
    applyBounds();
  }, [isOpen]);

  function applyBounds() {
    const card = cardRef.current;
    if (!card) return;
    const b = boundsRef.current;
    card.style.left = b.left + 'px';
    card.style.top = b.top + 'px';
    card.style.width = b.w + 'px';
    card.style.height = b.h + 'px';
  }

  function onHeaderPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const b = boundsRef.current;
    const startX = e.clientX, startY = e.clientY;
    const origLeft = b.left, origTop = b.top;
    const onMove = (ev) => {
      b.left = origLeft + (ev.clientX - startX);
      b.top = origTop + (ev.clientY - startY);
      applyBounds();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onEdgePointerDown(e, edge) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const b = boundsRef.current;
    const startX = e.clientX, startY = e.clientY;
    const origL = b.left, origT = b.top, origW = b.w, origH = b.h;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (edge.includes('e')) { b.w = Math.max(DESMOS_MIN_W, origW + dx); }
      if (edge.includes('w')) {
        const nw = Math.max(DESMOS_MIN_W, origW - dx);
        b.left = origL + (origW - nw);
        b.w = nw;
      }
      if (edge.includes('s')) { b.h = Math.max(DESMOS_MIN_H, origH + dy); }
      if (edge.includes('n')) {
        const nh = Math.max(DESMOS_MIN_H, origH - dy);
        b.top = origT + (origH - nh);
        b.h = nh;
      }
      applyBounds();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  if (!isOpen) return null;

  const apiKey =
    (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_DESMOS_API_KEY) ||
    'bac289385bcd4778a682276b95f5f116';

  const edgeStyle = (cursor) => ({ position: 'absolute', zIndex: 2, cursor });

  return (
    <>
      <Script
        src={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${apiKey}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div
        ref={cardRef}
        style={{
          position: 'fixed',
          left: boundsRef.current.left, top: boundsRef.current.top,
          width: minimized ? 220 : boundsRef.current.w,
          height: minimized ? 'auto' : boundsRef.current.h,
          zIndex: 1000,
          display: 'flex', flexDirection: 'column',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,.28)',
          background: 'var(--bg-card, #fff)',
          border: '1px solid var(--border, #ddd)',
          overflow: 'hidden',
        }}
      >
        {/* Resize edges (only when not minimized) */}
        {!minimized && (
          <>
            <div onPointerDown={(e) => onEdgePointerDown(e, 'n')}  style={{ ...edgeStyle('ns-resize'),   top: 0, left: 6, right: 6, height: 5 }} />
            <div onPointerDown={(e) => onEdgePointerDown(e, 's')}  style={{ ...edgeStyle('ns-resize'),   bottom: 0, left: 6, right: 6, height: 5 }} />
            <div onPointerDown={(e) => onEdgePointerDown(e, 'w')}  style={{ ...edgeStyle('ew-resize'),   left: 0, top: 6, bottom: 6, width: 5 }} />
            <div onPointerDown={(e) => onEdgePointerDown(e, 'e')}  style={{ ...edgeStyle('ew-resize'),   right: 0, top: 6, bottom: 6, width: 5 }} />
            <div onPointerDown={(e) => onEdgePointerDown(e, 'nw')} style={{ ...edgeStyle('nwse-resize'), top: 0, left: 0, width: 10, height: 10 }} />
            <div onPointerDown={(e) => onEdgePointerDown(e, 'ne')} style={{ ...edgeStyle('nesw-resize'), top: 0, right: 0, width: 10, height: 10 }} />
            <div onPointerDown={(e) => onEdgePointerDown(e, 'sw')} style={{ ...edgeStyle('nesw-resize'), bottom: 0, left: 0, width: 10, height: 10 }} />
            <div onPointerDown={(e) => onEdgePointerDown(e, 'se')} style={{ ...edgeStyle('nwse-resize'), bottom: 0, right: 0, width: 10, height: 10 }} />
          </>
        )}

        {/* Title bar */}
        <div
          onPointerDown={onHeaderPointerDown}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px 6px 12px', cursor: 'grab', userSelect: 'none',
            background: 'var(--bg-subtle, #f5f5f5)',
            borderBottom: minimized ? 'none' : '1px solid var(--border, #ddd)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13 }}>Calculator</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              title={minimized ? 'Expand' : 'Minimize'}
              style={{
                width: 28, height: 28, border: 'none', borderRadius: 6,
                background: 'transparent', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'inherit',
              }}
            >
              {minimized ? (
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M4 4h16v16H4z" fillOpacity=".08" stroke="currentColor" strokeWidth="2" /><rect fill="currentColor" x="4" y="11" width="16" height="2" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16"><rect fill="currentColor" x="4" y="18" width="16" height="2" rx="1" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              style={{
                width: 28, height: 28, border: 'none', borderRadius: 6,
                background: 'transparent', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'inherit',
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18.3 5.7a1 1 0 00-1.4 0L12 10.6 7.1 5.7a1 1 0 00-1.4 1.4L10.6 12l-4.9 4.9a1 1 0 001.4 1.4L12 13.4l4.9 4.9a1 1 0 001.4-1.4L13.4 12l4.9-4.9a1 1 0 000-1.4z" /></svg>
            </button>
          </div>
        </div>
        {!minimized && (
          <div ref={hostRef} style={{ flex: 1, minHeight: 0 }} />
        )}
      </div>
    </>
  );
}
