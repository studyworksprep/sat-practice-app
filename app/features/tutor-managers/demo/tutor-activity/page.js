'use client';

// Demo page for the Tutor Manager sales slideshow. Renders the same
// "Teacher Training" profile that lives on the /teachers page when
// you click into a tutor, but populated with the hypothetical
// featured-tutor data from lib/tutorManagerDemoData.js.
//
// JSX is duplicated (not imported) from app/teachers/page.js so the
// live page doesn't need to refactor for the sake of marketing
// screenshots.

import { useState } from 'react';
import {
  DEMO_FEATURED_TUTOR,
  DEMO_FEATURED_TRAINING,
} from '../../../../../lib/tutorManagerDemoData';

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DomainMasteryCard({ domain, isOpen, onToggle }) {
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
}

export default function DemoTutorActivityPage() {
  const tutor = DEMO_FEATURED_TUTOR;
  const training = DEMO_FEATURED_TRAINING;
  const [openDomain, setOpenDomain] = useState(null);

  const { practiceTests, questionsDone, accuracy, recentSessions, domainMastery } = training;
  const english = (domainMastery || []).filter(d => d.isEnglish);
  const math = (domainMastery || []).filter(d => !d.isEnglish);

  return (
    <main className="container" style={{ padding: '32px 20px 48px', maxWidth: 920 }}>
      <h2 className="h2" style={{ marginBottom: 6 }}>Tutor Training Activity</h2>
      <p className="muted small" style={{ marginBottom: 16 }}>
        Every tutor on your staff has their own training profile, separate from
        student data. Track who&rsquo;s practicing and who&rsquo;s coasting.
      </p>

      {/* Training summary */}
      <div className="card">
        <h3 className="h2" style={{ marginBottom: 14 }}>{tutor.name}&rsquo;s Training</h3>
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
              <span className="tmStudentTh tmStudentThNum">R&amp;W</span>
              <span className="tmStudentTh tmStudentThNum">Math</span>
            </div>
            {practiceTests.map(t => (
              <div key={t.id} className="tmStudentRow">
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reading &amp; Writing</div>
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
    </main>
  );
}
