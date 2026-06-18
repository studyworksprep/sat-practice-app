// Per-slot file upload affordance for the job status page.
//
// Lets the admin add a file to an already-existing job (most
// useful for the Mathpix HTML uploads, since admins typically
// run Mathpix after the initial job is created and the test
// PDF is in place). When a file is already uploaded for the
// slot, the button label flips to "Replace" so it's obvious
// the action overwrites rather than appending a second copy.
//
// Submits via the addJobFile Server Action; on success calls
// router.refresh() so the file list re-renders with the new
// path + signed download link.

'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import s from '../Imports.module.css';

export function FileUploadButton({
  jobId,
  slot,
  accept,
  hasExisting,
  action,
}) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (hasExisting && !window.confirm(`Replace the existing file with "${file.name}"?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set('job_id', jobId);
    fd.set('slot', slot);
    fd.set('file', file);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        router.refresh();
      } else {
        setError(res?.error ?? 'Upload failed');
      }
    });
  }

  const label = pending ? 'Uploading…' : hasExisting ? 'Replace' : 'Upload';

  return (
    <span className={s.fileUploadWrap}>
      <button
        type="button"
        className={s.fileUploadBtn}
        onClick={() => inputRef.current?.click()}
        disabled={pending}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onPick}
        style={{ display: 'none' }}
      />
      {error && <span className={s.fileUploadError}>{error}</span>}
    </span>
  );
}
