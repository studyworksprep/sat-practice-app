// Client island for the workspace's notes card: the wrap-up note
// form + delete buttons on the author's own notes. useActionState
// keeps pending/error handling serverless-form-shaped, same as
// StudyPlanInteractive.

'use client';

import { useActionState, useRef } from 'react';
import type { ActionResult } from '@/lib/types';
import s from './SessionWorkspace.module.css';

type NoteAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function NoteForm({ studentId, action }: { studentId: string; action: NoteAction }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result?.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className={s.noteForm}>
      <input type="hidden" name="student_id" value={studentId} />
      <textarea
        name="body"
        className={s.noteInput}
        rows={3}
        placeholder="Session wrap-up: what you covered, what's still shaky, what to bring next time…"
        required
        maxLength={8000}
        disabled={pending}
      />
      <div className={s.noteFormFoot}>
        <span className={s.noteHint}>
          Saving stamps this session — the prep card&rsquo;s &ldquo;since last session&rdquo; starts
          here next time.
        </span>
        <button type="submit" className={s.primaryBtn} disabled={pending}>
          {pending ? 'Saving…' : 'Save note'}
        </button>
      </div>
      {state && !state.ok ? <p className={s.formError}>{state.error}</p> : null}
    </form>
  );
}

export function DeleteNoteButton({
  noteId,
  studentId,
  action,
}: {
  noteId: string;
  studentId: string;
  action: NoteAction;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={s.deleteNoteForm}>
      <input type="hidden" name="note_id" value={noteId} />
      <input type="hidden" name="student_id" value={studentId} />
      <button
        type="submit"
        className={s.deleteNoteBtn}
        disabled={pending}
        aria-label="Delete note"
        title={state && !state.ok ? state.error : 'Delete note'}
      >
        {pending ? '…' : '✕'}
      </button>
    </form>
  );
}
