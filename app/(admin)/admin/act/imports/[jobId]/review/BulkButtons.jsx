// Bulk action client islands for the review page.
//
//   BulkApproveButton — sits at the top-right of each section,
//     fires bulkApprove(jobId, section). Confirms because each
//     run can promote dozens of drafts at once and the undo is
//     per-draft.
//
//   FinalizeJobButton — surfaces when every draft is approved
//     or rejected. Flips the job's top-level status to
//     'completed' and the listing row's status pill follows.

'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './Review.module.css';

export function BulkApproveButton({ jobId, section, action, disabled }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  const [skippedDetails, setSkippedDetails] = useState([]);

  function onClick() {
    if (!window.confirm(
      `Approve every pending ${section} draft? Skipped drafts (no correct answer, no category, etc.) will stay pending so you can fix them.`,
    )) return;
    setMessage(null);
    setSkippedDetails([]);
    const fd = new FormData();
    fd.set('job_id', jobId);
    fd.set('section', section);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        const { approved = 0, skipped = 0, skippedDetails: details = [] } = res.data ?? {};
        setMessage(`Approved ${approved}${skipped ? ` · skipped ${skipped}` : ''}.`);
        // Surface the first batch of skip reasons inline so the
        // admin can act on them without digging into network /
        // server logs. The action caps the array at 10 already.
        setSkippedDetails(Array.isArray(details) ? details : []);
        router.refresh();
      } else {
        setMessage(res?.error ?? 'Bulk approve failed');
      }
    });
  }

  return (
    <div className={s.bulkWrap}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        className={s.btnSecondary}
      >
        {pending ? 'Approving…' : 'Approve all pending'}
      </button>
      {message && <div className={s.bulkMessage}>{message}</div>}
      {skippedDetails.length > 0 && (
        <ul className={s.skippedList}>
          {skippedDetails.map((d, i) => (
            <li key={i}>
              <strong>Q{d.ordinal}</strong> ({d.section}): {d.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FinalizeJobButton({ jobId, action }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function onClick() {
    if (!window.confirm('Mark this import job completed? You can re-open it later by rejecting an approved draft.')) return;
    setError(null);
    const fd = new FormData();
    fd.set('job_id', jobId);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        router.refresh();
      } else {
        setError(res?.error ?? 'Finalize failed');
      }
    });
  }

  return (
    <div className={s.finalizeWrap}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={s.btnPrimary}
      >
        {pending ? 'Finalizing…' : 'Finalize job →'}
      </button>
      {error && <div className={s.bulkMessage}>{error}</div>}
    </div>
  );
}
