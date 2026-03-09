'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function formatMs(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function TopicCard({ topic }) {
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 14 }}>{topic.skill_name}</div>
          <div className="muted small">{topic.domain_name}</div>
        </div>
        <span style={{ color: pctColor(topic.accuracyPct), fontWeight: 700, fontSize: 18 }}>
          {topic.accuracyPct}%
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        <div className="muted small">
          {topic.correct}/{topic.attempted} correct
        </div>
        {topic.recentAccuracy != null && topic.recentAccuracy !== topic.accuracyPct && (
          <div className="small" style={{ color: topic.recentAccuracy < topic.accuracyPct ? 'var(--danger)' : 'var(--success)' }}>
            Recent: {topic.recentAccuracy}%
            {topic.recentAccuracy < topic.accuracyPct ? ' (declining)' : ' (improving)'}
          </div>
        )}
        {topic.avgTimeMs && (
          <div className="muted small">Avg time: {formatMs(topic.avgTimeMs)}</div>
        )}
        <div className="muted small">
          {topic.remaining} questions remaining
        </div>
      </div>

      <div className="muted small" style={{ marginTop: 6, fontStyle: 'italic' }}>{topic.reason}</div>

      <div style={{ marginTop: 10 }}>
        <Link
          href={`/practice?topics=${encodeURIComponent(topic.skill_name)}&session=1`}
          className="btn secondary"
          style={{ fontSize: 12, padding: '4px 12px' }}
        >
          Practice this topic
        </Link>
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recommendations')
      .then(r => r.json())
      .then(json => { if (!json.error) setData(json); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="h1">Topic Recommendations</div>
          <p className="muted" style={{ marginTop: 2 }}>
            Personalized suggestions based on your performance
          </p>
        </div>
        <Link href="/dashboard" className="btn secondary">Back to Dashboard</Link>
      </div>

      {loading ? (
        <div className="muted">Loading recommendations…</div>
      ) : !data?.recommendations?.length ? (
        <div className="card">
          <p className="muted">Complete more practice questions to get personalized recommendations.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 24 }}>
          {data.needsWork?.length > 0 && (
            <div>
              <div className="h2" style={{ color: 'var(--danger)', marginBottom: 10 }}>
                Needs Work (below 70%)
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.needsWork.map(t => <TopicCard key={t.skill_name} topic={t} />)}
              </div>
            </div>
          )}

          {data.improving?.length > 0 && (
            <div>
              <div className="h2" style={{ color: 'var(--amber)', marginBottom: 10 }}>
                Improving (70-85%)
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.improving.map(t => <TopicCard key={t.skill_name} topic={t} />)}
              </div>
            </div>
          )}

          {data.mastered?.length > 0 && (
            <div>
              <div className="h2" style={{ color: 'var(--success)', marginBottom: 10 }}>
                Mastered (85%+)
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.mastered.map(t => <TopicCard key={t.skill_name} topic={t} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
