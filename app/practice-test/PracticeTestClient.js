'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const SUBJECT_LABELS = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math' };

function fmt(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShort(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pctColor(p) {
  if (p == null) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function ScoreBadge({ score, label }) {
  return (
    <div className="ptScoreBadge">
      <span className="ptScoreNum">{score ?? '—'}</span>
      <span className="ptScoreLabel">{label}</span>
    </div>
  );
}

// ─── Teacher Mode: student test record table ──────────────
function StudentTestsTable({ data, page, setPage, limit }) {
  if (!data) return <p className="muted">Loading…</p>;

  const totalPages = Math.ceil(data.totalTests / limit);
  const tests = data.tests || [];

  return (
    <div className="card ptTchSection">
      <div className="ptTchSectionHeader">
        <h2 className="h2" style={{ margin: 0 }}>Student Practice Tests</h2>
        <span className="muted small">{data.totalTests} total</span>
      </div>
      {!tests.length ? (
        <p className="muted small">No completed practice tests yet.</p>
      ) : (
        <>
          <div className="ptTchTable">
            <div className="ptTchThead">
              <span className="ptTchTh" style={{ flex: 2 }}>Student</span>
              <span className="ptTchTh" style={{ flex: 2 }}>Test</span>
              <span className="ptTchTh" style={{ flex: 1 }}>Date</span>
              <span className="ptTchTh ptTchThNum">Total</span>
              <span className="ptTchTh ptTchThNum">R&W</span>
              <span className="ptTchTh ptTchThNum">Math</span>
              <span className="ptTchTh" style={{ flex: 0.7 }}></span>
            </div>
            {tests.map(t => (
              <div key={t.attempt_id} className="ptTchRow">
                <span className="ptTchTd" style={{ flex: 2, fontWeight: 600 }}>{t.student_name}</span>
                <span className="ptTchTd" style={{ flex: 2 }}>{t.test_name}</span>
                <span className="ptTchTd muted small" style={{ flex: 1 }}>{fmtShort(t.finished_at)}</span>
                <span className="ptTchTd ptTchTdNum" style={{ fontWeight: 700 }}>{t.composite ?? '—'}</span>
                <span className="ptTchTd ptTchTdNum" style={{ color: '#6b9bd2' }}>{t.rw_scaled ?? '—'}</span>
                <span className="ptTchTd ptTchTdNum" style={{ color: '#9b8ec4' }}>{t.math_scaled ?? '—'}</span>
                <span className="ptTchTd" style={{ flex: 0.7 }}>
                  <Link href={`/practice-test/attempt/${t.attempt_id}/results`} className="btn secondary sm">Review</Link>
                </span>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="ptTchPager">
              <button className="btn secondary sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span className="muted small">Page {page + 1} of {totalPages}</span>
              <button className="btn secondary sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Impact analysis: before/after score comparison ───────
function ImpactAnalysis({ progressions }) {
  if (!progressions?.length) return null;

  // Only show students with 2+ tests
  const eligible = progressions.filter(p => p.test_count >= 2 && p.change != null);
  if (!eligible.length) return null;

  const improved = eligible.filter(p => p.change > 0);
  const declined = eligible.filter(p => p.change < 0);
  const steady = eligible.filter(p => p.change === 0);
  const avgChange = Math.round(eligible.reduce((s, p) => s + p.change, 0) / eligible.length);

  return (
    <div className="card ptTchSection">
      <div className="ptTchSectionHeader">
        <h2 className="h2" style={{ margin: 0 }}>Score Impact</h2>
        <span className="muted small">First test → latest test</span>
      </div>

      {/* Summary strip */}
      <div className="ptImpactSummary">
        <div className="ptImpactStat">
          <span className="ptImpactValue" style={{ color: avgChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {avgChange >= 0 ? '+' : ''}{avgChange}
          </span>
          <span className="ptImpactLabel">Avg. Change</span>
        </div>
        <div className="ptImpactStat">
          <span className="ptImpactValue" style={{ color: 'var(--success)' }}>{improved.length}</span>
          <span className="ptImpactLabel">Improved</span>
        </div>
        <div className="ptImpactStat">
          <span className="ptImpactValue" style={{ color: 'var(--danger)' }}>{declined.length}</span>
          <span className="ptImpactLabel">Declined</span>
        </div>
        <div className="ptImpactStat">
          <span className="ptImpactValue">{steady.length}</span>
          <span className="ptImpactLabel">Steady</span>
        </div>
      </div>

      {/* Per-student score chart */}
      <div className="ptProgressList">
        {eligible.map(p => {
          const maxScore = Math.max(...p.scores.map(s => s.composite), 1600);
          const minScore = Math.min(...p.scores.map(s => s.composite), 400);
          const range = Math.max(maxScore - minScore, 200);
          return (
            <div key={p.student_id} className="ptProgressRow">
              <div className="ptProgressInfo">
                <span className="ptProgressName">{p.student_name}</span>
                <span className="muted small">{p.test_count} tests</span>
              </div>
              <div className="ptProgressScores">
                <span className="ptProgressFirst">{p.first_score}</span>
                <div className="ptProgressBar">
                  {p.scores.map((s, i) => {
                    const pct = ((s.composite - (minScore - 50)) / (range + 100)) * 100;
                    return (
                      <div
                        key={i}
                        className="ptProgressDot"
                        style={{ left: `${Math.max(2, Math.min(98, pct))}%` }}
                        title={`${s.test_name}: ${s.composite} (${fmtShort(s.date)})`}
                      />
                    );
                  })}
                  <div className="ptProgressLine" />
                </div>
                <span className="ptProgressLatest">{p.latest_score}</span>
              </div>
              <span className={`ptProgressChange ${p.change > 0 ? 'up' : p.change < 0 ? 'down' : ''}`}>
                {p.change > 0 ? '+' : ''}{p.change}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Domain mastery heatmap from practice test data ───────
function DomainMasteryPanel({ domainMastery }) {
  const [openDomain, setOpenDomain] = useState(null);

  if (!domainMastery?.length) return null;

  const english = domainMastery.filter(d => d.isEnglish);
  const math = domainMastery.filter(d => !d.isEnglish);

  function DomainCard({ domain }) {
    const acc = domain.accuracy;
    const isOpen = openDomain === domain.domain_name;
    const barColor = pctColor(acc);
    // Identify low/high success
    const lowSkills = domain.skills.filter(s => s.accuracy != null && s.accuracy < 50);
    const highSkills = domain.skills.filter(s => s.accuracy != null && s.accuracy >= 70);

    return (
      <div className={`ptDomainCard${isOpen ? ' open' : ''}`}>
        <button className="ptDomainCardHeader" onClick={() => setOpenDomain(isOpen ? null : domain.domain_name)}>
          <div className="ptDomainCardInfo">
            <span className="ptDomainCardName">{domain.domain_name}</span>
            <span className="muted small">{domain.correct}/{domain.total} correct</span>
          </div>
          <div className="ptDomainCardRight">
            <div className="ptDomainAccBar">
              <div className="ptDomainAccFill" style={{ width: `${acc || 0}%`, background: barColor }} />
            </div>
            <span className="ptDomainAccValue" style={{ color: barColor, fontWeight: 700 }}>{acc ?? '—'}%</span>
            <svg className={`ptDomainChevron${isOpen ? ' open' : ''}`} viewBox="0 0 16 16" width="14" height="14">
              <polyline points="4 6 8 10 12 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>

        {isOpen && (
          <div className="ptDomainSkills">
            {lowSkills.length > 0 && (
              <div className="ptSkillGroup">
                <span className="ptSkillGroupLabel" style={{ color: 'var(--danger)' }}>Needs Work</span>
                {lowSkills.map(s => (
                  <div key={s.skill_name} className="ptSkillRow">
                    <span className="ptSkillName">{s.skill_name}</span>
                    <span className="ptSkillStats">{s.correct}/{s.total}</span>
                    <span className="ptSkillAcc" style={{ color: pctColor(s.accuracy) }}>{s.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
            {highSkills.length > 0 && (
              <div className="ptSkillGroup">
                <span className="ptSkillGroupLabel" style={{ color: 'var(--success)' }}>Strong</span>
                {highSkills.map(s => (
                  <div key={s.skill_name} className="ptSkillRow">
                    <span className="ptSkillName">{s.skill_name}</span>
                    <span className="ptSkillStats">{s.correct}/{s.total}</span>
                    <span className="ptSkillAcc" style={{ color: pctColor(s.accuracy) }}>{s.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
            {domain.skills.filter(s => s.accuracy != null && s.accuracy >= 50 && s.accuracy < 70).length > 0 && (
              <div className="ptSkillGroup">
                <span className="ptSkillGroupLabel" style={{ color: 'var(--amber)' }}>Developing</span>
                {domain.skills.filter(s => s.accuracy != null && s.accuracy >= 50 && s.accuracy < 70).map(s => (
                  <div key={s.skill_name} className="ptSkillRow">
                    <span className="ptSkillName">{s.skill_name}</span>
                    <span className="ptSkillStats">{s.correct}/{s.total}</span>
                    <span className="ptSkillAcc" style={{ color: pctColor(s.accuracy) }}>{s.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card ptTchSection">
      <div className="ptTchSectionHeader">
        <h2 className="h2" style={{ margin: 0 }}>Domain Mastery (Practice Tests)</h2>
        <span className="muted small">Roster-wide accuracy from test questions</span>
      </div>
      <div className="ptDomainGrid">
        <div>
          <div className="ptDomainGroupLabel" style={{ color: '#ea580c' }}>Reading & Writing</div>
          {english.map(d => <DomainCard key={d.domain_name} domain={d} />)}
        </div>
        <div>
          <div className="ptDomainGroupLabel" style={{ color: '#2563eb' }}>Math</div>
          {math.map(d => <DomainCard key={d.domain_name} domain={d} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Summary stats bar ────────────────────────────────────
function SummaryBar({ summary }) {
  if (!summary) return null;
  return (
    <div className="card ptTchInfoCard">
      <div className="ptTchInfoRow">
        <div className="ptTchInfoStat">
          <span className="ptTchInfoValue">{summary.studentsWithTests}</span>
          <span className="ptTchInfoLabel">Students tested</span>
        </div>
        <div className="ptTchInfoDiv" />
        <div className="ptTchInfoStat">
          <span className="ptTchInfoValue">{summary.totalTests}</span>
          <span className="ptTchInfoLabel">Tests completed</span>
        </div>
        <div className="ptTchInfoDiv" />
        <div className="ptTchInfoStat">
          <span className="ptTchInfoValue">{summary.avgComposite ?? '—'}</span>
          <span className="ptTchInfoLabel">Avg. composite</span>
        </div>
        <div className="ptTchInfoDiv" />
        <div className="ptTchInfoStat">
          <span className="ptTchInfoValue">{summary.highestComposite ?? '—'}</span>
          <span className="ptTchInfoLabel">Highest score</span>
        </div>
        <div className="ptTchInfoDiv" />
        <div className="ptTchInfoStat">
          <span className="ptTchInfoValue">{summary.medianComposite ?? '—'}</span>
          <span className="ptTchInfoLabel">Median score</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────
export default function PracticeTestClient({ trainingContent, isTeacher }) {
  const [teacherMode, setTeacherMode] = useState(() => {
    if (typeof window !== 'undefined' && isTeacher) {
      return localStorage.getItem('sat_pt_teacher_mode') === '1';
    }
    return false;
  });

  // Teacher analytics data
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  function toggleMode() {
    setTeacherMode(prev => {
      const next = !prev;
      localStorage.setItem('sat_pt_teacher_mode', next ? '1' : '0');
      return next;
    });
  }

  // Fetch teacher analytics when in teacher mode
  useEffect(() => {
    if (!teacherMode || !isTeacher) return;
    setLoading(true);
    fetch(`/api/teacher/practice-tests?page=${page}&limit=${LIMIT}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(prev => ({ ...prev, ...d, tests: d.tests })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teacherMode, isTeacher, page]);

  return (
    <main className="container ptLandingMain" style={teacherMode ? { maxWidth: 1100 } : undefined}>
      {/* Mode toggle */}
      {isTeacher && (
        <div className="modeToggleBar">
          <button
            className={`modeToggleBtn ${teacherMode ? 'teacherActive' : 'trainingActive'}`}
            onClick={toggleMode}
          >
            {teacherMode ? 'Teacher Mode' : 'Training Mode'}
          </button>
        </div>
      )}

      {teacherMode && isTeacher ? (
        /* ── Teacher Mode ── */
        <div className="ptTchDashboard">
          <h1 className="h1" style={{ marginBottom: 4 }}>Practice Test Analytics</h1>
          <p className="muted small" style={{ marginBottom: 20 }}>
            Roster-wide practice test results, score progression, and domain mastery.
          </p>

          {loading && !data ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p className="muted">Loading analytics…</p>
            </div>
          ) : data ? (
            <>
              <SummaryBar summary={data.summary} />
              <ImpactAnalysis progressions={data.progressions} />
              <DomainMasteryPanel domainMastery={data.domainMastery} />
              <StudentTestsTable data={data} page={page} setPage={setPage} limit={LIMIT} />
            </>
          ) : null}
        </div>
      ) : (
        /* ── Training Mode (student view — server rendered content passed through) ── */
        trainingContent
      )}
    </main>
  );
}
