// Question-bank quick-find search bar. Mirrors the legacy
// practice-page search that lets a student or tutor jump straight
// to a specific question by typing its code or any text from the
// stem / stimulus.
//
// Wires to two Server Actions handed in from the parent:
//   - searchQuestionsAction(prevState, formData) — debounced live
//     search, returns up to MAX_RESULTS lightweight rows.
//   - createSessionAction(prevState, formData) — the same action
//     the filter form submits, but with `explicit_question_id`
//     in the form data so it short-circuits to a one-question
//     session without going through the filter pipeline.
//
// Lives outside the filter form so its input/keypresses don't
// submit the filter form by accident.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Card } from '@/lib/ui/Card';
import { IconTile } from '@/lib/ui/IconTile';
import { QuestionBankIcon } from '@/lib/ui/icons';
import s from './QuestionSearch.module.css';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DEBOUNCE_MS = 300;

export function QuestionSearch({
  searchQuestionsAction,
  createSessionAction,
}) {
  const [text,        setText]        = useState('');
  const [results,     setResults]     = useState([]);
  const [truncated,   setTruncated]   = useState(false);
  const [error,       setError]       = useState(null);
  const [searching,   startSearch]    = useTransition();
  const [launching,   setLaunching]   = useState(null); // questionId being launched
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  // Debounced search. Each keystroke schedules a new search; the
  // requestId guard makes sure a slow earlier response can't
  // overwrite a faster later one.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      setTruncated(false);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const reqId = ++requestIdRef.current;
      const fd = new FormData();
      fd.set('q', trimmed);
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
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, searchQuestionsAction]);

  function launch(questionId) {
    if (launching) return;
    setLaunching(questionId);
    const fd = new FormData();
    fd.set('explicit_question_id', questionId);
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

  const trimmed = text.trim();

  return (
    <Card className={s.card}>
      <div className={s.header}>
        <div className={s.titleRow}>
          <IconTile icon={QuestionBankIcon} palette="amber" size="md" />
          <span className={s.h2}>Find a question</span>
        </div>
        <p className={s.sub}>
          Search by question code (e.g. M-01288), stem text, stimulus,
          or anything in the question prose. Click a result to start
          a one-question session.
        </p>
      </div>
      <div className={s.searchRow}>
        <input
          type="search"
          className={s.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search question bank…"
          aria-label="Search question bank"
        />
        {text && (
          <button
            type="button"
            className={s.clearBtn}
            onClick={() => setText('')}
          >
            Clear
          </button>
        )}
      </div>

      {error && <div className={s.error}>{error}</div>}

      {trimmed && (
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
                  Showing the first 25 matches. Refine your search to
                  narrow this list.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
