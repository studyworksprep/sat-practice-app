'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import HtmlBlock from '../../../components/HtmlBlock';

function formatCorrectText(ct) {
  if (!ct) return null;
  if (Array.isArray(ct)) return ct;
  if (typeof ct === 'string') {
    const t = ct.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [t];
  }
  return [String(ct)];
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function PracticeQuestionPage() {
  const { questionId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const [selected, setSelected] = useState(null);
  const [responseText, setResponseText] = useState('');

  const [showExplanation, setShowExplanation] = useState(false);

  // Navigation meta (from list -> question)
  const [total, setTotal] = useState(null); // total in filtered session
  const [index1, setIndex1] = useState(null); // 1-based index in session

  // Cache: current page ids (25) for index-based fallback navigation
  const [pageIds, setPageIds] = useState([]); // ids for current offset page
  const [pageOffset, setPageOffset] = useState(0); // 0,25,50,...

  // Question Map (windowed) — fetch IDs on demand when opened
  const MAP_PAGE_SIZE = 100; // must be <= /api/questions limit cap (confirmed max 100)
  const [showMap, setShowMap] = useState(false);
  const [mapOffset, setMapOffset] = useState(0); // 0,100,200,...
  const [mapIds, setMapIds] = useState([]); // ids for current map window
  const [mapLoading, setMapLoading] = useState(false);
  const [jumpTo, setJumpTo] = useState('');

  const startedAtRef = useRef(Date.now());

  // Keep the "session filter" params carried over from the list page
  const sessionParams = useMemo(() => {
    const keys = ['difficulty', 'score_bands', 'domain', 'topic', 'marked_only', 'q', 'session'];
    const p = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v !== null && v !== '') p.set(k, v);
    }
    return p;
  }, [searchParams]);

  const sessionParamsString = useMemo(() => sessionParams.toString(), [sessionParams]);

  // support "i" (1-based index) for neighbor navigation
  function buildHref(targetId, t, o, p, i) {
    const qs = new URLSearchParams(sessionParams);
    if (t != null) qs.set('t', String(t));
    if (o != null) qs.set('o', String(o));
    if (p != null) qs.set('p', String(p));
    if (i != null) qs.set('i', String(i));
    return `/practice/${targetId}?${qs.toString()}`;
  }

  async function fetchQuestion() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/questions/${questionId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load question');

      setData(json);

      if (json?.status?.status_json?.last_selected_option_id)
        setSelected(json.status.status_json.last_selected_option_id);
      else setSelected(null);

      if (json?.status?.status_json?.last_response_text)
        setResponseText(json.status.status_json.last_response_text);
      else setResponseText('');

      startedAtRef.current = Date.now();
      setShowExplanation(false);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function fetchPageIds(offset) {
    const key = `practice_${sessionParamsString}_page_${offset}`;

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', '25');
    apiParams.set('offset', String(offset));

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch page');

    const ids = (json.items || []).map((it) => it.question_id).filter(Boolean);

    localStorage.setItem(key, JSON.stringify(ids));
    return ids;
  }

  async function fetchMapIds(offset) {
    // Separate cache namespace so we don’t collide with the 25-per-page cache
    const key = `practice_${sessionParamsString}_map_${offset}`;

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', String(MAP_PAGE_SIZE));
    apiParams.set('offset', String(offset));

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch map ids');

    const ids = (json.items || []).map((it) => it.question_id).filter(Boolean);

    localStorage.setItem(key, JSON.stringify(ids));
    return ids;
  }

  async function loadMapPage(offset) {
    setMapLoading(true);
    try {
      const safeOffset = Math.max(0, offset);
      const ids = await fetchMapIds(safeOffset);
      setMapIds(ids);
      setMapOffset(safeOffset);
    } finally {
      setMapLoading(false);
    }
  }

  async function openMap() {
    // Only meaningful when we have a filtered session context
    const hasSession = sessionParams.get('session') === '1';
    if (!hasSession) return;

    try {
      await ensureTotalIfMissing();

      const iFromUrl = Number(searchParams.get('i'));
      const i = Number.isFinite(iFromUrl) && iFromUrl >= 1 ? iFromUrl : index1 || 1;
      const startOffset = Math.floor((Math.max(1, i) - 1) / MAP_PAGE_SIZE) * MAP_PAGE_SIZE;

      setShowMap(true);
      await loadMapPage(startOffset);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
      setShowMap(true);
      await loadMapPage(0);
    }
  }

  useEffect(() => {
    if (!showMap) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowMap(false);
    };
    window.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showMap]);

  // look for "i" (index) in URL
  function primeNavMetaFromUrl() {
    const t = Number(searchParams.get('t'));
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));
    const i = Number(searchParams.get('i'));

    if (Number.isFinite(t) && t >= 0) setTotal(t);
    if (Number.isFinite(o) && o >= 0) setPageOffset(o);

    if (Number.isFinite(i) && i >= 1) setIndex1(i);
    else if (Number.isFinite(o) && o >= 0 && Number.isFinite(p) && p >= 0) setIndex1(o + p + 1);
  }

  async function ensureCurrentPageIds() {
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));

    if (!Number.isFinite(o) || o < 0) return;
    setPageOffset(o);

    const ids = await fetchPageIds(o);
    setPageIds(ids);

    if (!Number.isFinite(p) || p < 0) {
      const idx = ids.findIndex((id) => String(id) === String(questionId));
      if (idx >= 0) setIndex1(o + idx + 1);
    }
  }

  async function ensureTotalIfMissing() {
    if (total != null) return;

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', '1');
    apiParams.set('offset', '0');

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to get total');
    setTotal(Number(json.totalCount || 0));
  }

  async function goToIndex(targetIndex1) {
    if (total != null) {
      if (targetIndex1 < 1 || targetIndex1 > total) return;
    } else {
      if (targetIndex1 < 1) return;
    }

    const targetOffset = Math.floor((targetIndex1 - 1) / 25) * 25;
    const targetPos = (targetIndex1 - 1) % 25;

    const ids = await fetchPageIds(targetOffset);
    const targetId = ids[targetPos];
    if (!targetId) return;

    setPageOffset(targetOffset);
    setPageIds(ids);
    setIndex1(targetIndex1);

    router.push(buildHref(targetId, total, targetOffset, targetPos, targetIndex1));
  }

  async function submitAttempt() {
    if (!data) return;

    const qTypeLocal = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    const body = {
      question_id: data.question_id,
      selected_option_id: qTypeLocal === 'mcq' ? selected : null,
      response_text: qTypeLocal === 'spr' ? responseText : null,
      time_spent_ms,
    };

    try {
      setMsg(null);
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit attempt');

      await fetchQuestion();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function toggleMarkForReview() {
    if (!data?.question_id) return;
    const next = !Boolean(data?.status?.marked_for_review);
    try {
      setMsg(null);

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: {
            ...(prev.status || {}),
            marked_for_review: next,
          },
        };
      });

      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: data.question_id, marked_for_review: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to update status');

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: {
            ...(prev.status || {}),
            ...(json.status || {}),
          },
        };
      });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  // Prefer neighbor RPC if present; fallback to index-based
  async function goNext() {
    try {
      setMsg(null);

      const apiParams = new URLSearchParams(sessionParams);
      apiParams.delete('session');

      const res = await fetch(`/api/questions/${questionId}/neighbors?` + apiParams.toString(), { cache: 'no-store' });
      const json = await res.json();

      if (res.ok && json?.next_question_id) {
        const nextIndex1 = index1 != null ? index1 + 1 : null;

        // Preserve "o/p/i" when we can; otherwise just navigate
        if (nextIndex1 != null) {
          const nextOffset = Math.floor((nextIndex1 - 1) / 25) * 25;
          const nextPos = (nextIndex1 - 1) % 25;
          router.push(buildHref(json.next_question_id, total, nextOffset, nextPos, nextIndex1));
        } else {
          router.push(buildHref(json.next_question_id, total, null, null, null));
        }
        return;
      }

      // Fallback: index-based
      if (index1 != null) await goToIndex(index1 + 1);
    } catch (e) {
      // final fallback: index-based
      if (index1 != null) await goToIndex(index1 + 1);
    }
  }

  async function goPrev() {
    try {
      setMsg(null);

      const apiParams = new URLSearchParams(sessionParams);
      apiParams.delete('session');

      const res = await fetch(`/api/questions/${questionId}/neighbors?` + apiParams.toString(), { cache: 'no-store' });
      const json = await res.json();

      if (res.ok && json?.prev_question_id) {
        const prevIndex1 = index1 != null ? index1 - 1 : null;

        if (prevIndex1 != null) {
          const prevOffset = Math.floor((prevIndex1 - 1) / 25) * 25;
          const prevPos = (prevIndex1 - 1) % 25;
          router.push(buildHref(json.prev_question_id, total, prevOffset, prevPos, prevIndex1));
        } else {
          router.push(buildHref(json.prev_question_id, total, null, null, null));
        }
        return;
      }

      // Fallback: index-based
      if (index1 != null) await goToIndex(index1 - 1);
    } catch (e) {
      if (index1 != null) await goToIndex(index1 - 1);
    }
  }

  const prevDisabled = index1 != null ? index1 <= 1 : false;
  const nextDisabled = total != null && index1 != null ? index1 >= total : false;

  // init on mount / when questionId changes
  useEffect(() => {
    primeNavMetaFromUrl();
    ensureCurrentPageIds();
    ensureTotalIfMissing();
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  if (loading) {
    return (
      <main className="container">
        <div className="card">
          <div className="muted">Loading…</div>
        </div>
      </main>
    );
  }

  if (!data?.question_id) {
    return (
      <main className="container">
        <div className="card">
          {msg ? <Toast kind={msg.kind} text={msg.text} /> : null}
          <div className="muted">No question data found.</div>
          <div style={{ height: 10 }} />
          <Link className="btn secondary" href="/practice">
            ← Back to list
          </Link>
        </div>
      </main>
    );
  }

  const qType = String(data?.version?.question_type || data?.question_type || '').toLowerCase();

  const stemText = stripHtml(data?.version?.stem_html || data?.stem_html);
  const stimulusText = stripHtml(data?.version?.stimulus_html || data?.stimulus_html);

  const correctText = formatCorrectText(data?.correct?.correct_text);

  return (
    <main className="container">
      <div className="card">
        {msg ? <Toast kind={msg.kind} text={msg.text} /> : null}

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link className="btn secondary" href="/practice">
              ← Back to list
            </Link>

            <button
              type="button"
              className="pill mapTrigger"
              onClick={openMap}
              disabled={sessionParams.get('session') !== '1'}
              aria-label="Open question map"
              title={sessionParams.get('session') === '1' ? 'Open question map' : 'Map available when opened from the practice list'}
            >
              {index1 != null && total != null ? (
                <>
                  <span className="kbd">{index1}</span> / <span className="kbd">{total}</span>
                </>
              ) : total != null ? (
                <>
                  <span className="kbd">—</span> / <span className="kbd">{total}</span>
                </>
              ) : (
                <span className="muted">…</span>
              )}
              <span className="mapChevron" aria-hidden="true">▾</span>
            </button>
          </div>
        </div>

        <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="pill">
            <span className="muted">Type</span> <span className="kbd">{qType || '—'}</span>
          </div>

          <button className="pill" onClick={toggleMarkForReview} type="button">
            <span className="muted">Marked</span>{' '}
            <span className="kbd">{data?.status?.marked_for_review ? 'Yes' : 'No'}</span>
          </button>
        </div>

        <hr />

        {data?.version?.stimulus_html ? (
          <>
            <div className="h2">Stimulus</div>
            <HtmlBlock html={data.version.stimulus_html} />
            <div style={{ height: 14 }} />
          </>
        ) : null}

        <div className="h2">Question</div>
        <HtmlBlock html={data?.version?.stem_html || data?.stem_html} />

        <div style={{ height: 14 }} />

        {qType === 'mcq' ? (
          <>
            <div className="h2">Answer</div>

            <div className="optionList">
              {(data.options || []).map((opt) => {
                const isSelected = String(selected) === String(opt.id);
                const isCorrect =
                  data?.correct?.correct_option_id && String(opt.id) === String(data.correct.correct_option_id);

                const show = Boolean(showExplanation);
                const cls = [
                  'option',
                  show && isCorrect ? 'correct' : '',
                  show && isSelected && !isCorrect ? 'incorrect' : '',
                  show && !isSelected && isCorrect ? 'revealCorrect' : '',
                  !show && isSelected ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={cls}
                    onClick={() => setSelected(opt.id)}
                    disabled={showExplanation}
                  >
                    <span className="optionBadge">{opt.label}</span>
                    <span className="optionText">
                      <HtmlBlock html={opt.option_html} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="btnRow">
              <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
                Prev
              </button>

              <button className="btn" onClick={submitAttempt} disabled={!selected}>
                Check
              </button>

              <button className="btn secondary" onClick={goNext} disabled={nextDisabled}>
                Next
              </button>
            </div>

            <div style={{ height: 10 }} />

            <button
              className="btn secondary"
              type="button"
              onClick={() => setShowExplanation((s) => !s)}
              disabled={!data?.correct}
            >
              {showExplanation ? 'Hide explanation' : 'Show explanation'}
            </button>
          </>
        ) : (
          <>
            <div className="h2">Your response</div>

            <input
              className="input"
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Type your answer…"
            />

            <div className="btnRow">
              <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
                Prev
              </button>

              <button className="btn" onClick={submitAttempt} disabled={!responseText}>
                Check
              </button>

              <button className="btn secondary" onClick={goNext} disabled={nextDisabled}>
                Next
              </button>
            </div>

            <div style={{ height: 10 }} />

            <button
              className="btn secondary"
              type="button"
              onClick={() => setShowExplanation((s) => !s)}
              disabled={!data?.correct}
            >
              {showExplanation ? 'Hide explanation' : 'Show explanation'}
            </button>
          </>
        )}

        {showExplanation ? (
          <>
            <div style={{ height: 16 }} />
            <hr />
            <div style={{ height: 12 }} />

            <div className="h2">Correct answer</div>
            {qType === 'mcq' ? (
              <div className="pill">
                <span className="kbd">{data?.correct?.correct_label ?? '—'}</span>
              </div>
            ) : (
              <div className="pill">
                <span className="kbd">{correctText ? correctText.join(', ') : '—'}</span>
              </div>
            )}

            {data?.version?.rationale_html ? (
              <>
                <div style={{ height: 12 }} />
                <div className="h2">Explanation</div>
                <HtmlBlock html={data.version.rationale_html} />
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {showMap ? (
        <div
          className="modalOverlay"
          onClick={() => setShowMap(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Question map"
        >
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <div className="h2" style={{ margin: 0 }}>
                  Question Map
                </div>
                <div className="muted small">
                  {total != null ? (
                    <>
                      Showing <span className="kbd">{mapOffset + 1}</span>–<span className="kbd">{Math.min(mapOffset + MAP_PAGE_SIZE, total)}</span> of{' '}
                      <span className="kbd">{total}</span>
                    </>
                  ) : (
                    <>
                      Showing <span className="kbd">{mapOffset + 1}</span>–<span className="kbd">{mapOffset + MAP_PAGE_SIZE}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="btnRow">
                <input
                  className="input"
                  style={{ width: 140 }}
                  value={jumpTo}
                  onChange={(e) => setJumpTo(e.target.value)}
                  placeholder="Jump to #"
                  inputMode="numeric"
                />
                <button
                  className="btn"
                  disabled={mapLoading}
                  onClick={async () => {
                    const n = Number(String(jumpTo).trim());
                    if (!Number.isFinite(n) || n < 1) return;
                    await goToIndex(n);
                    setShowMap(false);
                  }}
                >
                  Go
                </button>

                <button className="btn secondary" onClick={() => setShowMap(false)}>
                  Close
                </button>
              </div>
            </div>

            <hr />

            <div
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            >
              <div className="btnRow">
                <button
                  className="btn secondary"
                  onClick={() => loadMapPage(mapOffset - MAP_PAGE_SIZE)}
                  disabled={mapLoading || mapOffset <= 0}
                >
                  Prev
                </button>

                <button
                  className="btn secondary"
                  onClick={() => loadMapPage(mapOffset + MAP_PAGE_SIZE)}
                  disabled={mapLoading || (total != null ? mapOffset + MAP_PAGE_SIZE >= total : false)}
                >
                  Next
                </button>
              </div>

              <div className="pill">
                <span className="muted">Current</span> <span className="kbd">{index1 ?? '—'}</span>
              </div>
            </div>

            <div className="questionGrid" style={{ marginTop: 12 }}>
              {mapLoading ? (
                <div className="muted" style={{ gridColumn: '1 / -1' }}>
                  Loading…
                </div>
              ) : mapIds.length === 0 ? (
                <div className="muted" style={{ gridColumn: '1 / -1' }}>
                  No questions in this range.
                </div>
              ) : (
                mapIds.map((id, pos) => {
                  const i = mapOffset + pos + 1; // 1-based in full session
                  const active = index1 != null && i === index1;

                  return (
                    <button
                      key={String(id)}
                      type="button"
                      className={'mapItem' + (active ? ' active' : '')}
                      onClick={() => {
                        const o25 = Math.floor((i - 1) / 25) * 25;
                        const p25 = (i - 1) % 25;

                        setShowMap(false);
                        router.push(buildHref(id, total, o25, p25, i));
                      }}
                      title={`Go to #${i}`}
                    >
                      {i}
                    </button>
                  );
                })
              )}
            </div>

            {total != null && total > MAP_PAGE_SIZE ? (
              <div className="muted small" style={{ marginTop: 10 }}>
                Showing {MAP_PAGE_SIZE} at a time. Use Prev/Next or “Jump to #” for fast navigation.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
