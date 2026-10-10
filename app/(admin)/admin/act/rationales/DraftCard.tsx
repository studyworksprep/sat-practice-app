// One draft in the review queue: the question (stimulus, stem,
// options with the key marked), the model's rationale rendered as
// the student will see it, the validator's notes, and the review
// actions. Edit opens the HTML in a textarea; Approve sends the
// edited text in the same click.

'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sanitizeQuestionHtml } from '@/lib/sanitize';
import { useMathTypeset, useQrefHighlight } from '@/lib/ui/preview-effects';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import type { ActionResult } from '@/lib/types';
import {
  approveActRationale,
  rejectActRationale,
  regenerateActRationale,
  saveActRationaleDraft,
} from './actions';
import s from '../questions/ActQuestions.module.css';

export interface DraftView {
  id: string;
  question_id: string;
  rationale_html: string;
  answer_letter: string | null;
  confidence: string | null;
  model_notes: string | null;
  model: string;
  prompt_version: string;
  status: string;
  needs_review: boolean;
  warnings: unknown;
  created_at: string;
  updated_at: string;
  question: {
    id: string;
    section: string;
    category: string | null;
    source_test: string | null;
    source_ordinal: number | null;
    stimulus_html: string | null;
    stem_html: string;
    rationale_html: string | null;
  };
  options: Array<{ label: string; content_html: string; is_correct: boolean }>;
}

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function DraftCard({ draft }: { draft: DraftView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [open, setOpen] = useState(draft.needs_review);
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState(draft.rationale_html);
  const [error, setError] = useState<string | null>(null);

  const warnings = Array.isArray(draft.warnings) ? (draft.warnings as string[]) : [];
  const hasError = warnings.some((w) => w.startsWith('ERROR:'));
  const q = draft.question;
  const correct = draft.options.find((o) => o.is_correct)?.label ?? '—';
  const title = [q.source_test ?? 'Unfiled', sectionLabel(q.section), q.source_ordinal != null ? `Q${q.source_ordinal}` : null]
    .filter(Boolean).join(' · ');

  function run(action: Action, extra: Record<string, string> = {}) {
    setError(null);
    const fd = new FormData();
    fd.set('draft_id', draft.id);
    fd.set('question_id', draft.question_id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res?.error ?? 'Action failed');
      }
    });
  }

  function onApprove() {
    run(approveActRationale, editing && html !== draft.rationale_html ? { rationale_html: html } : {});
  }
  async function onReject() {
    const ok = await confirm({ title: 'Reject this draft?', body: 'The question keeps no rationale; you can regenerate later.', confirmLabel: 'Reject', tone: 'danger' });
    if (ok) run(rejectActRationale);
  }
  async function onRegenerate() {
    const ok = await confirm({ title: 'Regenerate this rationale?', body: 'Replaces the current draft with a fresh one from the model.', confirmLabel: 'Regenerate' });
    if (ok) run(regenerateActRationale);
  }
  function onSave() {
    run(saveActRationaleDraft, { rationale_html: html });
  }

  return (
    <article className={s.card}>
      <div className={s.titleRow}>
        <button
          type="button"
          className={s.btnGhost}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ paddingLeft: 0 }}
        >
          <strong>{open ? '▾' : '▸'} {title}</strong>
        </button>
        <div className={s.actions}>
          {hasError && <span className={`${s.pill} ${s.pillDanger}`}>key mismatch</span>}
          {draft.needs_review && !hasError && <span className={`${s.pill} ${s.pillWarn}`}>held for review</span>}
          {draft.confidence && draft.confidence !== 'high' && (
            <span className={`${s.pill} ${s.pillMuted}`}>confidence {draft.confidence}</span>
          )}
          <span className={`${s.pill} ${s.pillMuted}`}>key {correct} · model said {draft.answer_letter ?? '—'}</span>
          <Link href={`/admin/act/questions/${draft.question_id}`} className={s.clearLink}>open question</Link>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className={s.notice} style={{ margin: 0, paddingLeft: 18 }}>
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      {draft.model_notes && (
        <div className={s.notice}><strong>Model note:</strong> {draft.model_notes}</div>
      )}

      {open && (
        <>
          {q.stimulus_html && (
            <Preview label="Stimulus" html={q.stimulus_html} qrefOrdinal={q.source_ordinal} depKey={`${draft.id}-stim`} />
          )}
          <Preview label="Stem" html={q.stem_html} depKey={`${draft.id}-stem`} />
          <div className={s.optionsPreview}>
            {draft.options.map((o) => (
              <div key={o.label} className={`${s.optionRow} ${o.is_correct ? s.optionRowCorrect : ''}`}>
                <span className={s.optionLabel}>{o.label}</span>
                <OptionContent html={o.content_html} depKey={`${draft.id}-${o.label}`} />
                {o.is_correct && <span className={s.correctTick}>✓</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {editing ? (
        <label className={s.field}>
          <span className={s.fieldLabel}>Rationale (HTML)</span>
          <textarea className={s.textarea} rows={10} value={html} onChange={(e) => setHtml(e.target.value)} />
        </label>
      ) : (
        <Preview label="Draft rationale" html={html} depKey={`${draft.id}-r-${draft.updated_at}`} />
      )}

      {q.rationale_html && draft.status !== 'approved' && (
        <div className={s.notice}>This question already has a rationale on the live row; approving replaces it.</div>
      )}

      <div className={s.actions}>
        {draft.status === 'pending' && (
          <button type="button" className={s.btnPrimary} onClick={onApprove} disabled={pending}>
            {pending ? 'Working…' : editing ? 'Save & approve' : 'Approve'}
          </button>
        )}
        {editing ? (
          <>
            <button type="button" className={s.btnSecondary} onClick={onSave} disabled={pending}>Save draft</button>
            <button type="button" className={s.btnGhost} onClick={() => { setHtml(draft.rationale_html); setEditing(false); }} disabled={pending}>Cancel</button>
          </>
        ) : (
          <button type="button" className={s.btnSecondary} onClick={() => setEditing(true)} disabled={pending}>Edit</button>
        )}
        <button type="button" className={s.btnSecondary} onClick={onRegenerate} disabled={pending}>Regenerate</button>
        {draft.status === 'pending' && (
          <button type="button" className={s.btnDanger} onClick={onReject} disabled={pending}>Reject</button>
        )}
        <span className={s.fieldHint}>{draft.model} · {draft.prompt_version}</span>
      </div>
      {error && <div className={s.error} role="alert">{error}</div>}
      {confirmDialog}
    </article>
  );
}

function Preview({ label, html, qrefOrdinal = null, depKey }: { label: string; html: string; qrefOrdinal?: number | null; depKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = sanitizeQuestionHtml(html ?? '');
  useMathTypeset(ref, depKey);
  useQrefHighlight(ref, qrefOrdinal ?? null, depKey);
  return (
    <div className={s.preview}>
      <div className={s.previewLabel}>{label}</div>
      <div ref={ref} className={`${s.previewBody} sw-prose`} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
}

function OptionContent({ html, depKey }: { html: string; depKey: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const safe = sanitizeQuestionHtml(html ?? '');
  useMathTypeset(ref, depKey);
  return <span ref={ref} className={`${s.optionContent} sw-option-content`} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: safe }} />;
}
