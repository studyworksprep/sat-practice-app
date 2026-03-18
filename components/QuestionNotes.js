'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', teacher: 'Teacher' };

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function QuestionNotes({ questionId }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasNotes, setHasNotes] = useState(false);

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  const panelRef = useRef(null);

  const fetchNotes = useCallback(async () => {
    if (!questionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/question-notes?questionId=${questionId}`);
      const json = await res.json();
      if (res.ok) {
        setNotes(json.notes || []);
        setIsAdmin(json.is_admin || false);
        setUserId(json.user_id || null);
        setHasNotes((json.notes || []).length > 0);
        setLoaded(true);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [questionId]);

  // Fetch notes when panel opens, or on questionId change (to update icon color)
  useEffect(() => {
    if (!questionId) return;
    // Light check: fetch to know if notes exist (for icon color)
    fetch(`/api/question-notes?questionId=${questionId}`)
      .then(r => r.json())
      .then(json => {
        if (json.notes) {
          setHasNotes(json.notes.length > 0);
          setNotes(json.notes);
          setIsAdmin(json.is_admin || false);
          setUserId(json.user_id || null);
          setLoaded(true);
        }
      })
      .catch(() => {
        // Not a teacher/manager/admin — hide component
        setHasNotes(false);
        setLoaded(true);
      });
  }, [questionId]);

  useEffect(() => {
    if (open && questionId) fetchNotes();
  }, [open, questionId, fetchNotes]);

  // Close panel on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    // Delay to avoid the click that opened it
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', handler); };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  async function handlePost() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/question-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, content: draft.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.note) {
        setNotes(prev => [...prev, json.note]);
        setDraft('');
        setHasNotes(true);
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleUpdate(noteId) {
    if (!editContent.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/question-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, content: editContent.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.note) {
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, content: json.note.content, updated_at: json.note.updated_at } : n));
        setEditingId(null);
        setEditContent('');
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleDelete(noteId) {
    if (!confirm('Delete this note?')) return;
    try {
      const res = await fetch('/api/question-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      if (res.ok) {
        setNotes(prev => {
          const next = prev.filter(n => n.id !== noteId);
          setHasNotes(next.length > 0);
          return next;
        });
      }
    } catch {}
  }

  // Don't render for non-teacher/manager/admin (if 401 was returned)
  if (loaded && userId === null) return null;

  const canEdit = (note) => isAdmin || note.author_id === userId;
  const canDelete = (note) => isAdmin || note.author_id === userId;

  return (
    <div className="qnotes-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="qnotes-icon-btn"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        title={hasNotes ? 'View tutor notes' : 'Add tutor note'}
        aria-label="Question notes"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: hasNotes ? '#c99a2e' : 'var(--muted, #999)',
          transition: 'color 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z"/>
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="qnotes-panel"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 500,
            width: 380, maxHeight: 460,
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border, #ddd)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,.18)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border, #ddd)',
            background: 'var(--bg-subtle, #f9f9f9)',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Tutor Notes</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted, #888)', fontSize: 18, lineHeight: 1, padding: '0 2px',
              }}
              aria-label="Close notes"
            >&times;</button>
          </div>

          {/* Notes list */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {loading && notes.length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 12 }}>Loading...</p>
            )}
            {!loading && notes.length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 12 }}>
                No notes yet. Be the first to add one.
              </p>
            )}
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  background: 'var(--bg-subtle, #f5f5f5)',
                  borderRadius: 8, padding: '10px 12px',
                  border: '1px solid var(--border, #eee)',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 6, gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {note.author_name}
                    </span>
                    {note.author_role && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                        background: note.author_role === 'admin' ? 'rgba(79,124,224,.12)' : 'rgba(0,0,0,.06)',
                        color: note.author_role === 'admin' ? 'var(--accent)' : 'var(--muted)',
                      }}>
                        {ROLE_LABEL[note.author_role] || note.author_role}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {timeAgo(note.updated_at || note.created_at)}
                    {note.updated_at !== note.created_at && ' (edited)'}
                  </span>
                </div>

                {editingId === note.id ? (
                  <div>
                    <textarea
                      className="input"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      style={{ fontSize: 13, marginBottom: 6, width: '100%', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                      <button className="btn primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => handleUpdate(note.id)} disabled={saving || !editContent.trim()}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {note.content}
                    </div>
                    {(canEdit(note) || canDelete(note)) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        {canEdit(note) && (
                          <button
                            type="button"
                            onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 12, color: 'var(--accent)', padding: 0, fontWeight: 500,
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {canDelete(note) && (
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 12, color: 'var(--danger)', padding: 0, fontWeight: 500,
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--border, #ddd)',
            background: 'var(--bg-subtle, #f9f9f9)',
          }}>
            <textarea
              className="input"
              placeholder="Add a note for other tutors..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              style={{ fontSize: 13, width: '100%', resize: 'vertical', marginBottom: 6 }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Ctrl+Enter to post</span>
              <button
                className="btn primary"
                style={{ fontSize: 12, padding: '4px 14px' }}
                onClick={handlePost}
                disabled={saving || !draft.trim()}
              >
                {saving ? 'Posting...' : 'Post Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
