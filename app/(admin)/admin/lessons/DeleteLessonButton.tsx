// Per-row delete for the lessons index. Confirms in the browser, then
// posts to the existing deleteLesson server action (typed-confirm token
// supplied here) which hard-deletes the lesson and its blocks/progress
// and redirects back to the index.

'use client';

import { useActionState } from 'react';
import { Button } from '@/lib/ui/Button';
import { deleteLesson } from './[lessonId]/actions';

export function DeleteLessonButton({ lessonId, title }: { lessonId: string; title: string }) {
  const [state, formAction, pending] = useActionState(deleteLesson, null);
  const err = state as { ok?: boolean; error?: string } | null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Delete "${title || 'this lesson'}"? This permanently removes its blocks and any student progress. This cannot be undone.`,
        );
        if (!ok) e.preventDefault();
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <input type="hidden" name="lesson_id" value={lessonId} />
      <input type="hidden" name="confirm" value="DELETE" />
      <Button type="submit" variant="remove" size="sm" disabled={pending}>
        {pending ? 'Deleting…' : 'Delete'}
      </Button>
      {err?.ok === false ? (
        <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>{err.error}</span>
      ) : null}
    </form>
  );
}
