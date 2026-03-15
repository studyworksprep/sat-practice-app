'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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

// ─── Teacher avatar with profile picture support ─────────
const TeacherAvatar = memo(function TeacherAvatar({ name, fallbackLetter, size = 72 }) {
  const [imgError, setImgError] = useState(false);
  // Try multiple file extensions
  const baseName = name.replace(/\s+/g, ' ').trim();
  const src = `/avatars/${baseName}.jpg`;
  const srcPng = `/avatars/${baseName}.png`;
  const srcWebp = `/avatars/${baseName}.webp`;

  if (imgError) {
    return (
      <div className="tmTeacherAvatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
        {fallbackLetter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className="tmTeacherAvatarImg"
      style={{ width: size, height: size }}
      onError={(e) => {
        if (e.target.src.endsWith('.jpg')) {
          e.target.src = srcPng;
        } else if (e.target.src.endsWith('.png')) {
          e.target.src = srcWebp;
        } else {
          setImgError(true);
        }
      }}
    />
  );
});

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
              <Link key={s.id} href={`/teacher/students?selected=${s.id}`} className="tmStudentRow">
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

      {/* ── Teacher Training Data ────────────────────────────── */}
      {data.training && <TeacherTrainingSection training={data.training} teacherName={displayName(teacher)} />}
    </div>
  );
}

// ─── Teacher Training Section ─────────────────────────────
function TeacherTrainingSection({ training, teacherName }) {
  const [openDomain, setOpenDomain] = useState(null);

  if (!training) return null;

  const { practiceTests, questionsDone, questionsCorrect, accuracy, recentSessions, domainMastery } = training;
  const hasActivity = questionsDone > 0 || practiceTests?.length > 0;

  if (!hasActivity) {
    return (
      <div className="card" style={{ marginTop: 24 }}>
        <h3 className="h2" style={{ marginBottom: 8 }}>Teacher Training</h3>
        <p className="muted small">No practice activity recorded for this teacher.</p>
      </div>
    );
  }

  const english = (domainMastery || []).filter(d => d.isEnglish);
  const math = (domainMastery || []).filter(d => !d.isEnglish);

  return (
    <>
      {/* Training summary */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 className="h2" style={{ marginBottom: 14 }}>{teacherName}&rsquo;s Training</h3>
        <div className="tmStatGrid">
          <div className="tmStatItem">
            <span className="tmStatValue">{questionsDone}</span>
            <span className="tmStatLabel">Questions Done</span>
          </div>
          <div className="tmStatItem">
            <span className="tmStatValue" style={{ color: pctColor(accuracy) }}>{accuracy != null ? `${accuracy}%` : '—'}</span>
            <span className="tmStatLabel">Accuracy</span>
          </div>
          <div className="tmStatItem">
            <span className="tmStatValue">{practiceTests?.length || 0}</span>
            <span className="tmStatLabel">Practice Tests</span>
          </div>
          <div className="tmStatItem">
            <span className="tmStatValue">{recentSessions?.length || 0}</span>
            <span className="tmStatLabel">Active Days</span>
          </div>
        </div>
      </div>

      {/* Practice test results */}
      {practiceTests?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="h2" style={{ marginBottom: 14 }}>Practice Test Results</h3>
          <div className="tmStudentTable">
            <div className="tmStudentThead">
              <span className="tmStudentTh" style={{ flex: 2 }}>Test</span>
              <span className="tmStudentTh" style={{ flex: 1 }}>Date</span>
              <span className="tmStudentTh tmStudentThNum">Total</span>
              <span className="tmStudentTh tmStudentThNum">R&W</span>
              <span className="tmStudentTh tmStudentThNum">Math</span>
            </div>
            {practiceTests.map(t => (
              <div key={t.id} className="tmStudentRow" style={{ cursor: 'default' }}>
                <span className="tmStudentTd" style={{ flex: 2, fontWeight: 600, fontSize: 13 }}>{t.test_name}</span>
                <span className="tmStudentTd muted small" style={{ flex: 1 }}>{formatDate(t.finished_at)}</span>
                <span className="tmStudentTd tmStudentTdNum" style={{ fontWeight: 700 }}>{t.composite ?? '—'}</span>
                <span className="tmStudentTd tmStudentTdNum" style={{ color: '#6b9bd2' }}>{t.rw_scaled ?? '—'}</span>
                <span className="tmStudentTd tmStudentTdNum" style={{ color: '#9b8ec4' }}>{t.math_scaled ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent practice sessions */}
      {recentSessions?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="h2" style={{ marginBottom: 14 }}>Recent Practice Sessions</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {recentSessions.map(s => {
              const acc = s.total > 0 ? Math.round((s.correct / s.total) * 100) : null;
              return (
                <div key={s.date} className="tmAssignRow">
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(s.date)}</span>
                  <span className="muted small">{s.total} questions</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(acc) }}>{acc != null ? `${acc}%` : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Domain mastery */}
      {domainMastery?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="h2" style={{ marginBottom: 14 }}>Domain Mastery</h3>
          <div className="filterDomainCols">
            {english.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reading & Writing</div>
                {english.map(d => (
                  <DomainMasteryCard key={d.domain_name} domain={d} isOpen={openDomain === d.domain_name} onToggle={() => setOpenDomain(openDomain === d.domain_name ? null : d.domain_name)} />
                ))}
              </div>
            )}
            {math.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Math</div>
                {math.map(d => (
                  <DomainMasteryCard key={d.domain_name} domain={d} isOpen={openDomain === d.domain_name} onToggle={() => setOpenDomain(openDomain === d.domain_name ? null : d.domain_name)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const DomainMasteryCard = memo(function DomainMasteryCard({ domain, isOpen, onToggle }) {
  const barColor = pctColor(domain.accuracy);
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{domain.domain_name}</div>
          <div className="muted small">{domain.correct}/{domain.total} correct</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${domain.accuracy || 0}%`, height: '100%', background: barColor, borderRadius: 3 }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, color: barColor, minWidth: 36, textAlign: 'right' }}>{domain.accuracy ?? '—'}%</span>
          <svg viewBox="0 0 16 16" width="12" height="12" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <polyline points="4 6 8 10 12 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      {isOpen && domain.skills?.length > 0 && (
        <div style={{ padding: '8px 10px', borderLeft: `2px solid ${barColor || 'var(--border)'}`, marginLeft: 12, marginTop: 4 }}>
          {domain.skills.map(s => (
            <div key={s.skill_name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0 }}>{s.skill_name}</span>
              <span className="muted">{s.correct}/{s.total}</span>
              <span style={{ fontWeight: 600, color: pctColor(s.accuracy), minWidth: 32, textAlign: 'right' }}>{s.accuracy != null ? `${s.accuracy}%` : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

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
          if (p?.role === 'admin' || p?.role === 'manager') {
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

  const filtered = useMemo(() => teachers.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.email || '').toLowerCase().includes(q) || displayName(t).toLowerCase().includes(q);
  }), [teachers, search]);

  if (loading) return <div className="container" style={{ padding: '40px 20px' }}><p className="muted">Loading...</p></div>;
  if (!authorized) return <div className="container" style={{ padding: '40px 20px' }}><p style={{ color: 'var(--danger)' }}>Access denied. Admin role required.</p></div>;

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
              {filtered.map(t => {
                const name = displayName(t);
                const photoName = [t.first_name, t.last_name].filter(Boolean).join(' ');
                return (
                  <button key={t.id} className="card tmTeacherCard" onClick={() => setSelectedId(t.id)}>
                    <TeacherAvatar name={photoName || name} fallbackLetter={(t.first_name || t.email || '?')[0].toUpperCase()} size={72} />
                    <div className="tmTeacherInfo">
                      <span className="tmTeacherName">{name}</span>
                      <span className="muted small">{t.email}</span>
                      <span className="tmTeacherCount">{t.student_count} student{t.student_count !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
