'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { updateTestThresholds } from './actions';

export function TestThresholdsSection({ tests, selectedTestId, currentRW, currentMath }) {
  const router = useRouter();
  const [isLoading, startTransition] = useTransition();
  const [rw, setRw] = useState(currentRW ?? '');
  const [math, setMath] = useState(currentMath ?? '');
  const [state, formAction, pending] = useActionState(updateTestThresholds, null);

  useEffect(() => {
    setRw(currentRW ?? '');
    setMath(currentMath ?? '');
  }, [currentRW, currentMath, selectedTestId]);

  function selectTest(nextId) {
    const url = nextId
      ? `/admin/content?routing_test=${encodeURIComponent(nextId)}`
      : '/admin/content';
    startTransition(() => {
      router.replace(url, { scroll: false });
    });
  }

  const selectedTest = tests.find((t) => t.id === selectedTestId);

  return (
    <>
      <div style={S.selectorRow}>
        <label style={S.field}>
          <span style={S.fieldLabel}>Practice test</span>
          <select
            value={selectedTestId ?? ''}
            onChange={(e) => selectTest(e.target.value)}
            disabled={isLoading}
            style={S.select}
          >
            <option value="">Select a test…</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>{t.name ?? t.code}</option>
            ))}
          </select>
        </label>
        {isLoading && <span style={S.hint}>Loading…</span>}
      </div>

      {!selectedTestId && (
        <p style={S.hint}>Pick a test to view and edit its adaptive routing thresholds.</p>
      )}

      {selectedTestId && (
        <>
          {!selectedTest?.is_adaptive && (
            <Card tone="warn" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
              This test is not marked as adaptive. Thresholds are stored but only
              used when <code>is_adaptive</code> is true.
            </Card>
          )}

          <p style={S.hint}>
            Students scoring at or above the threshold on Module 1 route to the
            hard Module 2. Below threshold routes to easy.
          </p>

          <form action={formAction} style={S.form}>
            <input type="hidden" name="practice_test_id" value={selectedTestId} />

            <div style={S.row}>
              <label style={S.field}>
                <span style={S.fieldLabel}>R&W threshold</span>
                <input
                  type="number"
                  name="rw_threshold"
                  min="0"
                  max="50"
                  value={rw}
                  onChange={(e) => setRw(e.target.value)}
                  placeholder="e.g. 15"
                  style={S.input}
                />
              </label>

              <label style={S.field}>
                <span style={S.fieldLabel}>Math threshold</span>
                <input
                  type="number"
                  name="math_threshold"
                  min="0"
                  max="50"
                  value={math}
                  onChange={(e) => setMath(e.target.value)}
                  placeholder="e.g. 14"
                  style={S.input}
                />
              </label>

              <Button type="submit" disabled={pending} size="sm">
                {pending ? 'Saving…' : 'Save thresholds'}
              </Button>
            </div>

            {state?.ok && !pending && <span style={S.ok}>Saved.</span>}
            {state?.ok === false && !pending && <span style={S.err}>{state.error}</span>}
          </form>
        </>
      )}
    </>
  );
}

const S = {
  selectorRow: { display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  fieldLabel: { fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  select: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', background: 'white', minWidth: 260 },
  input: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', width: 120 },
  hint: { fontSize: '0.8rem', color: '#6b7280', marginTop: 0, marginBottom: '0.75rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
