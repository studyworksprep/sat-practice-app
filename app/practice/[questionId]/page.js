'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);

  // Instant navigation metadata (from list page)
  const [total, setTotal] = useState(null); // total in filtered session
  const [index1, setIndex1] = useState(null); // 1-based index in session

  // Cache: current page ids (25) for navigation
  const [pageIds, setPageIds] = useState([]); // ids for current offset page
  const [pageOffset, setPageOffset] = useState(0); // 0,25,50,...

  const startedAtRef = useRef(Date.now());

  // Keep the same session filter params for API calls + navigation
  const sessionParams = useMemo(() => {
    const keys = ['difficulty', 'score_bands', 'domain', 'topic', 'marked_only', 'q', 'session'];
    const p = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v !== null && v !== '') p.set(k, v);
    }
    return p;
  }, [searchParams]);

  function buildHref(targetId, t, o, p) {
    const qs = new URLSearchParams(sessionParams);
    if (t != null) qs.set('t', String(t));
    if (o != null) qs.set('o', String(o));
    if (p != null) qs.set('p', String(p));
    return `/practice/${targetId}?${qs.toString()}`;
  }

  async function fetchQuestion() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/questions/${questionId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load question');
      setData(json);

      if (json?.status?.status_json?.last_selected_option_id)
        setSelected(json.status.status_json.last_selected_option_id);
      else setSelected(null);

      if (json?.status?.status_json?.last_response_text)
        setResponseText(json.status.status_json.last_response_text);
      else setResponseText('');

      startedAtRef.current = Date.now();
      setShowExplanation(false);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

 async function fetchPageIds(offset) {
    // Include filter/session signature in the cache key so pages don't collide
    const sessionKey = sessionParams.toString(); // includes difficulty/score_bands/domain/topic/marked_only/q/session
    const key = `practice_${sessionKey}_page_${offset}`;
  
    // 1) try localStorage first
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }
  
    // 2) otherwise fetch this page (25) from API using current filters
    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session'); // not needed by API
    apiParams.set('limit', '25');
    apiParams.set('offset', String(offset));
  
    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch page');
    const ids = (json.items || []).map((it) => it.question_id).filter(Boolean);
  
    localStorage.setItem(key, JSON.stringify(ids));
    return ids;
  }

  function primeNavMetaFromUrl() {
    const t = Number(searchParams.get('t'));
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));

    // total
    if (Number.isFinite(t) && t >= 0) setTotal(t);

    // offset + index
    if (Number.isFinite(o) && o >= 0) setPageOffset(o);

    // index1 can be computed instantly if we have o + p
    if (Number.isFinite(o) && o >= 0 && Number.isFinite(p) && p >= 0) {
      setIndex1(o + p + 1);
    }
  }

  async function ensureCurrentPageIds() {
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));

    if (!Number.isFinite(o) || o < 0) return; // if user deep-linked, we’ll still work without it
    setPageOffset(o);

    const ids = await fetchPageIds(o);
    setPageIds(ids);

    // If p is missing (deep-link), try to compute p by finding the current id in this page
    if (!Number.isFinite(p) || p < 0) {
      const idx = ids.findIndex((id) => String(id) === String(questionId));
      if (idx >= 0) setIndex1(o + idx + 1);
    }
  }

  async function ensureTotalIfMissing() {
    if (total != null) return;

    // quick head request (limit=1) to get totalCount
    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', '1');
    apiParams.set('offset', '0');

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to get total');
    setTotal(Number(json.totalCount || 0));
  }

  async function goToIndex(targetIndex1) {
    if (total != null) {
      if (targetIndex1 < 1 || targetIndex1 > total) return;
    } else {
      if (targetIndex1 < 1) return;
    }

    const targetOffset = Math.floor((targetIndex1 - 1) / 25) * 25;
    const targetPos = (targetIndex1 - 1) % 25;

    const ids = await fetchPageIds(targetOffset);
    const targetId = ids[targetPos];

    if (!targetId) return;

    // Update local state immediately for snappy UI
    setPageOffset(targetOffset);
    setPageIds(ids);
    setIndex1(targetIndex1);

    router.push(buildHref(targetId, total, targetOffset, targetPos));
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
      // Intentionally do NOT auto-open explanation.
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function toggleMarkForReview() {
    if (!data?.question_id) return;
    const next = !Boolean(data?.status?.marked_for_review);
    try {
      setMsg(null);
      // Optimistic update
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
      // Revert on error
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
  
  useEffect(() => {
    if (!questionId) return;
  
    (async () => {
      try {
        const res = await fetch(
          `/api/questions/${questionId}/neighbors?${sessionParams.toString()}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load neighbors');
  
        setPrevId(json.prev_id);
        setNextId(json.next_id);
      } catch {
        setPrevId(null);
        setNextId(null);
      }
    })();
  }, [questionId, sessionParams]);
  // Load question content
  useEffect(() => {
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Prime meta immediately (instant #/total + button enable)
  useEffect(() => {
    primeNavMetaFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Ensure we have total + the current page ids (fast: 1 request max)
  useEffect(() => {
    (async () => {
      try {
        await ensureTotalIfMissing();
        await ensureCurrentPageIds();
      } catch (e) {
        setMsg({ kind: 'danger', text: e.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, searchParams]);

  const qType = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  const locked = Boolean(status?.is_done);
  const correctOptionId = data?.correct_option_id || null;
  const correctText = data?.correct_text || null;

  // Two-column “Reading” heuristic (safe + avoids affecting Math)
  const domainCode = String(data?.taxonomy?.domain_code || '').toUpperCase().trim();
  const useTwoColReading =
  qType === 'mcq' && ['EOI', 'INI', 'CAS', 'SEC'].includes(domainCode);

  const headerPills = [
    { label: 'Attempts', value: status?.attempts_count ?? 0 },
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
    { label: 'Marked', value: status?.marked_for_review ? 'Yes' : 'No' },
  ];

  const prevDisabled = index1 == null || index1 <= 1;
  const nextDisabled = index1 == null || (total != null && index1 >= total);

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="h2">Practice</div>

          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link className="btn secondary" href="/practice">
              ← Back to list
            </Link>

            <div className="pill">
              {index1 != null && total != null ? (
                <>
                  <span className="kbd">{index1}</span> / <span className="kbd">{total}</span>
                </>
              ) : total != null ? (
                <>
                  <span className="kbd">—</span> / <span className="kbd">{total}</span>
                </>
              ) : (
                <span className="muted">…</span>
              )}
            </div>
          </div>
        </div>

        <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {headerPills.map((p) => (
            <span key={p.label} className="pill">
              <span className="muted">{p.label}</span> <span className="kbd">{p.value}</span>
            </span>
          ))}
        </div>
      </div>

      <Toast kind={msg?.kind} message={msg?.text} />

      <hr />

      {/* ===============================
          MCQ
      =============================== */}
      {qType === 'mcq' ? (
        <div className={useTwoColReading ? 'qaTwoCol' : ''}>
          {/* LEFT column (Stimulus + Question) */}
          <div className={useTwoColReading ? 'qaLeft' : ''}>
            {version?.stimulus_html ? (
              <div className="card subcard" style={{ marginBottom: useTwoColReading ? 0 : 12 }}>
                <div className={useTwoColReading ? 'srOnly' : 'sectionLabel'}>Stimulus</div>
                <HtmlBlock className="prose" html={version.stimulus_html} />
              </div>
            ) : null}

            {version?.stem_html ? (
              <div className="card subcard" style={{ marginBottom: useTwoColReading ? 0 : 12 }}>
                <div className={useTwoColReading ? 'srOnly' : 'sectionLabel'}>Question</div>
                <HtmlBlock className="prose" html={version.stem_html} />
              </div>
            ) : null}
          </div>

          {/* RIGHT column (Answer choices + buttons) */}
          <div className={useTwoColReading ? 'qaRight' : ''}>
            {!useTwoColReading ? <div className="h2">Answer choices</div> : <div className="srOnly">Answer choices</div>}

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
                      
                          if (isSelected && isCorrect) {
                            cls += ' correct';
                          } else if (isSelected && !isCorrect) {
                            cls += ' incorrect';
                          }
                      
                          // IMPORTANT: no revealCorrect branch anymore
                        }
                      
                        return cls;
                      })()}
                      onClick={() => {
                        if (locked) return;
                        setSelected(opt.id);
                      }}
                      style={{ cursor: locked ? 'default' : 'pointer' }}
                    >
                      <div className="optionBadge">
                        {opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0))}
                      </div>

                      <div className="optionContent">
                        <HtmlBlock className="prose" html={opt.content_html} />
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Buttons: behavior unchanged */}
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <div className="btnRow">
                <button className="btn primary" onClick={submitAttempt} disabled={locked || !selected}>
                  Submit
                </button>

                <button className="btn secondary" onClick={toggleMarkForReview}>
                  {status?.marked_for_review ? 'Unmark review' : 'Mark for review'}
                </button>
              </div>

              {locked && (version?.rationale_html || version?.explanation_html) ? (
                <button className="btn secondary" onClick={() => setShowExplanation((s) => !s)}>
                  {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                </button>
              ) : null}

              <div className="btnRow">
                <button
                  className="btn secondary"
                  onClick={() => prevId && router.push(buildHref(prevId, total, null, null))}
                  disabled={!prevId}
                >
                  Prev
                </button>
                
                <button
                  className="btn secondary"
                  onClick={() => nextId && router.push(buildHref(nextId, total, null, null))}
                  disabled={!nextId}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
      /* ===============================
    SPR
    =============================== */
    <div>
      {/* Show stimulus + question for SPR too */}
      {version?.stimulus_html ? (
        <div className="card subcard" style={{ marginBottom: 12 }}>
          <div className="sectionLabel">Stimulus</div>
          <HtmlBlock className="prose" html={version.stimulus_html} />
        </div>
      ) : null}
    
      {version?.stem_html ? (
        <div className="card subcard" style={{ marginBottom: 12 }}>
          <div className="sectionLabel">Question</div>
          <HtmlBlock className="prose" html={version.stem_html} />
        </div>
      ) : null}
    
      <div className="h2">Your answer</div>
    
      {locked ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span className="pill">
            <span className="muted">Result</span>{' '}
            <span className="kbd">{status?.last_is_correct ? 'Correct' : 'Incorrect'}</span>
          </span>
    
          {!status?.last_is_correct && correctText ? (
            <span className="pill">
              <span className="muted">Correct answer</span>{' '}
              <span className="kbd">{formatCorrectText(correctText)?.join(' or ')}</span>
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
    
        <button className="btn secondary" onClick={toggleMarkForReview}>
          {status?.marked_for_review ? 'Unmark review' : 'Mark for review'}
        </button>
    
        {locked && (version?.rationale_html || version?.explanation_html) ? (
          <button className="btn secondary" onClick={() => setShowExplanation((s) => !s)}>
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        ) : null}
    
        <button className="btn secondary" onClick={() => goToIndex(index1 - 1)} disabled={prevDisabled}>
          Prev
        </button>
    
        <button className="btn secondary" onClick={() => goToIndex(index1 + 1)} disabled={nextDisabled}>
          Next
        </button>
      </div>
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
    </main>
  );
}
