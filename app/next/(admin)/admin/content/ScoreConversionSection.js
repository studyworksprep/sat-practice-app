'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { addScoreConversions, deleteScoreConversion } from './actions';

export function ScoreConversionSection({ tests, conversions }) {
  const [state, formAction, pending] = useActionState(addScoreConversions, null);
  const [selectedTestId, setSelectedTestId] = useState('');
  const selectedTest = tests.find((t) => t.id === selectedTestId);

  return (
    <>
      <form action={formAction} style={S.form}>
        <div style={S.row}>
          <label style={S.field}>
            <span style={S.fieldLabel}>Practice test</span>
            <select
              required
              value={selectedTestId}
              onChange={(e) => setSelectedTestId(e.target.value)}
              style={S.select}
              name="_display_test"
            >
              <option value="">Select a test…</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>{t.name ?? t.code}</option>
              ))}
            </select>
          </label>
        </div>

        {/* The table stores test_id as text; we use the test's code so
            the data can still be looked up if the UUID changes. */}
        <input type="hidden" name="test_id" value={selectedTest?.code ?? ''} />
        <input type="hidden" name="test_name" value={selectedTest?.name ?? ''} />

        <Fieldset legend="Reading & Writing">
          <NumField label="Module 1 correct" name="rw_m1" min={0} />
          <NumField label="Module 2 correct" name="rw_m2" min={0} />
          <NumField label="Scaled score" name="rw_scaled" min={200} max={800} />
        </Fieldset>

        <Fieldset legend="Math">
          <NumField label="Module 1 correct" name="math_m1" min={0} />
          <NumField label="Module 2 correct" name="math_m2" min={0} />
          <NumField label="Scaled score" name="math_scaled" min={200} max={800} />
        </Fieldset>

        <div style={S.submitRow}>
          <Button type="submit" disabled={pending || !selectedTestId}>
            {pending ? 'Saving…' : 'Add rows'}
          </Button>
          {state?.ok && !pending && <span style={S.ok}>Added {state.data.inserted} row(s).</span>}
          {state?.ok === false && !pending && <span style={S.err}>{state.error}</span>}
        </div>
      </form>

      <h4 style={S.subhead}>Existing mappings ({conversions.length})</h4>
      {conversions.length === 0 ? (
        <p style={S.empty}>No conversion data saved yet.</p>
      ) : (
        <Table style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <Th>Test</Th>
                <Th>Section</Th>
                <Th>M1 / M2</Th>
                <Th>Scaled</Th>
                <Th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id}>
                  <Td>{c.test_name ?? c.test_id}</Td>
                  <Td>{c.section}</Td>
                  <Td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.module1_correct} / {c.module2_correct}</Td>
                  <Td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{c.scaled_score}</Td>
                  <Td>
                    <form action={deleteScoreConversion}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="remove" size="sm">Delete</Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
        </Table>
      )}
    </>
  );
}

function Fieldset({ legend, children }) {
  return (
    <fieldset style={S.fieldset}>
      <legend style={S.legend}>{legend}</legend>
      <div style={S.row}>{children}</div>
    </fieldset>
  );
}

function NumField({ label, name, min, max }) {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{label}</span>
      <input type="number" name={name} min={min} max={max} style={S.input} />
    </label>
  );
}

const S = {
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  fieldLabel: { fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  input: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', width: 140 },
  select: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', background: 'white', minWidth: 260 },
  fieldset: { border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.75rem 1rem' },
  legend: { fontSize: '0.8rem', fontWeight: 600, color: '#374151', padding: '0 0.35rem' },
  submitRow: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
  subhead: { fontSize: '0.85rem', fontWeight: 600, color: '#374151', margin: '1rem 0 0.5rem' },
  empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem 0' },
};
