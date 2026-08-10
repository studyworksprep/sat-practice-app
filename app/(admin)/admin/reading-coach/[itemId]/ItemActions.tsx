// Publish / archive controls for one Reading Coach item.
//
// Client component so publish-validation failures (missing rubric
// fields, pending rights, broken answer sets) surface inline instead
// of dying silently in a plain RSC form.

'use client';

import { useActionState } from 'react';
import { Button } from '@/lib/ui/Button';
import {
  archiveReadingCoachItemAction,
  publishReadingCoachVersionAction,
} from '../actions';
import f from '../../../forms.module.css';

export function ItemActions({
  itemId,
  itemStatus,
  draftVersionId,
  draftVersionNumber,
}: {
  itemId: string;
  itemStatus: string;
  draftVersionId: string | null;
  draftVersionNumber: number | null;
}) {
  const [publishResult, publishAction, publishPending] = useActionState(
    publishReadingCoachVersionAction,
    null,
  );
  const [archiveResult, archiveAction, archivePending] = useActionState(
    archiveReadingCoachItemAction,
    null,
  );

  return (
    <div>
      <div className={f.actions}>
        {draftVersionId && (
          <form action={publishAction}>
            <input type="hidden" name="version_id" value={draftVersionId} />
            <Button type="submit" disabled={publishPending}>
              {publishPending
                ? 'Publishing…'
                : `Publish v${draftVersionNumber}`}
            </Button>
          </form>
        )}
        {itemStatus !== 'archived' && (
          <form action={archiveAction}>
            <input type="hidden" name="item_id" value={itemId} />
            <Button type="submit" disabled={archivePending}>
              {archivePending ? 'Archiving…' : 'Archive item'}
            </Button>
          </form>
        )}
      </div>
      {publishResult && publishResult.ok === false && (
        <p className={f.err}>{String(publishResult.error)}</p>
      )}
      {archiveResult && archiveResult.ok === false && (
        <p className={f.err}>{String(archiveResult.error)}</p>
      )}
    </div>
  );
}
