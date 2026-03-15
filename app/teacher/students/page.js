'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  displayName, formatDate, relativeTime, pct, pctColor,
  TrendIndicator, StudentDetail, AssignmentsPanel, RosterMasteryTable,
} from '../shared';

export default function StudentsPage() {
  return <Suspense><StudentsPageInner /></Suspense>;
}

function StudentsPageInner() {
  const searchParams = useSearchParams();
  const initialSelected = searchParams.get('selected') || null;
  const [view, setView] = useState(initialSelected ? 'student' : 'roster');
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [rosterData, setRosterData] = useState(null);
  const [hubData, setHubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('roster');
  const [sortBy, setSortBy] = useState('last_activity');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    Promise.all([
      fetch('/api/teacher/roster-overview').then(r => r.json()),
      fetch('/api/teacher/students').then(r => r.json()),
    ])
      .then(([roster, studentList]) => {
        if (roster.error) throw new Error(roster.error);
        setRosterData(roster);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Lazy-load hub data when mastery tab is opened
  useEffect(() => {
    if (activeTab === 'mastery' && !hubData) {
      fetch('/api/teacher/dashboard')
        .then(r => r.json())
        .then(d => { if (!d.error) setHubData(d); })
        .catch(() => {});
    }
  }, [activeTab, hubData]);

  const selectStudent = useCallback((id) => {
    setSelectedId(id);
    setView('student');
  }, []);

  const goBack = useCallback(() => {
    setView('roster');
    setSelectedId(null);
  }, []);

  if (loading) return <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}><p className="muted">Loading students...</p></div>;
  if (error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;

  // Student detail view
  if (view === 'student' && selectedId) {
    return (
      <div className="container tchPage">
        <StudentDetail key={selectedId} studentId={selectedId} onBack={goBack} />
      </div>
    );
  }

  const teacher = rosterData?.teacher || {};
  const students = rosterData?.students || [];
  const alerts = rosterData?.alerts || {};

  // Sort
  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  const sorted = useMemo(() => [...students].sort((a, b) => {
    let av = a[sortBy], bv = b[sortBy];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (sortBy === 'last_activity') {
      av = new Date(av).getTime();
      bv = new Date(bv).getTime();
    }
    if (typeof av === 'string') {
      av = av.toLowerCase();
      bv = (bv || '').toLowerCase();
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }), [students, sortBy, sortDir]);

  const sortIcon = useCallback((col) => {
    if (sortBy !== col) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  }, [sortBy, sortDir]);

  const inactiveSet = useMemo(() => new Set((alerts.inactive || []).map(a => a.id)), [alerts.inactive]);
  const decliningSet = useMemo(() => new Set((alerts.declining || []).map(a => a.id)), [alerts.declining]);
  const improvingSet = useMemo(() => new Set((alerts.improving || []).map(a => a.id)), [alerts.improving]);

  const tabs = [
    { key: 'roster', label: 'Roster' },
    { key: 'assignments', label: 'Assignments' },
    { key: 'mastery', label: 'Roster Mastery' },
  ];

  return (
    <div className="container tchPage">
      <div className="tchDashboard">
        {/* Header */}
        <div className="tchDashHeader">
          <div>
            <h1 className="h1" style={{ margin: 0 }}>Students</h1>
            <span className="muted" style={{ fontSize: 14 }}>{students.length} student{students.length !== 1 ? 's' : ''}</span>
          </div>
          <Link href="/teacher" className="btn secondary">Back to Dashboard</Link>
        </div>

        {/* Tab bar */}
        <div className="tchDashTabs">
          {tabs.map(tab => (
            <button key={tab.key} className={`tchDashTab${activeTab === tab.key ? ' active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Roster tab */}
        {activeTab === 'roster' && (
          <div className="card tchRosterCard">
            {students.length === 0 ? (
              <div style={{ padding: 24 }}>
                <p className="muted">No students on your roster yet.</p>
                <p className="muted small">Ask an admin to assign students to your account, or share your invite code: <strong>{teacher.invite_code}</strong></p>
              </div>
            ) : (
              <div className="tchRosterTable">
                <div className="tchRosterThead">
                  <span className="tchRosterTh tchRosterThName" onClick={() => toggleSort('first_name')} style={{ cursor: 'pointer' }}>Student{sortIcon('first_name')}</span>
                  <span className="tchRosterTh tchRosterThActive" onClick={() => toggleSort('last_activity')} style={{ cursor: 'pointer' }}>Last Active{sortIcon('last_activity')}</span>
                  <span className="tchRosterTh tchRosterThNum" onClick={() => toggleSort('total_attempted')} style={{ cursor: 'pointer' }}>Questions{sortIcon('total_attempted')}</span>
                  <span className="tchRosterTh tchRosterThNum" onClick={() => toggleSort('recent_accuracy')} style={{ cursor: 'pointer' }}>Accuracy{sortIcon('recent_accuracy')}</span>
                  <span className="tchRosterTh tchRosterThTrend">Trend</span>
                  <span className="tchRosterTh tchRosterThNum" onClick={() => toggleSort('highest_test_score')} style={{ cursor: 'pointer' }}>Best Score{sortIcon('highest_test_score')}</span>
                  <span className="tchRosterTh tchRosterThActions">Actions</span>
                </div>

                {sorted.map(s => {
                  const isInactive = inactiveSet.has(s.id);
                  const isDeclining = decliningSet.has(s.id);
                  const isImproving = improvingSet.has(s.id);

                  return (
                    <div
                      key={s.id}
                      className={`tchRosterRow${isInactive ? ' inactive' : ''}${isDeclining ? ' declining' : ''}${isImproving ? ' improving' : ''}`}
                    >
                      <span className="tchRosterTd tchRosterTdName">
                        <span className="tchRosterAvatar">{(s.first_name || s.email || '?')[0].toUpperCase()}</span>
                        <span>
                          <span className="tchRosterStudentName">{displayName(s)}</span>
                          {s.target_sat_score && <span className="tchRosterTarget">Target: {s.target_sat_score}</span>}
                        </span>
                      </span>
                      <span className={`tchRosterTd tchRosterTdActive${isInactive ? ' warn' : ''}`}>
                        {relativeTime(s.last_activity)}
                        {s.weekly_attempts > 0 && <span className="tchRosterWeekly">{s.weekly_attempts} this wk</span>}
                      </span>
                      <span className="tchRosterTd tchRosterTdNum">{s.total_attempted || 0}</span>
                      <span className="tchRosterTd tchRosterTdNum">
                        {s.recent_accuracy != null ? (
                          <span style={{ color: pctColor(s.recent_accuracy), fontWeight: 600 }}>{s.recent_accuracy}%</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </span>
                      <span className="tchRosterTd tchRosterTdTrend">
                        <TrendIndicator trend={s.accuracy_trend} />
                      </span>
                      <span className="tchRosterTd tchRosterTdNum">
                        {s.highest_test_score ? (
                          <span style={{ fontWeight: 600 }}>{s.highest_test_score}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </span>
                      <span className="tchRosterTd tchRosterTdActions">
                        <button className="btn primary tchRosterBtn" onClick={() => selectStudent(s.id)}>View</button>
                        <Link href={`/teacher/student/${s.id}/stats`} className="btn secondary tchRosterBtn">Stats</Link>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Assignments tab */}
        {activeTab === 'assignments' && (
          <AssignmentsPanel students={students} />
        )}

        {/* Roster Mastery tab */}
        {activeTab === 'mastery' && (
          <div className="card tchSection">
            <h3 className="h2" style={{ marginBottom: 6 }}>Roster-Wide Mastery</h3>
            <p className="muted small" style={{ marginBottom: 14 }}>Mastery is weighted by question difficulty and score band, scaled by volume, with a recency bonus for strong recent performance.</p>
            {hubData?.rosterMastery ? (
              <RosterMasteryTable domains={hubData.rosterMastery.domains} topics={hubData.rosterMastery.topics} />
            ) : (
              <p className="muted">Loading mastery data...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
