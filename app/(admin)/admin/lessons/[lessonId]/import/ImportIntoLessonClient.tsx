// Client for importing a LessonTemplateSpec into an existing lesson.
// Paste JSON, choose replace vs append, see a live compile/validate
// summary, then submit to importBlocksIntoLesson.

'use client';

import { useActionState, useMemo, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import {
  compileLessonTemplateSpec,
  parseLessonTemplateSpecText,
} from '@/lib/lesson/template-import.mjs';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';
import { importBlocksIntoLesson } from './actions';
import f from '../../../../forms.module.css';

type Issue = { severity?: string; message?: string; path?: string; blockId?: string };

export function ImportIntoLessonClient({
  lessonId,
  currentBlockCount,
}: {
  lessonId: string;
  currentBlockCount: number;
}) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [state, formAction, pending] = useActionState(importBlocksIntoLesson as never, null);
  const result = state as { ok?: boolean; error?: string } | null;

  const summary = useMemo(() => {
    if (!text.trim()) return null;
    const parsed = parseLessonTemplateSpecText(text);
    if (parsed.error) return { parseError: `JSON parse error: ${parsed.error}` };
    const compiled = compileLessonTemplateSpec(parsed.spec);
    const errs: Issue[] = compiled.issues.filter((i: Issue) => i.severity === 'error');
    const warns: Issue[] = compiled.issues.filter((i: Issue) => i.severity === 'warning');
    const validation = validateLessonBlocks(
      compiled.blocks.map((b: { id?: string; content?: { id?: string } }, i: number) => ({
        ...b,
        id: b.id ?? b.content?.id ?? `index:${i}`,
      })),
    );
    return {
      blocks: compiled.blocks.length,
      types: compiled.blocks.map((b: { block_type?: string }) => b.block_type),
      compileErrors: errs,
      warnings: warns,
      validationErrors: validation.errors as Issue[],
      ok: errs.length === 0 && validation.ok,
    };
  }, [text]);

  const canSubmit = Boolean(text.trim()) && (!summary || (!summary.parseError && summary.ok)) && !pending;

  return (
    <form action={formAction} className={f.form}>
      <input type="hidden" name="lesson_id" value={lessonId} />

      <label className={f.label}>
        <span className={f.labelText}>LessonTemplateSpec JSON</span>
        <textarea
          name="spec"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={16}
          className={f.input}
          placeholder='{ "title": "...", "blocks": [ ... ] }'
          style={{ fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)', fontSize: 12, whiteSpace: 'pre', overflow: 'auto' }}
        />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="radio" name="mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />
          Replace all blocks{currentBlockCount > 0 ? ` (${currentBlockCount} will be removed)` : ''}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="radio" name="mode" value="append" checked={mode === 'append'} onChange={() => setMode('append')} />
          Append after existing blocks
        </label>
      </fieldset>

      {summary ? (
        <div style={summary.parseError || !summary.ok ? S.summaryBad : S.summaryOk}>
          {summary.parseError ? (
            <span>{summary.parseError}</span>
          ) : (
            <div>
              <strong>{summary.blocks} block(s)</strong>: {summary.types?.join(', ')}
              {summary.compileErrors && summary.compileErrors.length > 0 ? (
                <ul style={S.issueList}>
                  {summary.compileErrors.map((e, i) => (
                    <li key={`c${i}`}>{e.path}: {e.message}</li>
                  ))}
                </ul>
              ) : null}
              {summary.validationErrors && summary.validationErrors.length > 0 ? (
                <ul style={S.issueList}>
                  {summary.validationErrors.map((e, i) => (
                    <li key={`v${i}`}>{e.blockId}: {e.message}</li>
                  ))}
                </ul>
              ) : null}
              {summary.warnings && summary.warnings.length > 0 ? (
                <div style={{ color: 'var(--color-diff-med-fg)', marginTop: 4 }}>
                  {summary.warnings.length} warning(s) — import still allowed.
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className={f.actions}>
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {pending ? 'Importing…' : mode === 'replace' ? 'Replace blocks' : 'Append blocks'}
        </Button>
        {result?.ok === false ? <span className={f.err}>{result.error}</span> : null}
      </div>
    </form>
  );
}

const S: Record<string, React.CSSProperties> = {
  summaryOk: {
    padding: 10,
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-success)',
    background: 'var(--color-success-bg)',
    fontSize: 13,
  },
  summaryBad: {
    padding: 10,
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-danger)',
    background: 'var(--color-danger-bg, #fee2e2)',
    color: 'var(--color-danger)',
    fontSize: 13,
  },
  issueList: { margin: '4px 0 0', paddingLeft: 18 },
};
