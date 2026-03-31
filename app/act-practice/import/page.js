'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import HtmlBlock from '../../../components/HtmlBlock';

const SECTION_LABELS = { english: 'English', math: 'Math', reading: 'Reading', science: 'Science' };
const DIFF_LABELS = { 1: '1 - Easy', 2: '2 - Medium', 3: '3 - Hard', 4: '4 - Hard+', 5: '5 - Hardest' };

export default function ActImportPage() {
  const [userRole, setUserRole] = useState(null);
  const [questionsPdf, setQuestionsPdf] = useState(null);
  const [answersPdf, setAnswersPdf] = useState(null);
  const [sourceTest, setSourceTest] = useState('');
  const [importSection, setImportSection] = useState('math'); // math | english
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [questions, setQuestions] = useState(null); // parsed question array
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [filterData, setFilterData] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null); // which question card is expanded for editing

  // Auth check
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.role) setUserRole(d.role); })
      .catch(() => {});
  }, []);

  // Load filter data for taxonomy dropdowns
  useEffect(() => {
    if (!questions) return;
    fetch('/api/act/filters')
      .then(r => r.json())
      .then(d => setFilterData(d))
      .catch(() => {});
  }, [questions]);

  const isPrivileged = userRole === 'admin' || userRole === 'manager';

  // Submit PDFs for parsing
  async function handleParse() {
    if (!questionsPdf || !answersPdf) return;
    setParsing(true);
    setParseError(null);
    setQuestions(null);
    setSaveResult(null);

    try {
      const form = new FormData();
      form.append('questions_pdf', questionsPdf);
      form.append('answers_pdf', answersPdf);
      form.append('source_test', sourceTest);
      form.append('section', importSection);

      const res = await fetch('/api/act/questions/parse-pdf', {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to parse PDFs');
      setQuestions(json.questions || []);
      if (json.questions?.length > 0) setExpandedIdx(0);
    } catch (e) {
      setParseError(e.message);
    } finally {
      setParsing(false);
    }
  }

  // Update a question field
  function updateQuestion(idx, field, value) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  }

  // Update an option within a question
  function updateOption(qIdx, optIdx, field, value) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const newOpts = q.options.map((o, j) => {
        if (j !== optIdx) {
          // If setting is_correct, clear other options' is_correct
          if (field === 'is_correct' && value === true) return { ...o, is_correct: false };
          return o;
        }
        return { ...o, [field]: value };
      });
      return { ...q, options: newOpts };
    }));
  }

  // Remove a question
  function removeQuestion(idx) {
    setQuestions(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (expandedIdx === idx) setExpandedIdx(next.length > 0 ? Math.min(idx, next.length - 1) : null);
      else if (expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
      return next;
    });
  }

  // Save all questions to database
  async function handleSave() {
    if (!questions || questions.length === 0) return;
    setSaving(true);
    setSaveResult(null);

    try {
      const res = await fetch('/api/act/questions/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save questions');
      setSaveResult({ ok: true, inserted: json.inserted });
    } catch (e) {
      setSaveResult({ ok: false, error: e.message });
    } finally {
      setSaving(false);
    }
  }

  if (userRole === null) {
    return <main className="container"><div className="muted" style={{ marginTop: 40 }}>Loading...</div></main>;
  }

  if (!isPrivileged) {
    return (
      <main className="container" style={{ marginTop: 40 }}>
        <div className="card" style={{ padding: 24 }}>
          <p>You do not have permission to import questions.</p>
          <Link href="/act-practice" className="btn secondary" style={{ marginTop: 12 }}>Back to ACT Practice</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container containerWide" style={{ paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link href="/act-practice" className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }}>Back</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>Import ACT Questions from PDF</h1>
      </div>

      {/* Upload section */}
      {!questions && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'grid', gap: 16, maxWidth: 500 }}>
            <label className="correctLabel">
              <span className="correctLabelText">Source Test Identifier</span>
              <input
                className="input"
                type="text"
                value={sourceTest}
                onChange={e => setSourceTest(e.target.value)}
                placeholder="e.g. ACT-2024-June"
              />
            </label>

            <label className="correctLabel">
              <span className="correctLabelText">Section</span>
              <select
                className="input"
                value={importSection}
                onChange={e => setImportSection(e.target.value)}
                style={{ maxWidth: 200 }}
              >
                <option value="math">Math</option>
                <option value="english">English</option>
              </select>
              <span className="muted small" style={{ marginTop: 4 }}>
                {importSection === 'english'
                  ? 'English: extracts passages with underlined segments + questions'
                  : 'Math: extracts standalone questions with images'}
              </span>
            </label>

            <label className="correctLabel">
              <span className="correctLabelText">Questions PDF</span>
              <input
                className="input"
                type="file"
                accept=".pdf"
                onChange={e => setQuestionsPdf(e.target.files?.[0] || null)}
              />
              {questionsPdf && <span className="muted small">{questionsPdf.name}</span>}
            </label>

            <label className="correctLabel">
              <span className="correctLabelText">Answer Key PDF</span>
              <input
                className="input"
                type="file"
                accept=".pdf"
                onChange={e => setAnswersPdf(e.target.files?.[0] || null)}
              />
              {answersPdf && <span className="muted small">{answersPdf.name}</span>}
            </label>

            <button
              className="btn primary"
              disabled={!questionsPdf || !answersPdf || parsing}
              onClick={handleParse}
              style={{ justifySelf: 'start' }}
            >
              {parsing ? 'Processing... (this may take a couple minutes)' : 'Upload & Parse'}
            </button>

            {parseError && (
              <div style={{ color: 'var(--danger, #dc2626)', fontSize: 14 }}>{parseError}</div>
            )}
          </div>
        </div>
      )}

      {/* Review / Edit section */}
      {questions && (
        <>
          <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{questions.length}</strong> questions parsed
              {sourceTest && <span className="muted"> from {sourceTest}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn secondary"
                onClick={() => { setQuestions(null); setSaveResult(null); setExpandedIdx(null); }}
              >
                Start Over
              </button>
              <button
                className="btn primary"
                disabled={saving || questions.length === 0 || saveResult?.ok}
                onClick={handleSave}
                style={{ background: saveResult?.ok ? 'var(--color-success, #22c55e)' : undefined }}
              >
                {saving ? 'Saving...' : saveResult?.ok ? `Saved ${saveResult.inserted} questions` : 'Save All to Database'}
              </button>
            </div>
          </div>

          {saveResult && !saveResult.ok && (
            <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--danger, #dc2626)', border: '1px solid var(--danger, #dc2626)' }}>
              {saveResult.error}
            </div>
          )}

          {/* Question list */}
          <div style={{ display: 'grid', gap: 8 }}>
            {questions.map((q, qIdx) => {
              const isExpanded = expandedIdx === qIdx;
              const correctOpt = q.options?.find(o => o.is_correct);

              return (
                <div key={qIdx} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Collapsed header */}
                  <div
                    style={{
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      background: isExpanded ? 'var(--bg)' : undefined,
                    }}
                    onClick={() => setExpandedIdx(isExpanded ? null : qIdx)}
                  >
                    <span style={{ fontWeight: 700, minWidth: 32 }}>#{q.source_ordinal || qIdx + 1}</span>
                    <span className="pill" style={{ fontSize: 11 }}>
                      {SECTION_LABELS[q.section] || q.section}
                    </span>
                    {q.difficulty != null && (
                      <span className="pill" style={{ fontSize: 11 }}>D{q.difficulty}</span>
                    )}
                    {q.category && (
                      <span className="muted small">{q.category}{q.subcategory ? ` > ${q.subcategory}` : ''}</span>
                    )}
                    <span className="muted small" style={{ marginLeft: 'auto' }}>
                      {correctOpt ? `Correct: ${correctOpt.label}` : 'No correct answer'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                  </div>

                  {/* Expanded edit form */}
                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border, #e5e7eb)' }}>
                      {/* Preview */}
                      <div style={{ margin: '12px 0', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
                        <div className="muted small" style={{ marginBottom: 4 }}>Preview:</div>
                        {q.stimulus_html && (
                          <div style={{ marginBottom: 8 }}>
                            <HtmlBlock className="prose" html={q.stimulus_html} imgMaxWidth={320} />
                          </div>
                        )}
                        <HtmlBlock className="prose" html={q.stem_html} imgMaxWidth={320} />
                        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                          {(q.options || []).map((o, oIdx) => (
                            <div key={oIdx} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                              <strong style={{ color: o.is_correct ? 'var(--green, #22c55e)' : undefined }}>
                                {o.label}{o.is_correct ? '*' : ''}
                              </strong>
                              <HtmlBlock className="prose" html={o.content_html} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Edit fields */}
                      <div className="correctFields">
                        <label className="correctLabel">
                          <span className="correctLabelText">Stimulus</span>
                          <textarea
                            className="input correctTextarea"
                            rows={3}
                            value={q.stimulus_html || ''}
                            onChange={e => updateQuestion(qIdx, 'stimulus_html', e.target.value)}
                            placeholder="Stimulus HTML (passage, context)..."
                          />
                        </label>

                        <label className="correctLabel">
                          <span className="correctLabelText">Stem</span>
                          <textarea
                            className="input correctTextarea"
                            rows={4}
                            value={q.stem_html || ''}
                            onChange={e => updateQuestion(qIdx, 'stem_html', e.target.value)}
                            placeholder="Question stem HTML..."
                          />
                        </label>

                        {(q.options || []).map((o, oIdx) => (
                          <div key={oIdx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <label className="correctLabel" style={{ flex: 1 }}>
                              <span className="correctLabelText">
                                Option {o.label}
                                {o.is_correct && <span style={{ color: 'var(--green, #22c55e)', marginLeft: 4 }}>(correct)</span>}
                              </span>
                              <textarea
                                className="input correctTextarea"
                                rows={2}
                                value={o.content_html || ''}
                                onChange={e => updateOption(qIdx, oIdx, 'content_html', e.target.value)}
                              />
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 24, whiteSpace: 'nowrap' }}>
                              <input
                                type="radio"
                                name={`correct-${qIdx}`}
                                checked={o.is_correct}
                                onChange={() => updateOption(qIdx, oIdx, 'is_correct', true)}
                              />
                              <span className="small">Correct</span>
                            </label>
                          </div>
                        ))}

                        <label className="correctLabel">
                          <span className="correctLabelText">Rationale / Explanation</span>
                          <textarea
                            className="input correctTextarea"
                            rows={3}
                            value={q.rationale_html || ''}
                            onChange={e => updateQuestion(qIdx, 'rationale_html', e.target.value)}
                            placeholder="Explanation HTML..."
                          />
                        </label>

                        {q.highlight_ref != null && (
                          <label className="correctLabel">
                            <span className="correctLabelText">Highlight Ref (underline # in passage)</span>
                            <input
                              className="input"
                              type="number"
                              value={q.highlight_ref ?? ''}
                              onChange={e => updateQuestion(qIdx, 'highlight_ref', e.target.value ? Number(e.target.value) : null)}
                              style={{ width: 100 }}
                            />
                          </label>
                        )}
                      </div>

                      <hr />

                      {/* Taxonomy fields */}
                      <div className="correctFields">
                        <div className="h3" style={{ margin: '0 0 8px' }}>Taxonomy</div>
                        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                          <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                            <span className="correctLabelText">Section</span>
                            <select
                              className="input"
                              value={q.section || ''}
                              onChange={e => updateQuestion(qIdx, 'section', e.target.value)}
                            >
                              <option value="">--</option>
                              <option value="english">English</option>
                              <option value="math">Math</option>
                              <option value="reading">Reading</option>
                              <option value="science">Science</option>
                            </select>
                          </label>
                          <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                            <span className="correctLabelText">Difficulty</span>
                            <select
                              className="input"
                              value={q.difficulty ?? ''}
                              onChange={e => updateQuestion(qIdx, 'difficulty', e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">--</option>
                              {Object.entries(DIFF_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                              ))}
                            </select>
                          </label>
                          <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                            <span className="correctLabelText">Modeling</span>
                            <select
                              className="input"
                              value={q.is_modeling ? 'true' : 'false'}
                              onChange={e => updateQuestion(qIdx, 'is_modeling', e.target.value === 'true')}
                            >
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          </label>
                          <label className="correctLabel" style={{ flex: '1 1 100px' }}>
                            <span className="correctLabelText">Ordinal</span>
                            <input
                              className="input"
                              type="number"
                              value={q.source_ordinal ?? ''}
                              onChange={e => updateQuestion(qIdx, 'source_ordinal', e.target.value ? Number(e.target.value) : null)}
                              style={{ width: 80 }}
                            />
                          </label>
                        </div>

                        {/* Category / Subcategory */}
                        {filterData?.categories ? (() => {
                          const sec = q.section;
                          const cats = filterData.categories[sec] || [];
                          const selectedCat = cats.find(c => (c.category_code || c.category) === q.category_code);
                          const subs = selectedCat?.subcategories || [];
                          return (
                            <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                              <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                                <span className="correctLabelText">Category</span>
                                <select
                                  className="input"
                                  value={q.category_code || ''}
                                  onChange={e => {
                                    const cat = cats.find(c => (c.category_code || c.category) === e.target.value);
                                    updateQuestion(qIdx, 'category_code', e.target.value);
                                    updateQuestion(qIdx, 'category', cat?.category || '');
                                    updateQuestion(qIdx, 'subcategory_code', '');
                                    updateQuestion(qIdx, 'subcategory', '');
                                  }}
                                >
                                  <option value="">--</option>
                                  {cats.map(c => (
                                    <option key={c.category_code || c.category} value={c.category_code || c.category}>
                                      {c.category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                                <span className="correctLabelText">Subcategory</span>
                                <select
                                  className="input"
                                  value={q.subcategory_code || ''}
                                  onChange={e => {
                                    const sub = subs.find(s => (s.subcategory_code || s.subcategory) === e.target.value);
                                    updateQuestion(qIdx, 'subcategory_code', e.target.value);
                                    updateQuestion(qIdx, 'subcategory', sub?.subcategory || '');
                                  }}
                                >
                                  <option value="">--</option>
                                  {subs.map(s => (
                                    <option key={s.subcategory_code || s.subcategory} value={s.subcategory_code || s.subcategory}>
                                      {s.subcategory}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          );
                        })() : null}

                        {/* Allow typing in category/subcategory if not in dropdown list */}
                        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                          <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                            <span className="correctLabelText">Category Code (text)</span>
                            <input
                              className="input"
                              type="text"
                              value={q.category_code || ''}
                              onChange={e => updateQuestion(qIdx, 'category_code', e.target.value)}
                              placeholder="e.g. ALG"
                            />
                          </label>
                          <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                            <span className="correctLabelText">Category Name</span>
                            <input
                              className="input"
                              type="text"
                              value={q.category || ''}
                              onChange={e => updateQuestion(qIdx, 'category', e.target.value)}
                              placeholder="e.g. Algebra"
                            />
                          </label>
                          <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                            <span className="correctLabelText">Subcategory Code</span>
                            <input
                              className="input"
                              type="text"
                              value={q.subcategory_code || ''}
                              onChange={e => updateQuestion(qIdx, 'subcategory_code', e.target.value)}
                              placeholder="e.g. LINEAR"
                            />
                          </label>
                          <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                            <span className="correctLabelText">Subcategory Name</span>
                            <input
                              className="input"
                              type="text"
                              value={q.subcategory || ''}
                              onChange={e => updateQuestion(qIdx, 'subcategory', e.target.value)}
                              placeholder="e.g. Linear Equations"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between' }}>
                        <button
                          className="btn secondary"
                          style={{ color: 'var(--danger, #dc2626)' }}
                          onClick={() => removeQuestion(qIdx)}
                        >
                          Remove Question
                        </button>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {qIdx > 0 && (
                            <button className="btn secondary" onClick={() => setExpandedIdx(qIdx - 1)}>
                              Prev
                            </button>
                          )}
                          {qIdx < questions.length - 1 && (
                            <button className="btn secondary" onClick={() => setExpandedIdx(qIdx + 1)}>
                              Next
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
