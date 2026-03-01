'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Filters from '../../components/Filters';
import Toast from '../../components/Toast';

// Icons for answer status and marked-for-review
function StatusIcon({ is_done, last_is_correct }) {
  if (!is_done) return <span className="qStatus unanswered" title="Not attempted">–</span>;
  if (last_is_correct) return <span className="qStatus correct" title="Correct">✓</span>;
  return <span className="qStatus wrong" title="Wrong">✗</span>;
}

function buildParams(filters, search, extra = {}) {
  const p = new URLSearchParams();

  const diffs = Array.isArray(filters.difficulties) ? filters.difficulties : [];
  if (diffs.length > 0) p.set('difficulties', diffs.join(','));

  const bands = Array.isArray(filters.score_bands) ? filters.score_bands : [];
  if (bands.length > 0) p.set('score_bands', bands.join(','));

  const doms = Array.isArray(filters.domains) ? filters.domains : [];
  if (doms.length > 0) p.set('domains', doms.join(','));

  const tops = Array.isArray(filters.topics) ? filters.topics : [];
  if (tops.length > 0) p.set('topics', tops.join(','));

  if (filters.wrong_only) p.set('wrong_only', 'true');
  if (filters.marked_only) p.set('marked_only', 'true');
  if (filters.broken_only) p.set('broken_only', 'true');

  if (search.trim()) p.set('q', search.trim());

  for (const [k, v] of Object.entries(extra)) p.set(k, v);

  return p;
}

export default function PracticePage() {
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  // Session query string: filters + search, no pagination. Passed into question detail page.
  const sessionQueryString = useMemo(() => {
    const p = buildParams(filters, search, { session: '1' });
    return p.toString();
  }, [filters, search]);

  // Deterministic session id for localStorage-backed navigation
  const sessionId = useMemo(() => {
    let h = 5381;
    const s = sessionQueryString || '';
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }, [sessionQueryString]);

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const params = buildParams(filters, search, {
        limit: '25',
        offset: String(page * 25),
      });

      const res = await fetch('/api/questions?' + params.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load questions');

      const items = json.items || [];
      setTotalCount(Number(json.totalCount || 0));
      setRows(items);

      // Cache this page's IDs for fast prev/next navigation
      if (items.length) {
        const ids = items.map((q) => q.question_id).filter(Boolean);
        const offset = page * 25;
        localStorage.setItem(`practice_${sessionQueryString}_page_${offset}`, JSON.stringify(ids));
      }

      // Cache the full ordered ID list on first page load
      if (page === 0 && Number(json.totalCount || 0) > 0) {
        const fullKey = `practice_session_${sessionId}`;
        const metaKey = `practice_session_${sessionId}_meta`;

        const existingMetaRaw = localStorage.getItem(metaKey);
        let existingOk = false;
        try {
          const meta = existingMetaRaw ? JSON.parse(existingMetaRaw) : null;
          existingOk = Boolean(
            meta &&
              meta.sessionQueryString === sessionQueryString &&
              meta.totalCount === Number(json.totalCount || 0)
          );
        } catch {
          existingOk = false;
        }

        if (!existingOk || !localStorage.getItem(fullKey)) {
          (async () => {
            try {
              const fullParams = buildParams(filters, search, {
                offset: '0',
                limit: String(Math.min(Math.max(Number(json.totalCount || 0), 25), 5000)),
              });

              const r2 = await fetch('/api/questions?' + fullParams.toString(), { cache: 'no-store' });
              const j2 = await r2.json();
              if (!r2.ok) throw new Error(j2?.error || 'Failed to cache session ids');

              const all = (j2.items || []).map((q) => q.question_id).filter(Boolean);
              localStorage.setItem(fullKey, all.join(','));
              localStorage.setItem(
                metaKey,
                JSON.stringify({
                  sessionQueryString,
                  totalCount: Number(json.totalCount || 0),
                  cachedCount: all.length,
                  cachedAt: new Date().toISOString(),
                })
              );
            } catch {
              // ignore caching errors; app falls back to neighbour scheme
            }
          })();
        }
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  // Reset pagination when filters/search change
  useEffect(() => {
    setPage(0);
  }, [filters, search]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters, search]);

  return (
    <main className="container">
      <div className="practiceGrid">
        <div style={{ minWidth: 320 }}>
          <Filters onChange={setFilters} />
          <Toast kind={msg?.kind} message={msg?.text} />
        </div>

        <div className="card" style={{ minWidth: 320 }}>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="h2">Questions</div>
              <p className="muted small" style={{ marginTop: 0 }}>
                Showing up to 25 per page. Click a row to practice.
              </p>
            </div>
            <div className="pill">
              Page <span className="kbd">{page + 1}</span>
            </div>
          </div>

          <div className="searchRow" style={{ marginTop: 10 }}>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search (Question ID, stem, stimulus)…"
            />
            <button className="btn secondary" onClick={() => setSearch('')} disabled={!search}>
              Clear
            </button>
          </div>

          <hr />

          {loading ? (
            <div className="muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="muted">No questions match your filters.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {rows.map((q, idx) => {
                const qid = q?.question_id ? String(q.question_id) : '';
                if (!qid) return null;

                const offset = page * 25;
                const pos = idx;
                const i = offset + pos + 1;

                const href = `/practice/${encodeURIComponent(qid)}?${sessionQueryString}&sid=${sessionId}&t=${totalCount}&o=${offset}&p=${pos}&i=${i}`;

                return (
                  <Link key={qid} href={href} className="option qRow">
                    <div className="qRowMain">
                      <div className="qRowTop">
                        <span className="qKey">{q.question_key || qid}</span>
                        <div className="qBadges">
                          {q.difficulty != null && (
                            <span className="pill qPill">D{q.difficulty}</span>
                          )}
                          {q.score_band != null && (
                            <span className="pill qPill">SB{q.score_band}</span>
                          )}
                          <StatusIcon is_done={q.is_done} last_is_correct={q.last_is_correct} />
                          {q.marked_for_review && (
                            <span className="qMark" title="Marked for review">★</span>
                          )}
                        </div>
                      </div>
                      <div className="muted small qRowSub">
                        {q.domain_name || '—'}
                        {q.skill_name ? ` · ${q.skill_name}` : ''}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <hr />

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button
              className="btn secondary"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              Prev
            </button>
            <button
              className="btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={loading || rows.length < 25}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
