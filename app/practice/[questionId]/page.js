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

  // Option A neighbor nav
  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);

  // Start false; we explicitly flip to true when we begin fetching neighbors
  const [navLoading, setNavLoading] = useState(false);

  const [navMode, setNavMode] = useState('neighbors'); // 'neighbors' | 'index' fallback

  // ✅ NEW: tracks which questionId the current prevId/nextId correspond to (prevents stale-enable flash)
  const [navForId, setNavForId] = useState(null);

  // Instant navigation metadata (from list page or neighbor navigation)
  const [total, setTotal] = useState(null); // total in filtered session
  const [index1, setIndex1] = useState(null); // 1-based index in session

  // Cache: current page ids (25) for index-based fallback navigation
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

  const sessionParamsString = useMemo(() => sessionParams.toString(), [sessionParams]);

  // support "i" (1-based index) for neighbor navigation
  function buildHref(targetId, t, o, p, i) {
    const qs = new URLSearchParams(sessionParams);
    if (t != null) qs.set('t', String(t));
    if (o != null) qs.set('o', String(o));
    if (p != null) qs.set('p', String(p));
    if (i != null) qs.set('i', String(i));
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
    const key = `practice_${sessionParamsString}_page_${offset}`;

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', '25');
    apiParams.set('offset', String(offset));

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch page');

    const ids = (json.items || []).map((it) => it.question_id).filter(Boolean);

    localStorage.setItem(key, JSON.stringify(ids));
    return ids;
  }

  // look for "i" (index) in URL
  function primeNavMetaFromUrl() {
    const t = Number(searchParams.get('t'));
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));
    const i = Number(searchParams.get('i'));

    if (Number.isFinite(t) && t >= 0) setTotal(t);
    if (Number.isFinite(o) && o >= 0) setPageOffset(o);

    if (Number.isFinite(i) && i >= 1) setIndex1(i);
    else if (Number.isFinite(o) && o >= 0 && Number.isFinite(p) && p >= 0) setIndex1(o + p + 1);
  }

  async function ensureCurrentPageIds() {
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));

    if (!Number.isFinite(o) || o < 0) return;
    setPageOffset(o);

    const ids = await fetchPageIds(o);
    setPageIds(ids);

    if (!Number.isFinite(p) || p < 0) {
      const idx = ids.findIndex((id) => String(id) === String(questionId));
      if (idx >= 0) setIndex1(o + idx + 1);
    }
  }

  async function ensureTotalIfMissing() {
    if (total != null) return;

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

    setPageOffset(targetOffset);
    setPageIds(ids);
    setIndex1(targetIndex1);

    router.push(buildHref(targetId, total, targetOffset, targetPos, targetIndex1));
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

  // ✅ Fetch neighbors (Option A) — prevent stale-enable by gating with navForId
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

    // Clear stale IDs immediately
    setPrevId(null);
    setNextId(null);
    setNavForId(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/questions/${questionId}/neighbors?${sessionParamsString}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load neighbors');

        setPrevId(json.prev_id || null);
        setNextId(json.next_id || null);

        // ✅ Mark that these neighbors belong to this question
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

  // Load question content
  useEffect(() => {
    if (!questionId) return;
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Prime meta immediately
  useEffect(() => {
    primeNavMetaFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Ensure we have total + current page ids (fallback nav)
  useEffect(() => {
    if (!questionId) return;
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

  const domainCode = String(data?.taxonomy?.domain_code || '').toUpperCase().trim();
  const useTwoColReading = qType === 'mcq' && ['EOI', 'INI', 'CAS', 'SEC'].includes(domainCode);

  const headerPills = [
    { label: 'Attempts', value: status?.attempts_count ?? 0 },
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
    { label: 'Marked', value: status?.marked_for_review ? 'Yes' : 'No' },
  ];

  const prevDisabled = navLoading || !index1 || index1 <= 1 || !prevId;
  const nextDisabled = navLoading || !index1 || !total || index1 >= total || !nextId;

  // ✅ Only enable neighbor nav when neighbors are loaded for THIS questionId
  const neighborsReady = navMode === 'neighbors' && navForId === questionId && !navLoading;

  const goPrev = () => {
    if (navMode === 'neighbors') {
      if (prevDisabled) return;

      const nextI = index1 != null ? Math.max(1, index1 - 1) : null;
      setIndex1(nextI);

      router.push(buildHref(prevId, total, null, null, nextI));
      return;
    }
    if (index1 == null) return;
    goToIndex(index1 - 1);
  };

  const goNext = () => {
    if (navMode === 'neighbors') {
      if (nextDisabled) return;

      const nextI = index1 != null ? index1 + 1 : null;
      setIndex1(nextI);

      router.push(buildHref(nextId, total, null, null, nextI));
      return;
    }
    if (index1 == null) return;
    goToIndex(index1 + 1);
  };

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

      {qType === 'mcq' ? (
        <div className={useTwoColReading ? 'qaTwoCol' : ''}>
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

          <div className={useTwoColReading ? 'qaRight' : ''}>
            {!useTwoColReading ? (
              <div className="h2">Answer choices</div>
            ) : (
              <div className="srOnly">Answer choices</div>
            )}

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
                <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
                  Prev
                </button>

                <button className="btn secondary" onClick={goNext} disabled={nextDisabled}>
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
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

            <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
              Prev
            </button>

            <button className="btn secondary" onClick={goNext} disabled={nextDisabled}>
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
