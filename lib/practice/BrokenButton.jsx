// Manager/admin per-question "Broken?" button + inspection
// modal. Two purposes:
//
//   1. Flag a question as broken (with optional content/taxonomy
//      corrections that auto re-render math).
//   2. Inspect the stored source HTML and the rendered output
//      MathJax / KaTeX produced — useful for debugging math
//      display issues like the College Board source's pervasive
//      display="block" attribute.
//
// UX shape:
//   - red flag icon button, gold when is_broken is true
//   - click opens a modal with each editable field laid out
//     vertically. For each field, we show:
//       * editable <textarea> for source HTML
//       * read-only rendered HTML (raw <pre> + visual preview)
//   - taxonomy fields editable below
//   - "Mark broken" toggle + Save / Cancel
//
// The rendered HTML viewer is the key inspection feature — it
// makes it possible to see exactly what the renderer produced
// without copying rows out of the DB.

'use client';

import { useState, useTransition } from 'react';
import {
  flagQuestionBroken,
  saveQuestionCorrections,
} from './broken-actions';
import s from './BrokenButton.module.css';

const DIFFICULTY_OPTIONS = [
  { value: '', label: '—' },
  { value: '1', label: 'Easy (1)' },
  { value: '2', label: 'Medium (2)' },
  { value: '3', label: 'Hard (3)' },
];

const SCORE_BAND_OPTIONS = [
  { value: '', label: '—' },
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: `Band ${n}` })),
];

/**
 * @param {object} props
 * @param {string} props.questionId
 * @param {boolean} [props.canEdit=false]
 * @param {boolean} [props.initialIsBroken=false]
 * @param {object|null} [props.raw]
 * @param {object|null} [props.rendered]
 * @param {object|null} [props.taxonomy]
 * @param {string|null} [props.renderedSourceHash]
 */
export function BrokenButton({
  questionId,
  canEdit = false,
  initialIsBroken = false,
  raw = null,
  rendered = null,
  taxonomy = null,
  renderedSourceHash = null,
}) {
  const [isBroken, setIsBroken] = useState(initialIsBroken);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  const btnCls = [s.iconBtn, isBroken ? s.iconBtnBroken : null]
    .filter(Boolean).join(' ');

  return (
    <>
      <button
        type="button"
        className={btnCls}
        onClick={() => setOpen(true)}
        title={isBroken ? 'Flagged broken' : 'Inspect / flag broken'}
        aria-label={isBroken ? 'Question flagged broken' : 'Inspect or flag question'}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M5 3v18M5 3h14l-4 6 4 6H5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{isBroken ? 'Broken' : 'Broken?'}</span>
      </button>

      {open && (
        <BrokenModal
          questionId={questionId}
          isBroken={isBroken}
          raw={raw}
          rendered={rendered}
          taxonomy={taxonomy}
          renderedSourceHash={renderedSourceHash}
          pending={pending}
          error={error}
          startTransition={startTransition}
          setError={setError}
          setIsBroken={setIsBroken}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BrokenModal({
  questionId,
  isBroken,
  raw,
  rendered,
  taxonomy,
  renderedSourceHash,
  pending,
  error,
  startTransition,
  setError,
  setIsBroken,
  onClose,
}) {
  const [stemHtml, setStemHtml]           = useState(raw?.stemHtml ?? '');
  const [stimulusHtml, setStimulusHtml]   = useState(raw?.stimulusHtml ?? '');
  const [rationaleHtml, setRationaleHtml] = useState(raw?.rationaleHtml ?? '');
  const [optionEdits, setOptionEdits]     = useState(() => {
    const init = {};
    for (const opt of raw?.options ?? []) init[opt.label] = opt.contentHtml;
    return init;
  });
  const [tax, setTax] = useState({
    difficulty: taxonomy?.difficulty != null ? String(taxonomy.difficulty) : '',
    scoreBand:  taxonomy?.scoreBand  != null ? String(taxonomy.scoreBand)  : '',
    domainCode: taxonomy?.domainCode ?? '',
    domainName: taxonomy?.domainName ?? '',
    skillCode:  taxonomy?.skillCode ?? '',
    skillName:  taxonomy?.skillName ?? '',
  });
  const [flagBroken, setFlagBroken] = useState(isBroken);
  const [renderedView, setRenderedView] = useState(rendered);

  const renderedOptionByLabel = new Map(
    (renderedView?.options ?? []).map((o) => [o.label, o.contentHtmlRendered]),
  );

  function handleQuickToggle() {
    setError(null);
    startTransition(async () => {
      const res = await flagQuestionBroken({ questionId, isBroken: !isBroken });
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to update.');
        return;
      }
      setIsBroken(res.data?.isBroken ?? !isBroken);
      setFlagBroken(res.data?.isBroken ?? !isBroken);
    });
  }

  function handleSave() {
    setError(null);
    const optionsPatch = {};
    for (const opt of raw?.options ?? []) {
      const next = optionEdits[opt.label] ?? '';
      if (next !== opt.contentHtml) optionsPatch[opt.label] = next;
    }
    const taxonomyPatch = {};
    if (tax.difficulty !== (taxonomy?.difficulty != null ? String(taxonomy.difficulty) : '')) {
      taxonomyPatch.difficulty = tax.difficulty === '' ? null : Number(tax.difficulty);
    }
    if (tax.scoreBand !== (taxonomy?.scoreBand != null ? String(taxonomy.scoreBand) : '')) {
      taxonomyPatch.scoreBand = tax.scoreBand === '' ? null : Number(tax.scoreBand);
    }
    if (tax.domainCode !== (taxonomy?.domainCode ?? '')) {
      taxonomyPatch.domainCode = tax.domainCode;
      taxonomyPatch.domainName = tax.domainName;
    }
    if (tax.skillCode !== (taxonomy?.skillCode ?? '')) {
      taxonomyPatch.skillCode = tax.skillCode;
      taxonomyPatch.skillName = tax.skillName;
    }

    const args = { questionId };
    if (stemHtml !== (raw?.stemHtml ?? '')) args.stemHtml = stemHtml;
    if (stimulusHtml !== (raw?.stimulusHtml ?? '')) args.stimulusHtml = stimulusHtml;
    if (rationaleHtml !== (raw?.rationaleHtml ?? '')) args.rationaleHtml = rationaleHtml;
    if (Object.keys(optionsPatch).length > 0) args.options = optionsPatch;
    if (Object.keys(taxonomyPatch).length > 0) args.taxonomy = taxonomyPatch;
    if (flagBroken !== isBroken) args.isBroken = flagBroken;

    if (Object.keys(args).length === 1) {
      setError('No changes to save.');
      return;
    }

    startTransition(async () => {
      const res = await saveQuestionCorrections(args);
      if (!res?.ok) {
        setError(res?.error ?? 'Save failed.');
        return;
      }
      if (res.data?.isBroken !== null && res.data?.isBroken !== undefined) {
        setIsBroken(res.data.isBroken);
        setFlagBroken(res.data.isBroken);
      }
      if (res.data?.rendered) setRenderedView(res.data.rendered);
    });
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Question inspection / corrections"
      >
        <div className={s.header}>
          <div>
            <div className={s.title}>Question inspection</div>
            <div className={s.subtitle}>
              <span className={s.mono}>{questionId}</span>
              {raw?.questionType && <> · {raw.questionType.toUpperCase()}</>}
              {renderedSourceHash && (
                <> · render <span className={s.mono}>{renderedSourceHash.slice(0, 8)}</span></>
              )}
            </div>
          </div>
          <div className={s.headerActions}>
            <button
              type="button"
              className={s.btnSecondary}
              onClick={handleQuickToggle}
              disabled={pending}
              title="Toggle broken without editing content"
            >
              {isBroken ? 'Unflag broken' : 'Flag broken'}
            </button>
            <button
              type="button"
              className={s.closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={s.body}>
          <FieldPair
            label="Stimulus HTML"
            sourceValue={stimulusHtml}
            onSourceChange={setStimulusHtml}
            renderedValue={renderedView?.stimulusRendered ?? null}
            rows={6}
          />
          <FieldPair
            label="Stem HTML"
            sourceValue={stemHtml}
            onSourceChange={setStemHtml}
            renderedValue={renderedView?.stemRendered ?? null}
            rows={6}
          />
          {(raw?.options ?? []).map((opt) => (
            <FieldPair
              key={opt.label}
              label={`Option ${opt.label}`}
              sourceValue={optionEdits[opt.label] ?? ''}
              onSourceChange={(v) =>
                setOptionEdits((prev) => ({ ...prev, [opt.label]: v }))
              }
              renderedValue={renderedOptionByLabel.get(opt.label) ?? null}
              rows={3}
            />
          ))}
          <FieldPair
            label="Rationale HTML"
            sourceValue={rationaleHtml}
            onSourceChange={setRationaleHtml}
            renderedValue={renderedView?.rationaleRendered ?? null}
            rows={6}
          />

          <div className={s.taxonomy}>
            <div className={s.taxonomyHead}>Taxonomy</div>
            <div className={s.taxonomyGrid}>
              <label className={s.taxField}>
                <span>Difficulty</span>
                <select
                  className={s.input}
                  value={tax.difficulty}
                  onChange={(e) => setTax({ ...tax, difficulty: e.target.value })}
                >
                  {DIFFICULTY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className={s.taxField}>
                <span>Score band</span>
                <select
                  className={s.input}
                  value={tax.scoreBand}
                  onChange={(e) => setTax({ ...tax, scoreBand: e.target.value })}
                >
                  {SCORE_BAND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className={s.taxField}>
                <span>Domain code</span>
                <input
                  className={s.input}
                  value={tax.domainCode}
                  onChange={(e) => setTax({ ...tax, domainCode: e.target.value })}
                />
              </label>
              <label className={s.taxField}>
                <span>Domain name</span>
                <input
                  className={s.input}
                  value={tax.domainName}
                  onChange={(e) => setTax({ ...tax, domainName: e.target.value })}
                />
              </label>
              <label className={s.taxField}>
                <span>Skill code</span>
                <input
                  className={s.input}
                  value={tax.skillCode}
                  onChange={(e) => setTax({ ...tax, skillCode: e.target.value })}
                />
              </label>
              <label className={s.taxField}>
                <span>Skill name</span>
                <input
                  className={s.input}
                  value={tax.skillName}
                  onChange={(e) => setTax({ ...tax, skillName: e.target.value })}
                />
              </label>
            </div>
          </div>

          <label className={s.brokenToggle}>
            <input
              type="checkbox"
              checked={flagBroken}
              onChange={(e) => setFlagBroken(e.target.checked)}
            />
            <span>Mark this question as broken</span>
          </label>
        </div>

        <div className={s.footer}>
          {error && <div className={s.error}>{error}</div>}
          <div className={s.footerActions}>
            <button type="button" className={s.btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={s.btnPrimary}
              onClick={handleSave}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save corrections'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One row: editable source HTML on the left, read-only rendered
 * HTML on the right (raw text + visual preview).
 */
function FieldPair({ label, sourceValue, onSourceChange, renderedValue, rows = 4 }) {
  const hasRendered = renderedValue != null && renderedValue !== '';
  return (
    <div className={s.fieldPair}>
      <div className={s.fieldLabel}>{label}</div>
      <div className={s.fieldGrid}>
        <div className={s.fieldCol}>
          <div className={s.fieldColHead}>Source HTML</div>
          <textarea
            className={s.textarea}
            value={sourceValue}
            onChange={(e) => onSourceChange(e.target.value)}
            rows={rows}
            spellCheck={false}
          />
        </div>
        <div className={s.fieldCol}>
          <div className={s.fieldColHead}>
            Rendered
            {!hasRendered && (
              <span className={s.fieldNullNote}>NULL · no math, falls back to source</span>
            )}
          </div>
          {hasRendered && (
            <>
              <div
                className={s.preview}
                dangerouslySetInnerHTML={{ __html: renderedValue }}
              />
              <pre className={s.renderedRaw}>{renderedValue}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
