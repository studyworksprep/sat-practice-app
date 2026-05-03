// Client island for the /review/notes long-scroll. Owns the
// filter sidebar (Subject > Domain > Skill tree, mirrored from
// the /notes manage page) and the search box. Each note renders
// inline with its full body — bodyHtml comes from
// docToFullHtml() server-side, so no editor instances mount and
// MathJax is the only client work for math nodes.

'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { NoteForReview, NotesIndexFacets } from '@/app/next/(student)/notes/loaders';
import s from './ReviewNotes.module.css';

interface Props {
  initialNotes: NoteForReview[];
  allTags: string[];
  facets: NotesIndexFacets;
  initialSearch: string;
  initialTag: string;
  initialSubject: string;
  initialDomain: string;
  initialSkill: string;
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
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function NotesReviewInteractive({
  initialNotes,
  allTags,
  facets,
  initialSearch,
  initialTag,
  initialSubject,
  initialDomain,
  initialSkill,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [activeTag, setActiveTag] = useState(initialTag);
  const [activeSubject, setActiveSubject] = useState(initialSubject);
  const [activeDomain, setActiveDomain] = useState(initialDomain);
  const [activeSkill, setActiveSkill] = useState(initialSkill);
  const [, startTransition] = useTransition();

  const pushQuery = useCallback(
    (next: { search?: string; tag?: string; subject?: string; domain?: string; skill?: string }) => {
      const params = new URLSearchParams();
      if (next.search)  params.set('search', next.search);
      if (next.tag)     params.set('tag', next.tag);
      if (next.subject) params.set('subject', next.subject);
      if (next.domain)  params.set('domain', next.domain);
      if (next.skill)   params.set('skill', next.skill);
      const qs = params.toString();
      router.replace(qs ? `/review/notes?${qs}` : '/review/notes');
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
    setActiveDomain('');
    setActiveSkill('');
    navigate({ subject: next, domain: '', skill: '' });
  };

  const handleDomain = (code: string, subjectCode: string | null) => {
    const next = activeDomain === code ? '' : code;
    setActiveDomain(next);
    setActiveSkill('');
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

  // Build the Subject > Domain > Skill tree from facets, narrowed
  // by the active subject. Same shape the /notes manage page uses.
  type SkillNode = { code: string; name: string | null; count: number };
  type DomainNode = {
    code: string;
    name: string | null;
    subjectCode: string | null;
    count: number;
    skills: SkillNode[];
  };
  type SubjectNode = { code: string; count: number; domains: DomainNode[] };

  const subjectFiltered = (subjectCode: string | null) =>
    !activeSubject || subjectCode === activeSubject;

  const domainsByCode = new Map<string, DomainNode>();
  for (const d of facets.domains) {
    if (!subjectFiltered(d.subjectCode)) continue;
    domainsByCode.set(d.code, {
      code: d.code,
      name: d.name,
      subjectCode: d.subjectCode,
      count: d.count,
      skills: [],
    });
  }
  for (const sk of facets.skills) {
    if (!subjectFiltered(sk.subjectCode)) continue;
    if (!sk.domainCode) continue;
    const parent = domainsByCode.get(sk.domainCode);
    if (!parent) continue;
    parent.skills.push({ code: sk.code, name: sk.name, count: sk.count });
  }
  for (const dn of domainsByCode.values()) {
    dn.skills.sort((a, b) => (a.name ?? a.code).localeCompare(b.name ?? b.code));
  }

  const subjectTree: SubjectNode[] = facets.subjects.map((sub) => ({
    code: sub.code,
    count: sub.count,
    domains: [...domainsByCode.values()]
      .filter((d) => d.subjectCode === sub.code)
      .sort((a, b) => (a.name ?? a.code).localeCompare(b.name ?? b.code)),
  }));

  const hasTaxonomyFilter = !!(activeSubject || activeDomain || activeSkill);

  // Re-typeset math + drawings whenever the visible notes change.
  // bodyHtml strings include `\(…\)` delimiters MathJax processes
  // (loaded globally in app/layout.js); drawing nodes are inline
  // SVG so MathJax skips them.
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
  }, [initialNotes]);

  return (
    <div className={s.layout}>
      <aside className={s.sidebar} aria-label="Filters">
        <div className={s.facetTitle}>Subject</div>
        <ul className={s.facetTree}>
          {subjectTree.map((sub) => {
            const isSubjectActive = activeSubject === sub.code;
            return (
              <li key={sub.code}>
                <button
                  type="button"
                  className={isSubjectActive ? `${s.facetItem} ${s.facetItemActive}` : s.facetItem}
                  onClick={() => handleSubject(sub.code)}
                  aria-pressed={isSubjectActive}
                >
                  <span className={s.facetItemLabel}>
                    {SUBJECT_LABEL[sub.code] ?? sub.code}
                  </span>
                  <span className={s.facetItemCount}>{sub.count}</span>
                </button>
                {sub.domains.length > 0 && (
                  <ul className={s.facetTreeChildren}>
                    {sub.domains.map((d) => {
                      const isDomainActive = activeDomain === d.code;
                      return (
                        <li key={d.code}>
                          <button
                            type="button"
                            className={isDomainActive ? `${s.facetItem} ${s.facetItemActive}` : s.facetItem}
                            onClick={() => handleDomain(d.code, d.subjectCode)}
                            aria-pressed={isDomainActive}
                          >
                            <span className={s.facetItemLabel}>{d.name ?? d.code}</span>
                            <span className={s.facetItemCount}>{d.count}</span>
                          </button>
                          {d.skills.length > 0 && (
                            <ul className={s.facetTreeChildren}>
                              {d.skills.map((sk) => {
                                const isSkillActive = activeSkill === sk.code;
                                return (
                                  <li key={sk.code}>
                                    <button
                                      type="button"
                                      className={isSkillActive ? `${s.facetItem} ${s.facetItemActive}` : s.facetItem}
                                      onClick={() => handleSkill(sk.code, d.subjectCode, d.code)}
                                      aria-pressed={isSkillActive}
                                    >
                                      <span className={s.facetItemLabel}>{sk.name ?? sk.code}</span>
                                      <span className={s.facetItemCount}>{sk.count}</span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {hasTaxonomyFilter && (
          <button type="button" className={s.clearFiltersBtn} onClick={handleClearTaxonomy}>
            Clear filters
          </button>
        )}
      </aside>

      <div className={s.main}>
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
                className={activeTag === tag ? `${s.tagChip} ${s.tagChipActive}` : s.tagChip}
                onClick={() => handleTagClick(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {initialNotes.length === 0 ? (
          <div className={s.empty}>
            {search || activeTag || hasTaxonomyFilter
              ? 'No notes match your filter.'
              : 'No notes saved yet.'}
          </div>
        ) : (
          <div className={s.noteStream} ref={listRef}>
            {initialNotes.map((note) => (
              <ReviewNoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewNoteCard({ note }: { note: NoteForReview }) {
  return (
    <article className={s.note}>
      <header className={s.noteHeader}>
        <h2 className={note.title ? s.noteTitle : `${s.noteTitle} ${s.noteTitleUntitled}`}>
          {note.title || 'Untitled note'}
        </h2>
        <span className={s.noteTime}>{timeAgo(note.updatedAt)}</span>
      </header>
      <div className={s.noteMeta}>
        {note.subjectCode && (
          <span className={s.metaChip}>
            {SUBJECT_LABEL[note.subjectCode] ?? note.subjectCode}
          </span>
        )}
        {note.domainName && <span className={s.metaChip}>{note.domainName}</span>}
        {note.skillName && <span className={s.metaChip}>{note.skillName}</span>}
        {note.questionId && (
          <Link href={`/notes/${note.id}`} className={s.metaLink}>
            Open in editor →
          </Link>
        )}
      </div>
      <div
        className={`${s.noteBody} sw-prose`}
        // bodyHtml is server-generated by docToFullHtml: text is
        // escaped, only known block / mark tags are emitted, and
        // drawings are inline SVGs from Excalidraw's exporter.
        dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
      />
      {note.tags.length > 0 && (
        <div className={s.tagFooter}>
          {note.tags.map((tag) => (
            <span key={tag} className={s.miniTag}>#{tag}</span>
          ))}
        </div>
      )}
    </article>
  );
}
