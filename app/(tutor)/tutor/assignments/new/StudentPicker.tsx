'use client';

// Step 2: who the assignment is for. Only the people already added
// are shown (none when the tutor arrives from their dashboard; the one
// named by ?student= when they arrive from a student page). "Add
// student" opens a search over the roster — a combobox, so a tutor
// with sixty students types a few letters instead of scanning chips.
//
// Each added person submits as a hidden student_id field, the name the
// Server Action already reads.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './NewAssignmentInteractive.module.css';

export type PersonOption = { id: string; name: string; email: string | null };

const MAX_RESULTS = 8;

export function StudentPicker({
  people,
  selected,
  onAdd,
  onAddAll,
  onRemove,
  noun,
  emptyText,
}: {
  people: PersonOption[];
  /** Ids in the order they were added. */
  selected: string[];
  onAdd: (id: string) => void;
  onAddAll: () => void;
  onRemove: (id: string) => void;
  /** "student" or "trainee". */
  noun: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when the search closes from the keyboard; the Add button takes
  // focus as it mounts again.
  const focusAddOnMount = useRef(false);
  const listId = useId();

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const added = selected.map((id) => byId.get(id)).filter((p): p is PersonOption => !!p);
  const remaining = people.length - added.length;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(selected);
    return people
      .filter((p) => !chosen.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [people, selected, query]);

  // Close when focus or a click lands outside the picker.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery('');
    focusAddOnMount.current = returnFocus;
  };

  const choose = (p: PersonOption) => {
    onAdd(p.id);
    setQuery('');
    setActive(0);
    // Stay open so several people can be added in a row, unless
    // that was the last one.
    if (remaining <= 1) close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Never submit the assignment form from the search box.
      e.preventDefault();
      const p = matches[active];
      if (p) choose(p);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  if (people.length === 0) return <p className={styles.empty}>{emptyText}</p>;

  const activeId = matches[active] ? `${listId}-${matches[active].id}` : undefined;

  return (
    <div className={styles.peoplePicker} ref={wrapRef}>
      {added.length === 0 ? (
        <p className={styles.peopleNone}>No {noun}s added yet.</p>
      ) : (
        <ul className={styles.peopleRow} aria-label={`Added ${noun}s`}>
          {added.map((p) => (
            <li key={p.id} className={styles.personAdded} title={p.email ?? undefined}>
              <input type="hidden" name="student_id" value={p.id} />
              <span>{p.name}</span>
              <button
                type="button"
                className={styles.personRemove}
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && !open && (
        <button
          ref={(el) => {
            if (el && focusAddOnMount.current) {
              focusAddOnMount.current = false;
              el.focus();
            }
          }}
          type="button"
          className={styles.addPersonBtn}
          onClick={() => { setOpen(true); setActive(0); }}
        >
          + Add {noun}
        </button>
      )}

      {open && (
        <div className={styles.personSearch}>
          <label className={styles.srOnly} htmlFor={`${listId}-input`}>Search {noun}s</label>
          <input
            ref={inputRef}
            id={`${listId}-input`}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            placeholder={`Search your ${noun}s by name or email…`}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            className={styles.input}
          />
          <ul id={listId} role="listbox" aria-label={`${noun[0].toUpperCase()}${noun.slice(1)}s`} className={styles.personResults}>
            {matches.length === 0 ? (
              <li className={styles.personNoMatch} role="presentation">No {noun}s match “{query.trim()}”.</li>
            ) : (
              matches.map((p, i) => (
                <li
                  key={p.id}
                  id={`${listId}-${p.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? `${styles.personOption} ${styles.personOptionActive}` : styles.personOption}
                  // mousedown keeps focus in the search box.
                  onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className={styles.personOptionName}>{p.name}</span>
                  {p.email && <span className={styles.personOptionEmail}>{p.email}</span>}
                </li>
              ))
            )}
          </ul>
          <div className={styles.personSearchFoot}>
            {/* Only with an empty search, so it can't read as "add these matches". */}
            {query.trim() === '' ? (
              <button type="button" className={styles.linkBtn} onClick={() => { onAddAll(); close(true); }}>
                Add all {remaining} {noun}{remaining === 1 ? '' : 's'}
              </button>
            ) : <span />}
            <button type="button" className={styles.linkBtn} onClick={() => close(true)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
