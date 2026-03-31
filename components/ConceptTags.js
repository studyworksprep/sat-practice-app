'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export default function ConceptTags({ questionId, userRole }) {
  const [tags, setTags] = useState([]);           // all concept tags
  const [questionTagIds, setQuestionTagIds] = useState([]); // tag IDs on this question
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [showInput, setShowInput] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const inputRef = useRef(null);
  const panelRef = useRef(null);

  const isVisible = userRole === 'admin' || userRole === 'manager';

  const fetchTags = useCallback(async () => {
    if (!questionId) return;
    try {
      const res = await fetch(`/api/concept-tags?questionId=${questionId}`);
      if (!res.ok) { setLoaded(true); return; }
      const json = await res.json();
      setTags(json.tags || []);
      setQuestionTagIds(json.questionTagIds || []);
      setIsAdmin(json.is_admin || false);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [questionId]);

  useEffect(() => {
    if (isVisible) fetchTags();
  }, [isVisible, fetchTags]);

  // Close on click outside
  useEffect(() => {
    if (!showInput) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowInput(false);
        setSearch('');
      }
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', handler); };
  }, [showInput]);

  // Focus input when opened
  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus();
  }, [showInput]);

  if (!isVisible || !loaded) return null;

  const questionTags = tags.filter(t => questionTagIds.includes(t.id));
  const trimmed = search.trim();
  const filtered = trimmed
    ? tags.filter(t => t.name.toLowerCase().includes(trimmed.toLowerCase()))
    : [];
  const exactMatch = trimmed
    ? tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())
    : false;
  // Hide suggestions that are already on this question
  const suggestions = filtered.filter(t => !questionTagIds.includes(t.id));

  async function addTag(tagName) {
    if (adding) return;
    setAdding(true);
    try {
      const res = await fetch('/api/concept-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, tagName }),
      });
      if (res.ok) {
        const json = await res.json();
        // Add tag to local state
        setTags(prev => {
          if (prev.some(t => t.id === json.tag.id)) return prev;
          return [...prev, json.tag].sort((a, b) => a.name.localeCompare(b.name));
        });
        setQuestionTagIds(prev => {
          if (prev.includes(json.tag.id)) return prev;
          return [...prev, json.tag.id];
        });
        setSearch('');
      }
    } catch {} finally {
      setAdding(false);
    }
  }

  async function removeTagFromQuestion(tagId) {
    try {
      const res = await fetch('/api/concept-tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, questionId }),
      });
      if (res.ok) {
        setQuestionTagIds(prev => prev.filter(id => id !== tagId));
      }
    } catch {}
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && trimmed && !adding) {
      e.preventDefault();
      // If there's exactly one suggestion, add it
      if (suggestions.length === 1) {
        addTag(suggestions[0].name);
      } else if (!exactMatch && trimmed) {
        // Create new tag
        addTag(trimmed);
      } else if (exactMatch) {
        // Tag exists — if it's not on the question, add it
        const match = tags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
        if (match && !questionTagIds.includes(match.id)) {
          addTag(match.name);
        }
      }
    }
    if (e.key === 'Escape') {
      setShowInput(false);
      setSearch('');
    }
  }

  return (
    <div className="conceptTagsWrap" style={{ marginTop: 12 }}>
      {/* Existing tags on this question */}
      {questionTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {questionTags.map(tag => (
            <span
              key={tag.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(79,124,224,.1)',
                color: 'var(--accent, #4f7ce0)',
                border: '1px solid rgba(79,124,224,.25)',
                borderRadius: 14, padding: '3px 10px',
                fontSize: 12, fontWeight: 500,
                lineHeight: 1.4,
              }}
            >
              {tag.name}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => removeTagFromQuestion(tag.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--accent, #4f7ce0)', fontSize: 14,
                    padding: '0 0 0 2px', lineHeight: 1, opacity: 0.7,
                  }}
                  title="Remove tag from question"
                  aria-label={`Remove ${tag.name}`}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Add Tag button + input */}
      <div style={{ position: 'relative' }} ref={panelRef}>
        <button
          type="button"
          className="btn secondary"
          style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={() => setShowInput(v => !v)}
        >
          {showInput ? 'Close' : '+ Add Tag'}
        </button>

        {showInput && (
          <div
            style={{
              position: 'absolute', left: 0, top: '100%', zIndex: 400,
              marginTop: 4, width: 280,
              background: 'var(--bg-card, #fff)',
              border: '1px solid var(--border, #ddd)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,.12)',
              padding: 8,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search or create tag..."
              style={{ fontSize: 13, width: '100%', marginBottom: 4 }}
              disabled={adding}
            />

            {/* Suggestions dropdown */}
            {trimmed && (suggestions.length > 0 || !exactMatch) && (
              <div
                style={{
                  maxHeight: 160, overflowY: 'auto',
                  borderTop: '1px solid var(--border, #eee)',
                  paddingTop: 4,
                }}
              >
                {suggestions.slice(0, 10).map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => addTag(tag.name)}
                    disabled={adding}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '5px 8px', fontSize: 13, borderRadius: 4,
                      color: 'var(--text, #333)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle, #f5f5f5)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    {tag.name}
                  </button>
                ))}

                {/* Create new option */}
                {!exactMatch && trimmed && (
                  <button
                    type="button"
                    onClick={() => addTag(trimmed)}
                    disabled={adding}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '5px 8px', fontSize: 13, borderRadius: 4,
                      color: 'var(--accent, #4f7ce0)', fontWeight: 500,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle, #f5f5f5)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    {adding ? 'Adding...' : `Create "${trimmed}"`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
