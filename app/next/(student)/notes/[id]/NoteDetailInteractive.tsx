// Client island for /notes/[id]. Owns:
//   - The TipTap editor (via the shared NoteEditor component)
//   - A small tag input (comma-separated) below the editor
//   - The Save / Delete / "Back to notes" actions
//
// Mode is either 'new' (Save calls createNote, then redirects to
// the persisted id) or 'edit' (Save calls updateNote in place).

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ActionResult, StudentNote } from '@/lib/types';
import s from '../Notes.module.css';
import type { NoteEditorSavePayload } from '../NoteEditor';

// The editor pulls in TipTap + (lazily) MathLive — keep it out of
// the SSR pass so the bundle splits cleanly and there's no hydration
// mismatch from the editable contentEditable.
const NoteEditor = dynamic(
  () => import('../NoteEditor').then((m) => m.NoteEditor),
  { ssr: false, loading: () => <div className={s.editorEmpty}>Loading editor…</div> },
);

interface Props {
  mode: 'new' | 'edit';
  initialNote: StudentNote;
  createNoteAction: (input: {
    title?: string | null;
    bodyJson: StudentNote['bodyJson'];
    bodyText: string;
    tags?: string[];
    questionId?: string | null;
  }) => Promise<ActionResult<{ data: { note: StudentNote } }>>;
  updateNoteAction: (input: {
    id: string;
    title?: string | null;
    bodyJson: StudentNote['bodyJson'];
    bodyText: string;
    tags?: string[];
    questionId?: string | null;
  }) => Promise<ActionResult<{ data: { note: StudentNote } }>>;
  deleteNoteAction: (id: string) => Promise<ActionResult<{ data: { id: string } }>>;
}

function tagsToString(tags: string[]): string {
  return tags.join(', ');
}
function stringToTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function NoteDetailInteractive({
  mode,
  initialNote,
  createNoteAction,
  updateNoteAction,
  deleteNoteAction,
}: Props) {
  const router = useRouter();
  const [tagsInput, setTagsInput] = useState(tagsToString(initialNote.tags));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(
    mode === 'edit' ? initialNote.updatedAt : null,
  );
  const [isPending, startTransition] = useTransition();

  const handleSave = (payload: NoteEditorSavePayload) => {
    setError(null);
    const tags = stringToTags(tagsInput);
    startTransition(async () => {
      if (mode === 'new') {
        const res = await createNoteAction({
          title: payload.title,
          bodyJson: payload.bodyJson,
          bodyText: payload.bodyText,
          tags,
          questionId: initialNote.questionId,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.replace(`/notes/${res.data.note.id}`);
        router.refresh();
        return;
      }
      const res = await updateNoteAction({
        id: initialNote.id,
        title: payload.title,
        bodyJson: payload.bodyJson,
        bodyText: payload.bodyText,
        tags,
        questionId: initialNote.questionId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(res.data.note.updatedAt);
    });
  };

  const handleDelete = () => {
    if (mode !== 'edit') return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteNoteAction(initialNote.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.replace('/notes');
      router.refresh();
    });
  };

  return (
    <main className={s.page}>
      <div className={s.detailHeader}>
        <Link href="/notes" className={s.backLink}>
          ← All notes
        </Link>
        <div className={s.detailMeta}>
          {savedAt && <span>Saved {new Date(savedAt).toLocaleString()}</span>}
          {mode === 'edit' && (
            <button
              type="button"
              className={s.btnDanger}
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete note
            </button>
          )}
        </div>
      </div>

      {error && <div className={s.errorBanner}>{error}</div>}

      <NoteEditor
        initialDoc={initialNote.bodyJson}
        initialTitle={initialNote.title}
        editable
        saving={isPending}
        onSave={handleSave}
        saveLabel={mode === 'new' ? 'Create note' : 'Save changes'}
      />

      <input
        type="text"
        className={s.tagInput}
        placeholder="Tags (comma-separated, e.g. geometry, formula)"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        disabled={isPending}
      />
    </main>
  );
}
