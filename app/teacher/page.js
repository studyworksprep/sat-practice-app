'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { displayName, formatDate, formatDateTime, relativeTime, pct, pctColor, TrendIndicator } from './shared';

// ─── Main teacher dashboard page ─────────────────────────
export default function TeacherDashboardPage() {
  return <Suspense><TeacherDashboard /></Suspense>;
}

function TeacherDashboard() {
  const router = useRouter();
  const [rosterData, setRosterData] = useState(null);
  const [hubData, setHubData] = useState(null);
  const [assignmentRows, setAssignmentRows] = useState([]);
  const [assignmentPage, setAssignmentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const ASSIGNMENTS_PER_PAGE = 8;

  useEffect(() => {
    Promise.all([
      fetch('/api/teacher/roster-overview').then(r => r.json()),
      fetch('/api/teacher/dashboard').then(r => r.json()),
      fetch('/api/teacher/assignment-feed').then(r => r.json()),
    ])
      .then(([roster, hub, feed]) => {
        if (roster.error) throw new Error(roster.error);
        if (hub.error) throw new Error(hub.error);
        setRosterData(roster);
        setHubData(hub);
        setAssignmentRows(feed.rows || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const teacher = rosterData?.teacher || {};
  const students = rosterData?.students || [];
  const alerts = rosterData?.alerts || {};
  const recentSessions = hubData?.recentSessions || [];
  const recentTests = hubData?.recentTests || [];
  const upcomingRegistrations = hubData?.upcomingRegistrations || [];

  // Summary stats
  const totalStudents = students.length;
  const activeThisWeek = useMemo(() => students.filter(s => s.weekly_attempts > 0).length, [students]);
  const avgAccuracy = useMemo(() => {
    const withAcc = students.filter(s => s.recent_accuracy != null);
    if (!withAcc.length) return null;
    return Math.round(withAcc.reduce((sum, s) => sum + s.recent_accuracy, 0) / withAcc.length);
  }, [students]);

  const totalAlerts = alerts.inactive?.length || 0;

  const goToStudent = useCallback((studentId) => {
    router.push(`/teacher/students?selected=${studentId}`);
  }, [router]);

  if (loading) return <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}><p className="muted">Loading dashboard...</p></div>;
  if (error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;

  return (
    <div className="container tchPage">
      <div className="tchDashboard">
        {/* Header */}
        <div className="tchDashHeader">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/avatars/${encodeURIComponent(teacher.name || 'unknown')}.webp`}
              alt={teacher.name || 'Avatar'}
              style={{
                width: 48, height: 48, borderRadius: '50%',
                objectFit: 'cover', flexShrink: 0,
                background: 'var(--accent, #2563eb)',
              }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--accent, #2563eb)', color: '#fff',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700, flexShrink: 0,
              display: 'none',
            }}>
              {(teacher.name || 'T')[0].toUpperCase()}
            </div>
            <div>
              <h1 className="h1" style={{ margin: 0 }}>{teacher.name || 'Dashboard'}</h1>
              <span className="muted" style={{ fontSize: 14 }}>
                {teacher.role === 'admin' ? 'Admin' : teacher.role === 'manager' ? 'Manager' : 'Tutor'} Dashboard
              </span>
            </div>
          </div>
          <Link href="/teacher/students" className="btn secondary">View All Students</Link>
        </div>

        {/* Stats row + invite code */}
        <div className="card tchInfoCard">
          <div className="tchInfoRow">
            <div className="tchInfoStat">
              <span className="tchInfoStatValue">{totalStudents}</span>
              <span className="tchInfoStatLabel">Students</span>
            </div>
            <div className="tchInfoDivider" />
            <div className="tchInfoStat">
              <span className="tchInfoStatValue">{activeThisWeek}</span>
              <span className="tchInfoStatLabel">Active this week</span>
            </div>
            <div className="tchInfoDivider" />
            <div className="tchInfoStat">
              <span className="tchInfoStatValue" style={{ color: pctColor(avgAccuracy) }}>{avgAccuracy != null ? `${avgAccuracy}%` : '—'}</span>
              <span className="tchInfoStatLabel">Avg. accuracy (30-day)</span>
            </div>
            <div className="tchInfoDivider" />
            <div className="tchInfoStat">
              <span className="tchInfoStatValue" style={{ color: totalAlerts ? 'var(--danger)' : 'var(--success)' }}>{totalAlerts}</span>
              <span className="tchInfoStatLabel">Needs attention</span>
            </div>
            {teacher.invite_code && (
              <>
                <div className="tchInfoDivider" />
                <div className="tchInfoStat">
                  <span className="tchInfoStatValue tchInviteCode">{teacher.invite_code}</span>
                  <span className="tchInfoStatLabel">Invite code</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Main dashboard grid */}
        <div className="tchDashGrid">
          {/* Left column: feeds */}
          <div className="tchDashFeedsCol">
            {/* Recent Practice Sessions */}
            <div className="card tchSection">
              <div className="tchSectionHeader">
                <h3 className="h2" style={{ margin: 0 }}>Recent Practice Sessions</h3>
              </div>
              {!recentSessions.length ? (
                <p className="muted small" style={{ padding: '12px 0' }}>No recent practice sessions.</p>
              ) : (
                <div className="tchFeedList">
                  {recentSessions.slice(0, 15).map((s, i) => (
                    <button key={i} className="tchFeedRow" onClick={() => goToStudent(s.studentId)}>
                      <span className="tchFeedAvatar">{(s.studentName || '?')[0].toUpperCase()}</span>
                      <div className="tchFeedInfo">
                        <span className="tchFeedName">{s.studentName}</span>
                        <span className="tchFeedMeta">{s.questionCount} questions · {formatDateTime(s.startedAt)}</span>
                      </div>
                      <span className="tchFeedStat" style={{ color: pctColor(s.accuracy) }}>
                        {s.accuracy != null ? `${s.accuracy}%` : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Practice Tests */}
            <div className="card tchSection">
              <div className="tchSectionHeader">
                <h3 className="h2" style={{ margin: 0 }}>Recent Practice Tests</h3>
              </div>
              {!recentTests.length ? (
                <p className="muted small" style={{ padding: '12px 0' }}>No completed practice tests yet.</p>
              ) : (
                <div className="tchFeedList">
                  {recentTests.slice(0, 10).map((ts, i) => {
                    const rwSection = Object.entries(ts.sections || {}).find(([k]) => ['RW', 'rw'].includes(k));
                    const mathSection = Object.entries(ts.sections || {}).find(([k]) => ['M', 'm', 'MATH', 'math', 'Math'].includes(k));
                    const rwScore = rwSection?.[1]?.scaled || 0;
                    const mathScore = mathSection?.[1]?.scaled || 0;
                    return (
                      <button key={i} className="tchFeedRow" onClick={() => goToStudent(ts.studentId)}>
                        <span className="tchFeedAvatar">{(ts.studentName || '?')[0].toUpperCase()}</span>
                        <div className="tchFeedInfo">
                          <span className="tchFeedName">{ts.studentName}</span>
                          <span className="tchFeedMeta">{ts.test_name} · {formatDate(ts.finished_at)}</span>
                        </div>
                        <div className="tchFeedTestScore">
                          <strong>{ts.composite}</strong>
                          <span className="muted small" style={{ marginLeft: 6 }}>
                            <span style={{ color: '#6b9bd2' }}>R&W {rwScore}</span>{' · '}<span style={{ color: '#9b8ec4' }}>M {mathScore}</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column: alerts + registrations */}
          <div className="tchDashAlertsCol">
            {/* Upcoming SAT Dates */}
            <div className="card tchAlertCard">
              <h3 className="tchAlertTitle" style={{ color: 'var(--accent)' }}>Upcoming SAT Dates</h3>
              {!upcomingRegistrations.length ? (
                <p className="muted small" style={{ padding: '4px 0', margin: 0 }}>No upcoming SAT registrations.</p>
              ) : (
                <div className="tchAlertList" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {[...upcomingRegistrations].sort((a, b) => new Date(a.test_date) - new Date(b.test_date)).map((r, i) => (
                    <button key={i} className="tchAlertItem" style={{ cursor: 'pointer', background: 'none', border: 'none', width: '100%', textAlign: 'left' }} onClick={() => goToStudent(r.student_id)}>
                      <div className="tchAlertItemInfo">
                        <span className="tchAlertItemName">{r.student_name}</span>
                        <span className="tchAlertItemMeta">
                          {new Date(r.test_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {r.days_until != null && (
                            <span style={{ color: r.days_until <= 7 ? 'var(--danger)' : r.days_until <= 30 ? 'var(--amber)' : 'var(--muted)', fontWeight: 600, marginLeft: 6 }}>
                              {r.days_until === 0 ? 'Today' : r.days_until === 1 ? 'Tomorrow' : `in ${r.days_until}d`}
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assignments */}
            <div className="card tchAlertCard">
              <h3 className="tchAlertTitle" style={{ color: 'var(--accent)' }}>Assignments</h3>
              {assignmentRows.length === 0 ? (
                <p className="muted small" style={{ padding: '4px 0', margin: 0 }}>No assignments yet.</p>
              ) : (() => {
                const pageRows = assignmentRows.slice(assignmentPage * ASSIGNMENTS_PER_PAGE, (assignmentPage + 1) * ASSIGNMENTS_PER_PAGE);
                const totalPages = Math.ceil(assignmentRows.length / ASSIGNMENTS_PER_PAGE);
                const now = new Date();
                return (
                  <>
                    <div className="tchAlertList">
                      {pageRows.map((r, i) => {
                        const isPastDue = r.due_date && new Date(r.due_date) < now;
                        const isComplete = r.question_count > 0 && r.completed_count >= r.question_count;
                        function openAssignmentReview() {
                          const qids = r.question_ids || [];
                          if (!qids.length) return;
                          const statuses = r.question_statuses || [];
                          const statusMap = {};
                          for (const qs of statuses) { statusMap[qs.question_id] = qs; }
                          const sid = `tch_assign_${r.assignment_id}_${r.student_id}`;
                          localStorage.setItem(`practice_session_${sid}`, qids.join(','));
                          localStorage.setItem(`practice_session_${sid}_items`, JSON.stringify(
                            qids.map(qid => {
                              const qs = statusMap[qid] || {};
                              return {
                                question_id: qid,
                                difficulty: qs.difficulty,
                                is_done: qs.is_done || false,
                                last_is_correct: qs.last_is_correct || false,
                                marked_for_review: qs.marked_for_review || false,
                                domain_name: qs.domain_name || '',
                                skill_name: qs.skill_name || '',
                              };
                            })
                          ));
                          localStorage.setItem(`practice_session_${sid}_meta`, JSON.stringify({
                            sessionQueryString: 'session=1',
                            totalCount: qids.length,
                            cachedCount: qids.length,
                            cachedAt: new Date().toISOString(),
                          }));
                          window.open(
                            `/practice/${encodeURIComponent(qids[0])}?session=1&sid=${sid}&t=${qids.length}&o=0&p=0&i=1&tm=1&view_as=${encodeURIComponent(r.student_id)}`,
                            '_blank'
                          );
                        }
                        return (
                          <div key={`${r.assignment_id}-${r.student_name}-${i}`} style={{
                            padding: '8px 4px',
                            borderBottom: i < pageRows.length - 1 ? '1px solid var(--border, #eee)' : 'none',
                            opacity: isComplete ? 0.6 : 1,
                            cursor: 'pointer',
                            borderRadius: 6,
                            transition: 'background 0.1s',
                          }}
                          onClick={openAssignmentReview}
                          title={`Review ${r.student_name}'s assignment: ${r.title}`}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.student_name}
                              </span>
                              <span style={{ fontSize: 12, fontFamily: 'monospace', color: isComplete ? 'var(--success)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                                {r.completed_count}/{r.question_count}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                              <span className="muted" style={{ fontSize: 12 }}>{r.title}</span>
                              {r.due_date && (
                                <span style={{
                                  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                                  color: isPastDue && !isComplete ? 'var(--danger)' : 'var(--muted)',
                                }}>
                                  {isPastDue && !isComplete ? 'Past due · ' : ''}
                                  {new Date(r.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0', borderTop: '1px solid var(--border, #eee)', marginTop: 4 }}>
                        <button
                          className="btn secondary"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          disabled={assignmentPage === 0}
                          onClick={() => setAssignmentPage(p => p - 1)}
                        >Prev</button>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {assignmentPage + 1} / {totalPages}
                        </span>
                        <button
                          className="btn secondary"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          disabled={assignmentPage >= totalPages - 1}
                          onClick={() => setAssignmentPage(p => p + 1)}
                        >Next</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Improving / momentum */}
            {alerts.improving?.length > 0 && (
              <div className="card tchAlertCard">
                <h3 className="tchAlertTitle tchAlertTitleSuccess">Gaining Momentum</h3>
                <div className="tchAlertList">
                  {alerts.improving.map(a => {
                    const s = students.find(x => x.id === a.id);
                    if (!s) return null;
                    return (
                      <button key={a.id} className="tchAlertItem" style={{ cursor: 'pointer', background: 'none', border: 'none', width: '100%', textAlign: 'left' }} onClick={() => goToStudent(a.id)}>
                        <div className="tchAlertItemInfo">
                          <span className="tchAlertItemName">{displayName(s)}</span>
                          <span className="tchAlertItemMeta" style={{ color: 'var(--success)' }}>
                            +{a.trend}% from previous period
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All clear */}
            {!alerts.inactive?.length && !alerts.improving?.length && (
              <div className="card tchAlertCard">
                <h3 className="tchAlertTitle">All Clear</h3>
                <p className="muted small" style={{ margin: 0 }}>No alerts right now. All students are active and on track.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
