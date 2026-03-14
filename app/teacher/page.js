'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/browser';

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);
const SUBJECT_LABEL = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };
const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFF_COLORS = { 1: '#4caf50', 2: '#f0a830', 3: '#e05252' };

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

function displayName(s) {
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

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function relativeTime(iso) {
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

// ─── Bar chart for test scores ───────────────────────────
function TestScoreBarChart({ testScores }) {
  if (!testScores?.length) return null;
  const maxScore = 1600;
  const barHeight = 36;

  return (
    <div className="tchBarChart">
      {testScores.map((ts) => {
        const rwSection = Object.entries(ts.sections || {}).find(([k]) => ['RW', 'rw'].includes(k));
        const mathSection = Object.entries(ts.sections || {}).find(([k]) => ['M', 'm', 'MATH', 'math', 'Math'].includes(k));
        const rwScore = rwSection?.[1]?.scaled || 0;
        const mathScore = mathSection?.[1]?.scaled || 0;
        const total = ts.composite || 0;
        const rwPct = (rwScore / maxScore) * 100;
        const mathPct = (mathScore / maxScore) * 100;

        return (
          <Link
            key={ts.attempt_id}
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
        );
      })}
      <div className="tchBarLegend">
        <span className="tchLegendDot" style={{ background: '#6b9bd2' }} /> R&W
        <span className="tchLegendDot" style={{ background: '#9b8ec4', marginLeft: 12 }} /> Math
      </div>
    </div>
  );
}

// ─── Difficulty mini-bars ─────────────────────────────────
function DiffCells({ byDifficulty, availByDifficulty, type }) {
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

function OverallDoneCell({ attempted, totalAvailable }) {
  const v = totalAvailable ? Math.round((attempted / totalAvailable) * 100) : null;
  return (
    <span className="tchTblCell tchTblOverall">
      {v != null ? `${v}%` : '—'}
    </span>
  );
}

function OverallAccCell({ correct, attempted }) {
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
function DomainTable({ domainStats, topicStats }) {
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

const DIFF_CLASS = { 1: 'easy', 2: 'medium', 3: 'hard' };

// ─── Session tile (clickable for teacher review) ────────
function TchSessionTile({ q, index, onClick }) {
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
function EditProfileModal({ student, studentId, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: student.first_name || '',
    last_name: student.last_name || '',
    high_school: student.high_school || '',
    graduation_year: student.graduation_year || '',
    target_sat_score: student.target_sat_score || '',
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

// ─── Create assignment modal ──────────────────────────────
function CreateAssignmentModal({ students, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [domains, setDomains] = useState([]);
  const [topics, setTopics] = useState([]);
  const [difficulties, setDifficulties] = useState([1, 2, 3]);
  const [questionLimit, setQuestionLimit] = useState(20);
  const [filterData, setFilterData] = useState(null);
  const [filterLoading, setFilterLoading] = useState(true);
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

  function toggleStudent(id) {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }
  function handleSelectAll() {
    if (selectAll) { setSelectedStudents([]); } else { setSelectedStudents(students.map(s => s.id)); }
    setSelectAll(!selectAll);
  }
  function toggleDomain(name) { setDomains(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name]); setPreviewQuestions(null); }
  function toggleTopic(name) { setTopics(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]); setPreviewQuestions(null); }
  function toggleDifficulty(d) { setDifficulties(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]); setPreviewQuestions(null); }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (domains.length) params.set('domains', domains.join(','));
      if (topics.length) params.set('topics', topics.join(','));
      if (difficulties.length < 3) params.set('difficulties', difficulties.join(','));
      params.set('limit', String(questionLimit));
      params.set('hide_broken', 'true');
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
          question_ids: previewQuestions.items.map(q => q.question_id),
          student_ids: selectedStudents,
          filter_criteria: { domains, topics, difficulties },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      onCreated();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const topicsByDomain = {};
  for (const t of filterData?.topics || []) {
    if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
    topicsByDomain[t.domain_name].push(t);
  }

  return (
    <div className="tchModalOverlay" onClick={onClose}>
      <div className="card tchModal tchAssignModal" onClick={(e) => e.stopPropagation()}>
        <div className="tchModalHeader">
          <h3 className="h2" style={{ margin: 0 }}>Create Assignment</h3>
          <button className="tchModalClose" onClick={onClose}>&times;</button>
        </div>
        <div className="tchAssignBody">
          {/* Left: filters */}
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
                <input type="number" min={1} max={100} value={questionLimit} onChange={e => setQuestionLimit(Number(e.target.value) || 20)} />
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
            {filterLoading ? <p className="muted small">Loading filters...</p> : (
              <div className="tchAssignSection">
                <span className="tchModalLabel">Domains & Topics</span>
                <div className="tchAssignDomainList">
                  {(filterData?.domains || []).map(d => {
                    const isDomainSelected = domains.includes(d.domain_name);
                    const domainTopics = topicsByDomain[d.domain_name] || [];
                    return (
                      <div key={d.domain_name} className="tchAssignDomainBlock">
                        <button type="button" className={`tchAssignChip${isDomainSelected ? ' active' : ''}`} onClick={() => toggleDomain(d.domain_name)}>
                          {d.domain_name}
                          {filterData?.counts?.[d.domain_name] && <span className="muted small" style={{ marginLeft: 4 }}>({filterData.counts[d.domain_name].count})</span>}
                        </button>
                        {isDomainSelected && domainTopics.length > 0 && (
                          <div className="tchAssignTopicChips">
                            {domainTopics.map(t => (
                              <button key={t.skill_name} type="button" className={`tchAssignChip small${topics.includes(t.skill_name) ? ' active' : ''}`} onClick={() => toggleTopic(t.skill_name)}>{t.skill_name}</button>
                            ))}
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
          {/* Right: student selection */}
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
function AssignmentsPanel({ students, onBack }) {
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
    <div className="tchStudentDetail">
      <div className="tchStudentHeader">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn secondary" onClick={onBack} style={{ padding: '4px 10px', fontSize: 13 }}>Back</button>
          <h2 className="h1" style={{ margin: 0 }}>Assignments</h2>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ New Assignment</button>
      </div>
      {showCreate && <CreateAssignmentModal students={students} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadAssignments(); }} />}
      {loading ? <p className="muted">Loading assignments...</p> : assignments.length === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <p className="muted">No assignments yet. Click "+ New Assignment" to create one.</p>
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
function StudentDetail({ studentId, onBack }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/teacher/student/${studentId}/dashboard`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [studentId]);

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
      <div className="card tchOverviewCard">
        {(student.high_school || student.graduation_year || student.target_sat_score) && (
          <div className="tchProfileRow">
            {student.high_school && <div className="tchProfileItem"><span className="tchProfileLabel">School</span><span className="tchProfileValue">{student.high_school}</span></div>}
            {student.graduation_year && <div className="tchProfileItem"><span className="tchProfileLabel">Graduation</span><span className="tchProfileValue">{student.graduation_year}</span></div>}
            {student.target_sat_score && <div className="tchProfileItem"><span className="tchProfileLabel">Target Score</span><span className="tchProfileValue">{student.target_sat_score}</span></div>}
          </div>
        )}
        <div className="tchStatsRow">
          <div className="tchStatCol"><div className="tchStatValue" style={{ color: 'var(--accent)' }}>{data.highestTestScore ?? '—'}</div><div className="tchStatLabel">Highest Score</div></div>
          <div className="tchStatCol"><div className="tchStatValue">{data.totalAttempted}</div><div className="tchStatLabel">Questions Done</div></div>
          <div className="tchStatCol"><div className="tchStatValue" style={{ color: pctColor(data.recentAccuracy) }}>{data.recentAccuracy != null ? `${data.recentAccuracy}%` : '—'}</div><div className="tchStatLabel">Recent Accuracy</div></div>
          <div className="tchStatCol"><div className="tchStatValue" style={{ color: 'var(--danger)' }}>{data.weakest ? `${data.weakest.weightedPct}%` : '—'}</div><div className="tchStatLabel">{data.weakest ? data.weakest.skill_name : 'Weakest'}</div></div>
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '4px 0 16px' }}>
        <Link href={`/teacher/student/${studentId}/stats`} className="dbMoreStatsLink">More Statistics</Link>
      </div>
      <div className="card tchSection">
        <h3 className="h2" style={{ marginBottom: 14 }}>Practice Test Results</h3>
        {!data.testScores?.length ? <p className="muted small">No completed practice tests yet.</p> : <TestScoreBarChart testScores={data.testScores} />}
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
                <div key={i} className="tchSessionCard">
                  <div className="tchSessionHeader">
                    <span className="tchSessionDate">{formatDateTime(session.startedAt)}</span>
                    <span className="tchSessionStats">{correct}/{total}{p !== null && <span style={{ color: pctColor(p), fontWeight: 600 }}> ({p}%)</span>}</span>
                  </div>
                  <div className="dbSessionTiles">
                    {questions.map((q, qi) => <TchSessionTile key={qi} q={q} index={qi} onClick={() => handleTileClick(qi)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trend arrow component ──────────────────────────────
function TrendIndicator({ trend }) {
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

// ─── Dashboard overview (roster + alerts) ─────────────────
function DashboardOverview({ onSelectStudent, onShowAssignments }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('last_activity');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetch('/api/teacher/roster-overview')
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}><p className="muted">Loading dashboard...</p></div>;
  if (error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;

  const students = data?.students || [];
  const alerts = data?.alerts || {};

  // Sort
  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  const sorted = [...students].sort((a, b) => {
    let av = a[sortBy], bv = b[sortBy];
    // Handle nulls: push to bottom
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
  });

  const sortIcon = (col) => {
    if (sortBy !== col) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  // Summary stats
  const totalStudents = students.length;
  const activeThisWeek = students.filter(s => s.weekly_attempts > 0).length;
  const avgAccuracy = (() => {
    const withAcc = students.filter(s => s.recent_accuracy != null);
    if (!withAcc.length) return null;
    return Math.round(withAcc.reduce((sum, s) => sum + s.recent_accuracy, 0) / withAcc.length);
  })();

  // Build lookup for alerts by student id
  const inactiveSet = new Set((alerts.inactive || []).map(a => a.id));
  const decliningSet = new Set((alerts.declining || []).map(a => a.id));
  const improvingSet = new Set((alerts.improving || []).map(a => a.id));

  return (
    <div className="tchDashboard">
      {/* Header */}
      <div className="tchDashHeader">
        <h1 className="h1" style={{ margin: 0 }}>Tutor Dashboard</h1>
        <button className="btn secondary" onClick={onShowAssignments}>Assignments</button>
      </div>

      {/* Summary stats strip */}
      <div className="tchSummaryStrip">
        <div className="tchSummaryItem">
          <span className="tchSummaryValue">{totalStudents}</span>
          <span className="tchSummaryLabel">Students</span>
        </div>
        <div className="tchSummaryItem">
          <span className="tchSummaryValue">{activeThisWeek}</span>
          <span className="tchSummaryLabel">Active this week</span>
        </div>
        <div className="tchSummaryItem">
          <span className="tchSummaryValue" style={{ color: pctColor(avgAccuracy) }}>{avgAccuracy != null ? `${avgAccuracy}%` : '—'}</span>
          <span className="tchSummaryLabel">Avg. accuracy</span>
        </div>
        <div className="tchSummaryItem">
          <span className="tchSummaryValue" style={{ color: alerts.declining?.length ? 'var(--danger)' : 'var(--success)' }}>{alerts.declining?.length || 0}</span>
          <span className="tchSummaryLabel">Needs attention</span>
        </div>
      </div>

      <div className="tchDashBody">
        {/* Left: student roster table */}
        <div className="tchRosterPanel">
          <div className="card tchRosterCard">
            <div className="tchRosterHeader">
              <h2 className="h2" style={{ margin: 0 }}>Student Roster</h2>
              <span className="muted small">{totalStudents} student{totalStudents !== 1 ? 's' : ''}</span>
            </div>

            {students.length === 0 ? (
              <div style={{ padding: 24 }}>
                <p className="muted">No students on your roster yet.</p>
                <p className="muted small">Ask an admin to assign students to your account.</p>
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
                        <button className="btn primary tchRosterBtn" onClick={() => onSelectStudent(s.id)}>View</button>
                        <Link href={`/teacher/student/${s.id}/stats`} className="btn secondary tchRosterBtn">Stats</Link>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: alerts panel */}
        <div className="tchAlertsPanel">
          {/* Inactive students */}
          {alerts.inactive?.length > 0 && (
            <div className="card tchAlertCard">
              <h3 className="tchAlertTitle tchAlertTitleWarn">Inactive Students</h3>
              <div className="tchAlertList">
                {alerts.inactive.map(a => {
                  const s = students.find(x => x.id === a.id);
                  if (!s) return null;
                  return (
                    <div key={a.id} className="tchAlertItem">
                      <div className="tchAlertItemInfo">
                        <span className="tchAlertItemName">{displayName(s)}</span>
                        <span className="tchAlertItemMeta">
                          {a.days_inactive != null ? `${a.days_inactive} days inactive` : 'No activity recorded'}
                        </span>
                      </div>
                      <button className="btn secondary tchAlertBtn" onClick={() => onSelectStudent(a.id)}>View</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Declining accuracy */}
          {alerts.declining?.length > 0 && (
            <div className="card tchAlertCard">
              <h3 className="tchAlertTitle tchAlertTitleDanger">Declining Accuracy</h3>
              <div className="tchAlertList">
                {alerts.declining.map(a => {
                  const s = students.find(x => x.id === a.id);
                  if (!s) return null;
                  return (
                    <div key={a.id} className="tchAlertItem">
                      <div className="tchAlertItemInfo">
                        <span className="tchAlertItemName">{displayName(s)}</span>
                        <span className="tchAlertItemMeta" style={{ color: 'var(--danger)' }}>
                          {a.trend}% from previous period
                        </span>
                      </div>
                      <button className="btn secondary tchAlertBtn" onClick={() => onSelectStudent(a.id)}>View</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Improving / momentum */}
          {alerts.improving?.length > 0 && (
            <div className="card tchAlertCard">
              <h3 className="tchAlertTitle tchAlertTitleSuccess">Gaining Momentum</h3>
              <div className="tchAlertList">
                {alerts.improving.map(a => {
                  const s = students.find(x => x.id === a.id);
                  if (!s) return null;
                  return (
                    <div key={a.id} className="tchAlertItem">
                      <div className="tchAlertItemInfo">
                        <span className="tchAlertItemName">{displayName(s)}</span>
                        <span className="tchAlertItemMeta" style={{ color: 'var(--success)' }}>
                          +{a.trend}% from previous period
                        </span>
                      </div>
                      <button className="btn secondary tchAlertBtn" onClick={() => onSelectStudent(a.id)}>View</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No alerts at all */}
          {!alerts.inactive?.length && !alerts.declining?.length && !alerts.improving?.length && (
            <div className="card tchAlertCard">
              <h3 className="tchAlertTitle">All Clear</h3>
              <p className="muted small" style={{ margin: 0 }}>No alerts right now. All students are active and on track.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main teacher page ───────────────────────────────────
export default function TeacherPage() {
  return <Suspense><TeacherPageInner /></Suspense>;
}

function TeacherPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [view, setView] = useState(searchParams.get('selected') ? 'student' : 'dashboard');
  const [selectedId, setSelectedId] = useState(searchParams.get('selected') || null);
  const [students, setStudents] = useState([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);

  // Load basic student list for assignment modal
  useEffect(() => {
    fetch('/api/teacher/students')
      .then(r => r.json())
      .then(d => { setStudents(d.students || []); setStudentsLoaded(true); })
      .catch(() => setStudentsLoaded(true));
  }, []);

  function selectStudent(id) {
    setSelectedId(id);
    setView('student');
  }

  function goBack() {
    setView('dashboard');
    setSelectedId(null);
  }

  return (
    <div className="container tchPage">
      {view === 'dashboard' && (
        <DashboardOverview
          onSelectStudent={selectStudent}
          onShowAssignments={() => setView('assignments')}
        />
      )}
      {view === 'student' && selectedId && (
        <StudentDetail
          key={selectedId}
          studentId={selectedId}
          onBack={goBack}
        />
      )}
      {view === 'assignments' && (
        <AssignmentsPanel
          students={students}
          onBack={goBack}
        />
      )}
    </div>
  );
}
