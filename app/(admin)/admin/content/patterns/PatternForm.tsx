// Field set shared by "New pattern" and the inline row editor, so the
// two authoring paths cannot drift in what they ask for or how they
// label it. Domain and skill are <select>s driven by SAT_TAXONOMY —
// the catalog only means something when a pattern hangs off a real
// curriculum unit, and free-typing codes is how that breaks.

'use client';

import { useMemo } from 'react';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { Button } from '@/lib/ui/Button';
import { NAME_MAX, CUE_MAX, PROCESS_MAX } from '@/lib/admin/questionPatternCsv';
import f from '../../../forms.module.css';

export interface PatternFormValues {
  domainCode: string;
  skillCode: string;
  name: string;
  recognitionCue: string;
  processSummary: string;
  sequence: string;
}

export const EMPTY_PATTERN_FORM: PatternFormValues = {
  domainCode: '',
  skillCode: '',
  name: '',
  recognitionCue: '',
  processSummary: '',
  sequence: '',
};

export function PatternForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  pending,
  submitLabel,
  sequenceHint,
}: {
  values: PatternFormValues;
  onChange: (next: PatternFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  submitLabel: string;
  sequenceHint?: string;
}) {
  const skills = useMemo(
    () => SAT_TAXONOMY.find((d) => d.code === values.domainCode)?.skills ?? [],
    [values.domainCode],
  );

  const set = (field: keyof PatternFormValues) => (value: string) =>
    onChange({ ...values, [field]: value });

  // Changing domain invalidates the skill below it.
  function setDomain(code: string) {
    onChange({ ...values, domainCode: code, skillCode: '' });
  }

  return (
    <form
      className={f.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={f.grid}>
        <label className={f.label}>
          <span className={f.labelText}>Domain</span>
          <select
            className={f.select}
            value={values.domainCode}
            onChange={(e) => setDomain(e.target.value)}
            disabled={pending}
            required
          >
            <option value="">Select a domain…</option>
            {SAT_TAXONOMY.map((d) => (
              <option key={d.code} value={d.code}>
                {d.subjectCode === 'math' ? 'Math' : 'R&W'} · {d.name} ({d.code})
              </option>
            ))}
          </select>
        </label>

        <label className={f.label}>
          <span className={f.labelText}>Skill</span>
          <select
            className={f.select}
            value={values.skillCode}
            onChange={(e) => set('skillCode')(e.target.value)}
            disabled={pending || skills.length === 0}
            required
          >
            <option value="">{values.domainCode ? 'Select a skill…' : 'Pick a domain first'}</option>
            {skills.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </label>

        <label className={f.label}>
          <span className={f.labelText}>Teaching order</span>
          <input
            className={f.inputNarrow}
            type="number"
            min={1}
            step={1}
            value={values.sequence}
            onChange={(e) => set('sequence')(e.target.value)}
            disabled={pending}
            placeholder="auto"
          />
          <span className={f.formHint}>{sequenceHint ?? 'Blank appends to the end of the skill.'}</span>
        </label>
      </div>

      <label className={f.label}>
        <span className={f.labelText}>Name</span>
        <input
          className={f.input}
          value={values.name}
          onChange={(e) => set('name')(e.target.value)}
          disabled={pending}
          maxLength={NAME_MAX}
          placeholder="Punctuation between clauses"
          required
        />
        <span className={f.formHint}>
          Short label, unique within the skill. Shows on lesson scope tags and the question picker.
        </span>
      </label>

      <label className={f.label}>
        <span className={f.labelText}>Recognition cue</span>
        <textarea
          className={f.input}
          rows={2}
          value={values.recognitionCue}
          onChange={(e) => set('recognitionCue')(e.target.value)}
          disabled={pending}
          maxLength={CUE_MAX}
          placeholder="Two clauses on either side of the blank, and the answers differ only in punctuation."
          required
        />
        <span className={f.formHint}>
          The &ldquo;when you see&hellip;&rdquo; half. Write it as the student would recognize it, not as a
          topic name.
        </span>
      </label>

      <label className={f.label}>
        <span className={f.labelText}>
          Process summary <span className={f.muted}>(optional)</span>
        </span>
        <textarea
          className={f.input}
          rows={3}
          value={values.processSummary}
          onChange={(e) => set('processSummary')(e.target.value)}
          disabled={pending}
          maxLength={PROCESS_MAX}
          placeholder="Test whether each side stands alone. Both independent: period or semicolon. One dependent: comma."
        />
        <span className={f.formHint}>
          The &ldquo;&hellip;then do this&rdquo; half — the rehearsed procedure, one or two lines. Prefills the
          lesson-generation brief.
        </span>
      </label>

      <div className={f.actions}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>{' '}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
