// Branded confirm dialog — the replacement for window.confirm().
//
// The native confirm is a system dialog: it clashes with the app's
// visual language, can't be styled, and on some platforms blocks
// the whole browser. This is a small promise-based drop-in built
// on the native <dialog> element, which gives us focus trapping,
// Escape handling, and a ::backdrop for free.
//
// Usage (call sites read almost like window.confirm):
//
//   const [confirm, confirmDialog] = useConfirm();
//   ...
//   async function handleDelete() {
//     const ok = await confirm({
//       title: 'Delete this note?',
//       body: 'This cannot be undone.',
//       confirmLabel: 'Delete',
//       tone: 'danger',
//     });
//     if (!ok) return;
//     ...
//   }
//   ...
//   return <>{...}{confirmDialog}</>;   // render the node anywhere
//
// Focus lands on Cancel first (safe default for destructive
// flows); Escape and backdrop-click both resolve false.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import s from './ConfirmDialog.module.css';

export interface ConfirmOptions {
  /** Short question, e.g. "Delete this note?" */
  title: string;
  /** Optional consequence sentence under the title. */
  body?: string;
  /** Confirm button label — use the verb ("Delete", "Save & exit"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' renders the confirm button in the amber danger variant. */
  tone?: 'default' | 'danger';
}

export function useConfirm(): [
  (opts: ConfirmOptions) => Promise<boolean>,
  ReactNode,
] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second confirm while one is open cancels the first —
        // shouldn't happen in practice, but never leave a promise
        // dangling.
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setOpts(next);
      }),
    [],
  );

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpts(null);
  }, []);

  const node = opts ? <ConfirmDialogPanel opts={opts} onSettle={settle} /> : null;
  return [confirm, node];
}

function ConfirmDialogPanel({
  opts,
  onSettle,
}: {
  opts: ConfirmOptions;
  onSettle: (value: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // The panel only exists while a confirm is pending, so opening
  // is unconditional on mount. Unmounting tears the dialog down;
  // no explicit close() needed.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="sw-confirm-title"
      // Escape fires 'cancel' — route it through the same settle
      // path instead of letting the dialog close itself, so the
      // promise always resolves.
      onCancel={(e) => {
        e.preventDefault();
        onSettle(false);
      }}
      // Clicks on ::backdrop target the <dialog> element itself;
      // the inner wrapper stops propagation for real content.
      onClick={(e) => {
        if (e.target === e.currentTarget) onSettle(false);
      }}
    >
      <div className={s.inner}>
        <h2 id="sw-confirm-title" className={s.title}>{opts.title}</h2>
        {opts.body && <p className={s.body}>{opts.body}</p>}
        <div className={s.actions}>
          <Button variant="secondary" onClick={() => onSettle(false)}>
            {opts.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={opts.tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => onSettle(true)}
          >
            {opts.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
