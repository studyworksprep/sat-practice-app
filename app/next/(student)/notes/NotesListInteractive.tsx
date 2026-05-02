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
import type { NotesIndexFacets } from './loaders';
import s from './Notes.module.css';

interface Props {
  initialNotes: StudentNoteSummary[];
  allTags: string[];
  facets: NotesIndexFacets;
  initialSearch: string;
  initialTag: string;
  initialSubject: string;
  initialDomain: string;
  initialSkill: string;
  deleteNoteAction: (id: string) => Promise<ActionResult<{ data: { id: string } }>>;
}

const SUBJECT_LABEL: Record<string, string> = {
  rw: 'Reading & Writing',
  math: 'Math',
};

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
  facets,
  initialSearch,
  initialTag,
  initialSubject,
  initialDomain,
  initialSkill,
  deleteNoteAction,
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState(initialSearch);
  const [activeTag, setActiveTag] = useState(initialTag);
  const [activeSubject, setActiveSubject] = useState(initialSubject);
  const [activeDomain, setActiveDomain] = useState(initialDomain);
  const [activeSkill, setActiveSkill] = useState(initialSkill);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pushQuery = useCallback(
    (next: {
      search?: string;
      tag?: string;
      subject?: string;
      domain?: string;
      skill?: string;
    }) => {
      const params = new URLSearchParams();
      if (next.search) params.set('search', next.search);
      if (next.tag) params.set('tag', next.tag);
      if (next.subject) params.set('subject', next.subject);
      if (next.domain) params.set('domain', next.domain);
      if (next.skill) params.set('skill', next.skill);
      const qs = params.toString();
      router.replace(qs ? `/notes?${qs}` : '/notes');
    },
    [router],
  );

  const navigate = (overrides: Partial<{
    search: string; tag: string; subject: string; domain: string; skill: string;
  }>) => {
    const next = {
      search:  overrides.search  ?? search,
      tag:     overrides.tag     ?? activeTag,
      subject: overrides.subject ?? activeSubject,
      domain:  overrides.domain  ?? activeDomain,
      skill:   overrides.skill   ?? activeSkill,
    };
    startTransition(() => pushQuery(next));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    navigate({ search: value });
  };

  const handleTagClick = (tag: string) => {
    const next = activeTag === tag ? '' : tag;
    setActiveTag(next);
    navigate({ tag: next });
  };

  const handleSubject = (code: string) => {
    const next = activeSubject === code ? '' : code;
    setActiveSubject(next);
    // Selecting a different subject invalidates the current
    // domain/skill — they belong to whatever subject the student
    // was just in. Clearing avoids "Math + RW skill" empty results.
    setActiveDomain('');
    setActiveSkill('');
    navigate({ subject: next, domain: '', skill: '' });
  };

  const handleDomain = (code: string, subjectCode: string | null) => {
    const next = activeDomain === code ? '' : code;
    setActiveDomain(next);
    setActiveSkill('');
    // Clicking a domain implicitly narrows to its subject.
    const subjectNext = next && subjectCode ? subjectCode : activeSubject;
    setActiveSubject(subjectNext);
    navigate({ subject: subjectNext, domain: next, skill: '' });
  };

  const handleSkill = (code: string, subjectCode: string | null, domainCode: string | null) => {
    const next = activeSkill === code ? '' : code;
    setActiveSkill(next);
    const subjectNext = next && subjectCode ? subjectCode : activeSubject;
    const domainNext  = next && domainCode  ? domainCode  : activeDomain;
    setActiveSubject(subjectNext);
    setActiveDomain(domainNext);
    navigate({ subject: subjectNext, domain: domainNext, skill: next });
  };

  const handleClearTaxonomy = () => {
    setActiveSubject('');
    setActiveDomain('');
    setActiveSkill('');
    navigate({ subject: '', domain: '', skill: '' });
  };

  // Hide domains that don't belong to the active subject (when one
  // is set) so the sidebar narrows progressively.
  const visibleDomains = activeSubject
    ? facets.domains.filter((d) => d.subjectCode === activeSubject)
    : facets.domains;
  const visibleSkills = facets.skills.filter((sk) => {
    if (activeDomain && sk.domainCode !== activeDomain) return false;
    if (activeSubject && sk.subjectCode !== activeSubject) return false;
    return true;
  });

  const hasTaxonomyFilter = !!(activeSubject || activeDomain || activeSkill);

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
    <div className={s.indexLayout}>
      <aside className={s.sidebar} aria-label="Filters">
        <FacetSection
          title="Subject"
          items={facets.subjects.map((sub) => ({
            key: sub.code,
            label: SUBJECT_LABEL[sub.code] ?? sub.code,
            count: sub.count,
            active: activeSubject === sub.code,
            onClick: () => handleSubject(sub.code),
          }))}
        />
        <FacetSection
          title="Domain"
          items={visibleDomains.map((d) => ({
            key: d.code,
            label: d.name ?? d.code,
            count: d.count,
            active: activeDomain === d.code,
            onClick: () => handleDomain(d.code, d.subjectCode),
          }))}
        />
        <FacetSection
          title="Skill"
          items={visibleSkills.map((sk) => ({
            key: `${sk.domainCode ?? ''}/${sk.code}`,
            label: sk.name ?? sk.code,
            count: sk.count,
            active: activeSkill === sk.code,
            onClick: () => handleSkill(sk.code, sk.subjectCode, sk.domainCode),
          }))}
        />
        {hasTaxonomyFilter && (
          <button
            type="button"
            className={s.clearFiltersBtn}
            onClick={handleClearTaxonomy}
          >
            Clear filters
          </button>
        )}
      </aside>

      <div className={s.indexMain}>
        <div className={s.controls}>
          <input
            type="search"
            className={s.searchInput}
            placeholder="Search by tag or text…"
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
            {search || activeTag || hasTaxonomyFilter
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
      </div>
    </div>
  );
}

interface FacetItem {
  key: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FacetSection({ title, items }: { title: string; items: FacetItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className={s.facetSection}>
      <div className={s.facetTitle}>{title}</div>
      <ul className={s.facetList}>
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              className={it.active ? `${s.facetItem} ${s.facetItemActive}` : s.facetItem}
              onClick={it.onClick}
              aria-pressed={it.active}
            >
              <span className={s.facetItemLabel}>{it.label}</span>
              <span className={s.facetItemCount}>{it.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
