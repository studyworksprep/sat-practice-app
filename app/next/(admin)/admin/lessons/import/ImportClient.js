// Client component that powers the LessonTemplateSpec import UX.
//
// The textarea state is local; on every change we re-parse with
// parseLessonTemplateSpecText, re-compile with compileLessonTemplateSpec,
// and re-validate with validateLessonBlocks so the preview reflects
// the document the user is staring at. The same three functions run
// again inside the Server Action when the form is submitted — the
// client preview is courtesy, not authority.

'use client';

import { useActionState, useMemo, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import {
  compileLessonTemplateSpec,
  parseLessonTemplateSpecText,
} from '@/lib/lesson/template-import.mjs';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';
import f from '../../../forms.module.css';

// Two seed examples mirrored from the legacy editor's IMPORT_EXAMPLES.
// Pasted as templates rather than imported because the legacy file is a
// 1000-line client component we don't want to pull into the next tree.
const EXAMPLES = {
  blank: '',
  equivalent_expressions: `{
  "title": "Equivalent Expressions: Mini Lesson",
  "description": "Graph + slider workflow.",
  "blocks": [
    { "kind": "text", "id": "intro", "html": "<p>Equivalent expressions can look different.</p>" },
    { "kind": "graph_comparison_workflow", "id": "graph_1", "original_expression": "y=(x+1)(x-3)", "candidate_expression": "y=x^2-2x-3" },
    { "kind": "slider_workflow", "id": "slider_1", "expression": "6X^2Y^2(X^6+2)", "variables": ["X", "Y"] },
    { "kind": "text", "id": "final", "html": "<p>Nice work.</p>" }
  ]
}`,
  boundaries: `{
  "title": "Boundaries Mini Lesson",
  "description": "Branching checks.",
  "blocks": [
    { "kind": "text", "id": "intro", "html": "<p>Let\\u2019s test boundaries.</p>" },
    { "kind": "branching_question", "id": "bq1", "question_html": "<p>Equivalent expressions always...</p>", "choices": [{"id":"a","text":"look the same"},{"id":"b","text":"give same output"}], "correct_choice_id": "b" },
    { "kind": "text", "id": "mid", "html": "<p>One more.</p>" },
    { "kind": "branching_question", "id": "bq2", "question_html": "<p>Can expressions with different domains be equivalent everywhere?</p>", "choices": [{"id":"a","text":"Yes"},{"id":"b","text":"No"}], "correct_choice_id": "b" }
  ]
}`,
};

export function ImportClient({ action }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [specText, setSpecText] = useState(EXAMPLES.equivalent_expressions);

  const preview = useMemo(() => buildPreview(specText), [specText]);

  return (
    <form action={formAction} className={f.form}>
      <section style={S.col}>
        <div style={S.row}>
          <label className={f.label} style={{ flex: '1 1 220px' }}>
            <span className={f.labelText}>Title override (optional)</span>
            <input
              name="title_override"
              type="text"
              placeholder="Defaults to spec.title"
              className={f.input}
            />
          </label>
          <label className={f.label} style={{ flex: '2 1 360px' }}>
            <span className={f.labelText}>Description override (optional)</span>
            <input
              name="description_override"
              type="text"
              placeholder="Defaults to spec.description"
              className={f.input}
            />
          </label>
          <label className={f.label} style={{ flex: '0 0 200px' }}>
            <span className={f.labelText}>Seed from example</span>
            <select
              className={f.select}
              defaultValue="equivalent_expressions"
              onChange={(e) => {
                const next = EXAMPLES[e.target.value];
                if (next !== undefined) setSpecText(next);
              }}
            >
              <option value="equivalent_expressions">Equivalent expressions</option>
              <option value="boundaries">Boundaries (branching)</option>
              <option value="blank">Blank</option>
            </select>
          </label>
        </div>
      </section>

      <section style={S.split}>
        <div style={S.col}>
          <label className={f.label}>
            <span className={f.labelText}>LessonTemplateSpec JSON</span>
            <textarea
              name="spec"
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              spellCheck={false}
              className={f.input}
              style={S.textarea}
            />
          </label>
        </div>

        <aside style={S.preview}>
          <PreviewPanel preview={preview} />
        </aside>
      </section>

      <div className={f.actions}>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !preview.canSubmit}
        >
          {pending ? 'Importing…' : 'Create lesson'}
        </Button>
        {state?.ok === false && !pending && (
          <span className={f.err}>{state.error}</span>
        )}
        {!preview.canSubmit && !pending && (
          <span className={f.muted} style={S.disabledHint}>
            Fix the errors below to enable submit.
          </span>
        )}
      </div>
    </form>
  );
}

function buildPreview(specText) {
  if (!specText || !specText.trim()) {
    return {
      parseError: null,
      compileIssues: [],
      validationErrors: [],
      validationWarnings: [],
      blocks: [],
      title: null,
      description: null,
      canSubmit: false,
      empty: true,
    };
  }

  const parsed = parseLessonTemplateSpecText(specText);
  if (parsed.error) {
    return {
      parseError: parsed.error,
      compileIssues: [],
      validationErrors: [],
      validationWarnings: [],
      blocks: [],
      title: null,
      description: null,
      canSubmit: false,
      empty: false,
    };
  }

  const compiled = compileLessonTemplateSpec(parsed.spec);
  const compileErrors = compiled.issues.filter((i) => i.severity === 'error');
  const compileWarnings = compiled.issues.filter((i) => i.severity !== 'error');

  let validationErrors = [];
  let validationWarnings = [];
  if (compileErrors.length === 0 && compiled.blocks.length > 0) {
    const v = validateLessonBlocks(compiled.blocks);
    validationErrors = v.errors ?? [];
    validationWarnings = v.warnings ?? [];
  }

  const canSubmit =
    compileErrors.length === 0 &&
    compiled.blocks.length > 0 &&
    validationErrors.length === 0;

  return {
    parseError: null,
    compileIssues: [...compileErrors, ...compileWarnings],
    validationErrors,
    validationWarnings,
    blocks: compiled.blocks,
    title: compiled.lessonMetadata?.title ?? null,
    description: compiled.lessonMetadata?.description ?? null,
    canSubmit,
    empty: false,
  };
}

function PreviewPanel({ preview }) {
  if (preview.empty) {
    return <p style={S.muted}>Paste a spec to see the preview.</p>;
  }

  if (preview.parseError) {
    return (
      <div>
        <div style={S.previewHead}>JSON parse error</div>
        <pre style={S.error}>{preview.parseError}</pre>
      </div>
    );
  }

  return (
    <div style={S.col}>
      <div>
        <div style={S.previewHead}>Lesson</div>
        <div style={S.kv}>
          <div style={S.k}>Title</div>
          <div style={S.v}>{preview.title || <em>(none)</em>}</div>
        </div>
        <div style={S.kv}>
          <div style={S.k}>Description</div>
          <div style={S.v}>{preview.description || <em>(none)</em>}</div>
        </div>
        <div style={S.kv}>
          <div style={S.k}>Blocks</div>
          <div style={S.v}>{preview.blocks.length}</div>
        </div>
      </div>

      {preview.compileIssues.length > 0 && (
        <div>
          <div style={S.previewHead}>
            Compile issues ({preview.compileIssues.length})
          </div>
          <ul style={S.list}>
            {preview.compileIssues.map((issue, idx) => (
              <li
                key={idx}
                style={issue.severity === 'error' ? S.issueErr : S.issueWarn}
              >
                <code>{issue.path}</code>: {issue.message}
                {issue.suggestion && (
                  <span style={S.muted}> — {issue.suggestion}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(preview.validationErrors.length > 0 ||
        preview.validationWarnings.length > 0) && (
        <div>
          <div style={S.previewHead}>
            Validation ({preview.validationErrors.length} errors,{' '}
            {preview.validationWarnings.length} warnings)
          </div>
          <ul style={S.list}>
            {preview.validationErrors.map((e, idx) => (
              <li key={`e-${idx}`} style={S.issueErr}>
                <code>{e.blockId ?? '?'}</code>: {e.message}
              </li>
            ))}
            {preview.validationWarnings.map((w, idx) => (
              <li key={`w-${idx}`} style={S.issueWarn}>
                <code>{w.blockId ?? '?'}</code>: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.blocks.length > 0 && (
        <div>
          <div style={S.previewHead}>Compiled blocks</div>
          <ol style={S.list}>
            {preview.blocks.map((b) => (
              <li key={b.id} style={S.blockRow}>
                <span style={S.blockType}>{b.block_type}</span>
                <code style={S.blockId}>{b.id}</code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

const S = {
  col: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)',
    gap: 16,
    alignItems: 'stretch',
  },
  textarea: {
    minHeight: 480,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre',
    overflow: 'auto',
    resize: 'vertical',
  },
  preview: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 14,
    fontSize: 12,
    overflow: 'auto',
    minHeight: 480,
  },
  previewHead: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--fg3)',
    marginBottom: 6,
  },
  kv: { display: 'flex', gap: 8, fontSize: 12, padding: '2px 0' },
  k: { width: 80, color: 'var(--fg3)' },
  v: { flex: 1, color: 'var(--fg1)', wordBreak: 'break-word' },
  list: { margin: '0', padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 },
  blockRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 },
  blockType: { fontWeight: 700, color: 'var(--color-navy-900)' },
  blockId: { color: 'var(--fg3)' },
  issueErr: { color: 'var(--color-danger)', fontSize: 12 },
  issueWarn: { color: 'var(--color-diff-med-fg)', fontSize: 12 },
  error: {
    background: 'var(--color-danger-bg, #fee2e2)',
    color: 'var(--color-danger)',
    padding: 8,
    borderRadius: 6,
    fontSize: 12,
    whiteSpace: 'pre-wrap',
  },
  muted: { color: 'var(--fg3)', fontSize: 12 },
  disabledHint: { color: 'var(--fg3)', fontSize: 12 },
};
