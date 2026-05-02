// Per-question popover for the student-private notes feature. Sits
// in the practice runner header next to the tutor team-notes button
// and the Error Log button. Each user has at most one student note
// per (user, question); upsertNoteForQuestion enforces that.
//
// The popover layout reuses QuestionNotes.module.css so it visually
// matches the tutor team-notes popover. The body of the popover is
// the shared TipTap NoteEditor — same rich-text + math experience as
// the standalone /notes editor.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { upsertNoteForQuestion } from '@/app/next/(student)/notes/actions';
import type { NoteDoc, StudentNote } from '@/lib/types';
import s from './QuestionNotes.module.css';
import type { NoteEditorSavePayload } from '@/app/next/(student)/notes/NoteEditor';

const NoteEditor = dynamicImport(
  () =>
    import('@/app/next/(student)/notes/NoteEditor').then((m) => m.NoteEditor),
  {
    ssr: false,
    loading: () => <div style={{ padding: 16, fontSize: 13 }}>Loading editor…</div>,
  },
);

interface InitialStudentNote {
  id: string;
  bodyJson: NoteDoc;
  bodyText: string;
  updatedAt: string;
}

interface Props {
  questionId: string;
  initialNote: InitialStudentNote | null;
}

export function StudentQuestionNotes({ questionId, initialNote }: Props) {
  const [note, setNote] = useState<InitialStudentNote | null>(initialNote);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Reseed on question change.
  useEffect(() => {
    setNote(initialNote);
    setOpen(false);
  }, [questionId, initialNote]);

  // Click-outside closes the popover. Carve out two exceptions so
  // tapping into the embedded editor doesn't unmount it:
  //  1. MathLive's virtual keyboard renders as a singleton appended
  //     to document.body — anything inside it is technically "outside"
  //     the popover but is part of the same input affordance.
  //  2. Same for any MathLive-styled descendant (popovers, menus,
  //     suggestion lists), all of which use the ML__ class prefix.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest?.('[class*="ML__"], math-field, math-virtual-keyboard')) return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', handler);
    };
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const hasNote = !!note && note.bodyText.trim().length > 0;

  const handleSave = (payload: NoteEditorSavePayload) => {
    setError(null);
    startTransition(async () => {
      const res = await upsertNoteForQuestion({
        questionId,
        bodyJson: payload.bodyJson,
        bodyText: payload.bodyText,
        title: payload.title,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.data.note) {
        setNote(null);
        return;
      }
      setNote({
        id: res.data.note.id,
        bodyJson: res.data.note.bodyJson,
        bodyText: res.data.note.bodyText,
        updatedAt: res.data.note.updatedAt,
      });
    });
  };

  const iconCls = [s.iconBtn, hasNote ? s.iconBtnHasNotes : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={s.wrap}>
      <button
        type="button"
        className={iconCls}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={hasNote ? 'View your note' : 'Add a private note'}
        aria-label="My private note for this question"
      >
        {/* Pencil-on-paper icon to differentiate from the tutor-notes
            "lined paper" icon next to it. */}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={s.panel}
          style={{ width: 480, maxHeight: 560 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="My note for this question"
        >
          <div className={s.header}>
            <span className={s.title}>My note (private)</span>
            <button
              type="button"
              className={s.closeBtn}
              onClick={() => setOpen(false)}
              aria-label="Close note"
            >
              ×
            </button>
          </div>

          <div style={{ padding: 0, overflow: 'auto', flex: 1 }}>
            <NoteEditor
              initialDoc={note?.bodyJson ?? null}
              initialTitle={null}
              editable
              saving={pending}
              onSave={handleSave}
              hideTitle
              saveLabel={hasNote ? 'Save changes' : 'Save note'}
              placeholder="Write a private note about this question…"
            />
          </div>

          {error && <div className={s.error}>{error}</div>}

          <div className={s.composer} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={s.hint}>
              Visible only to you.
            </span>
            <Link href="/notes" className={s.linkAction}>
              All notes →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
