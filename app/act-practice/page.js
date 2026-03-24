'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../components/Toast';
import { useTestType } from '../../lib/TestTypeContext';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const SECTION_LABELS = { english: 'English', math: 'Math', reading: 'Reading', science: 'Science' };

function AttemptedBadge({ is_done }) {
  return (
    <span className="qAttempted">{is_done ? 'Attempted: Yes' : 'Attempted: No'}</span>
  );
}

function buildParams(filters, search, extra = {}) {
  const p = new URLSearchParams();
  if (filters.sections?.length) p.set('sections', filters.sections.join(','));
  if (filters.categories?.length) p.set('categories', filters.categories.join(','));
  if (filters.subcategories?.length) p.set('subcategories', filters.subcategories.join(','));
  if (filters.difficulties?.length) p.set('difficulties', filters.difficulties.join(','));
  p.set('hide_broken', 'true');
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

export default function ActPracticePage() {
  const router = useRouter();
  const { testType } = useTestType();
  const [filters, setFilters] = useState({ sections: [], categories: [], subcategories: [], difficulties: [] });
  const [filterData, setFilterData] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const loadIdRef = useRef(0);
  const [randomize, setRandomize] = useState(false);

  // Redirect to /practice if user switches back to SAT
  useEffect(() => {
    if (testType === 'sat') router.replace('/practice');
  }, [testType, router]);

  // Load filter options
  useEffect(() => {
    fetch('/api/act/filters')
      .then(r => r.json())
      .then(d => setFilterData(d))
      .catch(() => {});
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Session query string for navigation
  const sessionQueryString = useMemo(() => {
    const p = buildParams(filters, debouncedSearch, { session: '1' });
    return p.toString();
  }, [filters, debouncedSearch]);

  const sessionId = useMemo(() => {
    let h = 5381;
    const s = sessionQueryString || '';
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }, [sessionQueryString]);

  async function handleStartSession() {
    setMsg(null);
    try {
      const params = buildParams(filters, '', { limit: '5000', offset: '0' });
      const res = await fetch('/api/act/questions?' + params.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load questions');

      let items = (json.items || []).filter(q => q?.question_id);
      if (items.length === 0) {
        setMsg({ kind: 'danger', text: 'No questions match the current filters.' });
        return;
      }
      if (randomize) items = shuffleArray(items);
      const ids = items.map(q => q.question_id);

      const sessionQs = buildParams(filters, '', { session: '1' }).toString();
      let h = 5381;
      for (let i = 0; i < sessionQs.length; i++) h = ((h << 5) + h) ^ sessionQs.charCodeAt(i);
      const sid = (h >>> 0).toString(36);

      localStorage.setItem(`act_session_${sid}`, ids.join(','));
      localStorage.setItem(`act_session_${sid}_items`, JSON.stringify(items));

      const firstId = ids[0];
      router.push(`/act-practice/${encodeURIComponent(firstId)}?${sessionQs}&sid=${sid}&t=${ids.length}&o=0&p=0&i=1`);
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
      const res = await fetch('/api/act/questions?' + params.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (loadIdRef.current !== thisLoadId) return;
      if (!res.ok) throw new Error(json?.error || 'Failed to load questions');
      setTotalCount(Number(json.totalCount || 0));
      setRows(json.items || []);
    } catch (e) {
      if (loadIdRef.current === thisLoadId) setMsg({ kind: 'danger', text: e.message });
    } finally {
      if (loadIdRef.current === thisLoadId) setLoading(false);
    }
  }, [debouncedSearch, filters, page]);

  useEffect(() => { setPage(0); }, [filters, debouncedSearch]);
  useEffect(() => { load(); }, [load]);

  function toggleFilter(key, value) {
    setFilters(prev => {
      const arr = prev[key] || [];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  }

  return (
    <main className="container">
      {/* ACT Filters */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="h2" style={{ margin: 0 }}>ACT Question Bank</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={randomize} onChange={() => setRandomize(r => !r)} />
              Randomize
            </label>
            <button className="btn" onClick={handleStartSession}>
              Start Session
            </button>
          </div>
        </div>

        {/* Section filter */}
        <div style={{ marginBottom: 10 }}>
          <div className="muted small" style={{ marginBottom: 4 }}>Section</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(filterData?.sections || []).map(s => (
              <button
                key={s.section}
                className={`pill clickable${filters.sections.includes(s.section) ? ' selected' : ''}`}
                onClick={() => toggleFilter('sections', s.section)}
              >
                {SECTION_LABELS[s.section] || s.section} ({s.count})
              </button>
            ))}
          </div>
        </div>

        {/* Category filter — show categories for selected sections (or all if none selected) */}
        {filterData?.categories && (() => {
          const activeSections = filters.sections.length > 0
            ? filters.sections
            : Object.keys(filterData.categories);
          const cats = activeSections.flatMap(s => (filterData.categories[s] || []).map(c => ({ ...c, section: s })));
          if (cats.length === 0) return null;
          return (
            <div style={{ marginBottom: 10 }}>
              <div className="muted small" style={{ marginBottom: 4 }}>Category</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cats.map(c => {
                  const key = c.category_code || c.category;
                  return (
                    <button
                      key={`${c.section}-${key}`}
                      className={`pill clickable${filters.categories.includes(key) ? ' selected' : ''}`}
                      onClick={() => toggleFilter('categories', key)}
                    >
                      {c.category} ({c.count})
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Difficulty filter */}
        <div style={{ marginBottom: 10 }}>
          <div className="muted small" style={{ marginBottom: 4 }}>Difficulty</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3].map(d => (
              <button
                key={d}
                className={`pill clickable${filters.difficulties.includes(d) ? ' selected' : ''}`}
                onClick={() => toggleFilter('difficulties', d)}
              >
                {DIFF_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {msg && <Toast kind={msg?.kind} message={msg?.text} />}

      {/* Search */}
      <div className="card" style={{ marginTop: 12, padding: '12px 16px' }}>
        <div className="searchRow">
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by question ID or stem text..."
          />
          <button className="btn secondary" onClick={() => setSearch('')} disabled={!search}>
            Clear
          </button>
        </div>
      </div>

      {/* Question list */}
      {!search.trim() ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 32, padding: '20px 0' }}>
          Enter a search term above to find matching questions, or click Start Session to begin.
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
            <div className="muted">Loading...</div>
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
                const href = `/act-practice/${encodeURIComponent(qid)}?${sessionQueryString}&sid=${sessionId}&t=${totalCount}&o=${offset}&p=${pos}&i=${i}`;
                const diffClass = q.difficulty === 1 ? ' easy' : q.difficulty === 2 ? ' medium' : q.difficulty === 3 ? ' hard' : '';

                return (
                  <Link key={qid} href={href} className={`option qRow${diffClass}`}>
                    <div className="qRowMain">
                      <div className="qRowTop">
                        <span className="qKey">{q.external_id || qid.slice(0, 8)}</span>
                        <div className="qBadges">
                          <span className="pill qPill">{SECTION_LABELS[q.section] || q.section}</span>
                          {q.difficulty != null && (
                            <span className="pill qPill qDiffPill">{DIFF_LABEL[q.difficulty] ?? `D${q.difficulty}`}</span>
                          )}
                          <AttemptedBadge is_done={q.is_done} />
                        </div>
                      </div>
                      <div className="muted small qRowSub">
                        {q.category || '—'}
                        {q.subcategory ? ` · ${q.subcategory}` : ''}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <hr />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading}>
              Prev
            </button>
            <button className="btn" onClick={() => setPage(p => p + 1)} disabled={loading || rows.length < 25}>
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
