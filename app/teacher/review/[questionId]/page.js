'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
          if (isStudentSelected) cls += ' selected';
          if (isStudentSelected && isCorrect) cls += ' correct';
          if (isStudentSelected && !isCorrect) cls += ' incorrect';
          if (!isStudentSelected && isCorrect) cls += ' revealCorrect';

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
        {accepted && (
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
    <div className="row" style={{ gap: 10, marginTop: 14 }}>
      <button className="btn secondary" onClick={() => goToIndex(index1 - 1)} disabled={prevDisabled}>
        Prev
      </button>
      <button className="btn secondary" onClick={() => goToIndex(index1 + 1)} disabled={nextDisabled}>
        Next
      </button>
      <Link className="btn secondary" href={studentId ? `/teacher?selected=${studentId}` : '/teacher'}>
        Back to Student Dashboard
      </Link>
    </div>
  );

  const Explanation = () => {
    if (!version?.rationale_html) return null;
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
            <ResultBadge />
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
    </main>
  );
}
