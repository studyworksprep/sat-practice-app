'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LessonEditorPage() {
  return <Suspense><LessonEditor /></Suspense>;
}

// ─── Block type config ────────────────────────────────────
const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: '¶' },
  { type: 'video', label: 'Video', icon: '▶' },
  { type: 'check', label: 'Knowledge Check', icon: '?' },
  { type: 'question_link', label: 'Question Link', icon: '#' },
];

function emptyBlock(type) {
  const content = {
    text: { html: '' },
    video: { url: '', caption: '' },
    check: { prompt: '', choices: ['', ''], correct_index: 0, explanation: '' },
    question_link: { question_id: '' },
  };
  return { block_type: type, content: content[type] || {}, _key: Math.random().toString(36).slice(2) };
}

// ─── Main editor ─────────────────────────────────────────
function LessonEditor() {
  const { lessonId } = useParams();
  const router = useRouter();
  const [lesson, setLesson] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [topics, setTopics] = useState([]);
  const [availableFilters, setAvailableFilters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load lesson + filters
  useEffect(() => {
    Promise.all([
      fetch(`/api/lessons/${lessonId}`).then(r => r.json()),
      fetch('/api/filters').then(r => r.json()),
    ])
      .then(([lessonData, filterData]) => {
        if (lessonData.error) throw new Error(lessonData.error);
        setLesson(lessonData.lesson);
        setBlocks((lessonData.lesson.blocks || []).map(b => ({ ...b, _key: b.id || Math.random().toString(36).slice(2) })));
        setTopics(lessonData.lesson.topics || []);
        setAvailableFilters(filterData);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [lessonId]);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Save metadata + topics
      const metaRes = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: lesson.title,
          description: lesson.description,
          visibility: lesson.visibility,
          status: lesson.status,
          topics,
        }),
      });
      if (!metaRes.ok) throw new Error((await metaRes.json()).error || 'Failed to save metadata');

      // Save blocks
      const blocksRes = await fetch(`/api/lessons/${lessonId}/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: blocks.map((b, i) => ({
            block_type: b.block_type,
            content: b.content,
            sort_order: i,
          })),
        }),
      });
      const blocksData = await blocksRes.json();
      if (!blocksRes.ok) throw new Error(blocksData.error || 'Failed to save blocks');

      // Update blocks with server IDs
      if (blocksData.blocks) {
        setBlocks(blocksData.blocks.map(b => ({ ...b, _key: b.id })));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [lessonId, lesson, blocks, topics]);

  // Delete lesson
  async function handleDelete() {
    if (!confirm('Delete this lesson? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete');
      router.push('/teacher/content');
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  }

  // Block operations
  function addBlock(type, afterIndex) {
    const newBlocks = [...blocks];
    newBlocks.splice(afterIndex + 1, 0, emptyBlock(type));
    setBlocks(newBlocks);
  }

  function updateBlock(index, updates) {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], ...updates };
    setBlocks(newBlocks);
  }

  function removeBlock(index) {
    setBlocks(blocks.filter((_, i) => i !== index));
  }

  function moveBlock(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    setBlocks(newBlocks);
  }

  if (loading) return <div className="container" style={{ paddingTop: 48 }}><p className="muted">Loading…</p></div>;
  if (error && !lesson) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!lesson) return <div className="container" style={{ paddingTop: 48 }}><p className="muted">Lesson not found.</p></div>;

  return (
    <div className="container" style={{ paddingTop: 24, maxWidth: 860, paddingBottom: 80 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <Link href="/teacher/content" style={{ fontSize: 13, color: 'var(--accent)' }}>&larr; All Content</Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>Saved</span>}
          {error && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>}
          <button className="btn secondary" onClick={handleDelete} disabled={deleting} style={{ fontSize: 13 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Metadata card */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <input
          type="text"
          value={lesson.title}
          onChange={e => setLesson({ ...lesson, title: e.target.value })}
          placeholder="Lesson title"
          style={{ width: '100%', fontSize: 20, fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', padding: 0, marginBottom: 8 }}
        />
        <textarea
          value={lesson.description || ''}
          onChange={e => setLesson({ ...lesson, description: e.target.value })}
          placeholder="Brief description (optional)"
          rows={2}
          style={{ width: '100%', fontSize: 14, border: '1px solid var(--border, #ddd)', borderRadius: 6, padding: 8, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>
            Status:
            <select
              value={lesson.status}
              onChange={e => setLesson({ ...lesson, status: e.target.value })}
              style={{ marginLeft: 6, fontSize: 13, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border, #ddd)' }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label style={{ fontSize: 13 }}>
            Visibility:
            <select
              value={lesson.visibility}
              onChange={e => setLesson({ ...lesson, visibility: e.target.value })}
              style={{ marginLeft: 6, fontSize: 13, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border, #ddd)' }}
            >
              <option value="shared">Shared (visible in library)</option>
              <option value="private">Private (only you)</option>
            </select>
          </label>
        </div>

        {/* Topic tags */}
        <div style={{ marginTop: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Topics: </span>
          {topics.map((t, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, padding: '2px 8px', borderRadius: 4, marginRight: 4, marginBottom: 4,
              background: 'var(--bg-alt, #f0f4ff)', color: 'var(--accent)',
            }}>
              {t.skill_code || t.domain_name}
              <button
                onClick={() => setTopics(topics.filter((_, j) => j !== i))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 0, lineHeight: 1 }}
              >
                &times;
              </button>
            </span>
          ))}
          {availableFilters && (
            <TopicPicker
              domains={availableFilters.domains || []}
              allTopics={availableFilters.topics || []}
              selected={topics}
              onAdd={topic => setTopics([...topics, topic])}
            />
          )}
        </div>
      </div>

      {/* Blocks */}
      {blocks.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', marginBottom: 12 }}>
          <p className="muted" style={{ margin: '0 0 12px' }}>This lesson has no content yet. Add your first block below.</p>
        </div>
      )}

      {blocks.map((block, index) => (
        <div key={block._key} style={{ marginBottom: 12 }}>
          <BlockEditor
            block={block}
            index={index}
            total={blocks.length}
            onChange={updates => updateBlock(index, updates)}
            onRemove={() => removeBlock(index)}
            onMove={dir => moveBlock(index, dir)}
          />
          <AddBlockBar onAdd={type => addBlock(type, index)} />
        </div>
      ))}

      {/* Initial add button if no blocks */}
      {blocks.length === 0 && (
        <AddBlockBar onAdd={type => addBlock(type, -1)} />
      )}
    </div>
  );
}

// ─── Add block toolbar ───────────────────────────────────
function AddBlockBar({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            border: '1px dashed var(--border, #ccc)', background: 'none', cursor: 'pointer',
            borderRadius: 6, padding: '4px 16px', fontSize: 18, color: 'var(--muted)',
            lineHeight: 1,
          }}
          title="Add block"
        >
          +
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {BLOCK_TYPES.map(bt => (
            <button
              key={bt.type}
              onClick={() => { onAdd(bt.type); setOpen(false); }}
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {bt.icon} {bt.label}
            </button>
          ))}
          <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Block editor (type-specific) ────────────────────────
function BlockEditor({ block, index, total, onChange, onRemove, onMove }) {
  const typeInfo = BLOCK_TYPES.find(bt => bt.type === block.block_type) || { label: block.block_type, icon: '?' };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Block header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', background: 'var(--bg-alt, #f8f9fb)', borderBottom: '1px solid var(--border, #eee)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
          {typeInfo.icon} {typeInfo.label}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button disabled={index === 0} onClick={() => onMove(-1)} style={miniBtn} title="Move up">&uarr;</button>
          <button disabled={index === total - 1} onClick={() => onMove(1)} style={miniBtn} title="Move down">&darr;</button>
          <button onClick={onRemove} style={{ ...miniBtn, color: 'var(--danger)' }} title="Remove">&times;</button>
        </div>
      </div>

      {/* Block body */}
      <div style={{ padding: 12 }}>
        {block.block_type === 'text' && (
          <TextBlockEditor content={block.content} onChange={c => onChange({ content: c })} />
        )}
        {block.block_type === 'video' && (
          <VideoBlockEditor content={block.content} onChange={c => onChange({ content: c })} />
        )}
        {block.block_type === 'check' && (
          <CheckBlockEditor content={block.content} onChange={c => onChange({ content: c })} />
        )}
        {block.block_type === 'question_link' && (
          <QuestionLinkEditor content={block.content} onChange={c => onChange({ content: c })} />
        )}
      </div>
    </div>
  );
}

const miniBtn = {
  border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
  color: 'var(--muted)', padding: '0 4px', lineHeight: 1,
};

// ─── Text block ──────────────────────────────────────────
function TextBlockEditor({ content, onChange }) {
  return (
    <textarea
      value={content.html || ''}
      onChange={e => onChange({ ...content, html: e.target.value })}
      placeholder="Write explanation text here… (HTML supported, including MathJax LaTeX like \(x^2\))"
      rows={6}
      style={{
        width: '100%', fontSize: 14, fontFamily: 'monospace', border: '1px solid var(--border, #ddd)',
        borderRadius: 6, padding: 10, resize: 'vertical', lineHeight: 1.6,
      }}
    />
  );
}

// ─── Video block ─────────────────────────────────────────
function VideoBlockEditor({ content, onChange }) {
  const embedUrl = getEmbedUrl(content.url);
  return (
    <div>
      <input
        type="text"
        value={content.url || ''}
        onChange={e => onChange({ ...content, url: e.target.value })}
        placeholder="YouTube or Vimeo URL (e.g., https://www.youtube.com/watch?v=...)"
        style={{ width: '100%', fontSize: 14, padding: 8, borderRadius: 6, border: '1px solid var(--border, #ddd)', marginBottom: 8 }}
      />
      <input
        type="text"
        value={content.caption || ''}
        onChange={e => onChange({ ...content, caption: e.target.value })}
        placeholder="Caption (optional)"
        style={{ width: '100%', fontSize: 13, padding: 6, borderRadius: 6, border: '1px solid var(--border, #ddd)', marginBottom: 8 }}
      />
      {embedUrl && (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
          <iframe
            src={embedUrl}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

function getEmbedUrl(url) {
  if (!url) return null;
  // YouTube
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  // Vimeo
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

// ─── Knowledge check block ──────────────────────────────
function CheckBlockEditor({ content, onChange }) {
  const choices = content.choices || ['', ''];

  function setChoice(i, value) {
    const newChoices = [...choices];
    newChoices[i] = value;
    onChange({ ...content, choices: newChoices });
  }

  function addChoice() {
    if (choices.length >= 5) return;
    onChange({ ...content, choices: [...choices, ''] });
  }

  function removeChoice(i) {
    if (choices.length <= 2) return;
    const newChoices = choices.filter((_, j) => j !== i);
    let correctIdx = content.correct_index || 0;
    if (i === correctIdx) correctIdx = 0;
    else if (i < correctIdx) correctIdx--;
    onChange({ ...content, choices: newChoices, correct_index: correctIdx });
  }

  return (
    <div>
      <textarea
        value={content.prompt || ''}
        onChange={e => onChange({ ...content, prompt: e.target.value })}
        placeholder="Question prompt"
        rows={2}
        style={{ width: '100%', fontSize: 14, padding: 8, borderRadius: 6, border: '1px solid var(--border, #ddd)', marginBottom: 10, fontFamily: 'inherit', resize: 'vertical' }}
      />

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Choices (select the correct one):</div>
      {choices.map((choice, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input
            type="radio"
            name={`check-correct-${content.prompt}`}
            checked={content.correct_index === i}
            onChange={() => onChange({ ...content, correct_index: i })}
            title="Mark as correct"
          />
          <span style={{ fontSize: 13, fontWeight: 600, width: 16 }}>{String.fromCharCode(65 + i)}.</span>
          <input
            type="text"
            value={choice}
            onChange={e => setChoice(i, e.target.value)}
            placeholder={`Choice ${String.fromCharCode(65 + i)}`}
            style={{ flex: 1, fontSize: 14, padding: 6, borderRadius: 4, border: '1px solid var(--border, #ddd)' }}
          />
          {choices.length > 2 && (
            <button onClick={() => removeChoice(i)} style={{ ...miniBtn, color: 'var(--danger)' }}>&times;</button>
          )}
        </div>
      ))}
      {choices.length < 5 && (
        <button onClick={addChoice} className="btn secondary" style={{ fontSize: 12, padding: '3px 10px', marginTop: 4 }}>
          + Add Choice
        </button>
      )}

      <div style={{ marginTop: 10 }}>
        <textarea
          value={content.explanation || ''}
          onChange={e => onChange({ ...content, explanation: e.target.value })}
          placeholder="Explanation (shown after answering)"
          rows={2}
          style={{ width: '100%', fontSize: 13, padding: 8, borderRadius: 6, border: '1px solid var(--border, #ddd)', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

// ─── Question link block ────────────────────────────────
function QuestionLinkEditor({ content, onChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/questions?search=${encodeURIComponent(searchTerm)}&limit=10`);
      const data = await res.json();
      setResults(data.questions || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      {content.question_id && (
        <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-alt, #f0f4ff)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Linked: {content.question_id}</span>
          <button onClick={() => onChange({ question_id: '' })} style={{ ...miniBtn, color: 'var(--danger)' }}>Remove</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search by question ID or keyword…"
          style={{ flex: 1, fontSize: 14, padding: 8, borderRadius: 6, border: '1px solid var(--border, #ddd)' }}
        />
        <button className="btn secondary" onClick={handleSearch} disabled={searching} style={{ fontSize: 13 }}>
          {searching ? '…' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border, #eee)', borderRadius: 6 }}>
          {results.map(q => (
            <button
              key={q.question_id}
              onClick={() => { onChange({ question_id: q.question_id }); setResults([]); setSearchTerm(''); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                border: 'none', borderBottom: '1px solid var(--border, #eee)', background: 'none',
                cursor: 'pointer', fontSize: 13,
              }}
            >
              <strong>{q.question_id}</strong>
              {q.domain_name && <span className="muted" style={{ marginLeft: 8 }}>{q.domain_name}</span>}
              {q.difficulty && <span className="muted" style={{ marginLeft: 8 }}>Diff: {q.difficulty}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Topic picker ────────────────────────────────────────
function TopicPicker({ domains, allTopics, selected, onAdd }) {
  const [open, setOpen] = useState(false);
  const [selDomain, setSelDomain] = useState('');

  const selectedKeys = new Set(selected.map(t => `${t.domain_name}||${t.skill_code || ''}`));

  const filteredTopics = selDomain
    ? allTopics.filter(t => t.domain_name === selDomain).filter(t => !selectedKeys.has(`${t.domain_name}||${t.skill_code || ''}`))
    : [];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ fontSize: 12, border: '1px dashed var(--border, #ccc)', background: 'none', cursor: 'pointer', borderRadius: 4, padding: '2px 8px', color: 'var(--muted)' }}
      >
        + Add Topic
      </button>
    );
  }

  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
      <select
        value={selDomain}
        onChange={e => setSelDomain(e.target.value)}
        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border, #ddd)' }}
      >
        <option value="">Select domain…</option>
        {domains.map(d => (
          <option key={d.domain_name} value={d.domain_name}>{d.domain_name}</option>
        ))}
      </select>
      {selDomain && filteredTopics.length > 0 && (
        <select
          onChange={e => {
            const topic = filteredTopics.find(t => (t.skill_code || '') === e.target.value);
            if (topic) {
              onAdd({ domain_name: topic.domain_name, skill_code: topic.skill_code || null });
            } else if (e.target.value === '__domain__') {
              onAdd({ domain_name: selDomain, skill_code: null });
            }
            setSelDomain('');
            setOpen(false);
          }}
          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border, #ddd)' }}
          defaultValue=""
        >
          <option value="" disabled>Select topic…</option>
          <option value="__domain__">{selDomain} (domain only)</option>
          {filteredTopics.map(t => (
            <option key={t.skill_code || t.skill_name} value={t.skill_code || ''}>
              {t.skill_name || t.skill_code}
            </option>
          ))}
        </select>
      )}
      {selDomain && filteredTopics.length === 0 && (
        <button
          onClick={() => {
            if (!selectedKeys.has(`${selDomain}||`)) onAdd({ domain_name: selDomain, skill_code: null });
            setSelDomain('');
            setOpen(false);
          }}
          className="btn secondary"
          style={{ fontSize: 12, padding: '3px 8px' }}
        >
          Add {selDomain}
        </button>
      )}
      <button onClick={() => { setOpen(false); setSelDomain(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>
        &times;
      </button>
    </div>
  );
}
