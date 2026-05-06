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
import type { NoteDoc, NoteTaxonomy } from '@/lib/types';
import { domainSection } from '@/lib/ui/question-layout';
import { ToolButton } from '@/lib/ui/ToolButton';
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
  title: string | null;
  bodyJson: NoteDoc;
  bodyText: string;
  subjectCode?: string | null;
  domainCode?: string | null;
  domainName?: string | null;
  skillCode?: string | null;
  skillName?: string | null;
  updatedAt: string;
}

/** Subject / domain / skill of the question this popover is on,
 *  used to seed the editor's dropdowns when there's no saved note
 *  yet. Snake-case to match `question.taxonomy` shapes the mount
 *  sites already have. */
interface QuestionTaxonomyHint {
  domain_code: string | null;
  domain_name: string | null;
  skill_code: string | null;
  skill_name: string | null;
}

interface Props {
  questionId: string;
  initialNote: InitialStudentNote | null;
  questionTaxonomy?: QuestionTaxonomyHint | null;
}

export function StudentQuestionNotes({
  questionId,
  initialNote,
  questionTaxonomy = null,
}: Props) {
  const [note, setNote] = useState<InitialStudentNote | null>(initialNote);
  const [open, setOpen] = useState(false);
  // Once the student has opened the popover at least once, we keep
  // it mounted and toggle visibility via CSS instead of unmounting.
  // That way the embedded NoteEditor's TipTap instance — and any
  // unsaved typing inside it — survives a click-outside / Escape /
  // close-button dismissal. The whole component is keyed on
  // questionId by the runner, so a question change still drops the
  // mounted editor and seeds a fresh one.
  const [hasOpened, setHasOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Reseed when the user navigates to a different question. We
  // deliberately drop `initialNote` from the deps even though we
  // read it inside the effect: after a save, the action's
  // revalidatePath('/practice', 'layout') refreshes the route, which
  // updates the prop chain and would re-fire this effect with the
  // freshly-persisted note as the new value — the popover would
  // close out from under the user mid-edit. The local `note` state
  // is already up to date in that scenario (handleSave just set it),
  // so there's nothing to reseed.
  useEffect(() => {
    setNote(initialNote);
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

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

  // Seed the editor's Subject / Domain / Skill from the saved note
  // if one exists (keeps the student's sticky overrides intact),
  // otherwise from the question itself so a fresh note opens with
  // the right dropdowns pre-selected.
  const seedFromQuestion: NoteTaxonomy | null = questionTaxonomy
    ? {
        subjectCode: questionTaxonomy.domain_code
          ? domainSection(questionTaxonomy.domain_code)
          : null,
        domainCode: questionTaxonomy.domain_code,
        domainName: questionTaxonomy.domain_name,
        skillCode:  questionTaxonomy.skill_code,
        skillName:  questionTaxonomy.skill_name,
      }
    : null;
  const initialTaxonomy: NoteTaxonomy | null = note
    ? {
        subjectCode: note.subjectCode ?? null,
        domainCode:  note.domainCode  ?? null,
        domainName:  note.domainName  ?? null,
        skillCode:   note.skillCode   ?? null,
        skillName:   note.skillName   ?? null,
      }
    : seedFromQuestion;

  const handleSave = (payload: NoteEditorSavePayload) => {
    setError(null);
    startTransition(async () => {
      const tax = payload.taxonomy;
      const res = await upsertNoteForQuestion({
        questionId,
        // Stringify across the Server Action boundary — the React
        // Flight encoder strips peer keys (e.g. `attrs`) on objects
        // shaped like ProseMirror nodes (`{ type, ... }`), so we
        // round-trip the doc as an opaque string.
        bodyJson: JSON.stringify(payload.bodyJson),
        bodyText: payload.bodyText,
        title: payload.title,
        subjectCode: tax.subjectCode,
        domainCode:  tax.domainCode,
        domainName:  tax.domainName,
        skillCode:   tax.skillCode,
        skillName:   tax.skillName,
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
        title: res.data.note.title,
        bodyJson: res.data.note.bodyJson,
        bodyText: res.data.note.bodyText,
        subjectCode: res.data.note.subjectCode,
        domainCode:  res.data.note.domainCode,
        domainName:  res.data.note.domainName,
        skillCode:   res.data.note.skillCode,
        skillName:   res.data.note.skillName,
        updatedAt: res.data.note.updatedAt,
      });
    });
  };

  return (
    <div className={s.wrap}>
      <ToolButton
        icon={(
          /* Pencil-on-paper icon to differentiate from the tutor-notes
             "lined paper" icon next to it. */
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
        )}
        label="Notes"
        active={open}
        hasContent={hasNote}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) setHasOpened(true);
            return next;
          });
        }}
        title={hasNote ? 'View your note' : 'Add a private note'}
        aria-label="My private note for this question"
      />

      {hasOpened && (
        <div
          ref={panelRef}
          className={s.panel}
          style={{
            width: 480,
            maxHeight: 560,
            // Hide via display rather than unmount so the embedded
            // editor's in-progress text survives click-outside.
            display: open ? undefined : 'none',
          }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="My note for this question"
          aria-hidden={!open}
        >
          <div className={s.header}>
            <span className={s.title}>Notes</span>
            <button
              type="button"
              className={s.closeBtn}
              onClick={() => setOpen(false)}
              aria-label="Close note"
            >
              ×
            </button>
          </div>

          <NoteEditor
            initialDoc={note?.bodyJson ?? null}
            initialTitle={note?.title ?? null}
            initialTaxonomy={initialTaxonomy}
            editable
            saving={pending}
            onSave={handleSave}
            saveLabel={hasNote ? 'Save changes' : 'Save note'}
            placeholder="Write a private note about this question…"
          />

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
