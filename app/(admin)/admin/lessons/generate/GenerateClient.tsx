'use client';

// Two-phase driver for AI lesson generation.
//
// Compose phase — two inputs:
//
//   1. Lesson brief — free-form description of the lesson to write.
//   2. Prompt template (collapsed under "advanced") — the shared,
//      admin-editable prompt. {{LESSON_INFO}} marks where the brief
//      is substituted. "Save as shared default" persists it for all
//      admins; generation always uses the textarea's CURRENT text,
//      saved or not, so an admin can experiment per-run.
//
// Preview phase — generation posts to /api/admin/lessons/generate,
// which returns the draft (raw tool payload + mapped blocks) WITHOUT
// writing to the DB. The admin reviews a read-only render of the
// whole lesson (DraftPreview) and can loop: type feedback → the same
// route revises the draft via Claude → preview updates. Only
// "Continue to editor" persists the lesson (saveGeneratedLesson) and
// navigates into the existing block editor.

import { useActionState, useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { LESSON_INFO_PLACEHOLDER } from '@/lib/admin/lessonGenPrompt';
import { savePromptTemplate, resetPromptTemplate, saveGeneratedLesson } from './actions';
import { DraftPreview, type DraftBlock } from './DraftPreview';
import { GraphImageResolver } from './GraphImageResolver';
import type { PendingGraph } from '@/lib/admin/lessonGenMapper';
import f from '../../../forms.module.css';

interface GenerateClientProps {
  initialTemplate: string;
  isCustomized: boolean;
}

interface ValidationIssue {
  blockId?: string | null;
  message?: string;
}

interface DraftState {
  // Raw return_generated_lesson payload — echoed back to the route on
  // each revision turn so Claude revises rather than regenerates.
  generated: unknown;
  title: string;
  description: string | null;
  blocks: DraftBlock[];
  warnings: string[];
  // graph_image blocks still waiting for the browser-side Desmos
  // screenshot; the resolver swaps their html into `blocks` and
  // drains this list. Saving is gated until it is empty.
  pendingGraphs: PendingGraph[];
  // Bumped on every successful (re)generation; keys DraftPreview so
  // its local feedback box clears when a revision lands, and keys the
  // resolver so a revision restarts with a fresh processed-set.
  version: number;
}

export function GenerateClient({ initialTemplate, isCustomized }: GenerateClientProps) {
  const router = useRouter();
  const [brief, setBrief] = useState('');
  const [template, setTemplate] = useState(initialTemplate);
  // The last loaded/saved template text, for the "edited (unsaved)" hint.
  const [baseline, setBaseline] = useState(initialTemplate);
  const [customized, setCustomized] = useState(isCustomized);

  const [busy, setBusy] = useState<'idle' | 'generating' | 'revising' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);

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

  // Shared by initial generation and revision turns — both hit the
  // same route and hand back the same draft shape.
  async function callGenerate(payload: Record<string, unknown>, mode: 'generating' | 'revising') {
    setBusy(mode);
    setError(null);
    setValidationErrors([]);
    try {
      const res = await fetch('/api/admin/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setValidationErrors(Array.isArray(json.validationErrors) ? json.validationErrors : []);
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      setDraft((prev) => ({
        generated: json.data.generated,
        title: json.data.title,
        description: json.data.description ?? null,
        blocks: json.data.blocks ?? [],
        warnings: json.data.warnings ?? [],
        pendingGraphs: Array.isArray(json.data.pendingGraphs) ? json.data.pendingGraphs : [],
        version: (prev?.version ?? 0) + 1,
      }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'Generation timed out or the connection dropped — try again, or use a shorter brief.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy('idle');
    }
  }

  function generate() {
    void callGenerate({ lessonInfo: brief, template }, 'generating');
  }

  function requestChanges(feedback: string) {
    if (!draft) return;
    void callGenerate(
      { lessonInfo: brief, currentLesson: draft.generated, feedback },
      'revising',
    );
  }

  // Swap a resolved (or failed-with-note) graph image into its draft
  // block and drain the pending list. Failures also surface as a
  // draft warning so the admin knows to attach an image in the editor.
  const handleGraphResult = useCallback((blockId: string, html: string, ok: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.content?.id === blockId ? { ...b, content: { ...b.content, html } } : b,
        ),
        pendingGraphs: prev.pendingGraphs.filter((g) => g.blockId !== blockId),
        warnings: ok
          ? prev.warnings
          : [
              ...prev.warnings,
              'A graph image could not be rendered — a placeholder note was inserted; add an image in the editor.',
            ],
      };
    });
  }, []);

  async function confirmDraft() {
    if (!draft || draft.pendingGraphs.length > 0) return;
    setBusy('saving');
    setError(null);
    setValidationErrors([]);
    const result = await saveGeneratedLesson({
      title: draft.title,
      description: draft.description,
      blocks: draft.blocks,
    });
    if (result?.ok && result.data && typeof result.data.lessonId === 'string') {
      // Keep busy='saving' through the navigation so the button
      // doesn't flicker back to idle.
      router.push(`/admin/lessons/${result.data.lessonId}`);
      return;
    }
    setError(result?.ok === false ? result.error : 'Failed to save the lesson.');
    setBusy('idle');
  }

  function discardDraft() {
    setDraft(null);
    setError(null);
    setValidationErrors([]);
    window.scrollTo({ top: 0 });
  }

  if (draft) {
    return (
      <>
        {draft.pendingGraphs.length > 0 && (
          <GraphImageResolver
            key={`resolver-${draft.version}`}
            graphs={draft.pendingGraphs}
            onResult={handleGraphResult}
          />
        )}
        <DraftPreview
          key={`preview-${draft.version}`}
          title={draft.title}
          description={draft.description}
          blocks={draft.blocks}
          warnings={draft.warnings}
          pendingGraphCount={draft.pendingGraphs.length}
          busy={busy === 'revising' || busy === 'saving' ? busy : 'idle'}
          error={error}
          validationErrors={validationErrors}
          onRequestChanges={requestChanges}
          onConfirm={confirmDraft}
          onDiscard={discardDraft}
        />
      </>
    );
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
          disabled={busy === 'generating' || briefMissing || placeholderMissing}
        >
          {busy === 'generating'
            ? 'Generating… (can take 1–2 minutes)'
            : error
              ? '✨ Try again'
              : '✨ Generate lesson'}
        </Button>
        {briefMissing && busy !== 'generating' && (
          <span className={f.muted} style={S.hint}>
            Write a lesson brief to enable generation.
          </span>
        )}
      </div>

      {error && busy !== 'generating' && (
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
