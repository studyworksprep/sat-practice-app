// New-tree port of components/ConceptTags.js. Renders the chip
// list of tags currently on a question plus an inline popover
// for searching / adding / creating tags.
//
// Data flow: a Server Component pre-loads { tags, questionTagIds,
// canTag, canDelete } via lib/practice/load-concept-tags.js and
// passes them as props. The island manages local mirror state for
// add / remove animations. Mutations go through the
// concept-tags-actions Server Actions, never bare fetch.
//
// Role surfaces (matches legacy behavior):
//   - manager + admin: see chips, can add tags
//   - admin only:      can also click × to remove a tag from the question
//   - teacher:         currently invisible (read-only Phase 6 follow-up)
//   - student:         never mounted

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  addConceptTag,
  removeConceptTagFromQuestion,
} from './concept-tags-actions';
import s from './ConceptTags.module.css';

/**
 * @param {object} props
 * @param {string} props.questionId
 * @param {Array<{ id: string, name: string }>} [props.initialTags=[]]
 *   - the full concept_tags catalog at page load
 * @param {string[]} [props.initialQuestionTagIds=[]]
 *   - tag IDs already linked to this question
 * @param {boolean} [props.canTag=false]
 * @param {boolean} [props.canDelete=false]
 */
export function ConceptTags({
  questionId,
  initialTags = [],
  initialQuestionTagIds = [],
  canTag = false,
  canDelete = false,
}) {
  const [tags, setTags] = useState(initialTags);
  const [questionTagIds, setQuestionTagIds] = useState(initialQuestionTagIds);
  const [showInput, setShowInput] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Click-outside closes the popover. Same delayed-attach trick the
  // legacy component uses so the click that opened the popover
  // doesn't immediately close it.
  useEffect(() => {
    if (!showInput) return undefined;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowInput(false);
        setSearch('');
        setError(null);
      }
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', handler);
    };
  }, [showInput]);

  // Focus the input the moment the popover opens.
  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus();
  }, [showInput]);

  if (!canTag) return null;

  const trimmed = search.trim();
  const lowered = trimmed.toLowerCase();
  const questionTags = tags.filter((t) => questionTagIds.includes(t.id));
  const filtered = trimmed
    ? tags.filter((t) => t.name.toLowerCase().includes(lowered))
    : [];
  const exactMatch = trimmed
    ? tags.some((t) => t.name.toLowerCase() === lowered)
    : false;
  // Hide tags already on this question from the suggestions list.
  const suggestions = filtered.filter((t) => !questionTagIds.includes(t.id));

  function handleAddTag(tagName) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addConceptTag({ questionId, tagName });
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to add tag.');
        return;
      }
      const tag = res.data?.tag;
      if (!tag) return;
      setTags((prev) => {
        if (prev.some((t) => t.id === tag.id)) return prev;
        return [...prev, tag].sort((a, b) => a.name.localeCompare(b.name));
      });
      setQuestionTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
      setSearch('');
    });
  }

  function handleRemoveTag(tagId) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await removeConceptTagFromQuestion({ tagId, questionId });
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to remove tag.');
        return;
      }
      setQuestionTagIds((prev) => prev.filter((id) => id !== tagId));
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && trimmed && !pending) {
      e.preventDefault();
      // One match → add it; otherwise create a new tag with the
      // typed name; if the typed name exactly matches an existing
      // tag that's not on this question, link the existing one.
      if (suggestions.length === 1) {
        handleAddTag(suggestions[0].name);
      } else if (!exactMatch) {
        handleAddTag(trimmed);
      } else {
        const match = tags.find((t) => t.name.toLowerCase() === lowered);
        if (match && !questionTagIds.includes(match.id)) {
          handleAddTag(match.name);
        }
      }
    }
    if (e.key === 'Escape') {
      setShowInput(false);
      setSearch('');
      setError(null);
    }
  }

  return (
    <div className={s.wrap}>
      {questionTags.length > 0 && (
        <div className={s.chips}>
          {questionTags.map((tag) => (
            <span key={tag.id} className={s.chip}>
              {tag.name}
              {canDelete && (
                <button
                  type="button"
                  className={s.chipRemove}
                  onClick={() => handleRemoveTag(tag.id)}
                  disabled={pending}
                  title="Remove tag from question"
                  aria-label={`Remove ${tag.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className={s.adder} ref={panelRef}>
        <button
          type="button"
          className={s.addBtn}
          onClick={() => setShowInput((v) => !v)}
        >
          {showInput ? 'Close' : '+ Add tag'}
        </button>

        {showInput && (
          <div className={s.popover}>
            <input
              ref={inputRef}
              type="text"
              className={s.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search or create tag…"
              disabled={pending}
            />

            {trimmed && (suggestions.length > 0 || !exactMatch) && (
              <div className={s.suggestions}>
                {suggestions.slice(0, 10).map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={s.suggestion}
                    onClick={() => handleAddTag(tag.name)}
                    disabled={pending}
                  >
                    {tag.name}
                  </button>
                ))}

                {!exactMatch && trimmed && (
                  <button
                    type="button"
                    className={s.create}
                    onClick={() => handleAddTag(trimmed)}
                    disabled={pending}
                  >
                    {pending ? 'Adding…' : `Create "${trimmed}"`}
                  </button>
                )}
              </div>
            )}

            {error && <div className={s.error}>{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
