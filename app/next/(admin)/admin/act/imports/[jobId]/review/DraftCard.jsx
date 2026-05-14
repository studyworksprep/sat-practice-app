// One row in the review listing. Shows a collapsed summary
// (section · ordinal · status pill · option preview · parse
// warnings) and expands into an inline editor with figure-upload
// affordances on stem / stimulus and JSON-textarea editing for
// options + taxonomy.
//
// The editor mirrors the SAT-side drafts editor (admin/content/
// drafts/[draftId]) in spirit but is simpler — ACT drafts are
// staging rows that exist only until approval, so we don't need
// the versioning / revalidation dance the SAT side requires.

'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import s from './Review.module.css';

const STATUS_TONE = {
  parsing: s.statusToneParsing,
  ready_for_review: s.statusToneReady,
  approved: s.statusToneApproved,
  rejected: s.statusToneRejected,
};

export function DraftCard({
  jobId,
  draft,
  statusLabel,
  saveAction,
  approveAction,
  rejectAction,
  unapproveAction,
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // Local editor state. Reset to draft props every time we
  // close the editor without saving (cancel button).
  const [stem, setStem] = useState(draft.stem_html ?? '');
  const [stimulus, setStimulus] = useState(draft.stimulus_html ?? '');
  const [rationale, setRationale] = useState(draft.rationale_html ?? '');
  const [optionsJson, setOptionsJson] = useState(
    JSON.stringify(draft.options_json ?? [], null, 2),
  );
  const [difficulty, setDifficulty] = useState(
    draft.difficulty == null ? '' : String(draft.difficulty),
  );
  const [category, setCategory] = useState(draft.category ?? '');
  const [categoryCode, setCategoryCode] = useState(draft.category_code ?? '');
  const [subcategory, setSubcategory] = useState(draft.subcategory ?? '');
  const [subcategoryCode, setSubcategoryCode] = useState(draft.subcategory_code ?? '');

  function resetFromDraft() {
    setStem(draft.stem_html ?? '');
    setStimulus(draft.stimulus_html ?? '');
    setRationale(draft.rationale_html ?? '');
    setOptionsJson(JSON.stringify(draft.options_json ?? [], null, 2));
    setDifficulty(draft.difficulty == null ? '' : String(draft.difficulty));
    setCategory(draft.category ?? '');
    setCategoryCode(draft.category_code ?? '');
    setSubcategory(draft.subcategory ?? '');
    setSubcategoryCode(draft.subcategory_code ?? '');
  }

  function runAction(action, extra = {}) {
    setError(null);
    const fd = new FormData();
    fd.set('draft_id', draft.id);
    fd.set('job_id', jobId);
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

  function onSave() {
    runAction(saveAction, {
      stem_html: stem,
      stimulus_html: stimulus,
      rationale_html: rationale,
      options_json: optionsJson,
      difficulty,
      category,
      category_code: categoryCode,
      subcategory,
      subcategory_code: subcategoryCode,
    });
  }

  function onApprove() {
    if (draft.status === 'approved') return;
    runAction(approveAction);
  }
  function onReject() {
    if (!window.confirm(`Reject this draft (Q${draft.source_ordinal}, ${draft.section})?`)) return;
    runAction(rejectAction);
  }
  function onUnapprove() {
    if (!window.confirm(
      `Unapprove draft Q${draft.source_ordinal}? The promoted question will be deleted from act_questions.`,
    )) return;
    runAction(unapproveAction);
  }

  const parseWarnings = Array.isArray(draft.parse_warnings) ? draft.parse_warnings : [];
  const opts = Array.isArray(draft.options_json) ? draft.options_json : [];
  const correctLabel = opts.find((o) => o.is_correct)?.label ?? '—';

  return (
    <article className={`${s.card} ${draft.status === 'approved' ? s.cardApproved : ''}`}>
      <header className={s.cardHeader}>
        <button
          type="button"
          className={s.cardSummaryBtn}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className={s.cardOrdinal}>Q{draft.source_ordinal}</span>
          <span className={`${s.cardStatus} ${STATUS_TONE[draft.status] ?? ''}`}>
            {statusLabel}
          </span>
          <span className={s.cardCorrect}>Correct: {correctLabel}</span>
          {draft.difficulty != null && (
            <span className={s.cardDiff}>D{draft.difficulty}</span>
          )}
          {draft.needs_figure && <span className={s.cardWarnBadge}>needs figure</span>}
          {parseWarnings.length > 0 && (
            <span className={s.cardWarnBadge}>{parseWarnings.length} warning{parseWarnings.length === 1 ? '' : 's'}</span>
          )}
          <span className={s.cardCaret}>{expanded ? '▾' : '▸'}</span>
        </button>
        <div className={s.cardActions}>
          {draft.status === 'ready_for_review' && (
            <>
              <button type="button" className={s.btnPrimary} onClick={onApprove} disabled={pending}>
                Approve
              </button>
              <button type="button" className={s.btnGhost} onClick={onReject} disabled={pending}>
                Reject
              </button>
            </>
          )}
          {draft.status === 'approved' && (
            <button type="button" className={s.btnGhost} onClick={onUnapprove} disabled={pending}>
              Unapprove
            </button>
          )}
          {draft.status === 'rejected' && (
            <button type="button" className={s.btnGhost} onClick={onUnapprove} disabled={pending}>
              Reset
            </button>
          )}
        </div>
      </header>

      {expanded && (
        <div className={s.cardBody}>
          {parseWarnings.length > 0 && (
            <ul className={s.warningList}>
              {parseWarnings.map((w, i) => (
                <li key={i}>{String(w)}</li>
              ))}
            </ul>
          )}

          {!editing ? (
            <>
              {draft.stimulus_html && (
                <DraftFieldPreview label="Stimulus" html={draft.stimulus_html} />
              )}
              <DraftFieldPreview label="Stem" html={draft.stem_html} />
              <div className={s.optionsPreview}>
                {opts.map((o, i) => (
                  <div
                    key={i}
                    className={`${s.optionRow} ${o.is_correct ? s.optionRowCorrect : ''}`}
                  >
                    <span className={s.optionLabel}>{o.label}</span>
                    <span
                      className={s.optionContent}
                      dangerouslySetInnerHTML={{ __html: o.content_html ?? '' }}
                    />
                    {o.is_correct && <span className={s.correctTick}>✓</span>}
                  </div>
                ))}
              </div>
              {draft.rationale_html && (
                <DraftFieldPreview label="Rationale" html={draft.rationale_html} />
              )}
              <div className={s.taxonomyPreview}>
                <span><strong>Category:</strong> {draft.category ?? '—'}{draft.category_code ? ` (${draft.category_code})` : ''}</span>
                <span><strong>Subcategory:</strong> {draft.subcategory ?? '—'}{draft.subcategory_code ? ` (${draft.subcategory_code})` : ''}</span>
                <span><strong>Difficulty:</strong> {draft.difficulty ?? '—'}</span>
              </div>
              <div className={s.cardFooter}>
                <button
                  type="button"
                  className={s.btnSecondary}
                  onClick={() => setEditing(true)}
                  disabled={pending}
                >
                  Edit
                </button>
              </div>
            </>
          ) : (
            <div className={s.editor}>
              <FieldWithFigureUpload
                label="Stimulus (HTML)"
                value={stimulus}
                onChange={setStimulus}
                rows={4}
              />
              <FieldWithFigureUpload
                label="Stem (HTML)"
                value={stem}
                onChange={setStem}
                rows={3}
              />
              <label className={s.field}>
                <span className={s.fieldLabel}>Options JSON</span>
                <textarea
                  className={`${s.textarea} ${s.mono}`}
                  rows={Math.min(20, Math.max(8, (optionsJson.split('\n').length) + 1))}
                  value={optionsJson}
                  onChange={(e) => setOptionsJson(e.target.value)}
                />
                <span className={s.fieldHint}>
                  Array of {`{ label, content_html, is_correct }`}. Exactly one must have is_correct: true.
                </span>
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>Rationale (HTML)</span>
                <textarea
                  className={s.textarea}
                  rows={3}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
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
                </label>
              </div>
              <div className={s.cardFooter}>
                <button type="button" className={s.btnPrimary} onClick={onSave} disabled={pending}>
                  {pending ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className={s.btnGhost}
                  onClick={() => { resetFromDraft(); setEditing(false); }}
                  disabled={pending}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <div className={s.cardError}>{error}</div>}
        </div>
      )}
    </article>
  );
}

function DraftFieldPreview({ label, html }) {
  return (
    <div className={s.preview}>
      <div className={s.previewLabel}>{label}</div>
      <div className={s.previewBody} dangerouslySetInnerHTML={{ __html: html ?? '' }} />
    </div>
  );
}

// Textarea + figure upload mirroring lib/admin/content/drafts/
// FieldWithUpload behavior: hash-named upload to question-figures
// (public bucket), public URL inserted as an <img> tag at the
// caret position so a figure can be dropped into the stem or
// stimulus without leaving the editor.
function FieldWithFigureUpload({ label, value, onChange, rows = 3 }) {
  const textareaRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadFigure(file);
      const tag = `<img src="${url}" alt="" style="max-width:100%;" />`;
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? value.length;
      const end = ta?.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + tag + value.slice(end));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className={s.field}>
      <div className={s.fieldHeader}>
        <span className={s.fieldLabel}>{label}</span>
        <span className={s.uploadInline}>
          <input type="file" accept="image/*" onChange={onPick} disabled={uploading} />
          {uploading && <span className={s.uploadingText}>Uploading…</span>}
          {error && <span className={s.uploadErrorText}>{error}</span>}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        className={s.textarea}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

async function uploadFigure(file) {
  const supabase = createClient();
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const ext = extensionFor(file);
  const path = `${hash}.${ext}`;
  const { error } = await supabase.storage
    .from('question-figures')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
  const { data } = supabase.storage.from('question-figures').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('upload succeeded but getPublicUrl returned nothing');
  return data.publicUrl;
}

function extensionFor(file) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,6}$/.test(fromName)) return fromName;
  const type = file.type?.split('/')[1]?.split('+')[0]?.toLowerCase();
  return type && /^[a-z0-9]{1,6}$/.test(type) ? type : 'bin';
}
