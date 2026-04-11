'use client';

// Demo page for the Tutor Manager sales slideshow. Renders the same
// Teacher Data roster table that lives in the Admin Dashboard's
// "Teacher Data" tab, but with the hypothetical 15-tutor / 100-student
// dataset from lib/tutorManagerDemoData.js instead of live data.
//
// This exists so we can screenshot a "team roster" view without
// leaking real student names for the marketing slideshow. The JSX is
// duplicated (not imported) from AdminDashboard.js so the live
// component doesn't need to become refactor-sensitive for the sake
// of a few screenshots.

import { DEMO_TUTORS } from '../../../../../lib/tutorManagerDemoData';

export default function DemoTeamRosterPage() {
  return (
    <main className="container" style={{ padding: '32px 20px 48px' }}>
      <h2 className="h2" style={{ marginBottom: 6 }}>Team Roster</h2>
      <p className="muted small" style={{ marginBottom: 16 }}>
        Live performance across your entire tutoring staff — engagement,
        accuracy, score outcomes, and assignment completion per tutor.
      </p>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="adminTable" style={{ width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>Teacher</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Students</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Active (7d)</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Engagement</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Avg Accuracy</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Avg Q/wk</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Avg Best Score</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Tested</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Assigns</th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Completion</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_TUTORS.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.first_name} {t.last_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.email}</div>
                </td>
                <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '8px 6px' }}>{t.student_count}</td>
                <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>{t.activeStudents7d}</td>
                <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '8px 6px', color: t.engagementRate >= 70 ? 'var(--success)' : t.engagementRate >= 40 ? '#eab308' : 'var(--danger)' }}>
                  {t.engagementRate != null ? `${t.engagementRate}%` : '—'}
                </td>
                <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '8px 6px', color: t.avgStudentAccuracy >= 70 ? 'var(--success)' : t.avgStudentAccuracy >= 50 ? '#eab308' : 'var(--danger)' }}>
                  {t.avgStudentAccuracy != null ? `${t.avgStudentAccuracy}%` : '—'}
                </td>
                <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>{t.avgQuestionsPerWeek}</td>
                <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '8px 6px' }}>
                  {t.avgBestTestScore ?? '—'}
                </td>
                <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>
                  {t.studentsTested}/{t.student_count}
                </td>
                <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>{t.assignmentsCreated}</td>
                <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '8px 6px', color: t.assignmentCompletionRate >= 70 ? 'var(--success)' : t.assignmentCompletionRate >= 40 ? '#eab308' : 'var(--danger)' }}>
                  {t.assignmentCompletionRate != null ? `${t.assignmentCompletionRate}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adminTeacherLegend muted small" style={{ marginTop: 12 }}>
        <strong>Engagement</strong> = % of students active in last 7 days &nbsp;|&nbsp;
        <strong>Avg Accuracy</strong> = mean student accuracy (30d) &nbsp;|&nbsp;
        <strong>Avg Q/wk</strong> = questions per student per week &nbsp;|&nbsp;
        <strong>Avg Best Score</strong> = mean of each student{"'"}s highest test score &nbsp;|&nbsp;
        <strong>Tested</strong> = students who took at least one test &nbsp;|&nbsp;
        <strong>Completion</strong> = assignment completion rate
      </div>
    </main>
  );
}
