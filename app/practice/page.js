'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Filters from '../../components/Filters';
import Toast from '../../components/Toast';
import { createClient } from '../../lib/supabase/browser';

export default function PracticePage() {
  const supabase = createClient();
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(0);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '25');
      params.set('offset', String(page * 25));
      if (filters.difficulty) params.set('difficulty', filters.difficulty);
      if (filters.score_band) params.set('score_band', filters.score_band);
      if (filters.domain) params.set('domain', filters.domain);
      if (filters.skill) params.set('skill', filters.skill);
      if (filters.marked_only) params.set('marked_only', 'true');

      const res = await fetch('/api/questions?' + params.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load questions');
      setRows(json.items || []);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(0);
  }, [filters]);

  useEffect(() => {
    load();
  }, [page, filters]);

  return (
    <main className="container">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ flex: 1.2 }}>
          <Filters onChange={setFilters} />
          <Toast kind={msg?.kind} message={msg?.text} />
          <div style={{ marginTop: 12 }} className="card">
            <div className="h2">Questions</div>
            <p className="muted small" style={{ marginTop: 0 }}>
              Showing up to 25 results per page. Click a row to practice.
            </p>
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
                        <span className="muted">{q.skill_name || q.skill_code || 'Skill'}</span>
                      </div>
                      <div className="muted small">
                        Score band: {q.score_band ?? '—'} · Marked: {q.marked_for_review ? 'Yes' : 'No'} · Done: {q.is_done ? 'Yes' : 'No'}
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
              <span className="pill">Page <span className="kbd">{page + 1}</span></span>
              <button className="btn secondary" onClick={() => setPage(p => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="col" style={{ flex: 0.8 }}>
          <div className="card">
            <div className="h2">Tips</div>
            <ul className="muted" style={{ marginTop: 0 }}>
              <li>Use filters to narrow difficulty and topic.</li>
              <li>Mark questions for review after submitting.</li>
              <li>All HTML fields render as stored (stimulus/stem/options/rationale).</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
