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

  // Build the "session filter" params once (no pagination params here).
  // These are what we want to carry into /practice/[questionId] so it can rebuild the full list.
  const sessionQueryString = useMemo(() => {
    const p = new URLSearchParams();

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
      setRows(items);

      // Keep your existing behavior: store ONLY the current page's IDs
      // (the question page will rebuild the full list using the query params)
      if (items.length) {
        const ids = items.map((q) => q.question_id);
        localStorage.setItem('practice_question_list', JSON.stringify(ids));
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
              {rows.map((q) => {
                const href = sessionQueryString
                  ? `/practice/${q.question_id}?${sessionQueryString}`
                  : `/practice/${q.question_id}`;

                return (
                  <Link
                    key={q.question_id}
                    href={href}
                    className="option"
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ minWidth: 64 }}>
                      <div className="pill">{q.difficulty ? `D${q.difficulty}` : 'D?'}</div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 650 }}>
                        {q.domain_name || q.domain_code || 'Domain'}
                        <span className="muted"> · </span>
                        <span className="muted">{q.skill_name || q.skill_code || 'Topic'}</span>
                      </div>

                      <div className="row small muted" style={{ marginTop: 4 }}>
                        <span>Score band {q.score_band ?? '—'}</span>
                        <span>•</span>
                        <span>{q.is_done ? 'Completed' : 'Not completed'}</span>
                        {q.marked_for_review && (
                          <>
                            <span>•</span>
                            <span>Marked for review</span>
                          </>
                        )}
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
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button className="btn secondary" onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
