// Start-session client island. Renders the filter form and the
// (optional) "resume active session" banner.

'use client';

import { useActionState, useState } from 'react';

export function StartInteractive({ domains, resumeInfo, createSessionAction }) {
  const [state, submitAction, isPending] = useActionState(createSessionAction, null);

  // Local filter state. Server Action reads directly from formData
  // so this is purely for controlled-form UX, not for submission.
  const [selectedDomains, setSelectedDomains] = useState(new Set());
  const [selectedDifficulties, setSelectedDifficulties] = useState(new Set());

  const toggle = (set, setter) => (value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  return (
    <main style={S.main}>
      <h1 style={S.h1}>Practice</h1>
      <p style={S.sub}>
        Pick your filters and start a session. Your progress is saved
        server-side — you can close the tab and come back anytime.
      </p>

      {resumeInfo && (
        <div style={S.resumeBox} role="status">
          <div>
            <strong>You have an active session.</strong>{' '}
            Position {resumeInfo.position + 1} of {resumeInfo.total}.
          </div>
          <a
            href={`/practice/s/${resumeInfo.sessionId}/${resumeInfo.position}`}
            style={S.resumeLink}
          >
            Resume →
          </a>
        </div>
      )}

      <form action={submitAction} style={S.form}>
        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Domains</legend>
          <div style={S.checkList}>
            {domains.length === 0 && (
              <p style={S.emptyNote}>No domain data loaded.</p>
            )}
            {domains.map((d) => (
              <label key={d.name} style={S.checkItem}>
                <input
                  type="checkbox"
                  name="domain"
                  value={d.name}
                  checked={selectedDomains.has(d.name)}
                  onChange={() => toggle(selectedDomains, setSelectedDomains)(d.name)}
                />
                <span>{d.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Difficulty</legend>
          <div style={S.checkList}>
            {[
              { value: 1, label: 'Easy' },
              { value: 2, label: 'Medium' },
              { value: 3, label: 'Hard' },
            ].map((d) => (
              <label key={d.value} style={S.checkItem}>
                <input
                  type="checkbox"
                  name="difficulty"
                  value={d.value}
                  checked={selectedDifficulties.has(d.value)}
                  onChange={() =>
                    toggle(selectedDifficulties, setSelectedDifficulties)(d.value)
                  }
                />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Session size</legend>
          <input
            type="number"
            name="size"
            min="1"
            max="25"
            defaultValue="10"
            style={S.sizeInput}
          />
        </fieldset>

        <button type="submit" disabled={isPending} style={S.submitBtn}>
          {isPending ? 'Starting…' : 'Start session'}
        </button>

        {state && !state.ok && (
          <p role="alert" style={S.error}>
            {state.error}
          </p>
        )}
      </form>
    </main>
  );
}

const S = {
  main: { maxWidth: 720, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', marginTop: 0 },
  resumeBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    marginTop: '1rem',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
  },
  resumeLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 600,
  },
  form: { marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  fieldset: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem' },
  legend: { fontWeight: 600, padding: '0 0.5rem' },
  checkList: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem' },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  emptyNote: { color: '#9ca3af', fontStyle: 'italic' },
  sizeInput: {
    width: 80,
    padding: '0.4rem 0.6rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: '1rem',
  },
  submitBtn: {
    alignSelf: 'flex-start',
    padding: '0.6rem 1.25rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  error: { color: '#b91c1c', marginTop: '0.5rem' },
};
