// Small client island used on the Review + History pages to
// offer Resume / Submit / Abandon for an in-progress practice
// session. Server Actions arrive as props from the Server
// Component so this island doesn't have to import them itself
// (keeps it reusable across surfaces).

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import s from './Review.module.css';

export function SessionLifecycleButtons({
  sessionId,
  resumeHref,
  submitAction,
  abandonAction,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState(null);

  function doSubmit() {
    setErr(null);
    const ok = window.confirm(
      'Submit this set? Any unanswered questions will be marked as skipped.',
    );
    if (!ok) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('sessionId', sessionId);
      const res = await submitAction(null, fd);
      if (!res?.ok) {
        setErr(res?.error ?? 'Could not submit');
        return;
      }
      router.push(`/practice/review/${sessionId}`);
    });
  }

  function doAbandon() {
    setErr(null);
    const ok = window.confirm(
      'Abandon this set? No report will be created and the session will disappear from your lists.',
    );
    if (!ok) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('sessionId', sessionId);
      const res = await abandonAction(null, fd);
      if (!res?.ok) {
        setErr(res?.error ?? 'Could not abandon');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={s.lifecycleGroup}>
      {err && <span className={s.lifecycleErr}>{err}</span>}
      <Link href={resumeHref} className={s.resumeBtn}>
        Resume →
      </Link>
      <button
        type="button"
        onClick={doSubmit}
        disabled={pending}
        className={s.lifecycleSubmit}
      >
        Submit
      </button>
      <button
        type="button"
        onClick={doAbandon}
        disabled={pending}
        className={s.lifecycleAbandon}
      >
        Abandon
      </button>
    </div>
  );
}
