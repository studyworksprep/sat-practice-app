// Reassign panel (§4.3) — the detail-page island for issuing a
// COPY of this assignment to other students. Mirrors
// AddMembersPicker's closed-by-default expander (and borrows its
// stylesheet), but the verbs differ: adding a member shares this
// row; reassigning mints a new assignment with its own due date
// and its own report. The action redirects to the new copy on
// success, so there's no success state to render here.

'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import type { ActionResult } from '@/lib/types';
import s from './AddMembersPicker.module.css';

interface Person {
  id: string;
  name: string;
  email?: string | null;
  role: 'student' | 'trainee';
}

type ReassignAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult | null>;

export function ReassignPanel({
  assignmentId,
  eligible,
  reassignAction,
}: {
  assignmentId: string;
  eligible: Person[];
  reassignAction: ReassignAction;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [state, submitAction, isPending] = useActionState<ActionResult | null, FormData>(
    reassignAction,
    null,
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return eligible;
    return eligible.filter(
      (p) =>
        p.name?.toLowerCase().includes(needle) ||
        p.email?.toLowerCase().includes(needle),
    );
  }, [eligible, search]);

  const togglePicked = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!open) {
    return (
      <div className={s.collapsedRow}>
        <button
          type="button"
          className={s.openBtn}
          onClick={() => {
            setOpen(true);
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
          disabled={eligible.length === 0}
        >
          ⧉ Reassign a copy…
        </button>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.panelHeader}>
        <div className={s.panelTitle}>Reassign a copy</div>
        <button
          type="button"
          className={s.closeBtn}
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <p className={s.emptyHint}>
        Creates a new assignment with the same content for the students you pick —
        separate due date, separate report. You&rsquo;ll land on the copy.
      </p>

      <input
        ref={searchRef}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className={s.search}
      />

      {filtered.length === 0 ? (
        <div className={s.emptyList}>No matches for that search.</div>
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
          <input key={id} type="hidden" name="student_id" value={id} />
        ))}
        <label className={s.pickedCount} htmlFor="reassign_due_date">
          New due date (optional)
        </label>
        <input
          id="reassign_due_date"
          name="due_date"
          type="date"
          className={s.search}
          style={{ maxWidth: 180 }}
        />
        <div className={s.actionsRight}>
          {state && !state.ok && state.error && (
            <span className={s.errorMsg} role="alert">
              {state.error}
            </span>
          )}
          <button
            type="submit"
            disabled={picked.size === 0 || isPending}
            className={s.addBtn}
          >
            {isPending ? 'Copying…' : `Reassign to ${picked.size || ''}`}
          </button>
        </div>
      </form>
    </div>
  );
}
