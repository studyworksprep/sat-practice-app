'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  accuracyByDifficulty,
  accuracyByDomain,
  accuracyTrend,
  avgTimeByDifficulty,
  masteryScore,
  suggestReviewTopics,
  findWeakAndStrong,
} from '../../../lib/analytics';
import { formatDuration } from '../../../lib/formatters';
import { exportPracticeSessions, exportTestScores, exportPerformanceStats } from '../../../lib/exportCsv';

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);
const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFF_COLOR = { 1: 'var(--success)', 2: '#ca8a04', 3: 'var(--danger)' };
const SUBJECT_LABEL = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? '#ca8a04' : 'var(--danger)';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Simple bar component ──
function StatBar({ value, max, color, label, sublabel }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="stBar">
      <div className="stBarLabel">
        <span>{label}</span>
        {sublabel && <span className="muted small">{sublabel}</span>}
      </div>
      <div className="stBarTrack">
        <div className="stBarFill" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="stBarValue" style={{ color }}>{value}%</span>
    </div>
  );
}

// ── Accuracy trend mini-chart (pure CSS) ──
function TrendChart({ sessions }) {
  if (!sessions.length) return <p className="muted small">Not enough data yet.</p>;

  const maxPct = 100;
  const barCount = sessions.length;

  return (
    <div className="stTrendChart">
      <div className="stTrendBars">
        {sessions.map((s, i) => {
          const height = `${s.pct}%`;
          const color = pctColor(s.pct);
          return (
            <div key={i} className="stTrendCol" style={{ flex: barCount > 20 ? '0 0 auto' : 1 }}>
              <div className="stTrendBarWrap">
                <div
                  className="stTrendBar"
                  style={{ height, background: color }}
                  title={`${formatDate(s.startedAt)}: ${s.pct}% (${s.correct}/${s.total})`}
                />
              </div>
              {barCount <= 12 && (
                <span className="stTrendLabel">{formatDate(s.startedAt)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="stTrendAxis">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ── Topic mastery table ──
function MasteryTable({ topicStats, enrichedAttempts }) {
  // Group attempts by skill_name for mastery computation
  const attemptsBySkill = {};
  for (const a of enrichedAttempts) {
    const skill = a.skill_name || 'Unknown';
    if (!attemptsBySkill[skill]) attemptsBySkill[skill] = [];
    attemptsBySkill[skill].push(a);
  }

  const topics = topicStats.map((t) => {
    const skillAttempts = attemptsBySkill[t.skill_name] || [];
    const mastery = masteryScore(skillAttempts);
    return { ...t, mastery };
  });

  // Sort by mastery ascending (weakest first)
  topics.sort((a, b) => a.mastery - b.mastery);

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? topics : topics.slice(0, 10);

  return (
    <div>
      <div className="stMasteryGrid stMasteryHeader">
        <span>Topic</span>
        <span>Domain</span>
        <span style={{ textAlign: 'center' }}>Correct</span>
        <span style={{ textAlign: 'center' }}>Accuracy</span>
        <span style={{ textAlign: 'center' }}>Mastery</span>
      </div>
      {visible.map((t) => {
        const p = pct(t.correct, t.attempted);
        const masteryColor = pctColor(t.mastery);
        return (
          <div key={t.skill_name} className="stMasteryGrid stMasteryRow">
            <span className="stMasterySkill">{t.skill_name}</span>
            <span className="muted small">{t.domain_name}</span>
            <span style={{ textAlign: 'center' }}>{t.correct}/{t.attempted}</span>
            <span style={{ textAlign: 'center', color: pctColor(p) }}>{p != null ? `${p}%` : '—'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <div className="stMiniBar">
                <div className="stMiniBarFill" style={{ width: `${t.mastery}%`, background: masteryColor }} />
              </div>
              <span style={{ color: masteryColor, fontWeight: 600, fontSize: 12, minWidth: 28 }}>{t.mastery}%</span>
            </div>
          </div>
        );
      })}
      {topics.length > 10 && (
        <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show Less' : `Show All ${topics.length} Topics`}
        </button>
      )}
    </div>
  );
}

// ── Test score trend ──
function TestScoreTrend({ testScores }) {
  if (!testScores.length) return <p className="muted small">No completed tests yet.</p>;

  // Reverse so oldest is first (chronological)
  const chronological = [...testScores].reverse();
  const maxScore = 1600;

  return (
    <div>
      <div className="stTestGrid stTestHeader">
        <span>Test</span>
        <span>Date</span>
        <span style={{ textAlign: 'center' }}>R&W</span>
        <span style={{ textAlign: 'center' }}>Math</span>
        <span style={{ textAlign: 'center' }}>Total</span>
        <span>Score</span>
      </div>
      {chronological.map((ts, i) => {
        const barWidth = ts.composite ? (ts.composite / maxScore) * 100 : 0;
        return (
          <Link
            key={ts.attempt_id}
            href={`/practice-test/attempt/${ts.attempt_id}/results`}
            className="stTestGrid stTestRow"
          >
            <span className="stTestName">{ts.test_name}</span>
            <span className="muted small">{formatDate(ts.finished_at)}</span>
            <span style={{ textAlign: 'center', fontWeight: 600 }}>
              {ts.sections?.RW?.scaled ?? ts.sections?.rw?.scaled ?? '—'}
            </span>
            <span style={{ textAlign: 'center', fontWeight: 600 }}>
              {ts.sections?.M?.scaled ?? ts.sections?.math?.scaled ?? ts.sections?.m?.scaled ?? '—'}
            </span>
            <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>
              {ts.composite ?? '—'}
            </span>
            <div className="stTestBarCell">
              <div className="stMiniBar" style={{ width: '100%' }}>
                <div className="stMiniBarFill" style={{ width: `${barWidth}%`, background: 'var(--accent)' }} />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}


// ── Main ──

export default function StatsClient({ email }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="container">
        <div className="stHeader">
          <Link href="/dashboard" className="btn secondary">← Dashboard</Link>
          <h1 className="h1">Detailed Statistics</h1>
        </div>
        <p className="muted">Loading your analytics...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container">
        <div className="stHeader">
          <Link href="/dashboard" className="btn secondary">← Dashboard</Link>
          <h1 className="h1">Detailed Statistics</h1>
        </div>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      </main>
    );
  }

  const enriched = data?.enrichedAttempts || [];
  const diffBreakdown = accuracyByDifficulty(enriched);
  const timeByDiff = avgTimeByDifficulty(enriched);
  const trend = accuracyTrend(enriched);
  const suggestions = suggestReviewTopics(data?.topicStats || [], 5);

  // Separate R&W vs Math domains
  const rwDomains = (data?.domainStats || []).filter(d => !MATH_CODES.has(d.domain_code));
  const mathDomains = (data?.domainStats || []).filter(d => MATH_CODES.has(d.domain_code));

  const totalAttempted = data?.totalAttempted || 0;
  const totalCorrect = data?.totalCorrect || 0;
  const overallPct = pct(totalCorrect, totalAttempted);

  return (
    <main className="container stMain">
      <div className="stHeader">
        <Link href="/dashboard" className="btn secondary">← Dashboard</Link>
        <h1 className="h1">Detailed Statistics</h1>
      </div>

      {/* ── Overview Stats ── */}
      <div className="stOverviewRow">
        <div className="card stOverviewCard">
          <div className="stOverviewValue">{totalAttempted}</div>
          <div className="stOverviewLabel">Questions Attempted</div>
        </div>
        <div className="card stOverviewCard">
          <div className="stOverviewValue" style={{ color: pctColor(overallPct) }}>{overallPct ?? '—'}%</div>
          <div className="stOverviewLabel">Overall Accuracy</div>
        </div>
        <div className="card stOverviewCard">
          <div className="stOverviewValue" style={{ color: 'var(--accent)' }}>{data?.highestTestScore ?? '—'}</div>
          <div className="stOverviewLabel">Best Test Score</div>
        </div>
        <div className="card stOverviewCard">
          <div className="stOverviewValue">{data?.testScores?.length ?? 0}</div>
          <div className="stOverviewLabel">Tests Completed</div>
        </div>
      </div>

      {/* ── Two-column grid: Difficulty + Time ── */}
      <div className="stTwoCol">
        {/* Accuracy by Difficulty */}
        <div className="card">
          <div className="h2" style={{ marginBottom: 12 }}>Accuracy by Difficulty</div>
          {totalAttempted === 0 ? (
            <p className="muted small">No data yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {[1, 2, 3].map((d) => (
                <StatBar
                  key={d}
                  value={diffBreakdown[d].pct ?? 0}
                  max={100}
                  color={DIFF_COLOR[d]}
                  label={DIFF_LABEL[d]}
                  sublabel={`${diffBreakdown[d].correct}/${diffBreakdown[d].total}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Average Time by Difficulty */}
        <div className="card">
          <div className="h2" style={{ marginBottom: 12 }}>Avg. Time by Difficulty</div>
          {totalAttempted === 0 ? (
            <p className="muted small">No data yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {[1, 2, 3].map((d) => {
                const ms = timeByDiff[d];
                return (
                  <div key={d} className="stTimeRow">
                    <span className="stTimeLabel">{DIFF_LABEL[d]}</span>
                    <span className="stTimeValue" style={{ color: DIFF_COLOR[d] }}>
                      {ms != null ? formatDuration(ms) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Accuracy Trend ── */}
      <div className="card">
        <div className="h2" style={{ marginBottom: 4 }}>Accuracy Over Time</div>
        <p className="muted small" style={{ marginTop: 0, marginBottom: 12 }}>
          Each bar represents a practice session. Hover for details.
        </p>
        <TrendChart sessions={trend} />
      </div>

      {/* ── Domain Breakdown: R&W + Math ── */}
      <div className="stTwoCol">
        <div className="card">
          <div className="h2" style={{ marginBottom: 12 }}>Reading & Writing</div>
          {rwDomains.length === 0 ? (
            <p className="muted small">No R&W data yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {rwDomains.map((d) => (
                <StatBar
                  key={d.domain_name}
                  value={pct(d.correct, d.attempted) ?? 0}
                  max={100}
                  color={pctColor(pct(d.correct, d.attempted))}
                  label={d.domain_name}
                  sublabel={`${d.correct}/${d.attempted}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="h2" style={{ marginBottom: 12 }}>Math</div>
          {mathDomains.length === 0 ? (
            <p className="muted small">No Math data yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {mathDomains.map((d) => (
                <StatBar
                  key={d.domain_name}
                  value={pct(d.correct, d.attempted) ?? 0}
                  max={100}
                  color={pctColor(pct(d.correct, d.attempted))}
                  label={d.domain_name}
                  sublabel={`${d.correct}/${d.attempted}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Topic Mastery ── */}
      <div className="card">
        <div className="h2" style={{ marginBottom: 4 }}>Topic Mastery</div>
        <p className="muted small" style={{ marginTop: 0, marginBottom: 12 }}>
          Mastery reflects recent performance — recent attempts count more.
          Topics are sorted weakest first.
        </p>
        {(data?.topicStats?.length || 0) === 0 ? (
          <p className="muted small">No data yet.</p>
        ) : (
          <MasteryTable topicStats={data.topicStats} enrichedAttempts={enriched} />
        )}
      </div>

      {/* ── Suggested Review ── */}
      {suggestions.length > 0 && (
        <div className="card">
          <div className="h2" style={{ marginBottom: 4 }}>Suggested Review</div>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 12 }}>
            Focus on these topics to improve your score.
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {suggestions.map((t) => {
              const p = pct(t.correct, t.attempted);
              return (
                <div key={t.skill_name} className="stSuggestionRow">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.skill_name}</div>
                    <div className="muted small">{t.domain_name}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="muted small">{t.correct}/{t.attempted}</span>
                    <span style={{ color: pctColor(p), fontWeight: 700, fontSize: 14 }}>{p}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Test Score History ── */}
      <div className="card">
        <div className="h2" style={{ marginBottom: 12 }}>Test Score History</div>
        <TestScoreTrend testScores={data?.testScores || []} />
      </div>

      {/* ── Export Data ── */}
      <div className="card">
        <div className="h2" style={{ marginBottom: 8 }}>Export Data</div>
        <p className="muted small" style={{ marginTop: 0 }}>Download your practice data as CSV files.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {data?.recentSessions?.length > 0 && (
            <button
              className="btn secondary"
              onClick={() => exportPracticeSessions(data.recentSessions)}
            >
              Export Practice Sessions
            </button>
          )}
          {data?.testScores?.length > 0 && (
            <button
              className="btn secondary"
              onClick={() => exportTestScores(data.testScores)}
            >
              Export Test Scores
            </button>
          )}
          {data?.domainStats?.length > 0 && (
            <button
              className="btn secondary"
              onClick={() => exportPerformanceStats(data.domainStats, data.topicStats || [])}
            >
              Export Performance Stats
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
