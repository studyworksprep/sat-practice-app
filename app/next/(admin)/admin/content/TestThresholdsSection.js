'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { updateTestThresholds } from './actions';
import s from '../../forms.module.css';

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
      <div className={s.row} style={{ marginBottom: 'var(--s3)' }}>
        <label className={s.label}>
          <span className={s.labelText}>Practice test</span>
          <select
            value={selectedTestId ?? ''}
            onChange={(e) => selectTest(e.target.value)}
            disabled={isLoading}
            className={s.select}
            style={{ minWidth: 260 }}
          >
            <option value="">Select a test…</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>{t.name ?? t.code}</option>
            ))}
          </select>
        </label>
        {isLoading && <span className={s.muted}>Loading…</span>}
      </div>

      {!selectedTestId && (
        <p className={s.formHint}>Pick a test to view and edit its adaptive routing thresholds.</p>
      )}

      {selectedTestId && (
        <>
          {!selectedTest?.is_adaptive && (
            <Card tone="warn" style={{ padding: '12px 16px', marginBottom: 'var(--s3)', fontSize: 13 }}>
              This test is not marked as adaptive. Thresholds are stored but only
              used when <code>is_adaptive</code> is true.
            </Card>
          )}

          <p className={s.formHint}>
            Students scoring at or above the threshold on Module 1 route to the
            hard Module 2. Below threshold routes to easy.
          </p>

          <form action={formAction} className={s.form}>
            <input type="hidden" name="practice_test_id" value={selectedTestId} />

            <div className={s.row}>
              <label className={s.label}>
                <span className={s.labelText}>R&amp;W threshold</span>
                <input
                  type="number"
                  name="rw_threshold"
                  min="0"
                  max="50"
                  value={rw}
                  onChange={(e) => setRw(e.target.value)}
                  placeholder="e.g. 15"
                  className={s.input}
                  style={{ width: 120 }}
                />
              </label>

              <label className={s.label}>
                <span className={s.labelText}>Math threshold</span>
                <input
                  type="number"
                  name="math_threshold"
                  min="0"
                  max="50"
                  value={math}
                  onChange={(e) => setMath(e.target.value)}
                  placeholder="e.g. 14"
                  className={s.input}
                  style={{ width: 120 }}
                />
              </label>

              <Button type="submit" disabled={pending} size="sm">
                {pending ? 'Saving…' : 'Save thresholds'}
              </Button>
            </div>

            {state?.ok && !pending && <span className={s.ok}>Saved.</span>}
            {state?.ok === false && !pending && (
              <span className={s.err}>{state.error}</span>
            )}
          </form>
        </>
      )}
    </>
  );
}
