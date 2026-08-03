// Client island for the per-student "Submit on their behalf"
// action on /tutor/assignments/[id]. Mirrors the StartAssignment
// button's shape (useActionState + a thin form wrapper) so the
// row stays small and the action is the single source of truth
// for the override semantics — see actions.js
// submitAssignmentOnBehalf for the server-side details.
//
// Confirmation. The action permanently flips both the session
// and the junction row, so we double-check via the branded
// confirm dialog before submitting. Cancelling the dialog leaves
// the form untouched.

'use client';

import { useActionState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import s from './AssignmentDetail.module.css';

export function SubmitOnBehalfButton({
  assignmentId,
  studentId,
  studentName,
  done,
  total,
  action,
}) {
  const [state, submitAction, isPending] = useActionState(action, null);
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  // Set once the tutor has confirmed, so the re-triggered submit
  // passes straight through instead of prompting again.
  const confirmedRef = useRef(false);

  // Once the action returns a session id, jump straight to the
  // report so the tutor sees the work they just locked in. If
  // there's no session row (e.g. legacy attempts pre-cutover),
  // we stay on the page; revalidatePath has already refreshed
  // the row to show "Completed".
  useEffect(() => {
    if (state?.ok && state?.sessionId) {
      router.push(`/tutor/sessions/${state.sessionId}`);
    }
  }, [state, router]);

  // Confirmation copy keys off attempt counts rather than the
  // presence of a v2 practice_session row, so trainees with
  // pre-cutover attempts (legacy imports) get an accurate
  // summary instead of a misleading "hasn't started yet".
  const totalNum = Number(total ?? 0);
  const doneNum = Number(done ?? 0);
  const confirmOpts =
    doneNum === 0
      ? {
          title: 'Mark it complete anyway?',
          body: `${studentName} hasn't answered any questions on this assignment yet.`,
        }
      : doneNum >= totalNum && totalNum > 0
        ? {
            title: `Mark this assignment complete on ${studentName}'s behalf?`,
            body: `They've answered all ${totalNum} questions and will be able to view the report afterward.`,
          }
        : {
            title: `Mark this assignment complete on ${studentName}'s behalf?`,
            body: `They've answered ${doneNum} of ${totalNum} questions; the rest will show as Unanswered on the report.`,
          };

  function handleSubmit(e) {
    // Second pass after the tutor confirmed — let the submit
    // through to the action.
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    e.preventDefault();
    const form = e.currentTarget;
    void (async () => {
      const ok = await confirm({ ...confirmOpts, confirmLabel: 'Mark complete' });
      if (!ok) return;
      confirmedRef.current = true;
      form.requestSubmit();
    })();
  }

  return (
    <>
    <form action={submitAction} onSubmit={handleSubmit} className={s.submitOnBehalfForm}>
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <input type="hidden" name="student_id" value={studentId} />
      <button
        type="submit"
        disabled={isPending}
        className={s.submitOnBehalfBtn}
        title="Mark this assignment complete on the student's behalf"
      >
        {isPending ? 'Submitting…' : 'Submit for student'}
      </button>
      {state && !state.ok && (
        <span role="alert" className={s.submitOnBehalfError}>
          {state.error}
        </span>
      )}
    </form>
    {confirmDialog}
    </>
  );
}
