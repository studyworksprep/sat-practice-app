'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const MASTERY_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#22c55e', '#16a34a'];
const MASTERY_LABELS = ['Not started', 'Hard', 'Difficult', 'Okay', 'Good', 'Mastered'];
const CARDS_PER_PAGE = 20;

function renderFormattedText(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  const lines = html.split('\n');
  let inList = false;
  let result = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('- ')) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push('<li>' + line.trimStart().slice(2) + '</li>');
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(line);
    }
  }
  if (inList) result.push('</ul>');
  return result.join('\n').replace(/\n\n+/g, '<br><br>');
}

function stripFormatting(text) {
  if (!text) return '';
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^- /gm, '');
}

export default function FlashcardSetDetailPage() {
  const { setId } = useParams();
  const router = useRouter();

  const [cards, setCards] = useState([]);
  const [setName, setSetName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search, sort, pagination
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  const fetchCards = useCallback(async () => {
    if (!setId) return;
    setLoading(true);
    try {
      // Fetch set info
      const setsRes = await fetch('/api/flashcard-sets');
      if (setsRes.ok) {
        const setsJson = await setsRes.json();
        const found = (setsJson.sets || []).find(s => s.id === setId);
        if (found) setSetName(found.name);
      }

      const res = await fetch(`/api/flashcards?set_id=${setId}`);
      if (!res.ok) {
        setError('Could not load flashcards.');
        setLoading(false);
        return;
      }
      const json = await res.json();
      setCards(json.cards || []);
    } catch {
      setError('Failed to load flashcards.');
    }
    setLoading(false);
  }, [setId]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search, sortBy, sortDir]);

  // Filter
  const filtered = cards.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return stripFormatting(c.front).toLowerCase().includes(q) ||
           stripFormatting(c.back).toLowerCase().includes(q);
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'front') return dir * stripFormatting(a.front).localeCompare(stripFormatting(b.front));
    if (sortBy === 'back') return dir * stripFormatting(a.back).localeCompare(stripFormatting(b.back));
    if (sortBy === 'mastery') return dir * (a.mastery - b.mastery);
    if (sortBy === 'created_at') return dir * (new Date(a.created_at) - new Date(b.created_at));
    return 0;
  });

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / CARDS_PER_PAGE));
  const paginated = sorted.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(col === 'created_at' ? 'desc' : 'asc');
    }
  }

  function sortIndicator(col) {
    if (sortBy !== col) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  async function handleSaveEdit(cardId) {
    if (!editFront.trim() || !editBack.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: cardId, front: editFront, back: editBack }),
      });
      if (res.ok) {
        const json = await res.json();
        setCards(prev => prev.map(c => c.id === cardId ? { ...c, front: json.card.front, back: json.card.back } : c));
        setEditingId(null);
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleDelete(cardId) {
    setDeletingId(cardId);
    try {
      const res = await fetch(`/api/flashcards?card_id=${cardId}`, { method: 'DELETE' });
      if (res.ok) {
        setCards(prev => prev.filter(c => c.id !== cardId));
      }
    } catch {} finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <div className="card"><div className="muted">Loading flashcards...</div></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container">
        <div className="card">
          <div style={{ color: 'var(--danger)' }}>{error}</div>
          <Link href="/review" className="btn secondary" style={{ marginTop: 12 }}>Back to Review</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link href="/review" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
          ← Back to Review
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, flex: 1 }}>
          {setName || 'Flashcard Set'}
        </h1>
        <span className="muted" style={{ fontSize: 13 }}>
          {cards.length} card{cards.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Search + sort controls */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flashcards..."
            style={{ flex: 1, minWidth: 180, fontSize: 13 }}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div className="muted">{cards.length === 0 ? 'No cards in this set yet.' : 'No cards match your search.'}</div>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-subtle, #f9f9f9)', borderBottom: '1px solid var(--border, #eee)' }}>
                    <th
                      onClick={() => toggleSort('front')}
                      style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', fontWeight: 600, fontSize: 12, userSelect: 'none', whiteSpace: 'nowrap' }}
                    >
                      Front{sortIndicator('front')}
                    </th>
                    <th
                      onClick={() => toggleSort('back')}
                      style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', fontWeight: 600, fontSize: 12, userSelect: 'none', whiteSpace: 'nowrap' }}
                    >
                      Back{sortIndicator('back')}
                    </th>
                    <th
                      onClick={() => toggleSort('mastery')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', fontWeight: 600, fontSize: 12, userSelect: 'none', width: 90, whiteSpace: 'nowrap' }}
                    >
                      Mastery{sortIndicator('mastery')}
                    </th>
                    <th
                      onClick={() => toggleSort('created_at')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', fontWeight: 600, fontSize: 12, userSelect: 'none', width: 90, whiteSpace: 'nowrap' }}
                    >
                      Created{sortIndicator('created_at')}
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, width: 100 }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((card) => (
                    <tr key={card.id} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                      {editingId === card.id ? (
                        <>
                          <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                            <textarea
                              className="input"
                              value={editFront}
                              onChange={(e) => setEditFront(e.target.value)}
                              rows={3}
                              style={{ fontSize: 12, width: '100%', resize: 'vertical' }}
                            />
                          </td>
                          <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                            <textarea
                              className="input"
                              value={editBack}
                              onChange={(e) => setEditBack(e.target.value)}
                              rows={3}
                              style={{ fontSize: 12, width: '100%', resize: 'vertical' }}
                            />
                          </td>
                          <td colSpan={2} style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <button
                                className="btn primary"
                                style={{ fontSize: 11, padding: '3px 10px' }}
                                onClick={() => handleSaveEdit(card.id)}
                                disabled={saving || !editFront.trim() || !editBack.trim()}
                              >
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                className="btn secondary"
                                style={{ fontSize: 11, padding: '3px 10px' }}
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                          <td />
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '8px 14px', verticalAlign: 'top', maxWidth: 260 }}>
                            <div
                              style={{ fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' }}
                              dangerouslySetInnerHTML={{ __html: renderFormattedText(card.front) }}
                            />
                          </td>
                          <td style={{ padding: '8px 14px', verticalAlign: 'top', maxWidth: 300 }}>
                            <div
                              style={{ fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' }}
                              dangerouslySetInnerHTML={{ __html: renderFormattedText(card.back) }}
                            />
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'center', verticalAlign: 'top' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 10,
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#fff',
                                background: MASTERY_COLORS[card.mastery] || MASTERY_COLORS[0],
                              }}
                              title={MASTERY_LABELS[card.mastery]}
                            >
                              {card.mastery}/5
                            </span>
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'center', verticalAlign: 'top', fontSize: 12, color: 'var(--muted)' }}>
                            {card.created_at ? new Date(card.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'center', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => { setEditingId(card.id); setEditFront(card.front); setEditBack(card.back); }}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  fontSize: 12, color: 'var(--accent)', padding: 0, fontWeight: 500,
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => { if (confirm('Delete this flashcard?')) handleDelete(card.id); }}
                                disabled={deletingId === card.id}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  fontSize: 12, color: 'var(--danger, #dc2626)', padding: 0, fontWeight: 500,
                                }}
                              >
                                {deletingId === card.id ? '...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <button
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
