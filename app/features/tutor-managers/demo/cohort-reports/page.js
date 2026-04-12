'use client';

// Demo page for the Tutor Manager sales slideshow. Renders the same
// "Team Roster grid + Student Performance by Teacher" view that lives
// on /teachers, but populated with the hypothetical tutor team from
// lib/tutorManagerDemoData.js.
//
// JSX is duplicated (not imported) from app/teachers/page.js so the
// live page doesn't need to refactor for the sake of marketing
// screenshots.

import { DEMO_TUTORS } from '../../../../../lib/tutorManagerDemoData';

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

// Demo avatar — always renders a colored initials circle. The live
// TeacherAvatar tries multiple file extensions for a real photo and
// falls back to initials; for the demo we skip the photo lookup
// entirely so screenshots are deterministic regardless of which
// /avatars/* files happen to exist on disk.
function DemoAvatar({ firstName, lastName, size = 72 }) {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  return (
    <div
      className="tmTeacherAvatar"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export default function DemoCohortReportsPage() {
  const teachers = DEMO_TUTORS;
  const withStudents = teachers.filter(t => t.student_count > 0);

  return (
    <main className="container" style={{ padding: '32px 20px 48px' }}>
      <h2 className="h2" style={{ marginBottom: 6 }}>Tutor Team</h2>
      <p className="muted small" style={{ marginBottom: 20 }}>
        View teacher rosters, activity metrics, and assignments.
      </p>

      {/* Teacher cards grid */}
      <div className="tmTeacherGrid">
        {teachers.map(t => (
          <button key={t.id} className="card tmTeacherCard" type="button">
            <DemoAvatar firstName={t.first_name} lastName={t.last_name} size={72} />
            <div className="tmTeacherInfo">
              <span className="tmTeacherName">{t.first_name} {t.last_name}</span>
              <span className="muted small">{t.email}</span>
              <span className="tmTeacherCount">
                {t.student_count} student{t.student_count !== 1 ? 's' : ''}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Roster Performance by Teacher ── */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 className="h2" style={{ marginBottom: 14 }}>Student Performance by Teacher</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="adminTable" style={{ width: '100%', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Teacher</th>
                <th style={{ textAlign: 'right' }}>Students</th>
                <th style={{ textAlign: 'right' }}>Questions Done</th>
                <th style={{ textAlign: 'right' }}>Roster Accuracy</th>
                <th style={{ textAlign: 'right' }}>Avg Score</th>
                <th style={{ textAlign: 'right' }}>Tests Taken</th>
              </tr>
            </thead>
            <tbody>
              {withStudents.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{t.first_name} {t.last_name}</td>
                  <td style={{ textAlign: 'right' }}>{t.student_count}</td>
                  <td style={{ textAlign: 'right' }}>{(t.rosterQuestionsDone || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: pctColor(t.rosterAccuracy) }}>
                    {t.rosterAccuracy != null ? `${t.rosterAccuracy}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                    {t.rosterAvgScore || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{t.rosterTestCount || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
