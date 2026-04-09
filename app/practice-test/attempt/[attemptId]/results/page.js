'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import HtmlBlock from '../../../../../components/HtmlBlock';
import QuestionNotes from '../../../../../components/QuestionNotes';
import ConceptTags from '../../../../../components/ConceptTags';
import DesmosStateButton from '../../../../../components/DesmosStateButton';
import FlashcardsModal from '../../../../../components/FlashcardsModal';

const SUBJECT_LABEL = { rw: 'Reading & Writing', RW: 'Reading & Writing', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };
const SUBJECT_LABEL_FULL = { rw: 'Reading and Writing', RW: 'Reading and Writing', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };

const htmlHasContent = (html) => {
  if (!html) return false;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
};
const SUBJECT_ORDER = ['RW', 'rw', 'MATH', 'M', 'm', 'math'];
const MATH_CODES = new Set(['M', 'm', 'math', 'Math', 'MATH']);
const RW_CODES = new Set(['RW', 'rw']);

const DOMAIN_ABBREV = {
  'Craft and Structure': 'C&S',
  'Information and Ideas': 'Info',
  'Standard English Conventions': 'SEC',
  'Expression of Ideas': 'Expr',
  'Algebra': 'Alg',
  'Advanced Math': 'Adv',
  'Problem-Solving and Data Analysis': 'Data',
  'Geometry and Trigonometry': 'Geo',
};

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

function formatSprAnswer(ct) {
  if (!ct) return '';
  const t = String(ct).trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.join(' or ');
    } catch {}
  }
  return t;
}

function abbrev(name) {
  if (!name) return '';
  return DOMAIN_ABBREV[name] || name.slice(0, 4);
}

function pct(correct, total) {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

function pctColor(p) {
  if (p >= 80) return '#3b9c6e';
  if (p >= 60) return '#c9963a';
  return '#c0564a';
}

function fmtTime(ms) {
  if (!ms && ms !== 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

// ─── SVG Donut chart ──────────────────────────────────────────────────────

function DonutChart({ percentage, size = 140, strokeWidth = 14, label, sublabel }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const correctDash = (percentage / 100) * circumference;
  const incorrectDash = circumference - correctDash;
  const color = pctColor(percentage);

  return (
    <div className="ptrvDonut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e8e8e8" strokeWidth={strokeWidth} />
        {/* Incorrect portion */}
        {percentage < 100 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="#d97a6a" strokeWidth={strokeWidth}
            strokeDasharray={`${incorrectDash} ${correctDash}`}
            strokeDashoffset={correctDash}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {/* Correct portion */}
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${correctDash} ${circumference - correctDash}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
        {/* Center text */}
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle" dominantBaseline="central"
          fontSize="28" fontWeight="700" fill="var(--fg, #222)">{percentage}%</text>
        <text x={size / 2} y={size / 2 + 18} textAnchor="middle" dominantBaseline="central"
          fontSize="11" fill="var(--muted, #888)">Accuracy</text>
      </svg>
    </div>
  );
}

// ─── Score ring (large) ───────────────────────────────────────────────────

function ScoreRing({ score, max = 1600, label }) {
  const p = Math.min(score / max, 1);
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = p * circumference;

  return (
    <div className="ptrvScoreRing">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e8e8e8" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="var(--accent)" strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
        <text x={size / 2} y={size / 2 - 8} textAnchor="middle" dominantBaseline="central"
          fontSize="40" fontWeight="800" fill="var(--accent)">{score}</text>
        <text x={size / 2} y={size / 2 + 22} textAnchor="middle" dominantBaseline="central"
          fontSize="12" fill="var(--muted, #888)">{label}</text>
      </svg>
    </div>
  );
}

// ─── Domain analytics card ────────────────────────────────────────────────

function DomainAnalyticsCard({ title, subtitle, domains }) {
  const [expandedDomain, setExpandedDomain] = useState(null);
  if (!domains?.length) return null;
  return (
    <div className="card ptrvDomainCard">
      <h3 className="ptrvDomainCardTitle">{title}</h3>
      <p className="ptrvDomainCardSub">{subtitle}</p>
      <div className="ptrvDomainBars">
        {domains.map((d) => {
          const p = pct(d.correct, d.total);
          const color = pctColor(p);
          const isExpanded = expandedDomain === d.domain_name;
          const hasSkills = d.skills?.length > 0;
          return (
            <div key={d.domain_name} className="ptrvDomainBarItem">
              <div className="ptrvDomainBarHeader">
                <span className="ptrvDomainBarName">{d.domain_name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="ptrvDomainBarPct" style={{ background: color }}>{p}%</span>
                  {hasSkills && (
                    <button
                      onClick={() => setExpandedDomain(isExpanded ? null : d.domain_name)}
                      style={{
                        background: 'none', border: '1px solid var(--border, #ddd)', borderRadius: 4,
                        padding: '1px 6px', fontSize: 11, cursor: 'pointer',
                        color: 'var(--muted, #888)', fontWeight: 500,
                      }}
                    >
                      {isExpanded ? 'Hide' : 'Skills'}
                    </button>
                  )}
                </div>
              </div>
              <div className="ptrvDomainBarTrack">
                <div className="ptrvDomainBarFill" style={{ width: `${p}%`, background: '#3366cc' }} />
              </div>
              {isExpanded && d.skills?.length > 0 && (
                <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: '2px solid var(--border, #ddd)' }}>
                  {d.skills.map((s) => {
                    const sp = pct(s.correct, s.total);
                    const sColor = pctColor(sp);
                    return (
                      <div key={s.skill_name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                        <span style={{ flex: 1, color: 'var(--fg, #333)' }}>{s.skill_name}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{s.correct}/{s.total}</span>
                        <span style={{ fontWeight: 600, color: sColor, minWidth: 36, textAlign: 'right' }}>{sp}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timing bar (one per module) ──────────────────────────────────────────

function TimingBar({ label, questions, onBarClick }) {
  const totalTime = questions.reduce((s, q) => s + (q.time_spent_ms || 0), 0);
  if (!totalTime) return null;
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <div className="ptrvTimingRow">
      <div className="ptrvTimingLabel">{label}</div>
      <div className="ptrvTimingBarWrap">
        <div className="ptrvTimingBar" onClick={onBarClick} style={{ cursor: 'pointer' }}>
          {questions.map((q, i) => {
            const w = ((q.time_spent_ms || 0) / totalTime) * 100;
            if (w < 0.3) return null;
            const isCorrect = q.is_correct;
            const isSkipped = !q.was_answered;
            return (
              <div
                key={i}
                className={`ptrvTimingSeg ${isCorrect ? 'correct' : isSkipped ? 'skipped' : 'incorrect'}`}
                style={{ width: `${w}%`, borderRight: '1px solid rgba(255,255,255,0.35)' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {hoveredIdx === i && (
                  <div className="ptrvTimingTooltip">
                    <strong>Q{q.ordinal} · {fmtTime(q.time_spent_ms)}</strong>
                    {q.difficulty != null && <span>{DIFF_LABEL[q.difficulty] || `Diff ${q.difficulty}`}</span>}
                    {q.domain_name && <span style={{ opacity: 0.85 }}>{q.domain_name}</span>}
                    {q.skill_name && q.skill_name !== q.domain_name && <span style={{ opacity: 0.7, fontSize: 11 }}>{q.skill_name}</span>}
                    <span className={isCorrect ? 'correct' : isSkipped ? 'skipped' : 'incorrect'}>
                      {isCorrect ? 'Correct' : isSkipped ? 'Skipped' : 'Incorrect'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="ptrvTimingTotal">{fmtTime(totalTime)}</div>
      </div>
    </div>
  );
}

// ─── Timing detail popup ──────────────────────────────────────────────────

function TimingDetailPopup({ label, questions, onClose }) {
  if (!questions?.length) return null;
  const sorted = [...questions].sort((a, b) => a.ordinal - b.ordinal);
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="h2" style={{ margin: 0 }}>{label} — Time Breakdown</div>
          <button className="btn secondary" onClick={onClose} style={{ fontSize: 12, padding: '4px 10px' }}>Close</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border, #ddd)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Q#</th>
                <th style={{ padding: '6px 8px' }}>Time</th>
                <th style={{ padding: '6px 8px' }}>Difficulty</th>
                <th style={{ padding: '6px 8px' }}>Domain</th>
                <th style={{ padding: '6px 8px' }}>Skill</th>
                <th style={{ padding: '6px 8px' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((q) => {
                const isCorrect = q.is_correct;
                const isSkipped = !q.was_answered;
                return (
                  <tr key={q.question_version_id} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{q.ordinal}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{fmtTime(q.time_spent_ms)}</td>
                    <td style={{ padding: '6px 8px' }}>{DIFF_LABEL[q.difficulty] || '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 12 }}>{q.domain_name || '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 12 }}>{q.skill_name || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{
                        color: isCorrect ? '#16a34a' : isSkipped ? '#888' : '#dc2626',
                        fontWeight: 600, fontSize: 12,
                      }}>
                        {isCorrect ? 'Correct' : isSkipped ? 'Skipped' : 'Incorrect'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Desmos popup (movable, resizable) ────────────────────────────────────

const DESMOS_INIT_W = 560;
const DESMOS_INIT_H = 440;
const DESMOS_MIN_W = 320;
const DESMOS_MIN_H = 280;

function DesmosPopup({ isOpen, onClose, questionId: qId }) {
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
      notes: false, links: false, restrictedFunctions: false,
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
        className="ptrvDesmosPopup"
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
        {/* Resize edges */}
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
          className="ptrvDesmosHeader"
          onPointerDown={onHeaderPointerDown}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px 6px 12px', cursor: 'grab', userSelect: 'none',
            background: 'var(--bg-subtle, #f5f5f5)',
            borderBottom: minimized ? 'none' : '1px solid var(--border, #ddd)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Calculator</span>
            <DesmosStateButton
              questionId={qId}
              getCalcState={() => { try { return calcRef.current?.getState?.(); } catch { return null; } }}
              setCalcState={(st) => { try { calcRef.current?.setState?.(st, { allowUndo: false }); } catch {} }}
            />
          </div>
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

// ─── Question detail panel ─────────────────────────────────────────────────

function QuestionDetail({ q, allQuestions, onSelect, onOpenFlashcards, onToggleErrorLog, errorLogActive, userRole }) {
  const [showAnswer, setShowAnswer] = useState(false);

  if (!q) {
    return (
      <div className="ptrvDetailEmpty">
        <p className="muted small">Select a question to review it.</p>
      </div>
    );
  }

  const idx = allQuestions.findIndex((x) => x.question_version_id === q.question_version_id);
  const hasPrev = idx > 0;
  const hasNext = idx < allQuestions.length - 1;

  const correctOptionId = q.correct_answer?.correct_option_id;
  const correctOptionIds = q.correct_answer?.correct_option_ids || [];
  const correctOption = q.options?.find(
    (o) => o.id === correctOptionId || correctOptionIds.includes(o.id)
  );
  const selectedOption = q.options?.find((o) => o.id === q.selected_option_id);

  return (
    <div className="ptrvDetail">
      {/* Header */}
      <div className="ptrvDetailHeader">
        <div className="ptrvDetailMeta">
          <span className={`ptrvQBadge ${q.is_correct ? 'correct' : q.was_answered ? 'incorrect' : 'skipped'}`}>
            Q{q.ordinal}
          </span>
          <div className="ptrvDetailMetaText">
            <span className="ptrvDetailSubj">{SUBJECT_LABEL[q.subject_code] || q.subject_code} · Module {q.module_number}</span>
            {q.domain_name && <span className="ptrvDetailDomain">{q.domain_name}</span>}
            {q.skill_name && q.skill_name !== q.domain_name && (
              <span className="ptrvDetailSkill">{q.skill_name}</span>
            )}
            {q.time_spent_ms != null && (
              <span className="ptrvDetailSkill" style={{ fontVariantNumeric: 'tabular-nums' }}>Time: {fmtTime(q.time_spent_ms)}</span>
            )}
            {q.difficulty != null && (
              <span className="ptrvDetailSkill">Difficulty: {q.difficulty}</span>
            )}
          </div>
        </div>
        <div className="ptrvDetailNav" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn secondary ptrvNavBtn"
            disabled={!hasPrev}
            onClick={() => hasPrev && onSelect(allQuestions[idx - 1])}
            aria-label="Previous question"
          >←</button>
          <button
            className="btn secondary ptrvNavBtn"
            disabled={!hasNext}
            onClick={() => hasNext && onSelect(allQuestions[idx + 1])}
            aria-label="Next question"
          >→</button>
          <QuestionNotes questionId={q.question_id} />
        </div>
      </div>

      {/* Question content */}
      <div className="ptrvDetailBody">
        {htmlHasContent(q.stimulus_html) && (
          <div className="ptrvStimulus">
            <HtmlBlock html={q.stimulus_html} className="prose" />
          </div>
        )}
        <div className="ptrvDetailStem">
          <HtmlBlock html={q.stem_html} className="prose" />
        </div>

        {q.options?.length > 0 && (
          <div className="optionList ptrvOptionList">
            {q.options.map((opt) => (
              <div key={opt.id} className="option ptrvReviewOption">
                <span className="optionBadge">{opt.label}</span>
                <div className="optionContent">
                  <HtmlBlock html={opt.content_html || ''} className="prose" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Answer reveal */}
      <div className="ptrvAnswerSection">
        <button
          className={`ptrvAnswerToggle${showAnswer ? ' open' : ''}`}
          onClick={() => setShowAnswer((v) => !v)}
        >
          {showAnswer ? 'Hide Answer' : 'Show Answer'}
          <span className="ptrvToggleChevron">{showAnswer ? '▲' : '▼'}</span>
        </button>

        {showAnswer && (
          <div className="ptrvAnswerBody">
            <div className="ptrvAnswerRows">
              {q.options?.length > 0 ? (
                <>
                  <div className="ptrvAnswerRow">
                    <span className="ptrvAnswerLabel">Your answer</span>
                    {q.was_answered && selectedOption ? (
                      <div className={`option ptrvReviewOption ptrvAnswerOpt ${q.is_correct ? 'correct' : 'incorrect'}`}>
                        <span className="optionBadge">{selectedOption.label}</span>
                        <div className="optionContent">
                          <HtmlBlock html={selectedOption.content_html || ''} className="prose" />
                        </div>
                      </div>
                    ) : (
                      <span className="ptrvAnswerValue skipped">Not answered</span>
                    )}
                  </div>
                  {(!q.is_correct || !q.was_answered) && correctOption && (
                    <div className="ptrvAnswerRow">
                      <span className="ptrvAnswerLabel">Correct answer</span>
                      <div className="option ptrvReviewOption correct ptrvAnswerOpt">
                        <span className="optionBadge">{correctOption.label}</span>
                        <div className="optionContent">
                          <HtmlBlock html={correctOption.content_html || ''} className="prose" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="ptrvAnswerRow">
                    <span className="ptrvAnswerLabel">Your answer</span>
                    <span className={`ptrvAnswerValue ${q.is_correct ? 'correct' : q.was_answered ? 'incorrect' : 'skipped'}`}>
                      {q.response_text || 'No answer given'}
                    </span>
                  </div>
                  {!q.is_correct && q.correct_answer?.correct_text && (
                    <div className="ptrvAnswerRow">
                      <span className="ptrvAnswerLabel">Correct answer</span>
                      <span className="ptrvAnswerValue correct">{formatSprAnswer(q.correct_answer.correct_text)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {q.rationale_html && (
              <div className="ptrvRationale">
                <div className="ptrvRationaleLabel">Explanation</div>
                <HtmlBlock html={q.rationale_html} className="ptrvRationaleBody prose" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="ptrvActions" style={{ display: 'flex', gap: 8, padding: '12px 16px', flexWrap: 'wrap' }}>
        <button className="btn secondary" style={{ fontSize: 13 }} onClick={onOpenFlashcards}>
          Flashcards
        </button>
        <button
          className={`btn secondary${errorLogActive ? ' errorLogHasNote' : ''}`}
          style={{ fontSize: 13 }}
          onClick={onToggleErrorLog}
        >
          {errorLogActive ? 'Hide Error Log' : 'Add to Error Log'}
        </button>
      </div>

      {/* Concept tags (admin/manager only) */}
      {(userRole === 'admin' || userRole === 'manager') && q.question_id && (
        <div style={{ padding: '0 16px 12px' }}>
          <ConceptTags questionId={q.question_id} userRole={userRole} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedQ, setSelectedQ] = useState(null);
  const [userRole, setUserRole] = useState(null);

  // Score recalculation dialog
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [scoreForm, setScoreForm] = useState({ rw_scaled: '', math_scaled: '' });
  const [scoreSaving, setScoreSaving] = useState(false);

  // Desmos calculator popup
  const [showCalc, setShowCalc] = useState(false);
  const isMathQuestion = selectedQ && MATH_CODES.has(selectedQ.subject_code);

  // Auto-open calculator when a math question is selected
  const prevSubjRef = useRef(null);
  useEffect(() => {
    if (!selectedQ) return;
    const wasMath = prevSubjRef.current && MATH_CODES.has(prevSubjRef.current);
    const isMath = MATH_CODES.has(selectedQ.subject_code);
    if (isMath && !wasMath) setShowCalc(true);
    if (!isMath && wasMath) setShowCalc(false);
    prevSubjRef.current = selectedQ.subject_code;
  }, [selectedQ]);

  // Timing detail popup state
  const [timingPopup, setTimingPopup] = useState(null); // { label, questions }

  // Flashcard state
  const [showFlashcards, setShowFlashcards] = useState(false);

  // Error log state
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [errorLogText, setErrorLogText] = useState('');
  const [errorLogSaving, setErrorLogSaving] = useState(false);
  const [errorLogSaved, setErrorLogSaved] = useState(false);
  const [errorLogQid, setErrorLogQid] = useState(null);

  // Toast message
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t); } }, [msg]);

  useEffect(() => {
    fetch(`/api/practice-tests/attempt/${attemptId}/results`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
        if (d.questions?.length) setSelectedQ(d.questions[0]);
      })
      .catch(() => { setError('Failed to load results.'); setLoading(false); });
  }, [attemptId]);

  // Fetch user role for conditional UI (concept tags)
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.role) setUserRole(d.role); })
      .catch(() => {});
  }, []);

  // Reset error log when switching questions
  useEffect(() => {
    if (!selectedQ) return;
    if (selectedQ.question_id !== errorLogQid) {
      setShowErrorLog(false);
      setErrorLogText('');
      setErrorLogSaved(false);
      setErrorLogQid(selectedQ.question_id);
    }
  }, [selectedQ]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRecalculatedScore() {
    if (!data?.attempt_id) return;
    setScoreSaving(true);
    try {
      // Get module correct counts from the current data for score_conversion
      const sections = data.sections || {};
      const rwSec = sections['RW'] || sections['rw'] || {};
      const mathSec = sections['MATH'] || sections['M'] || sections['m'] || sections['math'] || {};

      const res = await fetch('/api/admin/recalculate-score', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attempt_id: data.attempt_id,
          rw_scaled: scoreForm.rw_scaled,
          math_scaled: scoreForm.math_scaled,
          practice_test_id: data.practice_test_id,
          rw_m1_correct: rwSec.m1Correct ?? null,
          rw_m2_correct: rwSec.m2Correct ?? null,
          math_m1_correct: mathSec.m1Correct ?? null,
          math_m2_correct: mathSec.m2Correct ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');

      // Update local data with new scores
      setData(prev => ({
        ...prev,
        composite: json.composite,
        sections: {
          ...prev.sections,
          ...(prev.sections?.RW ? { RW: { ...prev.sections.RW, scaled: json.rw_scaled } } : {}),
          ...(prev.sections?.rw ? { rw: { ...prev.sections.rw, scaled: json.rw_scaled } } : {}),
          ...(prev.sections?.MATH ? { MATH: { ...prev.sections.MATH, scaled: json.math_scaled } } : {}),
          ...(prev.sections?.M ? { M: { ...prev.sections.M, scaled: json.math_scaled } } : {}),
          ...(prev.sections?.m ? { m: { ...prev.sections.m, scaled: json.math_scaled } } : {}),
          ...(prev.sections?.math ? { math: { ...prev.sections.math, scaled: json.math_scaled } } : {}),
        },
      }));
      setShowScoreDialog(false);
      setMsg({ kind: 'success', text: `Score updated: ${json.composite} (R&W ${json.rw_scaled}, Math ${json.math_scaled})` });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setScoreSaving(false);
    }
  }

  async function saveErrorLog() {
    if (!selectedQ?.question_id || !errorLogText.trim()) return;
    setErrorLogSaving(true);
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: selectedQ.question_id, patch: { notes: errorLogText.trim() } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save note');
      setErrorLogSaved(true);
      setMsg({ kind: 'ok', text: 'Error log saved' });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setErrorLogSaving(false);
    }
  }

  async function generatePDF() {
    const { generateScoreReportPdf } = await import('../../../../../lib/generateScoreReportPdf');

    // Try to load logo for the PDF (browser only)
    let logoDataUrl = null;
    let logoWidth = null;
    let logoHeight = null;
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
        logoImg.src = '/studyworks-logo.png';
      });
      logoWidth = logoImg.naturalWidth;
      logoHeight = logoImg.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = logoWidth;
      canvas.height = logoHeight;
      canvas.getContext('2d').drawImage(logoImg, 0, 0);
      logoDataUrl = canvas.toDataURL('image/png');
    } catch {
      // Logo failed to load, skip
    }

    const doc = generateScoreReportPdf(data, { logoDataUrl, logoWidth, logoHeight });
    const filename = `${(data?.test_name || 'Practice-Test').replace(/[^a-zA-Z0-9]+/g, '-')}-Score-Report.pdf`;
    doc.save(filename);
  }

  if (loading) return <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}><p className="muted">Loading results...</p></div>;
  if (error || data?.error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error || data?.error}</p></div>;

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  const questions = data.questions || [];

  // Group questions by subject/module
  const questionsByGroup = {};
  for (const q of questions) {
    const key = `${q.subject_code}/${q.module_number}`;
    if (!questionsByGroup[key]) questionsByGroup[key] = [];
    questionsByGroup[key].push(q);
  }

  // Separate domains by subject
  const rwDomains = (data.domains || []).filter(d => RW_CODES.has(d.subject_code));
  const mathDomains = (data.domains || []).filter(d => MATH_CODES.has(d.subject_code));

  // Difficulty breakdown
  const diffStats = {};
  for (const q of questions) {
    const d = q.difficulty || 0;
    if (!diffStats[d]) diffStats[d] = { total: 0, correct: 0, incorrect: 0, omitted: 0 };
    diffStats[d].total += 1;
    if (q.is_correct) diffStats[d].correct += 1;
    else if (q.was_answered) diffStats[d].incorrect += 1;
    else diffStats[d].omitted += 1;
  }

  // Critical Review Areas — skills with lowest accuracy (min 2 questions, sorted worst first)
  const skillStats = {};
  for (const q of questions) {
    const key = q.skill_name || 'Unknown';
    if (!skillStats[key]) skillStats[key] = { skill_name: key, domain_name: q.domain_name, correct: 0, total: 0, incorrect: [] };
    skillStats[key].total += 1;
    if (q.is_correct) skillStats[key].correct += 1;
    else skillStats[key].incorrect.push(q);
  }
  const criticalAreas = Object.values(skillStats)
    .filter(s => s.total >= 2 && pct(s.correct, s.total) < 80)
    .sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))
    .slice(0, 6);

  // Check if timing data exists
  const hasTimingData = questions.some(q => q.time_spent_ms != null && q.time_spent_ms > 0);

  // Section scores
  const sectionEntries = SUBJECT_ORDER.map(subj => data.sections?.[subj] ? [subj, data.sections[subj]] : null).filter(Boolean);

  return (
    <main className="container ptrvMain">

      <Link href="/practice-test" className="muted small ptrvBack">&larr; Practice Tests</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="h1" style={{ marginBottom: 4 }}>{data.test_name || 'Practice Test'}</h1>
          {data.completed_at && (
            <p className="muted small" style={{ marginBottom: 0 }}>Completed {fmtDate(data.completed_at)}</p>
          )}
        </div>
        <button
          className="btn secondary"
          onClick={generatePDF}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 4 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 18 15 15" />
          </svg>
          Export PDF
        </button>
        {['teacher', 'manager', 'admin'].includes(userRole) && (
          <button
            className="btn secondary"
            onClick={() => {
              const sections = data?.sections || {};
              const rwSec = sections['RW'] || sections['rw'] || {};
              const mathSec = sections['MATH'] || sections['M'] || sections['m'] || sections['math'] || {};
              setScoreForm({ rw_scaled: rwSec.scaled || '', math_scaled: mathSec.scaled || '' });
              setShowScoreDialog(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 4 }}
          >
            Recalculate Score
          </button>
        )}
      </div>
      <div style={{ marginBottom: 28 }} />

      {/* ═══ SCORE HEADER ═══ */}
      <div className="ptrvScoreHeader">
        <ScoreRing score={data.composite ?? 0} label="Total Score" />
        <div className="ptrvSectionScores">
          {sectionEntries.map(([subj, sec]) => (
            <div key={subj} className="ptrvSectionCard">
              <div className="ptrvSectionScore">{sec.scaled}</div>
              <div className="ptrvSectionLabel">{SUBJECT_LABEL[subj]}</div>
              <div className="ptrvSectionDetail">{sec.correct}/{sec.total} correct</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ DOMAIN ANALYTICS ═══ */}
      {(rwDomains.length > 0 || mathDomains.length > 0) && (
        <div className="ptrvDomainRow">
          <DomainAnalyticsCard
            title="Reading and Writing"
            subtitle="Domain level analytics for reading and writing"
            domains={rwDomains}
          />
          <DomainAnalyticsCard
            title="Math"
            subtitle="Domain level analytics for math"
            domains={mathDomains}
          />
        </div>
      )}

      {/* ═══ DIFFICULTY BREAKDOWN ═══ */}
      {Object.keys(diffStats).some(k => k !== '0') && (
        <div className="ptrvSection">
          <h2 className="ptrvSectionH2">Difficulty Level Breakdown</h2>
          <p className="ptrvSectionSub">Accuracy breakdown by question difficulty</p>
          <div className="ptrvDiffGrid">
            {[1, 2, 3].map(d => {
              const s = diffStats[d];
              if (!s) return null;
              const p = pct(s.correct, s.total);
              return (
                <div key={d} className="card ptrvDiffCard">
                  <h3 className="ptrvDiffTitle">{DIFF_LABEL[d]} Questions</h3>
                  <p className="ptrvDiffCount">Total Questions: {s.total}</p>
                  <DonutChart percentage={p} />
                  <div className="ptrvDiffLegend">
                    <div className="ptrvDiffLegendItem">
                      <span className="ptrvDiffDot" style={{ background: '#3b9c6e' }} /> Correct: {s.correct}
                    </div>
                    <div className="ptrvDiffLegendItem">
                      <span className="ptrvDiffDot" style={{ background: '#d97a6a' }} /> Incorrect: {s.incorrect}
                    </div>
                    <div className="ptrvDiffLegendItem">
                      <span className="ptrvDiffDot" style={{ background: '#ccc' }} /> Omitted: {s.omitted}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ CRITICAL REVIEW AREAS ═══ */}
      {criticalAreas.length > 0 && (
        <div className="ptrvSection">
          <h2 className="ptrvSectionH2">Critical Review Areas</h2>
          <p className="ptrvSectionSub">Skills that need the most attention based on this test</p>
          <div className="ptrvCritGrid">
            {criticalAreas.map(s => {
              const p = pct(s.correct, s.total);
              const color = pctColor(p);
              return (
                <div key={s.skill_name} className="card ptrvCritCard">
                  <div className="ptrvCritHeader">
                    <span className="ptrvCritName">{s.skill_name}</span>
                    <span className="ptrvCritPct" style={{ color }}>{p}%</span>
                  </div>
                  <div className="ptrvCritDomain">{s.domain_name}</div>
                  <div className="ptrvCritBar">
                    <div className="ptrvCritBarFill" style={{ width: `${p}%`, background: color }} />
                  </div>
                  <div className="ptrvCritDetail">{s.correct}/{s.total} correct</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ OPPORTUNITY INDEX ═══ */}
      {data.opportunity?.length > 0 && (
        <div className="ptrvSection">
          <h2 className="ptrvSectionH2">Opportunity Index</h2>
          <p className="ptrvSectionSub">Skills ranked by potential score improvement — higher index = more actionable gains</p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="adminTable" style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Skill</th>
                  <th>Domain</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Accuracy</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Learnability</th>
                  <th style={{ width: 100, textAlign: 'right', paddingRight: 16 }}>OI Score</th>
                </tr>
              </thead>
              <tbody>
                {data.opportunity.slice(0, 5).map((s, i) => {
                  const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
                  const maxOI = data.opportunity[0]?.opportunity_index || 1;
                  const barW = Math.max(4, (s.opportunity_index / maxOI) * 100);
                  return (
                    <tr key={s.skill_code}>
                      <td style={{ paddingLeft: 16, fontWeight: i < 3 ? 600 : 400 }}>
                        {s.skill_name}
                      </td>
                      <td className="muted small">{s.domain_name}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: pctColor(acc), fontWeight: 600 }}>{acc}%</span>
                        <span className="muted small" style={{ marginLeft: 4 }}>{s.correct}/{s.total}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                          fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
                          background: s.learnability >= 7 ? 'rgba(22,163,74,0.1)' : s.learnability >= 4 ? 'rgba(202,138,4,0.1)' : 'rgba(220,38,38,0.1)',
                          color: s.learnability >= 7 ? '#16a34a' : s.learnability >= 4 ? '#ca8a04' : '#dc2626',
                        }}>
                          {s.learnability}
                        </span>
                      </td>
                      <td style={{ paddingRight: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <div style={{
                            flex: 1, height: 6, borderRadius: 3, background: 'var(--border, #e5e5e5)',
                            overflow: 'hidden', maxWidth: 60,
                          }}>
                            <div style={{
                              width: `${barW}%`, height: '100%', borderRadius: 3,
                              background: i < 3 ? '#2563eb' : '#6b7280',
                            }} />
                          </div>
                          <span style={{ fontWeight: 700, minWidth: 36, textAlign: 'right', fontFamily: 'monospace' }}>
                            {s.opportunity_index.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TIMING ANALYSIS ═══ */}
      {hasTimingData && (() => {
        // Build slowest-questions lists per subject
        const rwTimedQs = questions.filter(q => RW_CODES.has(q.subject_code) && q.time_spent_ms > 0);
        const mathTimedQs = questions.filter(q => MATH_CODES.has(q.subject_code) && q.time_spent_ms > 0);
        const slowestRW = [...rwTimedQs].sort((a, b) => (b.time_spent_ms || 0) - (a.time_spent_ms || 0)).slice(0, 5);
        const slowestMath = [...mathTimedQs].sort((a, b) => (b.time_spent_ms || 0) - (a.time_spent_ms || 0)).slice(0, 5);

        return (
          <div className="ptrvSection">
            <h2 className="ptrvSectionH2">Timing Analysis</h2>
            <p className="ptrvSectionSub">Time distribution across questions in each module — click a bar for details</p>
            <div className="card ptrvTimingCard">
              {SUBJECT_ORDER.map(subj =>
                [1, 2].map(modNum => {
                  const key = `${subj}/${modNum}`;
                  const qs = questionsByGroup[key];
                  if (!qs?.length) return null;
                  const hasTime = qs.some(q => q.time_spent_ms != null && q.time_spent_ms > 0);
                  if (!hasTime) return null;
                  const barLabel = `${SUBJECT_LABEL[subj]} · M${modNum}`;
                  return (
                    <TimingBar
                      key={key}
                      label={barLabel}
                      questions={qs}
                      onBarClick={() => setTimingPopup({ label: barLabel, questions: qs })}
                    />
                  );
                })
              )}
              <div className="ptrvTimingLegend">
                <span><span className="ptrvTimingLegDot correct" /> Correct</span>
                <span><span className="ptrvTimingLegDot incorrect" /> Incorrect</span>
                <span><span className="ptrvTimingLegDot skipped" /> Skipped</span>
              </div>
            </div>

            {/* Most time-consuming questions */}
            {(slowestRW.length > 0 || slowestMath.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
                {[
                  { label: 'Reading & Writing', items: slowestRW },
                  { label: 'Math', items: slowestMath },
                ].filter(g => g.items.length > 0).map(g => (
                  <div key={g.label} className="card" style={{ padding: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Slowest Questions — {g.label}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {g.items.map((q, idx) => (
                        <div key={q.question_version_id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', borderRadius: 6,
                          background: idx === 0 ? 'rgba(220,38,38,0.06)' : 'transparent',
                        }}>
                          <span style={{
                            fontWeight: 700, fontSize: 13, minWidth: 32,
                            color: q.is_correct ? '#16a34a' : q.was_answered ? '#dc2626' : '#888',
                          }}>Q{q.ordinal}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, minWidth: 42 }}>{fmtTime(q.time_spent_ms)}</span>
                          <span className="muted" style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {q.domain_name ? abbrev(q.domain_name) : ''}{q.skill_name ? ` · ${q.skill_name}` : ''}
                          </span>
                          {q.difficulty != null && (
                            <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}>{DIFF_LABEL[q.difficulty]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Timing detail popup */}
      {timingPopup && (
        <TimingDetailPopup
          label={timingPopup.label}
          questions={timingPopup.questions}
          onClose={() => setTimingPopup(null)}
        />
      )}

      {/* ═══ QUESTION REVIEW ═══ */}
      <div className="ptrvSection">
        <h2 className="ptrvSectionH2">Question Review</h2>
      </div>
      <div className="ptrvReviewRow">

        {/* Left: tile grid */}
        <div className="card ptrvTilesPanel">
          {SUBJECT_ORDER.map((subj) =>
            [1, 2].map((modNum) => {
              const key = `${subj}/${modNum}`;
              const qs = questionsByGroup[key];
              if (!qs?.length) return null;
              return (
                <div key={key} className="ptrvTileGroup">
                  <div className="ptrvTileGroupLabel">
                    {SUBJECT_LABEL[subj]} · Module {modNum}
                  </div>
                  <div className="ptrvTileGrid">
                    {qs.map((q) => {
                      const isSelected = selectedQ?.question_version_id === q.question_version_id;
                      const statusCls = q.is_correct ? 'correct' : q.was_answered ? 'incorrect' : 'skipped';
                      return (
                        <button
                          key={q.question_version_id}
                          className={`ptrvTile ${statusCls}${isSelected ? ' selected' : ''}`}
                          onClick={() => setSelectedQ(q)}
                          title={q.domain_name || ''}
                        >
                          <span className="ptrvTileNum">{q.ordinal}</span>
                          {q.domain_name && (
                            <span className="ptrvTileDomain">{abbrev(q.domain_name)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: detail panel (sticky) */}
        <div className="card ptrvDetailWrap">
          <QuestionDetail
            key={selectedQ?.question_version_id}
            q={selectedQ}
            allQuestions={questions}
            onSelect={setSelectedQ}
            onOpenFlashcards={() => setShowFlashcards(true)}
            onToggleErrorLog={() => setShowErrorLog((s) => !s)}
            errorLogActive={showErrorLog}
            userRole={userRole}
          />

          {showErrorLog && selectedQ && (
            <div className="errorLogPanel" style={{ padding: '0 16px 16px' }}>
              <textarea
                className="input errorLogTextarea"
                value={errorLogText}
                onChange={(e) => { setErrorLogText(e.target.value); setErrorLogSaved(false); }}
                placeholder="Write notes about your error — what did you get wrong and why?"
                rows={3}
              />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn primary" onClick={saveErrorLog} disabled={errorLogSaving || !errorLogText.trim()}>
                  {errorLogSaving ? 'Saving...' : errorLogSaved ? 'Saved' : 'Save Note'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Calculator toggle button for math questions */}
      {isMathQuestion && !showCalc && (
        <button
          className="btn secondary"
          onClick={() => setShowCalc(true)}
          style={{
            position: 'fixed', right: 24, bottom: 24, zIndex: 999,
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,.15)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="16" height="20" x="4" y="2" rx="2" />
            <line x1="8" x2="16" y1="6" y2="6" />
            <path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" />
            <path d="M12 14h.01" /><path d="M8 14h.01" />
            <path d="M12 18h.01" /><path d="M8 18h.01" />
            <line x1="16" x2="16" y1="14" y2="18" />
          </svg>
          Calculator
        </button>
      )}

      {/* Desmos popup */}
      <DesmosPopup isOpen={showCalc} onClose={() => setShowCalc(false)} questionId={selectedQ?.question_id} />

      {/* Score recalculation dialog */}
      {showScoreDialog && (
        <div className="modalOverlay" onClick={() => setShowScoreDialog(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="h2" style={{ margin: 0 }}>Recalculate Score</h2>
              <button className="btn secondary" onClick={() => setShowScoreDialog(false)} style={{ fontSize: 12, padding: '4px 10px' }}>Close</button>
            </div>

            <p className="muted small" style={{ marginBottom: 16 }}>
              Enter the correct scaled scores for each section. This will update the student&apos;s score
              and add the score mapping to the conversion table for future lookups.
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span className="muted small" style={{ fontWeight: 600 }}>Reading &amp; Writing (200-800)</span>
                <input
                  className="input"
                  type="number"
                  min="200"
                  max="800"
                  step="10"
                  value={scoreForm.rw_scaled}
                  onChange={e => setScoreForm(f => ({ ...f, rw_scaled: e.target.value }))}
                />
              </label>

              <label style={{ display: 'grid', gap: 4 }}>
                <span className="muted small" style={{ fontWeight: 600 }}>Math (200-800)</span>
                <input
                  className="input"
                  type="number"
                  min="200"
                  max="800"
                  step="10"
                  value={scoreForm.math_scaled}
                  onChange={e => setScoreForm(f => ({ ...f, math_scaled: e.target.value }))}
                />
              </label>

              {scoreForm.rw_scaled && scoreForm.math_scaled && (
                <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                  Composite: {(parseInt(scoreForm.rw_scaled) || 0) + (parseInt(scoreForm.math_scaled) || 0)}
                </div>
              )}

              <button
                className="btn primary"
                disabled={scoreSaving || !scoreForm.rw_scaled || !scoreForm.math_scaled}
                onClick={saveRecalculatedScore}
                style={{ marginTop: 4 }}
              >
                {scoreSaving ? 'Saving...' : 'Save Score'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flashcards modal */}
      <FlashcardsModal
        open={showFlashcards}
        onClose={() => setShowFlashcards(false)}
        onMessage={setMsg}
      />

      {/* Toast */}
      {msg && (
        <div className={`toast ${msg.kind}`} style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2000, padding: '8px 20px', borderRadius: 8,
          background: msg.kind === 'ok' ? 'var(--color-success, #22c55e)' : 'var(--danger, #ef4444)',
          color: '#fff', fontSize: 14, fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,.2)',
        }}>
          {msg.text}
        </div>
      )}
    </main>
  );
}
