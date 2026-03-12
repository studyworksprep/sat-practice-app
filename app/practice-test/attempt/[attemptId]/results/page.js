'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import HtmlBlock from '../../../../../components/HtmlBlock';

const SUBJECT_LABEL = { rw: 'Reading & Writing', RW: 'Reading & Writing', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };

// Returns true only when an HTML string has visible text content (not just empty tags or literal "NULL")
const htmlHasContent = (html) => {
  if (!html) return false;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
};
const SUBJECT_ORDER = ['RW', 'rw', 'MATH', 'M', 'm', 'math'];

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

function AccuracyBar({ correct, total }) {
  const p = pct(correct, total);
  const cls = p >= 70 ? 'green' : p >= 50 ? 'yellow' : 'red';
  return (
    <div className="dbProgressBar" style={{ marginTop: 4 }}>
      <div className={`dbProgressFill ${cls}`} style={{ width: `${p}%` }} />
    </div>
  );
}

// ─── Desmos popup (movable, minimizable) ──────────────────────────────────

function DesmosPopup({ isOpen, onClose }) {
  const hostRef = useRef(null);
  const calcRef = useRef(null);
  const cardRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const posRef = useRef({ x: 0, y: 0 });

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

  useEffect(() => {
    if (!isOpen) return;
    // Reset position when reopened
    posRef.current = { x: 0, y: 0 };
    if (cardRef.current) cardRef.current.style.transform = '';
  }, [isOpen]);

  function onHeaderPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const card = cardRef.current;
    if (!card) return;
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: posRef.current.x, origY: posRef.current.y };
    const onMove = (ev) => {
      if (!dragRef.current.dragging) return;
      const nx = dragRef.current.origX + (ev.clientX - dragRef.current.startX);
      const ny = dragRef.current.origY + (ev.clientY - dragRef.current.startY);
      posRef.current = { x: nx, y: ny };
      card.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      dragRef.current.dragging = false;
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
          position: 'fixed', right: 24, bottom: 24,
          width: minimized ? 200 : 540,
          height: minimized ? 'auto' : 420,
          zIndex: 1000,
          display: 'flex', flexDirection: 'column',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,.25)',
          background: 'var(--bg-card, #fff)',
          border: '1px solid var(--border, #ddd)',
          overflow: 'hidden',
        }}
      >
        <div
          className="ptrvDesmosHeader"
          onPointerDown={onHeaderPointerDown}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', cursor: 'grab', userSelect: 'none',
            background: 'var(--bg-subtle, #f5f5f5)',
            borderBottom: minimized ? 'none' : '1px solid var(--border, #ddd)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13 }}>Calculator</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: '2px 8px', fontSize: 12 }}
              onClick={() => setMinimized((m) => !m)}
            >
              {minimized ? 'Expand' : 'Minimize'}
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: '2px 8px', fontSize: 12 }}
              onClick={onClose}
            >
              Close
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

function QuestionDetail({ q, allQuestions, onSelect, onMakeFlashcard, onToggleErrorLog, errorLogActive }) {
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
          </div>
        </div>
        <div className="ptrvDetailNav">
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

        {/* MCQ options — always visible, neutral, non-interactive */}
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
                /* MCQ — show which option the student picked and what's correct */
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
                /* SPR / free-response */
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

      {/* Action buttons: flashcard + error log */}
      <div className="ptrvActions" style={{ display: 'flex', gap: 8, padding: '12px 16px', flexWrap: 'wrap' }}>
        <button className="btn secondary" style={{ fontSize: 13 }} onClick={() => onMakeFlashcard(q)}>
          Make Flashcard
        </button>
        <button
          className={`btn secondary${errorLogActive ? ' errorLogHasNote' : ''}`}
          style={{ fontSize: 13 }}
          onClick={onToggleErrorLog}
        >
          {errorLogActive ? 'Hide Error Log' : 'Add to Error Log'}
        </button>
      </div>
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
  const [openDomains, setOpenDomains] = useState({});

  // Desmos calculator popup
  const [showCalc, setShowCalc] = useState(false);
  const isMathQuestion = selectedQ && ['M', 'm', 'math', 'Math', 'MATH'].includes(selectedQ.subject_code);

  // Auto-open calculator when a math question is selected
  const prevSubjRef = useRef(null);
  useEffect(() => {
    if (!selectedQ) return;
    const wasMath = prevSubjRef.current && ['M', 'm', 'math', 'Math', 'MATH'].includes(prevSubjRef.current);
    const isMath = ['M', 'm', 'math', 'Math', 'MATH'].includes(selectedQ.subject_code);
    if (isMath && !wasMath) setShowCalc(true);
    if (!isMath && wasMath) setShowCalc(false);
    prevSubjRef.current = selectedQ.subject_code;
  }, [selectedQ]);

  // Flashcard state
  const [showFlashcardDialog, setShowFlashcardDialog] = useState(false);
  const [flashcardSets, setFlashcardSets] = useState([]);
  const [flashcardSetId, setFlashcardSetId] = useState('');
  const [flashcardFront, setFlashcardFront] = useState('');
  const [flashcardBack, setFlashcardBack] = useState('');
  const [flashcardSaving, setFlashcardSaving] = useState(false);
  const [flashcardSaved, setFlashcardSaved] = useState(false);

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

  async function openFlashcardDialog(q) {
    setShowFlashcardDialog(true);
    setFlashcardSaved(false);
    setFlashcardFront('');
    setFlashcardBack('');
    try {
      const res = await fetch('/api/flashcard-sets');
      const json = await res.json();
      if (res.ok && json.sets) {
        setFlashcardSets(json.sets);
        if (!flashcardSetId && json.sets.length) setFlashcardSetId(json.sets[0].id);
      }
    } catch {}
  }

  async function saveFlashcard() {
    if (!flashcardSetId || !flashcardFront.trim() || !flashcardBack.trim()) return;
    setFlashcardSaving(true);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_id: flashcardSetId, front: flashcardFront.trim(), back: flashcardBack.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save flashcard');
      setFlashcardSaved(true);
      setFlashcardFront('');
      setFlashcardBack('');
      setMsg({ kind: 'ok', text: 'Flashcard saved!' });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setFlashcardSaving(false);
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

  if (loading) return <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}><p className="muted">Loading results…</p></div>;
  if (error || data?.error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error || data?.error}</p></div>;

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function toggleDomain(name) {
    setOpenDomains((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  // Group questions by subject/module, preserving original order
  const groupKeys = [];
  const questionsByGroup = {};
  for (const q of data.questions || []) {
    const key = `${q.subject_code}/${q.module_number}`;
    if (!questionsByGroup[key]) { questionsByGroup[key] = []; groupKeys.push(key); }
    questionsByGroup[key].push(q);
  }

  return (
    <main className="container ptrvMain">

      <Link href="/practice-test" className="muted small ptrvBack">← Practice Tests</Link>

      <h1 className="h1" style={{ marginBottom: 4 }}>{data.test_name || 'Practice Test'}</h1>
      {data.completed_at && (
        <p className="muted small" style={{ marginBottom: 24 }}>Completed {fmtDate(data.completed_at)}</p>
      )}

      {/* ── Summary card: scores + skills side by side ── */}
      <div className="card ptrvSummaryCard">
        <div className="ptrvSummaryInner">

          {/* Left column: composite + section scores */}
          <div className="ptrvScoreCol">
            <div className="ptrvCompositeWrap">
              <span className="ptCompositeNum">{data.composite ?? '—'}</span>
              <span className="ptCompositeLabel">Total Score</span>
            </div>
            <div className="ptrvDivider" />
            <div className="ptrvSections">
              {SUBJECT_ORDER.map((subj) => {
                const sec = data.sections?.[subj];
                if (!sec) return null;
                return (
                  <div key={subj} className="ptrvSectionItem">
                    <span className="ptrvSectionNum">{sec.scaled}</span>
                    <span className="ptrvSectionName">{SUBJECT_LABEL[subj]}</span>
                    <span className="muted small">{sec.correct}/{sec.total} correct</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vertical divider */}
          {data.domains?.length > 0 && <div className="ptrvSummaryDivider" />}

          {/* Right column: skills breakdown */}
          {data.domains?.length > 0 && (
            <div className="ptrvSkillsCol">
              <div className="h2" style={{ marginBottom: 12 }}>Skills Breakdown</div>
              <table className="ptDomainTable">
                <thead>
                  <tr>
                    <th>Domain / Skill</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Score</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {data.domains.map((d) => {
                    const isOpen = openDomains[d.domain_name];
                    return [
                      <tr key={d.domain_name} className="ptDomainRow" onClick={() => toggleDomain(d.domain_name)} style={{ cursor: 'pointer' }}>
                        <td><strong>{d.domain_name}</strong> <span className="muted small">{isOpen ? '▲' : '▼'}</span></td>
                        <td style={{ textAlign: 'right', paddingRight: 8 }}>{d.correct}/{d.total}</td>
                        <td><AccuracyBar correct={d.correct} total={d.total} /></td>
                      </tr>,
                      ...(isOpen ? (d.skills || []).map((s) => (
                        <tr key={`${d.domain_name}-${s.skill_name}`} className="ptSkillRow">
                          <td style={{ paddingLeft: 20 }}>{s.skill_name}</td>
                          <td style={{ textAlign: 'right', paddingRight: 8 }}>{s.correct}/{s.total}</td>
                          <td><AccuracyBar correct={s.correct} total={s.total} /></td>
                        </tr>
                      )) : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* ── Question review: tile grid + detail panel ── */}
      <div className="ptrvReviewRow">

        {/* Left: tile grid */}
        <div className="card ptrvTilesPanel">
          <div className="h2" style={{ marginBottom: 14 }}>Question Review</div>

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
            allQuestions={data.questions || []}
            onSelect={setSelectedQ}
            onMakeFlashcard={openFlashcardDialog}
            onToggleErrorLog={() => setShowErrorLog((s) => !s)}
            errorLogActive={showErrorLog}
          />

          {/* Error log panel — below question detail */}
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
                  {errorLogSaving ? 'Saving…' : errorLogSaved ? 'Saved' : 'Save Note'}
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
      <DesmosPopup isOpen={showCalc} onClose={() => setShowCalc(false)} />

      {/* Flashcard dialog */}
      {showFlashcardDialog && (
        <div className="modalOverlay" onClick={() => setShowFlashcardDialog(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="h2" style={{ marginBottom: 12 }}>Make Flashcard</div>

            <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>Set</label>
            <select
              className="input"
              value={flashcardSetId}
              onChange={(e) => setFlashcardSetId(e.target.value)}
              style={{ marginBottom: 12 }}
            >
              {flashcardSets.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.card_count})</option>
              ))}
            </select>

            <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>Front</label>
            <textarea
              className="input"
              value={flashcardFront}
              onChange={(e) => { setFlashcardFront(e.target.value); setFlashcardSaved(false); }}
              placeholder="Term, question, or concept…"
              rows={2}
              style={{ marginBottom: 12 }}
            />

            <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>Back</label>
            <textarea
              className="input"
              value={flashcardBack}
              onChange={(e) => { setFlashcardBack(e.target.value); setFlashcardSaved(false); }}
              placeholder="Definition, answer, or explanation…"
              rows={3}
              style={{ marginBottom: 16 }}
            />

            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setShowFlashcardDialog(false)}>
                Close
              </button>
              <button
                className="btn primary"
                onClick={saveFlashcard}
                disabled={flashcardSaving || !flashcardFront.trim() || !flashcardBack.trim() || !flashcardSetId}
              >
                {flashcardSaving ? 'Saving…' : flashcardSaved ? 'Saved!' : 'Save Card'}
              </button>
            </div>
          </div>
        </div>
      )}

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
