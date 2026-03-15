'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';

const ROLE_ORDER = ['admin', 'manager', 'teacher', 'student', 'practice'];
const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', teacher: 'Teacher', student: 'Student', practice: 'Practice' };
const ROLE_COLOR = {
  admin: '#7c3aed',
  manager: '#0891b2',
  teacher: '#2563eb',
  student: '#16a34a',
  practice: '#6b7280',
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminPage() {
  const supabase = createClient();

  const [tests, setTests] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);

  // Score conversion dialog state
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [rwM1, setRwM1] = useState('');
  const [rwM2, setRwM2] = useState('');
  const [rwScaled, setRwScaled] = useState('');
  const [mathM1, setMathM1] = useState('');
  const [mathM2, setMathM2] = useState('');
  const [mathScaled, setMathScaled] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Assignment state
  const [assignments, setAssignments] = useState([]);
  const [assignTeacher, setAssignTeacher] = useState('');
  const [assignStudent, setAssignStudent] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Manager-teacher assignment state
  const [mtAssignments, setMtAssignments] = useState([]);
  const [mtManager, setMtManager] = useState('');
  const [mtTeacher, setMtTeacher] = useState('');
  const [mtLoading, setMtLoading] = useState(false);

  // Teacher code state
  const [teacherCodes, setTeacherCodes] = useState([]);
  const [newCodeValue, setNewCodeValue] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [showTeacherCodes, setShowTeacherCodes] = useState(false);

  // Teacher invite code state
  const [inviteTeachers, setInviteTeachers] = useState([]);
  const [showInviteCodes, setShowInviteCodes] = useState(false);
  const [inviteCodeLoading, setInviteCodeLoading] = useState({});

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // user id pending confirmation

  // Bug reports
  const [recentBugs, setRecentBugs] = useState([]);

  useEffect(() => {
    supabase
      .from('practice_tests')
      .select('id, code, name')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setTests(data || []);
        setLoading(false);
      });

    fetchUsers();
    fetchAssignments();
    fetchManagerAssignments();
    fetchTeacherCodes();
    fetchInviteCodes();
    fetchRecentBugs();
  }, []);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load users');
      setProfiles(json.profiles || []);
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchAssignments() {
    try {
      const res = await fetch('/api/admin/assignments');
      const json = await res.json();
      if (res.ok) setAssignments(json.assignments || []);
    } catch {}
  }

  async function fetchTeacherCodes() {
    try {
      const res = await fetch('/api/admin/teacher-codes');
      const json = await res.json();
      if (res.ok) setTeacherCodes(json.codes || []);
    } catch {}
  }

  async function handleAssign() {
    if (!assignTeacher || !assignStudent) return showToast('danger', 'Select both a teacher and a student.');
    if (assignTeacher === assignStudent) return showToast('danger', 'Cannot assign a user to themselves.');
    setAssignLoading(true);
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: assignTeacher, student_id: assignStudent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', 'Student assigned.');
      setAssignTeacher('');
      setAssignStudent('');
      fetchAssignments();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleUnassign(teacherId, studentId) {
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, student_id: studentId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Assignment removed.');
      fetchAssignments();
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  // ── Manager-Teacher assignments ──
  async function fetchManagerAssignments() {
    try {
      const res = await fetch('/api/admin/manager-assignments');
      const json = await res.json();
      if (res.ok) setMtAssignments(json.assignments || []);
    } catch {}
  }

  async function handleMtAssign() {
    if (!mtManager || !mtTeacher) return showToast('danger', 'Select both a manager and a teacher.');
    if (mtManager === mtTeacher) return showToast('danger', 'Cannot assign a user to themselves.');
    setMtLoading(true);
    try {
      const res = await fetch('/api/admin/manager-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: mtManager, teacher_id: mtTeacher }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', 'Teacher assigned to manager.');
      setMtManager('');
      setMtTeacher('');
      fetchManagerAssignments();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setMtLoading(false);
    }
  }

  async function handleMtUnassign(managerId, teacherId) {
    try {
      const res = await fetch('/api/admin/manager-assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: managerId, teacher_id: teacherId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Manager-teacher assignment removed.');
      fetchManagerAssignments();
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  function showToast(kind, message) {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update role');
      setProfiles((prev) => prev.map((p) => p.id === userId ? { ...p, role: newRole } : p));
      showToast('ok', 'Role updated.');
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  async function handleToggleActive(userId, currentlyActive) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, is_active: !currentlyActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setProfiles((prev) => prev.map((p) => p.id === userId ? { ...p, is_active: !currentlyActive } : p));
      showToast('ok', !currentlyActive ? 'Account activated.' : 'Account set to inactive.');
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  async function handleDeleteUser(userId) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setProfiles((prev) => prev.filter((p) => p.id !== userId));
      setDeleteConfirm(null);
      showToast('ok', 'Account permanently deleted.');
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  async function handleCreateCode() {
    setCodeLoading(true);
    try {
      const res = await fetch('/api/admin/teacher-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCodeValue ? { code: newCodeValue } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', `Teacher code "${json.code.code}" created.`);
      setNewCodeValue('');
      fetchTeacherCodes();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setCodeLoading(false);
    }
  }

  async function handleRevokeCode(id) {
    try {
      const res = await fetch('/api/admin/teacher-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Teacher code revoked.');
      fetchTeacherCodes();
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  async function fetchInviteCodes() {
    try {
      const res = await fetch('/api/admin/teacher-invite-codes');
      const json = await res.json();
      if (res.ok) {
        setInviteTeachers(json.teachers || []);
      }
    } catch {}
  }

  async function handleGenerateInviteCode(teacherId) {
    setInviteCodeLoading(prev => ({ ...prev, [teacherId]: true }));
    try {
      const res = await fetch('/api/admin/teacher-invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', `Invite code "${json.code}" generated.`);
      fetchInviteCodes();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setInviteCodeLoading(prev => ({ ...prev, [teacherId]: false }));
    }
  }

  async function handleRevokeInviteCode(teacherId) {
    setInviteCodeLoading(prev => ({ ...prev, [teacherId]: true }));
    try {
      const res = await fetch('/api/admin/teacher-invite-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Invite code removed.');
      fetchInviteCodes();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setInviteCodeLoading(prev => ({ ...prev, [teacherId]: false }));
    }
  }

  async function fetchRecentBugs() {
    try {
      const res = await fetch('/api/admin/bug-reports?limit=4');
      const json = await res.json();
      if (res.ok) setRecentBugs(json.reports || []);
    } catch {}
  }

  async function handleSaveScores() {
    if (!selectedTestId) return showToast('danger', 'Select a test first.');

    const entries = [];
    const test = tests.find((t) => t.id === selectedTestId);

    if (rwM1 !== '' && rwM2 !== '' && rwScaled !== '') {
      entries.push({
        section: 'reading_writing',
        module1_correct: parseInt(rwM1, 10),
        module2_correct: parseInt(rwM2, 10),
        scaled_score: parseInt(rwScaled, 10),
      });
    }
    if (mathM1 !== '' && mathM2 !== '' && mathScaled !== '') {
      entries.push({
        section: 'math',
        module1_correct: parseInt(mathM1, 10),
        module2_correct: parseInt(mathM2, 10),
        scaled_score: parseInt(mathScaled, 10),
      });
    }

    if (entries.length === 0) {
      return showToast('danger', 'Fill in at least one complete section (both modules + scale score).');
    }

    for (const e of entries) {
      if (e.scaled_score < 200 || e.scaled_score > 800) {
        return showToast('danger', 'Scale scores must be between 200 and 800.');
      }
      if (e.module1_correct < 0 || e.module2_correct < 0) {
        return showToast('danger', 'Correct counts cannot be negative.');
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/score-conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: selectedTestId, test_name: test?.name || '', entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showToast('ok', `Saved ${data.saved} score conversion(s).`);
      setRwM1(''); setRwM2(''); setRwScaled('');
      setMathM1(''); setMathM2(''); setMathScaled('');
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setSaving(false);
    }
  }

  // Group profiles by role
  const grouped = useMemo(() => {
    const g = {};
    for (const role of ROLE_ORDER) g[role] = [];
    for (const p of profiles) {
      const role = ROLE_ORDER.includes(p.role) ? p.role : 'practice';
      g[role].push(p);
    }
    return g;
  }, [profiles]);

  // Memoize filtered lists for assignment dropdowns
  const teacherProfiles = useMemo(() => profiles.filter(p => p.role === 'teacher' || p.role === 'manager' || p.role === 'admin'), [profiles]);
  const studentProfiles = useMemo(() => profiles.filter(p => p.role === 'student' || p.role === 'practice'), [profiles]);
  const managerProfiles = useMemo(() => profiles.filter(p => p.role === 'manager'), [profiles]);
  const teacherOnlyProfiles = useMemo(() => profiles.filter(p => p.role === 'teacher'), [profiles]);

  if (loading) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="container adminMain">
      <h1 className="h1" style={{ marginBottom: 4 }}>Admin</h1>
      <p className="muted small" style={{ marginBottom: 28 }}>
        Manage users, accounts, and score data.
      </p>

      {/* Toast */}
      {toast && (
        <div
          className="toast"
          style={{
            borderColor: toast.kind === 'ok' ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.6)',
            marginBottom: 16,
          }}
        >
          <span className="small">{toast.message}</span>
        </div>
      )}

      {/* ── User count panels ──────────────────────────────────── */}
      <div className="adminPanels">
        {ROLE_ORDER.map((role) => (
          <div className="card adminPanel" key={role}>
            <div className="adminPanelCount" style={{ color: ROLE_COLOR[role] }}>
              {grouped[role].length}
            </div>
            <div className="adminPanelTitle">{ROLE_LABEL[role]}s</div>
          </div>
        ))}
      </div>

      {/* ── Recent Bug Reports ───────────────────────────────── */}
      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}>Recent Bug Reports</h2>
          <Link href="/bugs" className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }}>
            View All
          </Link>
        </div>
        {recentBugs.length === 0 ? (
          <p className="muted small">No bug reports yet.</p>
        ) : (
          <div className="adminBugGrid">
            {recentBugs.map((bug) => (
              <div key={bug.id} className="card adminBugCard">
                <div className="adminBugCardHeader">
                  <span className="adminBugTitle">{bug.title || 'Bug Report'}</span>
                  <span className={`adminBugStatus adminBugStatus--${bug.status}`}>
                    {bug.status === 'in_progress' ? 'In Progress' : bug.status?.charAt(0).toUpperCase() + bug.status?.slice(1)}
                  </span>
                </div>
                <p className="adminBugDesc">{bug.description}</p>
                <div className="adminBugMeta">
                  <span>{formatDate(bug.created_at)}</span>
                  {bug.created_by && <span>by {bug.created_by}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── User management ────────────────────────────────────── */}
      <section style={{ marginTop: 32 }}>
        <h2 className="h2" style={{ marginBottom: 16 }}>Users</h2>
        {usersLoading ? (
          <p className="muted small">Loading users…</p>
        ) : profiles.length === 0 ? (
          <p className="muted small">No profiles found. Run the migration to create the profiles table.</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="adminTable">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} style={p.is_active === false ? { opacity: 0.55 } : undefined}>
                    <td className="adminTableEmail">{p.email || '—'}</td>
                    <td>
                      <select
                        className="adminRoleSelect"
                        value={p.role}
                        onChange={(e) => handleRoleChange(p.id, e.target.value)}
                        style={{ color: ROLE_COLOR[p.role] || ROLE_COLOR.practice }}
                      >
                        {ROLE_ORDER.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="adminStatusToggle"
                        onClick={() => handleToggleActive(p.id, p.is_active !== false)}
                        style={{
                          color: p.is_active !== false ? '#16a34a' : '#dc2626',
                          background: p.is_active !== false ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                          border: '1px solid',
                          borderColor: p.is_active !== false ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)',
                          borderRadius: 6,
                          padding: '2px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {p.is_active !== false ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="muted small">{formatDate(p.created_at)}</td>
                    <td>
                      {deleteConfirm === p.id ? (
                        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button
                            className="adminDeleteConfirmBtn"
                            onClick={() => handleDeleteUser(p.id)}
                            style={{
                              background: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              padding: '2px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{
                              background: 'transparent',
                              color: 'var(--muted)',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              padding: '2px 8px',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(p.id)}
                          style={{
                            background: 'transparent',
                            color: '#dc2626',
                            border: '1px solid rgba(220,38,38,0.25)',
                            borderRadius: 4,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Teacher Codes ──────────────────────────────────────── */}
      <section style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="h2" style={{ margin: 0 }}>Teacher Codes</h2>
          <button className="btn" onClick={() => setShowTeacherCodes(!showTeacherCodes)}>
            {showTeacherCodes ? 'Close' : 'Manage Codes'}
          </button>
        </div>

        {showTeacherCodes && (
          <div className="card" style={{ padding: 20 }}>
            {/* Create new code */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end' }}>
              <label className="adminLabel" style={{ flex: 1 }}>
                New Code (leave blank to auto-generate)
                <input
                  type="text"
                  className="adminInput"
                  placeholder="e.g. TEACHER2025"
                  value={newCodeValue}
                  onChange={(e) => setNewCodeValue(e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase' }}
                />
              </label>
              <button className="btn" onClick={handleCreateCode} disabled={codeLoading} style={{ marginBottom: 2 }}>
                {codeLoading ? 'Creating…' : 'Create Code'}
              </button>
            </div>

            {/* Codes table */}
            {teacherCodes.length === 0 ? (
              <p className="muted small">No teacher codes yet.</p>
            ) : (
              <div style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid var(--border)' }}>
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Status</th>
                      <th>Used By</th>
                      <th>Created</th>
                      <th style={{ width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {teacherCodes.map((tc) => {
                      const usedByProfile = tc.used_by ? profiles.find(p => p.id === tc.used_by) : null;
                      return (
                        <tr key={tc.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.05em' }}>{tc.code}</td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: tc.used_by ? 'rgba(107,114,128,0.1)' : 'rgba(22,163,74,0.1)',
                              color: tc.used_by ? '#6b7280' : '#16a34a',
                            }}>
                              {tc.used_by ? 'Used' : 'Available'}
                            </span>
                          </td>
                          <td className="muted small">{usedByProfile?.email || (tc.used_by ? tc.used_by : '—')}</td>
                          <td className="muted small">{formatDate(tc.created_at)}</td>
                          <td>
                            <button
                              className="adminAssignRemove"
                              onClick={() => handleRevokeCode(tc.id)}
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Teacher Invite Codes ─────────────────────────────── */}
      <section style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="h2" style={{ margin: 0 }}>Teacher Invite Codes</h2>
          <button className="btn" onClick={() => setShowInviteCodes(!showInviteCodes)}>
            {showInviteCodes ? 'Close' : 'Manage Invite Codes'}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 12 }}>
          Students can enter a teacher&apos;s invite code during sign-up to be automatically assigned.
        </p>

        {showInviteCodes && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {inviteTeachers.length === 0 ? (
              <p className="muted small" style={{ padding: 20 }}>No teachers found.</p>
            ) : (
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Invite Code</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteTeachers.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.first_name || t.last_name
                          ? `${t.first_name || ''} ${t.last_name || ''}`.trim()
                          : t.email}
                        {(t.first_name || t.last_name) && (
                          <span className="muted small" style={{ marginLeft: 6 }}>{t.email}</span>
                        )}
                      </td>
                      <td>
                        {t.teacher_invite_code ? (
                          <span style={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            fontSize: 14,
                            background: 'rgba(22,163,74,0.08)',
                            color: '#16a34a',
                            padding: '2px 10px',
                            borderRadius: 4,
                          }}>
                            {t.teacher_invite_code}
                          </span>
                        ) : (
                          <span className="muted small">None</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: '3px 10px' }}
                            onClick={() => handleGenerateInviteCode(t.id)}
                            disabled={inviteCodeLoading[t.id]}
                          >
                            {inviteCodeLoading[t.id] ? '…' : t.teacher_invite_code ? 'Regenerate' : 'Generate'}
                          </button>
                          {t.teacher_invite_code && (
                            <button
                              className="adminAssignRemove"
                              onClick={() => handleRevokeInviteCode(t.id)}
                              disabled={inviteCodeLoading[t.id]}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* ── Score Conversion Entry ──────────────────────────── */}
      <section style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="h2" style={{ margin: 0 }}>Score Conversions</h2>
          <button className="btn" onClick={() => setShowScoreDialog(!showScoreDialog)}>
            {showScoreDialog ? 'Close' : 'Add Score Data'}
          </button>
        </div>

        {showScoreDialog && (
          <div className="card adminScoreDialog">
            <label className="adminLabel">
              Practice Test
              <select
                className="adminSelect"
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
              >
                <option value="">Select a test…</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <fieldset className="adminFieldset">
              <legend className="adminLegend">Reading & Writing</legend>
              <div className="adminFieldRow">
                <label className="adminLabel adminFieldSmall">
                  Module 1 Correct
                  <input type="number" min="0" className="adminInput" value={rwM1} onChange={(e) => setRwM1(e.target.value)} />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Module 2 Correct
                  <input type="number" min="0" className="adminInput" value={rwM2} onChange={(e) => setRwM2(e.target.value)} />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Scale Score
                  <input type="number" min="200" max="800" className="adminInput" value={rwScaled} onChange={(e) => setRwScaled(e.target.value)} />
                </label>
              </div>
            </fieldset>

            <fieldset className="adminFieldset">
              <legend className="adminLegend">Math</legend>
              <div className="adminFieldRow">
                <label className="adminLabel adminFieldSmall">
                  Module 1 Correct
                  <input type="number" min="0" className="adminInput" value={mathM1} onChange={(e) => setMathM1(e.target.value)} />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Module 2 Correct
                  <input type="number" min="0" className="adminInput" value={mathM2} onChange={(e) => setMathM2(e.target.value)} />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Scale Score
                  <input type="number" min="200" max="800" className="adminInput" value={mathScaled} onChange={(e) => setMathScaled(e.target.value)} />
                </label>
              </div>
            </fieldset>

            <button className="btn" onClick={handleSaveScores} disabled={saving} style={{ marginTop: 8 }}>
              {saving ? 'Saving…' : 'Save Score Data'}
            </button>
          </div>
        )}
      </section>

      {/* ── Teacher-Student Assignments ────────────────────── */}
      <section className="adminAssignSection">
        <h2 className="h2" style={{ marginBottom: 16 }}>Teacher-Student Assignments</h2>

        <div className="adminAssignGrid">
          <label className="adminLabel">
            Teacher
            <select className="adminSelect" value={assignTeacher} onChange={(e) => setAssignTeacher(e.target.value)}>
              <option value="">Select teacher…</option>
              {teacherProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.email}</option>
              ))}
            </select>
          </label>
          <label className="adminLabel">
            Student
            <select className="adminSelect" value={assignStudent} onChange={(e) => setAssignStudent(e.target.value)}>
              <option value="">Select student…</option>
              {studentProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.email}</option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={handleAssign} disabled={assignLoading} style={{ marginBottom: 2 }}>
            {assignLoading ? 'Assigning…' : 'Assign'}
          </button>
        </div>

        {assignments.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="adminAssignTable">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Student</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const teacher = profiles.find(p => p.id === a.teacher_id);
                  const student = profiles.find(p => p.id === a.student_id);
                  return (
                    <tr key={`${a.teacher_id}-${a.student_id}`}>
                      <td>{teacher?.email || a.teacher_id}</td>
                      <td>{student?.email || a.student_id}</td>
                      <td>
                        <button
                          className="adminAssignRemove"
                          onClick={() => handleUnassign(a.teacher_id, a.student_id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Manager-Teacher Assignments ────────────────────── */}
      <section className="adminAssignSection">
        <h2 className="h2" style={{ marginBottom: 16 }}>Manager-Teacher Assignments</h2>

        <div className="adminAssignGrid">
          <label className="adminLabel">
            Manager
            <select className="adminSelect" value={mtManager} onChange={(e) => setMtManager(e.target.value)}>
              <option value="">Select manager…</option>
              {managerProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.email}</option>
              ))}
            </select>
          </label>
          <label className="adminLabel">
            Teacher
            <select className="adminSelect" value={mtTeacher} onChange={(e) => setMtTeacher(e.target.value)}>
              <option value="">Select teacher…</option>
              {teacherOnlyProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.email}</option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={handleMtAssign} disabled={mtLoading} style={{ marginBottom: 2 }}>
            {mtLoading ? 'Assigning…' : 'Assign'}
          </button>
        </div>

        {mtAssignments.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="adminAssignTable">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Teacher</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {mtAssignments.map((a) => {
                  const manager = profiles.find(p => p.id === a.manager_id);
                  const teacher = profiles.find(p => p.id === a.teacher_id);
                  return (
                    <tr key={`${a.manager_id}-${a.teacher_id}`}>
                      <td>{manager?.email || a.manager_id}</td>
                      <td>{teacher?.email || a.teacher_id}</td>
                      <td>
                        <button
                          className="adminAssignRemove"
                          onClick={() => handleMtUnassign(a.manager_id, a.teacher_id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
