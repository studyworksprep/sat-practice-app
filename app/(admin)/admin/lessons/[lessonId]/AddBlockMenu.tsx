// "Add block" inserter that lives between cards on the canvas.
//
// Collapsed it's a thin "+ Add block" affordance; clicking it opens a
// small menu of the five creatable block types (see block-meta.ts).
// Choosing one calls onPick(type) and the parent inserts a starter
// block at this slot's index.

'use client';

import { useEffect, useRef, useState } from 'react';
import { BLOCK_META, CREATABLE_BLOCK_TYPES, type LessonBlockType } from './block-meta';

export function AddBlockMenu({
  onPick,
  label = '+ Add block',
  disableCompletion = false,
}: {
  onPick: (type: LessonBlockType) => void;
  label?: string;
  disableCompletion?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={S.root}>
      <div style={S.rule} aria-hidden />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...S.trigger, ...(open ? S.triggerOpen : null) }}
      >
        {label}
      </button>
      <div style={S.rule} aria-hidden />

      {open ? (
        <div style={S.menu} role="menu">
          {CREATABLE_BLOCK_TYPES.map((type) => {
            const meta = BLOCK_META[type];
            const disabled = type === 'lesson_complete' && disableCompletion;
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  onPick(type);
                  setOpen(false);
                }}
                style={{ ...S.item, ...(disabled ? S.itemDisabled : null) }}
              >
                <span style={S.itemIcon}>{meta.icon}</span>
                <span style={S.itemText}>
                  <span style={S.itemLabel}>{meta.label}</span>
                  <span style={S.itemBlurb}>
                    {disabled ? 'Already added — one completion block per lesson.' : meta.blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' },
  rule: { flex: 1, height: 1, background: 'var(--border)' },
  trigger: {
    flexShrink: 0,
    padding: '3px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--fg3)',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  triggerOpen: {
    color: 'var(--color-app-accent)',
    borderColor: 'var(--color-app-accent)',
  },
  menu: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: 4,
    zIndex: 20,
    width: 320,
    maxWidth: '90vw',
    background: 'var(--card)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    padding: '8px 10px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  itemDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  itemIcon: { fontSize: 18, lineHeight: 1.2 },
  itemText: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  itemLabel: { fontWeight: 600, fontSize: 13, color: 'var(--fg1)' },
  itemBlurb: { fontSize: 11, color: 'var(--fg3)' },
};
