// Client editor for one ACT question. Preview by default (what the
// student sees: sanitized HTML, MathJax typeset, the English/Reading
// qref highlight on the stimulus), with an Edit toggle that opens
// field-level editors for stimulus, stem, each answer option,
// rationale and taxonomy. Flag / retire live in the actions bar and
// work from either mode.
//
// Mirrors the import review DraftCard but edits the live row:
// options are real act_answer_options rows updated by id, so the
// editor keeps their ids and only lets label / content / correct
// change.

'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sanitizeQuestionHtml } from '@/lib/sanitize';
import { useMathTypeset, useQrefHighlight } from '@/lib/ui/preview-effects';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import type { ActionResult } from '@/lib/types';
import {
  saveActQuestion,
  setActQuestionBroken,
  retireActQuestion,
  restoreActQuestion,
} from '../actions';
import s from '../ActQuestions.module.css';

export interface ActQuestionRow {
  id: string;
  external_id: string | null;
  section: string;
  category: string;
  category_code: string | null;
  subcategory: string | null;
  subcategory_code: string | null;
  is_modeling: boolean;
  difficulty: number | null;
  difficulty_source: string | null;
  question_type: string;
  stimulus_html: string | null;
  stem_html: string;
  rationale_html: string | null;
  source_test: string | null;
  source_ordinal: number | null;
  is_broken: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ActOptionRow {
  id: string;
  ordinal: number;
  label: string;
  content_html: string;
  is_correct: boolean;
}

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const DIFFICULTY_SOURCE_LABEL: Record<string, string> = {
  import: 'from import',
  ai_estimate: 'AI estimate',
  manual: 'set by admin',
  performance: 'from student data',
};

export function ActQuestionEditor({
  question,
  options,
}: {
  question: ActQuestionRow;
  options: ActOptionRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [stem, setStem] = useState(question.stem_html ?? '');
  const [stimulus, setStimulus] = useState(question.stimulus_html ?? '');
  const [rationale, setRationale] = useState(question.rationale_html ?? '');
  const [draftOptions, setDraftOptions] = useState<ActOptionRow[]>(options);
  const [difficulty, setDifficulty] = useState(
    question.difficulty == null ? '' : String(question.difficulty),
  );
  const [category, setCategory] = useState(question.category ?? '');
  const [categoryCode, setCategoryCode] = useState(question.category_code ?? '');
  const [subcategory, setSubcategory] = useState(question.subcategory ?? '');
  const [subcategoryCode, setSubcategoryCode] = useState(question.subcategory_code ?? '');
  const [isModeling, setIsModeling] = useState(question.is_modeling);

  function resetFromProps() {
    setStem(question.stem_html ?? '');
    setStimulus(question.stimulus_html ?? '');
    setRationale(question.rationale_html ?? '');
    setDraftOptions(options);
    setDifficulty(question.difficulty == null ? '' : String(question.difficulty));
    setCategory(question.category ?? '');
    setCategoryCode(question.category_code ?? '');
    setSubcategory(question.subcategory ?? '');
    setSubcategoryCode(question.subcategory_code ?? '');
    setIsModeling(question.is_modeling);
  }

  function runAction(action: Action, extra: Record<string, string> = {}) {
    setError(null);
    setSavedFlash(false);
    const fd = new FormData();
    fd.set('question_id', question.id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        setEditing(false);
        setSavedFlash(true);
        router.refresh();
      } else {
        setError(res?.error ?? 'Action failed');
      }
    });
  }

  function onSave() {
    runAction(saveActQuestion, {
      stem_html: stem,
      stimulus_html: stimulus,
      rationale_html: rationale,
      options_json: JSON.stringify(draftOptions.map((o) => ({
        id: o.id, label: o.label, content_html: o.content_html, is_correct: o.is_correct,
      }))),
      difficulty,
      category,
      category_code: categoryCode,
      subcategory,
      subcategory_code: subcategoryCode,
      is_modeling: isModeling ? '1' : '0',
    });
  }

  async function onToggleBroken() {
    const next = !question.is_broken;
    if (next) {
      const ok = await confirm({
        title: 'Flag this question as broken?',
        body: 'Students will stop seeing it in practice and tests until the flag is cleared. Existing attempts stay on record.',
        confirmLabel: 'Flag broken',
        tone: 'danger',
      });
      if (!ok) return;
    }
    runAction(setActQuestionBroken, { broken: next ? '1' : '0' });
  }

  async function onRetire() {
    const ok = await confirm({
      title: 'Retire this question?',
      body: 'It disappears from every student picker and test form. Attempts, notes and error-log entries keep pointing at it, and an admin can restore it later.',
      confirmLabel: 'Retire',
      tone: 'danger',
    });
    if (!ok) return;
    runAction(retireActQuestion);
  }

  function onRestore() {
    runAction(restoreActQuestion);
  }

  function updateOption(id: string, patch: Partial<ActOptionRow>) {
    setDraftOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function markCorrect(id: string) {
    setDraftOptions((prev) => prev.map((o) => ({ ...o, is_correct: o.id === id })));
  }

  const difficultyNote = question.difficulty != null && question.difficulty_source
    ? DIFFICULTY_SOURCE_LABEL[question.difficulty_source] ?? question.difficulty_source
    : null;

  return (
    <>
      <div className={s.actions}>
        {!editing ? (
          <button type="button" className={s.btnPrimary} onClick={() => setEditing(true)} disabled={pending}>
            Edit
          </button>
        ) : (
          <>
            <button type="button" className={s.btnPrimary} onClick={onSave} disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className={s.btnGhost}
              onClick={() => { resetFromProps(); setEditing(false); setError(null); }}
              disabled={pending}
            >
              Cancel
            </button>
          </>
        )}
        <button type="button" className={s.btnSecondary} onClick={onToggleBroken} disabled={pending}>
          {question.is_broken ? 'Clear broken flag' : 'Flag broken'}
        </button>
        {question.deleted_at ? (
          <button type="button" className={s.btnSecondary} onClick={onRestore} disabled={pending}>
            Restore
          </button>
        ) : (
          <button type="button" className={s.btnDanger} onClick={onRetire} disabled={pending}>
            Retire
          </button>
        )}
        {savedFlash && !error && <span className={s.fieldHint}>Saved.</span>}
      </div>

      {error && <div className={s.error} role="alert">{error}</div>}

      {!editing ? (
        <section className={s.card}>
          {question.stimulus_html && (
            <FieldPreview
              label="Stimulus"
              html={question.stimulus_html}
              qrefOrdinal={question.source_ordinal}
              depKey={`${question.id}-${question.updated_at}`}
            />
          )}
          <FieldPreview label="Stem" html={question.stem_html} depKey={`${question.id}-${question.updated_at}`} />
          <div className={s.optionsPreview}>
            {options.map((o) => (
              <div key={o.id} className={`${s.optionRow} ${o.is_correct ? s.optionRowCorrect : ''}`}>
                <span className={s.optionLabel}>{o.label}</span>
                <OptionContent html={o.content_html} depKey={`${o.id}-${question.updated_at}`} />
                {o.is_correct && <span className={s.correctTick}>✓</span>}
              </div>
            ))}
          </div>
          {question.rationale_html
            ? <FieldPreview label="Rationale" html={question.rationale_html} depKey={`${question.id}-r-${question.updated_at}`} />
            : <div className={s.notice}>No rationale yet. Students see no explanation after answering this question.</div>}
          <div className={s.meta}>
            <span><strong>Category:</strong> {question.category}{question.category_code ? ` (${question.category_code})` : ''}</span>
            <span><strong>Subcategory:</strong> {question.subcategory ?? '—'}{question.subcategory_code ? ` (${question.subcategory_code})` : ''}</span>
            <span>
              <strong>Difficulty:</strong> {question.difficulty ?? '—'}
              {difficultyNote ? ` (${difficultyNote})` : ''}
            </span>
            {question.section === 'math' && (
              <span><strong>Modeling:</strong> {question.is_modeling ? 'yes' : 'no'}</span>
            )}
          </div>
        </section>
      ) : (
        <section className={s.card}>
          <label className={s.field}>
            <span className={s.fieldLabel}>Stimulus (HTML)</span>
            <textarea className={s.textarea} rows={6} value={stimulus} onChange={(e) => setStimulus(e.target.value)} />
            <span className={s.fieldHint}>Passage / figure shared by the question. Leave empty for a standalone math item.</span>
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Stem (HTML)</span>
            <textarea className={s.textarea} rows={4} value={stem} onChange={(e) => setStem(e.target.value)} />
          </label>
          <div className={s.field}>
            <span className={s.fieldLabel}>Answer options</span>
            {draftOptions.map((o) => (
              <div key={o.id} className={s.optionEditor}>
                <input
                  className={s.input}
                  value={o.label}
                  aria-label="Option label"
                  onChange={(e) => updateOption(o.id, { label: e.target.value })}
                />
                <textarea
                  className={s.textarea}
                  rows={2}
                  value={o.content_html}
                  aria-label={`Option ${o.label} content`}
                  onChange={(e) => updateOption(o.id, { content_html: e.target.value })}
                />
                <label className={s.optionCorrect}>
                  <input
                    type="radio"
                    name="correct-option"
                    checked={o.is_correct}
                    onChange={() => markCorrect(o.id)}
                  />
                  Correct
                </label>
              </div>
            ))}
            <span className={s.fieldHint}>Exactly one option must be marked correct. Changing the correct option does not re-grade past attempts.</span>
          </div>
          <label className={s.field}>
            <span className={s.fieldLabel}>Rationale (HTML)</span>
            <textarea className={s.textarea} rows={6} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
          <div className={s.fieldGrid}>
            <label className={s.field}>
              <span className={s.fieldLabel}>Category</span>
              <input className={s.input} value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Category code</span>
              <input className={s.input} value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Subcategory</span>
              <input className={s.input} value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Subcategory code</span>
              <input className={s.input} value={subcategoryCode} onChange={(e) => setSubcategoryCode(e.target.value)} />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Difficulty (1–5)</span>
              <input
                className={s.input}
                type="number"
                min={1}
                max={5}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              />
              <span className={s.fieldHint}>A changed value is recorded as set by admin.</span>
            </label>
            {question.section === 'math' && (
              <label className={s.toggle} style={{ alignSelf: 'end', paddingBottom: 8 }}>
                <input type="checkbox" checked={isModeling} onChange={(e) => setIsModeling(e.target.checked)} />
                Modeling question
              </label>
            )}
          </div>
        </section>
      )}
      {confirmDialog}
    </>
  );
}

// Preview blocks mirror the runner: sanitized HTML, sw-prose
// typography, MathJax typeset on mount / content change, and the
// [data-q] highlight for English / Reading references.
function FieldPreview({
  label,
  html,
  qrefOrdinal = null,
  depKey,
}: {
  label: string;
  html: string;
  qrefOrdinal?: number | null;
  depKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = sanitizeQuestionHtml(html ?? '');
  useMathTypeset(ref, `${depKey}-${label}`);
  useQrefHighlight(ref, qrefOrdinal ?? null, `${depKey}-${label}`);
  return (
    <div className={s.preview}>
      <div className={s.previewLabel}>{label}</div>
      <div ref={ref} className={`${s.previewBody} sw-prose`} dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
}

function OptionContent({ html, depKey }: { html: string; depKey: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const safe = sanitizeQuestionHtml(html ?? '');
  useMathTypeset(ref, depKey);
  return (
    <span ref={ref} className={`${s.optionContent} sw-option-content`} dangerouslySetInnerHTML={{ __html: safe }} />
  );
}
