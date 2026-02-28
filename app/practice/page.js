'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Filters from '../../components/Filters';
import Toast from '../../components/Toast';

export default function PracticePage() {
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  // Build the "session filter" params once (no pagination params here).
  // These are what we carry into /practice/[questionId] so it can keep the same filtered session.
  const sessionQueryString = useMemo(() => {
    const p = new URLSearchParams();

    // Always include session=1 so the question page can treat this as "came from list"
    p.set('session', '1');

    if (filters.difficulty) p.set('difficulty', String(filters.difficulty));

    const bands = Array.isArray(filters.score_bands) ? filters.score_bands : [];
    if (bands.length > 0) p.set('score_bands', bands.join(','));

    if (filters.domain) p.set('domain', String(filters.domain));
    if (filters.topic) p.set('topic', String(filters.topic));
    if (filters.marked_only) p.set('marked_only', 'true');

    if (search.trim()) p.set('q', search.trim());

    return p.toString();
  }, [filters, search]);

  // Deterministic session id for this filtered set (used for localStorage-backed navigation)
  const sessionId = useMemo(() => {
    // djb2-ish hash (fast, stable)
    let h = 5381;
    const s = sessionQueryString || '';
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }, [sessionQueryString]);

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', '25');
      params.set('offset', String(page * 25));

      // Apply filters
      if (filters.difficulty) params.set('difficulty', String(filters.difficulty));

      const bands = Array.isArray(filters.score_bands) ? filters.score_bands : [];
      if (bands.length > 0) params.set('score_bands', bands.join(','));

      if (filters.domain) params.set('domain', String(filters.domain));
      if (filters.topic) params.set('topic', String(filters.topic));
      if (filters.marked_only) params.set('marked_only', 'true');

      if (search.trim()) params.set('q', search.trim());

      const res = await fetch('/api/questions?' + params.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load questions');

      const items = json.items || [];
      setTotalCount(Number(json.totalCount || 0));
      setRows(items);

      // Cache ONLY this page’s IDs, keyed by the session signature + offset
      if (items.length) {
        const ids = items.map((q) => q.question_id).filter(Boolean);
        const offset = page * 25;
        const sessionKey = sessionQueryString; // includes filters/search + session=1
        localStorage.setItem(`practice_${sessionKey}_page_${offset}`, JSON.stringify(ids));
      }

      // Cache the FULL ordered id list for this session (used for index-based prev/next + map jumps)
      // IMPORTANT: stitch pages using the SAME pagination (limit=25) to guarantee identical ordering.
      if (page === 0 && Number(json.totalCount || 0) > 0) {
        const fullKey = `practice_session_${sessionId}`;
        const metaKey = `practice_session_${sessionId}_meta`;

        const existingMetaRaw = localStorage.getItem(metaKey);
        let existingOk = false;
        try {
          const meta = existingMetaRaw ? JSON.parse(existingMetaRaw) : null;
          existingOk = Boolean(
            meta &&
              meta.sessionQueryString === sessionQueryString &&
              meta.totalCount === Number(json.totalCount || 0) &&
              meta.cachedCount === Number(json.totalCount || 0)
          );
        } catch {
          existingOk = false;
        }

        if (!existingOk || !localStorage.getItem(fullKey)) {
          // Don't block rendering; populate in the background.
          (async () => {
            try {
              const total = Number(json.totalCount || 0);
              const pageSize = 25;
              const pages = Math.ceil(total / pageSize);

              const all = [];
              for (let pg = 0; pg < pages; pg++) {
                const off = pg * pageSize;

                const fullParams = new URLSearchParams(params);
                fullParams.set('limit', String(pageSize));
                fullParams.set('offset', String(off));

                const r2 = await fetch('/api/questions?' + fullParams.toString(), { cache: 'no-store' });
                const j2 = await r2.json();
                if (!r2.ok) throw new Error(j2?.error || 'Failed to cache session ids');

                const ids = (j2.items || []).map((q) => q.question_id).filter(Boolean);
                all.push(...ids);
              }

              localStorage.setItem(fullKey, all.join(','));
              localStorage.setItem(
                metaKey,
                JSON.stringify({
                  sessionQueryString,
                  totalCount: total,
                  cachedCount: all.length,
                  cachedAt: new Date().toISOString(),
                })
              );
            } catch {
              // ignore caching errors; app will fall back to existing neighbor scheme
            }
          })();
        }
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  // Reset pagination when filters/search change
  useEffect(() => {
    setPage(0);
  }, [filters, search]);

  // Reload whenever page/filters/search change
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters, search]);

  return (
    <main className="container">
      <div className="practiceGrid">
        <div style={{ minWidth: 320 }}>
          <Filters onChange={setFilters} />
          <Toast kind={msg?.kind} message={msg?.text} />
        </div>

        <div className="card" style={{ minWidth: 320 }}>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="h2">Questions</div>
              <p className="muted small" style={{ marginTop: 0 }}>
                Showing up to 25 results per page. Click a row to practice.
              </p>
            </div>
            <div className="pill">
              Page <span className="kbd">{page + 1}</span>
            </div>
          </div>

          <div className="searchRow" style={{ marginTop: 10 }}>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search (QuestionID, stem, stimulus)…"
            />
            <button className="btn secondary" onClick={() => setSearch('')} disabled={!search}>
              Clear
            </button>
          </div>

          <hr />

          {loading ? (
            <div className="muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="muted">No questions match your filters.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {rows.map((q, idx) => {
                const qid = q?.question_id ? String(q.question_id) : '';
                if (!qid) return null;

                const offset = page * 25; // o
                const pos = idx; // p
                const i = offset + pos + 1; // 1-based index within the filtered list

                const href = `/practice/${encodeURIComponent(qid)}?${sessionQueryString}&sid=${sessionId}&t=${totalCount}&o=${offset}&p=${pos}&i=${i}`;

                return (
                  <Link
                    key={qid}
                    href={href}
                    className="option"
                    style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
                  >
                    <div style={{ minWidth: 64 }}>
                      <div className="pill">{q.difficulty ? `D${q.difficulty}` : 'D?'}</div>
                    </div>

                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ fontWeight: 600 }}>{q.question_id}</div>
                      <div className="muted small">{q.domain_name ? q.domain_name : '—'}</div>
                      {q.topic_name ? <div className="muted small">{q.topic_name}</div> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <hr />

          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Prev
            </button>

            <div className="muted small">
              {totalCount ? (
                <>
                  {page * 25 + 1}–{Math.min((page + 1) * 25, totalCount)} of {totalCount}
                </>
              ) : (
                '—'
              )}
            </div>

            <button
              className="btn secondary"
              disabled={(page + 1) * 25 >= totalCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
