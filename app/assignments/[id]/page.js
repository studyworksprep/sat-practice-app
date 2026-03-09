'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFF_COLORS = { 1: '#4caf50', 2: '#f0a830', 3: '#e05252' };

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

export default function AssignmentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/assignments/${id}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function startPractice() {
    if (!data?.questions?.length) return;
    // Find the first incomplete question, or start from the beginning
    const incomplete = data.questions.filter(q => !q.is_done);
    const toStart = incomplete.length > 0 ? incomplete : data.questions;
    const ids = toStart.map(q => q.question_id);
    const sid = `assignment_${id}_${Date.now()}`;
    localStorage.setItem(`practice_session_${sid}`, JSON.stringify(
      ids.map(qid => ({ question_id: qid }))
    ));
    localStorage.setItem(`practice_session_${sid}_meta`, JSON.stringify({
      sessionQueryString: `session=1`,
      totalCount: ids.length,
      cachedCount: ids.length,
      cachedAt: new Date().toISOString(),
    }));
    router.push(`/practice/${encodeURIComponent(ids[0])}?session=1&sid=${sid}&t=${ids.length}&o=0&p=0&i=1`);
  }

  if (loading) return <main className="container" style={{ padding: '40px 20px' }}><p className="muted">Loading assignment...</p></main>;
  if (error) return <main className="container" style={{ padding: '40px 20px' }}><p style={{ color: 'var(--danger)' }}>{error}</p><Link href="/dashboard" className="btn secondary" style={{ marginTop: 12 }}>Back to Dashboard</Link></main>;
  if (!data) return null;

  const { assignment, questions } = data;
  const done = questions.filter(q => q.is_done).length;
  const correct = questions.filter(q => q.is_done && q.last_is_correct).length;
  const total = questions.length;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const accPct = done > 0 ? Math.round((correct / done) * 100) : null;
  const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();
  const incomplete = questions.filter(q => !q.is_done);

  return (
    <main className="container" style={{ padding: '24px 20px', maxWidth: 800 }}>
      <Link href="/dashboard" className="btn secondary" style={{ marginBottom: 16, fontSize: 13 }}>
        &larr; Back to Dashboard
      </Link>

      <div className="card" style={{ padding: '20px 24px' }}>
        <h1 className="h1" style={{ marginBottom: 4 }}>{assignment.title}</h1>
        {assignment.description && <p className="muted" style={{ marginTop: 4 }}>{assignment.description}</p>}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
          <span>Assigned by {assignment.teacher_name}</span>
          {assignment.due_date && <span style={{ color: isOverdue ? 'var(--danger)' : undefined }}>Due {formatDate(assignment.due_date)}{isOverdue ? ' (overdue)' : ''}</span>}
        </div>

        {/* Progress summary */}
        <div style={{ display: 'flex', gap: 24, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 28, color: pctColor(donePct) }}>{donePct}%</div>
            <div className="muted small">Complete</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 28 }}>{done}/{total}</div>
            <div className="muted small">Questions Done</div>
          </div>
          {accPct !== null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 28, color: pctColor(accPct) }}>{accPct}%</div>
              <div className="muted small">Accuracy</div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn primary" onClick={startPractice} disabled={!incomplete.length && done === total}>
            {done === 0 ? 'Start Assignment' : incomplete.length > 0 ? `Continue (${incomplete.length} left)` : 'All Done!'}
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div className="dbProgressBar" style={{ height: 8 }}>
            <div className="dbProgressFill" style={{ width: `${donePct}%`, background: pctColor(donePct) }} />
          </div>
        </div>
      </div>

      {/* Question list */}
      <div className="card" style={{ padding: '16px 20px', marginTop: 12 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {questions.map((q, i) => (
            <Link
              key={q.question_id}
              href={`/practice/${encodeURIComponent(q.question_id)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 8, textDecoration: 'none', color: 'var(--text)',
                background: q.is_done ? (q.last_is_correct ? 'rgba(91,168,118,0.06)' : 'rgba(217,119,117,0.06)') : 'transparent',
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                background: q.is_done ? (q.last_is_correct ? 'var(--success)' : 'var(--danger)') : 'var(--border)',
                color: q.is_done ? '#fff' : 'var(--muted)',
              }}>
                {q.is_done ? (q.last_is_correct ? '\u2713' : '\u2717') : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{q.domain_name || 'Question'}</span>
                {q.skill_name && <span className="muted small" style={{ marginLeft: 8 }}>{q.skill_name}</span>}
              </div>
              {q.difficulty && (
                <span className="pill" style={{ fontSize: 10, padding: '1px 6px', background: DIFF_COLORS[q.difficulty] || '#999', color: '#fff' }}>
                  {DIFF_LABEL[q.difficulty] || '?'}
                </span>
              )}
              {q.is_done && <span className="muted small">{q.attempts_count} attempt{q.attempts_count !== 1 ? 's' : ''}</span>}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
