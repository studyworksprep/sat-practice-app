'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Math domain codes per SAT section structure
const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function AccuracyBar({ correct, attempted }) {
  const p = pct(correct, attempted);
  if (p === null) return <span className="muted small">No data</span>;
  const color = p >= 70 ? '#16a34a' : p >= 50 ? '#ca8a04' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="dbProgressBar">
        <div className="dbProgressFill" style={{ width: `${p}%`, background: color }} />
      </div>
      <span className="small" style={{ color, fontWeight: 600, minWidth: 36 }}>{p}%</span>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Build nested sections: English (Reading & Writing) and Math
// Each section has domains, each domain has its topics nested inside.
function buildSections(domainStats, topicStats) {
  const topicsByDomain = {};
  for (const t of topicStats) {
    if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
    topicsByDomain[t.domain_name].push(t);
  }

  const english = { label: 'Reading & Writing', domains: [] };
  const math = { label: 'Math', domains: [] };

  for (const d of domainStats) {
    const section = MATH_CODES.has(d.domain_code) ? math : english;
    section.domains.push({ ...d, topics: topicsByDomain[d.domain_name] || [] });
  }

  return [english, math];
}

function PerfSection({ section, loading, error }) {
  return (
    <div className="card">
      <div className="h2" style={{ marginBottom: 14 }}>{section.label}</div>
      {loading ? (
        <div className="muted small">Loading…</div>
      ) : error ? (
        <div className="muted small">{error}</div>
      ) : !section.domains.length ? (
        <div className="muted small">No data yet. Start practicing to see your stats.</div>
      ) : (
        <div className="dbDomainList">
          {section.domains.map(domain => (
            <div key={domain.domain_name} className="dbDomainBlock">
              <div className="dbDomainRow">
                <div className="dbDomainName">{domain.domain_name}</div>
                <div className="dbStatMeta">{domain.attempted} attempted</div>
                <AccuracyBar correct={domain.correct} attempted={domain.attempted} />
              </div>
              {domain.topics.length > 0 && (
                <div className="dbTopicList">
                  {domain.topics.map(topic => (
                    <div key={topic.skill_name} className="dbTopicRow">
                      <div className="dbStatName">{topic.skill_name}</div>
                      <div className="dbStatMeta">{topic.attempted} attempted</div>
                      <AccuracyBar correct={topic.correct} attempted={topic.attempted} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardClient({ email }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const overallPct = data ? pct(data.totalCorrect, data.totalAttempted) : null;
  const sections = data
    ? buildSections(data.domainStats, data.topicStats)
    : [{ label: 'Reading & Writing', domains: [] }, { label: 'Math', domains: [] }];

  return (
    <main className="container">

      {/* Header */}
      <div className="dbHeader">
        <div>
          <div className="h1" style={{ marginBottom: 4 }}>Dashboard</div>
          <p className="muted" style={{ margin: 0 }}>Welcome back, {email}</p>
        </div>
        <Link href="/practice" className="btn primary">Continue Practicing</Link>
      </div>

      {/* Summary stats */}
      {data && (
        <div className="dbSummaryRow">
          <div className="dbSummaryItem">
            <div className="dbSummaryValue">{data.totalAttempted}</div>
            <div className="dbSummaryLabel">Questions Attempted</div>
          </div>
          <div className="dbSummaryItem">
            <div className="dbSummaryValue">{data.totalCorrect}</div>
            <div className="dbSummaryLabel">Correct</div>
          </div>
          <div className="dbSummaryItem">
            <div className="dbSummaryValue" style={{ color: overallPct !== null ? (overallPct >= 70 ? '#16a34a' : overallPct >= 50 ? '#ca8a04' : '#dc2626') : undefined }}>
              {overallPct !== null ? `${overallPct}%` : '—'}
            </div>
            <div className="dbSummaryLabel">Overall Accuracy</div>
          </div>
        </div>
      )}

      {/* Performance: English | Math (two columns, topics nested under domains) */}
      <div className="dbPerfGrid">
        {sections.map(section => (
          <PerfSection key={section.label} section={section} loading={loading} error={error} />
        ))}
      </div>

      {/* Practice tests placeholder */}
      <div className="card dbTestPanel" style={{ marginTop: 16 }}>
        <div className="h2">Practice Tests</div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Simulate the full SAT experience with timed, full-length practice tests.
          Review your scores and section breakdowns when you&rsquo;re done.
        </p>
        <div className="dbTestComingSoon">
          <span>Coming Soon</span>
        </div>
        <Link href="/practice-test" className="btn secondary dbTestBtn" aria-disabled="true"
          onClick={e => e.preventDefault()}
          style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }}>
          Take a Practice Test
        </Link>
      </div>

      {/* Recent activity */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="h2">Recent Practice</div>
        {loading ? (
          <div className="muted small">Loading…</div>
        ) : error ? (
          <div className="muted small">{error}</div>
        ) : !data?.recentActivity?.length ? (
          <div className="muted small">No questions attempted yet.</div>
        ) : (
          <div className="dbActivityList">
            {data.recentActivity.map(item => (
              <Link
                key={item.question_id}
                href={`/practice/${item.question_id}`}
                className="dbActivityItem"
              >
                <div className={`dbActivityDot ${item.last_is_correct ? 'correct' : 'incorrect'}`}>
                  {item.last_is_correct ? '✓' : '✗'}
                </div>
                <div className="dbActivityInfo">
                  <span className="dbActivityTopic">{item.skill_name}</span>
                  <span className="muted small"> · {item.domain_name}</span>
                  {item.difficulty && (
                    <span className="muted small"> · D{item.difficulty}</span>
                  )}
                </div>
                <div className="dbActivityDate muted small">{formatDate(item.last_attempt_at)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </main>
  );
}
