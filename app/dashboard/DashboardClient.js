'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);
const SUBJECT_LABEL = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };
const DIFF_CLASS = { 1: 'easy', 2: 'medium', 3: 'hard' };

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function displayName(email) {
  if (!email) return 'Student';
  const local = email.split('@')[0];
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatMs(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function timeUntilSat(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Today!';
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  const remDays = days % 7;
  if (weeks < 4) return remDays > 0 ? `${weeks}w ${remDays}d` : `${weeks} weeks`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month' : `${months} months`;
}

const AccuracyBar = memo(function AccuracyBar({ correct, attempted }) {
  const p = pct(correct, attempted);
  if (p === null) return null;
  const color = pctColor(p);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="dbProgressBar">
        <div className="dbProgressFill" style={{ width: `${p}%`, background: color }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 12, minWidth: 32, textAlign: 'right' }}>{p}%</span>
    </div>
  );
});

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

// ── Streak display ──
const StreakCard = memo(function StreakCard({ streak, practicedToday }) {
  return (
    <div className="card dbStatCard">
      <div className="dbStatValue" style={{ color: streak > 0 ? 'var(--amber)' : 'var(--muted)' }}>
        {streak || 0}
      </div>
      <div className="dbStatLabel">
        Day Streak
        {practicedToday && streak > 0 && <span style={{ color: 'var(--success)', marginLeft: 4 }}>*</span>}
      </div>
    </div>
  );
});

// ── Goal Progress Card ──
const GoalProgressCard = memo(function GoalProgressCard({ targetScore, highestScore, goalProgress, pointsToGoal }) {
  if (!targetScore) return null;
  return (
    <div className="card dbGoalCard">
      <div className="dbGoalHeader">
        <span className="h2" style={{ fontSize: 15 }}>Goal: {targetScore}</span>
        {highestScore && (
          <span className="muted small">Best: {highestScore}</span>
        )}
      </div>
      {goalProgress != null ? (
        <>
          <div className="dbGoalBarOuter">
            <div
              className="dbGoalBarFill"
              style={{
                width: `${goalProgress}%`,
                background: goalProgress >= 100 ? 'var(--success)' : 'var(--accent)',
              }}
            />
          </div>
          <div className="dbGoalMeta">
            {goalProgress >= 100 ? (
              <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 13 }}>
                Goal reached!
              </span>
            ) : (
              <span className="muted small">{pointsToGoal} points to go</span>
            )}
            <span className="muted small">{goalProgress}%</span>
          </div>
        </>
      ) : (
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          Take a practice test to start tracking progress toward your goal.
        </p>
      )}
    </div>
  );
});

// ── Weak Topics / Recommendations ──
const WeakTopicsCard = memo(function WeakTopicsCard({ weakTopics }) {
  if (!weakTopics?.length) return null;
  return (
    <div className="card dbRecsCard">
      <div className="h2" style={{ marginBottom: 10, fontSize: 15 }}>Focus Areas</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {weakTopics.map((t) => (
          <Link
            key={t.skill_name}
            href={`/practice?topics=${encodeURIComponent(t.skill_name)}&session=1`}
            className="dbRecItem"
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{t.skill_name}</div>
              <div className="muted small">{t.domain_name}</div>
            </div>
            <span style={{ color: pctColor(t.weightedPct), fontWeight: 600, fontSize: 13 }}>
              {t.weightedPct}%
            </span>
          </Link>
        ))}
      </div>
      <Link href="/dashboard/recommendations" className="dbMoreStatsLink" style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
        All Recommendations →
      </Link>
    </div>
  );
});

// ── Daily Activity Chart ──
const ActivityChart = memo(function ActivityChart({ dailyActivity }) {
  if (!dailyActivity?.length) return null;
  const max = Math.max(1, ...dailyActivity.map(d => d.attempted));
  const totalQ = dailyActivity.reduce((s, d) => s + d.attempted, 0);
  const totalC = dailyActivity.reduce((s, d) => s + d.correct, 0);
  const avgPct = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : null;

  const dayLabel = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'narrow' });
  };

  return (
    <div className="card dbActivityChartCard">
      <div className="dbActivityChartHeader">
        <span className="h2" style={{ fontSize: 15 }}>Last 14 Days</span>
        <span className="muted small">
          {totalQ} questions{avgPct != null ? ` · ${avgPct}% correct` : ''}
        </span>
      </div>
      <div className="dbActivityBars">
        {dailyActivity.map((day) => {
          const h = day.attempted > 0 ? Math.max(6, Math.round((day.attempted / max) * 100)) : 0;
          const p = day.attempted > 0 ? Math.round((day.correct / day.attempted) * 100) : 0;
          const color = day.attempted === 0 ? 'var(--border)' : pctColor(p);
          return (
            <div key={day.date} className="dbActivityBarCol" title={`${day.date}: ${day.attempted} questions, ${day.correct} correct`}>
              <div className="dbActivityBarTrack">
                <div
                  className="dbActivityBarFill"
                  style={{ height: `${h}%`, background: color }}
                />
              </div>
              <span className="dbActivityBarLabel">{dayLabel(day.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const PerfSection = memo(function PerfSection({ section, loading }) {
  const [open, setOpen] = useState({});
  const toggle = (name) => setOpen((prev) => ({ ...prev, [name]: !prev[name] }));

  const sectionTotals = section.domains.reduce(
    (acc, d) => ({ correct: acc.correct + d.correct, attempted: acc.attempted + d.attempted }),
    { correct: 0, attempted: 0 }
  );
  const sectionPct = pct(sectionTotals.correct, sectionTotals.attempted);

  return (
    <div className="card dbPerfCard">
      <div className="dbPerfCardHeader">
        <span className="h2">{section.label}</span>
        {sectionPct !== null && (
          <span className="dbSectionPct" style={{ color: pctColor(sectionPct) }}>{sectionPct}%</span>
        )}
      </div>
      {loading ? (
        <p className="muted small">Loading…</p>
      ) : !section.domains.length ? (
        <p className="muted small">No data yet — start practicing to see your stats.</p>
      ) : (
        <div className="dbDomainList">
          {section.domains.map((domain) => {
            const isOpen = open[domain.domain_name];
            const hasTopics = domain.topics.length > 0;
            return (
              <div key={domain.domain_name} className="dbDomainBlock">
                <div
                  className="dbDomainRow"
                  onClick={() => hasTopics && toggle(domain.domain_name)}
                  style={{ cursor: hasTopics ? 'pointer' : 'default' }}
                >
                  <div className="dbDomainLeft">
                    <span className={`dbChevron${hasTopics ? '' : ' invisible'}${isOpen ? ' open' : ''}`}>
                      <svg viewBox="0 0 16 16"><polyline points="6 4 10 8 6 12" /></svg>
                    </span>
                    <span className="dbDomainName">{domain.domain_name}</span>
                  </div>
                  <span className="dbRowCount">{domain.correct}/{domain.attempted}</span>
                  <div className="dbBarCell">
                    <AccuracyBar correct={domain.correct} attempted={domain.attempted} />
                  </div>
                </div>
                {isOpen && hasTopics && (
                  <div className="dbTopicList">
                    {domain.topics.map((topic) => (
                      <div key={topic.skill_name} className="dbTopicRow">
                        <span className="dbTopicName">{topic.skill_name}</span>
                        <span className="dbRowCount">{topic.correct}/{topic.attempted}</span>
                        <div className="dbBarCell">
                          <AccuracyBar correct={topic.correct} attempted={topic.attempted} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ── Session question tile ──
const SessionTile = memo(function SessionTile({ q, index, onClick }) {
  const diffClass = DIFF_CLASS[q.difficulty] || '';
  return (
    <button
      className={`dbSessionTile ${q.is_correct ? 'correct' : 'incorrect'} ${diffClass}`}
      onClick={onClick}
      title={q.skill_name || q.domain_name || ''}
    >
      <span className="dbSessionTileNum">{index + 1}</span>
      <span className="dbSessionTileIcon">{q.is_correct ? '✓' : '✗'}</span>
    </button>
  );
});

// ── Practice session card ──
const SessionCard = memo(function SessionCard({ session, index }) {
  const router = useRouter();
  const questions = session.questions;
  const correct = questions.filter(q => q.is_correct).length;
  const total = questions.length;
  const p = pct(correct, total);

  function handleTileClick(qIndex) {
    const ids = questions.map(q => q.question_id);
    const sid = `dashboard_${Date.now()}_${index}`;
    localStorage.setItem(`practice_session_${sid}`, ids.join(','));
    localStorage.setItem(`practice_session_${sid}_items`, JSON.stringify(
      questions.map(q => ({
        question_id: q.question_id,
        difficulty: q.difficulty,
        is_done: true,
        last_is_correct: q.is_correct,
        marked_for_review: false,
        domain_name: q.domain_name,
        skill_name: q.skill_name,
      }))
    ));
    localStorage.setItem(`practice_session_${sid}_meta`, JSON.stringify({
      sessionQueryString: `session=1&replay=1`,
      totalCount: ids.length,
      cachedCount: ids.length,
      cachedAt: new Date().toISOString(),
    }));

    const qid = questions[qIndex].question_id;
    router.push(
      `/practice/${encodeURIComponent(qid)}?session=1&replay=1&sid=${sid}&t=${ids.length}&o=0&p=${qIndex}&i=${qIndex + 1}`
    );
  }

  return (
    <div className="card dbSessionCard">
      <div className="dbSessionHeader">
        <div className="dbSessionMeta">
          <span className="dbSessionDate">{formatDateTime(session.startedAt)}</span>
          <span className="dbSessionStats">
            {correct}/{total}
            {p !== null && <span style={{ color: pctColor(p), fontWeight: 600 }}> ({p}%)</span>}
          </span>
        </div>
      </div>
      <div className="dbSessionTiles">
        {questions.map((q, i) => (
          <SessionTile key={q.question_id} q={q} index={i} onClick={() => handleTileClick(i)} />
        ))}
      </div>
    </div>
  );
});

// ── Assignments Card ──
const AssignmentsCard = memo(function AssignmentsCard({ assignments }) {
  const isOverdue = (due) => due && new Date(due) < new Date();
  return (
    <div className="card dbAssignmentsCard">
      <div className="h2" style={{ marginBottom: 12 }}>Your Assignments</div>
      {!assignments?.length ? (
        <p className="muted small" style={{ margin: 0 }}>No assignments yet. When your teacher assigns questions, they will appear here.</p>
      ) : (
      <div className="dbAssignList">
        {assignments.map(a => {
          const isPT = !!a.practice_test_id;
          const donePct = a.question_count > 0 ? Math.round((a.completed_count / a.question_count) * 100) : 0;
          const overdue = isOverdue(a.due_date);
          const href = isPT
            ? `/practice-test?test=${encodeURIComponent(a.practice_test_id)}${a.sections && a.sections !== 'both' ? `&sections=${a.sections}` : ''}`
            : `/assignments/${a.id}`;
          return (
            <Link key={a.id} href={href} className="dbAssignItem">
              <div className="dbAssignItemInfo">
                <div className="dbAssignItemTitle">
                  {a.title}
                  {isPT && <span className="pill" style={{ fontSize: 10, padding: '1px 6px', marginLeft: 6, background: '#7c3aed', color: '#fff' }}>Practice Test</span>}
                  {isPT && a.sections && a.sections !== 'both' && <span className="pill" style={{ fontSize: 10, padding: '1px 6px', marginLeft: 4, background: '#e0e7ff', color: '#3730a3' }}>{a.sections === 'rw' ? 'R&W Only' : 'Math Only'}</span>}
                </div>
                <div className="dbAssignItemMeta">
                  {!isPT && <span>{a.completed_count}/{a.question_count} questions</span>}
                  <span>by {a.teacher_name}</span>
                  {a.due_date && <span style={{ color: overdue ? 'var(--danger)' : undefined }}>Due {formatDate(a.due_date)}{overdue ? ' (overdue)' : ''}</span>}
                </div>
              </div>
              {!isPT && (
                <div className="dbAssignItemProgress">
                  <div className="dbProgressBar" style={{ flex: 1 }}>
                    <div className="dbProgressFill" style={{ width: `${donePct}%`, background: pctColor(donePct) }} />
                  </div>
                  <span className="dbAssignItemPct" style={{ color: pctColor(donePct) }}>{donePct}%</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
});

// ── Main ──

export default function DashboardClient({ email }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetch('/api/assignments')
      .then(r => r.json())
      .then(d => setAssignments(d.assignments || []))
      .catch(() => {});
  }, []);

  const assignmentCompletionPct = useMemo(() => {
    if (!assignments?.length) return null;
    let totalQ = 0, totalDone = 0;
    for (const a of assignments) {
      totalQ += a.question_count || 0;
      totalDone += a.completed_count || 0;
    }
    return totalQ > 0 ? Math.round((totalDone / totalQ) * 100) : null;
  }, [assignments]);

  const sections = useMemo(() =>
    data
      ? buildSections(data.domainStats, data.topicStats)
      : [{ label: 'Reading & Writing', domains: [] }, { label: 'Math', domains: [] }],
    [data?.domainStats, data?.topicStats]
  );

  const bannerChips = useMemo(() => {
    if (!data) return null;
    const sp = data.studentProfile || {};
    const satCountdown = timeUntilSat(sp.nextSatDate);
    const chips = [];
    if (sp.school) chips.push({ label: sp.school });
    if (sp.graduationYear) chips.push({ label: `Class of ${sp.graduationYear}` });
    if (data.teacherName) chips.push({ label: `Teacher: ${data.teacherName}` });
    if (satCountdown) chips.push({ label: `SAT in ${satCountdown}`, accent: true });
    return chips.length ? chips : null;
  }, [data]);

  const goalRecsRow = useMemo(() => {
    if (!data) return null;
    const hasGoal = Boolean(data.targetScore);
    const hasWeak = data.weakTopics?.length > 0;
    const hasActivity = data.dailyActivity?.some(d => d.attempted > 0);
    const cards = [];
    if (hasGoal) cards.push(<GoalProgressCard key="goal" targetScore={data.targetScore} highestScore={data.highestTestScore} goalProgress={data.goalProgress} pointsToGoal={data.pointsToGoal} />);
    if (hasWeak) cards.push(<WeakTopicsCard key="weak" weakTopics={data.weakTopics} />);
    if (hasActivity) cards.push(<ActivityChart key="activity" dailyActivity={data.dailyActivity} />);
    const visible = cards.slice(0, 2);
    if (visible.length === 0) return null;
    return (
      <div className={`dbGoalRecsRow${visible.length === 1 ? ' single' : ''}`}>
        {visible}
      </div>
    );
  }, [data?.targetScore, data?.highestTestScore, data?.goalProgress, data?.pointsToGoal, data?.weakTopics, data?.dailyActivity]);

  return (
    <main className="container dbMain">

      {/* ── Banner ── */}
      <div className="card dbBanner">
        <div className="dbBannerText">
          <div className="dbBannerGreeting">{timeGreeting()}, {displayName(email)}</div>
          <p className="muted small" style={{ margin: 0 }}>
            {data?.currentStreak > 0
              ? `${data.currentStreak} day streak — keep it going!`
              : 'Ready to practice? Let\'s go.'}
          </p>
          {bannerChips && (
            <div className="dbBannerChips">
              {bannerChips.map((c, i) => (
                <span key={i} className={`dbBannerChip${c.accent ? ' accent' : ''}`}>{c.label}</span>
              ))}
            </div>
          )}
        </div>
        <div className="dbBannerActions">
          <Link href="/practice" className="btn primary">Continue Practicing</Link>
          <Link href="/practice-test" className="btn secondary">Take a Test</Link>
        </div>
      </div>

      {/* ── Top stats row (now includes streak) ── */}
      <div className="dbStatsRow" style={assignmentCompletionPct != null ? { gridTemplateColumns: 'repeat(5, 1fr)' } : undefined}>
        <StreakCard streak={data?.currentStreak} practicedToday={data?.practicedToday} />
        <div className="card dbStatCard">
          <div className="dbStatValue" style={{ color: 'var(--accent)' }}>
            {data?.highestTestScore ?? '—'}
          </div>
          <div className="dbStatLabel">Highest Test Score</div>
        </div>
        <div className="card dbStatCard">
          <div className="dbStatValue dbStatValueSm" style={{ color: 'var(--success)' }}>
            {data?.strongest ? `${data.strongest.weightedPct}%` : '—'}
          </div>
          <div className="dbStatLabel">
            {data?.strongest ? data.strongest.skill_name : 'Strongest Topic'}
          </div>
        </div>
        <div className="card dbStatCard">
          <div className="dbStatValue" style={{ color: pctColor(data?.recentAccuracy) }}>
            {data?.recentAccuracy != null ? `${data.recentAccuracy}%` : '—'}
          </div>
          <div className="dbStatLabel">Recent Accuracy</div>
        </div>
        {assignmentCompletionPct != null && (
          <div className="card dbStatCard">
            <div className="dbStatValue" style={{ color: pctColor(assignmentCompletionPct) }}>
              {assignmentCompletionPct}%
            </div>
            <div className="dbStatLabel">Assignment Completion</div>
          </div>
        )}
      </div>

      {/* ── Goal Progress + Recommendations row ── */}
      {goalRecsRow}

      {/* ── Assignments ── */}
      <AssignmentsCard assignments={assignments} />

      {/* ── Performance: R&W | Math ── */}
      <div className="dbPerfGrid">
        {sections.map((section) => (
          <PerfSection key={section.label} section={section} loading={loading} />
        ))}
      </div>

      {/* ── More Statistics link ── */}
      {data && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Link href="/dashboard/stats" className="dbMoreStatsLink">
            More Statistics →
          </Link>
        </div>
      )}

      {/* ── Official SAT Scores ── */}
      {data?.officialScores?.length > 0 && (
        <div className="card dbOfficialScoresCard">
          <div className="h2" style={{ marginBottom: 12 }}>Official SAT Scores</div>
          <div className="dbOfficialScoresLayout">
            <div className="dbOfficialScoresList">
              {data.officialScores.map((s) => (
                <div key={s.id} className="dbOfficialScoreRow">
                  <span className="dbOfficialScoreDate">
                    {new Date(s.test_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                  </span>
                  <span className="dbOfficialScoreComposite">{s.composite_score}</span>
                  <span className="dbOfficialScoreBreakdown">R&W {s.rw_score} · M {s.math_score}</span>
                </div>
              ))}
            </div>
            {data.officialScores.length >= 2 && (() => {
              const scores = [...data.officialScores].reverse();
              const maxY = 1600;
              const minY = Math.max(0, Math.min(...scores.map(s => Math.min(s.rw_score, s.math_score))) - 50);
              const range = maxY - minY || 1;
              const w = 280;
              const h = 140;
              const pad = { top: 10, right: 10, bottom: 20, left: 32 };
              const cw = w - pad.left - pad.right;
              const ch = h - pad.top - pad.bottom;
              const xStep = scores.length > 1 ? cw / (scores.length - 1) : 0;

              const toY = (val) => pad.top + ch - ((val - minY) / range) * ch;
              const toX = (i) => pad.left + i * xStep;

              const makeLine = (key) => scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(s[key]).toFixed(1)}`).join(' ');

              const gridLines = [200, 400, 600, 800, 1000, 1200, 1400, 1600].filter(v => v >= minY && v <= maxY);

              return (
                <div className="dbOfficialScoresChart">
                  <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
                    {gridLines.map(v => (
                      <g key={v}>
                        <line x1={pad.left} x2={w - pad.right} y1={toY(v)} y2={toY(v)} stroke="var(--border)" strokeWidth="0.5" />
                        <text x={pad.left - 4} y={toY(v) + 3} textAnchor="end" fontSize="8" fill="var(--muted)">{v}</text>
                      </g>
                    ))}
                    <path d={makeLine('composite_score')} fill="none" stroke="var(--accent)" strokeWidth="2" />
                    <path d={makeLine('rw_score')} fill="none" stroke="#6b9bd2" strokeWidth="1.5" strokeDasharray="4 2" />
                    <path d={makeLine('math_score')} fill="none" stroke="#9b8ec4" strokeWidth="1.5" strokeDasharray="4 2" />
                    {scores.map((s, i) => (
                      <g key={i}>
                        <circle cx={toX(i)} cy={toY(s.composite_score)} r="3" fill="var(--accent)" />
                        <circle cx={toX(i)} cy={toY(s.rw_score)} r="2" fill="#6b9bd2" />
                        <circle cx={toX(i)} cy={toY(s.math_score)} r="2" fill="#9b8ec4" />
                        <text x={toX(i)} y={h - 4} textAnchor="middle" fontSize="7" fill="var(--muted)">
                          {new Date(s.test_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <div className="dbOfficialChartLegend">
                    <span><span className="dbOfficialLegendDot" style={{ background: 'var(--accent)' }} />Composite</span>
                    <span><span className="dbOfficialLegendDot" style={{ background: '#6b9bd2' }} />R&W</span>
                    <span><span className="dbOfficialLegendDot" style={{ background: '#9b8ec4' }} />Math</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Bottom row: Practice Tests + Recent Sessions ── */}
      <div className="dbBottomRow">

        {/* Practice test scores */}
        <div className="card dbTestCard">
          <div className="h2" style={{ marginBottom: 12 }}>Practice Tests</div>
          {loading ? (
            <p className="muted small">Loading…</p>
          ) : !data?.testScores?.length ? (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                No completed tests yet. Take a full-length adaptive SAT practice test.
              </p>
              <Link href="/practice-test" className="btn secondary dbTestBtn">Take a Test</Link>
            </>
          ) : (
            <div className="dbTestScoreList">
              {data.testScores.map((ts) => (
                <Link
                  key={ts.attempt_id}
                  href={`/practice-test/attempt/${ts.attempt_id}/results`}
                  className="dbTestScoreRow"
                >
                  <div className="dbTestScoreInfo">
                    <span className="dbTestScoreName">{ts.test_name}</span>
                    <span className="muted small">{formatDate(ts.finished_at)}</span>
                  </div>
                  <div className="dbTestScoreBadges">
                    {ts.composite != null && (
                      <div className="dbTestScoreBadge">
                        <span className="dbTestScoreBadgeNum">{ts.composite}</span>
                        <span className="dbTestScoreBadgeLabel">Total</span>
                      </div>
                    )}
                    {Object.entries(ts.sections || {}).map(([subj, s]) => (
                      <div key={subj} className="dbTestScoreBadge">
                        <span className="dbTestScoreBadgeNum">{s.scaled}</span>
                        <span className="dbTestScoreBadgeLabel">{SUBJECT_LABEL[subj] || subj}</span>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
              <Link href="/practice-test" className="btn secondary dbTestBtn" style={{ marginTop: 8 }}>
                View All Tests
              </Link>
            </div>
          )}
        </div>

        {/* Recent practice sessions */}
        <div className="card dbActivityCard">
          <div className="h2" style={{ marginBottom: 12 }}>Recent Practice</div>
          {loading ? (
            <p className="muted small">Loading…</p>
          ) : error ? (
            <p className="muted small">{error}</p>
          ) : !data?.recentSessions?.length ? (
            <p className="muted small">No questions attempted yet.</p>
          ) : (
            <div className="dbSessionList">
              {data.recentSessions.map((session, i) => (
                <SessionCard key={i} session={session} index={i} />
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
