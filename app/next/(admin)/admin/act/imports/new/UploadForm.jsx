// Client island for the new-import upload form. Submits via the
// createImportJob Server Action (passed as a prop so the page
// doesn't pull a 'use server' import client-side). Uses
// useTransition for the submit-pending state so the button can
// show a "Uploading…" affordance while the action runs.
//
// Per-slot file inputs are optional — admin can skip the Mathpix
// HTML, or upload just the answer key, etc. The server side
// validates that at least one file is present.

'use client';

import { useState, useTransition } from 'react';
import s from '../Imports.module.css';

const SLOTS = [
  {
    name: 'test_pdf',
    label: 'Whole-test PDF',
    accept: 'application/pdf,.pdf',
    hint: 'The full ACT booklet (English + Math + Reading + Science). Used as the vision-parse source for every section. Required for the question-extraction passes.',
  },
  {
    name: 'math_html',
    label: 'Math section — Mathpix HTML',
    accept: 'text/html,.html,.htm',
    hint: 'Optional. When present, the math parser uses this as the structured source (LaTeX equations preserved) and the Mathpix-embedded figures get rehosted to the public bucket so no manual figure upload is needed.',
  },
  {
    name: 'science_html',
    label: 'Science section — Mathpix HTML',
    accept: 'text/html,.html,.htm',
    hint: 'Optional. Same pipeline as math: figures get rehosted from Mathpix data URLs to public bucket URLs, and chemistry/math-like notation comes through as LaTeX rather than vision OCR.',
  },
  {
    name: 'answer_key',
    label: 'Answer key PDF',
    accept: 'application/pdf,.pdf',
    hint: 'The per-section A/B/C/D (or F/G/H/J) letters. Parser cross-stitches the correct option into each draft.',
  },
  {
    name: 'scale',
    label: 'Score conversion PDF',
    accept: 'application/pdf,.pdf',
    hint: 'Raw → scaled tables per section. Parser writes directly into act_score_conversion; no draft step.',
  },
];

export function UploadForm({ createAction }) {
  const [sourceTest, setSourceTest] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await createAction(null, fd);
      // createImportJob redirects on success; only see a return
      // value here when something failed.
      if (res && !res.ok) {
        setError(res.error ?? 'Upload failed');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={s.form}>
      <label className={s.field}>
        <span className={s.fieldLabel}>Source test name</span>
        <span className={s.fieldHint}>
          Free-text identifier the resulting <code>act_questions</code>
          rows will carry as <code>source_test</code>. Example:{' '}
          <code>ACT-2025-Jun-FormA</code>. Use the same name on
          re-imports of the same form so the score-conversion table
          and questions stay paired.
        </span>
        <input
          type="text"
          name="source_test"
          value={sourceTest}
          onChange={(e) => setSourceTest(e.target.value)}
          required
          autoFocus
          className={s.input}
          placeholder="ACT-2025-Jun-FormA"
        />
      </label>

      {SLOTS.map((slot) => (
        <label key={slot.name} className={s.field}>
          <span className={s.fieldLabel}>{slot.label}</span>
          <span className={s.fieldHint}>{slot.hint}</span>
          <input
            type="file"
            name={slot.name}
            accept={slot.accept}
            className={s.fileInput}
          />
        </label>
      ))}

      {error && <div role="alert" className={s.banner}>{error}</div>}

      <div className={s.actions}>
        <button type="submit" disabled={pending} className={s.btnPrimary}>
          {pending ? 'Uploading…' : 'Create import job'}
        </button>
      </div>
    </form>
  );
}
