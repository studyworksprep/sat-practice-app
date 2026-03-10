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

// ─── Welcome panel ──────────────────────────────────────
function WelcomePanel() {
  return (
    <div className="tchWelcome">
      <div className="card tchWelcomeCard">
        <h2 className="h1" style={{ marginBottom: 8 }}>Teacher Management</h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          Select a teacher from the panel on the left to view their students, activity metrics, and assignments.
        </p>
        <div className="tchFeatureGrid">
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128100;</div>
            <div>
              <strong>Assigned Students</strong>
              <p className="muted small">See which students are assigned to each teacher with per-student activity breakdowns.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128200;</div>
            <div>
              <strong>Activity Metrics</strong>
              <p className="muted small">Track questions completed, accuracy, and practice activity across 7-day and 30-day windows.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128221;</div>
            <div>
              <strong>Assignments</strong>
              <p className="muted small">View all question assignments created by the teacher with due dates and question counts.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128202;</div>
            <div>
              <strong>Aggregate Stats</strong>
              <p className="muted small">Overview of total student engagement, test completions, and overall accuracy for the teacher's roster.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
function TeacherDetail({ teacherId }) {
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

  if (loading) return <div className="tchDetailLoading"><p className="muted">Loading teacher data...</p></div>;
  if (error) return <div className="tchDetailError"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!data) return null;

  const teacher = data.teacher;
  const totals = data.totals;

  return (
    <div className="tchStudentDetail">
      <div className="tchStudentHeader">
        <div>
          <h2 className="h1" style={{ margin: 0 }}>{displayName(teacher)}</h2>
          <p className="muted small" style={{ margin: 0 }}>{teacher.email}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {teacher.is_active === false && (
            <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, padding: '2px 8px', border: '1px solid var(--danger)', borderRadius: 4 }}>Inactive</span>
          )}
          <button className="btn secondary tchEditBtn" onClick={() => setEditOpen(true)}>Edit</button>
        </div>
      </div>
      {editOpen && <EditTeacherProfileModal teacher={teacher} teacherId={teacherId} onClose={() => setEditOpen(false)} onSaved={(updated) => { setData(prev => ({ ...prev, teacher: { ...prev.teacher, ...updated } })); setEditOpen(false); }} />}

      {/* Overview stats */}
      <div className="card tchOverviewCard">
        <div className="tchProfileRow">
          {teacher.high_school && <div className="tchProfileItem"><span className="tchProfileLabel">School</span><span className="tchProfileValue">{teacher.high_school}</span></div>}
          <div className="tchProfileItem"><span className="tchProfileLabel">Joined</span><span className="tchProfileValue">{new Date(teacher.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
        </div>
        <div className="tchStatsRow">
          <div className="tchStatCol"><div className="tchStatValue" style={{ color: 'var(--accent)' }}>{totals.students}</div><div className="tchStatLabel">Students</div></div>
          <div className="tchStatCol"><div className="tchStatValue">{totals.activeStudents}</div><div className="tchStatLabel">Active (7d)</div></div>
          <div className="tchStatCol"><div className="tchStatValue">{totals.questionsDone}</div><div className="tchStatLabel">Questions Done</div></div>
          <div className="tchStatCol"><div className="tchStatValue" style={{ color: pctColor(totals.accuracy) }}>{totals.accuracy != null ? `${totals.accuracy}%` : '—'}</div><div className="tchStatLabel">Accuracy</div></div>
        </div>
        <div className="tchStatsRow" style={{ marginTop: 8 }}>
          <div className="tchStatCol"><div className="tchStatValue">{totals.last7Days}</div><div className="tchStatLabel">Last 7 Days</div></div>
          <div className="tchStatCol"><div className="tchStatValue">{totals.last30Days}</div><div className="tchStatLabel">Last 30 Days</div></div>
          <div className="tchStatCol"><div className="tchStatValue">{totals.testsCompleted}</div><div className="tchStatLabel">Tests Taken</div></div>
          <div className="tchStatCol"><div className="tchStatValue">{data.assignments?.length || 0}</div><div className="tchStatLabel">Assignments</div></div>
        </div>
      </div>

      {/* Student breakdown */}
      <div className="card tchSection">
        <h3 className="h2" style={{ marginBottom: 14 }}>Assigned Students ({data.students.length})</h3>
        {data.students.length === 0 ? (
          <p className="muted small">No students assigned to this teacher.</p>
        ) : (
          <div className="tchAdminStudentTable">
            <div className="tchAdminStudentHeader">
              <span className="tchAdminStudentNameCol">Student</span>
              <span className="tchAdminStudentCell">Done</span>
              <span className="tchAdminStudentCell">Accuracy</span>
              <span className="tchAdminStudentCell">7 Days</span>
              <span className="tchAdminStudentCell">30 Days</span>
              <span className="tchAdminStudentCell">Tests</span>
            </div>
            {data.students.map(s => (
              <Link key={s.id} href={`/teacher?selected=${s.id}`} className="tchAdminStudentRow tchAdminStudentLink">
                <div className="tchAdminStudentNameCol">
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{displayName(s)}</div>
                  <div className="muted small">{s.email}</div>
                </div>
                <span className="tchAdminStudentCell">{s.questions_done}</span>
                <span className="tchAdminStudentCell" style={{ color: pctColor(s.accuracy) }}>{s.accuracy != null ? `${s.accuracy}%` : '—'}</span>
                <span className="tchAdminStudentCell" style={{ color: s.last_7_days > 0 ? 'var(--success)' : 'var(--muted)' }}>{s.last_7_days}</span>
                <span className="tchAdminStudentCell">{s.last_30_days}</span>
                <span className="tchAdminStudentCell">{s.tests_completed}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Assignments created by this teacher */}
      {data.assignments?.length > 0 && (
        <div className="card tchSection">
          <h3 className="h2" style={{ marginBottom: 14 }}>Assignments Created ({data.assignments.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.assignments.map(a => (
              <div key={a.id} className="tchAdminAssignRow">
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
    <div className="tchLayout">
      <aside className="tchSidebar">
        <div className="tchSidebarHeader">
          <div className="tchSidebarTabs">
            <button className="tchSidebarTabBtn active">
              Teachers <span className="tchSidebarCount">{teachers.length}</span>
            </button>
          </div>
        </div>
        <div className="tchSearchWrap">
          <input type="text" className="tchSearchInput" placeholder="Search teachers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="tchStudentList">
          {filtered.length === 0 ? (
            <p className="muted small" style={{ padding: '12px 16px' }}>{teachers.length === 0 ? 'No teachers found.' : 'No matches.'}</p>
          ) : filtered.map(t => (
            <button key={t.id} className={`tchStudentItem${selectedId === t.id ? ' active' : ''}`} onClick={() => setSelectedId(t.id)}>
              <div className="tchStudentAvatar" style={{ background: '#2563eb' }}>{(t.first_name || t.email || '?')[0].toUpperCase()}</div>
              <div className="tchStudentInfo">
                <span className="tchStudentName">{displayName(t)}</span>
                <span className="tchStudentEmail">{t.student_count} student{t.student_count !== 1 ? 's' : ''}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>
      <main className="tchMain">
        {selectedId ? <TeacherDetail key={selectedId} teacherId={selectedId} /> : <WelcomePanel />}
      </main>
    </div>
  );
}
