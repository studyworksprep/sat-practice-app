// Flashcards review client island. Weighted-random picker (lower
// mastery → more likely), click-to-flip card surface, mastery
// rating row that doubles as the "next" trigger after rating.
//
// History is held locally as an array — going Back walks the
// student through cards they've already seen this session, going
// Next either advances within history or picks a fresh card.

'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { rateFlashcard } from '@/lib/practice/flashcards-actions';
import { MASTERY_LABELS } from '@/lib/practice/flashcards-helpers';
import s from '../../../notes/flashcards/Flashcards.module.css';

// weight = 6 - mastery (mastery 0 → weight 6, mastery 5 → weight 1)
function pickWeightedRandom(cards, excludeId) {
  const pool = cards.length > 1 && excludeId
    ? cards.filter((c) => c.id !== excludeId)
    : cards;
  if (pool.length === 0) return null;
  const totalWeight = pool.reduce((sum, c) => sum + (6 - (c.mastery ?? 0)), 0);
  let r = Math.random() * totalWeight;
  for (const card of pool) {
    r -= 6 - (card.mastery ?? 0);
    if (r <= 0) return card;
  }
  return pool[pool.length - 1];
}

export function FlashcardReviewInteractive({ setId, setName, initialCards }) {
  const [cards, setCards] = useState(initialCards);
  const [history, setHistory] = useState(() => {
    if (initialCards.length === 0) return [];
    const first = pickWeightedRandom(initialCards, null);
    return first ? [first] : [];
  });
  const [historyIdx, setHistoryIdx] = useState(initialCards.length === 0 ? -1 : 0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [error, setError] = useState(null);
  const [savingMastery, startSaveMastery] = useTransition();

  const card = history[historyIdx] ?? null;

  // Keep selectedMastery in sync with the underlying card so a
  // navigation away + back shows the latest rating, but allow
  // optimistic overrides when the student rates the current card.
  const [selectedMastery, setSelectedMastery] = useState(null);
  const currentMastery = useMemo(() => {
    if (!card) return null;
    return selectedMastery !== null ? selectedMastery : card.mastery ?? 0;
  }, [card, selectedMastery]);

  const goNext = useCallback(() => {
    if (cards.length === 0) return;
    if (historyIdx < history.length - 1) {
      // Walking forward through cards we've already shown this
      // session — don't re-roll the random pick.
      setHistoryIdx(historyIdx + 1);
    } else {
      const next = pickWeightedRandom(cards, card?.id);
      if (!next) return;
      // Always read the freshest version of the card from `cards`
      // so a just-rated card carries its new mastery into the
      // weighted picker the next time around.
      const fresh = cards.find((c) => c.id === next.id) ?? next;
      setHistory((prev) => [...prev.slice(0, historyIdx + 1), fresh]);
      setHistoryIdx(historyIdx + 1);
    }
    setFlipped(false);
    setSelectedMastery(null);
  }, [cards, history, historyIdx, card]);

  const goBack = useCallback(() => {
    if (historyIdx <= 0) return;
    setHistoryIdx(historyIdx - 1);
    setFlipped(false);
    setSelectedMastery(null);
  }, [historyIdx]);

  // Keyboard shortcuts: space / enter flips, arrows navigate,
  // 0..5 rates the current card. Standard study-app vocab.
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (/^[0-5]$/.test(e.key)) {
        const level = Number(e.key);
        rate(level);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNext, goBack, card, savingMastery]);

  function rate(level) {
    if (!card || savingMastery) return;
    setSelectedMastery(level);
    setError(null);
    startSaveMastery(async () => {
      const res = await rateFlashcard({ cardId: card.id, mastery: level });
      if (!res?.ok) {
        setError(res?.error ?? 'Could not save rating');
        setSelectedMastery(null);
        return;
      }
      const updated = res.data?.card;
      if (updated) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === card.id
              ? { ...c, mastery: updated.mastery ?? level }
              : c,
          ),
        );
        setHistory((prev) =>
          prev.map((c) =>
            c.id === card.id
              ? { ...c, mastery: updated.mastery ?? level }
              : c,
          ),
        );
      }
      setReviewedCount((n) => n + 1);
    });
  }

  return (
    <main className={s.reviewContainer}>
      <header className={s.reviewHeader}>
        <Link href={`/flashcards/${setId}`} className={s.backLink}>
          ← Back to set
        </Link>
        <div className={s.reviewTitleRow}>
          <div>
            <div className={s.eyebrow}>Flashcards · Review</div>
            <h1 className={s.h1}>{setName}</h1>
          </div>
          <div className={s.reviewMeta}>
            <span className={s.reviewCounter}>
              {reviewedCount} reviewed this session
            </span>
            <span className={s.reviewCounterDot}>·</span>
            <span className={s.reviewSetSize}>
              {cards.length} card{cards.length === 1 ? '' : 's'} in set
            </span>
          </div>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className={s.emptyCard}>
          <h2 className={s.emptyH2}>No cards in this set yet.</h2>
          <p className={s.emptyBody}>
            Add some cards before starting a review session.
          </p>
          <Link href={`/flashcards/${setId}`} className={s.primaryBtn}>
            Add cards →
          </Link>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={`${s.flashcardScene} ${flipped ? s.flashcardFlipped : ''}`}
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Show front' : 'Show back'}
          >
            <div className={s.flashcardInner}>
              <div className={`${s.flashcardFace} ${s.flashcardFront}`}>
                <div className={s.flashcardLabel}>Front</div>
                <div className={s.flashcardText}>{card?.front}</div>
                <div className={s.flashcardHint}>Click or press space to flip</div>
              </div>
              <div className={`${s.flashcardFace} ${s.flashcardBack}`}>
                <div className={s.flashcardLabel}>Back</div>
                <div className={s.flashcardText}>{card?.back}</div>
              </div>
            </div>
          </button>

          <div className={s.reviewNavRow}>
            <button
              type="button"
              className={s.reviewNavBtn}
              onClick={goBack}
              disabled={historyIdx <= 0}
              aria-label="Previous card"
              title="Previous card"
            >
              ←
            </button>
            <span className={s.reviewNavLabel}>
              Card {historyIdx + 1}
              {history.length > historyIdx + 1
                ? ` / ${history.length} (history)`
                : ''}
            </span>
            <button
              type="button"
              className={s.reviewNavBtn}
              onClick={goNext}
              aria-label="Next card"
              title="Next card"
            >
              →
            </button>
          </div>

          <div className={s.masteryRow}>
            <div className={s.masteryHint}>How well do you know this?</div>
            <div className={s.masteryButtons}>
              {[0, 1, 2, 3, 4, 5].map((level) => {
                const active = currentMastery === level;
                const cls = [
                  s.masteryBtn,
                  masteryButtonTone(level, s),
                  active ? s.masteryBtnActive : null,
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={level}
                    type="button"
                    className={cls}
                    onClick={() => rate(level)}
                    disabled={savingMastery}
                    title={MASTERY_LABELS[level]}
                  >
                    <span className={s.masteryBtnNum}>{level}</span>
                    <span className={s.masteryBtnLabel}>
                      {MASTERY_LABELS[level]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={s.masteryFootnote}>
              <span>No clue</span>
              <span>Mastered</span>
            </div>
            {error && <div className={s.masteryError}>{error}</div>}
          </div>
        </>
      )}
    </main>
  );
}

function masteryButtonTone(level, s) {
  if (level >= 5) return s.masteryHigh;
  if (level >= 4) return s.masteryMidHigh;
  if (level >= 3) return s.masteryMid;
  if (level >= 2) return s.masteryMidLow;
  if (level >= 1) return s.masteryLow;
  return s.masteryZero;
}
