// Question-bank quick-find search bar. Mirrors the legacy
// practice-page search that lets a student or tutor jump straight
// to a specific question by typing its code or any text from the
// stem / stimulus.
//
// Wires to three Server Actions handed in from the parent:
//   - searchQuestionsAction(prevState, formData) — debounced live
//     search over questions_v2; accepts both free text (`q`) and
//     concept-tag chips (`tagIds[]`) AND-combined.
//   - createSessionAction(prevState, formData) — same action the
//     filter form submits, but with `explicit_question_ids[]` +
//     `start_position` so it short-circuits to a session built
//     from the visible result set rather than running the filter
//     pipeline.
//   - listTagsAction() — manager+admin only. Returns the full
//     concept-tag catalog for the +Tag picker. When omitted (or
//     when it returns an empty list, e.g. for a student), the +Tag
//     button hides itself.
//
// Tag chips. Selected tags appear as removable chips above the
// input. Each chip narrows the search; chips are AND-combined with
// each other and with the text query. The +Tag picker pops over
// the input with a searchable list of tags sorted by name.
//
// Multi-result launch. Clicking a row builds a session from up to
// the first 25 visible results (preserving order) and opens at the
// position of the clicked row — turning a keyword/tag search into
// a quick drill set without leaving the page. A single-result hit
// still produces a one-question session.
//
// Lives outside the filter form so its input/keypresses don't
// submit the filter form by accident.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Card } from '@/lib/ui/Card';
import { IconTile } from '@/lib/ui/IconTile';
import { QuestionBankIcon } from '@/lib/ui/icons';
import s from './QuestionSearch.module.css';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DEBOUNCE_MS = 300;
const MAX_LAUNCH_SET = 25;

export function QuestionSearch({
  searchQuestionsAction,
  createSessionAction,
  listTagsAction = null,
}) {
  const [text,      setText]      = useState('');
  const [tagChips,  setTagChips]  = useState([]); // [{ id, name }]
  const [results,   setResults]   = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [error,     setError]     = useState(null);
  const [searching, startSearch]  = useTransition();
  const [launching, setLaunching] = useState(null); // questionId being launched
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagCatalog, setTagCatalog] = useState(null); // null = not loaded; [] = empty
  const [tagCatalogError, setTagCatalogError] = useState(null);
  const [tagPickerQuery, setTagPickerQuery] = useState('');
  const debounceRef  = useRef(null);
  const requestIdRef = useRef(0);
  const tagPickerRef = useRef(null);
  const addTagBtnRef = useRef(null);

  const trimmed = text.trim();
  const tagIds = useMemo(() => tagChips.map((t) => t.id), [tagChips]);
  const tagIdsKey = tagIds.join('|');
  const hasQuery = trimmed.length > 0 || tagChips.length > 0;
  const tagSearchAvailable = Boolean(listTagsAction);

  // Debounced search keyed on text + tagChips. Each input change
  // schedules a new search; the requestId guard makes sure a slow
  // earlier response can't overwrite a faster later one. Tag chip
  // changes skip the debounce because they're discrete clicks.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hasQuery) {
      setResults([]);
      setTruncated(false);
      setError(null);
      return undefined;
    }
    const delay = trimmed ? DEBOUNCE_MS : 0;
    debounceRef.current = setTimeout(() => {
      const reqId = ++requestIdRef.current;
      const fd = new FormData();
      if (trimmed) fd.set('q', trimmed);
      for (const id of tagIds) fd.append('tagIds', id);
      startSearch(async () => {
        const res = await searchQuestionsAction(null, fd);
        if (reqId !== requestIdRef.current) return;
        if (res?.ok) {
          setResults(res.results ?? []);
          setTruncated(Boolean(res.truncated));
          setError(null);
        } else {
          setResults([]);
          setTruncated(false);
          setError(res?.error ?? 'Search failed.');
        }
      });
    }, delay);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed, tagIdsKey, hasQuery, searchQuestionsAction, tagIds]);

  // Lazy-load the tag catalog the first time the +Tag picker opens.
  // Cached for the lifetime of the page; tags rarely change and a
  // round-trip per open would feel slow.
  useEffect(() => {
    if (!tagPickerOpen || tagCatalog != null || !listTagsAction) return;
    let cancelled = false;
    (async () => {
      const res = await listTagsAction();
      if (cancelled) return;
      if (res?.ok) {
        setTagCatalog(res.tags ?? []);
        setTagCatalogError(null);
      } else {
        setTagCatalog([]);
        setTagCatalogError(res?.error ?? 'Failed to load tags.');
      }
    })();
    return () => { cancelled = true; };
  }, [tagPickerOpen, tagCatalog, listTagsAction]);

  // Click-outside / Escape closes the picker.
  useEffect(() => {
    if (!tagPickerOpen) return undefined;
    const onPointerDown = (e) => {
      if (tagPickerRef.current?.contains(e.target)) return;
      if (addTagBtnRef.current?.contains(e.target)) return;
      setTagPickerOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setTagPickerOpen(false);
    };
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tagPickerOpen]);

  function addTag(tag) {
    setTagChips((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
    setTagPickerQuery('');
    setTagPickerOpen(false);
  }
  function removeTag(tagId) {
    setTagChips((prev) => prev.filter((t) => t.id !== tagId));
  }
  function clearAll() {
    setText('');
    setTagChips([]);
    setTagPickerOpen(false);
  }

  function launch(questionId) {
    if (launching) return;
    setLaunching(questionId);
    // Build the session payload from the current visible results.
    // Cap at MAX_LAUNCH_SET; preserve order so start_position is the
    // index of the clicked question in question_ids on the new
    // session row. Single-result searches produce a one-question
    // session.
    const launchSet = results.slice(0, MAX_LAUNCH_SET);
    const startPosition = Math.max(
      0,
      launchSet.findIndex((q) => q.id === questionId),
    );
    const fd = new FormData();
    if (launchSet.length > 1) {
      for (const q of launchSet) fd.append('explicit_question_ids', q.id);
      fd.set('start_position', String(startPosition));
    } else {
      fd.set('explicit_question_id', questionId);
    }
    // createSessionAction redirects on success, so no continuation
    // here. On failure we surface the error and clear the launching
    // state so the row becomes clickable again.
    (async () => {
      try {
        const res = await createSessionAction(null, fd);
        if (res?.ok === false) {
          setError(res.error ?? 'Could not start session.');
          setLaunching(null);
        }
      } catch {
        setLaunching(null);
      }
    })();
  }

  // Suggestions for the picker — case-insensitive substring on the
  // tag name, exclude already-selected, sort hits by name. Cap to
  // 60 so a huge catalog doesn't tank the dropdown render.
  const pickerSuggestions = useMemo(() => {
    if (!tagCatalog) return [];
    const q = tagPickerQuery.trim().toLowerCase();
    const selectedIds = new Set(tagIds);
    const filtered = tagCatalog.filter((t) => {
      if (selectedIds.has(t.id)) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q);
    });
    return filtered.slice(0, 60);
  }, [tagCatalog, tagPickerQuery, tagIds]);

  return (
    <Card className={s.card}>
      <div className={s.header}>
        <div className={s.titleRow}>
          <IconTile icon={QuestionBankIcon} palette="amber" size="md" />
          <span className={s.h2}>Find a question</span>
        </div>
        <p className={s.sub}>
          Search by question code (e.g. M-01288), stem text, stimulus,
          or anything in the question prose. Click a result to start a
          session built from the visible matches (up to 25), opening
          to the question you clicked.
        </p>
      </div>

      {tagChips.length > 0 && (
        <div className={s.chipRow} aria-label="Active tag filters">
          {tagChips.map((tag) => (
            <span key={tag.id} className={s.chip}>
              {tag.name}
              <button
                type="button"
                className={s.chipRemove}
                onClick={() => removeTag(tag.id)}
                aria-label={`Remove ${tag.name} filter`}
                title={`Remove ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={s.searchRow}>
        <input
          type="search"
          className={s.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search question bank…"
          aria-label="Search question bank"
        />
        {tagSearchAvailable && (
          <div className={s.tagBtnWrap}>
            <button
              ref={addTagBtnRef}
              type="button"
              className={s.tagBtn}
              onClick={() => setTagPickerOpen((v) => !v)}
              aria-expanded={tagPickerOpen}
              aria-haspopup="listbox"
              title="Filter by concept tag"
            >
              + Tag
            </button>
            {tagPickerOpen && (
              <div ref={tagPickerRef} className={s.tagPicker} role="dialog" aria-label="Add tag filter">
                <input
                  type="search"
                  className={s.tagPickerInput}
                  value={tagPickerQuery}
                  onChange={(e) => setTagPickerQuery(e.target.value)}
                  placeholder="Search tags…"
                  autoFocus
                />
                {tagCatalog == null ? (
                  <div className={s.muted}>Loading tags…</div>
                ) : tagCatalogError ? (
                  <div className={s.error}>{tagCatalogError}</div>
                ) : pickerSuggestions.length === 0 ? (
                  <div className={s.muted}>
                    {tagCatalog.length === 0
                      ? 'No tags available.'
                      : 'No tags match.'}
                  </div>
                ) : (
                  <ul className={s.tagPickerList} role="listbox">
                    {pickerSuggestions.map((tag) => (
                      <li key={tag.id}>
                        <button
                          type="button"
                          className={s.tagPickerRow}
                          onClick={() => addTag(tag)}
                          role="option"
                        >
                          {tag.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        {(text || tagChips.length > 0) && (
          <button
            type="button"
            className={s.clearBtn}
            onClick={clearAll}
          >
            Clear
          </button>
        )}
      </div>

      {error && <div className={s.error}>{error}</div>}

      {hasQuery && (
        <div className={s.results} aria-live="polite">
          {searching && results.length === 0 ? (
            <div className={s.muted}>Searching…</div>
          ) : results.length === 0 && !error ? (
            <div className={s.muted}>No questions match that search.</div>
          ) : (
            <>
              <ul className={s.list}>
                {results.map((q) => {
                  const code = q.display_code || q.source_external_id || q.id;
                  const isLaunching = launching === q.id;
                  const diffLabel = q.difficulty != null ? DIFF_LABEL[q.difficulty] : null;
                  return (
                    <li key={q.id}>
                      <button
                        type="button"
                        className={s.row}
                        onClick={() => launch(q.id)}
                        disabled={Boolean(launching)}
                      >
                        <span className={s.rowCode}>{code}</span>
                        <span className={s.rowMeta}>
                          {q.domain_name || '—'}
                          {q.skill_name ? ` · ${q.skill_name}` : ''}
                        </span>
                        <span className={s.rowBadges}>
                          {diffLabel && (
                            <span className={`${s.pill} ${s[`pillDiff${diffLabel}`] ?? ''}`}>
                              {diffLabel}
                            </span>
                          )}
                          {q.score_band != null && (
                            <span className={s.pill}>Band {q.score_band}</span>
                          )}
                          {isLaunching && <span className={s.muted}>Starting…</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {truncated && (
                <div className={s.muted}>
                  Showing the first 25 matches — click any to drill the
                  full set in order. Refine your search to narrow.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
