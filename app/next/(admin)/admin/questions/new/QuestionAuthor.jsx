'use client';

// Admin question-authoring form. Composes the RichEditor surfaces
// (stimulus / stem / rationale / per-option content) with the
// taxonomy, difficulty, and answer-key controls, then hands a single
// structured payload to the createQuestion Server Action, which does
// the HTML serialization + insert. Authored rows are source =
// 'studyworks' and unpublished by default.

import { useMemo, useState, useTransition } from 'react';
import { RichEditor } from './RichEditor';
import { domainsForSubject, findDomain } from '@/lib/practice/sat-taxonomy';
import { createQuestion } from './actions';

const SUBJECTS = [
  { code: 'math', name: 'Math' },
  { code: 'rw', name: 'Reading & Writing' },
];

function letter(i) {
  return String.fromCharCode(65 + i);
}

let optionSeq = 0;
function newOption(initialHtml) {
  optionSeq += 1;
  return { id: `opt-${optionSeq}`, doc: null, initialHtml: initialHtml ?? null };
}

function initialOptions(initial) {
  if (initial?.options?.length) {
    return initial.options.map((o) => newOption(o.contentHtml));
  }
  return [newOption(), newOption(), newOption(), newOption()];
}

function subjectForInitial(initial) {
  if (initial?.subject) return initial.subject;
  const dom = findDomain(initial?.domainCode);
  return dom?.subjectCode ?? 'math';
}

/**
 * @param {object} [props.initial]  Pre-filled values (e.g. an AI-generated
 *   draft). Editor surfaces take HTML strings (stimulusHtml/stemHtml/
 *   rationaleHtml and options[].contentHtml); the rest are scalars.
 * @param {string} [props.source]   'studyworks' (default) or 'generated'.
 * @param {string} [props.submitLabel]
 */
export function QuestionAuthor({ initial = null, source = 'studyworks', submitLabel = 'Create question' }) {
  const [questionType, setQuestionType] = useState(initial?.questionType ?? 'mcq');
  const [subject, setSubject] = useState(() => subjectForInitial(initial));
  const [domainCode, setDomainCode] = useState(initial?.domainCode ?? '');
  const [skillCode, setSkillCode] = useState(initial?.skillCode ?? '');
  const [difficulty, setDifficulty] = useState(initial?.difficulty != null ? String(initial.difficulty) : '');
  const [scoreBand, setScoreBand] = useState(initial?.scoreBand != null ? String(initial.scoreBand) : '');

  // The editors are seeded via initialContent (HTML) and emit their
  // parsed ProseMirror JSON on mount, so these hold JSON even before
  // the admin makes an edit.
  const [stimulusDoc, setStimulusDoc] = useState(null);
  const [stemDoc, setStemDoc] = useState(null);
  const [rationaleDoc, setRationaleDoc] = useState(null);

  const [options, setOptions] = useState(() => initialOptions(initial));
  const [correctIndex, setCorrectIndex] = useState(initial?.correctIndex ?? 0);

  const [sprAnswers, setSprAnswers] = useState(initial?.sprAnswers ?? '');
  const [sprTolerance, setSprTolerance] = useState(initial?.sprTolerance ?? '');

  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const domains = useMemo(() => domainsForSubject(subject), [subject]);
  const skills = useMemo(() => findDomain(domainCode)?.skills ?? [], [domainCode]);

  function onSubjectChange(next) {
    setSubject(next);
    setDomainCode('');
    setSkillCode('');
  }
  function onDomainChange(next) {
    setDomainCode(next);
    setSkillCode('');
  }

  function updateOptionDoc(id, doc) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, doc } : o)));
  }
  function addOption() {
    setOptions((prev) => [...prev, newOption()]);
  }
  function removeOption(index) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setCorrectIndex((prev) => {
      if (index === prev) return 0;
      return index < prev ? prev - 1 : prev;
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    setError(null);

    const payload = {
      question_type: questionType,
      domain_code: domainCode,
      skill_code: skillCode,
      difficulty,
      score_band: scoreBand,
      stem: stemDoc,
      stimulus: stimulusDoc,
      rationale: rationaleDoc,
      source,
    };
    if (questionType === 'mcq') {
      payload.options = options.map((o, i) => ({ label: letter(i), doc: o.doc }));
      payload.correct_option_label = letter(correctIndex);
    } else {
      payload.spr_answers = sprAnswers.split('\n').map((s) => s.trim()).filter(Boolean);
      payload.spr_tolerance = sprTolerance;
    }

    startTransition(async () => {
      const res = await createQuestion(payload);
      // On success the action redirects; we only get here on failure.
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} style={S.form}>
      {initial?.figureNote && (
        <div style={S.figureBanner}>
          <strong>Figure needed:</strong> {initial.figureNote} Use the image
          button (🖼) in the relevant editor to upload it.
        </div>
      )}

      {/* ── Metadata ─────────────────────────────────────────── */}
      <section style={S.card}>
        <h2 style={S.cardTitle}>Classification</h2>
        <div style={S.grid}>
          <Labeled label="Question type">
            <select value={questionType} onChange={(e) => setQuestionType(e.target.value)} style={S.select}>
              <option value="mcq">Multiple choice (MCQ)</option>
              <option value="spr">Student-produced response (SPR)</option>
            </select>
          </Labeled>
          <Labeled label="Subject">
            <select value={subject} onChange={(e) => onSubjectChange(e.target.value)} style={S.select}>
              {SUBJECTS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Domain">
            <select value={domainCode} onChange={(e) => onDomainChange(e.target.value)} style={S.select}>
              <option value="">— select —</option>
              {domains.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Skill">
            <select value={skillCode} onChange={(e) => setSkillCode(e.target.value)} style={S.select} disabled={!domainCode}>
              <option value="">— select —</option>
              {skills.map((sk) => <option key={sk.code} value={sk.code}>{sk.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Difficulty (optional)">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={S.select}>
              <option value="">—</option>
              <option value="1">1 · Easy</option>
              <option value="2">2 · Medium</option>
              <option value="3">3 · Hard</option>
            </select>
          </Labeled>
          <Labeled label="Score band (optional)">
            <select value={scoreBand} onChange={(e) => setScoreBand(e.target.value)} style={S.select}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Labeled>
        </div>
      </section>

      {/* ── Stimulus ─────────────────────────────────────────── */}
      <section style={S.card}>
        <h2 style={S.cardTitle}>Stimulus <span style={S.optional}>optional — passage, data table, or setup</span></h2>
        <RichEditor
          initialContent={initial?.stimulusHtml ?? null}
          onChange={setStimulusDoc}
          tools={{ tables: true, images: true, displayMath: true }}
          placeholder="Passage, table, figure, or a standalone equation…"
        />
      </section>

      {/* ── Stem ─────────────────────────────────────────────── */}
      <section style={S.card}>
        <h2 style={S.cardTitle}>Question stem <span style={S.required}>required</span></h2>
        <RichEditor
          initialContent={initial?.stemHtml ?? null}
          onChange={setStemDoc}
          tools={{ tables: false, images: true, displayMath: false }}
          placeholder="The question sentence — What…, Which…, If…"
        />
      </section>

      {/* ── Answer key ───────────────────────────────────────── */}
      {questionType === 'mcq' ? (
        <section style={S.card}>
          <h2 style={S.cardTitle}>Answer choices <span style={S.optional}>select the correct one</span></h2>
          <div style={S.options}>
            {options.map((opt, i) => (
              <div key={opt.id} style={S.optionRow}>
                <label style={S.optionPick} title="Mark correct">
                  <input
                    type="radio"
                    name="correct"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                  />
                  <span style={S.optionLabel}>{letter(i)}</span>
                </label>
                <div style={{ flex: 1 }}>
                  <RichEditor
                    initialContent={opt.initialHtml ?? null}
                    onChange={(doc) => updateOptionDoc(opt.id, doc)}
                    tools={{ tables: false, images: true, displayMath: true }}
                    placeholder="Answer choice…"
                  />
                </div>
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(i)} style={S.removeBtn} title="Remove choice">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addOption} style={S.addBtn}>+ Add choice</button>
        </section>
      ) : (
        <section style={S.card}>
          <h2 style={S.cardTitle}>Accepted answers <span style={S.optional}>one per line</span></h2>
          <textarea
            value={sprAnswers}
            onChange={(e) => setSprAnswers(e.target.value)}
            rows={4}
            placeholder={'1/14\n.0714\n0.0714'}
            style={S.textarea}
          />
          <Labeled label="Numeric tolerance (optional)">
            <input
              type="text"
              inputMode="decimal"
              value={sprTolerance}
              onChange={(e) => setSprTolerance(e.target.value)}
              placeholder="e.g. 0.01"
              style={{ ...S.select, maxWidth: '10rem' }}
            />
          </Labeled>
        </section>
      )}

      {/* ── Rationale ────────────────────────────────────────── */}
      <section style={S.card}>
        <h2 style={S.cardTitle}>Rationale <span style={S.optional}>optional — shown on review</span></h2>
        <RichEditor
          initialContent={initial?.rationaleHtml ?? null}
          onChange={setRationaleDoc}
          tools={{ tables: true, images: true, displayMath: true }}
          placeholder="Why the correct answer is correct…"
        />
      </section>

      {error && <div style={S.error}>{error}</div>}

      <div style={S.footer}>
        <div style={S.footerNote}>
          Saved as <code>source = {source}</code>, <strong>unpublished</strong>.
          You can publish it from the question page afterward.
        </div>
        <button type="submit" disabled={pending} style={S.submitBtn}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Labeled({ label, children }) {
  return (
    <label style={S.labeled}>
      <span style={S.labeledText}>{label}</span>
      {children}
    </label>
  );
}

const S = {
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  figureBanner: { padding: '0.6rem 0.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 8, fontSize: '0.9rem', lineHeight: 1.5 },
  card: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '1rem 1.25rem', background: '#fff' },
  cardTitle: { fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#374151', margin: '0 0 0.75rem' },
  optional: { fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#9ca3af', marginLeft: '0.5rem' },
  required: { fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#b45309', marginLeft: '0.5rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: '0.75rem' },
  labeled: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  labeledText: { fontSize: '0.78rem', fontWeight: 600, color: '#6b7280' },
  select: { padding: '0.45rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', background: '#fff' },
  options: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  optionRow: { display: 'flex', alignItems: 'flex-start', gap: '0.6rem' },
  optionPick: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', paddingTop: '0.4rem', cursor: 'pointer' },
  optionLabel: { fontWeight: 700, color: '#374151', fontSize: '0.95rem' },
  removeBtn: { alignSelf: 'flex-start', marginTop: '0.3rem', width: '1.8rem', height: '1.8rem', border: '1px solid #fca5a5', color: '#991b1b', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 },
  addBtn: { marginTop: '0.75rem', padding: '0.4rem 0.85rem', background: '#fff', color: '#374151', border: '1px dashed #9ca3af', borderRadius: 6, fontWeight: 500, cursor: 'pointer', fontSize: '0.85rem' },
  textarea: { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.95rem', lineHeight: 1.4, resize: 'vertical', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', marginBottom: '0.75rem' },
  error: { padding: '0.6rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, fontSize: '0.9rem' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' },
  footerNote: { fontSize: '0.85rem', color: '#6b7280' },
  submitBtn: { padding: '0.6rem 1.4rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' },
};
