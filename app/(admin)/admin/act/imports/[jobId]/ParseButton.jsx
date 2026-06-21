// Per-section parse trigger. The status page renders one of these
// inside each ParseTile and on the scale tile; the action prop is
// the matching Server Action from ./actions.ts. We confirm before
// firing because each parse round-trips Claude (paid + slow) and
// we don't want a stray double-click to enqueue two parses.
//
// Pending state disables the button + swaps in a spinner-ish
// label. On result, we surface the error inline (no toast system
// in the admin tree yet) and call router.refresh() so the
// updated drafts count / log entry / parser status render
// immediately.

'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from '../Imports.module.css';

export function ParseButton({
  jobId,
  label,
  action,
  disabled = false,
  variant = 'secondary',
  confirmMessage,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function onClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    const fd = new FormData();
    fd.set('job_id', jobId);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        router.refresh();
      } else {
        setError(res?.error ?? 'Parse failed');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        className={variant === 'primary' ? s.btnPrimary : s.btnSecondary}
      >
        {pending ? 'Parsing…' : label}
      </button>
      {error && <div className={s.parseError}>{error}</div>}
    </>
  );
}
