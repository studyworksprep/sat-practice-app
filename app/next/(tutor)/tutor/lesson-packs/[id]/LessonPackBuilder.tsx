// Two-pane lesson-pack builder. Left pane is the searchable
// library (questions_v2 minus the ones already in this pack); right
// pane is the ordered pack contents with drag handles. Adding a
// question moves it from left to right optimistically — server
// reconciliation happens via revalidatePath in the action, and any
// failure rolls the local state back.
//
// State model (all client-side):
//
//   packQuestions   — ordered list rendered in the right pane.
//                     Source of truth for what's "in" the pack
//                     until the next server refresh.
//   library         — current library page (rows, total, page,
//                     pageSize). Reissued whenever filters or page
//                     change.
//   filters         — { q, domain, skill, difficulty[], type }.
//                     Pushed into the server action; debounced for
//                     the text input only.
//   expanded        — which row (by id) is currently showing its
//                     full stem preview. One row per pane at a
//                     time; null collapses everything.
//   pendingAdds     — set of question_ids whose addQuestionToPack
//                     call is in flight. Disables the button to
//                     guard against double-add races.
//   pendingRemoves  — same for removes.
//
// Drag-and-drop on the right pane is built with @dnd-kit/sortable.
// We do not animate the library pane — adds visually fly into the
// right pane by simply updating state.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SafeHtml } from '@/lib/ui/SafeHtml';
import {
  addQuestionToPack,
  removeQuestionFromPack,
  renamePack,
  reorderPackQuestions,
  searchQuestions,
} from '../actions';
import s from './LessonPackBuilder.module.css';

type Question = {
  id: string;
  display_code: string | null;
  question_type: string;
  domain_name: string | null;
  skill_name: string | null;
  difficulty: number | null;
  stem_html: string | null;
};

type PackQuestion = Question & { position: number };

type LibraryPage = {
  rows: Question[];
  total: number;
  page: number;
  pageSize: number;
};

type Filters = {
  q: string;
  domain: string;
  skill: string;
  difficulty: number[];
  type: '' | 'mcq' | 'spr';
};

export function LessonPackBuilder({
  pack,
  initialQuestions,
  initialLibrary,
  taxonomy,
}: {
  pack: { id: string; name: string; description: string | null };
  initialQuestions: PackQuestion[];
  initialLibrary: LibraryPage;
  taxonomy: Array<{ domain: string; skill: string }>;
}) {
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description ?? '');
  const [savedName, setSavedName] = useState(pack.name);
  const [savedDescription, setSavedDescription] = useState(pack.description ?? '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [packQuestions, setPackQuestions] = useState<PackQuestion[]>(initialQuestions);
  const [library, setLibrary] = useState<LibraryPage>(initialLibrary);
  const [filters, setFilters] = useState<Filters>({
    q: '',
    domain: '',
    skill: '',
    difficulty: [],
    type: '',
  });
  const [searching, startSearch] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(new Set());
  const [pendingRemoves, setPendingRemoves] = useState<Set<string>>(new Set());
  const [mutError, setMutError] = useState<string | null>(null);

  // Skills offered in the dropdown depend on the chosen domain — if
  // no domain is picked, every skill is listed; if a domain is
  // picked, only that domain's skills.
  const skillsForDomain = useMemo(() => {
    const src = filters.domain
      ? taxonomy.filter((t) => t.domain === filters.domain)
      : taxonomy;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of src) {
      if (!seen.has(t.skill)) {
        seen.add(t.skill);
        out.push(t.skill);
      }
    }
    return out.sort();
  }, [filters.domain, taxonomy]);

  const domains = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of taxonomy) {
      if (!seen.has(t.domain)) {
        seen.add(t.domain);
        out.push(t.domain);
      }
    }
    return out.sort();
  }, [taxonomy]);

  // Centralized search. Always passes the current pack contents as
  // excludeIds so the left pane stays free of duplicates without
  // any client-side post-filtering.
  const runSearch = useCallback(
    (next: Filters, page: number) => {
      const excludeIds = packQuestions.map((q) => q.id);
      setSearchError(null);
      startSearch(async () => {
        const res = await searchQuestions({
          packId: pack.id,
          q: next.q || undefined,
          domain: next.domain || undefined,
          skill: next.skill || undefined,
          difficulty: next.difficulty.length > 0 ? next.difficulty : undefined,
          questionType: next.type || '',
          page,
          excludeIds,
        });
        if (!res.ok) {
          setSearchError(res.error);
          return;
        }
        setLibrary(res.data);
      });
    },
    [pack.id, packQuestions],
  );

  // Debounce text input only — every other filter is a discrete
  // change (dropdown, checkbox) so latency there is purely cost.
  const lastQRef = useRef(filters.q);
  useEffect(() => {
    if (filters.q === lastQRef.current) return;
    lastQRef.current = filters.q;
    const handle = setTimeout(() => runSearch(filters, 1), 200);
    return () => clearTimeout(handle);
  }, [filters, runSearch]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    const next = { ...filters, [key]: value };
    // Clear skill if it doesn't belong to the new domain.
    if (key === 'domain' && next.skill) {
      const allowed = taxonomy
        .filter((t) => !next.domain || t.domain === next.domain)
        .map((t) => t.skill);
      if (!allowed.includes(next.skill)) next.skill = '';
    }
    setFilters(next);
    if (key !== 'q') {
      runSearch(next, 1);
    }
  }

  function toggleDifficulty(d: number) {
    const has = filters.difficulty.includes(d);
    const next = has
      ? filters.difficulty.filter((x) => x !== d)
      : [...filters.difficulty, d].sort();
    updateFilter('difficulty', next);
  }

  function clearFilters() {
    const next: Filters = { q: '', domain: '', skill: '', difficulty: [], type: '' };
    setFilters(next);
    runSearch(next, 1);
  }

  function goToPage(p: number) {
    runSearch(filters, p);
  }

  // ─── Add ─────────────────────────────────────────────────
  async function onAdd(q: Question) {
    if (pendingAdds.has(q.id)) return;
    if (packQuestions.some((p) => p.id === q.id)) return;

    const nextPos = packQuestions.reduce((m, p) => Math.max(m, p.position), -1) + 1;
    const optimistic: PackQuestion = { ...q, position: nextPos };

    setPendingAdds((s) => new Set(s).add(q.id));
    setPackQuestions((rows) => [...rows, optimistic]);
    // Remove from the visible library page so it doesn't double-show.
    setLibrary((lib) => ({
      ...lib,
      rows: lib.rows.filter((r) => r.id !== q.id),
      total: Math.max(0, lib.total - 1),
    }));
    setMutError(null);

    const res = await addQuestionToPack(pack.id, q.id);
    setPendingAdds((s) => {
      const n = new Set(s);
      n.delete(q.id);
      return n;
    });

    if (!res.ok) {
      // Roll back.
      setPackQuestions((rows) => rows.filter((r) => r.id !== q.id));
      setLibrary((lib) => ({ ...lib, rows: [q, ...lib.rows], total: lib.total + 1 }));
      setMutError(res.error);
    }
  }

  // ─── Remove ──────────────────────────────────────────────
  async function onRemove(q: PackQuestion) {
    if (pendingRemoves.has(q.id)) return;
    setPendingRemoves((s) => new Set(s).add(q.id));
    const previousRows = packQuestions;
    setPackQuestions((rows) =>
      rows
        .filter((r) => r.id !== q.id)
        .map((r, i) => ({ ...r, position: i })),
    );
    setMutError(null);

    const res = await removeQuestionFromPack(pack.id, q.id);
    setPendingRemoves((s) => {
      const n = new Set(s);
      n.delete(q.id);
      return n;
    });

    if (!res.ok) {
      setPackQuestions(previousRows);
      setMutError(res.error);
      return;
    }
    // Refresh the visible library page in case our removal frees up
    // a row at the end of the current page.
    runSearch(filters, library.page);
  }

  // ─── Reorder ─────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = packQuestions.findIndex((q) => q.id === active.id);
    const newIndex = packQuestions.findIndex((q) => q.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = packQuestions;
    const moved = arrayMove(packQuestions, oldIndex, newIndex).map((q, i) => ({
      ...q,
      position: i,
    }));
    setPackQuestions(moved);
    setMutError(null);

    const res = await reorderPackQuestions(
      pack.id,
      moved.map((q) => q.id),
    );
    if (!res.ok) {
      setPackQuestions(previous);
      setMutError(res.error);
    }
  }

  // ─── Rename / describe ───────────────────────────────────
  async function saveMeta() {
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();
    if (trimmedName === savedName && trimmedDesc === savedDescription) return;
    if (!trimmedName) {
      setMetaError('Name cannot be empty.');
      setName(savedName);
      return;
    }
    setSavingMeta(true);
    setMetaError(null);
    const res = await renamePack(pack.id, trimmedName, trimmedDesc || null);
    setSavingMeta(false);
    if (!res.ok) {
      setMetaError(res.error);
      return;
    }
    setSavedName(trimmedName);
    setSavedDescription(trimmedDesc);
  }

  const lastPage = Math.max(1, Math.ceil(library.total / library.pageSize));

  return (
    <>
      <header className={s.header}>
        <div className={s.eyebrow}>Tutor · Lesson pack</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveMeta}
          maxLength={200}
          className={s.titleInput}
          aria-label="Pack name"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveMeta}
          maxLength={2000}
          rows={2}
          placeholder="Description (optional)…"
          className={s.descInput}
          aria-label="Pack description"
        />
        <div className={s.headerStatus}>
          {savingMeta && <span className={s.statusMuted}>Saving…</span>}
          {metaError && <span className={s.statusError}>{metaError}</span>}
          {mutError && <span className={s.statusError}>{mutError}</span>}
        </div>
      </header>

      <div className={s.panes}>
        {/* ─── Left pane: library ───────────────────────────── */}
        <section className={s.pane} aria-label="Question library">
          <div className={s.paneHead}>
            <h2 className={s.paneTitle}>Question library</h2>
            <span className={s.paneCount}>
              {library.total.toLocaleString()} match{library.total === 1 ? '' : 'es'}
            </span>
          </div>

          <div className={s.filterBar}>
            <input
              type="text"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search code or stem text…"
              className={s.searchInput}
              aria-label="Search questions"
            />
            <div className={s.filterRow}>
              <select
                value={filters.domain}
                onChange={(e) => updateFilter('domain', e.target.value)}
                className={s.select}
                aria-label="Domain"
              >
                <option value="">All domains</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={filters.skill}
                onChange={(e) => updateFilter('skill', e.target.value)}
                className={s.select}
                aria-label="Skill"
              >
                <option value="">All skills</option>
                {skillsForDomain.map((sk) => (
                  <option key={sk} value={sk}>
                    {sk}
                  </option>
                ))}
              </select>
              <select
                value={filters.type}
                onChange={(e) =>
                  updateFilter('type', e.target.value as Filters['type'])
                }
                className={s.select}
                aria-label="Question type"
              >
                <option value="">Any type</option>
                <option value="mcq">MCQ</option>
                <option value="spr">SPR</option>
              </select>
            </div>
            <div className={s.filterRow}>
              <span className={s.filterLabel}>Difficulty</span>
              {[1, 2, 3].map((d) => (
                <label key={d} className={s.checkPill}>
                  <input
                    type="checkbox"
                    checked={filters.difficulty.includes(d)}
                    onChange={() => toggleDifficulty(d)}
                  />
                  {d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard'}
                </label>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className={s.clearBtn}
                disabled={
                  !filters.q &&
                  !filters.domain &&
                  !filters.skill &&
                  !filters.type &&
                  filters.difficulty.length === 0
                }
              >
                Clear
              </button>
            </div>
            {searchError && <div className={s.statusError}>{searchError}</div>}
          </div>

          <ul className={s.rowList}>
            {library.rows.length === 0 ? (
              <li className={s.emptyRow}>
                {searching ? 'Searching…' : 'No questions match those filters.'}
              </li>
            ) : (
              library.rows.map((q) => (
                <LibraryRow
                  key={q.id}
                  q={q}
                  expanded={expanded === `lib:${q.id}`}
                  onToggle={() =>
                    setExpanded((e) => (e === `lib:${q.id}` ? null : `lib:${q.id}`))
                  }
                  onAdd={() => onAdd(q)}
                  adding={pendingAdds.has(q.id)}
                />
              ))
            )}
          </ul>

          {lastPage > 1 && (
            <div className={s.pagination}>
              <button
                type="button"
                disabled={library.page <= 1 || searching}
                onClick={() => goToPage(library.page - 1)}
                className={s.pagBtn}
              >
                ← Prev
              </button>
              <span className={s.pagCurrent}>
                Page {library.page} / {lastPage}
              </span>
              <button
                type="button"
                disabled={library.page >= lastPage || searching}
                onClick={() => goToPage(library.page + 1)}
                className={s.pagBtn}
              >
                Next →
              </button>
            </div>
          )}
        </section>

        {/* ─── Right pane: pack contents ────────────────────── */}
        <section className={s.pane} aria-label="Pack contents">
          <div className={s.paneHead}>
            <h2 className={s.paneTitle}>In this pack</h2>
            <span className={s.paneCount}>
              {packQuestions.length} question{packQuestions.length === 1 ? '' : 's'}
            </span>
          </div>

          {packQuestions.length === 0 ? (
            <div className={s.emptyPack}>
              <div className={s.emptyPackTitle}>Pack is empty.</div>
              <div className={s.emptyPackBody}>
                Add questions from the library on the left.
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={packQuestions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className={s.rowList}>
                  {packQuestions.map((q, i) => (
                    <PackRow
                      key={q.id}
                      q={q}
                      index={i}
                      expanded={expanded === `pack:${q.id}`}
                      onToggle={() =>
                        setExpanded((e) =>
                          e === `pack:${q.id}` ? null : `pack:${q.id}`,
                        )
                      }
                      onRemove={() => onRemove(q)}
                      removing={pendingRemoves.has(q.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────
// Rows
// ──────────────────────────────────────────────────────────

function LibraryRow({
  q,
  expanded,
  onToggle,
  onAdd,
  adding,
}: {
  q: Question;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <li className={s.row}>
      <div className={s.rowMain}>
        <button
          type="button"
          onClick={onToggle}
          className={s.rowDisclosure}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <RowMeta q={q} />
        <div className={s.rowActions}>
          <button
            type="button"
            onClick={onAdd}
            disabled={adding}
            className={s.addBtn}
            aria-label={`Add ${q.display_code ?? 'question'} to pack`}
          >
            {adding ? '…' : '+ Add'}
          </button>
        </div>
      </div>
      {expanded && <RowPreview html={q.stem_html} />}
    </li>
  );
}

function PackRow({
  q,
  index,
  expanded,
  onToggle,
  onRemove,
  removing,
}: {
  q: PackQuestion;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className={s.row}>
      <div className={s.rowMain}>
        <button
          type="button"
          className={s.dragHandle}
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <span className={s.posBadge}>{index + 1}</span>
        <button
          type="button"
          onClick={onToggle}
          className={s.rowDisclosure}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <RowMeta q={q} />
        <div className={s.rowActions}>
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className={s.removeBtn}
            aria-label={`Remove ${q.display_code ?? 'question'} from pack`}
          >
            {removing ? '…' : '× Remove'}
          </button>
        </div>
      </div>
      {expanded && <RowPreview html={q.stem_html} />}
    </li>
  );
}

function RowMeta({ q }: { q: Question }) {
  const diffLabel =
    q.difficulty === 1 ? 'Easy' : q.difficulty === 2 ? 'Medium' : q.difficulty === 3 ? 'Hard' : null;
  return (
    <div className={s.rowMeta}>
      <div className={s.rowTopLine}>
        <span className={s.code}>{q.display_code ?? q.id.slice(0, 8)}</span>
        <span className={s.typeBadge}>{q.question_type?.toUpperCase()}</span>
        {diffLabel && (
          <span className={`${s.diffBadge} ${s[`diff_${q.difficulty}`]}`}>
            {diffLabel}
          </span>
        )}
      </div>
      <div className={s.rowSubLine}>
        {q.domain_name ?? '—'} · {q.skill_name ?? '—'}
      </div>
      <div className={s.rowSnippet}>{stripToSnippet(q.stem_html)}</div>
    </div>
  );
}

function RowPreview({ html }: { html: string | null }) {
  if (!html) {
    return <div className={s.previewEmpty}>No stem text on file.</div>;
  }
  return (
    <div className={s.preview}>
      <SafeHtml html={html} kind="question" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Stem snippet — strip HTML and base64 noise, collapse spaces.
// Mirrors the helper in /admin/questions/page.js so a tutor sees
// the same short preview as an admin would.
// ──────────────────────────────────────────────────────────

function stripToSnippet(html: string | null, limit = 140): string {
  if (!html) return '—';
  const plain = html
    .replace(/<img[^>]*src="data:[^"]*"[^>]*>/g, '[img]')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;|&ndash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  return plain.slice(0, limit).trimEnd() + '…';
}
