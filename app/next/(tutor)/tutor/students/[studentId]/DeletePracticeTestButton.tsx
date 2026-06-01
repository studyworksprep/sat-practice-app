// Per-row delete control on the tutor's "Recent practice tests"
// list. A tutor uses this to clear out a broken, erroneous, or
// accidentally-uploaded test for the student they're viewing.
//
// confirm() guards an accidental click — deletion is permanent and
// cascades to the per-question records. Sits beside the row's <Link>
// (the click target for opening results); rendering it as a sibling
// keeps its click handling off the surrounding link.

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteStudentPracticeTest } from './actions';
import s from './StudentDetail.module.css';

export function DeletePracticeTestButton({
  studentId,
  attemptId,
  testName,
}: {
  studentId: string;
  attemptId: string;
  testName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `Delete "${testName}" for this student? This permanently removes the test attempt and all of its answers. This can't be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('student_id', studentId);
      fd.set('attempt_id', attemptId);
      const res = await deleteStudentPracticeTest(null, fd);
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
      aria-label={`Delete ${testName}`}
    >
      {pending ? '…' : 'Delete'}
    </button>
  );
}
