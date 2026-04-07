'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function pctColor(p) {
  if (p == null) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

export default function TeacherPerformancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/teacher/student-performance')
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="container" style={{ paddingTop: 40 }}><p className="muted">Loading performance data...</p></div>;
  if (error) return <div className="container" style={{ paddingTop: 40 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!data) return null;

  const { overallAccuracy, scoreDistribution, hardestQuestions, easiestQuestions, skillHeatmap, studentCount } = data;
  const trend = (overallAccuracy.current != null && overallAccuracy.previous != null)
    ? overallAccuracy.current - overallAccuracy.previous : null;

  return (
    <main className="container" style={{ maxWidth: 1000, paddingTop: 28, paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Student Performance</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Aggregate performance across your {studentCount} student{studentCount !== 1 ? 's' : ''} (last 30 days)
          </p>
        </div>
        <Link href="/teacher" className="btn secondary">Dashboard</Link>
      </div>

      {/* ── Overall Accuracy ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: pctColor(overallAccuracy.current) }}>
              {overallAccuracy.current != null ? `${overallAccuracy.current}%` : '—'}
            </div>
            <div className="muted small">Overall Accuracy (first attempts)</div>
          </div>
          {trend != null && (
            <div>
              <div style={{
                fontSize: 16, fontWeight: 700,
                color: trend > 0 ? 'var(--success)' : trend < 0 ? 'var(--danger)' : 'var(--muted)',
              }}>
                {trend > 0 ? '+' : ''}{trend}%
              </div>
              <div className="muted small">vs. prior 30 days</div>
            </div>
          )}
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{overallAccuracy.totalAttempts.toLocaleString()}</div>
            <div className="muted small">total first attempts</div>
          </div>
        </div>

        {overallAccuracy.domains.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="muted small" style={{ fontWeight: 600 }}>By Domain</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {overallAccuracy.domains.map(d => (
                <div key={d.domain_code} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, fontSize: 13,
                }}>
                  <span style={{ fontWeight: 500 }}>{d.domain_name}</span>
                  <span style={{ fontWeight: 700, color: pctColor(d.accuracy) }}>{d.accuracy != null ? `${d.accuracy}%` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Score Distribution ── */}
      {scoreDistribution.totalTests > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="h2" style={{ marginBottom: 14 }}>Practice Test Score Distribution</h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            {scoreDistribution.avgComposite != null && (
              <div><span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{scoreDistribution.avgComposite}</span><div className="muted small">avg composite</div></div>
            )}
            {scoreDistribution.avgRW != null && (
              <div><span style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>{scoreDistribution.avgRW}</span><div className="muted small">avg R&W</div></div>
            )}
            {scoreDistribution.avgMath != null && (
              <div><span style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed' }}>{scoreDistribution.avgMath}</span><div className="muted small">avg Math</div></div>
            )}
            <div><span style={{ fontSize: 18, fontWeight: 600 }}>{scoreDistribution.totalTests}</span><div className="muted small">tests completed</div></div>
          </div>
          {/* Histogram */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100 }}>
            {scoreDistribution.buckets.map(b => {
              const maxCount = Math.max(...scoreDistribution.buckets.map(x => x.count), 1);
              const h = b.count > 0 ? Math.max((b.count / maxCount) * 100, 4) : 0;
              return (
                <div key={b.range} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: '100%', height: h, background: b.count > 0 ? 'var(--accent)' : 'transparent', borderRadius: '3px 3px 0 0', opacity: 0.7 }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
                    {b.lo}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Hardest & Easiest Questions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="h2" style={{ margin: 0 }}>Hardest Questions</h3>
            <span className="pill" style={{ fontSize: 10, background: '#fee2e2', color: '#991b1b' }}>Lowest accuracy</span>
          </div>
          {hardestQuestions.length > 0 ? (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, padding: '0 4px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                <span style={{ width: 70 }}>Question</span><span style={{ flex: 1 }}>Skill</span><span style={{ width: 40, textAlign: 'right' }}>Acc.</span><span style={{ width: 24, textAlign: 'right' }}>n</span>
              </div>
              {hardestQuestions.map((q, i) => (
                <a key={i} href={`/practice/${q.question_uuid || q.question_id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 8, padding: '4px', fontSize: 12, textDecoration: 'none', color: 'inherit', borderRadius: 4 }}>
                  <span style={{ width: 70, fontFamily: 'monospace', fontSize: 11 }}>{q.question_id?.length > 12 ? q.question_id.slice(0, 8) : q.question_id || '—'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.skill_name || q.domain_name || '—'}</span>
                  <span style={{ width: 40, textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{q.accuracy}%</span>
                  <span style={{ width: 24, textAlign: 'right', color: 'var(--muted)' }}>{q.attempt_count}</span>
                </a>
              ))}
            </div>
          ) : <p className="muted small">Not enough data (min 5 attempts per question)</p>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="h2" style={{ margin: 0 }}>Easiest Questions</h3>
            <span className="pill" style={{ fontSize: 10, background: '#dcfce7', color: '#166534' }}>Highest accuracy</span>
          </div>
          {easiestQuestions.length > 0 ? (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, padding: '0 4px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                <span style={{ width: 70 }}>Question</span><span style={{ flex: 1 }}>Skill</span><span style={{ width: 40, textAlign: 'right' }}>Acc.</span><span style={{ width: 24, textAlign: 'right' }}>n</span>
              </div>
              {easiestQuestions.map((q, i) => (
                <a key={i} href={`/practice/${q.question_uuid || q.question_id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 8, padding: '4px', fontSize: 12, textDecoration: 'none', color: 'inherit', borderRadius: 4 }}>
                  <span style={{ width: 70, fontFamily: 'monospace', fontSize: 11 }}>{q.question_id?.length > 12 ? q.question_id.slice(0, 8) : q.question_id || '—'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.skill_name || q.domain_name || '—'}</span>
                  <span style={{ width: 40, textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{q.accuracy}%</span>
                  <span style={{ width: 24, textAlign: 'right', color: 'var(--muted)' }}>{q.attempt_count}</span>
                </a>
              ))}
            </div>
          ) : <p className="muted small">Not enough data (min 5 attempts per question)</p>}
        </div>
      </div>

      {/* ── Skill Accuracy Heatmap ── */}
      {skillHeatmap.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 className="h2" style={{ margin: 0 }}>Skill Accuracy Heatmap</h3>
            <span className="pill" style={{ fontSize: 10, background: '#fef3c7', color: '#92400e' }}>{skillHeatmap.length} skills</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {skillHeatmap.map(s => {
              const pct = s.accuracy;
              const hue = Math.round((pct / 100) * 120);
              const sat = Math.round(40 + (pct / 100) * 45);
              const light = Math.round(90 - (pct / 100) * 30);
              const textLight = Math.round(35 - (pct / 100) * 15);
              return (
                <div
                  key={s.skill_code}
                  title={`${s.skill_name}: ${s.accuracy}% (${s.total} attempts)`}
                  style={{
                    padding: '8px 12px', borderRadius: 8, minWidth: 120,
                    background: `hsl(${hue}, ${sat}%, ${light}%)`,
                    border: `1px solid hsl(${hue}, ${Math.round(30 + (pct / 100) * 40)}%, ${Math.round(70 - (pct / 100) * 25)}%)`,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                    {s.skill_name}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: `hsl(${hue}, 60%, ${textLight}%)` }}>
                    {s.accuracy}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
