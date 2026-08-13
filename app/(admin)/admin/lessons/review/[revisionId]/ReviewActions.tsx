'use client';

import { useActionState } from 'react';
import { Button } from '@/lib/ui/Button';
import f from '@/app/(admin)/forms.module.css';

type ActionState = { ok: boolean; error?: string } | null;
type ReviewAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ReviewActions({
  revisionId,
  publishAction,
  requestChangesAction,
  rejectAction,
  sourceChanged = false,
}: {
  revisionId: string;
  publishAction: ReviewAction;
  requestChangesAction: ReviewAction;
  rejectAction: ReviewAction;
  sourceChanged?: boolean;
}) {
  const [publishState, publishForm, publishing] = useActionState(publishAction, null);
  const [changesState, changesForm, requesting] = useActionState(requestChangesAction, null);
  const [rejectState, rejectForm, rejecting] = useActionState(rejectAction, null);
  const error = publishState?.error || changesState?.error || rejectState?.error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form action={publishForm} className={f.form}>
        <input type="hidden" name="revision_id" value={revisionId} />
        {sourceChanged && <input type="hidden" name="force" value="1" />}
        <label className={f.label}>
          <span className={f.labelText}>Approval note (optional)</span>
          <textarea name="review_note" className={f.input} rows={2} placeholder="What was especially strong or what changed during review?" />
        </label>
        <div><Button type="submit" disabled={publishing}>{publishing ? 'Publishing…' : sourceChanged ? 'Approve and replace newer source' : 'Approve and publish'}</Button></div>
      </form>
      <form action={changesForm} className={f.form}>
        <input type="hidden" name="revision_id" value={revisionId} />
        <label className={f.label}>
          <span className={f.labelText}>Requested changes</span>
          <textarea name="review_note" className={f.input} rows={3} required minLength={5} placeholder="Give the contributor clear, actionable feedback." />
        </label>
        <div><Button type="submit" variant="secondary" disabled={requesting}>{requesting ? 'Sending…' : 'Request changes'}</Button></div>
      </form>
      <form action={rejectForm} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input type="hidden" name="revision_id" value={revisionId} />
        <label className={f.label} style={{ flex: 1 }}>
          <span className={f.labelText}>Rejection reason</span>
          <input name="review_note" className={f.input} required minLength={5} />
        </label>
        <Button type="submit" variant="remove" disabled={rejecting}>{rejecting ? 'Rejecting…' : 'Reject'}</Button>
      </form>
      {error && <div className={f.err} role="alert">{error}</div>}
    </div>
  );
}
