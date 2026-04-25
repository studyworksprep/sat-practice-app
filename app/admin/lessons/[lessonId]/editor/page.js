'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import HtmlBlock from '../../../../../components/HtmlBlock';
import { parseDesmosInteractiveContent } from '../../../../../lib/lesson/desmos-interactive.mjs';
import { validateLessonBlocks } from '../../../../../lib/lesson/lesson-validation.mjs';
import {
  createStarterBlock,
  duplicateBlock,
  getBlockLabel,
  recomputeSortOrders,
  updateBlockContentFromDraft,
} from '../../../../../lib/lesson/editor-utils.mjs';
import {
  cleanupDesmosContent,
  createDesmosTemplate,
  parseCommaSeparatedList,
  parseLineSeparatedList,
  parseNumberList,
  parseSliderInitialValuesText,
  sliderInitialValuesToText,
} from '../../../../../lib/lesson/desmos-form-utils.mjs';

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
  const [editorMode, setEditorMode] = useState('json');

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
  const selectedDesmosValid = useMemo(() => {
    if (!selectedBlock || selectedBlock.block_type !== 'desmos_interactive') return false;
    try {
      parseDesmosInteractiveContent(selectedBlock.content || {});
      return true;
    } catch {
      return false;
    }
  }, [selectedBlock]);

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
    if (selectedBlock?.block_type !== 'desmos_interactive') {
      setEditorMode('json');
      return;
    }
    setEditorMode(selectedDesmosValid ? 'form' : 'json');
  }, [selectedBlock?.id, selectedBlock?.block_type, selectedDesmosValid]);

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

  function replaceSelectedContent(nextContent) {
    if (!selectedBlock) return;
    const next = [...blocks];
    next[selectedIndex] = { ...next[selectedIndex], content: nextContent };
    setBlocks(next);
    setJsonDraft(JSON.stringify(nextContent || {}, null, 2));
    setJsonError(null);
    setDirty(true);
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
    setEditorMode(nextType === 'desmos_interactive' ? 'form' : 'json');
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
              {selectedBlock.block_type === 'desmos_interactive' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button
                    className={`btn ${editorMode === 'form' ? 'primary' : 'secondary'}`}
                    onClick={() => {
                      if (jsonError || !selectedDesmosValid) return;
                      setEditorMode('form');
                    }}
                    disabled={jsonError || !selectedDesmosValid}
                  >
                    Form
                  </button>
                  <button className={`btn ${editorMode === 'json' ? 'primary' : 'secondary'}`} onClick={() => setEditorMode('json')}>
                    JSON
                  </button>
                  {!selectedDesmosValid && (
                    <span style={{ fontSize: 11, color: 'var(--danger)' }}>Fix JSON/schema to enable Form mode.</span>
                  )}
                </div>
              )}
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
              {selectedBlock.block_type === 'desmos_interactive' && editorMode === 'form' ? (
                <DesmosInteractiveFormEditor
                  content={selectedBlock.content || {}}
                  onChange={(next) => replaceSelectedContent(cleanupDesmosContent(next))}
                />
              ) : (
                <>
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

const KNOWN_HINT_TRIGGERS = [
  'missing_y_equals',
  'uses_forbidden_variables',
  'likely_parentheses_error',
  'too_many_expressions',
  'too_few_expressions',
  'missing_required_slider',
  'slider_not_moved',
  'slider_still_default',
  'missing_second_expression',
  'expressions_not_comparable',
];

function DesmosInteractiveFormEditor({ content, onChange }) {
  const data = cleanupDesmosContent({
    ...content,
    type: 'desmos_interactive',
    initial_expressions: content.initial_expressions || [],
    goal: content.goal || { type: 'enter_expression', required_count: 1 },
    validation: content.validation || { mode: 'equivalent', expected: ['y=x'], test_values: [-2, 0, 2], tolerance: 0.000001, state_rules: { min_expressions: 1, max_expressions: 1, require_visible_only: true } },
    feedback: content.feedback || { success_message_html: '<p>Nice.</p>', retry_message_html: '<p>Try again.</p>' },
    progression: content.progression || { require_success: true },
  });

  function patch(nextPartial) {
    onChange({ ...data, ...nextPartial, type: 'desmos_interactive' });
  }

  function patchNested(path, value) {
    const keys = path.split('.');
    const next = structuredClone(data);
    let cursor = next;
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (!cursor[keys[i]] || typeof cursor[keys[i]] !== 'object') cursor[keys[i]] = {};
      cursor = cursor[keys[i]];
    }
    cursor[keys[keys.length - 1]] = value;
    onChange(next);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section>
        <h4 style={{ margin: '6px 0' }}>Templates</h4>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => confirm('Replace current content with Enter Expression template?') && onChange(createDesmosTemplate('enter'))}>Enter expression</button>
          <button className="btn secondary" onClick={() => confirm('Replace current content with Compare template?') && onChange(createDesmosTemplate('compare'))}>Compare two expressions</button>
          <button className="btn secondary" onClick={() => confirm('Replace current content with Slider setup template?') && onChange(createDesmosTemplate('slider_setup'))}>Slider setup</button>
          <button className="btn secondary" onClick={() => confirm('Replace current content with Slider movement template?') && onChange(createDesmosTemplate('slider_move'))}>Slider movement</button>
        </div>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Basic Info</h4>
        <div style={{ fontSize: 12, marginBottom: 4 }}>type: <code>desmos_interactive</code></div>
        <label style={{ display: 'block', fontSize: 12 }}>content.id
          <input value={data.id || ''} onChange={(e) => patch({ id: e.target.value })} style={{ width: '100%' }} />
        </label>
        {!data.id && <div style={{ color: '#b26a00', fontSize: 11 }}>Warning: content.id is recommended.</div>}
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>title
          <input value={data.title || ''} onChange={(e) => patch({ title: e.target.value })} style={{ width: '100%' }} />
        </label>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Instructions</h4>
        <label style={{ display: 'block', fontSize: 12 }}>instructions_html
          <textarea value={data.instructions_html || ''} onChange={(e) => patch({ instructions_html: e.target.value })} style={{ width: '100%', minHeight: 70 }} />
        </label>
        {!data.instructions_html && <div style={{ color: 'var(--danger)', fontSize: 11 }}>instructions_html is required.</div>}
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>caption_html
          <textarea value={data.caption_html || ''} onChange={(e) => patch({ caption_html: e.target.value })} style={{ width: '100%', minHeight: 50 }} />
        </label>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Initial Expressions</h4>
        {(data.initial_expressions || []).map((expr, index) => (
          <div key={expr.id || index} style={{ border: '1px solid var(--border, #ddd)', padding: 6, borderRadius: 6, marginBottom: 6 }}>
            <input placeholder="id" value={expr.id || ''} onChange={(e) => {
              const list = [...(data.initial_expressions || [])];
              list[index] = { ...list[index], id: e.target.value };
              patch({ initial_expressions: list });
            }} style={{ width: '100%', marginBottom: 4 }} />
            <textarea placeholder="latex" value={expr.latex || ''} onChange={(e) => {
              const list = [...(data.initial_expressions || [])];
              list[index] = { ...list[index], latex: e.target.value };
              patch({ initial_expressions: list });
            }} style={{ width: '100%', minHeight: 40 }} />
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={Boolean(expr.hidden)} onChange={(e) => {
                const list = [...(data.initial_expressions || [])];
                list[index] = { ...list[index], hidden: e.target.checked };
                patch({ initial_expressions: list });
              }} /> hidden
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn secondary" onClick={() => {
                const list = [...(data.initial_expressions || [])];
                [list[index - 1], list[index]] = [list[index], list[index - 1]];
                patch({ initial_expressions: list });
              }} disabled={index === 0}>Up</button>
              <button className="btn secondary" onClick={() => {
                const list = [...(data.initial_expressions || [])];
                [list[index], list[index + 1]] = [list[index + 1], list[index]];
                patch({ initial_expressions: list });
              }} disabled={index >= (data.initial_expressions || []).length - 1}>Down</button>
              <button className="btn secondary" onClick={() => patch({ initial_expressions: (data.initial_expressions || []).filter((_, i) => i !== index) })}>Delete</button>
            </div>
          </div>
        ))}
        <button className="btn secondary" onClick={() => {
          const nextIndex = (data.initial_expressions || []).length + 1;
          patch({ initial_expressions: [...(data.initial_expressions || []), { id: `expr_${nextIndex}`, latex: '', hidden: false }] });
        }}>Add expression</button>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Goal</h4>
        <label style={{ fontSize: 12 }}>goal.type
          <select value={data.goal?.type || 'enter_expression'} onChange={(e) => patchNested('goal.type', e.target.value)} style={{ marginLeft: 8 }}>
            <option value="enter_expression">enter_expression</option>
            <option value="multi_expression">multi_expression</option>
          </select>
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>required_count
          <input type="number" value={data.goal?.required_count ?? 1} onChange={(e) => patchNested('goal.required_count', Number(e.target.value || 1))} style={{ width: 120 }} />
        </label>
        {data.goal?.type === 'multi_expression' && (
          <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>roles (comma-separated)
            <input value={Array.isArray(data.goal?.roles) ? data.goal.roles.join(',') : ''} onChange={(e) => patchNested('goal.roles', parseCommaSeparatedList(e.target.value))} style={{ width: '100%' }} />
          </label>
        )}
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Validation</h4>
        <label style={{ fontSize: 12 }}>validation.mode
          <select value={data.validation?.mode || 'equivalent'} onChange={(e) => patchNested('validation.mode', e.target.value)} style={{ marginLeft: 8 }}>
            <option value="normalized">normalized</option>
            <option value="equivalent">equivalent</option>
            <option value="state">state</option>
            <option value="compare_expressions">compare_expressions</option>
          </select>
        </label>

        {(data.validation?.mode === 'normalized' || data.validation?.mode === 'equivalent') && (
          <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>expected expressions (one per line)
            <textarea value={(data.validation?.expected || []).join('\n')} onChange={(e) => patchNested('validation.expected', parseLineSeparatedList(e.target.value))} style={{ width: '100%', minHeight: 60 }} />
          </label>
        )}

        {(data.validation?.mode === 'equivalent' || data.validation?.mode === 'compare_expressions') && (
          <>
            <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>test_values (comma-separated numbers)
              <input value={(data.validation?.test_values || []).join(', ')} onChange={(e) => patchNested('validation.test_values', parseNumberList(e.target.value))} style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>tolerance
              <input type="number" step="0.000001" value={data.validation?.tolerance ?? 0.000001} onChange={(e) => patchNested('validation.tolerance', Number(e.target.value || 0.000001))} style={{ width: 140 }} />
            </label>
          </>
        )}

        {data.validation?.mode === 'compare_expressions' && (
          <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>comparison
            <select value={data.validation?.comparison || 'equivalent'} onChange={(e) => patchNested('validation.comparison', e.target.value)} style={{ marginLeft: 8 }}>
              <option value="equivalent">equivalent</option>
            </select>
          </label>
        )}
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>State Rules</h4>
        <label style={{ fontSize: 12 }}>min_expressions <input type="number" value={data.validation?.state_rules?.min_expressions ?? ''} onChange={(e) => patchNested('validation.state_rules.min_expressions', Number(e.target.value || 0))} style={{ width: 80 }} /></label>
        <label style={{ fontSize: 12, marginLeft: 10 }}>max_expressions <input type="number" value={data.validation?.state_rules?.max_expressions ?? ''} onChange={(e) => patchNested('validation.state_rules.max_expressions', Number(e.target.value || 0))} style={{ width: 80 }} /></label>
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={Boolean(data.validation?.state_rules?.require_visible_only)} onChange={(e) => patchNested('validation.state_rules.require_visible_only', e.target.checked)} /> require_visible_only</label>
        </div>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>must_include_variables
          <input value={(data.validation?.state_rules?.must_include_variables || []).join(', ')} onChange={(e) => patchNested('validation.state_rules.must_include_variables', parseCommaSeparatedList(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>must_not_include_variables
          <input value={(data.validation?.state_rules?.must_not_include_variables || []).join(', ')} onChange={(e) => patchNested('validation.state_rules.must_not_include_variables', parseCommaSeparatedList(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>required_sliders
          <input value={(data.validation?.state_rules?.required_sliders || []).join(', ')} onChange={(e) => patchNested('validation.state_rules.required_sliders', parseCommaSeparatedList(e.target.value))} style={{ width: '100%' }} />
        </label>
        <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={Boolean(data.validation?.state_rules?.require_slider_creation)} onChange={(e) => patchNested('validation.state_rules.require_slider_creation', e.target.checked)} /> require_slider_creation</label>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={Boolean(data.validation?.state_rules?.require_slider_movement)} onChange={(e) => patchNested('validation.state_rules.require_slider_movement', e.target.checked)} /> require_slider_movement</label>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={Boolean(data.validation?.state_rules?.forbid_default_slider_values_on_submit)} onChange={(e) => patchNested('validation.state_rules.forbid_default_slider_values_on_submit', e.target.checked)} /> forbid_default_slider_values_on_submit</label>
        </div>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>slider_initial_values (key:value per line)
          <textarea value={sliderInitialValuesToText(data.validation?.state_rules?.slider_initial_values || {})} onChange={(e) => patchNested('validation.state_rules.slider_initial_values', parseSliderInitialValuesText(e.target.value))} style={{ width: '100%', minHeight: 50 }} />
        </label>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Feedback</h4>
        <label style={{ display: 'block', fontSize: 12 }}>success_message_html
          <textarea value={data.feedback?.success_message_html || ''} onChange={(e) => patchNested('feedback.success_message_html', e.target.value)} style={{ width: '100%', minHeight: 50 }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>retry_message_html
          <textarea value={data.feedback?.retry_message_html || ''} onChange={(e) => patchNested('feedback.retry_message_html', e.target.value)} style={{ width: '100%', minHeight: 50 }} />
        </label>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Targeted Hints</h4>
        {(data.feedback?.targeted_hints || []).map((hint, index) => (
          <div key={`${hint.trigger || 'hint'}-${index}`} style={{ border: '1px solid var(--border, #ddd)', borderRadius: 6, padding: 6, marginBottom: 6 }}>
            <select value={hint.trigger || KNOWN_HINT_TRIGGERS[0]} onChange={(e) => {
              const list = [...(data.feedback?.targeted_hints || [])];
              list[index] = { ...list[index], trigger: e.target.value };
              patchNested('feedback.targeted_hints', list);
            }} style={{ width: '100%' }}>
              {KNOWN_HINT_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{trigger}</option>)}
            </select>
            <textarea value={hint.message_html || ''} onChange={(e) => {
              const list = [...(data.feedback?.targeted_hints || [])];
              list[index] = { ...list[index], message_html: e.target.value };
              patchNested('feedback.targeted_hints', list);
            }} style={{ width: '100%', minHeight: 45, marginTop: 4 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn secondary" onClick={() => {
                const list = [...(data.feedback?.targeted_hints || [])];
                [list[index - 1], list[index]] = [list[index], list[index - 1]];
                patchNested('feedback.targeted_hints', list);
              }} disabled={index === 0}>Up</button>
              <button className="btn secondary" onClick={() => {
                const list = [...(data.feedback?.targeted_hints || [])];
                [list[index], list[index + 1]] = [list[index + 1], list[index]];
                patchNested('feedback.targeted_hints', list);
              }} disabled={index >= (data.feedback?.targeted_hints || []).length - 1}>Down</button>
              <button className="btn secondary" onClick={() => patchNested('feedback.targeted_hints', (data.feedback?.targeted_hints || []).filter((_, i) => i !== index))}>Delete</button>
            </div>
          </div>
        ))}
        <button className="btn secondary" onClick={() => patchNested('feedback.targeted_hints', [...(data.feedback?.targeted_hints || []), { trigger: 'missing_y_equals', message_html: '<p>Hint</p>' }])}>
          Add targeted hint
        </button>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Attempt-Based Feedback</h4>
        {(data.feedback?.attempt_based_hints || []).map((hint, index) => (
          <div key={`attempt-${index}`} style={{ border: '1px solid var(--border, #ddd)', borderRadius: 6, padding: 6, marginBottom: 6 }}>
            <label style={{ fontSize: 12 }}>min_attempts
              <input type="number" value={hint.min_attempts ?? 1} onChange={(e) => {
                const list = [...(data.feedback?.attempt_based_hints || [])];
                list[index] = { ...list[index], min_attempts: Number(e.target.value || 1) };
                patchNested('feedback.attempt_based_hints', list);
              }} style={{ width: 90, marginLeft: 8 }} />
            </label>
            <textarea value={hint.message_html || ''} onChange={(e) => {
              const list = [...(data.feedback?.attempt_based_hints || [])];
              list[index] = { ...list[index], message_html: e.target.value };
              patchNested('feedback.attempt_based_hints', list);
            }} style={{ width: '100%', minHeight: 45, marginTop: 4 }} />
            <button className="btn secondary" onClick={() => patchNested('feedback.attempt_based_hints', (data.feedback?.attempt_based_hints || []).filter((_, i) => i !== index))}>Delete</button>
          </div>
        ))}
        <button className="btn secondary" onClick={() => patchNested('feedback.attempt_based_hints', [...(data.feedback?.attempt_based_hints || []), { min_attempts: 2, message_html: '<p>Hint after attempt 2</p>' }])}>Add attempt hint</button>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>reveal_solution_after_attempts
          <input type="number" value={data.feedback?.reveal_solution_after_attempts ?? ''} onChange={(e) => patchNested('feedback.reveal_solution_after_attempts', e.target.value ? Number(e.target.value) : null)} style={{ width: 120 }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}>solution_html
          <textarea value={data.feedback?.solution_html || ''} onChange={(e) => patchNested('feedback.solution_html', e.target.value)} style={{ width: '100%', minHeight: 45 }} />
        </label>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Progression</h4>
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={data.progression?.require_success !== false} onChange={(e) => patchNested('progression.require_success', e.target.checked)} />
          {' '}require_success
        </label>
      </section>

      <section>
        <h4 style={{ margin: '6px 0' }}>Workflow / Context</h4>
        <label style={{ display: 'block', fontSize: 12 }}>workflow_id
          <input value={data.workflow_id || ''} onChange={(e) => patch({ workflow_id: e.target.value })} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 4 }}>step_index
          <input type="number" value={data.step_index ?? ''} onChange={(e) => patch({ step_index: e.target.value ? Number(e.target.value) : null })} style={{ width: 120 }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 4 }}>step_label
          <input value={data.step_label || ''} onChange={(e) => patch({ step_label: e.target.value })} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginTop: 4 }}>total_steps
          <input type="number" value={data.total_steps ?? ''} onChange={(e) => patch({ total_steps: e.target.value ? Number(e.target.value) : null })} style={{ width: 120 }} />
        </label>
        <label style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
          <input type="checkbox" checked={Boolean(data.inherit_from_previous_workflow_desmos)} onChange={(e) => patch({ inherit_from_previous_workflow_desmos: e.target.checked })} />
          {' '}inherit_from_previous_workflow_desmos
        </label>
      </section>
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
