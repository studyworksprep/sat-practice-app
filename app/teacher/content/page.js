'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate } from '../shared';

export default function TeacherContentPage() {
  return <Suspense><ContentList /></Suspense>;
}

function ContentList() {
  const router = useRouter();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/teacher/lessons')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setLessons(data.lessons || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Lesson', status: 'draft' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      router.push(`/teacher/content/${data.id}`);
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  }

  if (loading) return <div className="container" style={{ paddingTop: 48 }}><p className="muted">Loading…</p></div>;
  if (error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;

  return (
    <div className="container" style={{ paddingTop: 32, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="h1" style={{ margin: 0 }}>Learning Content</h1>
        <button className="btn primary" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating…' : '+ New Lesson'}
        </button>
      </div>

      {lessons.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p className="muted">No lessons yet. Create your first lesson to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lessons.map(lesson => (
            <Link
              key={lesson.id}
              href={`/teacher/content/${lesson.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card" style={{ padding: '16px 20px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{lesson.title}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: lesson.status === 'published' ? 'var(--success)' : lesson.status === 'archived' ? 'var(--muted)' : 'var(--amber)',
                        color: '#fff',
                      }}>
                        {lesson.status}
                      </span>
                      {lesson.visibility === 'private' && (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Private</span>
                      )}
                    </div>
                    {lesson.description && (
                      <p className="muted" style={{ fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lesson.description}
                      </p>
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
                    <div className="muted" style={{ fontSize: 12 }}>{lesson.block_count} block{lesson.block_count !== 1 ? 's' : ''}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{lesson.student_count} student{lesson.student_count !== 1 ? 's' : ''}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{formatDate(lesson.updated_at)}</div>
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
