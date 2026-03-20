'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Filters from '../../components/Filters';
import Toast from '../../components/Toast';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

function AttemptedBadge({ is_done }) {
  return (
    <span className="qAttempted">{is_done ? 'Attempted: Yes' : 'Attempted: No'}</span>
  );
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
  if (filters.undone_only) p.set('undone_only', 'true');
  if (filters.show_broken) p.set('only_broken', 'true');
  else p.set('hide_broken', 'true');

  if (search.trim()) p.set('q', search.trim());

  for (const [k, v] of Object.entries(extra)) p.set(k, v);

  return p;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PracticePage() {
  const router = useRouter();
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const loadIdRef = useRef(0);
  const [userRole, setUserRole] = useState(null);

  // Fetch current user's role
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.role) setUserRole(d.role); })
      .catch(() => {});
  }, []);

  // Teacher Mode vs Training Mode toggle (only effective for non-students)
  const isPrivilegedRole = userRole && userRole !== 'student';
  const [teacherMode, setTeacherMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sat_teacher_mode') === '1';
    }
    return false;
  });
  const effectiveTeacherMode = isPrivilegedRole && teacherMode;

  function toggleTeacherMode() {
    setTeacherMode((prev) => {
      const next = !prev;
      localStorage.setItem('sat_teacher_mode', next ? '1' : '0');
      return next;
    });
  }

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Session query string: filters + search, no pagination. Passed into question detail page.
  const sessionQueryString = useMemo(() => {
    const p = buildParams(filters, debouncedSearch, { session: '1' });
    return p.toString();
  }, [filters, debouncedSearch]);

  // Deterministic session id for localStorage-backed navigation
  const sessionId = useMemo(() => {
    let h = 5381;
    const s = sessionQueryString || '';
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }, [sessionQueryString]);

  async function handleStartSession(sessionFilters, randomize) {
    setMsg(null);
    try {
      const params = buildParams(sessionFilters, '', { limit: '5000', offset: '0' });
      const res  = await fetch('/api/questions?' + params.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load questions');

      let items = (json.items || []).filter((q) => q?.question_id);
      if (items.length === 0) {
        setMsg({ kind: 'danger', text: 'No questions match the current filters.' });
        return;
      }
      if (randomize) items = shuffleArray(items);
      const ids = items.map((q) => q.question_id);

      // Build a session ID from filter params (no search text)
      const sessionQs = buildParams(sessionFilters, '', { session: '1' }).toString();
      let h = 5381;
      for (let i = 0; i < sessionQs.length; i++) h = ((h << 5) + h) ^ sessionQs.charCodeAt(i);
      const sid = (h >>> 0).toString(36);

      // Cache question IDs + full item metadata in localStorage for prev/next navigation + map
      localStorage.setItem(`practice_session_${sid}`, ids.join(','));
      localStorage.setItem(`practice_session_${sid}_items`, JSON.stringify(items));
      localStorage.setItem(
        `practice_session_${sid}_meta`,
        JSON.stringify({
          sessionQueryString: sessionQs,
          totalCount: ids.length,
          cachedCount: ids.length,
          cachedAt: new Date().toISOString(),
        })
      );

      // Navigate to the first question
      const firstId = ids[0];
      const tmParam = effectiveTeacherMode ? '&tm=1' : '';
      router.push(
        `/practice/${encodeURIComponent(firstId)}?${sessionQs}&sid=${sid}&t=${ids.length}&o=0&p=0&i=1${tmParam}`
      );
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  const load = useCallback(async () => {
    if (!debouncedSearch.trim()) {
      setRows([]);
      setTotalCount(0);
      return;
    }

    const thisLoadId = ++loadIdRef.current;
    setLoading(true);
    setMsg(null);

    try {
      const params = buildParams(filters, debouncedSearch, {
        limit: '25',
        offset: String(page * 25),
      });

      const res = await fetch('/api/questions?' + params.toString(), { cache: 'no-store' });
      const json = await res.json();

      // Ignore stale responses from earlier requests
      if (loadIdRef.current !== thisLoadId) return;

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
              const fullParams = buildParams(filters, debouncedSearch, {
                offset: '0',
                limit: String(Math.min(Math.max(Number(json.totalCount || 0), 25), 5000)),
              });

              const r2 = await fetch('/api/questions?' + fullParams.toString(), { cache: 'no-store' });
              const j2 = await r2.json();
              if (!r2.ok) throw new Error(j2?.error || 'Failed to cache session ids');

              const allItems = (j2.items || []).filter((q) => q?.question_id);
              const all = allItems.map((q) => q.question_id);
              localStorage.setItem(fullKey, all.join(','));
              localStorage.setItem(`${fullKey}_items`, JSON.stringify(allItems));
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
      if (loadIdRef.current === thisLoadId) {
        setMsg({ kind: 'danger', text: e.message });
      }
    } finally {
      if (loadIdRef.current === thisLoadId) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, filters, page, sessionId, sessionQueryString]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setPage(0);
  }, [filters, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="container">
      {/* Mode toggle — only for teachers/managers/admins */}
      {userRole && userRole !== 'student' && (
        <div className="modeToggleBar">
          <button
            className={`modeToggleBtn ${teacherMode ? 'teacherActive' : 'trainingActive'}`}
            onClick={toggleTeacherMode}
          >
            {teacherMode ? 'Teacher Mode' : 'Training Mode'}
          </button>
        </div>
      )}

      {/* Full-width filter panel */}
      <Filters onChange={setFilters} onStartSession={handleStartSession} userRole={userRole} />
      {msg && <Toast kind={msg?.kind} message={msg?.text} />}

      {/* Search row */}
      <div className="card" style={{ marginTop: 12, padding: '12px 16px' }}>
        <div className="searchRow">
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by question ID, stem, or stimulus…"
          />
          <button className="btn secondary" onClick={() => setSearch('')} disabled={!search}>
            Clear
          </button>
        </div>
      </div>

      {/* Question list — only shown when search has text */}
      {!search.trim() ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 32, padding: '20px 0' }}>
          Enter a search term above to find matching questions.
        </p>
      ) : (
        <div className="card" style={{ marginTop: 12, minWidth: 320 }}>
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

                const tmQ = effectiveTeacherMode ? '&tm=1' : '';
                const href = `/practice/${encodeURIComponent(qid)}?${sessionQueryString}&sid=${sessionId}&t=${totalCount}&o=${offset}&p=${pos}&i=${i}${tmQ}`;

                const diffClass = q.difficulty === 1 ? ' easy' : q.difficulty === 2 ? ' medium' : q.difficulty === 3 ? ' hard' : '';

                return (
                  <Link key={qid} href={href} className={`option qRow${diffClass}`}>
                    <div className="qRowMain">
                      <div className="qRowTop">
                        <span className="qKey">{q.question_key || qid}</span>
                        <div className="qBadges">
                          {q.difficulty != null && (
                            <span className="pill qPill qDiffPill">{DIFF_LABEL[q.difficulty] ?? `D${q.difficulty}`}</span>
                          )}
                          {q.score_band != null && (
                            <span className="pill qPill">Score Band {q.score_band}</span>
                          )}
                          {!effectiveTeacherMode && <AttemptedBadge is_done={q.is_done} />}
                          {!effectiveTeacherMode && q.marked_for_review && (
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
      )}
    </main>
  );
}
