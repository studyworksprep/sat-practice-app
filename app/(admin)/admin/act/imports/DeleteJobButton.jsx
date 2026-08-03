// Listing-row delete affordance. Confirms before firing the
// Server Action so the admin can't drop an import job on a stray
// click. Pending state disables the row to discourage further
// interaction while the cascade-delete + storage cleanup runs.

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import s from './Imports.module.css';

export function DeleteJobButton({ jobId, sourceTest, deleteAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  async function onClick() {
    const ok = await confirm({
      title: `Delete the import job for "${sourceTest}"?`,
      body: 'This removes uploaded files and drafts. Approved questions on act_questions stay.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set('job_id', jobId);
    startTransition(async () => {
      const res = await deleteAction(null, fd);
      if (res?.ok) {
        router.refresh();
      } else {
        window.alert(res?.error ?? 'Delete failed');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={s.deleteBtn}
        title="Delete this import job"
        aria-label="Delete import job"
      >
        {pending ? '…' : '✕'}
      </button>
      {confirmDialog}
    </>
  );
}
