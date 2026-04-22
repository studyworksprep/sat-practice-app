// Question renderer. Draws one question in one of three modes:
//
//   'practice'  — options/SPR input are interactive; caller passes
//                 selectedOptionId + onSelectOption (or responseText +
//                 onResponseText for SPR) and owns the state. `result`
//                 is null until the caller passes it in after grading.
//
//   'review'    — read-only. Caller pre-populates `result` with the
//                 correct answer + rationale (and optionally
//                 selectedOptionId as the student's historical choice)
//                 so the reveal state shows immediately.
//
//   'teacher'   — review mode plus a taxonomy strip above the stem
//                 (domain / skill / difficulty / source). Meant for
//                 pages where teachers or admins inspect a single
//                 question in the bank.
//
// The renderer is UI only. It does not fetch, submit, or navigate —
// those responsibilities stay with the caller (e.g.
// PracticeInteractive for the session flow). Splitting along this
// line lets the same renderer serve practice, review, and
// bank-inspection pages without `isTeacherMode` branches.

'use client';

import { useEffect, useState } from 'react';

// Media-query hook. Returns true while the browser matches the
// given query. Used by the two-column layout to flip back to
// single-column on narrow viewports.
function useMatchMedia(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * @param {object} props
 * @param {'practice'|'review'|'teacher'} [props.mode='practice']
 * @param {object} props.question
 * @param {string} props.question.questionId
 * @param {'mcq'|'spr'} props.question.questionType
 * @param {string} [props.question.stimulusHtml]
 * @param {string} props.question.stemHtml
 * @param {Array<{id: string, label?: string, content_html: string}>} [props.question.options]
 * @param {object} [props.question.taxonomy] - { domain_name, skill_name, difficulty, source? }
 * @param {string|null} [props.selectedOptionId] - MCQ selection (controlled)
 * @param {(id: string) => void} [props.onSelectOption] - MCQ select handler
 * @param {string} [props.responseText] - SPR input value (controlled)
 * @param {(text: string) => void} [props.onResponseText] - SPR change handler
 * @param {object|null} [props.result] - reveal data; null = not yet graded
 * @param {boolean} props.result.isCorrect
 * @param {string|null} [props.result.correctOptionId]
 * @param {string|null} [props.result.correctAnswerDisplay]
 * @param {string|null} [props.result.rationaleHtml]
 * @param {'single'|'two-column'} [props.layout='single']
 *   single      — stimulus / stem / options / result stacked vertically.
 *   two-column  — passage (stimulus) on the left, stem + options on
 *                 the right. Collapses to single-column below 820px.
 *                 Use for reading-section questions. inferLayoutMode
 *                 in lib/ui/question-layout.js picks this for
 *                 CAS / EOI / INI / SEC domains.
 */
export function QuestionRenderer({
  mode = 'practice',
  question,
  selectedOptionId = null,
  onSelectOption,
  responseText = '',
  onResponseText,
  result = null,
  layout = 'single',
}) {
  const isSpr = question.questionType === 'spr';
  const isReviewed = result != null;
  // Practice mode: locked after grading. Review/teacher: always locked.
  const inputsDisabled = mode !== 'practice' || isReviewed;
  // Collapse two-column back to single below 820px. Inline styles
  // can't express @media, so the flip is driven from JS. On SSR
  // the hook starts false so the initial render is single-column;
  // a hydration tick flips it to true on wide screens. That
  // behavior is acceptable because the content is the same either
  // way — only the spatial arrangement changes.
  const isWide = useMatchMedia('(min-width: 820px)');
  const useTwoColumn = layout === 'two-column' && isWide;

  const taxonomyNode = mode === 'teacher' && question.taxonomy
    ? <TaxonomyStrip taxonomy={question.taxonomy} />
    : null;

  const stimulusNode = question.stimulusHtml
    ? (
      <section
        style={useTwoColumn ? S.stimulusColumn : S.stimulus}
        dangerouslySetInnerHTML={{ __html: question.stimulusHtml }}
      />
    )
    : null;

  const stemNode = (
    <section
      style={S.stem}
      dangerouslySetInnerHTML={{ __html: question.stemHtml }}
    />
  );

  const responseNode = isSpr ? (
    <SprInput
      value={responseText}
      onChange={onResponseText}
      disabled={inputsDisabled}
      isReviewed={isReviewed}
      isCorrect={result?.isCorrect ?? null}
    />
  ) : (
    <OptionsList
      questionId={question.questionId}
      options={question.options ?? []}
      selectedId={selectedOptionId}
      onSelect={onSelectOption}
      disabled={inputsDisabled}
      correctOptionId={result?.correctOptionId ?? null}
      isReviewed={isReviewed}
    />
  );

  const resultNode = isReviewed ? <ResultBanner result={result} isSpr={isSpr} /> : null;

  // Two-column layout is only beneficial when there's a stimulus
  // (passage) to put on the left. If the question has no stimulus
  // or the viewport is too narrow, fall back to single-column
  // regardless of the requested layout.
  if (useTwoColumn && stimulusNode) {
    return (
      <>
        {taxonomyNode}
        <div style={S.twoCol}>
          <div style={S.twoColLeft}>{stimulusNode}</div>
          <div style={S.twoColRight}>
            {stemNode}
            {responseNode}
            {resultNode}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {taxonomyNode}
      {stimulusNode}
      {stemNode}
      {responseNode}
      {resultNode}
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-components — kept in this file for colocation. Each is
// small enough that splitting would be more clutter than clarity.
// ──────────────────────────────────────────────────────────────

function TaxonomyStrip({ taxonomy }) {
  const parts = [
    taxonomy.domain_name,
    taxonomy.skill_name,
    taxonomy.difficulty ? `difficulty ${taxonomy.difficulty}` : null,
    taxonomy.source,
  ].filter(Boolean);
  return (
    <div style={S.taxonomy}>
      {parts.join(' · ')}
    </div>
  );
}

function OptionsList({ questionId, options, selectedId, onSelect, disabled, correctOptionId, isReviewed }) {
  return (
    <fieldset style={S.optionsFieldset}>
      <legend style={S.srOnly}>Answer choices</legend>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        const isCorrect = correctOptionId != null && opt.id === correctOptionId;
        const isWrongSelection =
          isReviewed && selected && !isCorrect && correctOptionId != null;
        return (
          <label
            key={opt.id}
            style={{
              ...S.option,
              ...(selected ? S.optionSelected : null),
              ...(isCorrect ? S.optionCorrect : null),
              ...(isWrongSelection ? S.optionWrong : null),
              ...(disabled ? S.optionDisabled : null),
            }}
          >
            <input
              type="radio"
              name={`q-${questionId}`}
              value={opt.id}
              checked={selected}
              onChange={() => !disabled && onSelect?.(opt.id)}
              disabled={disabled}
              style={S.radio}
            />
            <span style={S.optionLabel}>{opt.label ?? ''}</span>
            <span
              style={S.optionContent}
              dangerouslySetInnerHTML={{ __html: opt.content_html }}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

function SprInput({ value, onChange, disabled, isReviewed, isCorrect }) {
  return (
    <div style={S.sprWrap}>
      <label htmlFor="spr-input" style={S.sprLabel}>
        Your answer
      </label>
      <input
        id="spr-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => !disabled && onChange?.(e.target.value)}
        disabled={disabled}
        placeholder="Type your answer"
        style={{
          ...S.sprInput,
          ...(isReviewed && isCorrect === true ? S.sprInputCorrect : null),
          ...(isReviewed && isCorrect === false ? S.sprInputWrong : null),
        }}
      />
      <p style={S.sprHint}>
        Enter a number or fraction (e.g. <code>12.5</code> or{' '}
        <code>25/2</code>). Don&apos;t include units.
      </p>
    </div>
  );
}

function ResultBanner({ result, isSpr }) {
  // 'Correct' / 'Incorrect' pill only appears when there was an actual
  // graded attempt — practice mode after submit, or review mode with a
  // historical attempt. Teacher-mode inspection passes result without
  // isCorrect (nothing to grade), so the pill stays hidden and the
  // rationale + correct-answer reveal render bare.
  const hasGraded = typeof result.isCorrect === 'boolean';

  // SPR "The correct answer was" callout shows whenever the viewer
  // should see the canonical answer — always for teacher/review modes
  // (no grading, but the answer is useful context), only-when-wrong for
  // practice mode (a correct student doesn't need to be told).
  const showSprCorrect =
    isSpr && result.correctAnswerDisplay && (!hasGraded || !result.isCorrect);

  return (
    <section style={S.result}>
      {hasGraded && (
        <div
          style={{
            ...S.resultBadge,
            background: result.isCorrect ? '#dcfce7' : '#fee2e2',
            color: result.isCorrect ? '#166534' : '#991b1b',
          }}
        >
          {result.isCorrect ? 'Correct' : 'Incorrect'}
        </div>
      )}
      {showSprCorrect && (
        <p style={S.correctAnswer}>
          The correct answer was: <strong>{result.correctAnswerDisplay}</strong>
        </p>
      )}
      {result.rationaleHtml && (
        <div
          style={S.rationale}
          dangerouslySetInnerHTML={{ __html: result.rationaleHtml }}
        />
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────
// Styles — previously inside PracticeInteractive's S object;
// question-rendering ones moved here, session-chrome ones stayed
// in PracticeInteractive.
// ──────────────────────────────────────────────────────────────
const S = {
  taxonomy: {
    fontSize: '0.8rem',
    color: '#6b7280',
    padding: '0.375rem 0.5rem',
    background: '#f9fafb',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
  },
  stimulus: {
    padding: '1rem',
    background: '#f9fafb',
    borderRadius: 8,
    lineHeight: 1.6,
    fontSize: '1rem',
  },
  // Two-column layout container. Grid keeps the left column
  // passage and the right column stem+options sharing a single
  // vertical rhythm, with no max-height forcing — passages that
  // are longer than the viewport scroll the whole page rather
  // than a nested scroll region (better on mobile, and matches
  // how the Digital SAT lays out reading questions).
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '1.25rem',
    // Below 820px the grid re-declares as a single column via a
    // resize-aware wrapper on the client side; until that lands,
    // a CSS fallback via inline style isn't possible. Authors
    // viewing on narrow viewports will see a horizontal scroll
    // of the right column, which is acceptable for the transient
    // state. (@media inside inline styles isn't supported; a
    // later pass can extract this to a .module.css file.)
  },
  twoColLeft: {
    minWidth: 0,       // prevents overflow from long passage content
    overflowWrap: 'anywhere',
  },
  twoColRight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minWidth: 0,
  },
  // Stimulus variant used only inside the two-column layout. The
  // container already provides spacing; the pane style strips the
  // bottom margin the default stimulus block carries so it sits
  // tight against the column top.
  stimulusColumn: {
    padding: '1rem',
    background: '#f9fafb',
    borderRadius: 8,
    lineHeight: 1.6,
    fontSize: '1rem',
    height: '100%',
  },
  stem: { fontSize: '1.05rem', lineHeight: 1.6 },
  optionsFieldset: {
    border: 'none', padding: 0, margin: 0,
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  srOnly: {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
  },
  option: {
    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: '1px solid #e5e7eb', borderRadius: 8,
    cursor: 'pointer', background: 'white',
  },
  optionSelected: { borderColor: '#2563eb', background: '#eff6ff' },
  optionCorrect: { borderColor: '#16a34a', background: '#dcfce7' },
  optionWrong: { borderColor: '#dc2626', background: '#fee2e2' },
  optionDisabled: { cursor: 'default' },
  radio: { marginTop: '0.25rem' },
  optionLabel: { fontWeight: 600, color: '#374151', minWidth: '1.5rem' },
  optionContent: { flex: 1, lineHeight: 1.5 },
  sprWrap: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  sprLabel: { fontWeight: 600, color: '#374151', fontSize: '0.95rem' },
  sprInput: {
    padding: '0.625rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: '1rem',
    maxWidth: 240,
    fontFamily: 'monospace',
  },
  sprInputCorrect: { borderColor: '#16a34a', background: '#dcfce7' },
  sprInputWrong: { borderColor: '#dc2626', background: '#fee2e2' },
  sprHint: { color: '#6b7280', fontSize: '0.85rem', margin: 0 },
  result: {
    marginTop: '0.5rem',
    padding: '1rem',
    background: '#f9fafb',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  resultBadge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 700,
    alignSelf: 'flex-start',
  },
  correctAnswer: {
    margin: 0,
    padding: '0.625rem 0.875rem',
    background: '#fef3c7',
    border: '1px solid #fde68a',
    borderRadius: 6,
    fontSize: '0.95rem',
    color: '#92400e',
  },
  rationale: { lineHeight: 1.6, fontSize: '0.95rem', color: '#374151' },
};
