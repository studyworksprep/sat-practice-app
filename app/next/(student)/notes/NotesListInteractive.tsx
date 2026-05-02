// Client island for the notes index. Owns the search input, the
// tag-filter chips, and the per-card delete confirmation. The
// initial render comes from the server (so the page is useful with
// JS off); typing into the search box uses router.replace to push
// the new query string and let the Server Component re-fetch.

'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ActionResult, StudentNoteSummary } from '@/lib/types';
import s from './Notes.module.css';

interface Props {
  initialNotes: StudentNoteSummary[];
  allTags: string[];
  initialSearch: string;
  initialTag: string;
  deleteNoteAction: (id: string) => Promise<ActionResult<{ data: { id: string } }>>;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function NotesListInteractive({
  initialNotes,
  allTags,
  initialSearch,
  initialTag,
  deleteNoteAction,
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState(initialSearch);
  const [activeTag, setActiveTag] = useState(initialTag);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pushQuery = useCallback(
    (next: { search?: string; tag?: string }) => {
      const params = new URLSearchParams();
      if (next.search) params.set('search', next.search);
      if (next.tag) params.set('tag', next.tag);
      const qs = params.toString();
      router.replace(qs ? `/notes?${qs}` : '/notes');
    },
    [router],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Debounce-lite: replace immediately, but use a transition so
    // the Server Component re-fetch doesn't block typing.
    startTransition(() => pushQuery({ search: value, tag: activeTag }));
  };

  const handleTagClick = (tag: string) => {
    const next = activeTag === tag ? '' : tag;
    setActiveTag(next);
    startTransition(() => pushQuery({ search, tag: next }));
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteNoteAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
    });
  };

  // Sync local state if the server-fetched list changes (e.g. after
  // a navigation back from /notes/new).
  if (initialNotes !== notes && initialSearch === search && initialTag === activeTag) {
    setNotes(initialNotes);
  }

  // Re-typeset math snippets whenever the visible notes change.
  // Mirrors lib/ui/QuestionRenderer.js's useMathTypeset — the global
  // MathJax script (loaded in app/layout.js) typesets `\(…\)`
  // delimiters in the rendered HTML once it's in the DOM.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const el = listRef.current;
    if (!el) return undefined;
    if (!/\\\(|\\\[|\$\$/.test(el.innerHTML)) return undefined;
    let cancelled = false;
    let tries = 0;
    const tryTypeset = () => {
      if (cancelled) return;
      const mj = (window as unknown as {
        MathJax?: {
          typesetClear?: (els: Element[]) => void;
          typesetPromise?: (els: Element[]) => Promise<unknown>;
        };
      }).MathJax;
      if (mj?.typesetPromise) {
        try {
          mj.typesetClear?.([el]);
          mj.typesetPromise([el]).catch(() => {});
        } catch { /* */ }
        return;
      }
      tries += 1;
      if (tries < 240) setTimeout(tryTypeset, 50);
    };
    tryTypeset();
    return () => { cancelled = true; };
  }, [notes]);

  return (
    <>
      <div className={s.controls}>
        <input
          type="search"
          className={s.searchInput}
          placeholder="Search your notes…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {allTags.length > 0 && (
        <div className={s.tagRow}>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={
                activeTag === tag ? `${s.tagChip} ${s.tagChipActive}` : s.tagChip
              }
              onClick={() => handleTagClick(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {error && <div className={s.errorBanner}>{error}</div>}

      {notes.length === 0 ? (
        <div className={s.empty}>
          {search || activeTag
            ? 'No notes match your filter.'
            : 'No notes yet — create your first one.'}
        </div>
      ) : (
        <div className={s.notesList} ref={listRef}>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={() => handleDelete(note.id)}
              disabled={isPending}
            />
          ))}
        </div>
      )}
    </>
  );
}

function NoteCard({
  note,
  onDelete,
  disabled,
}: {
  note: StudentNoteSummary;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className={s.noteCard}>
      <Link
        href={`/notes/${note.id}`}
        style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
      >
        <div className={s.noteCardHeader}>
          <h3
            className={
              note.title
                ? s.noteCardTitle
                : `${s.noteCardTitle} ${s.noteCardUntitled}`
            }
          >
            {note.title || 'Untitled note'}
          </h3>
          <span className={s.noteCardTime}>{timeAgo(note.updatedAt)}</span>
        </div>
        {note.previewHtml ? (
          <p
            className={s.noteCardPreview}
            // Server-generated snippet HTML: text is escaped in the
            // server walker; only `\(…\)` MathJax delimiters and
            // their latex contents are emitted unescaped, and MathJax
            // extracts those before the browser parses surrounding
            // text as markup.
            dangerouslySetInnerHTML={{ __html: note.previewHtml }}
          />
        ) : note.preview ? (
          <p className={s.noteCardPreview}>{note.preview}</p>
        ) : null}
        <div className={s.noteCardFooter}>
          {note.tags.map((tag) => (
            <span key={tag} className={s.miniTag}>
              #{tag}
            </span>
          ))}
          {note.questionId && (
            <span className={s.miniLink}>linked to a question</span>
          )}
        </div>
      </Link>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className={s.btnDanger}
          onClick={onDelete}
          disabled={disabled}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
