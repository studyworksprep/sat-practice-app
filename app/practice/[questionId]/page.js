'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';

function HtmlBlock({ html }) {
  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
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

  // Instant navigation metadata (from list page)
  const [total, setTotal] = useState(null);     // total in filtered session
  const [index1, setIndex1] = useState(null);   // 1-based index in session

  // Cache: current page ids (25) for navigation
  const [pageIds, setPageIds] = useState([]);   // ids for current offset page
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

      if (json?.status?.last_selected_option_id) setSelected(json.status.last_selected_option_id);
      else setSelected(null);

      if (json?.status?.last_response_text) setResponseText(json.status.last_response_text);
      else setResponseText('');

      startedAtRef.current = Date.now();
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

    const qType = data?.version?.question_type || data?.question_type;
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    const body = {
      question_id: data.question_id,
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

      await fetchQuestion();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

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

  const prevDisabled = index1 == null || index1 <= 1;
  const nextDisabled = index1 == null || (total != null && index1 >= total);

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
              <button className="btn" onClick={submitAttempt} disabled={locked || !selected}>
                Submit
              </button>

              <button
                className="btn secondary"
                onClick={() => goToIndex(index1 - 1)}
                disabled={prevDisabled}
              >
                Prev
              </button>

              <button
                className="btn secondary"
                onClick={() => goToIndex(index1 + 1)}
                disabled={nextDisabled}
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
              >
                Submit
              </button>

              <button
                className="btn secondary"
                onClick={() => goToIndex(index1 - 1)}
                disabled={prevDisabled}
              >
                Prev
              </button>

              <button
                className="btn secondary"
                onClick={() => goToIndex(index1 + 1)}
                disabled={nextDisabled}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {version?.explanation_html ? (
          <>
            <hr />
            <div className="h2">Explanation</div>
            <div className="card" style={{ marginTop: 10 }}>
              <HtmlBlock html={version.explanation_html} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
