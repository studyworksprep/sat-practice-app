// Field set shared by "New technique" and the inline row editor on the
// Techniques catalog, so the two authoring paths cannot drift in what
// they ask for or how they label it. Written for a non-technical
// editor: skills are chosen by name, with one-click "all Math" /
// "all Reading & Writing" shortcuts, and no code is a primary label.

'use client';

import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { Button } from '@/lib/ui/Button';
import {
  TECHNIQUE_NAME_MAX,
  TECHNIQUE_DESCRIPTION_MAX,
  TECHNIQUE_PROCESS_MAX,
  skillCodesForSection,
  type TechniqueSection,
} from '@/lib/admin/techniques';
import f from '../../forms.module.css';

export interface TechniqueFormValues {
  name: string;
  description: string;
  processSummary: string;
  /** '' = both sections. */
  section: '' | TechniqueSection;
  skillCodes: string[];
  sequence: string;
}

export const EMPTY_TECHNIQUE_FORM: TechniqueFormValues = {
  name: '',
  description: '',
  processSummary: '',
  section: '',
  skillCodes: [],
  sequence: '',
};

export function TechniqueForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  pending,
  submitLabel,
  compact = false,
}: {
  values: TechniqueFormValues;
  onChange: (next: TechniqueFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  submitLabel: string;
  /** Inline create inside another form: no order field, shorter hints. */
  compact?: boolean;
}) {
  const set = <K extends keyof TechniqueFormValues>(key: K, value: TechniqueFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const domains = SAT_TAXONOMY.filter((d) =>
    values.section === '' ? true : values.section === 'math' ? d.subjectCode === 'math' : d.subjectCode !== 'math',
  );

  function setSection(section: '' | TechniqueSection) {
    // A section pin drops default skills that would sit outside it.
    const allowed = section ? new Set(skillCodesForSection(section)) : null;
    onChange({
      ...values,
      section,
      skillCodes: allowed ? values.skillCodes.filter((c) => allowed.has(c)) : values.skillCodes,
    });
  }

  function toggleSkill(code: string, on: boolean) {
    set('skillCodes', on ? [...new Set([...values.skillCodes, code])] : values.skillCodes.filter((c) => c !== code));
  }

  function selectAll(section: TechniqueSection) {
    const codes = skillCodesForSection(section);
    const others = values.skillCodes.filter((c) => !codes.includes(c));
    set('skillCodes', [...others, ...codes]);
  }

  const inner = (
    <>
      <label className={f.label}>
        <span className={f.labelText}>Name</span>
        <input
          className={f.input}
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={pending}
          maxLength={TECHNIQUE_NAME_MAX}
          placeholder="Solve by graphing (x-intercepts)"
          required
        />
      </label>

      <label className={f.label}>
        <span className={f.labelText}>When to use it</span>
        <textarea
          className={f.input}
          rows={2}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          disabled={pending}
          maxLength={TECHNIQUE_DESCRIPTION_MAX}
          placeholder="The question asks for the value of one variable in an equation you can type into Desmos."
          required
        />
        {!compact && (
          <span className={f.formHint}>
            Written the way a student would recognize the moment to use it, not as a topic name.
          </span>
        )}
      </label>

      <label className={f.label}>
        <span className={f.labelText}>
          The process <span className={f.muted}>(optional)</span>
        </span>
        <textarea
          className={f.input}
          rows={compact ? 2 : 3}
          value={values.processSummary}
          onChange={(e) => set('processSummary', e.target.value)}
          disabled={pending}
          maxLength={TECHNIQUE_PROCESS_MAX}
          placeholder="Move everything to one side. Type it into Desmos without the “= 0”. Read the x-intercepts."
        />
        {!compact && <span className={f.formHint}>The rehearsed steps, one to three lines. Prefills the lesson-generation brief.</span>}
      </label>

      <fieldset className={f.fieldset}>
        <legend className={f.legend}>Section</legend>
        {(
          [
            ['math', 'Math'],
            ['reading_writing', 'Reading & Writing'],
            ['', 'Both'],
          ] as Array<['' | TechniqueSection, string]>
        ).map(([value, label]) => (
          <label key={value || 'both'} className={f.row} style={{ margin: 0 }}>
            <input
              type="radio"
              name={`technique-section-${compact ? 'inline' : 'catalog'}`}
              checked={values.section === value}
              disabled={pending}
              onChange={() => setSection(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className={f.fieldset}>
        <legend className={f.legend}>Applies to every question in these skills</legend>
        <p className={f.formHint} style={{ marginTop: 0 }}>
          Questions in a chosen skill count as this technique without being tagged one by one. Leave
          everything unchecked for a technique that only applies to questions tagged to it.
        </p>
        <div className={f.row} style={{ gap: 6, flexWrap: 'wrap' }}>
          {values.section !== 'reading_writing' && (
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => selectAll('math')}>
              All Math skills
            </Button>
          )}
          {values.section !== 'math' && (
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => selectAll('reading_writing')}>
              All Reading &amp; Writing skills
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" disabled={pending || values.skillCodes.length === 0} onClick={() => set('skillCodes', [])}>
            Clear
          </Button>
          <span className={f.muted}>
            {values.skillCodes.length === 0 ? 'No default skills' : `${values.skillCodes.length} skill${values.skillCodes.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div style={S.skillGroups}>
          {domains.map((d) => (
            <div key={d.code} style={S.skillGroup}>
              <div style={S.skillGroupTitle}>{d.name}</div>
              {d.skills.map((s) => (
                <label key={s.code} className={f.row} style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={values.skillCodes.includes(s.code)}
                    disabled={pending}
                    onChange={(e) => toggleSkill(s.code, e.target.checked)}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      {!compact && (
        <label className={f.label} style={{ maxWidth: 260 }}>
          <span className={f.labelText}>
            Order in the catalog <span className={f.muted}>(optional)</span>
          </span>
          <input
            className={f.inputNarrow}
            type="number"
            min={1}
            step={1}
            value={values.sequence}
            onChange={(e) => set('sequence', e.target.value)}
            disabled={pending}
            placeholder="auto"
          />
          <span className={f.formHint}>Blank keeps its place (or appends a new technique to the end of its section).</span>
        </label>
      )}

      <div className={f.actions}>
        <Button type={compact ? 'button' : 'submit'} variant="primary" disabled={pending} onClick={compact ? onSubmit : undefined}>
          {pending ? 'Saving…' : submitLabel}
        </Button>{' '}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </>
  );

  // The inline create lives inside the curriculum editor's step form,
  // and a <form> cannot nest — so compact mode renders a plain block
  // and submits from its button.
  if (compact) return <div className={f.form}>{inner}</div>;

  return (
    <form
      className={f.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {inner}
    </form>
  );
}

const S: Record<string, React.CSSProperties> = {
  skillGroups: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem 1rem', marginTop: '0.5rem' },
  skillGroup: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.85rem' },
  skillGroupTitle: { fontWeight: 700, fontSize: '0.78rem', color: '#374151', margin: '4px 0 2px' },
};
