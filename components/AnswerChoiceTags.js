'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────
// Module-level cache shared by every <AnswerChoiceTags /> instance on
// the page. When the same question_id is rendered by 4 options, we
// fire exactly one GET and fan out updates to every subscriber.
// ─────────────────────────────────────────────────────────────────────
const questionCache = new Map(); // questionId -> { data, listeners: Set<fn> }
const inFlight = new Map();      // questionId -> Promise

async function loadForQuestion(questionId) {
  if (questionCache.has(questionId)) return questionCache.get(questionId).data;
  if (inFlight.has(questionId)) return inFlight.get(questionId);

  const p = (async () => {
    try {
      const res = await fetch(`/api/answer-choice-tags?questionId=${questionId}`);
      if (!res.ok) return null;
      const json = await res.json();
      const data = {
        tags: json.tags || [],
        assignments: json.assignments || [],
        is_admin: !!json.is_admin,
        can_write: !!json.can_write,
      };
      questionCache.set(questionId, { data, listeners: new Set() });
      return data;
    } catch {
      return null;
    } finally {
      inFlight.delete(questionId);
    }
  })();

  inFlight.set(questionId, p);
  return p;
}

function subscribe(questionId, fn) {
  const entry = questionCache.get(questionId);
  if (!entry) return () => {};
  entry.listeners.add(fn);
  return () => entry.listeners.delete(fn);
}

function updateCache(questionId, updater) {
  const entry = questionCache.get(questionId);
  if (!entry) return;
  entry.data = updater(entry.data);
  entry.listeners.forEach((fn) => fn(entry.data));
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────
export default function AnswerChoiceTags({
  questionId,
  optionLabel,
  isCorrect = false,
  userRole,
}) {
  // Hard gate: only teachers, managers, and admins ever see anything.
  // Students never see tags, not even the badges.
  const canView =
    userRole === 'teacher' || userRole === 'manager' || userRole === 'admin';
  const canWrite = userRole === 'manager' || userRole === 'admin';

  const [data, setData] = useState(null);
  const [showPopover, setShowPopover] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const panelRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch (deduped) and subscribe to shared cache updates.
  useEffect(() => {
    if (!canView || !questionId) return;
    let cancelled = false;
    let unsub = () => {};

    (async () => {
      const loaded = await loadForQuestion(questionId);
      if (cancelled || !loaded) return;
      setData(loaded);
      unsub = subscribe(questionId, (next) => {
        if (!cancelled) setData(next);
      });
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [canView, questionId]);

  // Close popover on outside click.
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPopover(false);
        setSearch('');
      }
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', handler);
    };
  }, [showPopover]);

  // Focus input when popover opens.
  useEffect(() => {
    if (showPopover && inputRef.current) inputRef.current.focus();
  }, [showPopover]);

  if (!canView || !data) return null;

  const { tags, assignments, is_admin } = data;

  // Tags currently on this specific option.
  const myAssignments = assignments.filter((a) => a.option_label === optionLabel);
  const myTagIds = myAssignments.map((a) => a.tag_id);
  const myTags = tags.filter((t) => myTagIds.includes(t.id));

  const trimmed = search.trim();
  const filtered = trimmed
    ? tags.filter((t) => t.name.toLowerCase().includes(trimmed.toLowerCase()))
    : [];
  const exactMatch = trimmed
    ? tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    : false;
  const suggestions = filtered.filter((t) => !myTagIds.includes(t.id));

  async function addTag(tagName) {
    if (adding || !canWrite || isCorrect) return;
    setAdding(true);
    try {
      const res = await fetch('/api/answer-choice-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, optionLabel, tagName }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json?.tag) return;

      updateCache(questionId, (prev) => {
        const nextTags = prev.tags.some((t) => t.id === json.tag.id)
          ? prev.tags
          : [...prev.tags, json.tag].sort((a, b) => a.name.localeCompare(b.name));
        const alreadyAssigned = prev.assignments.some(
          (a) => a.option_label === optionLabel && a.tag_id === json.tag.id
        );
        const nextAssignments = alreadyAssigned
          ? prev.assignments
          : [...prev.assignments, { option_label: optionLabel, tag_id: json.tag.id }];
        return { ...prev, tags: nextTags, assignments: nextAssignments };
      });
      setSearch('');
    } finally {
      setAdding(false);
    }
  }

  async function removeTag(tagId) {
    if (!is_admin) return;
    try {
      const res = await fetch('/api/answer-choice-tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, questionId, optionLabel }),
      });
      if (!res.ok) return;
      updateCache(questionId, (prev) => ({
        ...prev,
        assignments: prev.assignments.filter(
          (a) => !(a.option_label === optionLabel && a.tag_id === tagId)
        ),
      }));
    } catch {}
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && trimmed && !adding) {
      e.preventDefault();
      if (suggestions.length === 1) {
        addTag(suggestions[0].name);
      } else if (!exactMatch) {
        addTag(trimmed);
      } else {
        const match = tags.find(
          (t) => t.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (match && !myTagIds.includes(match.id)) addTag(match.name);
      }
    }
    if (e.key === 'Escape') {
      setShowPopover(false);
      setSearch('');
    }
  }

  // If this option has no tags AND the user can't add any (either no write
  // permission, or it's the correct answer), render nothing so the DOM stays
  // clean and there's nothing to leak onscreen.
  const showAddButton = canWrite && !isCorrect;
  if (myTags.length === 0 && !showAddButton) return null;

  return (
    <div
      ref={panelRef}
      className={`acTagsWrap${showPopover ? ' open' : ''}`}
      // Stop click bubbling so clicking a tag chip / + button doesn't
      // trigger the option's own onClick (select answer).
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Assigned tag chips */}
      {myTags.length > 0 && (
        <div className="acTagsRow">
          {myTags.map((tag) => (
            <span key={tag.id} className="acTagChip" title={tag.name}>
              {tag.name}
              {is_admin && (
                <button
                  type="button"
                  className="acTagChipRemove"
                  onClick={() => removeTag(tag.id)}
                  aria-label={`Remove ${tag.name}`}
                  title="Remove tag"
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* "+" button to add a new tag (wrong answers only, write roles only) */}
      {showAddButton && (
        <button
          type="button"
          className="acTagAddBtn"
          onClick={() => setShowPopover((v) => !v)}
          aria-label="Add wrong-answer tag"
          title="Add wrong-answer tag"
        >
          + Tag
        </button>
      )}

      {/* Popover: search + suggestions + create-new */}
      {showPopover && showAddButton && (
        <div className="acTagPopover">
          <input
            ref={inputRef}
            type="text"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or create tag…"
            style={{ fontSize: 13, width: '100%', marginBottom: 6 }}
            disabled={adding}
          />
          {trimmed && (suggestions.length > 0 || !exactMatch) && (
            <div className="acTagSuggestions">
              {suggestions.slice(0, 10).map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="acTagSuggestion"
                  onClick={() => addTag(tag.name)}
                  disabled={adding}
                >
                  {tag.name}
                </button>
              ))}
              {!exactMatch && (
                <button
                  type="button"
                  className="acTagSuggestion acTagSuggestionCreate"
                  onClick={() => addTag(trimmed)}
                  disabled={adding}
                >
                  {adding ? 'Adding…' : `Create "${trimmed}"`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
