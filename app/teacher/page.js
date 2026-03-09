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

// ─── Welcome / info panel ────────────────────────────────
function WelcomePanel({ role }) {
  return (
    <div className="tchWelcome">
      <div className="card tchWelcomeCard">
        <h2 className="h1" style={{ marginBottom: 8 }}>
          {role === 'admin' ? 'Admin Dashboard' : 'Teacher Dashboard'}
        </h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          Select a student from the panel on the left to view their progress, or use the Assignments tab to create and track question assignments.
        </p>
        <div className="tchFeatureGrid">
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128202;</div>
            <div>
              <strong>Practice Test Results</strong>
              <p className="muted small">View bar charts of test scores over time. Click any test to see the full question-by-question breakdown.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128200;</div>
            <div>
              <strong>Domain & Topic Performance</strong>
              <p className="muted small">See accuracy and completion percentage across all SAT domains, with drill-down into individual skills.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#128221;</div>
            <div>
              <strong>Assignments</strong>
              <p className="muted small">Create targeted question assignments by topic and difficulty. Track student completion and performance.</p>
            </div>
          </div>
          <div className="tchFeature">
            <div className="tchFeatureIcon">&#127919;</div>
            <div>
              <strong>Key Statistics</strong>
              <p className="muted small">At-a-glance metrics including highest test score, strongest/weakest topics, and recent accuracy.</p>
            </div>
          </div>
        </div>
      </div>
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
  const [scoreBands, setScoreBands] = useState([]);
  const [questionLimit, setQuestionLimit] = useState(20);
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

  // Fetch dynamic counts when difficulty or score band filters change
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
  function toggleDomain(name) { setDomains(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name]); setPreviewQuestions(null); }
  function toggleTopic(name) { setTopics(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]); setPreviewQuestions(null); }
  function toggleDifficulty(d) { setDifficulties(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]); setPreviewQuestions(null); }
  function toggleScoreBand(b) { setScoreBands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]); setPreviewQuestions(null); }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (domains.length) params.set('domains', domains.join(','));
      if (topics.length) params.set('topics', topics.join(','));
      if (difficulties.length < 3) params.set('difficulties', difficulties.join(','));
      if (scoreBands.length > 0) params.set('score_bands', scoreBands.join(','));
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
          filter_criteria: { domains, topics, difficulties, score_bands: scoreBands },
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
            <div className="tchAssignSection">
              <span className="tchModalLabel">Score Band</span>
              <div className="tchAssignChips">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(b => (
                  <button key={b} type="button"
                    className={`tchAssignChip${scoreBands.includes(b) ? ' active' : ''}`}
                    style={{ borderColor: 'var(--accent)', color: scoreBands.includes(b) ? '#fff' : 'var(--accent)', background: scoreBands.includes(b) ? 'var(--accent)' : 'transparent' }}
                    onClick={() => toggleScoreBand(b)}
                  >{b}</button>
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
                    const counts = dynamicCounts || filterData?.counts;
                    const domainCount = counts?.[d.domain_name]?.count;
                    return (
                      <div key={d.domain_name} className="tchAssignDomainBlock">
                        <button type="button" className={`tchAssignChip${isDomainSelected ? ' active' : ''}`} onClick={() => toggleDomain(d.domain_name)}>
                          {d.domain_name}
                          {domainCount != null && <span className="muted small" style={{ marginLeft: 4 }}>({domainCount})</span>}
                        </button>
                        {isDomainSelected && domainTopics.length > 0 && (
                          <div className="tchAssignTopicChips">
                            {domainTopics.map(t => {
                              const topicCount = counts?.[d.domain_name]?.topics?.[t.skill_code || t.skill_name];
                              return (
                                <button key={t.skill_name} type="button" className={`tchAssignChip small${topics.includes(t.skill_name) ? ' active' : ''}`} onClick={() => toggleTopic(t.skill_name)}>
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
function AssignmentsPanel({ students }) {
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
        <h2 className="h1" style={{ margin: 0 }}>Assignments</h2>
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
function StudentDetail({ studentId }) {
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
        <div>
          <h2 className="h1" style={{ margin: 0 }}>{displayName(student)}</h2>
          <p className="muted small" style={{ margin: 0 }}>{student.email}</p>
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
        <Link href={`/teacher/student/${studentId}/stats`} className="dbMoreStatsLink">More Statistics →</Link>
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

// ─── Main teacher page ───────────────────────────────────
export default function TeacherPage() {
  return <Suspense><TeacherPageInner /></Suspense>;
}

function TeacherPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(searchParams.get('selected') || null);
  const [role, setRole] = useState(null);
  const [search, setSearch] = useState('');
  const [sidebarTab, setSidebarTab] = useState('students');

  function loadStudents() {
    fetch('/api/teacher/students')
      .then(r => r.json())
      .then(d => setStudents(d.students || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle().then(({ data: p }) => setRole(p?.role));
      }
    });
    loadStudents();
  }, []);

  const filtered = students.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.email || '').toLowerCase().includes(q) || displayName(s).toLowerCase().includes(q);
  });

  return (
    <div className="tchLayout">
      <aside className="tchSidebar">
        <div className="tchSidebarHeader">
          <div className="tchSidebarTabs">
            <button className={`tchSidebarTabBtn${sidebarTab === 'students' ? ' active' : ''}`} onClick={() => setSidebarTab('students')}>
              Students <span className="tchSidebarCount">{students.length}</span>
            </button>
            <button className={`tchSidebarTabBtn${sidebarTab === 'assignments' ? ' active' : ''}`} onClick={() => { setSidebarTab('assignments'); setSelectedId(null); }}>
              Assignments
            </button>
          </div>
        </div>
        {sidebarTab === 'students' && (
          <>
            <div className="tchSearchWrap">
              <input type="text" className="tchSearchInput" placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="tchStudentList">
              {loading ? <p className="muted small" style={{ padding: '12px 16px' }}>Loading...</p> : filtered.length === 0 ? (
                <p className="muted small" style={{ padding: '12px 16px' }}>{students.length === 0 ? 'No students assigned yet. Ask an admin to add students to your roster.' : 'No matches.'}</p>
              ) : filtered.map(s => (
                <button key={s.id} className={`tchStudentItem${selectedId === s.id ? ' active' : ''}`} onClick={() => { setSelectedId(s.id); setSidebarTab('students'); }}>
                  <div className="tchStudentAvatar">{(s.first_name || s.email || '?')[0].toUpperCase()}</div>
                  <div className="tchStudentInfo">
                    <span className="tchStudentName">{displayName(s)}</span>
                    <span className="tchStudentEmail">{s.email}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {sidebarTab === 'assignments' && (
          <div style={{ padding: '12px 16px' }}>
            <p className="muted small" style={{ margin: 0 }}>Manage assignments in the main panel.</p>
          </div>
        )}
      </aside>
      <main className="tchMain">
        {sidebarTab === 'assignments' ? <AssignmentsPanel students={students} /> : selectedId ? <StudentDetail key={selectedId} studentId={selectedId} /> : <WelcomePanel role={role} />}
      </main>
    </div>
  );
}
