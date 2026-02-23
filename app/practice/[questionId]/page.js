'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import { useRouter, useSearchParams } from 'next/navigation';

function HtmlBlock({ html }) {
  if (!html) return null;
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

const LIST_KEY = 'practice_question_list';
const LIST_META_KEY = 'practice_question_list_meta_v1'; // stores { queryKey, updatedAt, count }

function normalizeQueryKey(sp) {
  // Only include the filter/search params that affect the question list.
  // This MUST match the param names used by /practice (and /api/questions).
  const keys = ['difficulty', 'score_bands', 'domain', 'topic', 'marked_only', 'q'];

  const parts = [];
  for (const k of keys) {
    const v = sp.get(k);
    if (v === null) continue;
    const trimmed = String(v).trim();
    if (!trimmed) continue;
    parts.push(`${k}=${trimmed}`);
  }

  // Stable ordering
  parts.sort();
  return parts.join('&');
}

function hasAnyListParams(sp) {
  return Boolean(
    sp.get('difficulty') ||
      sp.get('score_bands') ||
      sp.get('domain') ||
      sp.get('topic') ||
      sp.get('marked_only') ||
      sp.get('q')
  );
}

export default function QuestionPage({ params }) {
  const questionId = params?.questionId;

  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Answer input
  const [selected, setSelected] = useState(null); // option uuid for mcq
  const [responseText, setResponseText] = useState(''); // for spr

  // UX state
  const [msg, setMsg] = useState(null); // {kind:'ok'|'danger'|'info', text:string}
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Explanation is completely decoupled from Check Answer
  const [showExplanation, setShowExplanation] = useState(false);

  // Track time on question
  const [startTs, setStartTs] = useState(Date.now());

  const qType = data?.version?.question_type; // "mcq" | "spr"
  const options = data?.options || [];

  // Session list / navigation
  const [questionList, setQuestionList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [showMap, setShowMap] = useState(false);

  // Prevent duplicate list builds on rerenders
  const buildingListRef = useRef(false);

  async function loadQuestion({ resetUI = true } = {}) {
    setLoading(true);

    if (resetUI) {
      setMsg(null);
      setSelected(null);
      setResponseText('');
      setHasSubmitted(false);
      setShowExplanation(false);
      setStartTs(Date.now());
    }

    try {
      const res = await fetch('/api/questions/' + questionId, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load question');
      setData(json);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  function readStoredList() {
    try {
      const stored = localStorage.getItem(LIST_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeStoredList(ids, queryKey) {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(ids));
      localStorage.setItem(
        LIST_META_KEY,
        JSON.stringify({ queryKey, updatedAt: Date.now(), count: ids.length })
      );
    } catch {
      // ignore storage failures
    }
  }

  function readStoredMeta() {
    try {
      const raw = localStorage.getItem(LIST_META_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function buildFullFilteredListFromQuery() {
    // Build the full list of IDs matching current filters (NOT limited to 25).
    // Requires the filters/search to be present in the URL query string.
    const sp = searchParams;
    const queryKey = normalizeQueryKey(sp);

    // Cache hit: if we already built the same queryKey, use stored list.
    const meta = readStoredMeta();
    const cached = readStoredList();
    if (meta?.queryKey === queryKey && cached.length > 0) {
      setQuestionList(cached);
      const idx = cached.indexOf(questionId);
      setCurrentIndex(idx >= 0 ? idx : null);
      return;
    }

    if (buildingListRef.current) return;
    buildingListRef.current = true;

    try {
      const pageSize = 100; // API cap currently 100
      let offset = 0;
      const allIds = [];

      while (true) {
        const params = new URLSearchParams(sp.toString());
        params.set('limit', String(pageSize));
        params.set('offset', String(offset));

        const res = await fetch('/api/questions?' + params.toString(), { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to build practice list');

        const items = json.items || [];
        for (const it of items) {
          if (it?.question_id) allIds.push(it.question_id);
        }

        if (items.length < pageSize) break;
        offset += pageSize;

        // Hard safety stop (prevents accidental infinite loops if API misbehaves)
        if (offset > 50000) break;
      }

      // If the filter returns nothing, fall back to existing stored list (or empty)
      if (allIds.length === 0) {
        const fallback = readStoredList();
        setQuestionList(fallback);
        const idx = fallback.indexOf(questionId);
        setCurrentIndex(idx >= 0 ? idx : null);
        return;
      }

      writeStoredList(allIds, queryKey);

      setQuestionList(allIds);
      const idx = allIds.indexOf(questionId);
      setCurrentIndex(idx >= 0 ? idx : null);
    } finally {
      buildingListRef.current = false;
    }
  }

  function hydrateListAndIndex() {
    // If filters are provided in the URL, build full filtered list.
    // Otherwise, fall back to whatever /practice stored (typically 25).
    if (hasAnyListParams(searchParams)) {
      buildFullFilteredListFromQuery().catch((e) => {
        setMsg({ kind: 'danger', text: e.message });
        // fall back to stored list on error
        const fallback = readStoredList();
        setQuestionList(fallback);
        const idx = fallback.indexOf(questionId);
        setCurrentIndex(idx >= 0 ? idx : null);
      });
      return;
    }

    const list = readStoredList();
    setQuestionList(list);
    const idx = list.indexOf(questionId);
    setCurrentIndex(idx >= 0 ? idx : null);
  }

  useEffect(() => {
    if (!questionId) return;
    hydrateListAndIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, searchParams]);

  useEffect(() => {
    if (!questionId) return;
    loadQuestion({ resetUI: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  async function toggleMarked() {
    const next = !(data?.status?.marked_for_review ?? false);

    // optimistic UI
    setData((prev) => ({
      ...prev,
      status: { ...(prev?.status || {}), marked_for_review: next },
    }));

    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          marked_for_review: next,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to update status');
    } catch (e) {
      // rollback on failure
      setData((prev) => ({
        ...prev,
        status: { ...(prev?.status || {}), marked_for_review: !next },
      }));
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function submitAttempt() {
    if (!data?.version) return;

    // Validate input
    if (qType === 'mcq') {
      if (!selected) {
        setMsg({ kind: 'danger', text: 'Select an answer choice first.' });
        return;
      }
    } else if (qType === 'spr') {
      if (!responseText.trim()) {
        setMsg({ kind: 'danger', text: 'Type an answer first.' });
        return;
      }
    } else {
      setMsg({ kind: 'danger', text: 'Unsupported question type.' });
      return;
    }

    setSubmitting(true);
    setMsg(null);

    const time_spent_ms = Date.now() - startTs;

    try {
      const payload =
        qType === 'spr'
          ? { question_id: questionId, response_text: responseText, time_spent_ms }
          : { question_id: questionId, selected_option_id: selected, time_spent_ms };

      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Submit failed');

      setHasSubmitted(true);
      setMsg({
        kind: json.is_correct ? 'ok' : 'danger',
        text: json.is_correct ? 'Correct ✅' : 'Incorrect ❌',
      });

      // Update status counts locally (fast feedback)
      setData((prev) => {
        const prevAttempts = prev?.status?.attempts_count || 0;
        const prevCorrect = prev?.status?.correct_attempts_count || 0;

        return {
          ...prev,
          status: {
            ...(prev?.status || {}),
            is_done: true,
            attempts_count: json.attempts_count ?? (prevAttempts + 1),
            correct_attempts_count:
              json.correct_attempts_count ?? (prevCorrect + (json.is_correct ? 1 : 0)),
            last_is_correct: json.is_correct,
            last_attempt_at: new Date().toISOString(),
          },
        };
      });

      // IMPORTANT: do NOT open explanation here
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  function resetAnswerUI() {
    setMsg(null);
    setSelected(null);
    setResponseText('');
    setHasSubmitted(false);
    setShowExplanation(false);
    setStartTs(Date.now());
  }

  function goToIndex(idx) {
    if (!questionList.length) return;
    if (idx < 0 || idx >= questionList.length) return;
    const qs = searchParams?.toString();
    router.push(`/practice/${questionList[idx]}${qs ? `?${qs}` : ''}`);
  }

  function goPrev() {
    if (currentIndex > 0) goToIndex(currentIndex - 1);
  }

  function goNext() {
    if (currentIndex < questionList.length - 1) goToIndex(currentIndex + 1);
  }

  const headerPills = useMemo(() => {
    const s = data?.status || {};
    return [
      { label: 'Attempts', value: s.attempts_count ?? 0 },
      { label: 'Correct', value: s.correct_attempts_count ?? 0 },
      { label: 'Done', value: s.is_done ? 'Yes' : 'No' },
      { label: 'Marked', value: s.marked_for_review ? 'Yes' : 'No' },
    ];
  }, [data]);

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="h1" style={{ marginBottom: 2 }}>
            Practice Question
          </div>
          <div className="muted small">
            <Link href="/practice" className="muted">
              ← Back to list
            </Link>
          </div>
        </div>

        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          {headerPills.map((p) => (
            <span key={p.label} className="pill">
              <span className="muted">{p.label}</span>
              <span className="kbd">{p.value}</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ height: 14 }} />

      {questionList.length > 0 && currentIndex !== null && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn secondary" onClick={goPrev} disabled={currentIndex === 0}>
                ← Previous
              </button>

              <button className="btn secondary" onClick={() => setShowMap(true)}>
                {currentIndex + 1} / {questionList.length}
              </button>

              <button
                className="btn secondary"
                onClick={goNext}
                disabled={currentIndex === questionList.length - 1}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <Toast kind={msg?.kind} message={msg?.text} />

        {loading ? (
          <div className="muted">Loading…</div>
        ) : !data?.version ? (
          <div className="muted">No question data found.</div>
        ) : (
          <>
            {/* Stimulus + Stem */}
            {data.version.stimulus_html ? (
              <>
                <div className="h2">Passage / Data</div>
                <HtmlBlock html={data.version.stimulus_html} />
                <hr />
              </>
            ) : null}

            <div className="h2">Question</div>
            <HtmlBlock html={data.version.stem_html} />

            <hr />

            {/* Answer area */}
            {qType === 'mcq' ? (
              <div>
                <div className="h2">Answer choices</div>

                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  {options
                    .slice()
                    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
                    .map((opt) => {
                      const isSelected = selected === opt.id;
                      const locked = hasSubmitted; // lock after submit
                      return (
                        <div
                          key={opt.id}
                          className={'option' + (isSelected ? ' selected' : '')}
                          onClick={() => {
                            if (locked) return;
                            setSelected(opt.id);
                          }}
                          style={{ cursor: locked ? 'default' : 'pointer' }}
                        >
                          <div className="pill" style={{ minWidth: 54, justifyContent: 'center' }}>
                            {opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0))}
                          </div>
                          <div style={{ flex: 1 }}>
                            <HtmlBlock html={opt.content_html} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : qType === 'spr' ? (
              <div>
                <div className="h2">Your answer</div>
                <input
                  className="input"
                  value={responseText}
                  onChange={(e) => {
                    if (hasSubmitted) return;
                    setResponseText(e.target.value);
                  }}
                  placeholder="Type your answer…"
                  disabled={hasSubmitted}
                  style={hasSubmitted ? { opacity: 0.75 } : undefined}
                />
              </div>
            ) : (
              <div className="muted">Unsupported question type: {String(qType)}</div>
            )}

            <div style={{ height: 14 }} />

            {/* Primary controls */}
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="row" style={{ alignItems: 'center' }}>
                <button className="btn" onClick={submitAttempt} disabled={submitting || loading}>
                  {submitting ? 'Checking…' : 'Check Answer'}
                </button>

                <button
                  className="btn secondary"
                  onClick={toggleMarked}
                  disabled={loading}
                  title="Mark this question to revisit later"
                >
                  {data?.status?.marked_for_review ? 'Unmark' : 'Mark for review'}
                </button>

                <button className="btn secondary" onClick={resetAnswerUI} disabled={submitting || loading}>
                  Reset
                </button>
              </div>

              <div className="muted small">{hasSubmitted ? 'Submitted' : 'Not submitted'}</div>
            </div>

            <hr />

            {/* Lower navigation bar */}
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="row" style={{ alignItems: 'center' }}>
                <button
                  className="btn secondary"
                  onClick={() => setShowExplanation((v) => !v)}
                  disabled={!hasSubmitted || !data?.version?.rationale_html}
                  title={!hasSubmitted ? 'Submit an answer to unlock explanation' : ''}
                >
                  {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                </button>
              </div>

              <div className="row" style={{ alignItems: 'center' }}>
                <button
                  className="btn secondary"
                  onClick={() => loadQuestion({ resetUI: true })}
                  disabled={submitting}
                >
                  Reload question
                </button>
              </div>
            </div>

            {/* Explanation section */}
            {showExplanation && data?.version?.rationale_html ? (
              <>
                <hr />
                <div className="h2">Explanation</div>
                <HtmlBlock html={data.version.rationale_html} />
              </>
            ) : null}
          </>
        )}
      </div>

      {showMap && (
        <div className="modalOverlay">
          <div className="modalCard">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h2">Question Map</div>
              <button className="btn secondary" onClick={() => setShowMap(false)}>
                Close
              </button>
            </div>

            <div className="questionGrid">
              {questionList.map((id, idx) => (
                <button
                  key={id}
                  className={'mapItem' + (idx === currentIndex ? ' active' : '')}
                  onClick={() => goToIndex(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
