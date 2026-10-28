// Error Log toggle + inline panel for the practice runner. Same
// shape as the legacy "Add to Error Log" UI on the v1 practice page,
// re-implemented against the v2-keyed question_error_notes table
// via the stable /api/practice/error-notes endpoint. Unlike a Server
// Action reference, that URL survives deployments during an open session.
//
// Why a popover rather than the existing tutorTools strip pattern:
//  - the strip area is already crowded with ConceptTags
//  - error notes are private to the student and shouldn't share a
//    visual lane with the tutor-facing concept tags
//  - the legacy UX was a popover-style panel below the action row;
//    matching that shape preserves muscle memory
//
// Save flow: explicit "Save note" button — auto-save would be nice
// but adds debounce + race-condition complexity that's not worth it
// for a low-traffic surface. Empty-body submit deletes the row, so
// "clear my old note" doesn't need a separate button.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { NotesIcon } from '@/lib/ui/icons';
import { ToolButton } from '@/lib/ui/ToolButton';
import s from './ErrorLogButton.module.css';

/**
 * @param {object} props
 * @param {string}  props.questionId — questions_v2(id) or act_questions(id);
 *   the save action derives the test type from the id
 * @param {{ body: string, updatedAt: string } | null} [props.initialNote]
 * @param {string}  [props.buttonClassName] — optional override
 * @param {() => void} [props.onSaved] — fires after a successful
 *   save / clear so callers can invalidate any prefetched payload
 *   that captured the pre-save errorNote.
 */
export function ErrorLogButton({
  questionId,
  initialNote = null,
  buttonClassName,
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initialNote);
  // Editor body is mirrored separately from `note` so the textarea
  // stays editable while the save is in flight without flicker.
  const [draft, setDraft] = useState(initialNote?.body ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const panelRef = useRef(null);

  // Reset when the runner moves to a new question. Parent passes a
  // fresh initialNote per render via the load-question payload.
  useEffect(() => {
    setNote(initialNote);
    setDraft(initialNote?.body ?? '');
    setError(null);
    setSavedFlash(false);
  }, [questionId, initialNote]);

  // Click-outside / Escape to close. Standard popover hygiene.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    function onClick(e) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target)) return;
      // Ignore clicks on the trigger itself — its own onClick
      // toggles the panel.
      if (e.target.closest(`[data-error-log-trigger="${questionId}"]`)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, questionId]);

  const isDirty = (draft.trim() || '') !== (note?.body ?? '');
  const hasNote = !!note;
  const triggerLabel = 'Error Log';

  function handleSave() {
    setError(null);
    setSavedFlash(false);
    startTransition(async () => {
      try {
        const response = await fetch('/api/practice/error-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, body: draft }),
        });
        const res = await response.json().catch(() => null);
        if (!response.ok || !res?.ok) {
          setError(typeof res?.error === 'string'
            ? res.error
            : 'Could not save note. Your text is still here; please try again.');
          return;
        }
        const savedNote = res.data?.note ?? null;
        setNote(savedNote);
        setDraft(savedNote?.body ?? '');
        setSavedFlash(true);
        // Invalidate prefetched snapshots so navigation reloads this note.
        onSaved?.();
        setTimeout(() => setSavedFlash(false), 1800);
      } catch {
        // A dropped connection or failed response must not reach the route's
        // error boundary and replace the editor (and the student's draft).
        setError('Could not save note. Your text is still here; please try again.');
      }
    });
  }

  return (
    <>
      <ToolButton
        icon={<NotesIcon size={20} />}
        label={triggerLabel}
        active={open}
        hasContent={hasNote}
        onClick={() => setOpen((v) => !v)}
        title={hasNote ? 'You have an error note on this question' : 'Add an error note'}
        data-error-log-trigger={questionId}
        aria-pressed={open}
        className={buttonClassName}
      />

      {open && (
        <div ref={panelRef} className={s.panel} role="dialog" aria-label="Error log note">
          <div className={s.header}>
            <strong className={s.headerTitle}>Error Log</strong>
            <button
              type="button"
              className={s.headerClose}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className={s.hint}>
            Write what tripped you up — you&apos;ll see this in your
            Error Log on the Review page later.
          </p>
          <textarea
            className={s.textarea}
            aria-label="Error log note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What did you get wrong, and why?"
            rows={4}
            disabled={pending}
          />
          <div className={s.actions}>
            {error && <span className={s.error} role="alert">{error}</span>}
            {savedFlash && !error && <span className={s.saved}>Saved ✓</span>}
            <button
              type="button"
              className={s.saveBtn}
              onClick={handleSave}
              disabled={pending || !isDirty}
            >
              {pending
                ? 'Saving…'
                : draft.trim() === ''
                  ? (hasNote ? 'Clear note' : 'Save note')
                  : 'Save note'}
            </button>
          </div>
          {note?.updatedAt && (
            <div className={s.meta}>
              Last updated {formatDate(note.updatedAt)}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
