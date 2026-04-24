'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import HtmlBlock from '../../../../../components/HtmlBlock';
import { validateLessonBlocks } from '../../../../../lib/lesson/lesson-validation.mjs';
import {
  createStarterBlock,
  duplicateBlock,
  getBlockLabel,
  recomputeSortOrders,
  updateBlockContentFromDraft,
} from '../../../../../lib/lesson/editor-utils.mjs';

const TABS = ['preview', 'validation', 'debug'];

export default function InternalLessonEditorPage() {
  return <Suspense><InternalLessonEditor /></Suspense>;
}

function InternalLessonEditor() {
  const { lessonId } = useParams();
  const [lesson, setLesson] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [jsonDraft, setJsonDraft] = useState('{}');
  const [jsonError, setJsonError] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/lessons/${lessonId}`).then((r) => r.json()),
      fetch(`/api/lessons/${lessonId}/blocks`).then((r) => r.json()),
    ])
      .then(([lessonRes, blocksRes]) => {
        if (lessonRes.error) throw new Error(lessonRes.error);
        if (blocksRes.error) throw new Error(blocksRes.error);
        setLesson(lessonRes.lesson);
        const sorted = recomputeSortOrders(blocksRes.blocks || []);
        setBlocks(sorted);
        setSelectedIndex(0);
        setJsonDraft(JSON.stringify(sorted[0]?.content || {}, null, 2));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [lessonId]);

  const selectedBlock = blocks[selectedIndex] || null;
  const report = useMemo(() => validateLessonBlocks(blocks), [blocks]);

  useEffect(() => {
    if (!selectedBlock) {
      setJsonDraft('{}');
      setJsonError(null);
      return;
    }
    setJsonDraft(JSON.stringify(selectedBlock.content || {}, null, 2));
    setJsonError(null);
  }, [selectedIndex, selectedBlock]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function updateSelectedContent(text) {
    setJsonDraft(text);
    const updated = updateBlockContentFromDraft(blocks, selectedIndex, text);
    setJsonError(updated.error);
    if (!updated.error) {
      setBlocks(updated.blocks);
      setDirty(true);
    }
  }

  function updateSelectedType(nextType) {
    const next = [...blocks];
    next[selectedIndex] = {
      ...next[selectedIndex],
      block_type: nextType,
      content: createStarterBlock(nextType, selectedIndex).content,
    };
    setBlocks(next);
    setJsonDraft(JSON.stringify(next[selectedIndex].content || {}, null, 2));
    setJsonError(null);
    setDirty(true);
  }

  function addBlock() {
    const next = recomputeSortOrders([...blocks, createStarterBlock('text', blocks.length)]);
    setBlocks(next);
    setSelectedIndex(next.length - 1);
    setDirty(true);
  }

  function duplicateSelected() {
    if (!selectedBlock) return;
    const copy = duplicateBlock(selectedBlock, selectedIndex + 1);
    const next = [...blocks];
    next.splice(selectedIndex + 1, 0, copy);
    const normalized = recomputeSortOrders(next);
    setBlocks(normalized);
    setSelectedIndex(selectedIndex + 1);
    setDirty(true);
  }

  function deleteSelected() {
    if (!selectedBlock) return;
    if (!confirm('Delete this block?')) return;
    const next = blocks.filter((_, idx) => idx !== selectedIndex);
    const normalized = recomputeSortOrders(next);
    setBlocks(normalized);
    setSelectedIndex(Math.max(0, selectedIndex - 1));
    setDirty(true);
  }

  function moveSelected(direction) {
    const target = selectedIndex + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    setBlocks(recomputeSortOrders(next));
    setSelectedIndex(target);
    setDirty(true);
  }

  async function handleSave() {
    if (jsonError) {
      setError('Fix JSON parse errors before saving.');
      return;
    }
    if (!report.ok) {
      setError('Resolve validation errors before saving. Warnings are allowed.');
      return;
    }
    setSaveState('saving');
    setError(null);
    try {
      const metaRes = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: lesson.title,
          description: lesson.description,
          visibility: lesson.visibility,
          status: lesson.status,
        }),
      });
      if (!metaRes.ok) throw new Error((await metaRes.json()).error || 'Failed to save lesson metadata');

      const blockRes = await fetch(`/api/lessons/${lessonId}/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: recomputeSortOrders(blocks).map((block, index) => ({
            block_type: block.block_type,
            content: block.content,
            sort_order: index,
          })),
        }),
      });
      const payload = await blockRes.json();
      if (!blockRes.ok) throw new Error(payload.error || 'Failed to save lesson blocks');
      setBlocks(recomputeSortOrders(payload.blocks || blocks));
      setDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      setError(e.message);
      setSaveState('error');
    }
  }

  if (loading) return <div className="container" style={{ paddingTop: 40 }}>Loading editor…</div>;
  if (error && !lesson) return <div className="container" style={{ paddingTop: 40, color: 'var(--danger)' }}>{error}</div>;
  if (!lesson) return <div className="container" style={{ paddingTop: 40 }}>Lesson not found.</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <Link href="/teacher/content" style={{ fontSize: 13, color: 'var(--accent)' }}>&larr; Back</Link>
          <h1 style={{ margin: '4px 0 0', fontSize: 20 }}>Internal Lesson Editor</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{lesson.title}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: dirty ? 'var(--warning, #b26a00)' : 'var(--muted)' }}>
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <button className="btn secondary" onClick={addBlock}>Add Block</button>
          <button className="btn primary" onClick={handleSave} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 10, marginBottom: 12, fontSize: 12 }}>
        Validation summary: {report.summary.errorCount} error(s), {report.summary.warningCount} warning(s)
        {error && <div style={{ color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 360px', gap: 12, alignItems: 'start' }}>
        <div className="card" style={{ padding: 10, maxHeight: '75vh', overflow: 'auto' }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Lesson Outline</h3>
          {blocks.length === 0 && <div className="muted">No blocks yet. Add one to begin.</div>}
          {blocks.map((block, idx) => {
            const blockIssues = [...report.errors, ...report.warnings].filter((issue) => issue.blockId === String(block.id));
            const severity = blockIssues.some((i) => i.severity === 'error') ? 'error' : (blockIssues.length > 0 ? 'warning' : 'valid');
            return (
              <button
                key={block.id || idx}
                onClick={() => setSelectedIndex(idx)}
                style={{
                  width: '100%', textAlign: 'left', marginBottom: 8, border: idx === selectedIndex ? '2px solid var(--accent)' : '1px solid var(--border, #ddd)',
                  borderRadius: 6, padding: 8, background: '#fff', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11 }}>
                  <span>#{idx + 1}</span>
                  <span style={{ color: severity === 'error' ? 'var(--danger)' : severity === 'warning' ? '#b26a00' : 'var(--success)' }}>{severity}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{block.block_type}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{block.id || 'no-id'} · {getBlockLabel(block)}</div>
                {(block.content?.step_index || block.content?.total_steps) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Step {block.content?.step_index || '?'} of {block.content?.total_steps || '?'}</div>
                )}
              </button>
            );
          })}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            <button className="btn secondary" onClick={() => moveSelected(-1)} disabled={selectedIndex === 0}>Move Up</button>
            <button className="btn secondary" onClick={() => moveSelected(1)} disabled={selectedIndex >= blocks.length - 1}>Move Down</button>
            <button className="btn secondary" onClick={duplicateSelected} disabled={!selectedBlock}>Duplicate</button>
            <button className="btn secondary" onClick={deleteSelected} disabled={!selectedBlock}>Delete</button>
          </div>
        </div>

        <div className="card" style={{ padding: 10 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Block JSON Editor</h3>
          {!selectedBlock ? (
            <div className="muted">Select a block to edit.</div>
          ) : (
            <>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                block_type
                <select
                  value={selectedBlock.block_type}
                  onChange={(e) => updateSelectedType(e.target.value)}
                  style={{ marginLeft: 8 }}
                >
                  <option value="text">text</option>
                  <option value="video">video</option>
                  <option value="check">check</option>
                  <option value="question_link">question_link</option>
                  <option value="desmos_interactive">desmos_interactive</option>
                </select>
              </label>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>sort_order: {selectedIndex}</div>
              <textarea
                value={jsonDraft}
                onChange={(e) => updateSelectedContent(e.target.value)}
                spellCheck={false}
                style={{ width: '100%', minHeight: 460, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, borderRadius: 6, border: '1px solid var(--border, #ddd)', padding: 10 }}
              />
              {jsonError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>JSON parse error: {jsonError}</div>}
              <div style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(jsonDraft)}>
                  Copy JSON
                </button>
              </div>
            </>
          )}
        </div>

        <div className="card" style={{ padding: 10, maxHeight: '75vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`btn ${activeTab === tab ? 'primary' : 'secondary'}`}
                style={{ fontSize: 12, padding: '6px 10px' }}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'preview' && (
            <BlockPreview block={selectedBlock} />
          )}

          {activeTab === 'validation' && (
            <div style={{ fontSize: 12 }}>
              <h4 style={{ margin: '0 0 8px' }}>Selected block issues</h4>
              {[...report.errors, ...report.warnings]
                .filter((issue) => issue.blockId === String(selectedBlock?.id))
                .map((issue, idx) => (
                  <IssueRow key={`selected-${idx}`} issue={issue} />
                ))}
              <h4 style={{ margin: '12px 0 8px' }}>Lesson-level issues</h4>
              {[...report.errors, ...report.warnings].map((issue, idx) => (
                <IssueRow key={`all-${idx}`} issue={issue} />
              ))}
            </div>
          )}

          {activeTab === 'debug' && selectedBlock && (
            <div style={{ fontSize: 12, display: 'grid', gap: 4 }}>
              <div>block_id: <code>{selectedBlock.id || '—'}</code></div>
              <div>block_type: <code>{selectedBlock.block_type}</code></div>
              <div>workflow_id: <code>{selectedBlock.content?.workflow_id || '—'}</code></div>
              <div>step_index: <code>{selectedBlock.content?.step_index || '—'}</code></div>
              <div>validation_mode: <code>{selectedBlock.content?.validation?.mode || '—'}</code></div>
              <div>goal_type: <code>{selectedBlock.content?.goal?.type || '—'}</code></div>
              <div>on_correct_block_id: <code>{selectedBlock.content?.on_correct_block_id || '—'}</code></div>
              <div>on_incorrect_block_id: <code>{selectedBlock.content?.on_incorrect_block_id || '—'}</code></div>
              <div>rejoin_at_block_id: <code>{selectedBlock.content?.rejoin_at_block_id || '—'}</code></div>
              <div>inherit_from_previous_workflow_desmos: <code>{String(Boolean(selectedBlock.content?.inherit_from_previous_workflow_desmos))}</code></div>
              {selectedBlock.block_type === 'desmos_interactive' && (
                <>
                  <div>initial_expressions: <code>{selectedBlock.content?.initial_expressions?.length || 0}</code></div>
                  <div>state_rules: <code>{JSON.stringify(selectedBlock.content?.validation?.state_rules || {})}</code></div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IssueRow({ issue }) {
  return (
    <div style={{ border: '1px solid var(--border, #ddd)', borderRadius: 6, padding: 6, marginBottom: 6 }}>
      <div style={{ fontWeight: 700, color: issue.severity === 'error' ? 'var(--danger)' : '#b26a00' }}>
        {issue.severity.toUpperCase()} · {issue.code}
      </div>
      <div>{issue.message}</div>
      <div style={{ color: 'var(--muted)' }}>block: {issue.blockId || '—'} · path: {issue.path || '—'}</div>
      {issue.suggestion && <div style={{ color: 'var(--muted)' }}>fix: {issue.suggestion}</div>}
    </div>
  );
}

function BlockPreview({ block }) {
  if (!block) return <div className="muted">Select a block to preview.</div>;
  if (block.block_type === 'text') {
    return <HtmlBlock html={block.content?.html || ''} className="prose" />;
  }
  if (block.block_type === 'check') {
    return (
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{block.content?.prompt || 'Check prompt'}</div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {(block.content?.choices || []).map((choice, index) => (
            <li key={index}>{choice}</li>
          ))}
        </ol>
      </div>
    );
  }
  if (block.block_type === 'video') {
    return <div className="muted">Video preview: {block.content?.url || 'No URL'}</div>;
  }
  if (block.block_type === 'question_link') {
    return <div className="muted">Question link: {block.content?.question_id || 'No question id'}</div>;
  }
  if (block.block_type === 'desmos_interactive') {
    return (
      <div>
        <h4 style={{ marginTop: 0 }}>{block.content?.title || 'Desmos interactive'}</h4>
        <HtmlBlock html={block.content?.instructions_html || ''} />
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Use the lesson viewer for full interactive runtime behavior.
        </div>
      </div>
    );
  }

  return <pre style={{ fontSize: 12 }}>{JSON.stringify(block.content || {}, null, 2)}</pre>;
}
