// New-tree port of components/QuestionNotes.js. Renders a notes
// icon (gold when notes exist, gray otherwise) that toggles a
// popover showing the org-scoped tutor notes for a question, with
// inline add / edit / delete.
//
// Data flow: a Server Component pre-loads { notes, isAdmin,
// currentUserId, canView } via lib/practice/load-question-notes.js
// and passes them as props. The island manages local mirror state
// for add / edit / delete; mutations go through the
// question-notes-actions Server Actions.
//
// Visibility filtering (which notes the caller is allowed to see)
// is server-side only — the island just renders what it's given.
// The same loader on each page run determines visibleAuthorIds
// from manager_teacher_assignments.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  addQuestionNote,
  deleteQuestionNote,
  updateQuestionNote,
} from './question-notes-actions';
import s from './QuestionNotes.module.css';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', teacher: 'Teacher' };

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * @param {object} props
 * @param {string} props.questionId
 * @param {Array<object>} [props.initialNotes=[]]
 * @param {boolean} [props.isAdmin=false]
 * @param {string} [props.currentUserId=null]
 * @param {boolean} [props.canView=false]
 *   - false hides the icon entirely (caller has no tutor role)
 */
export function QuestionNotes({
  questionId,
  initialNotes = [],
  isAdmin = false,
  currentUserId = null,
  canView = false,
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const panelRef = useRef(null);

  // Click-outside closes the popover.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
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
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!canView) return null;

  const hasNotes = notes.length > 0;

  function handlePost() {
    const trimmed = draft.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addQuestionNote({ questionId, content: trimmed });
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to post note.');
        return;
      }
      const note = res.data?.note;
      if (note) setNotes((prev) => [...prev, note]);
      setDraft('');
    });
  }

  function handleSaveEdit(noteId) {
    const trimmed = editContent.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await updateQuestionNote({ noteId, content: trimmed });
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to save edit.');
        return;
      }
      const updated = res.data?.note;
      if (updated) {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, content: updated.content, updatedAt: updated.updatedAt }
              : n,
          ),
        );
      }
      setEditingId(null);
      setEditContent('');
    });
  }

  function handleDelete(noteId) {
    if (pending) return;
    if (!window.confirm('Delete this note?')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteQuestionNote({ noteId });
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to delete note.');
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    });
  }

  const canEditNote = (note) => isAdmin || note.authorId === currentUserId;

  const iconCls = [s.iconBtn, hasNotes ? s.iconBtnHasNotes : null]
    .filter(Boolean).join(' ');

  return (
    <div className={s.wrap}>
      <button
        type="button"
        className={iconCls}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={hasNotes ? 'View tutor notes' : 'Add tutor note'}
        aria-label="Question notes"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={s.panel}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Tutor notes"
        >
          <div className={s.header}>
            <span className={s.title}>Tutor notes</span>
            <button
              type="button"
              className={s.closeBtn}
              onClick={() => setOpen(false)}
              aria-label="Close notes"
            >
              ×
            </button>
          </div>

          <div className={s.list}>
            {!hasNotes && (
              <p className={s.empty}>No notes yet. Be the first to add one.</p>
            )}
            {notes.map((note) => (
              <div key={note.id} className={s.note}>
                <div className={s.noteHeader}>
                  <div className={s.noteMeta}>
                    <span className={s.author}>{note.authorName}</span>
                    {note.authorRole && (
                      <span
                        className={
                          note.authorRole === 'admin'
                            ? `${s.roleTag} ${s.roleTagAdmin}`
                            : s.roleTag
                        }
                      >
                        {ROLE_LABEL[note.authorRole] ?? note.authorRole}
                      </span>
                    )}
                  </div>
                  <span className={s.timestamp}>
                    {timeAgo(note.updatedAt || note.createdAt)}
                    {note.updatedAt !== note.createdAt && ' (edited)'}
                  </span>
                </div>

                {editingId === note.id ? (
                  <div>
                    <textarea
                      className={s.input}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                    />
                    <div className={s.editActions}>
                      <button
                        type="button"
                        className={s.btnSecondary}
                        onClick={() => {
                          setEditingId(null);
                          setEditContent('');
                        }}
                        disabled={pending}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={s.btnPrimary}
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={pending || !editContent.trim()}
                      >
                        {pending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={s.noteBody}>{note.content}</div>
                    {canEditNote(note) && (
                      <div className={s.noteActions}>
                        <button
                          type="button"
                          className={s.linkAction}
                          onClick={() => {
                            setEditingId(note.id);
                            setEditContent(note.content);
                          }}
                          disabled={pending}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`${s.linkAction} ${s.linkDanger}`}
                          onClick={() => handleDelete(note.id)}
                          disabled={pending}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className={s.composer}>
            <textarea
              className={s.input}
              placeholder="Add a note for other tutors…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost();
              }}
              disabled={pending}
            />
            <div className={s.composerFooter}>
              <span className={s.hint}>⌘/Ctrl+Enter to post</span>
              <button
                type="button"
                className={s.btnPrimary}
                onClick={handlePost}
                disabled={pending || !draft.trim()}
              >
                {pending ? 'Posting…' : 'Post note'}
              </button>
            </div>
          </div>

          {error && <div className={s.error}>{error}</div>}
        </div>
      )}
    </div>
  );
}
