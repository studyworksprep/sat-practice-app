'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';

// Minimal safe HTML renderer (matches your existing pattern)
function HtmlBlock({ html }) {
  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function uniq(arr) {
  const s = new Set();
  const out = [];
  for (const x of arr || []) {
    if (!x) continue;
    if (s.has(x)) continue;
    s.add(x);
    out.push(x);
  }
  return out;
}

export default function PracticeQuestionPage() {
  const { questionId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const [questionIds, setQuestionIds] = useState([]);
  const [index1, setIndex1] = useState(null); // 1-based index in list
  const [total, setTotal] = useState(null);

  const [selected, setSelected] = useState(null);
  const [responseText, setResponseText] = useState('');

  const startedAtRef = useRef(Date.now());

  // Build filter params (same names as practice list)
  const sessionParams = useMemo(() => {
    const keys = ['difficulty', 'score_bands', 'domain', 'topic', 'marked_only', 'q', 'session'];
    const p = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v !== null && v !== '') p.set(k, v);
    }
    return p;
  }, [searchParams]);

  const hasAnyFilters = useMemo(() => {
    // "session" doesn’t count as a filter; it just indicates navigation from list
    const keys = ['difficulty', 'score_bands', 'domain', 'topic', 'marked_only', 'q'];
    return keys.some((k) => sessionParams.has(k));
  }, [sessionParams]);

  async function fetchQuestion() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/questions/${questionId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load question');
      setData(json);

      // Preselect last selected option if present
      if (json?.status?.last_selected_option_id) {
        setSelected(json.status.last_selected_option_id);
      } else {
        setSelected(null);
      }

      // If FR, restore last response if present
      if (json?.status?.last_response_text) {
        setResponseText(json.status.last_response_text);
      } else {
        setResponseText('');
      }

      startedAtRef.current = Date.now();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllIdsWithParams(paramsObj) {
    const limit = 100; // your /api/questions caps at 100
    let offset = 0;

    // first request to get totalCount and first batch
    const first = new URLSearchParams({ ...paramsObj, limit: String(limit), offset: '0' });
    const firstRes = await fetch('/api/questions?' + first.toString(), { cache: 'no-store' });
    const firstJson = await firstRes.json();
    if (!firstRes.ok) throw new Error(firstJson?.error || 'Failed to fetch question list');

    const totalCount = Number(firstJson.totalCount || 0);
    const ids = (firstJson.items || []).map((it) => it.question_id);

    offset += limit;

    while (ids.length < totalCount) {
      const p = new URLSearchParams({ ...paramsObj, limit: String(limit), offset: String(offset) });
      const res = await fetch('/api/questions?' + p.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to fetch question list');

      const batch = (json.items || []).map((it) => it.question_id);
      ids.push(...batch);

      if (batch.length < limit) break;
      offset += limit;
    }

    return { ids: uniq(ids), totalCount };
  }

  async function ensureQuestionList() {
    // We want the correct total ALWAYS.
    // Strategy:
    // 1) Ask API for totalCount for current params (filters if present, else unfiltered).
    // 2) If local list length matches totalCount, use it.
    // 3) Otherwise fetch all IDs and store into localStorage + state.

    const paramsObj = {};
    for (const [k, v] of sessionParams.entries()) {
      // exclude session flag; it’s just a marker
      if (k === 'session') continue;
      paramsObj[k] = v;
    }

    // Step 1: get authoritative totalCount cheaply
    const headParams = new URLSearchParams({ ...paramsObj, limit: '1', offset: '0' });
    const headRes = await fetch('/api/questions?' + headParams.toString(), { cache: 'no-store' });
    const headJson = await headRes.json();
    if (!headRes.ok) throw new Error(headJson?.error || 'Failed to get total count');
    const totalCount = Number(headJson.totalCount || 0);

    setTotal(totalCount);

    // Step 2: read localStorage list
    const savedRaw = localStorage.getItem('practice_question_list');
    let saved = [];
    try {
      saved = JSON.parse(savedRaw || '[]');
    } catch {
      saved = [];
    }

    // If filters exist, the saved list is very likely not the right set.
    // If no filters exist, saved is often only the current page (25).
    const savedLooksComplete =
      Array.isArray(saved) &&
      saved.length > 0 &&
      totalCount > 0 &&
      saved.length === totalCount;

    if (savedLooksComplete) {
      setQuestionIds(saved);
      return;
    }

    // Step 3: fetch all IDs
    const { ids } = await fetchAllIdsWithParams(paramsObj);
    localStorage.setItem('practice_question_list', JSON.stringify(ids));
    setQuestionIds(ids);
  }

  async function submitAttempt() {
    if (!data) return;

    const qType = data?.version?.question_type || data?.question_type;

    // lock if already done for MCQ? (your app may allow reattempts; this is conservative)
    // We'll still allow submit if selected/response exists.
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    const body = {
      question_id: data.question_id, // expects UUID
      selected_option_id: qType === 'mcq' ? selected : null,
      response_text: qType === 'fr' ? responseText : null,
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

      // Re-fetch question to update status (done/marked/last correctness, etc)
      await fetchQuestion();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  function goToRelative(delta) {
    if (!questionIds || questionIds.length === 0) return;
    const currentIdx0 = questionIds.findIndex((id) => String(id) === String(questionId));
    if (currentIdx0 < 0) return;
    const nextIdx0 = Math.min(Math.max(currentIdx0 + delta, 0), questionIds.length - 1);
    const nextId = questionIds[nextIdx0];
    if (!nextId) return;

    // Preserve session params in navigation
    const qs = sessionParams.toString();
    router.push(qs ? `/practice/${nextId}?${qs}` : `/practice/${nextId}`);
  }

  // Load question content
  useEffect(() => {
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Ensure the list for #/total + navigation
  useEffect(() => {
    // If user navigated directly, we still want correct total (unfiltered)
    ensureQuestionList()
      .then(() => {})
      .catch((e) => setMsg({ kind: 'danger', text: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, questionId]);

  // Compute index when list is ready
  useEffect(() => {
    if (!questionIds || questionIds.length === 0) {
      setIndex1(null);
      return;
    }
    const idx0 = questionIds.findIndex((id) => String(id) === String(questionId));
    setIndex1(idx0 >= 0 ? idx0 + 1 : null);
  }, [questionIds, questionId]);

  if (loading && !data) {
    return (
      <main className="container">
        <div className="card">
          <div className="muted">Loading…</div>
        </div>
      </main>
    );
  }

  const qType = data?.version?.question_type || data?.question_type;
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  const locked = Boolean(status?.is_done);

  const headerPills = [
    { label: 'Attempts', value: status?.attempts_count ?? 0 },
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
    { label: 'Marked', value: status?.marked_for_review ? 'Yes' : 'No' },
  ];

  return (
    <main className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="h2">Practice</div>

            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              <Link className="btn secondary" href="/practice">
                ← Back to list
              </Link>

              <div className="pill">
                {index1 && total !== null ? (
                  <>
                    <span className="kbd">{index1}</span> / <span className="kbd">{total}</span>
                  </>
                ) : total !== null ? (
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
                <span className="muted">{p.label}</span>{' '}
                <span className="kbd">{p.value}</span>
              </span>
            ))}
          </div>
        </div>

        <Toast kind={msg?.kind} message={msg?.text} />

        <hr />

        {/* Stimulus + Stem */}
        {version?.stimulus_html ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="muted small" style={{ marginBottom: 8 }}>
              Stimulus
            </div>
            <HtmlBlock html={version.stimulus_html} />
          </div>
        ) : null}

        {version?.stem_html ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="muted small" style={{ marginBottom: 8 }}>
              Question
            </div>
            <HtmlBlock html={version.stem_html} />
          </div>
        ) : null}

        {/* Answer area */}
        {qType === 'mcq' ? (
          <div>
            <div className="h2">Answer choices</div>

            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {options
                .slice()
                .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
                .map((opt) => {
                  const isSelected = selected === opt.id;

                  return (
                    <div
                      key={opt.id}
                      className={'option' + (isSelected ? ' selected' : '')}
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
                        <HtmlBlock html={opt.content_html} />
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <button
                className="btn"
                onClick={submitAttempt}
                disabled={locked || !selected}
                title={locked ? 'Already completed' : !selected ? 'Select an answer' : 'Submit'}
              >
                Submit
              </button>

              <button
                className="btn secondary"
                onClick={() => goToRelative(-1)}
                disabled={!questionIds?.length || (index1 !== null && index1 <= 1)}
              >
                Prev
              </button>

              <button
                className="btn secondary"
                onClick={() => goToRelative(1)}
                disabled={
                  !questionIds?.length || (index1 !== null && total !== null && index1 >= total)
                }
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="h2">Your answer</div>
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
              <button
                className="btn"
                onClick={submitAttempt}
                disabled={locked || !responseText.trim()}
                title={locked ? 'Already completed' : !responseText.trim() ? 'Enter an answer' : 'Submit'}
              >
                Submit
              </button>

              <button
                className="btn secondary"
                onClick={() => goToRelative(-1)}
                disabled={!questionIds?.length || (index1 !== null && index1 <= 1)}
              >
                Prev
              </button>

              <button
                className="btn secondary"
                onClick={() => goToRelative(1)}
                disabled={
                  !questionIds?.length || (index1 !== null && total !== null && index1 >= total)
                }
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Optional explanation block if your API provides it */}
        {version?.explanation_html ? (
          <>
            <hr />
            <div className="h2">Explanation</div>
            <div className="card" style={{ marginTop: 10 }}>
              <HtmlBlock html={version.explanation_html} />
            </div>
          </>
        ) : null}

        {/* Small debug hint if no filters and session missing */}
        {!hasAnyFilters && !sessionParams.has('session') ? (
          <div className="muted small" style={{ marginTop: 14 }}>
            Tip: navigating from the list includes a session flag so the full list count stays accurate.
          </div>
        ) : null}
      </div>
    </main>
  );
}
