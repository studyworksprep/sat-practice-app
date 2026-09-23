// The one switch a non-technical admin needs: do study plans walk the
// syllabi on this page, or the simple default? Flips the
// `unit_syllabus` feature flag through a Server Action; the confirm
// states what changes for students.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { setUnitSyllabusFlag } from './actions';
import f from '../../forms.module.css';

export function SyllabusFlagSwitch({ on, authored, total }: { on: boolean; authored: number; total: number }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    const ok = await confirm({
      title: next ? 'Use these syllabi in study plans?' : 'Stop using these syllabi?',
      body: next
        ? `New and regenerated plans will walk each unit's syllabus. ${authored} of ${total} units are authored; the rest use the default (one lesson, then a drill) until you build them. Existing plan tasks are unchanged.`
        : 'New and regenerated plans go back to the simple default for every unit (one lesson, then a drill). Your syllabi are kept and can be switched on again.',
      confirmLabel: next ? 'Turn on' : 'Turn off',
      tone: next ? undefined : 'danger',
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const res = await setUnitSyllabusFlag({ on: next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section style={S.box} aria-live="polite">
      <div>
        <div style={{ fontWeight: 600 }}>
          Study plans use these syllabi: <span style={on ? S.on : S.off}>{on ? 'On' : 'Off'}</span>
        </div>
        <div className={f.muted} style={{ marginTop: 2 }}>
          {on
            ? 'New and regenerated plans walk each unit’s syllabus. Units you haven’t built yet use the default.'
            : 'Plans currently use the simple default for every unit. Turn this on once your syllabi are ready.'}
        </div>
        {error && <p className={f.err} style={{ margin: '4px 0 0' }}>{error}</p>}
      </div>
      <Button size="sm" variant={on ? 'secondary' : 'primary'} onClick={toggle} disabled={pending}>
        {pending ? 'Saving…' : on ? 'Turn off' : 'Turn on'}
      </Button>
      {confirmDialog}
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  box: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    marginBottom: '1rem',
  },
  on: { padding: '1px 8px', borderRadius: 999, fontSize: '0.75rem', background: '#dcfce7', color: '#166534' },
  off: { padding: '1px 8px', borderRadius: 999, fontSize: '0.75rem', background: '#f3f4f6', color: '#374151' },
};
