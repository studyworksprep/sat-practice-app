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

  // Neighbor nav
  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);
  const [navLoading, setNavLoading] = useState(false);

  // ✅ Tracks which questionId the current prevId/nextId correspond to
  const [navForId, setNavForId] = useState(null);

  // Keep index/total for UI count
  const [total, setTotal] = useState(null);
  const [index1, setIndex1] = useState(null);

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

  function buildHref(targetId, t, i) {
    const qs = new URLSearchParams(sessionParams);
    if (t != null) qs.set('t', String(t));
    if (i != null) qs.set('i', String(i));
    return `/practice/${targetId}?${qs.toString()}`;
  }

  function primeNavMetaFromUrl() {
    const t = Number(searchParams.get('t'));
    const i = Number(searchParams.get('i'));

    if (Number.isFinite(t) && t >= 0) setTotal(t);
    if (Number.isFinite(i) && i >= 1) setIndex1(i);
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
          status: { ...(prev.status || {}), marked_for_review: next },
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
          status: { ...(prev.status || {}), marked_for_review: !next },
        };
      });
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  // Prime index/total from URL
  useEffect(() => {
    primeNavMetaFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Ensure we have total (for UI)
  useEffect(() => {
    if (!questionId) return;
    (async () => {
      try {
        await ensureTotalIfMissing();
      } catch (e) {
        setMsg({ kind: 'danger', text: e.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, searchParams]);

  // Load question content
  useEffect(() => {
    if (!questionId) return;
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // ✅ Fetch neighbors (Option A) with “navForId” gating to prevent stale-enabled Prev
  useEffect(() => {
    if (!questionId) {
      setNavLoading(false);
      setPrevId(null);
      setNextId(null);
      setNavForId(null);
      return;
    }

    // Immediately invalidate any prior neighbor state for UI gating
    setNavLoading(true);
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

        // ✅ Mark that prev/next now belong to this questionId
        setNavForId(questionId);
      } catch (e) {
        setMsg({ kind: 'danger', text: `Neighbors failed: ${e.message}` });
        setPrevId(null);
        setNextId(null);
        setNavForId(null);
      } finally {
        setNavLoading(false);
      }
    })();
  }, [questionId, sessionParamsString]);

  const qType = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  const locked = Boolean(status?.is_done);
  const correctOptionId = data?.correct_option_id || null;
  const correctText = data?.correct_text || null;

  // ✅ Only enable if neighbors are for THIS questionId
  const neighborsReady = navForId === questionId && !navLoading;

  const prevDisabled = !neighborsReady || !prevId;
  const nextDisabled = !neighborsReady || !nextId;

  const goPrev = () => {
    if (prevDisabled) return;
    const nextI = index1 != null ? Math.max(1, index1 - 1) : null;
    setIndex1(nextI);
    router.push(buildHref(prevId, total, nextI));
  };

  const goNext = () => {
    if (nextDisabled) return;
    const nextI = index1 != null ? index1 + 1 : null;
    setIndex1(nextI);
    router.push(buildHref(nextId, total, nextI));
  };

  const headerPills = [
    { label: 'Attempts', value: status?.attempts_count ?? 0 },
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
    { label: 'Marked', value: status?.marked_for_review ? 'Yes' : 'No' },
  ];

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

          <div className="h2">Answer choices</div>

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
            <button className="btn primary" onClick={submitAttempt} disabled={locked || !selected}>
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
