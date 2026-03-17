'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';

export default function LearnPage() {
  return <Suspense><LearnLibrary /></Suspense>;
}

function LearnLibrary() {
  const [tab, setTab] = useState('assigned'); // 'assigned' | 'library'
  const [assigned, setAssigned] = useState([]);
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [domains, setDomains] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/lessons?assigned=me').then(r => r.json()),
      fetch('/api/lessons').then(r => r.json()),
      fetch('/api/filters').then(r => r.json()),
    ])
      .then(([assignedData, libraryData, filterData]) => {
        if (assignedData.error) throw new Error(assignedData.error);
        setAssigned(assignedData.lessons || []);
        setLibrary(libraryData.lessons || []);
        setDomains(filterData.domains || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="container" style={{ paddingTop: 48 }}><p className="muted">Loading…</p></div>;
  if (error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;

  const listData = tab === 'assigned' ? assigned : library;

  const filtered = listData.filter(l => {
    if (search && !l.title.toLowerCase().includes(search.toLowerCase()) && !(l.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (domainFilter && !l.topics.some(t => t.domain_name === domainFilter)) return false;
    return true;
  });

  return (
    <div className="container" style={{ paddingTop: 32, maxWidth: 900 }}>
      <h1 className="h1" style={{ marginBottom: 20 }}>Learn</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border, #eee)' }}>
        {[
          { key: 'assigned', label: 'Assigned to Me', count: assigned.length },
          { key: 'library', label: 'All Content', count: library.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px', fontSize: 14, fontWeight: 600, border: 'none', background: 'none',
              cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--muted)',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search lessons…"
          style={{ flex: 1, minWidth: 200, fontSize: 14, padding: 8, borderRadius: 6, border: '1px solid var(--border, #ddd)' }}
        />
        <select
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #ddd)' }}
        >
          <option value="">All Domains</option>
          {domains.map(d => (
            <option key={d.domain_name} value={d.domain_name}>{d.domain_name}</option>
          ))}
        </select>
      </div>

      {/* Lesson list */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p className="muted">
            {tab === 'assigned' ? 'No lessons assigned to you yet.' : 'No lessons found.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(lesson => (
            <Link key={lesson.id} href={`/learn/${lesson.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ padding: '16px 20px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{lesson.title}</span>
                      {lesson.progress && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          background: lesson.progress === 'completed' ? 'var(--success)' : 'var(--accent)',
                          color: '#fff',
                        }}>
                          {lesson.progress === 'completed' ? 'Completed' : 'In Progress'}
                        </span>
                      )}
                    </div>
                    {lesson.description && (
                      <p className="muted" style={{ fontSize: 13, margin: 0 }}>{lesson.description}</p>
                    )}
                    {lesson.topics.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {lesson.topics.map((t, i) => (
                          <span key={i} style={{
                            fontSize: 11, padding: '1px 6px', borderRadius: 3,
                            background: 'var(--bg-alt, #f0f4ff)', color: 'var(--accent)',
                          }}>
                            {t.skill_code || t.domain_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="muted" style={{ fontSize: 12 }}>by {lesson.author_name}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
