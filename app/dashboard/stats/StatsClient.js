'use client';

import { memo, useEffect, useMemo, useState } from 'react';
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
const DIFF_COLOR = { 1: 'var(--success)', 2: 'var(--amber)', 3: 'var(--danger)' };
const TREND_COLOR = '#4f7ce0'; // accent blue for line graphs
const SUBJECT_LABEL = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Simple bar component ──
const StatBar = memo(function StatBar({ value, max, color, label, sublabel }) {
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
});

// ── Sparkline (inline SVG) ──
const Sparkline = memo(function Sparkline({ values, color = 'var(--accent)', width = 80, height = 28 }) {
  if (!values || values.length < 2) return null;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="stSparkline">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {(() => {
        const lastX = pad + w;
        const lastY = pad + h - ((values[values.length - 1] - min) / range) * h;
        return <circle cx={lastX} cy={lastY} r="2" fill={color} />;
      })()}
    </svg>
  );
});

// ── SVG Line Chart ──
const LineChart = memo(function LineChart({ data: points, yMin = 0, yMax = 100, height = 200, color = TREND_COLOR, yLabel = '%', xLabels }) {
  if (!points.length) return <p className="muted small">Not enough data yet.</p>;

  const vbW = 600, vbH = height;
  const padL = 48, padR = 16, padT = 16, padB = 28;
  const chartW = vbW - padL - padR;
  const chartH = vbH - padT - padB;
  const range = yMax - yMin || 1;

  // Grid lines
  const gridLines = 4;
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) => yMin + (range / gridLines) * i);

  const polyPoints = points.map((p, i) => {
    const x = padL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
    const y = padT + chartH - ((p.value - yMin) / range) * chartH;
    return { x, y, ...p };
  });

  const polyline = polyPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Area fill path
  const areaPath = `M${polyPoints[0].x},${padT + chartH} ` +
    polyPoints.map(p => `L${p.x},${p.y}`).join(' ') +
    ` L${polyPoints[polyPoints.length - 1].x},${padT + chartH} Z`;

  return (
    <div className="stLineChartWrap">
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="stLineChart">
        {/* Grid */}
        {gridVals.map((v, i) => {
          const y = padT + chartH - ((v - yMin) / range) * chartH;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={vbW - padR} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={padL - 6} y={y + 4} textAnchor="end" className="stChartLabel">
                {Math.round(v)}{yLabel}
              </text>
            </g>
          );
        })}
        {/* Area fill */}
        <path d={areaPath} fill={color} opacity="0.08" />
        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {polyPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color}>
            <title>{p.label || `${Math.round(p.value)}${yLabel}`}</title>
          </circle>
        ))}
        {/* X labels */}
        {xLabels && polyPoints.map((p, i) => {
          const step = Math.max(1, Math.floor(polyPoints.length / 8));
          if (i % step !== 0 && i !== polyPoints.length - 1) return null;
          return (
            <text key={i} x={p.x} y={vbH - 6} textAnchor="middle" className="stChartLabel">
              {p.xLabel || ''}
            </text>
          );
        })}
      </svg>
    </div>
  );
});

// ── Accuracy trend (SVG line chart) ──
const TrendChart = memo(function TrendChart({ sessions }) {
  if (sessions.length < 2) return <p className="muted small">Not enough sessions yet for a trend chart.</p>;

  const points = sessions.map((s) => ({
    value: s.pct,
    label: `${formatDate(s.startedAt)}: ${s.pct}% (${s.correct}/${s.total})`,
    xLabel: formatDate(s.startedAt),
  }));

  return <LineChart data={points} yMin={0} yMax={100} xLabels height={180} />;
});

// ── Test score line graph ──
const TestScoreLineGraph = memo(function TestScoreLineGraph({ testScores }) {
  if (testScores.length < 2) return null;

  const chronological = [...testScores].reverse();
  const composites = chronological.map(ts => ts.composite || 0).filter(Boolean);
  const minScore = Math.max(400, Math.floor((Math.min(...composites) - 50) / 100) * 100);
  const maxScore = Math.min(1600, Math.ceil((Math.max(...composites) + 50) / 100) * 100);

  const points = chronological.map((ts) => ({
    value: ts.composite || 0,
    label: `${ts.test_name}: ${ts.composite}`,
    xLabel: formatDate(ts.finished_at),
  }));

  return (
    <div style={{ marginBottom: 16 }}>
      <LineChart data={points} yMin={minScore} yMax={maxScore} yLabel="" xLabels height={160} color="#6b9bd2" />
    </div>
  );
});

// ── Topic mastery table ──
const MasteryTable = memo(function MasteryTable({ topicStats, enrichedAttempts }) {
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
});

// ── Test score trend ──
const TestScoreTrend = memo(function TestScoreTrend({ testScores }) {
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
});


// ── Main ──

export default function StatsClient({ email, fetchUrl, backUrl, backLabel, title, studentName }) {
  const apiUrl = fetchUrl || '/api/dashboard/stats';
  const linkBack = backUrl || '/dashboard';
  const linkBackLabel = backLabel || '← Dashboard';
  const pageTitle = title || 'Detailed Statistics';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(apiUrl)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Derive student name from API response if available (teacher view)
  const resolvedStudentName = studentName || (() => {
    const s = data?.student;
    if (!s) return null;
    if (s.first_name || s.last_name) return [s.first_name, s.last_name].filter(Boolean).join(' ');
    if (s.email) return s.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return null;
  })();

  const enriched = data?.enrichedAttempts || [];

  const diffBreakdown = useMemo(() => accuracyByDifficulty(enriched), [enriched]);
  const timeByDiff = useMemo(() => avgTimeByDifficulty(enriched), [enriched]);
  const trend = useMemo(() => accuracyTrend(enriched), [enriched]);
  const suggestions = useMemo(() => suggestReviewTopics(data?.topicStats || [], 5), [data?.topicStats]);

  // Separate R&W vs Math domains
  const rwDomains = useMemo(() => (data?.domainStats || []).filter(d => !MATH_CODES.has(d.domain_code)), [data?.domainStats]);
  const mathDomains = useMemo(() => (data?.domainStats || []).filter(d => MATH_CODES.has(d.domain_code)), [data?.domainStats]);

  const headerBlock = (
    <div className="stHeader">
      <Link href={linkBack} className="btn secondary">{linkBackLabel}</Link>
      <div>
        <h1 className="h1" style={{ margin: 0 }}>{pageTitle}</h1>
        {resolvedStudentName && <p className="muted small" style={{ margin: 0 }}>{resolvedStudentName}</p>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <main className="container">
        {headerBlock}
        <p className="muted">Loading analytics...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container">
        {headerBlock}
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      </main>
    );
  }

  const totalAttempted = data?.totalAttempted || 0;
  const totalCorrect = data?.totalCorrect || 0;
  const overallPct = pct(totalCorrect, totalAttempted);

  return (
    <main className="container stMain">
      {headerBlock}

      {/* ── Overview Stats ── */}
      <div className="stOverviewRow">
        <div className="card stOverviewCard">
          <div className="stOverviewValue">{totalAttempted}</div>
          <div className="stOverviewLabel">Questions Attempted</div>
        </div>
        <div className="card stOverviewCard">
          <div className="stOverviewCardInner">
            <div>
              <div className="stOverviewValue" style={{ color: pctColor(overallPct) }}>{overallPct ?? '—'}%</div>
              <div className="stOverviewLabel">Overall Accuracy</div>
            </div>
            {trend.length >= 3 && (
              <Sparkline values={trend.map(s => s.pct)} color={pctColor(overallPct) || 'var(--accent)'} />
            )}
          </div>
        </div>
        <div className="card stOverviewCard">
          <div className="stOverviewCardInner">
            <div>
              <div className="stOverviewValue" style={{ color: 'var(--accent)' }}>{data?.highestTestScore ?? '—'}</div>
              <div className="stOverviewLabel">Best Test Score</div>
            </div>
            {(data?.testScores?.length || 0) >= 2 && (
              <Sparkline
                values={[...data.testScores].reverse().map(ts => ts.composite || 0)}
                color="var(--accent)"
              />
            )}
          </div>
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
        <TestScoreLineGraph testScores={data?.testScores || []} />
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
