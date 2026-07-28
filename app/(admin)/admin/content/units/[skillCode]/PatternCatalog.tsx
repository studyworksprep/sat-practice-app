'use client';

// Pattern-catalog editor client: one edit form per existing pattern
// (name / recognition cue / process / sequence, save + delete) and an
// add-new form at the bottom. Server re-renders after each action via
// revalidatePath, so local state is just the per-form pending flags.

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import f from '../../../../forms.module.css';
import a from '../../../../admin.module.css';

export interface PatternRow {
  id: string;
  name: string;
  recognition_cue: string;
  process_summary: string | null;
  sequence: number;
  classified_count: number;
}

type FormAction = (prev: unknown, formData: FormData) => Promise<unknown>;

interface PatternCatalogProps {
  skillCode: string;
  patterns: PatternRow[];
  totalQuestions: number;
  actions: { save: FormAction; remove: FormAction };
}

interface ActionState {
  ok?: boolean;
  error?: string;
}

function PatternForm({
  skillCode,
  pattern,
  saveAction,
}: {
  skillCode: string;
  pattern: PatternRow | null;
  saveAction: FormAction;
}) {
  const [state, formAction, pending] = useActionState(
    saveAction as (prev: unknown, formData: FormData) => Promise<ActionState | null>,
    null,
  );

  return (
    <form action={formAction} className={f.form}>
      <input type="hidden" name="skill_code" value={skillCode} />
      <input type="hidden" name="pattern_id" value={pattern?.id ?? ''} />

      <div className={f.grid}>
        <label className={f.label} style={{ flex: 2 }}>
          <span className={f.labelText}>Name (short, student-facing)</span>
          <input
            type="text"
            name="name"
            defaultValue={pattern?.name ?? ''}
            placeholder={'e.g. "No-solution systems"'}
            className={f.input}
            required
          />
        </label>
        <label className={f.label} style={{ maxWidth: 140 }}>
          <span className={f.labelText}>Teaching order</span>
          <input
            type="number"
            name="sequence"
            min="1"
            step="1"
            defaultValue={pattern?.sequence ?? ''}
            placeholder="1"
            className={f.input}
          />
        </label>
      </div>

      <label className={f.label}>
        <span className={f.labelText}>Recognition cue — one sentence: &ldquo;When you see…&rdquo;</span>
        <textarea
          name="recognition_cue"
          defaultValue={pattern?.recognition_cue ?? ''}
          placeholder={'When you see a system asked for the value that makes it have no solution…'}
          className={f.input}
          rows={2}
          required
        />
      </label>

      <label className={f.label}>
        <span className={f.labelText}>Process (the numbered steps, 1–3 lines — full detail goes in the lesson)</span>
        <textarea
          name="process_summary"
          defaultValue={pattern?.process_summary ?? ''}
          placeholder={'1. Rewrite both equations as y=mx+b. 2. Set slopes equal. 3. Check intercepts differ.'}
          className={f.input}
          rows={2}
        />
      </label>

      <div className={f.actions}>
        <Button type="submit" variant={pattern ? 'secondary' : 'primary'} disabled={pending}>
          {pending ? 'Saving…' : pattern ? 'Save changes' : '+ Add pattern'}
        </Button>
        {state?.ok === true && !pending && <span className={f.ok}>Saved.</span>}
        {state?.ok === false && !pending && <span className={f.err}>{state.error}</span>}
      </div>
    </form>
  );
}

function DeletePattern({
  skillCode,
  pattern,
  removeAction,
}: {
  skillCode: string;
  pattern: PatternRow;
  removeAction: FormAction;
}) {
  const [state, formAction, pending] = useActionState(
    removeAction as (prev: unknown, formData: FormData) => Promise<ActionState | null>,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        Delete…
      </Button>
    );
  }

  return (
    <form action={formAction} className={f.actions}>
      <input type="hidden" name="skill_code" value={skillCode} />
      <input type="hidden" name="pattern_id" value={pattern.id} />
      <span className={f.muted} style={{ fontSize: 12, maxWidth: 380 }}>
        Deleting unclassifies {pattern.classified_count} question
        {pattern.classified_count === 1 ? '' : 's'} and removes any lesson tags
        for this pattern. Type DELETE to confirm:
      </span>
      <input type="text" name="confirm" placeholder="DELETE" className={f.input} style={{ maxWidth: 110 }} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Deleting…' : 'Confirm delete'}
      </Button>
      <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {state?.ok === false && !pending && <span className={f.err}>{state.error}</span>}
    </form>
  );
}

export function PatternCatalog({ skillCode, patterns, totalQuestions, actions }: PatternCatalogProps) {
  const classifiedTotal = patterns.reduce((sum, p) => sum + p.classified_count, 0);

  return (
    <>
      <section className={a.section}>
        <h2 className={a.h2}>
          Patterns ({patterns.length})
          {totalQuestions > 0 && (
            <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 10, color: 'var(--fg3, #6b7280)' }}>
              {classifiedTotal} of {totalQuestions} questions classified
            </span>
          )}
        </h2>

        {patterns.length === 0 && (
          <p className={f.muted}>
            No patterns yet. Only catalog skills you actually teach as
            &ldquo;see format → run process&rdquo; — skills taught holistically
            don&rsquo;t need one.
          </p>
        )}

        {patterns.map((pattern) => (
          <div key={pattern.id} style={S.patternCard}>
            <div style={S.patternHeader}>
              <span style={S.patternBadge}>#{pattern.sequence}</span>
              <strong>{pattern.name}</strong>
              <span className={f.muted} style={{ fontSize: 13 }}>
                {pattern.classified_count} question{pattern.classified_count === 1 ? '' : 's'}
              </span>
              <div style={{ marginLeft: 'auto' }}>
                <DeletePattern skillCode={skillCode} pattern={pattern} removeAction={actions.remove} />
              </div>
            </div>
            <PatternForm skillCode={skillCode} pattern={pattern} saveAction={actions.save} />
          </div>
        ))}
      </section>

      <section className={a.section}>
        <h2 className={a.h2}>Add a pattern</h2>
        <PatternForm skillCode={skillCode} pattern={null} saveAction={actions.save} />
      </section>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  patternCard: {
    border: '1px solid var(--border, #e2e8f0)',
    borderRadius: 'var(--radius-md, 8px)',
    padding: '12px 14px',
    marginBottom: 12,
    background: 'var(--card, #fff)',
  },
  patternHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  patternBadge: {
    display: 'inline-flex',
    padding: '1px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: 'var(--color-slate-100, #f1f5f9)',
    border: '1px solid var(--border, #e2e8f0)',
  },
};
