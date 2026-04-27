// Client island for the assignment detail page that lets a
// tutor add more students (or trainees, for managers) to an
// existing assignment so they get the same question set without
// having to recreate it.
//
// Closed-by-default expander to keep the page calm. Click
// "+ Add students" to reveal a search box + scrollable list of
// every eligible person the caller can see who isn't already
// enrolled, each with a checkbox. "Add N selected" submits via
// the addAssignmentMembers Server Action.
//
// Eligible pool comes from the page (Server Component) — RLS on
// student_practice_stats + the manager_teacher_assignments fan-
// out ensures the caller only sees people they're allowed to.

'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import s from './AddMembersPicker.module.css';

/**
 * @param {{
 *   assignmentId: string,
 *   eligible: Array<{ id: string, name: string, email?: string|null, role: 'student'|'trainee' }>,
 *   addAction: (prev: any, formData: FormData) => Promise<any>,
 * }} props
 */
export function AddMembersPicker({ assignmentId, eligible, addAction }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [state, submitAction, isPending] = useActionState(addAction, null);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    if (!eligible) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return eligible;
    return eligible.filter((p) => {
      return (
        p.name?.toLowerCase().includes(needle)
        || p.email?.toLowerCase().includes(needle)
      );
    });
  }, [eligible, search]);

  function togglePicked(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleOpen() {
    setOpen(true);
    // Focus the search input on the next tick so the field is
    // ready before the user starts typing.
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  // After a successful add, collapse the picker and clear the
  // selection. The page revalidates server-side via the action so
  // the enrolled list refreshes on its own.
  const justAdded = state?.ok && state?.data?.added > 0;
  if (justAdded && picked.size > 0) {
    // Defer the state reset to render-time-derived effect avoidance.
    // setPicked is safe because it's a no-op when the set is empty.
    queueMicrotask(() => {
      setPicked(new Set());
      setSearch('');
    });
  }

  if (!open) {
    return (
      <div className={s.collapsedRow}>
        <button
          type="button"
          className={s.openBtn}
          onClick={handleOpen}
          disabled={eligible.length === 0}
        >
          + Add students or trainees
        </button>
        {eligible.length === 0 && (
          <span className={s.emptyHint}>
            Everyone you can see is already enrolled.
          </span>
        )}
        {state?.ok === true && state?.data?.added > 0 && (
          <span className={s.successHint} role="status">
            Added {state.data.added} {state.data.added === 1 ? 'person' : 'people'}.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.panelHeader}>
        <div className={s.panelTitle}>Add to assignment</div>
        <button
          type="button"
          className={s.closeBtn}
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <input
        ref={searchRef}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className={s.search}
      />

      {filtered.length === 0 ? (
        <div className={s.emptyList}>
          {eligible.length === 0
            ? 'Everyone you can see is already enrolled in this assignment.'
            : 'No matches for that search.'}
        </div>
      ) : (
        <ul className={s.list} role="listbox" aria-multiselectable="true">
          {filtered.map((p) => {
            const isPicked = picked.has(p.id);
            return (
              <li key={p.id}>
                <label className={`${s.row} ${isPicked ? s.rowPicked : ''}`}>
                  <input
                    type="checkbox"
                    checked={isPicked}
                    onChange={() => togglePicked(p.id)}
                    className={s.checkbox}
                  />
                  <span className={s.rowMain}>
                    <span className={s.rowName}>{p.name}</span>
                    {p.email && <span className={s.rowEmail}>{p.email}</span>}
                  </span>
                  <span className={p.role === 'trainee' ? s.chipTrainee : s.chipStudent}>
                    {p.role === 'trainee' ? 'Trainee' : 'Student'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <form action={submitAction} className={s.actions}>
        <input type="hidden" name="assignment_id" value={assignmentId} />
        {Array.from(picked).map((id) => (
          <input key={id} type="hidden" name="user_id" value={id} />
        ))}
        <span className={s.pickedCount}>
          {picked.size === 0
            ? 'Pick people to add'
            : `${picked.size} selected`}
        </span>
        <div className={s.actionsRight}>
          {state?.ok === false && state.error && (
            <span className={s.errorMsg} role="alert">
              {state.error}
            </span>
          )}
          <button
            type="submit"
            disabled={picked.size === 0 || isPending}
            className={s.addBtn}
          >
            {isPending ? 'Adding…' : `Add ${picked.size || ''}`}
          </button>
        </div>
      </form>
    </div>
  );
}
