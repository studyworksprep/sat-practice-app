// Per-row delete button on the lesson-pack list. confirm() guard
// before calling the server action so an accidental click can't
// take a pack down. Sits beside the card link (which is the click
// target for opening the builder); the wrapper keeps event handling
// off the surrounding <Link>.

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deletePack } from './actions';
import s from './LessonPacksList.module.css';

export function DeletePackButton({
  packId,
  packName,
}: {
  packId: string;
  packName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `Delete "${packName}"? This removes the pack and its question list. Students who were assigned this pack are not affected.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deletePack(packId);
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={s.deleteBtn}
      aria-label={`Delete ${packName}`}
    >
      {pending ? '…' : 'Delete'}
    </button>
  );
}
