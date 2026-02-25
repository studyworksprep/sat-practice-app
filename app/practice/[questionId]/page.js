'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Toast from '../../../components/Toast';

function HtmlBlock({ html }) {
  if (!html) return null;
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function PracticeQuestionPage({ params }) {
  const questionId = params?.questionId;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  // Answer input
  const [selected, setSelected] = useState(null); // option uuid for mcq
  const [responseText, setResponseText] = useState(''); // for spr/fr

  // UX
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  // Instant navigation metadata (from list page)
  const [total, setTotal] = useState(null); // total in filtered session
  const [index1, setIndex1] = useState(null); // 1-based index in session

  // Cache: current page ids (25) for navigation
  const [pageIds, setPageIds] = useState([]); // ids for current offset page
  const [pageOffset, setPageOffset] = useState(0); // 0,25,50,...

  const startedAtRef = useRef(Date.now());
  const ensuringRef = useRef(false);

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

  const qType = data?.version?.question_type || data?.question_type;
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  const locked = Boolean(status?.is_done);

  const explanationHtml = version?.explanation_html || version?.rationale_html || null;

  function buildHref(targetId, t, o, p) {
    const qs = new URLSearchParams(sessionParams);
    if (t != null) qs.set('t', String(t));
    if (o != null) qs.set('o', String(o));
    if (p != null) qs.set('p', String(p));
    return `/practice/${targetId}?${qs.toString()}`;
  }

  async function fetchQuestion({ resetUI } = { resetUI: false }) {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/questions/${questionId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load question');

      setData(json);

      // hydrate last inputs
      if (json?.status?.last_selected_option_id) setSelected(json.status.last_selected_option_id);
      else setSelected(null);

      if (json?.status?.last_response_text) setResponseText(json.status.last_response_text);
      else setResponseText('');

      startedAtRef.current = Date.now();

      if (resetUI) {
        setHasSubmitted(false);
        setShowExplanation(false);
        setMsg(null);
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function fetchPageIds(offset) {
    // 1) try localStorage first
    const key = `practice_page_${offset}`;
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

    if (Number.isFinite(t) && t >= 0) setTotal(t);

    if (Number.isFinite(o) && o >= 0) setPageOffset(o);

    if (Number.isFinite(o) && o >= 0 && Number.isFinite(p) && p >= 0) {
      setIndex1(o + p + 1);
    }
  }

  async function ensureTotalIfMissing() {
    if (total != null) return;

    // If there's no session/filter params, we still want total for UX
    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', '1');
    apiParams.set('offset', '0');

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to load total');
    if (typeof json.total === 'number') setTotal(json.total);
  }

  async function ensureCurrentPageIds() {
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));
    if (!Number.isFinite(o) || o < 0 || !Number.isFinite(p) || p < 0) return;

    const ids = await fetchPageIds(o);
    setPageIds(ids);
    setPageOffset(o);

    // If the questionId doesn’t match the expected slot (rare), try to repair index1
    const idxInPage = ids.indexOf(questionId);
    if (idxInPage >= 0) setIndex1(o + idxInPage + 1);
  }

  function canGoPrev() {
    if (index1 == null) return false;
    return index1 > 1;
  }

  function canGoNext() {
    if (index1 == null || total == null) return false;
    return index1 < total;
  }

  async function goToIndex(targetIndex1) {
    if (ensuringRef.current) return;
    ensuringRef.current = true;
    try {
      if (total == null) await ensureTotalIfMissing();

      const t = total;
      const targetOffset = Math.floor((targetIndex1 - 1) / 25) * 25;
      const targetPos = (targetIndex1 - 1) % 25;

      const ids = await fetchPageIds(targetOffset);
      const targetId = ids[targetPos];
      if (!targetId) return;

      setPageOffset(targetOffset);
      setPageIds(ids);
      setIndex1(targetIndex1);

      router.push(buildHref(targetId, t, targetOffset, targetPos));
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      ensuringRef.current = false;
    }
  }

  async function toggleMarked() {
    const next = !(data?.status?.marked_for_review ?? false);

    // optimistic UI
    setData((prev) => ({
      ...prev,
      status: { ...(prev?.status || {}), marked_for_review: next },
    }));

    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          marked_for_review: next,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to update status');
    } catch (e) {
      // rollback on failure
      setData((prev) => ({
        ...prev,
        status: { ...(prev?.status || {}), marked_for_review: !next },
      }));
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function submitAttempt() {
    if (!data) return;

    // Validate input
    if (qType === 'mcq') {
      if (!selected) {
        setMsg({ kind: 'danger', text: 'Select an answer choice first.' });
        return;
      }
    } else if (qType === 'spr' || qType === 'fr') {
      if (!responseText.trim()) {
        setMsg({ kind: 'danger', text: 'Type an answer first.' });
        return;
      }
    } else {
      setMsg({ kind: 'danger', text: 'Unsupported question type.' });
      return;
    }

    setSubmitting(true);
    setMsg(null);

    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    const body = {
      question_id: data.question_id,
      selected_option_id: qType === 'mcq' ? selected : null,
      response_text: qType === 'spr' || qType === 'fr' ? responseText : null,
      time_spent_ms,
    };

    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit attempt');

      // show correctness via highlight (and optional toast)
      setHasSubmitted(true);

      // Refresh question/status so last_is_correct + counts update
      await fetchQuestion({ resetUI: false });

      // If they got it wrong, keeping explanation one click away is nicer than auto-pop
      // (You can flip this to true if you want auto-open.)
      // setShowExplanation(true);

      // Light toast (optional). Comment out if you want highlight-only.
      if (typeof json.is_correct === 'boolean') {
        setMsg({
          kind: json.is_correct ? 'ok' : 'danger',
          text: json.is_correct ? 'Correct ✅' : 'Incorrect ❌',
        });
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  function resetAnswerUI() {
    setHasSubmitted(false);
    setShowExplanation(false);
    setMsg(null);

    // restore last saved input if any
    if (data?.status?.last_selected_option_id) setSelected(data.status.last_selected_option_id);
    else setSelected(null);

    if (data?.status?.last_response_text) setResponseText(data.status.last_response_text);
    else setResponseText('');

    startedAtRef.current = Date.now();
  }

  // Load question content
  useEffect(() => {
    if (!questionId) return;
    fetchQuestion({ resetUI: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Prime meta immediately (instant #/total + button enable)
  useEffect(() => {
    primeNavMetaFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Ensure we have total + the current page ids (fast: 1 request max each)
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

  const headerPills = [
    { label: 'Attempts', value: status?.attempts_count ?? 0 },
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
  ];

  const correctness =
    status?.last_is_correct === true ? 'Correct' : status?.last_is_correct === false ? 'Incorrect' : null;

  return (
    <main className="container">
      <div className="card">
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="h2" style={{ marginRight: 6 }}>
              Practice
            </div>

            {index1 != null && total != null && (
              <span className="pill" title="Position in filtered set">
                <span className="muted">Question</span> <span className="kbd">{index1}</span>
                <span className="muted">/</span> <span className="kbd">{total}</span>
              </span>
            )}

            {correctness && (
              <span className={'pill ' + (status?.last_is_correct ? 'ok' : 'danger')}>
                {correctness}
              </span>
            )}

            {headerPills.map((p) => (
              <span key={p.label} className="pill">
                <span className="muted">{p.label}</span> <span className="kbd">{p.value}</span>
              </span>
            ))}
          </div>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn secondary" onClick={() => goToIndex(index1 - 1)} disabled={!canGoPrev()}>
              Prev
            </button>
            <button className="btn secondary" onClick={() => goToIndex(index1 + 1)} disabled={!canGoNext()}>
              Next
            </button>
          </div>
        </div>

        <Toast kind={msg?.kind} message={msg?.text} />

        <hr />

        {loading ? (
          <div className="muted">Loading…</div>
        ) : !data ? (
          <div className="muted">No question data found.</div>
        ) : (
          <>
            {/* Stimulus + Stem */}
            <div style={{ display: 'grid', gap: 12 }}>
              {version?.stimulus_html ? <HtmlBlock html={version.stimulus_html} /> : null}
              {version?.stem_html ? <HtmlBlock html={version.stem_html} /> : null}
            </div>

            <hr />

            {/* Answer area */}
            {qType === 'mcq' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {options.map((opt, i) => {
                  const label = String.fromCharCode(65 + i);
                  const isSelected = selected === opt.option_id;

                  const optionClass =
                    'option' +
                    (isSelected ? ' selected' : '') +
                    (hasSubmitted && isSelected && status?.last_is_correct === true ? ' correct' : '') +
                    (hasSubmitted && isSelected && status?.last_is_correct === false ? ' incorrect' : '');

                  return (
                    <button
                      key={opt.option_id}
                      className={optionClass}
                      onClick={() => setSelected(opt.option_id)}
                      disabled={submitting || loading}
                      style={{ textAlign: 'left' }}
                    >
                      <div className="mcqRow">
                        <div className="mcqBubble" aria-hidden="true">
                          {label}
                        </div>
                        <div className="mcqText">
                          <HtmlBlock html={opt.option_html} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div className="muted small">Your answer</div>
                <input
                  className="input"
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Type your answer…"
                  disabled={submitting || loading}
                />
              </div>
            )}

            <hr />

            {/* Actions */}
            <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={submitAttempt} disabled={submitting || loading}>
                  {submitting ? 'Checking…' : 'Check Answer'}
                </button>

                <button
                  className="btn secondary"
                  onClick={toggleMarked}
                  disabled={loading}
                  title="Mark this question to revisit later"
                >
                  {status?.marked_for_review ? 'Unmark' : 'Mark for review'}
                </button>

                <button className="btn secondary" onClick={resetAnswerUI} disabled={submitting || loading}>
                  Reset
                </button>
              </div>

              {explanationHtml ? (
                <button className="btn secondary" onClick={() => setShowExplanation((v) => !v)}>
                  {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                </button>
              ) : null}
            </div>

            {showExplanation && explanationHtml ? (
              <>
                <hr />
                <div className="card" style={{ background: 'var(--panel)' }}>
                  <div className="h3">Explanation</div>
                  <HtmlBlock html={explanationHtml} />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
