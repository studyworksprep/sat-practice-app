'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';

const ROLE_ORDER = ['admin', 'teacher', 'student', 'practice'];
const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', student: 'Student', practice: 'Practice' };
const ROLE_COLOR = {
  admin: '#7c3aed',
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
  const grouped = {};
  for (const role of ROLE_ORDER) grouped[role] = [];
  for (const p of profiles) {
    const role = ROLE_ORDER.includes(p.role) ? p.role : 'practice';
    grouped[role].push(p);
  }

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
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
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
                    <td className="muted small">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              {profiles.filter(p => p.role === 'teacher' || p.role === 'admin').map(p => (
                <option key={p.id} value={p.id}>{p.email}</option>
              ))}
            </select>
          </label>
          <label className="adminLabel">
            Student
            <select className="adminSelect" value={assignStudent} onChange={(e) => setAssignStudent(e.target.value)}>
              <option value="">Select student…</option>
              {profiles.filter(p => p.role === 'student' || p.role === 'practice').map(p => (
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
    </main>
  );
}
