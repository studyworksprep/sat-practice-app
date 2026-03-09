'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/browser';

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);
const SUBJECT_LABEL = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function displayName(s) {
  if (!s) return 'Student';
  if (typeof s === 'string') {
    const local = s.split('@')[0];
    return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (s.first_name || s.last_name) {
    return [s.first_name, s.last_name].filter(Boolean).join(' ');
  }
  if (!s.email) return 'Student';
  const local = s.email.split('@')[0];
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

// ─── Accuracy bar ────────────────────────────────────────
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

// ─── Bar chart for test scores ───────────────────────────
function TestScoreBarChart({ testScores }) {
  if (!testScores?.length) return null;
  const maxScore = 1600;
  const barHeight = 36;
  const gap = 8;

  return (
    <div className="tchBarChart">
      {testScores.map((ts) => {
        const rwSection = Object.entries(ts.sections || {}).find(([k]) => ['RW', 'rw'].includes(k));
        const mathSection = Object.entries(ts.sections || {}).find(([k]) => ['M', 'm', 'MATH', 'math', 'Math'].includes(k));
        const rwScore = rwSection?.[1]?.scaled || 0;
        const mathScore = mathSection?.[1]?.scaled || 0;
        const total = ts.composite || 0;
        const rwPct = (rwScore / maxScore) * 100;
        const mathPct = (mathScore / maxScore) * 100;

        return (
          <Link
            key={ts.attempt_id}
            href={`/practice-test/attempt/${ts.attempt_id}/results`}
            className="tchBarRow"
            title={`${ts.test_name} — Click to view full results`}
          >
            <div className="tchBarLabel">
              <span className="tchBarTestName">{ts.test_name}</span>
              <span className="tchBarDate">{formatDate(ts.finished_at)}</span>
            </div>
            <div className="tchBarTrack" style={{ height: barHeight }}>
              <div
                className="tchBarSegment tchBarRW"
                style={{ width: `${rwPct}%` }}
                title={`R&W: ${rwScore}`}
              />
              <div
                className="tchBarSegment tchBarMath"
                style={{ width: `${mathPct}%` }}
                title={`Math: ${mathScore}`}
              />
            </div>
            <div className="tchBarScore">
              <span className="tchBarTotal">{total}</span>
              <span className="tchBarBreakdown">
                <span style={{ color: '#6b9bd2' }}>R&W {rwScore}</span>
                {' · '}
                <span style={{ color: '#9b8ec4' }}>Math {mathScore}</span>
              </span>
            </div>
          </Link>
        );
      })}
      <div className="tchBarLegend">
        <span className="tchLegendDot" style={{ background: '#6b9bd2' }} /> R&W
        <span className="tchLegendDot" style={{ background: '#9b8ec4', marginLeft: 12 }} /> Math
      </div>
    </div>
  );
}

// ─── Domain/topic performance table ──────────────────────
function DomainTable({ domainStats, topicStats }) {
  const [open, setOpen] = useState({});
  const toggle = (name) => setOpen(prev => ({ ...prev, [name]: !prev[name] }));

  const topicsByDomain = {};
  for (const t of topicStats || []) {
    if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
    topicsByDomain[t.domain_name].push(t);
  }

  const english = { label: 'Reading & Writing', domains: [] };
  const math = { label: 'Math', domains: [] };
  for (const d of domainStats || []) {
    const section = MATH_CODES.has(d.domain_code) ? math : english;
    section.domains.push({ ...d, topics: topicsByDomain[d.domain_name] || [] });
  }

  return (
    <div>
      {[english, math].map(section => {
        if (!section.domains.length) return null;
        const sectionTotals = section.domains.reduce(
          (acc, d) => ({ correct: acc.correct + d.correct, attempted: acc.attempted + d.attempted }),
          { correct: 0, attempted: 0 }
        );
        const sectionPct = pct(sectionTotals.correct, sectionTotals.attempted);

        return (
          <div key={section.label} className="tchDomainSection">
            <div className="tchDomainSectionHeader">
              <span className="h2" style={{ margin: 0 }}>{section.label}</span>
              {sectionPct !== null && (
                <span style={{ color: pctColor(sectionPct), fontWeight: 700, fontSize: 14 }}>{sectionPct}%</span>
              )}
            </div>
            <div className="tchDomainList">
              {section.domains.map(domain => {
                const isOpen = open[domain.domain_name];
                const hasTopics = domain.topics.length > 0;
                const completionPct = domain.totalAvailable
                  ? Math.round((domain.attempted / domain.totalAvailable) * 100)
                  : null;

                return (
                  <div key={domain.domain_name} className="tchDomainBlock">
                    <div
                      className="tchDomainRow"
                      onClick={() => hasTopics && toggle(domain.domain_name)}
                      style={{ cursor: hasTopics ? 'pointer' : 'default' }}
                    >
                      <div className="tchDomainLeft">
                        <span className={`dbChevron${hasTopics ? '' : ' invisible'}${isOpen ? ' open' : ''}`}>
                          <svg viewBox="0 0 16 16"><polyline points="6 4 10 8 6 12" /></svg>
                        </span>
                        <span className="tchDomainName">{domain.domain_name}</span>
                      </div>
                      <div className="tchDomainMeta">
                        {completionPct !== null && (
                          <span className="tchDomainCompletion">{completionPct}% done</span>
                        )}
                        <span className="tchDomainCount">{domain.correct}/{domain.attempted}</span>
                      </div>
                      <div className="dbBarCell">
                        <AccuracyBar correct={domain.correct} attempted={domain.attempted} />
                      </div>
                    </div>
                    {isOpen && hasTopics && (
                      <div className="tchTopicList">
                        {domain.topics.map(topic => (
                          <div key={topic.skill_name} className="tchTopicRow">
                            <span className="tchTopicName">{topic.skill_name}</span>
                            <span className="tchDomainCount">{topic.correct}/{topic.attempted}</span>
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
          </div>
        );
      })}
    </div>
  );
}

// ─── Welcome / info panel ────────────────────────────────
function WelcomePanel({ role }) {
  return (
    <div className="tchWelcome">
      <div className="card tchWelcomeCard">
        <h2 className="h1" style={{ marginBottom: 8 }}>
          {role === 'admin' ? 'Admin Dashboard' : 'Teacher Dashboard'}
        </h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          Select a student from the panel on the left to view their progress, practice test results, and topic performance.
        </p>

        <div className="tchFeatureGrid">
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128202;</div>
            <div>
              <strong>Practice Test Results</strong>
              <p className="muted small">View bar charts of test scores over time. Click any test to see the full question-by-question breakdown.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128200;</div>
            <div>
              <strong>Domain & Topic Performance</strong>
              <p className="muted small">See accuracy and completion percentage across all SAT domains, with drill-down into individual skills.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128221;</div>
            <div>
              <strong>Practice Sessions</strong>
              <p className="muted small">Review recent practice sessions showing which questions the student attempted and their results.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#127919;</div>
            <div>
              <strong>Key Statistics</strong>
              <p className="muted small">At-a-glance metrics including highest test score, strongest/weakest topics, and recent accuracy.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DIFF_CLASS = { 1: 'easy', 2: 'medium', 3: 'hard' };

// ─── Session tile (clickable for teacher review) ────────
function TchSessionTile({ q, index, onClick }) {
  const diffClass = DIFF_CLASS[q.difficulty] || '';
  return (
    <button
      className={`dbSessionTile ${q.is_correct ? 'correct' : 'incorrect'} ${diffClass}`}
      onClick={onClick}
      title={q.skill_name || q.domain_name || ''}
    >
      <span className="dbSessionTileNum">{index + 1}</span>
      <span className="dbSessionTileIcon">{q.is_correct ? '\u2713' : '\u2717'}</span>
    </button>
  );
}

// ─── Edit profile modal ─────────────────────────────────
function EditProfileModal({ student, studentId, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: student.first_name || '',
    last_name: student.last_name || '',
    high_school: student.high_school || '',
    graduation_year: student.graduation_year || '',
    target_sat_score: student.target_sat_score || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/student/${studentId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved(data.student);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tchModalOverlay" onClick={onClose}>
      <div className="card tchModal" onClick={(e) => e.stopPropagation()}>
        <div className="tchModalHeader">
          <h3 className="h2" style={{ margin: 0 }}>Edit Student Profile</h3>
          <button className="tchModalClose" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="tchModalForm">
          <div className="tchModalRow">
            <label className="tchModalField">
              <span className="tchModalLabel">First Name</span>
              <input type="text" value={form.first_name} onChange={handleChange('first_name')} />
            </label>
            <label className="tchModalField">
              <span className="tchModalLabel">Last Name</span>
              <input type="text" value={form.last_name} onChange={handleChange('last_name')} />
            </label>
          </div>
          <label className="tchModalField">
            <span className="tchModalLabel">School</span>
            <input type="text" value={form.high_school} onChange={handleChange('high_school')} />
          </label>
          <div className="tchModalRow">
            <label className="tchModalField">
              <span className="tchModalLabel">Graduation Year</span>
              <input type="number" value={form.graduation_year} onChange={handleChange('graduation_year')} />
            </label>
            <label className="tchModalField">
              <span className="tchModalLabel">Target SAT Score</span>
              <input type="number" value={form.target_sat_score} onChange={handleChange('target_sat_score')} />
            </label>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
          <div className="tchModalActions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Student detail panel ────────────────────────────────
function StudentDetail({ studentId }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/teacher/student/${studentId}/dashboard`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <div className="tchDetailLoading"><p className="muted">Loading student data...</p></div>;
  if (error) return <div className="tchDetailError"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!data) return null;

  const student = data.student;

  return (
    <div className="tchStudentDetail">
      {/* Header */}
      <div className="tchStudentHeader">
        <div>
          <h2 className="h1" style={{ margin: 0 }}>{displayName(student)}</h2>
          <p className="muted small" style={{ margin: 0 }}>{student.email}</p>
        </div>
        <button className="btn secondary tchEditBtn" onClick={() => setEditOpen(true)}>Edit</button>
      </div>

      {editOpen && (
        <EditProfileModal
          student={student}
          studentId={studentId}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setData(prev => ({ ...prev, student: { ...prev.student, ...updated } }));
            setEditOpen(false);
          }}
        />
      )}

      {/* Profile + Stats combined card */}
      <div className="card tchOverviewCard">
        {(student.high_school || student.graduation_year || student.target_sat_score) && (
          <div className="tchProfileRow">
            {student.high_school && (
              <div className="tchProfileItem">
                <span className="tchProfileLabel">School</span>
                <span className="tchProfileValue">{student.high_school}</span>
              </div>
            )}
            {student.graduation_year && (
              <div className="tchProfileItem">
                <span className="tchProfileLabel">Graduation</span>
                <span className="tchProfileValue">{student.graduation_year}</span>
              </div>
            )}
            {student.target_sat_score && (
              <div className="tchProfileItem">
                <span className="tchProfileLabel">Target Score</span>
                <span className="tchProfileValue">{student.target_sat_score}</span>
              </div>
            )}
          </div>
        )}
        <div className="tchStatsRow">
          <div className="tchStatCol">
            <div className="tchStatValue" style={{ color: 'var(--accent)' }}>
              {data.highestTestScore ?? '—'}
            </div>
            <div className="tchStatLabel">Highest Score</div>
          </div>
          <div className="tchStatCol">
            <div className="tchStatValue">{data.totalAttempted}</div>
            <div className="tchStatLabel">Questions Done</div>
          </div>
          <div className="tchStatCol">
            <div className="tchStatValue" style={{ color: pctColor(data.recentAccuracy) }}>
              {data.recentAccuracy != null ? `${data.recentAccuracy}%` : '—'}
            </div>
            <div className="tchStatLabel">Recent Accuracy</div>
          </div>
          <div className="tchStatCol">
            <div className="tchStatValue" style={{ color: 'var(--danger)' }}>
              {data.weakest ? `${data.weakest.weightedPct}%` : '—'}
            </div>
            <div className="tchStatLabel">{data.weakest ? data.weakest.skill_name : 'Weakest'}</div>
          </div>
        </div>
      </div>

      {/* More Statistics link */}
      <div style={{ textAlign: 'center', margin: '4px 0 16px' }}>
        <Link href={`/teacher/student/${studentId}/stats`} className="dbMoreStatsLink">
          More Statistics →
        </Link>
      </div>

      {/* Practice Test Results */}
      <div className="card tchSection">
        <h3 className="h2" style={{ marginBottom: 14 }}>Practice Test Results</h3>
        {!data.testScores?.length ? (
          <p className="muted small">No completed practice tests yet.</p>
        ) : (
          <TestScoreBarChart testScores={data.testScores} />
        )}
      </div>

      {/* Domain/Topic Performance */}
      <div className="card tchSection">
        <h3 className="h2" style={{ marginBottom: 14 }}>Domain & Topic Performance</h3>
        {!data.domainStats?.length ? (
          <p className="muted small">No practice data yet.</p>
        ) : (
          <DomainTable domainStats={data.domainStats} topicStats={data.topicStats} />
        )}
      </div>

      {/* Recent Practice Sessions */}
      <div className="card tchSection">
        <h3 className="h2" style={{ marginBottom: 14 }}>Recent Practice Sessions</h3>
        {!data.recentSessions?.length ? (
          <p className="muted small">No recent practice sessions.</p>
        ) : (
          <div className="tchSessionList">
            {data.recentSessions.map((session, i) => {
              const questions = session.questions;
              const correct = questions.filter(q => q.is_correct).length;
              const total = questions.length;
              const p = pct(correct, total);

              function handleTileClick(qIndex) {
                const ids = questions.map(q => q.question_id);
                const sid = `teacher_review_${Date.now()}_${i}`;
                localStorage.setItem(`teacher_review_session_${sid}`, ids.join(','));
                // Store question metadata for the review map
                const meta = questions.map(q => ({
                  question_id: q.question_id,
                  is_correct: q.is_correct,
                  difficulty: q.difficulty,
                  domain_name: q.domain_name || '',
                  skill_name: q.skill_name || '',
                }));
                localStorage.setItem(`teacher_review_meta_${sid}`, JSON.stringify(meta));

                const qid = questions[qIndex].question_id;
                router.push(
                  `/teacher/review/${encodeURIComponent(qid)}?studentId=${studentId}&sid=${sid}&t=${ids.length}&i=${qIndex + 1}`
                );
              }

              return (
                <div key={i} className="tchSessionCard">
                  <div className="tchSessionHeader">
                    <span className="tchSessionDate">{formatDateTime(session.startedAt)}</span>
                    <span className="tchSessionStats">
                      {correct}/{total}
                      {p !== null && <span style={{ color: pctColor(p), fontWeight: 600 }}> ({p}%)</span>}
                    </span>
                  </div>
                  <div className="dbSessionTiles">
                    {questions.map((q, qi) => (
                      <TchSessionTile
                        key={qi}
                        q={q}
                        index={qi}
                        onClick={() => handleTileClick(qi)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main teacher page ───────────────────────────────────
export default function TeacherPage() {
  return (
    <Suspense>
      <TeacherPageInner />
    </Suspense>
  );
}

function TeacherPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(searchParams.get('selected') || null);
  const [role, setRole] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Check role
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle()
          .then(({ data: p }) => setRole(p?.role));
      }
    });

    // Load students
    fetch('/api/teacher/students')
      .then(r => r.json())
      .then(d => setStudents(d.students || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = students.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.email || '').toLowerCase().includes(q) ||
      displayName(s).toLowerCase().includes(q);
  });

  return (
    <div className="tchLayout">
      {/* Left sidebar */}
      <aside className="tchSidebar">
        <div className="tchSidebarHeader">
          <h2 className="tchSidebarTitle">Students</h2>
          <span className="tchSidebarCount">{students.length}</span>
        </div>
        <div className="tchSearchWrap">
          <input
            type="text"
            className="tchSearchInput"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="tchStudentList">
          {loading ? (
            <p className="muted small" style={{ padding: '12px 16px' }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="muted small" style={{ padding: '12px 16px' }}>
              {students.length === 0 ? 'No students assigned.' : 'No matches.'}
            </p>
          ) : (
            filtered.map(s => (
              <button
                key={s.id}
                className={`tchStudentItem${selectedId === s.id ? ' active' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="tchStudentAvatar">
                  {(s.first_name || s.email || '?')[0].toUpperCase()}
                </div>
                <div className="tchStudentInfo">
                  <span className="tchStudentName">{displayName(s)}</span>
                  <span className="tchStudentEmail">{s.email}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="tchMain">
        {selectedId ? (
          <StudentDetail key={selectedId} studentId={selectedId} />
        ) : (
          <WelcomePanel role={role} />
        )}
      </main>
    </div>
  );
}
