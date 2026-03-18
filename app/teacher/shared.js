'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ─── Constants ────────────────────────────────────────────
export const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);
export const SUBJECT_LABEL = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };
export const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
export const DIFF_COLORS = { 1: '#4caf50', 2: '#f0a830', 3: '#e05252' };
const DIFF_CLASS = { 1: 'easy', 2: 'medium', 3: 'hard' };

// ─── Utility functions ───────────────────────────────────
export function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

export function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

export function displayName(s) {
  if (!s) return 'Student';
  if (typeof s === 'string') {
    const local = s.split('@')[0];
    return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (s.first_name || s.last_name) {
    return [s.first_name, s.last_name].filter(Boolean).join(' ');
  }
  if (!s.email) return 'Student';
  const local = s.email.split('@')[0];
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return formatDate(iso);
}

// ─── Mastery bar ─────────────────────────────────────────
export function MasteryBar({ value, size = 'normal' }) {
  if (value === null || value === undefined) return <span className="muted small">—</span>;
  const color = value >= 70 ? 'var(--success)' : value >= 40 ? 'var(--amber)' : 'var(--danger)';
  const cls = size === 'small' ? 'tchMasteryBarWrap small' : 'tchMasteryBarWrap';
  return (
    <div className={cls}>
      <span className="tchMasteryValue" style={{ color, fontWeight: 600, minWidth: size === 'small' ? 28 : 32 }}>{value}%</span>
      <div className="tchMasteryTrack">
        <div className="tchMasteryFill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Trend indicator ─────────────────────────────────────
export function TrendIndicator({ trend }) {
  if (trend === null || trend === undefined) return <span className="muted">—</span>;
  const isUp = trend > 0;
  const isDown = trend < 0;
  const color = isUp ? 'var(--success)' : isDown ? 'var(--danger)' : 'var(--text-muted)';
  const arrow = isUp ? '\u2191' : isDown ? '\u2193' : '\u2192';
  return (
    <span style={{ color, fontWeight: 600, fontSize: 13 }}>
      {arrow} {isUp ? '+' : ''}{trend}%
    </span>
  );
}

// ─── Bar chart for test scores ───────────────────────────
export function TestScoreBarChart({ testScores, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  if (!testScores?.length) return null;
  const maxScore = 1600;
  const barHeight = 36;
  const sorted = [...testScores].sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at));

  return (
    <div className="tchBarChart">
      {sorted.map((ts) => {
        const rwSection = Object.entries(ts.sections || {}).find(([k]) => ['RW', 'rw'].includes(k));
        const mathSection = Object.entries(ts.sections || {}).find(([k]) => ['M', 'm', 'MATH', 'math', 'Math'].includes(k));
        const rwScore = rwSection?.[1]?.scaled || 0;
        const mathScore = mathSection?.[1]?.scaled || 0;
        const total = ts.composite || 0;
        const rwPct = (rwScore / maxScore) * 100;
        const mathPct = (mathScore / maxScore) * 100;

        return (
          <div key={ts.attempt_id} className="tchBarRowWrap">
            <Link
              href={`/practice-test/attempt/${ts.attempt_id}/results`}
              className="tchBarRow"
              title={`${ts.test_name} — Click to view full results`}
            >
              <div className="tchBarLabel">
                <span className="tchBarTestName">{ts.test_name}</span>
                <span className="tchBarDate">{formatDate(ts.finished_at)}</span>
              </div>
              <div className="tchBarTrack" style={{ height: barHeight }}>
                <div className="tchBarSegment tchBarRW" style={{ width: `${rwPct}%` }} title={`R&W: ${rwScore}`} />
                <div className="tchBarSegment tchBarMath" style={{ width: `${mathPct}%` }} title={`Math: ${mathScore}`} />
              </div>
              <div className="tchBarScore">
                <span className="tchBarTotal">{total}</span>
                <span className="tchBarBreakdown">
                  <span style={{ color: '#6b9bd2' }}>R&W {rwScore}</span>
                  {' · '}
                  <span style={{ color: '#9b8ec4' }}>Math {mathScore}</span>
                </span>
              </div>
            </Link>
            {onDelete && (
              <div className="tchBarActions">
                {confirmId === ts.attempt_id ? (
                  <>
                    <button
                      className="btn"
                      style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff', padding: '4px 10px', fontSize: 12 }}
                      disabled={deleting}
                      onClick={() => { setDeleting(true); onDelete(ts.attempt_id).finally(() => { setDeleting(false); setConfirmId(null); }); }}
                    >
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button className="btn secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setConfirmId(null)} disabled={deleting}>Cancel</button>
                  </>
                ) : (
                  <button
                    className="tchBarDeleteBtn"
                    title="Delete this result"
                    onClick={() => setConfirmId(ts.attempt_id)}
                  >
                    &times;
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div className="tchBarLegend">
        <span className="tchLegendDot" style={{ background: '#6b9bd2' }} /> R&W
        <span className="tchLegendDot" style={{ background: '#9b8ec4', marginLeft: 12 }} /> Math
      </div>
    </div>
  );
}

// ─── Session card with delete ────────────────────────────
function SessionCard({ session, index, questions, correct, total, p, onTileClick, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="tchSessionCard">
      <div className="tchSessionHeader">
        <span className="tchSessionDate">{formatDateTime(session.startedAt)}</span>
        <span className="tchSessionStats">
          {correct}/{total}{p !== null && <span style={{ color: pctColor(p), fontWeight: 600 }}> ({p}%)</span>}
        </span>
        {onDelete && (
          confirming ? (
            <span style={{ display: 'inline-flex', gap: 4, marginLeft: 8 }}>
              <button
                className="btn"
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff', padding: '2px 8px', fontSize: 11 }}
                disabled={deleting}
                onClick={() => { setDeleting(true); onDelete(index).finally(() => { setDeleting(false); setConfirming(false); }); }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button className="btn secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setConfirming(false)} disabled={deleting}>Cancel</button>
            </span>
          ) : (
            <button
              className="tchBarDeleteBtn"
              title="Delete this session"
              onClick={() => setConfirming(true)}
              style={{ marginLeft: 8 }}
            >
              &times;
            </button>
          )
        )}
      </div>
      <div className="dbSessionTiles">
        {questions.map((q, qi) => <TchSessionTile key={qi} q={q} index={qi} onClick={() => onTileClick(qi)} />)}
      </div>
    </div>
  );
}

// ─── Difficulty mini-bars ─────────────────────────────────
export function DiffCells({ byDifficulty, availByDifficulty, type }) {
  return [1, 2, 3].map(d => {
    const bd = byDifficulty?.[d];
    let value = null;
    if (type === 'done') {
      const avail = availByDifficulty?.[d] || 0;
      if (avail > 0 && bd) value = Math.round((bd.attempted / avail) * 100);
    } else {
      if (bd && bd.attempted > 0) value = Math.round((bd.correct / bd.attempted) * 100);
    }
    return (
      <span key={d} className="tchTblCell tchTblDiffCell" style={{ color: DIFF_COLORS[d] }}>
        {value != null ? `${value}%` : '—'}
      </span>
    );
  });
}

export function OverallDoneCell({ attempted, totalAvailable }) {
  const v = totalAvailable ? Math.round((attempted / totalAvailable) * 100) : null;
  return (
    <span className="tchTblCell tchTblOverall">
      {v != null ? `${v}%` : '—'}
    </span>
  );
}

export function OverallAccCell({ correct, attempted }) {
  const p = pct(correct, attempted);
  return (
    <span className="tchTblCell tchTblOverall tchTblAccBar">
      {p !== null ? (
        <>
          <span style={{ color: pctColor(p), fontWeight: 600, minWidth: 32 }}>{p}%</span>
          <span className="dbProgressBar" style={{ flex: 1 }}>
            <span className="dbProgressFill" style={{ width: `${p}%`, background: pctColor(p) }} />
          </span>
        </>
      ) : '—'}
    </span>
  );
}

// ─── Domain/topic performance table ──────────────────────
export function DomainTable({ domainStats, topicStats }) {
  const [open, setOpen] = useState({});
  const toggle = (name) => setOpen(prev => ({ ...prev, [name]: !prev[name] }));

  const topicsByDomain = {};
  for (const t of topicStats || []) {
    if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
    topicsByDomain[t.domain_name].push(t);
  }

  const english = { label: 'Reading & Writing', domains: [] };
  const math = { label: 'Math', domains: [] };
  for (const d of domainStats || []) {
    const section = MATH_CODES.has(d.domain_code) ? math : english;
    section.domains.push({ ...d, topics: topicsByDomain[d.domain_name] || [] });
  }

  const headerRow = (
    <div className="tchTblHeader">
      <span className="tchTblCell tchTblNameCol" />
      <span className="tchTblCell tchTblDiffCell" style={{ color: DIFF_COLORS[1] }}>E</span>
      <span className="tchTblCell tchTblDiffCell" style={{ color: DIFF_COLORS[2] }}>M</span>
      <span className="tchTblCell tchTblDiffCell" style={{ color: DIFF_COLORS[3] }}>H</span>
      <span className="tchTblCell tchTblOverall">Done</span>
      <span className="tchTblCell tchTblDiffCell" style={{ color: DIFF_COLORS[1] }}>E</span>
      <span className="tchTblCell tchTblDiffCell" style={{ color: DIFF_COLORS[2] }}>M</span>
      <span className="tchTblCell tchTblDiffCell" style={{ color: DIFF_COLORS[3] }}>H</span>
      <span className="tchTblCell tchTblOverall">Accuracy</span>
      <span className="tchTblCell tchTblOverall">Mastery</span>
    </div>
  );

  return (
    <div>
      {[english, math].map(section => {
        if (!section.domains.length) return null;
        return (
          <div key={section.label} className="tchDomainSection">
            <div className="tchDomainSectionHeader">
              <span className="h2" style={{ margin: 0 }}>{section.label}</span>
            </div>
            {headerRow}
            <div className="tchDomainList">
              {section.domains.map(domain => {
                const isOpen = open[domain.domain_name];
                const hasTopics = domain.topics.length > 0;
                return (
                  <div key={domain.domain_name} className="tchDomainBlock">
                    <div
                      className="tchTblRow tchTblRowDomain"
                      onClick={() => hasTopics && toggle(domain.domain_name)}
                      style={{ cursor: hasTopics ? 'pointer' : 'default' }}
                    >
                      <div className="tchTblCell tchTblNameCol">
                        <span className={`dbChevron${hasTopics ? '' : ' invisible'}${isOpen ? ' open' : ''}`}>
                          <svg viewBox="0 0 16 16"><polyline points="6 4 10 8 6 12" /></svg>
                        </span>
                        <span className="tchDomainName">{domain.domain_name}</span>
                      </div>
                      <DiffCells byDifficulty={domain.byDifficulty} availByDifficulty={domain.availByDifficulty} type="done" />
                      <OverallDoneCell attempted={domain.attempted} totalAvailable={domain.totalAvailable} />
                      <DiffCells byDifficulty={domain.byDifficulty} availByDifficulty={domain.availByDifficulty} type="acc" />
                      <OverallAccCell correct={domain.correct} attempted={domain.attempted} />
                      <span className="tchTblCell tchTblOverall"><MasteryBar value={domain.mastery} size="small" /></span>
                    </div>
                    {isOpen && hasTopics && (
                      <div className="tchTopicList">
                        {domain.topics.map(topic => (
                          <div key={topic.skill_name} className="tchTblRow tchTblRowTopic">
                            <span className="tchTblCell tchTblNameCol">
                              <span className="tchTopicName">{topic.skill_name}</span>
                            </span>
                            <DiffCells byDifficulty={topic.byDifficulty} availByDifficulty={topic.availByDifficulty} type="done" />
                            <OverallDoneCell attempted={topic.attempted} totalAvailable={topic.totalAvailable} />
                            <DiffCells byDifficulty={topic.byDifficulty} availByDifficulty={topic.availByDifficulty} type="acc" />
                            <OverallAccCell correct={topic.correct} attempted={topic.attempted} />
                            <span className="tchTblCell tchTblOverall"><MasteryBar value={topic.mastery} size="small" /></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Roster mastery table ────────────────────────────────
export function RosterMasteryTable({ domains, topics }) {
  const [open, setOpen] = useState({});
  const toggle = (name) => setOpen(prev => ({ ...prev, [name]: !prev[name] }));

  const topicsByDomain = {};
  for (const t of topics || []) {
    if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
    topicsByDomain[t.domain_name].push(t);
  }

  const english = { label: 'Reading & Writing', domains: [] };
  const math = { label: 'Math', domains: [] };
  for (const d of domains || []) {
    const section = d.isEnglish ? english : math;
    section.domains.push({ ...d, topics: topicsByDomain[d.domain_name] || [] });
  }

  return (
    <div>
      {[english, math].map(section => {
        if (!section.domains.length) return null;
        return (
          <div key={section.label} className="tchDomainSection">
            <div className="tchDomainSectionHeader">
              <span className="h2" style={{ margin: 0 }}>{section.label}</span>
            </div>
            <div className="tchMasteryHeader">
              <span className="tchMasteryNameCol">Domain / Topic</span>
              <span className="tchMasteryQuesCol">Questions</span>
              <span className="tchMasteryLevelCol">Mastery</span>
            </div>
            <div className="tchDomainList">
              {section.domains.map(domain => {
                const isOpen = open[domain.domain_name];
                const hasTopics = domain.topics.length > 0;
                return (
                  <div key={domain.domain_name} className="tchDomainBlock">
                    <div
                      className="tchTblRow tchTblRowDomain"
                      onClick={() => hasTopics && toggle(domain.domain_name)}
                      style={{ cursor: hasTopics ? 'pointer' : 'default' }}
                    >
                      <div className="tchMasteryNameCol" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`dbChevron${hasTopics ? '' : ' invisible'}${isOpen ? ' open' : ''}`}>
                          <svg viewBox="0 0 16 16"><polyline points="6 4 10 8 6 12" /></svg>
                        </span>
                        <span className="tchDomainName">{domain.domain_name}</span>
                      </div>
                      <span className="tchMasteryQuesCol muted small">{domain.attempted} done / {domain.correct} correct</span>
                      <span className="tchMasteryLevelCol"><MasteryBar value={domain.mastery} /></span>
                    </div>
                    {isOpen && hasTopics && (
                      <div className="tchTopicList">
                        {domain.topics.map(topic => (
                          <div key={topic.skill_name} className="tchTblRow tchTblRowTopic">
                            <span className="tchMasteryNameCol"><span className="tchTopicName">{topic.skill_name}</span></span>
                            <span className="tchMasteryQuesCol muted small">{topic.attempted} / {topic.correct}</span>
                            <span className="tchMasteryLevelCol"><MasteryBar value={topic.mastery} size="small" /></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Session tile ────────────────────────────────────────
export function TchSessionTile({ q, index, onClick }) {
  const diffClass = DIFF_CLASS[q.difficulty] || '';
  return (
    <button
      className={`dbSessionTile ${q.is_correct ? 'correct' : 'incorrect'} ${diffClass}`}
      onClick={onClick}
      title={q.skill_name || q.domain_name || ''}
    >
      <span className="dbSessionTileNum">{index + 1}</span>
      <span className="dbSessionTileIcon">{q.is_correct ? '\u2713' : '\u2717'}</span>
    </button>
  );
}

// ─── Edit profile modal ─────────────────────────────────
export function EditProfileModal({ student, studentId, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: student.first_name || '',
    last_name: student.last_name || '',
    high_school: student.high_school || '',
    graduation_year: student.graduation_year || '',
    target_sat_score: student.target_sat_score || '',
    start_date: student.start_date || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/student/${studentId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved(data.student);
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
          <h3 className="h2" style={{ margin: 0 }}>Edit Student Profile</h3>
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
          <div className="tchModalRow">
            <label className="tchModalField">
              <span className="tchModalLabel">Graduation Year</span>
              <input type="number" value={form.graduation_year} onChange={handleChange('graduation_year')} />
            </label>
            <label className="tchModalField">
              <span className="tchModalLabel">Target SAT Score</span>
              <input type="number" value={form.target_sat_score} onChange={handleChange('target_sat_score')} />
            </label>
          </div>
          <label className="tchModalField">
            <span className="tchModalLabel">Start Date</span>
            <input type="date" value={form.start_date} onChange={handleChange('start_date')} />
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

// ─── Add Test Registration modal ──────────────────────────
export function AddRegistrationModal({ studentId, onClose, onSaved }) {
  const [testDate, setTestDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!testDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/student/${studentId}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_date: testDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved(data.registration);
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
          <h3 className="h2" style={{ margin: 0 }}>Add Test Registration</h3>
          <button className="tchModalClose" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="tchModalForm">
          <label className="tchModalField">
            <span className="tchModalLabel">SAT Test Date</span>
            <input type="datetime-local" value={testDate} onChange={(e) => setTestDate(e.target.value)} required />
          </label>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
          <div className="tchModalActions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Official Score modal ─────────────────────────────
export function AddScoreModal({ studentId, onClose, onSaved }) {
  const [form, setForm] = useState({ test_date: '', rw_score: '', math_score: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const composite = (Number(form.rw_score) || 0) + (Number(form.math_score) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/student/${studentId}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved(data.score);
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
          <h3 className="h2" style={{ margin: 0 }}>Add Official SAT Score</h3>
          <button className="tchModalClose" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="tchModalForm">
          <label className="tchModalField">
            <span className="tchModalLabel">Test Date</span>
            <input type="date" value={form.test_date} onChange={handleChange('test_date')} required />
          </label>
          <div className="tchModalRow">
            <label className="tchModalField">
              <span className="tchModalLabel">Reading & Writing</span>
              <input type="number" min="200" max="800" step="10" value={form.rw_score} onChange={handleChange('rw_score')} required placeholder="200-800" />
            </label>
            <label className="tchModalField">
              <span className="tchModalLabel">Math</span>
              <input type="number" min="200" max="800" step="10" value={form.math_score} onChange={handleChange('math_score')} required placeholder="200-800" />
            </label>
          </div>
          {form.rw_score && form.math_score && (
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
              Composite: {composite}
            </div>
          )}
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
          <div className="tchModalActions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Upload Bluebook modal ───────────────────────────────
export function UploadBluebookModal({ studentId, onClose, onUploaded }) {
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [rwScore, setRwScore] = useState('');
  const [mathScore, setMathScore] = useState('');
  const [testDate, setTestDate] = useState('');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/practice-tests')
      .then(r => r.json())
      .then(d => setTests(d.tests || []))
      .catch(() => {});
  }, []);

  const composite = (Number(rwScore) || 0) + (Number(mathScore) || 0);

  async function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsed(null);
    setParseError(null);
    setResult(null);

    try {
      const text = await f.text();
      const { parseBluebookHtml } = await import('../../lib/parseBluebookHtml');
      const data = parseBluebookHtml(text);
      if (!data.questions.length) {
        setParseError('The file was read but no questions could be extracted. This Bluebook HTML format may not be supported yet.');
        return;
      }
      setParsed(data);
    } catch (err) {
      setParseError(err.message || 'Failed to parse the HTML file');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedTestId) return setError('Select a practice test.');
    if (!rwScore || !mathScore) return setError('Enter both RW and Math scores.');
    const rw = parseInt(rwScore, 10);
    const math = parseInt(mathScore, 10);
    if (rw < 200 || rw > 800 || math < 200 || math > 800) {
      return setError('Scores must be between 200 and 800.');
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/student/${studentId}/upload-bluebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practice_test_id: selectedTestId,
          rw_score: rw,
          math_score: math,
          test_date: testDate || null,
          questions: parsed?.questions || null,
          correctCounts: parsed?.correctCounts || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setResult(data);
      if (onUploaded) onUploaded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tchModalOverlay" onClick={onClose}>
      <div className="card tchModal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="tchModalHeader">
          <h3 className="h2" style={{ margin: 0 }}>Upload Bluebook Results</h3>
          <button className="tchModalClose" onClick={onClose}>&times;</button>
        </div>
        {result ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)' }}>{result.composite_score}</div>
              <div className="muted small">Composite Score</div>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <span style={{ color: '#6b9bd2', fontWeight: 600 }}>R&W {result.rw_scaled}</span>
                {' · '}
                <span style={{ color: '#9b8ec4', fontWeight: 600 }}>Math {result.math_scaled}</span>
              </div>
              {result.questions_imported ? (
                <div className="muted small" style={{ marginTop: 8 }}>{result.questions_imported} questions imported</div>
              ) : (
                <div className="muted small" style={{ marginTop: 8 }}>Score recorded (no question details)</div>
              )}
            </div>
            <div className="tchModalActions">
              <button className="btn primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="tchModalForm">
            <label className="tchModalField">
              <span className="tchModalLabel">Practice Test</span>
              <select value={selectedTestId} onChange={(e) => setSelectedTestId(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}>
                <option value="">— Select a test —</option>
                {tests.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <label className="tchModalField">
              <span className="tchModalLabel">Bluebook HTML File (.htm) <span className="muted" style={{ fontWeight: 400 }}>— optional</span></span>
              <input type="file" accept=".htm,.html" onChange={handleFileChange} style={{ fontSize: 13 }} />
              {!file && !parsed && <span className="muted small" style={{ marginTop: 2 }}>Skip to record scores only, without question-level details.</span>}
            </label>

            {parseError && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{parseError}</p>}

            {parsed && (
              <div style={{ background: 'var(--surface-alt, var(--surface))', borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{parsed.testName}</div>
                {parsed.testDate && <div className="muted small">{parsed.testDate}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <span className="muted small">R&W: </span>
                    <span style={{ fontWeight: 600 }}>{parsed.correctCounts.rw.total}/{parsed.questions.filter(q => q.subjectCode === 'RW').length} correct</span>
                    <div className="muted small" style={{ fontSize: 11 }}>M1: {parsed.correctCounts.rw.m1} · M2: {parsed.correctCounts.rw.m2}</div>
                  </div>
                  <div>
                    <span className="muted small">Math: </span>
                    <span style={{ fontWeight: 600 }}>{parsed.correctCounts.math.total}/{parsed.questions.filter(q => q.subjectCode === 'MATH').length} correct</span>
                    <div className="muted small" style={{ fontSize: 11 }}>M1: {parsed.correctCounts.math.m1} · M2: {parsed.correctCounts.math.m2}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="tchModalRow">
              <label className="tchModalField">
                <span className="tchModalLabel">R&W Scaled Score</span>
                <input type="number" min="200" max="800" step="10" value={rwScore} onChange={(e) => setRwScore(e.target.value)} required placeholder="200-800" />
              </label>
              <label className="tchModalField">
                <span className="tchModalLabel">Math Scaled Score</span>
                <input type="number" min="200" max="800" step="10" value={mathScore} onChange={(e) => setMathScore(e.target.value)} required placeholder="200-800" />
              </label>
            </div>

            <label className="tchModalField">
              <span className="tchModalLabel">Test Date</span>
              <input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }} />
            </label>

            {rwScore && mathScore && (
              <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
                Composite: {composite}
              </div>
            )}

            {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}

            <div className="tchModalActions">
              <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saving || !selectedTestId || !rwScore || !mathScore}>
                {saving ? 'Uploading...' : 'Upload Results'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Create assignment modal ──────────────────────────────
export function CreateAssignmentModal({ students, initialStudents, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedStudents, setSelectedStudents] = useState(initialStudents || []);
  const [selectAll, setSelectAll] = useState(false);
  const [expandedDomains, setExpandedDomains] = useState([]);
  const [topics, setTopics] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [scoreBands, setScoreBands] = useState([]);
  const [questionLimit, setQuestionLimit] = useState(20);
  const [randomize, setRandomize] = useState(false);
  const [undoneOnly, setUndoneOnly] = useState(false);
  const [filterData, setFilterData] = useState(null);
  const [filterLoading, setFilterLoading] = useState(true);
  const [dynamicCounts, setDynamicCounts] = useState(null);
  const [previewQuestions, setPreviewQuestions] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/filters')
      .then(r => r.json())
      .then(d => setFilterData(d))
      .catch(() => {})
      .finally(() => setFilterLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (difficulties.length > 0 && difficulties.length < 3) params.set('difficulties', difficulties.join(','));
    if (scoreBands.length > 0) params.set('score_bands', scoreBands.join(','));
    params.set('hide_broken', 'true');
    fetch(`/api/domain-counts?${params}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setDynamicCounts(d); })
      .catch(() => {});
  }, [difficulties, scoreBands]);

  function toggleStudent(id) {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }
  function handleSelectAll() {
    if (selectAll) { setSelectedStudents([]); } else { setSelectedStudents(students.map(s => s.id)); }
    setSelectAll(!selectAll);
  }
  const topicsByDomain = {};
  for (const t of filterData?.topics || []) {
    if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
    topicsByDomain[t.domain_name].push(t);
  }

  function toggleExpandDomain(name) { setExpandedDomains(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name]); }
  function topicKey(t) { return t.skill_code || t.skill_name; }
  function toggleTopic(key) { setTopics(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]); setPreviewQuestions(null); }
  function toggleAllTopics(domainName) {
    const domainTopicKeys = (topicsByDomain[domainName] || []).map(t => topicKey(t));
    const allSelected = domainTopicKeys.every(k => topics.includes(k));
    setTopics(prev => allSelected ? prev.filter(t => !domainTopicKeys.includes(t)) : [...new Set([...prev, ...domainTopicKeys])]);
    setPreviewQuestions(null);
  }
  function toggleDifficulty(d) { setDifficulties(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]); setPreviewQuestions(null); }
  function toggleScoreBand(b) { setScoreBands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]); setPreviewQuestions(null); }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (topics.length) params.set('topics', topics.join(','));
      if (difficulties.length > 0 && difficulties.length < 3) params.set('difficulties', difficulties.join(','));
      if (scoreBands.length > 0) params.set('score_bands', scoreBands.join(','));
      params.set('limit', String(questionLimit || 9999));
      params.set('hide_broken', 'true');
      params.set('balanced', 'true');
      if (undoneOnly && selectedStudents.length > 0) {
        params.set('exclude_done_for', selectedStudents.join(','));
      }
      const res = await fetch(`/api/questions?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setPreviewQuestions(json);
    } catch (e) { setError(e.message); }
    finally { setPreviewLoading(false); }
  }

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!previewQuestions?.items?.length) { setError('Preview questions first'); return; }
    if (!selectedStudents.length) { setError('Select at least one student'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/teacher/question-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          question_ids: randomize
            ? [...previewQuestions.items].sort(() => Math.random() - 0.5).map(q => q.question_id)
            : previewQuestions.items.map(q => q.question_id),
          student_ids: selectedStudents,
          filter_criteria: { topics, difficulties, score_bands: scoreBands },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      onCreated();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="tchModalOverlay" onClick={onClose}>
      <div className="card tchModal tchAssignModal" onClick={(e) => e.stopPropagation()}>
        <div className="tchModalHeader">
          <h3 className="h2" style={{ margin: 0 }}>Create Assignment</h3>
          <button className="tchModalClose" onClick={onClose}>&times;</button>
        </div>
        <div className="tchAssignBody">
          <div className="tchAssignFilters">
            <label className="tchModalField">
              <span className="tchModalLabel">Title *</span>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Algebra Review" />
            </label>
            <label className="tchModalField">
              <span className="tchModalLabel">Description</span>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional instructions" />
            </label>
            <div className="tchModalRow">
              <label className="tchModalField">
                <span className="tchModalLabel">Due Date</span>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </label>
              <label className="tchModalField">
                <span className="tchModalLabel">Max Questions</span>
                <input type="text" inputMode="numeric" value={questionLimit} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setQuestionLimit(v === '' ? '' : Number(v)); }} />
              </label>
            </div>
            <div className="tchAssignSection">
              <span className="tchModalLabel">Difficulty</span>
              <div className="tchAssignChips">
                {[1, 2, 3].map(d => (
                  <button key={d} type="button"
                    className={`tchAssignChip${difficulties.includes(d) ? ' active' : ''}`}
                    style={{ borderColor: DIFF_COLORS[d], color: difficulties.includes(d) ? '#fff' : DIFF_COLORS[d], background: difficulties.includes(d) ? DIFF_COLORS[d] : 'transparent' }}
                    onClick={() => toggleDifficulty(d)}
                  >{DIFF_LABEL[d]}</button>
                ))}
              </div>
            </div>
            <div className="tchAssignSection">
              <span className="tchModalLabel">Score Band</span>
              <div className="tchAssignChips">
                {[1, 2, 3, 4, 5, 6, 7].map(b => (
                  <button key={b} type="button"
                    className={`tchAssignChip${scoreBands.includes(b) ? ' active' : ''}`}
                    style={{ borderColor: 'var(--accent)', color: scoreBands.includes(b) ? '#fff' : 'var(--accent)', background: scoreBands.includes(b) ? 'var(--accent)' : 'transparent' }}
                    onClick={() => toggleScoreBand(b)}
                  >{b}</button>
                ))}
              </div>
            </div>
            <div className="tchAssignSection" style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={randomize} onChange={e => setRandomize(e.target.checked)} />
                Randomize question order
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={undoneOnly} onChange={e => { setUndoneOnly(e.target.checked); setPreviewQuestions(null); }} />
                Only undone questions
              </label>
            </div>
            {filterLoading ? <p className="muted small">Loading filters...</p> : (
              <div className="tchAssignSection">
                <span className="tchModalLabel">Domains & Topics</span>
                <div className="tchAssignDomainList">
                  {(filterData?.domains || []).map(d => {
                    const isExpanded = expandedDomains.includes(d.domain_name);
                    const domainTopicList = topicsByDomain[d.domain_name] || [];
                    const counts = dynamicCounts || filterData?.counts;
                    const domainCount = counts?.[d.domain_name]?.count;
                    const selectedCount = domainTopicList.filter(t => topics.includes(topicKey(t))).length;
                    const allSelected = domainTopicList.length > 0 && selectedCount === domainTopicList.length;
                    return (
                      <div key={d.domain_name} className="tchAssignDomainBlock">
                        <button type="button" className={`tchAssignChip${allSelected ? ' active' : selectedCount > 0 ? ' partial' : ''}`} onClick={() => toggleExpandDomain(d.domain_name)}>
                          {d.domain_name}
                          {domainCount != null && <span className="muted small" style={{ marginLeft: 4 }}>({domainCount})</span>}
                          {selectedCount > 0 && !allSelected && <span className="muted small" style={{ marginLeft: 4 }}>[{selectedCount}/{domainTopicList.length}]</span>}
                          <span style={{ marginLeft: 4, fontSize: 10 }}>{isExpanded ? '▾' : '▸'}</span>
                        </button>
                        {isExpanded && domainTopicList.length > 0 && (
                          <div className="tchAssignTopicChips">
                            <button type="button" className={`tchAssignChip small${allSelected ? ' active' : ''}`} onClick={() => toggleAllTopics(d.domain_name)} style={{ fontStyle: 'italic' }}>
                              {allSelected ? 'Deselect All' : 'Select All'}
                            </button>
                            {domainTopicList.map(t => {
                              const topicCount = counts?.[d.domain_name]?.topics?.[t.skill_code || t.skill_name];
                              return (
                                <button key={t.skill_name} type="button" className={`tchAssignChip small${topics.includes(topicKey(t)) ? ' active' : ''}`} onClick={() => toggleTopic(topicKey(t))}>
                                  {t.skill_name}{topicCount != null ? ` (${topicCount})` : ''}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button className="btn primary" onClick={loadPreview} disabled={previewLoading} style={{ marginTop: 8 }}>
              {previewLoading ? 'Loading...' : 'Preview Questions'}
            </button>
            {previewQuestions && (
              <div className="tchAssignPreview">
                <span className="tchModalLabel">{previewQuestions.items.length} questions found{previewQuestions.totalCount > questionLimit ? ` (of ${previewQuestions.totalCount} available)` : ''}</span>
                <div className="tchAssignPreviewList">
                  {previewQuestions.items.slice(0, 10).map((q, i) => (
                    <div key={q.question_id} className="tchAssignPreviewItem">
                      <span className="muted small">{i + 1}.</span>
                      <span style={{ fontSize: 12 }}>{q.domain_name}</span>
                      <span className="muted small">{q.skill_name}</span>
                      <span className="pill" style={{ fontSize: 10, padding: '1px 6px', background: DIFF_COLORS[q.difficulty] || '#999', color: '#fff' }}>{DIFF_LABEL[q.difficulty] || '?'}</span>
                    </div>
                  ))}
                  {previewQuestions.items.length > 10 && <p className="muted small">...and {previewQuestions.items.length - 10} more</p>}
                </div>
              </div>
            )}
          </div>
          <div className="tchAssignStudents">
            <span className="tchModalLabel">Assign to Students *</span>
            <div style={{ marginBottom: 8 }}>
              <button type="button" className="btn secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleSelectAll}>{selectAll ? 'Deselect All' : 'Select All'}</button>
              <span className="muted small" style={{ marginLeft: 8 }}>{selectedStudents.length} selected</span>
            </div>
            <div className="tchAssignStudentList">
              {students.map(s => (
                <label key={s.id} className="tchAssignStudentRow">
                  <input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  <span style={{ fontSize: 13 }}>{displayName(s)}</span>
                  <span className="muted small">{s.email}</span>
                </label>
              ))}
              {students.length === 0 && <p className="muted small">No students assigned yet. Ask an admin to add students.</p>}
            </div>
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '8px 0 0', padding: '0 20px' }}>{error}</p>}
        <div className="tchModalActions" style={{ padding: '12px 20px' }}>
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleCreate} disabled={saving || !title.trim() || !previewQuestions?.items?.length || !selectedStudents.length}>{saving ? 'Creating...' : 'Create Assignment'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Assignment list panel ────────────────────────────────
export function AssignmentsPanel({ students }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [detailData, setDetailData] = useState({});
  const [detailLoading, setDetailLoading] = useState({});

  function loadAssignments() {
    setLoading(true);
    fetch('/api/teacher/question-assignments')
      .then(r => r.json())
      .then(d => setAssignments(d.assignments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAssignments(); }, []);

  function toggleExpand(id) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detailData[id]) {
      setDetailLoading(prev => ({ ...prev, [id]: true }));
      fetch(`/api/teacher/question-assignments/${id}`)
        .then(r => r.json())
        .then(d => setDetailData(prev => ({ ...prev, [id]: d })))
        .catch(() => {})
        .finally(() => setDetailLoading(prev => ({ ...prev, [id]: false })));
    }
  }

  async function deleteAssignment(id) {
    if (!confirm('Delete this assignment? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/teacher/question-assignments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setAssignments(prev => prev.filter(a => a.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) { alert(e.message); }
  }

  const isOverdue = (due) => due && new Date(due) < new Date();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 className="h2" style={{ margin: 0 }}>Assignments</h3>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ New Assignment</button>
      </div>
      {showCreate && <CreateAssignmentModal students={students} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadAssignments(); }} />}
      {loading ? <p className="muted">Loading assignments...</p> : assignments.length === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <p className="muted">No assignments yet. Click &quot;+ New Assignment&quot; to create one.</p>
          <p className="muted small">Assignments let you assign specific question sets by topic and difficulty to your students, with optional due dates.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {assignments.map(a => {
            const isExpanded = expandedId === a.id;
            const detail = detailData[a.id];
            const dLoading = detailLoading[a.id];
            const overdue = isOverdue(a.due_date);
            return (
              <div key={a.id} className="card tchAssignCard">
                <div className="tchAssignCardHeader" onClick={() => toggleExpand(a.id)} style={{ cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 15 }}>{a.title}</div>
                    <div className="muted small" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                      <span>{a.question_count} questions</span>
                      <span>{a.student_count} student{a.student_count !== 1 ? 's' : ''}</span>
                      {a.due_date && <span style={{ color: overdue ? 'var(--danger)' : undefined }}>Due {formatDate(a.due_date)}{overdue ? ' (overdue)' : ''}</span>}
                      <span>Created {formatDate(a.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {a.avg_completion_pct != null && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 18, color: pctColor(a.avg_completion_pct) }}>{a.avg_completion_pct}%</div>
                        <div className="muted small">avg done</div>
                      </div>
                    )}
                    <span className={`dbChevron${isExpanded ? ' open' : ''}`} style={{ marginLeft: 4 }}>
                      <svg viewBox="0 0 16 16"><polyline points="6 4 10 8 6 12" /></svg>
                    </span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="tchAssignDetail">
                    {a.description && <p className="muted small" style={{ margin: '8px 0' }}>{a.description}</p>}
                    {dLoading ? <p className="muted small">Loading details...</p> : detail ? (
                      <div className="tchAssignStudentProgress">
                        <div className="tchAssignProgressHeader">
                          <span style={{ flex: 1 }}>Student</span>
                          <span style={{ width: 80, textAlign: 'center' }}>Done</span>
                          <span style={{ width: 80, textAlign: 'center' }}>Correct</span>
                          <span style={{ width: 90, textAlign: 'center' }}>Progress</span>
                        </div>
                        {(detail.students || []).map(s => {
                          const donePct = s.total_questions > 0 ? Math.round((s.completed_count / s.total_questions) * 100) : 0;
                          const accPct = s.completed_count > 0 ? Math.round((s.correct_count / s.completed_count) * 100) : null;
                          return (
                            <div key={s.id} className="tchAssignProgressRow">
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{displayName(s)}</div>
                                <div className="muted small">{s.email}</div>
                              </div>
                              <span style={{ width: 80, textAlign: 'center', fontSize: 13 }}>{s.completed_count}/{s.total_questions}</span>
                              <span style={{ width: 80, textAlign: 'center', fontSize: 13, color: accPct != null ? pctColor(accPct) : undefined }}>{accPct != null ? `${accPct}%` : '—'}</span>
                              <div style={{ width: 90, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div className="dbProgressBar" style={{ flex: 1 }}><div className="dbProgressFill" style={{ width: `${donePct}%`, background: pctColor(donePct) }} /></div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(donePct), minWidth: 28 }}>{donePct}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn secondary" style={{ fontSize: 12, color: 'var(--danger)' }} onClick={() => deleteAssignment(a.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Student detail panel ────────────────────────────────
export function StudentDetail({ studentId, onBack }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [officialScores, setOfficialScores] = useState([]);
  const [addRegOpen, setAddRegOpen] = useState(false);
  const [addScoreOpen, setAddScoreOpen] = useState(false);
  const [uploadBluebookOpen, setUploadBluebookOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/teacher/student/${studentId}/dashboard`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    fetch(`/api/teacher/student/${studentId}/registrations`)
      .then(r => r.json())
      .then(d => setRegistrations(d.registrations || []))
      .catch(() => {});
    fetch(`/api/teacher/student/${studentId}/scores`)
      .then(r => r.json())
      .then(d => setOfficialScores(d.scores || []))
      .catch(() => {});
  }, [studentId]);

  const deleteRegistration = async (id) => {
    await fetch(`/api/teacher/student/${studentId}/registrations?id=${id}`, { method: 'DELETE' });
    setRegistrations(prev => prev.filter(r => r.id !== id));
  };

  const deleteScore = async (id) => {
    await fetch(`/api/teacher/student/${studentId}/scores?id=${id}`, { method: 'DELETE' });
    setOfficialScores(prev => prev.filter(s => s.id !== id));
  };

  const deleteTestAttempt = async (attemptId) => {
    const res = await fetch(`/api/practice-tests/attempt/${attemptId}`, { method: 'DELETE' });
    if (res.ok) {
      setData(prev => ({ ...prev, testScores: (prev.testScores || []).filter(ts => ts.attempt_id !== attemptId) }));
    }
  };

  const deleteSession = async (sessionIndex) => {
    const session = data.recentSessions[sessionIndex];
    if (!session?.attemptIds?.length) return;
    const res = await fetch(`/api/teacher/student/${studentId}/delete-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptIds: session.attemptIds }),
    });
    if (res.ok) {
      setData(prev => ({
        ...prev,
        recentSessions: (prev.recentSessions || []).filter((_, i) => i !== sessionIndex),
      }));
    }
  };

  if (loading) return <div className="tchDetailLoading"><p className="muted">Loading student data...</p></div>;
  if (error) return <div className="tchDetailError"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!data) return null;
  const student = data.student;

  return (
    <div className="tchStudentDetail">
      <div className="tchStudentHeader">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn secondary" onClick={onBack} style={{ padding: '4px 10px', fontSize: 13 }}>Back</button>
          <div>
            <h2 className="h1" style={{ margin: 0 }}>{displayName(student)}</h2>
            <p className="muted small" style={{ margin: 0 }}>{student.email}</p>
          </div>
        </div>
        <button className="btn secondary tchEditBtn" onClick={() => setEditOpen(true)}>Edit</button>
      </div>
      {editOpen && <EditProfileModal student={student} studentId={studentId} onClose={() => setEditOpen(false)} onSaved={(updated) => { setData(prev => ({ ...prev, student: { ...prev.student, ...updated } })); setEditOpen(false); }} />}
      {addRegOpen && <AddRegistrationModal studentId={studentId} onClose={() => setAddRegOpen(false)} onSaved={(reg) => { setRegistrations(prev => [...prev, reg].sort((a, b) => new Date(a.test_date) - new Date(b.test_date))); setAddRegOpen(false); }} />}
      {addScoreOpen && <AddScoreModal studentId={studentId} onClose={() => setAddScoreOpen(false)} onSaved={(score) => { setOfficialScores(prev => [score, ...prev]); setAddScoreOpen(false); }} />}
      {uploadBluebookOpen && <UploadBluebookModal studentId={studentId} onClose={() => setUploadBluebookOpen(false)} onUploaded={() => { fetch(`/api/teacher/student/${studentId}/dashboard`).then(r => r.json()).then(d => { if (!d.error) setData(d); }); }} />}
      {assignOpen && <CreateAssignmentModal students={[student]} initialStudents={[studentId]} onClose={() => setAssignOpen(false)} onCreated={() => setAssignOpen(false)} />}
      <div className="tchDetailGrid">
        {/* ── Left column: stats + performance data ── */}
        <div>
          <div className="card tchSection">
            <div className="tchStatsRow">
              <div className="tchStatCol"><div className="tchStatValue" style={{ color: 'var(--accent)' }}>{data.highestTestScore ?? '—'}</div><div className="tchStatLabel">Highest Score</div></div>
              <div className="tchStatCol"><div className="tchStatValue">{data.totalAttempted}</div><div className="tchStatLabel">Questions Done</div></div>
              <div className="tchStatCol"><div className="tchStatValue" style={{ color: pctColor(data.recentAccuracy) }}>{data.recentAccuracy != null ? `${data.recentAccuracy}%` : '—'}</div><div className="tchStatLabel">Recent Accuracy</div></div>
              <div className="tchStatCol"><div className="tchStatValue" style={{ color: pctColor(data.assignmentCompletionPct) }}>{data.assignmentCompletionPct != null ? `${data.assignmentCompletionPct}%` : '—'}</div><div className="tchStatLabel">Assignment Completion</div></div>
              <div className="tchStatCol"><div className="tchStatValue" style={{ color: 'var(--danger)' }}>{data.weakest ? `${data.weakest.weightedPct}%` : '—'}</div><div className="tchStatLabel">{data.weakest ? data.weakest.skill_name : 'Weakest'}</div></div>
            </div>
          </div>
          <div style={{ textAlign: 'center', margin: '4px 0 16px' }}>
            <Link href={`/teacher/student/${studentId}/stats`} className="dbMoreStatsLink">More Statistics</Link>
          </div>
          <div className="card tchSection">
            <h3 className="h2" style={{ marginBottom: 14 }}>Practice Test Results</h3>
            {!data.testScores?.length ? <p className="muted small">No completed practice tests yet.</p> : <TestScoreBarChart testScores={data.testScores} onDelete={deleteTestAttempt} />}
          </div>
          <div className="card tchSection">
            <h3 className="h2" style={{ marginBottom: 14 }}>Domain & Topic Performance</h3>
            {!data.domainStats?.length ? <p className="muted small">No practice data yet.</p> : <DomainTable domainStats={data.domainStats} topicStats={data.topicStats} />}
          </div>
          <div className="card tchSection">
            <h3 className="h2" style={{ marginBottom: 14 }}>Recent Practice Sessions</h3>
            {!data.recentSessions?.length ? <p className="muted small">No recent practice sessions.</p> : (
              <div className="tchSessionList">
                {data.recentSessions.map((session, i) => {
                  const questions = session.questions;
                  const correct = questions.filter(q => q.is_correct).length;
                  const total = questions.length;
                  const p = pct(correct, total);
                  function handleTileClick(qIndex) {
                    const ids = questions.map(q => q.question_id);
                    const sid = `teacher_review_${Date.now()}_${i}`;
                    localStorage.setItem(`teacher_review_session_${sid}`, ids.join(','));
                    localStorage.setItem(`teacher_review_meta_${sid}`, JSON.stringify(questions.map(q => ({ question_id: q.question_id, is_correct: q.is_correct, difficulty: q.difficulty, domain_name: q.domain_name || '', skill_name: q.skill_name || '' }))));
                    router.push(`/teacher/review/${encodeURIComponent(questions[qIndex].question_id)}?studentId=${studentId}&sid=${sid}&t=${ids.length}&i=${qIndex + 1}`);
                  }
                  return (
                    <SessionCard
                      key={i}
                      session={session}
                      index={i}
                      questions={questions}
                      correct={correct}
                      total={total}
                      p={p}
                      onTileClick={handleTileClick}
                      onDelete={deleteSession}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {/* ── Right column: profile info + assignments ── */}
        <div>
          <div className="card tchOverviewCard">
            {(student.high_school || student.graduation_year || student.target_sat_score || student.start_date) && (
              <div className="tchProfileRow">
                {student.high_school && <div className="tchProfileItem"><span className="tchProfileLabel">School</span><span className="tchProfileValue">{student.high_school}</span></div>}
                {student.graduation_year && <div className="tchProfileItem"><span className="tchProfileLabel">Graduation</span><span className="tchProfileValue">{student.graduation_year}</span></div>}
                {student.target_sat_score && <div className="tchProfileItem"><span className="tchProfileLabel">Target Score</span><span className="tchProfileValue">{student.target_sat_score}</span></div>}
                {student.start_date && <div className="tchProfileItem"><span className="tchProfileLabel">Start Date</span><span className="tchProfileValue">{new Date(student.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
              </div>
            )}
            {(() => {
              const now = new Date();
              const upcoming = registrations.filter(r => new Date(r.test_date) > now);
              const past = registrations.filter(r => new Date(r.test_date) <= now);
              return (upcoming.length > 0 || past.length > 0) ? (
                <div className="tchRegSection">
                  {upcoming.length > 0 && (
                    <div className="tchRegList">
                      <span className="tchProfileLabel" style={{ marginBottom: 4 }}>Upcoming SATs</span>
                      {upcoming.map(r => (
                        <div key={r.id} className="tchRegItem">
                          <span>{new Date(r.test_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <button className="tchRegDelete" onClick={() => deleteRegistration(r.id)} title="Remove">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {past.length > 0 && (
                    <div className="tchRegList">
                      <span className="tchProfileLabel" style={{ marginBottom: 4, color: 'var(--muted)' }}>Past SATs</span>
                      {past.map(r => (
                        <div key={r.id} className="tchRegItem past">
                          <span>{new Date(r.test_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <button className="tchRegDelete" onClick={() => deleteRegistration(r.id)} title="Remove">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null;
            })()}
            {officialScores.length > 0 && (
              <div className="tchScoresSection">
                <span className="tchProfileLabel" style={{ marginBottom: 6 }}>Official SAT Scores</span>
                <div className="tchScoresList">
                  {officialScores.map(s => (
                    <div key={s.id} className="tchScoreItem">
                      <span className="tchScoreDate">{new Date(s.test_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className="tchScoreComposite">{s.composite_score}</span>
                      <span className="tchScoreBreakdown">R&W {s.rw_score} · Math {s.math_score}</span>
                      <button className="tchRegDelete" onClick={() => deleteScore(s.id)} title="Remove">&times;</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="tchProfileActions">
              <button className="btn secondary tchProfileActionBtn" onClick={() => setAddRegOpen(true)}>+ Test Registration</button>
              <button className="btn secondary tchProfileActionBtn" onClick={() => setAddScoreOpen(true)}>+ Official Score</button>
              <button className="btn primary tchProfileActionBtn" onClick={() => setUploadBluebookOpen(true)}>Upload Bluebook Results</button>
            </div>
          </div>
          <div className="card tchSection">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 className="h2" style={{ margin: 0 }}>Assignments</h3>
              <button className="btn primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setAssignOpen(true)}>+ New Assignment</button>
            </div>
            {!data.studentAssignments?.length ? <p className="muted small">No assignments yet.</p> : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {data.studentAssignments.map(a => {
                  const donePct = a.question_count > 0 ? Math.round((a.completed_count / a.question_count) * 100) : 0;
                  const isOverdue = a.due_date && new Date(a.due_date) < new Date();
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                        <div className="muted small" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>{a.completed_count}/{a.question_count} questions</span>
                          {a.due_date && <span style={{ color: isOverdue ? 'var(--danger)' : undefined }}>Due {formatDate(a.due_date)}{isOverdue ? ' (overdue)' : ''}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                        <div className="dbProgressBar" style={{ flex: 1, height: 6 }}>
                          <div className="dbProgressFill" style={{ width: `${donePct}%`, background: pctColor(donePct) }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(donePct), minWidth: 36, textAlign: 'right' }}>{donePct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
