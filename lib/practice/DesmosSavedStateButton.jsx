// New-tree port of the legacy components/DesmosStateButton.js. The
// big difference: data flows in from props (Server Component
// pre-loads `initialSavedState` and `canSave`) instead of useEffect+
// fetch on mount, and Save / Delete go through the
// lib/practice/desmos-actions.js Server Actions instead of bare
// fetch('/api/desmos-states', { method: ... }) calls.
//
// UX parity with legacy:
//   - Lightbulb icon, gold when a saved state exists, gray otherwise.
//   - Teachers (canSave=false) clicking the icon when a state exists
//     load it directly (no popover) — they have no other action.
//   - Managers / admins get a popover with Save / Load / Delete.
//
// Calc-instance access: the parent owns a ref to the live Desmos
// instance (via DesmosPanel's `onCalcReady` prop) and passes it
// here as `calcRef`. Save reads getState() from it; Load writes
// setState() back. The button itself owns no Desmos lifecycle.
//
// Optimistic updates: hasSaved flips immediately on a successful
// save, so the icon turns gold without waiting for the action's
// revalidation round-trip. If the action fails the button reverts
// and surfaces the error inline.

'use client';

import { useState, useTransition } from 'react';
import { saveDesmosState, deleteDesmosState } from './desmos-actions';
import s from './DesmosSavedStateButton.module.css';

/**
 * @param {object} props
 * @param {string} props.questionId
 * @param {object|null} props.initialSavedState — server-loaded state_json
 * @param {boolean} props.canSave — true for manager/admin, false otherwise
 * @param {{ current: any|null }} props.calcRef — ref to the live Desmos
 *   instance, populated by DesmosPanel via onCalcReady. May be null
 *   if the calculator panel is closed/not yet mounted.
 */
export function DesmosSavedStateButton({
  questionId,
  initialSavedState = null,
  canSave = false,
  calcRef,
}) {
  const [savedState, setSavedState] = useState(initialSavedState);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const hasSaved = savedState != null;

  function getCalc() {
    return calcRef?.current ?? null;
  }

  function handleSave() {
    setError(null);
    const calc = getCalc();
    if (!calc) {
      setError('Open the calculator first.');
      return;
    }
    let stateJson;
    try { stateJson = calc.getState(); }
    catch { setError('Could not read calculator state.'); return; }
    if (!stateJson) { setError('Calculator state is empty.'); return; }

    startTransition(async () => {
      const res = await saveDesmosState({ questionId, stateJson });
      if (!res?.ok) {
        setError(res?.error ?? 'Save failed.');
        return;
      }
      setSavedState(stateJson);
      setOpen(false);
    });
  }

  function handleLoad() {
    setError(null);
    const calc = getCalc();
    if (!calc) { setError('Open the calculator first.'); return; }
    if (!savedState) return;
    try { calc.setState(savedState, { allowUndo: false }); }
    catch { setError('Could not apply saved state.'); return; }
    setOpen(false);
  }

  function handleDelete() {
    setError(null);
    if (!hasSaved) return;
    if (!window.confirm('Delete saved calculator state for this question?')) return;
    startTransition(async () => {
      const res = await deleteDesmosState({ questionId });
      if (!res?.ok) {
        setError(res?.error ?? 'Delete failed.');
        return;
      }
      setSavedState(null);
      setOpen(false);
    });
  }

  function onIconClick(e) {
    e.stopPropagation();
    setError(null);
    // Teachers: no popover, clicking just loads the saved state.
    if (!canSave && hasSaved) {
      handleLoad();
      return;
    }
    if (!canSave) return; // teacher with no saved state: button is decorative
    setOpen((v) => !v);
  }

  // Hide entirely for non-savers when there's nothing to load.
  if (!canSave && !hasSaved) return null;

  const iconCls = [s.iconBtn, hasSaved ? s.iconBtnSaved : null]
    .filter(Boolean).join(' ');

  return (
    <div className={s.wrap}>
      <button
        type="button"
        className={iconCls}
        onClick={onIconClick}
        title={
          hasSaved
            ? (canSave ? 'Manage saved Desmos solution' : 'Load saved Desmos solution')
            : 'Save Desmos solution'
        }
        aria-label={hasSaved ? 'Saved Desmos solution' : 'No saved Desmos solution'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z" />
        </svg>
      </button>

      {open && canSave && (
        <div
          className={s.popover}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Desmos solution"
        >
          <div className={s.popoverTitle}>Desmos solution</div>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={handleSave}
            disabled={pending}
          >
            {pending ? 'Saving…' : (hasSaved ? 'Overwrite solution' : 'Save current state')}
          </button>
          {hasSaved && (
            <>
              <button
                type="button"
                className={s.btnSecondary}
                onClick={handleLoad}
                disabled={pending}
              >
                Load solution
              </button>
              <button
                type="button"
                className={s.btnDanger}
                onClick={handleDelete}
                disabled={pending}
              >
                Delete solution
              </button>
            </>
          )}
          <button
            type="button"
            className={s.btnGhost}
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </button>
          {error && <div className={s.error}>{error}</div>}
        </div>
      )}
      {!open && error && <div className={s.errorInline}>{error}</div>}
    </div>
  );
}
