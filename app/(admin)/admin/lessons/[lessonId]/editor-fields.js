// Small presentational field primitives shared by every block-type
// form editor (text / video / check / question_link / desmos).
//
// They wrap the shared forms.module.css vocabulary so each editor
// reads as a flat list of fields instead of repeating the
// label/labelText/input boilerplate. No state of their own — every
// field is controlled by its parent.

import f from '../../../forms.module.css';

export function Section({ title, hint, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title && <div className={f.subhead} style={{ margin: 0 }}>{title}</div>}
      {hint && <p className={f.formHint}>{hint}</p>}
      {children}
    </section>
  );
}

export function TextField({ label, value, onChange, placeholder, required, hint }) {
  return (
    <label className={f.label}>
      <span className={f.labelText}>{label}{required ? ' *' : ''}</span>
      <input
        type="text"
        className={f.input}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className={f.muted} style={{ fontSize: 11 }}>{hint}</span>}
    </label>
  );
}

export function TextAreaField({ label, value, onChange, placeholder, rows = 3, hint, mono }) {
  return (
    <label className={f.label}>
      <span className={f.labelText}>{label}</span>
      <textarea
        className={f.input}
        value={value ?? ''}
        placeholder={placeholder}
        rows={rows}
        spellCheck={!mono}
        onChange={(e) => onChange(e.target.value)}
        style={mono ? { fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } : undefined}
      />
      {hint && <span className={f.muted} style={{ fontSize: 11 }}>{hint}</span>}
    </label>
  );
}

export function NumberField({ label, value, onChange, step, min, width = 140 }) {
  return (
    <label className={f.label} style={{ maxWidth: width }}>
      <span className={f.labelText}>{label}</span>
      <input
        type="number"
        className={f.input}
        value={value ?? ''}
        step={step}
        min={min}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function SelectField({ label, value, onChange, options }) {
  return (
    <label className={f.label}>
      <span className={f.labelText}>{label}</span>
      <select className={f.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => {
          const val = typeof opt === 'string' ? opt : opt.value;
          const text = typeof opt === 'string' ? opt : opt.label;
          return <option key={val} value={val}>{text}</option>;
        })}
      </select>
    </label>
  );
}

export function CheckboxField({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg1)' }}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
