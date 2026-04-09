'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import HtmlBlock from './HtmlBlock';

// Mirrors the helper in app/practice/[questionId]/page.js so the preview
// renders free-response correct answers the same way as the real question
// page.
function formatCorrectText(ct) {
  if (ct == null) return null;
  if (Array.isArray(ct)) return ct;
  if (typeof ct === 'string') {
    const t = ct.trim();
    if (!t) return null;
    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [t];
  }
  return [String(ct)];
}

function htmlHasContent(html) {
  if (!html) return false;
  if (/<img\s/i.test(html)) return true;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
}

function formatFixedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// Render a single questions_v2 row using the same markup / CSS classes as
// the main practice page so it visually matches what students see.
function QuestionV2Card({ question, index, onFix }) {
  const qType = String(question.question_type || '').toLowerCase();
  const options = Array.isArray(question.options)
    ? question.options.slice().sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    : [];
  const correct = question.correct_answer || {};
  const correctLabel = correct.option_label || null;
  const correctLabels = Array.isArray(correct.option_labels) ? correct.option_labels : [];
  const correctTextArr = formatCorrectText(correct.text);

  const [showExplanation, setShowExplanation] = useState(false);

  const isCorrectOption = useCallback(
    (opt) => {
      if (!opt) return false;
      if (correctLabel && String(opt.label) === String(correctLabel)) return true;
      if (correctLabels.length && correctLabels.map(String).includes(String(opt.label))) return true;
      return false;
    },
    [correctLabel, correctLabels]
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {/* ── Header: question # + taxonomy pills ── */}
      <div
        className="statusPillRow"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="qNumBadge" aria-label={`Preview question ${index + 1}`}>
            {index + 1}
          </div>
          {question.display_code ? (
            <span
              className="kbd"
              style={{ fontSize: 13, fontWeight: 700, padding: '4px 10px' }}
              title="questions_v2 display code"
            >
              {question.display_code}
            </span>
          ) : null}
        </div>
        <div className="row" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="pill">
            <span className="muted">Type</span>{' '}
            <span className="kbd">{qType.toUpperCase() || '—'}</span>
          </span>
          {question.domain_name ? (
            <span className="pill">
              <span className="muted">Domain</span>{' '}
              <span className="kbd">{question.domain_name}</span>
            </span>
          ) : null}
          {question.skill_name ? (
            <span className="pill">
              <span className="muted">Skill</span>{' '}
              <span className="kbd">{question.skill_name}</span>
            </span>
          ) : null}
          {question.difficulty != null ? (
            <span className="pill">
              <span className="muted">Diff</span>{' '}
              <span className="kbd">{question.difficulty}</span>
            </span>
          ) : null}
          {question.is_broken ? (
            <span className="pill" style={{ borderColor: '#dc2626', color: '#dc2626' }}>Broken</span>
          ) : null}
          {question.last_fixed_at ? (
            <span
              className="pill"
              style={{ borderColor: '#15803d', color: '#15803d' }}
              title={`Cleaned on ${formatFixedAt(question.last_fixed_at)}`}
            >
              Fixed
            </span>
          ) : null}
          {question.source_id ? (
            <span className="pill">
              <span className="muted">ID</span>{' '}
              <span className="kbd" style={{ fontSize: 11 }}>{question.source_id}</span>
            </span>
          ) : null}
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => onFix?.(question)}
            title="Send this question to Claude for HTML cleanup"
          >
            Fix with Claude
          </button>
        </div>
      </div>

      {/* ── Stimulus ── */}
      {htmlHasContent(question.stimulus_html) ? (
        <div style={{ marginBottom: 12 }}>
          <div className="srOnly">Stimulus</div>
          <HtmlBlock className="prose" html={question.stimulus_html} imgMaxWidth={320} />
        </div>
      ) : null}

      {/* ── Stem ── */}
      {question.stem_html ? (
        <div style={{ marginBottom: 12 }}>
          <div className="srOnly">Question</div>
          <HtmlBlock className="prose" html={question.stem_html} imgMaxWidth={320} />
        </div>
      ) : null}

      {/* ── Answer area ── */}
      {qType === 'mcq' ? (
        <>
          <div className="srOnly">Answer choices</div>
          <div className="optionList">
            {options.map((opt, i) => {
              const correctHere = isCorrectOption(opt);
              // Use the same class structure as the practice page so the CSS
              // for .option / .option.revealCorrect / .optionBadge / .optionContent
              // applies identically. We always "reveal" the correct answer in the
              // preview since this is an admin inspection view.
              const cls = 'option' + (correctHere ? ' revealCorrect' : '');
              return (
                <div key={`${opt.label ?? ''}-${opt.ordinal ?? i}`} className={cls}>
                  <div className="optionBadge">
                    {opt.label || String.fromCharCode(65 + (opt.ordinal ?? i))}
                  </div>
                  <div className="optionContent">
                    <HtmlBlock className="prose" html={opt.content_html} />
                  </div>
                </div>
              );
            })}
          </div>
          {options.length === 0 ? (
            <p className="muted small" style={{ marginTop: 8 }}>No options in this row.</p>
          ) : null}
        </>
      ) : (
        <>
          <div className="srOnly">Correct answer</div>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {correctTextArr && correctTextArr.length > 0 ? (
              <span className="pill" style={{ borderColor: '#15803d', background: '#f0fdf4' }}>
                <span style={{ color: '#15803d' }}>Correct answer</span>{' '}
                <span className="kbd" style={{ color: '#15803d', fontWeight: 700 }}>
                  {correctTextArr.join(' or ')}
                </span>
              </span>
            ) : correct.number != null ? (
              <span className="pill" style={{ borderColor: '#15803d', background: '#f0fdf4' }}>
                <span style={{ color: '#15803d' }}>Correct answer</span>{' '}
                <span className="kbd" style={{ color: '#15803d', fontWeight: 700 }}>
                  {correct.number}
                  {correct.tolerance ? ` (±${correct.tolerance})` : ''}
                </span>
              </span>
            ) : (
              <span className="muted small">No correct answer recorded.</span>
            )}
          </div>
        </>
      )}

      {/* ── Explanation toggle ── */}
      {question.rationale_html ? (
        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setShowExplanation((s) => !s)}
          >
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        </div>
      ) : null}

      {showExplanation && question.rationale_html ? (
        <div className="card explanation" style={{ marginTop: 14 }}>
          <div className="sectionLabel">Explanation</div>
          <HtmlBlock className="prose" html={question.rationale_html} />
        </div>
      ) : null}
    </div>
  );
}

// =============================================================
// FixWithClaudeModal
// =============================================================
// Lifecycle: once `question` is set, the modal POSTs to the fix
// endpoint to fetch Claude's suggestion.  While waiting, it shows a
// loading state.  Once the suggestion arrives, it renders three
// editable sections (stimulus, stem, options) with a live preview
// on the right of each.  Save PUTs the edited fields back, Cancel
// discards.
function FixWithClaudeModal({ question, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [stimulus, setStimulus] = useState('');
  const [stem, setStem] = useState('');
  const [options, setOptions] = useState([]); // [{label, content_html}]

  // Fetch suggestion on open / re-open.
  const regenerate = useCallback(async () => {
    if (!question?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/questions-v2/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to call Claude');
      const s = json.suggestion || {};
      setStimulus(typeof s.stimulus_html === 'string' ? s.stimulus_html : (question.stimulus_html || ''));
      setStem(typeof s.stem_html === 'string' ? s.stem_html : (question.stem_html || ''));
      setOptions(Array.isArray(s.options) && s.options.length
        ? s.options.map(o => ({ label: o.label, content_html: o.content_html || '' }))
        : (Array.isArray(question.options)
            ? question.options
                .slice()
                .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
                .map(o => ({ label: o.label, content_html: o.content_html || '' }))
            : []));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [question]);

  useEffect(() => { regenerate(); }, [regenerate]);

  const save = useCallback(async () => {
    if (!question?.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/questions-v2/fix', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: question.id,
          stimulus_html: stimulus || null,
          stem_html: stem,
          options,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [question, stimulus, stem, options, onSaved, onClose]);

  if (!question) return null;

  const origOptions = Array.isArray(question.options)
    ? question.options.slice().sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    : [];

  return (
    <div
      className="modalOverlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 100, overflowY: 'auto', padding: '24px 16px',
      }}
    >
      <div
        className="modalCard"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1100,
          padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="h2" style={{ margin: 0 }}>Fix with Claude</div>
            <div className="muted small" style={{ marginTop: 2 }}>
              {question.display_code ? <code>{question.display_code}</code> : null}
              {question.source_id ? <> · <code>{question.source_id}</code></> : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn secondary" onClick={regenerate} disabled={loading || saving}>
              {loading ? 'Generating…' : 'Regenerate'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={save} disabled={loading || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="card" style={{ borderColor: '#dc2626', color: '#dc2626' }}>
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 30 }}>
            <div className="muted">Asking Claude to clean this question…</div>
          </div>
        ) : (
          <>
            <FixSection
              label="Stimulus"
              originalHtml={question.stimulus_html || ''}
              value={stimulus}
              onChange={setStimulus}
              placeholderEmpty="(no stimulus)"
              rows={8}
            />
            <FixSection
              label="Stem"
              originalHtml={question.stem_html || ''}
              value={stem}
              onChange={setStem}
              rows={5}
            />
            {options.length > 0 ? (
              <div>
                <div className="sectionLabel" style={{ marginBottom: 6 }}>Answer choices</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {options.map((opt, i) => (
                    <FixSection
                      key={`${opt.label}-${i}`}
                      label={`Option ${opt.label}`}
                      originalHtml={origOptions[i]?.content_html || ''}
                      value={opt.content_html}
                      onChange={(v) => {
                        setOptions((arr) => {
                          const next = arr.slice();
                          next[i] = { ...next[i], content_html: v };
                          return next;
                        });
                      }}
                      rows={3}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// One labelled field with: original (read-only), editable textarea,
// live preview. Used for stimulus / stem / each option inside the
// Fix-with-Claude modal.
function FixSection({ label, originalHtml, value, onChange, rows = 5, placeholderEmpty }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="sectionLabel" style={{ marginBottom: 8 }}>{label}</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Original</div>
          <div
            style={{
              border: '1px solid #e5e7eb', borderRadius: 8, padding: 10,
              minHeight: 60, maxHeight: 260, overflow: 'auto', background: '#f9fafb',
            }}
          >
            {originalHtml
              ? <HtmlBlock className="prose" html={originalHtml} imgMaxWidth={260} />
              : <span className="muted small">{placeholderEmpty || '(empty)'}</span>}
          </div>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Suggested (editable)</div>
          <textarea
            className="input"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, width: '100%' }}
          />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="small muted" style={{ marginBottom: 4 }}>Live preview</div>
        <div
          style={{
            border: '1px solid #bbf7d0', borderRadius: 8, padding: 10,
            minHeight: 40, background: '#f0fdf4',
          }}
        >
          {value
            ? <HtmlBlock className="prose" html={value} />
            : <span className="muted small">(empty)</span>}
        </div>
      </div>
    </div>
  );
}

export default function QuestionsV2Preview() {
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState('');
  const [domain, setDomain] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [fixingQuestion, setFixingQuestion] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (type) params.set('type', type);
    if (domain) params.set('domain', domain);
    if (search) params.set('q', search);
    try {
      const res = await fetch(`/api/admin/questions-v2?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setQuestions(json.questions || []);
      setTotal(json.total || 0);
      setDomains(json.domains || []);
    } catch (e) {
      setError(e.message || String(e));
      setQuestions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, type, domain, search]);

  useEffect(() => { load(); }, [load]);

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const onSubmitSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const resetFilters = () => {
    setType('');
    setDomain('');
    setSearch('');
    setSearchInput('');
    setOffset(0);
  };

  const filtersActive = useMemo(() => !!(type || domain || search), [type, domain, search]);

  return (
    <>
      <h2 className="h2" style={{ marginBottom: 8 }}>Questions V2 Preview</h2>
      <p className="muted small" style={{ marginBottom: 16 }}>
        Preview of rows in the new <code>questions_v2</code> table, rendered the same way
        they appear to students in the practice app. Correct answers are highlighted so
        admins can verify the migration.
      </p>

      {/* ── Filter bar ── */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 16,
        }}
      >
        <form onSubmit={onSubmitSearch} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Search ID
            <input
              className="input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="display code, source id, or external id"
              style={{ minWidth: 260 }}
            />
          </label>
          <button className="btn" type="submit">Search</button>
        </form>

        <label className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Type
          <select
            className="input"
            value={type}
            onChange={(e) => { setOffset(0); setType(e.target.value); }}
          >
            <option value="">All</option>
            <option value="mcq">MCQ</option>
            <option value="spr">SPR</option>
          </select>
        </label>

        <label className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Domain
          <select
            className="input"
            value={domain}
            onChange={(e) => { setOffset(0); setDomain(e.target.value); }}
          >
            <option value="">All</option>
            {domains.map((d) => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
        </label>

        <label className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Per page
          <select
            className="input"
            value={limit}
            onChange={(e) => { setOffset(0); setLimit(parseInt(e.target.value, 10) || 10); }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>

        {filtersActive ? (
          <button className="btn secondary" type="button" onClick={resetFilters}>Reset</button>
        ) : null}

        <div style={{ marginLeft: 'auto' }} className="muted small">
          {loading ? 'Loading…' : `${total.toLocaleString()} question${total === 1 ? '' : 's'}`}
        </div>
      </div>

      {error ? (
        <div className="card" style={{ borderColor: '#dc2626', color: '#dc2626', marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {!loading && total === 0 && !error ? (
        <div className="card">
          <p className="muted">
            No questions found in <code>questions_v2</code>. Run
            <code> SELECT * FROM migrate_questions_batch(100); </code>
            in the Supabase SQL editor to populate it.
          </p>
        </div>
      ) : null}

      {questions.map((q, i) => (
        <QuestionV2Card
          key={q.id}
          question={q}
          index={offset + i}
          onFix={setFixingQuestion}
        />
      ))}

      {/* ── Pagination ── */}
      {total > limit ? (
        <div
          className="adminPagination"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}
        >
          <span className="muted small">
            Showing {offset + 1}–{Math.min(offset + questions.length, total)} of {total.toLocaleString()}
          </span>
          <div className="adminPaginationBtns" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="adminPageBtn"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Prev
            </button>
            <span className="small" style={{ minWidth: 60, textAlign: 'center' }}>{page} / {totalPages}</span>
            <button
              className="adminPageBtn"
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {fixingQuestion ? (
        <FixWithClaudeModal
          question={fixingQuestion}
          onClose={() => setFixingQuestion(null)}
          onSaved={() => { load(); }}
        />
      ) : null}
    </>
  );
}
