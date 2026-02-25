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

                const href = `/practice/${encodeURIComponent(qid)}?${sessionQueryString}&t=${totalCount}&o=${offset}&p=${pos}&i=${i}`;

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
                      <div className="muted small">
                        {q.domain_name ? q.domain_name : '—'}
                        {q.skill_name ? ` • ${q.skill_name}` : ''}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <hr />

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button
              className="btn secondary"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              Prev
            </button>

            <button className="btn" onClick={() => setPage((p) => p + 1)} disabled={loading || rows.length < 25}>
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
