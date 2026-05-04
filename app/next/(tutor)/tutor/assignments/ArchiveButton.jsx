// Archive / Unarchive trigger for an assignment list row. Lives
// outside the row's main <Link> click target so a click here
// doesn't navigate into the assignment detail page.
//
// Wraps a <form action={archiveAssignment}> rather than a custom
// fetch so the action runs through the standard Server Action
// pipeline — same auth, same revalidation, same Sentry capture as
// every other tutor-side mutation.

'use client';

import { useTransition } from 'react';
import { archiveAssignment } from './[id]/actions';
import s from './AssignmentsList.module.css';

/**
 * @param {object} props
 * @param {string} props.assignmentId
 * @param {boolean} props.archived — current state. Drives label.
 */
export function ArchiveButton({ assignmentId, archived }) {
  const [pending, startTransition] = useTransition();

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const formData = new FormData();
    formData.set('assignment_id', assignmentId);
    formData.set('archive', archived ? 'false' : 'true');
    startTransition(async () => {
      await archiveAssignment(null, formData);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={s.archiveBtn}
      title={archived ? 'Move back to active' : 'Archive this assignment'}
      aria-label={archived ? 'Restore assignment' : 'Archive assignment'}
    >
      {pending ? '…' : archived ? 'Restore' : 'Archive'}
    </button>
  );
}
