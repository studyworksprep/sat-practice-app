'use client';

import { useEffect, useState } from 'react';
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

function AccuracyBar({ correct, attempted }) {
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
}

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
function StreakCard({ streak, practicedToday }) {
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
}

// ── Goal Progress Card ──
function GoalProgressCard({ targetScore, highestScore, goalProgress, pointsToGoal }) {
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
}

// ── Weak Topics / Recommendations ──
function WeakTopicsCard({ weakTopics }) {
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
}

function PerfSection({ section, loading }) {
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
}

// ── Session question tile ──
function SessionTile({ q, index, onClick }) {
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
}

// ── Practice session card ──
function SessionCard({ session, index }) {
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
}

// ── Assignments Card ──
function AssignmentsCard({ assignments }) {
  const isOverdue = (due) => due && new Date(due) < new Date();
  return (
    <div className="card dbAssignmentsCard">
      <div className="h2" style={{ marginBottom: 12 }}>Your Assignments</div>
      {!assignments?.length ? (
        <p className="muted small" style={{ margin: 0 }}>No assignments yet. When your teacher assigns questions, they will appear here.</p>
      ) : (
      <div className="dbAssignList">
        {assignments.map(a => {
          const donePct = a.question_count > 0 ? Math.round((a.completed_count / a.question_count) * 100) : 0;
          const overdue = isOverdue(a.due_date);
          return (
            <Link key={a.id} href={`/assignments/${a.id}`} className="dbAssignItem">
              <div className="dbAssignItemInfo">
                <div className="dbAssignItemTitle">{a.title}</div>
                <div className="dbAssignItemMeta">
                  <span>{a.completed_count}/{a.question_count} questions</span>
                  <span>by {a.teacher_name}</span>
                  {a.due_date && <span style={{ color: overdue ? 'var(--danger)' : undefined }}>Due {formatDate(a.due_date)}{overdue ? ' (overdue)' : ''}</span>}
                </div>
              </div>
              <div className="dbAssignItemProgress">
                <div className="dbProgressBar" style={{ flex: 1 }}>
                  <div className="dbProgressFill" style={{ width: `${donePct}%`, background: pctColor(donePct) }} />
                </div>
                <span className="dbAssignItemPct" style={{ color: pctColor(donePct) }}>{donePct}%</span>
              </div>
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
}

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

  const sections = data
    ? buildSections(data.domainStats, data.topicStats)
    : [{ label: 'Reading & Writing', domains: [] }, { label: 'Math', domains: [] }];

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
        </div>
        <div className="dbBannerActions">
          <Link href="/practice" className="btn primary">Continue Practicing</Link>
          <Link href="/practice-test" className="btn secondary">Take a Test</Link>
        </div>
      </div>

      {/* ── Top stats row (now includes streak) ── */}
      <div className="dbStatsRow">
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
      </div>

      {/* ── Goal Progress + Recommendations row ── */}
      {(data?.targetScore || data?.weakTopics?.length > 0) && (
        <div className="dbGoalRecsRow">
          <GoalProgressCard
            targetScore={data?.targetScore}
            highestScore={data?.highestTestScore}
            goalProgress={data?.goalProgress}
            pointsToGoal={data?.pointsToGoal}
          />
          <WeakTopicsCard weakTopics={data?.weakTopics} />
        </div>
      )}

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
