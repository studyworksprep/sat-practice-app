'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Button to save/load a shared Desmos calculator state for a question.
 * - Managers/admins: can save the current calc state or load a saved one, plus delete.
 * - Teachers: automatically loads any saved state when available.
 * - Icon is gray when no saved state, golden when one exists.
 *
 * Props:
 *   questionId  — the question UUID
 *   getCalcState — () => object | null — returns the current Desmos state
 *   setCalcState — (state) => void — applies a state to the Desmos calculator
 */
export default function DesmosStateButton({ questionId, getCalcState, setCalcState }) {
  const [hasSaved, setHasSaved] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedState, setSavedState] = useState(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  const fetchState = useCallback(async () => {
    if (!questionId) return;
    try {
      const res = await fetch(`/api/desmos-states?questionId=${questionId}`);
      const json = await res.json();
      if (res.ok) {
        setHasSaved(!!json.state);
        setCanSave(json.can_save || false);
        setSavedState(json.state);
        setLoaded(true);
      }
    } catch {
      setLoaded(true);
    }
  }, [questionId]);

  useEffect(() => { fetchState(); }, [fetchState]);

  // Auto-load for teachers (can't save = teacher)
  useEffect(() => {
    if (!loaded || autoLoaded) return;
    if (canSave) return; // manager/admin — don't auto-load
    if (savedState?.state_json && setCalcState) {
      setCalcState(savedState.state_json);
      setAutoLoaded(true);
    }
  }, [loaded, savedState, canSave, setCalcState, autoLoaded]);

  async function handleSave() {
    if (!getCalcState || saving) return;
    const state = getCalcState();
    if (!state) return;
    setSaving(true);
    try {
      const res = await fetch('/api/desmos-states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, stateJson: state }),
      });
      if (res.ok) {
        setHasSaved(true);
        setSavedState({ state_json: state });
        setOpen(false);
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  function handleLoad() {
    if (savedState?.state_json && setCalcState) {
      setCalcState(savedState.state_json);
      setOpen(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete saved calculator state for this question?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/desmos-states', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId }),
      });
      if (res.ok) {
        setHasSaved(false);
        setSavedState(null);
        setOpen(false);
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  // Don't render for students or before loaded
  if (!loaded) return null;
  // Teachers see nothing if no saved state (icon would be gray and useless)
  // Actually, show icon always so teachers know the feature exists
  // but only golden when state exists

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!canSave && hasSaved) {
            // Teacher: just load directly
            handleLoad();
          } else {
            setOpen(v => !v);
          }
        }}
        title={hasSaved ? 'Saved calculator state available' : (canSave ? 'Save calculator state' : 'No saved state')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 3,
          color: hasSaved ? '#c99a2e' : 'var(--muted, #999)',
          transition: 'color 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
        </svg>
      </button>

      {open && canSave && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 600,
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border, #ddd)',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,.18)',
            padding: '10px 12px',
            minWidth: 180,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Calculator State</div>
          <button
            className="btn primary"
            style={{ fontSize: 12, padding: '4px 10px', width: '100%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : hasSaved ? 'Overwrite Saved State' : 'Save Current State'}
          </button>
          {hasSaved && (
            <>
              <button
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 10px', width: '100%' }}
                onClick={handleLoad}
              >
                Load Saved State
              </button>
              <button
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: 'var(--danger)' }}
                onClick={handleDelete}
                disabled={saving}
              >
                Delete Saved State
              </button>
            </>
          )}
          <button
            className="btn secondary"
            style={{ fontSize: 11, padding: '3px 8px', width: '100%' }}
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
