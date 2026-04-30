// Per-set client island. Owns the in-page state: search, sort,
// pagination, edit/delete/add. Server Actions handle persistence;
// the island optimistically updates its own list so the UI feels
// instant.

'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  createFlashcard,
  deleteFlashcard,
  updateFlashcard,
} from '@/lib/practice/flashcards-actions';
import { MASTERY_LABELS } from '@/lib/practice/flashcards-helpers';
import s from '../Flashcards.module.css';

const CARDS_PER_PAGE = 20;

export function FlashcardSetInteractive({ set, initialCards }) {
  const [cards, setCards] = useState(initialCards);

  // Search + sort + pagination
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  // Edit
  const [editingId, setEditingId] = useState(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [savingEdit, startSaveEdit] = useTransition();

  // Delete
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, startDelete] = useTransition();

  // Add
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [addingCard, startAdd] = useTransition();
  const [addError, setAddError] = useState(null);
  const [justAdded, setJustAdded] = useState(false);

  // Filter / sort / paginate are derived from cards. Keep them
  // memoized so typing in the search box doesn't re-sort the
  // whole list on every keystroke when the user has hundreds of
  // cards.
  const filtered = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter(
      (c) =>
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q),
    );
  }, [cards, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'front') return dir * a.front.localeCompare(b.front);
      if (sortBy === 'back') return dir * a.back.localeCompare(b.back);
      if (sortBy === 'mastery')
        return dir * ((a.mastery ?? 0) - (b.mastery ?? 0));
      // created_at fallback
      return dir * (Date.parse(a.created_at) - Date.parse(b.created_at));
    });
  }, [filtered, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / CARDS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice(
    (safePage - 1) * CARDS_PER_PAGE,
    safePage * CARDS_PER_PAGE,
  );

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'created_at' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  function sortIndicator(col) {
    if (sortBy !== col) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditFront('');
    setEditBack('');
  }

  function saveEdit(cardId) {
    if (!editFront.trim() || !editBack.trim() || savingEdit) return;
    startSaveEdit(async () => {
      const res = await updateFlashcard({
        cardId,
        front: editFront,
        back: editBack,
      });
      if (!res?.ok) return;
      const updated = res.data?.card;
      if (!updated) return;
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, front: updated.front, back: updated.back }
            : c,
        ),
      );
      cancelEdit();
    });
  }

  function deleteCard(cardId) {
    if (pendingDelete) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this flashcard?')) {
      return;
    }
    setDeletingId(cardId);
    startDelete(async () => {
      const res = await deleteFlashcard({ cardId });
      setDeletingId(null);
      if (!res?.ok) return;
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    });
  }

  function addCard(e) {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim() || addingCard) return;
    setAddError(null);
    setJustAdded(false);
    startAdd(async () => {
      const res = await createFlashcard({
        setId: set.id,
        front: newFront,
        back: newBack,
      });
      if (!res?.ok) {
        setAddError(res?.error ?? 'Could not add card');
        return;
      }
      const card = res.data?.card;
      if (card) setCards((prev) => [card, ...prev]);
      setNewFront('');
      setNewBack('');
      setJustAdded(true);
      // Bounce back to page 1 so the user can see the new card
      // (cards are sorted desc by created_at by default).
      setPage(1);
      setTimeout(() => setJustAdded(false), 1800);
    });
  }

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/flashcards" className={s.backLink}>
          ← All flashcard sets
        </Link>
        <div className={s.titleRow}>
          <div>
            <div className={s.eyebrow}>Flashcards · Set</div>
            <h1 className={s.h1}>{set.name}</h1>
            <p className={s.sub}>
              {cards.length} card{cards.length === 1 ? '' : 's'} in this set.
            </p>
          </div>
          <div className={s.headerActions}>
            {cards.length > 0 && (
              <Link
                href={`/flashcards/${set.id}/review`}
                className={s.primaryBtn}
              >
                Review →
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className={s.addCard}>
        <div className={s.sectionLabel}>Add a card</div>
        <form className={s.addForm} onSubmit={addCard}>
          <textarea
            className={s.addInput}
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
            placeholder="Front — term, question, or concept"
            rows={2}
            disabled={addingCard}
          />
          <textarea
            className={s.addInput}
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
            placeholder="Back — definition, answer, or explanation"
            rows={3}
            disabled={addingCard}
          />
          <div className={s.addActions}>
            {addError && <span className={s.addError}>{addError}</span>}
            {justAdded && !addError && <span className={s.addOk}>Saved ✓</span>}
            <button
              type="submit"
              className={s.primaryBtn}
              disabled={addingCard || !newFront.trim() || !newBack.trim()}
            >
              {addingCard ? 'Saving…' : 'Save card'}
            </button>
          </div>
        </form>
      </section>

      <section className={s.listCard}>
        <div className={s.listHead}>
          <input
            type="text"
            className={s.searchInput}
            placeholder="Search this set…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <span className={s.listCount}>
            {filtered.length} of {cards.length}
          </span>
        </div>

        {cards.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No cards in this set yet.</div>
            <div className={s.emptyBody}>
              Use the form above to add your first one.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No cards match your search.</div>
          </div>
        ) : (
          <>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th
                      onClick={() => toggleSort('front')}
                      className={s.thSort}
                    >
                      Front{sortIndicator('front')}
                    </th>
                    <th
                      onClick={() => toggleSort('back')}
                      className={s.thSort}
                    >
                      Back{sortIndicator('back')}
                    </th>
                    <th
                      onClick={() => toggleSort('mastery')}
                      className={`${s.thSort} ${s.thNarrow}`}
                    >
                      Mastery{sortIndicator('mastery')}
                    </th>
                    <th
                      onClick={() => toggleSort('created_at')}
                      className={`${s.thSort} ${s.thNarrow}`}
                    >
                      Created{sortIndicator('created_at')}
                    </th>
                    <th className={s.thNarrow}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((card) => {
                    const editing = editingId === card.id;
                    return (
                      <tr key={card.id}>
                        {editing ? (
                          <>
                            <td>
                              <textarea
                                className={s.editInput}
                                value={editFront}
                                onChange={(e) => setEditFront(e.target.value)}
                                rows={3}
                              />
                            </td>
                            <td>
                              <textarea
                                className={s.editInput}
                                value={editBack}
                                onChange={(e) => setEditBack(e.target.value)}
                                rows={3}
                              />
                            </td>
                            <td colSpan={2}>
                              <div className={s.editActionsCol}>
                                <button
                                  className={s.primaryBtnSm}
                                  onClick={() => saveEdit(card.id)}
                                  disabled={
                                    savingEdit
                                    || !editFront.trim()
                                    || !editBack.trim()
                                  }
                                >
                                  {savingEdit ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  className={s.secondaryBtnSm}
                                  onClick={cancelEdit}
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                            <td />
                          </>
                        ) : (
                          <>
                            <td className={s.cellFront}>{card.front}</td>
                            <td className={s.cellBack}>{card.back}</td>
                            <td className={s.cellNarrow}>
                              <span
                                className={`${s.masteryPill} ${masteryToneClass(card.mastery, s)}`}
                                title={
                                  MASTERY_LABELS[card.mastery ?? 0]
                                  ?? 'Not started'
                                }
                              >
                                {card.mastery ?? 0}/5
                              </span>
                            </td>
                            <td className={`${s.cellNarrow} ${s.cellMuted}`}>
                              {formatDate(card.created_at)}
                            </td>
                            <td className={s.cellNarrow}>
                              <div className={s.cellActions}>
                                <button
                                  type="button"
                                  className={s.actionLink}
                                  onClick={() => startEdit(card)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className={s.actionLinkDanger}
                                  onClick={() => deleteCard(card.id)}
                                  disabled={
                                    pendingDelete && deletingId === card.id
                                  }
                                >
                                  {pendingDelete && deletingId === card.id
                                    ? '…'
                                    : 'Delete'}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className={s.paginator}>
                <button
                  type="button"
                  className={s.secondaryBtnSm}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  Prev
                </button>
                <span className={s.paginatorPage}>
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  className={s.secondaryBtnSm}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function masteryToneClass(mastery, s) {
  const m = mastery ?? 0;
  if (m >= 5) return s.masteryHigh;
  if (m >= 4) return s.masteryMidHigh;
  if (m >= 3) return s.masteryMid;
  if (m >= 2) return s.masteryMidLow;
  if (m >= 1) return s.masteryLow;
  return s.masteryZero;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
