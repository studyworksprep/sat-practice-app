'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Toast from '../../components/Toast';

export default function ReviewPage() {
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/review');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load review list');
      setItems(json.items || []);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="container">
      <div className="card">
        <div className="h1">Review</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Questions you've marked for review.
        </p>
        <Toast kind={msg?.kind} message={msg?.text} />
        <hr />
        {loading ? (
          <div className="muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="muted">Nothing marked yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((q) => (
              <Link key={q.question_id} href={`/practice/${q.question_id}`} className="option">
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
                    Attempts: {q.attempts_count ?? 0} · Correct: {q.correct_attempts_count ?? 0}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
