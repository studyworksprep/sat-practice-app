'use client';

// Two-input driver for AI lesson generation:
//
//   1. Lesson brief — free-form description of the lesson to write.
//   2. Prompt template (collapsed under "advanced") — the shared,
//      admin-editable prompt. {{LESSON_INFO}} marks where the brief
//      is substituted. "Save as shared default" persists it for all
//      admins; generation always uses the textarea's CURRENT text,
//      saved or not, so an admin can experiment per-run.
//
// Generation posts to /api/admin/lessons/generate, which writes the
// draft lesson + blocks server-side and returns { lessonId }; we then
// navigate straight into the existing block editor.

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { LESSON_INFO_PLACEHOLDER } from '@/lib/admin/lessonGenPrompt';
import { savePromptTemplate, resetPromptTemplate } from './actions';
import f from '../../../forms.module.css';

interface GenerateClientProps {
  initialTemplate: string;
  isCustomized: boolean;
}

interface ValidationIssue {
  blockId?: string | null;
  message?: string;
}

export function GenerateClient({ initialTemplate, isCustomized }: GenerateClientProps) {
  const router = useRouter();
  const [brief, setBrief] = useState('');
  const [template, setTemplate] = useState(initialTemplate);
  // The last loaded/saved template text, for the "edited (unsaved)" hint.
  const [baseline, setBaseline] = useState(initialTemplate);
  const [customized, setCustomized] = useState(isCustomized);

  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);

  const [resetPending, startReset] = useTransition();
  const [saveState, saveAction, savePending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await savePromptTemplate(prev, formData);
      if (result?.ok) {
        setBaseline(String(formData.get('template') ?? ''));
        setCustomized(true);
      }
      return result;
    },
    null,
  );

  const briefMissing = !brief.trim();
  const placeholderMissing = !template.includes(LESSON_INFO_PLACEHOLDER);
  const dirty = template !== baseline;

  function handleReset() {
    startReset(async () => {
      const result = await resetPromptTemplate();
      if (result?.ok && result.data && typeof result.data.template === 'string') {
        setTemplate(result.data.template);
        setBaseline(result.data.template);
        setCustomized(false);
      }
    });
  }

  async function generate() {
    setStatus('generating');
    setError(null);
    setValidationErrors([]);
    try {
      const res = await fetch('/api/admin/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonInfo: brief, template }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setValidationErrors(Array.isArray(json.validationErrors) ? json.validationErrors : []);
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      router.push(`/admin/lessons/${json.data.lessonId}`);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'Generation timed out or the connection dropped — try again, or use a shorter brief.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
      setStatus('error');
    }
  }

  return (
    <div style={S.col}>
      <section style={S.card}>
        <label className={f.label}>
          <span className={f.labelText}>Lesson brief</span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            autoFocus
            className={f.input}
            style={S.briefArea}
            placeholder={
              'Describe the lesson in as much detail as you can: topic and skill, who it is for, learning objectives, target length, worked examples or source material to draw from, common mistakes to address…'
            }
          />
        </label>
      </section>

      <details style={S.card}>
        <summary style={S.summary}>
          Prompt template (advanced)
          {customized && <span style={S.badge}>customized</span>}
          {dirty && <span style={{ ...S.badge, ...S.badgeDirty }}>edited (unsaved)</span>}
        </summary>
        <form action={saveAction} style={S.templateBody}>
          <p className={f.muted} style={S.hint}>
            This prompt is sent to Claude with your lesson brief substituted
            for <code>{LESSON_INFO_PLACEHOLDER}</code>. Generation always uses
            the text below as-is; &ldquo;Save as shared default&rdquo; makes it
            the starting template for every admin.
          </p>
          <textarea
            name="template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            spellCheck={false}
            className={f.input}
            style={S.templateArea}
          />
          {placeholderMissing && (
            <span className={f.err}>
              The template must contain {LESSON_INFO_PLACEHOLDER} — that marks
              where the lesson brief is inserted.
            </span>
          )}
          <div className={f.actions}>
            <Button type="submit" variant="secondary" disabled={savePending || placeholderMissing}>
              {savePending ? 'Saving…' : 'Save as shared default'}
            </Button>
            <Button type="button" variant="secondary" onClick={handleReset} disabled={resetPending}>
              {resetPending ? 'Resetting…' : 'Reset to default'}
            </Button>
            {saveState?.ok === true && !savePending && !dirty && (
              <span style={S.saved}>Saved.</span>
            )}
            {saveState?.ok === false && !savePending && (
              <span className={f.err}>{saveState.error}</span>
            )}
          </div>
        </form>
      </details>

      <div className={f.actions}>
        <Button
          type="button"
          variant="primary"
          onClick={generate}
          disabled={status === 'generating' || briefMissing || placeholderMissing}
        >
          {status === 'generating'
            ? 'Generating… (can take 1–2 minutes)'
            : status === 'error'
              ? '✨ Try again'
              : '✨ Generate lesson'}
        </Button>
        {briefMissing && status !== 'generating' && (
          <span className={f.muted} style={S.hint}>
            Write a lesson brief to enable generation.
          </span>
        )}
      </div>

      {status === 'error' && error && (
        <div style={S.error}>
          <div>{error}</div>
          {validationErrors.length > 0 && (
            <ul style={S.errorList}>
              {validationErrors.map((v, i) => (
                <li key={i}>
                  <code>{v.blockId ?? '?'}</code>: {v.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  col: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 14,
  },
  briefArea: {
    minHeight: 220,
    lineHeight: 1.55,
    resize: 'vertical',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    display: 'inline-flex',
    padding: '1px 8px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 700,
    background: 'var(--color-slate-100)',
    color: 'var(--fg3)',
    border: '1px solid var(--border)',
  },
  badgeDirty: {
    background: 'var(--color-diff-med-bg)',
    color: 'var(--color-diff-med-fg)',
    borderColor: 'var(--color-diff-med-bd)',
  },
  templateBody: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  templateArea: {
    minHeight: 320,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 12,
    lineHeight: 1.5,
    resize: 'vertical',
  },
  hint: { fontSize: 12 },
  saved: { color: 'var(--color-diff-easy-fg)', fontSize: 13, fontWeight: 600 },
  error: {
    padding: '10px 14px',
    background: 'var(--color-danger-bg, #fee2e2)',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    lineHeight: 1.5,
  },
  errorList: { margin: '8px 0 0', paddingLeft: 18 },
};
