'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../components/Toast';

export default function FlashcardReviewPage() {
  const searchParams = useSearchParams();
  const setId = searchParams.get('set_id');

  const [setName, setSetName] = useState('');
  const [card, setCard] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [reviewed, setReviewed] = useState(0);
  const [savingMastery, setSavingMastery] = useState(false);

  const loadNext = useCallback(async (excludeId) => {
    try {
      const url = `/api/flashcards/next?set_id=${setId}${excludeId ? `&exclude_id=${excludeId}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load card');
      setCard(json.card);
      setFlipped(false);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }, [setId]);

  // Load set name and first card
  useEffect(() => {
    if (!setId) return;
    (async () => {
      try {
        const res = await fetch('/api/flashcard-sets');
        const json = await res.json();
        if (res.ok && json.sets) {
          const s = json.sets.find(s => s.id === setId);
          if (s) setSetName(s.name);
        }
      } catch {}
      loadNext(null);
    })();
  }, [setId, loadNext]);

  async function rateMastery(level) {
    if (!card || savingMastery) return;
    setSavingMastery(true);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: card.id, mastery: level }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || 'Failed to save rating');
      }
      setReviewed(r => r + 1);
      loadNext(card.id);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSavingMastery(false);
    }
  }

  if (!setId) {
    return (
      <main className="container">
        <div className="card">
          <div className="h1">Flashcard Review</div>
          <p className="muted">No set selected.</p>
          <Link href="/review" className="btn secondary">Back to Review</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div className="h1" style={{ marginBottom: 2 }}>{setName || 'Flashcards'}</div>
            <div className="muted small">{reviewed} reviewed this session</div>
          </div>
          <Link href="/review" className="btn secondary" style={{ fontSize: 13 }}>Done</Link>
        </div>

        <Toast kind={msg?.kind} message={msg?.text} />

        {loading ? (
          <div className="muted">Loading…</div>
        ) : !card ? (
          <div className="muted">No cards in this set yet. Add some cards first!</div>
        ) : (
          <div className="flashcardContainer">
            <div
              className={`flashcard${flipped ? ' flipped' : ''}`}
              onClick={() => !flipped && setFlipped(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!flipped) setFlipped(true); } }}
            >
              <div className="flashcardInner">
                <div className="flashcardFace flashcardFront">
                  <div className="flashcardLabel">FRONT</div>
                  <div className="flashcardText">{card.front}</div>
                  <div className="flashcardHint muted small">Click to flip</div>
                </div>
                <div className="flashcardFace flashcardBack">
                  <div className="flashcardLabel">BACK</div>
                  <div className="flashcardText">{card.back}</div>
                </div>
              </div>
            </div>

            {flipped && (
              <div className="flashcardMastery">
                <div className="small muted" style={{ marginBottom: 8 }}>How well did you know this?</div>
                <div className="flashcardMasteryButtons">
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      className={`flashcardMasteryBtn mastery${level}`}
                      onClick={() => rateMastery(level)}
                      disabled={savingMastery}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <div className="flashcardMasteryLabels small muted">
                  <span>No clue</span>
                  <span>Perfect</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
