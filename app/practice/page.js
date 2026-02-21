'use client';

import { useEffect, useState } from 'react';
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

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '25');
      params.set('offset', String(page * 25));

      if (filters.difficulty) params.set('difficulty', filters.difficulty);

      const bands = Array.isArray(filters.score_bands) ? filters.score_bands : [];
      if (bands.length > 0) params.set('score_bands', bands.join(','));

      if (filters.domain) params.set('domain', filters.domain);
      if (filters.topic) params.set('topic', filters.topic);
      if (filters.marked_only) params.set('marked_only', 'true');

      if (search.trim()) params.set('q', search.trim());

      const res = await fetch('/api/questions?' + params.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load questions');
      setRows(json.items || []);
      if (json.items?.length) {
        const ids = json.items.map(q => q.question_id);
        localStorage.setItem('practice_question_list', JSON.stringify(ids));
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(0);
  }, [filters, search]);

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
              {rows.map((q) => (
                <Link key={q.question_id} href={`/practice/${q.question_id}`} className="option" style={{ cursor: 'pointer' }}>
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
              ))}
            </div>
          )}

          <hr />

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn secondary" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
              Prev
            </button>
            <button className="btn secondary" onClick={() => setPage(p => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
