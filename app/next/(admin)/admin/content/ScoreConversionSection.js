'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { addScoreConversions, deleteScoreConversion } from './actions';
import s from '../../forms.module.css';

export function ScoreConversionSection({ tests, conversions }) {
  const [state, formAction, pending] = useActionState(addScoreConversions, null);
  const [selectedTestId, setSelectedTestId] = useState('');
  const selectedTest = tests.find((t) => t.id === selectedTestId);

  return (
    <>
      <form action={formAction} className={s.form}>
        <div className={s.row}>
          <label className={s.label}>
            <span className={s.labelText}>Practice test</span>
            <select
              required
              value={selectedTestId}
              onChange={(e) => setSelectedTestId(e.target.value)}
              className={s.select}
              name="_display_test"
              style={{ minWidth: 260 }}
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

        <div className={s.actions}>
          <Button type="submit" disabled={pending || !selectedTestId}>
            {pending ? 'Saving…' : 'Add rows'}
          </Button>
          {state?.ok && !pending && (
            <span className={s.ok}>Added {state.data.inserted} row(s).</span>
          )}
          {state?.ok === false && !pending && (
            <span className={s.err}>{state.error}</span>
          )}
        </div>
      </form>

      <h4 className={s.subhead}>Existing mappings ({conversions.length})</h4>
      {conversions.length === 0 ? (
        <p className={s.empty}>No conversion data saved yet.</p>
      ) : (
        <Table>
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
                <Td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {c.module1_correct} / {c.module2_correct}
                </Td>
                <Td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                  {c.scaled_score}
                </Td>
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
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>{legend}</legend>
      <div className={s.row}>{children}</div>
    </fieldset>
  );
}

function NumField({ label, name, min, max }) {
  return (
    <label className={s.label}>
      <span className={s.labelText}>{label}</span>
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        className={s.input}
        style={{ width: 140 }}
      />
    </label>
  );
}
