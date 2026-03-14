'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function displayName(s) {
  if (!s) return 'Unknown';
  if (s.first_name || s.last_name) {
    return [s.first_name, s.last_name].filter(Boolean).join(' ');
  }
  if (!s.email) return 'Unknown';
  const local = s.email.split('@')[0];
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Edit Teacher Profile modal ─────────────────────────
function EditTeacherProfileModal({ teacher, teacherId, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: teacher.first_name || '',
    last_name: teacher.last_name || '',
    high_school: teacher.high_school || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved(data.teacher);
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
          <h3 className="h2" style={{ margin: 0 }}>Edit Teacher Profile</h3>
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
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
          <div className="tchModalActions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Teacher detail panel ────────────────────────────────
function TeacherDetail({ teacherId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/admin/teachers/${teacherId}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [teacherId]);

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center' }}><p className="muted">Loading teacher data...</p></div>;
  if (error) return <div style={{ padding: '48px 0' }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!data) return null;

  const teacher = data.teacher;
  const totals = data.totals;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Back button + header */}
      <button className="btn secondary sm" onClick={onBack} style={{ marginBottom: 12 }}>&larr; All Teachers</button>

      <div className="tmDetailHeader">
        <div>
          <h2 className="h1" style={{ margin: 0 }}>{displayName(teacher)}</h2>
          <p className="muted small" style={{ margin: '2px 0 0' }}>{teacher.email}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {teacher.is_active === false && (
            <span className="tmInactiveBadge">Inactive</span>
          )}
          <button className="btn secondary" onClick={() => setEditOpen(true)}>Edit</button>
        </div>
      </div>
      {editOpen && <EditTeacherProfileModal teacher={teacher} teacherId={teacherId} onClose={() => setEditOpen(false)} onSaved={(updated) => { setData(prev => ({ ...prev, teacher: { ...prev.teacher, ...updated } })); setEditOpen(false); }} />}

      {/* Stats card */}
      <div className="card tmStatsCard">
        {teacher.high_school && (
          <div className="tmProfileMeta">
            <span className="muted small">School</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{teacher.high_school}</span>
          </div>
        )}
        <div className="tmProfileMeta">
          <span className="muted small">Joined</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{new Date(teacher.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        {teacher.teacher_invite_code && (
          <div className="tmProfileMeta">
            <span className="muted small">Invite Code</span>
            <span style={{ fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent)' }}>{teacher.teacher_invite_code}</span>
          </div>
        )}

        <div className="tmStatGrid">
          <div className="tmStatItem"><span className="tmStatValue" style={{ color: 'var(--accent)' }}>{totals.students}</span><span className="tmStatLabel">Students</span></div>
          <div className="tmStatItem"><span className="tmStatValue">{totals.activeStudents}</span><span className="tmStatLabel">Active (7d)</span></div>
          <div className="tmStatItem"><span className="tmStatValue">{totals.questionsDone}</span><span className="tmStatLabel">Questions Done</span></div>
          <div className="tmStatItem"><span className="tmStatValue" style={{ color: pctColor(totals.accuracy) }}>{totals.accuracy != null ? `${totals.accuracy}%` : '—'}</span><span className="tmStatLabel">Accuracy</span></div>
          <div className="tmStatItem"><span className="tmStatValue">{totals.last7Days}</span><span className="tmStatLabel">Last 7 Days</span></div>
          <div className="tmStatItem"><span className="tmStatValue">{totals.last30Days}</span><span className="tmStatLabel">Last 30 Days</span></div>
          <div className="tmStatItem"><span className="tmStatValue">{totals.testsCompleted}</span><span className="tmStatLabel">Tests Taken</span></div>
          <div className="tmStatItem"><span className="tmStatValue">{data.assignments?.length || 0}</span><span className="tmStatLabel">Assignments</span></div>
        </div>
      </div>

      {/* Student breakdown */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="h2" style={{ marginBottom: 14 }}>Assigned Students ({data.students.length})</h3>
        {data.students.length === 0 ? (
          <p className="muted small">No students assigned to this teacher.</p>
        ) : (
          <div className="tmStudentTable">
            <div className="tmStudentThead">
              <span className="tmStudentTh" style={{ flex: 2 }}>Student</span>
              <span className="tmStudentTh tmStudentThNum">Done</span>
              <span className="tmStudentTh tmStudentThNum">Accuracy</span>
              <span className="tmStudentTh tmStudentThNum">7 Days</span>
              <span className="tmStudentTh tmStudentThNum">30 Days</span>
              <span className="tmStudentTh tmStudentThNum">Tests</span>
            </div>
            {data.students.map(s => (
              <Link key={s.id} href={`/teacher?selected=${s.id}`} className="tmStudentRow">
                <div className="tmStudentTd" style={{ flex: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{displayName(s)}</span>
                  <span className="muted small">{s.email}</span>
                </div>
                <span className="tmStudentTd tmStudentTdNum">{s.questions_done}</span>
                <span className="tmStudentTd tmStudentTdNum" style={{ color: pctColor(s.accuracy) }}>{s.accuracy != null ? `${s.accuracy}%` : '—'}</span>
                <span className="tmStudentTd tmStudentTdNum" style={{ color: s.last_7_days > 0 ? 'var(--success)' : 'var(--muted)' }}>{s.last_7_days}</span>
                <span className="tmStudentTd tmStudentTdNum">{s.last_30_days}</span>
                <span className="tmStudentTd tmStudentTdNum">{s.tests_completed}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Assignments */}
      {data.assignments?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="h2" style={{ marginBottom: 14 }}>Assignments Created ({data.assignments.length})</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {data.assignments.map(a => (
              <div key={a.id} className="tmAssignRow">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                  <div className="muted small">
                    {a.question_count} questions
                    {a.due_date && <> · Due {formatDate(a.due_date)}</>}
                    {' · Created '}
                    {formatDate(a.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────
export default function TeachersPage() {
  const supabase = createClient();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle().then(({ data: p }) => {
          if (p?.role === 'admin') {
            setAuthorized(true);
            fetch('/api/admin/teachers')
              .then(r => r.json())
              .then(d => setTeachers(d.teachers || []))
              .catch(() => {})
              .finally(() => setLoading(false));
          } else {
            setLoading(false);
          }
        });
      } else {
        setLoading(false);
      }
    });
  }, []);

  if (loading) return <div className="container" style={{ padding: '40px 20px' }}><p className="muted">Loading...</p></div>;
  if (!authorized) return <div className="container" style={{ padding: '40px 20px' }}><p style={{ color: 'var(--danger)' }}>Access denied. Admin role required.</p></div>;

  const filtered = teachers.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.email || '').toLowerCase().includes(q) || displayName(t).toLowerCase().includes(q);
  });

  return (
    <main className="container" style={{ maxWidth: 1000, paddingTop: 28, paddingBottom: 48 }}>
      {selectedId ? (
        <TeacherDetail key={selectedId} teacherId={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <>
          <h1 className="h1" style={{ marginBottom: 4 }}>Teacher Management</h1>
          <p className="muted small" style={{ marginBottom: 20 }}>
            View teacher rosters, activity metrics, and assignments.
          </p>

          {/* Search */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              className="input"
              placeholder="Search teachers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 320 }}
            />
          </div>

          {/* Teacher cards grid */}
          {filtered.length === 0 ? (
            <p className="muted">{teachers.length === 0 ? 'No teachers found.' : 'No matches.'}</p>
          ) : (
            <div className="tmTeacherGrid">
              {filtered.map(t => (
                <button key={t.id} className="card tmTeacherCard" onClick={() => setSelectedId(t.id)}>
                  <div className="tmTeacherAvatar">{(t.first_name || t.email || '?')[0].toUpperCase()}</div>
                  <div className="tmTeacherInfo">
                    <span className="tmTeacherName">{displayName(t)}</span>
                    <span className="muted small">{t.email}</span>
                  </div>
                  <span className="tmTeacherCount">{t.student_count} student{t.student_count !== 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
