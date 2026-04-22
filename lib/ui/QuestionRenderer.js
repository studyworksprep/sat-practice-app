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
              ...(selected && !isReviewed ? S.optionSelected : null),
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
            <span
              style={{
                ...S.optionBadge,
                ...(selected && !isReviewed ? S.optionBadgeSelected : null),
                ...(isCorrect ? S.optionBadgeCorrect : null),
                ...(isWrongSelection ? S.optionBadgeWrong : null),
              }}
              aria-hidden="true"
            >
              {opt.label ?? ''}
            </span>
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
import { colors, fonts, radius, shadow, space, type } from '@/lib/ui/tokens';

const S = {
  taxonomy: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: colors.fg3, margin: `0 0 ${space[3]}`,
  },
  // Single-column stimulus block (when two-column isn't active).
  stimulus: {
    padding: `${space[4]} ${space[5]}`,
    background: colors.slate[50],
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    ...type.prose,
    marginBottom: space[4],
  },
  // qaTwoCol pattern from the design kit: single card with a thin
  // divider between left (passage) and right (stem+options). The
  // right pane has a slate-50 bg so the two-column relationship
  // reads at a glance.
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
    gap: 0,
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.xl,
    boxShadow: shadow.sm,
    overflow: 'hidden',
  },
  twoColLeft: {
    padding: `${space[5]} ${space[6]}`,
    minWidth: 0,
    overflowWrap: 'anywhere',
    ...type.prose,
  },
  twoColDivider: { background: colors.border },
  twoColRight: {
    padding: `${space[5]} ${space[6]}`,
    background: colors.slate[50],
    display: 'flex', flexDirection: 'column', gap: space[4],
    minWidth: 0,
  },
  // Column-mode stimulus pane has no border of its own — the
  // surrounding qaTwoCol card provides the visual container.
  stimulusColumn: {
    ...type.prose,
    padding: 0,
  },
  stem: {
    fontSize: 16, lineHeight: 1.6, color: colors.fg1, fontWeight: 500,
  },
  optionsFieldset: {
    border: 'none', padding: 0, margin: 0,
    display: 'flex', flexDirection: 'column', gap: space[3],
  },
  srOnly: {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
  },
  // Answer option: white card with 1.5px border; hovered / selected
  // states light the border with the accent color and drop an
  // accent-soft fill inside. Selected state adds the accent ring.
  option: {
    display: 'flex', alignItems: 'flex-start', gap: space[4],
    padding: `${space[4]} ${space[4]}`,
    background: colors.card,
    border: `1.5px solid ${colors.borderStrong}`,
    borderRadius: radius.lg,
    cursor: 'pointer',
    transition: 'all 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  optionSelected: {
    borderColor: colors.accent,
    background: colors.accentSoft,
    boxShadow: shadow.ringAccent,
  },
  optionCorrect: {
    borderColor: colors.success,
    background: 'rgba(91,168,118,0.12)',
    boxShadow: `0 0 0 3px rgba(91,168,118,0.14)`,
  },
  optionWrong: {
    borderColor: colors.danger,
    background: 'rgba(217,119,117,0.12)',
    boxShadow: `0 0 0 3px rgba(217,119,117,0.14)`,
  },
  optionDisabled: { cursor: 'default' },
  // Visually-hidden radio; the label is the click target.
  radio: {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
  },
  // 28px round badge carrying the option letter. Fills with the
  // accent color when the option is selected.
  optionBadge: {
    flexShrink: 0,
    width: 28, height: 28, borderRadius: radius.pill,
    background: colors.card,
    border: `1.5px solid ${colors.borderStrong}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 13, color: colors.fg1,
  },
  optionBadgeSelected: {
    background: colors.accent, borderColor: colors.accent, color: '#fff',
  },
  optionBadgeCorrect: {
    background: colors.success, borderColor: colors.success, color: '#fff',
  },
  optionBadgeWrong: {
    background: colors.danger, borderColor: colors.danger, color: '#fff',
  },
  optionContent: {
    flex: 1, minWidth: 0,
    fontSize: 15, lineHeight: 1.55, color: colors.slate[700],
  },
  sprWrap: { display: 'flex', flexDirection: 'column', gap: space[2] },
  sprLabel: {
    ...type.sectionLabel,
  },
  sprInput: {
    padding: `${space[3]} ${space[4]}`,
    border: `1.5px solid ${colors.borderStrong}`,
    borderRadius: radius.md,
    fontSize: 16,
    maxWidth: 260,
    fontFamily: fonts.mono,
    transition: 'all 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  sprInputCorrect: {
    borderColor: colors.success,
    background: 'rgba(91,168,118,0.08)',
    boxShadow: `0 0 0 3px rgba(91,168,118,0.14)`,
  },
  sprInputWrong: {
    borderColor: colors.danger,
    background: 'rgba(217,119,117,0.08)',
    boxShadow: `0 0 0 3px rgba(217,119,117,0.14)`,
  },
  sprHint: { color: colors.fg3, fontSize: 12, margin: 0 },
  // Result banner (below the option list / SPR input in the right
  // column of two-col, or directly below in single-col).
  result: {
    marginTop: space[2],
    padding: space[4],
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    display: 'flex', flexDirection: 'column', gap: space[3],
  },
  resultBadge: {
    display: 'inline-block',
    padding: `${space[1]} ${space[3]}`,
    borderRadius: radius.pill,
    fontSize: 12, fontWeight: 700,
    letterSpacing: '0.04em', textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  correctAnswer: {
    margin: 0,
    padding: `${space[3]} ${space[4]}`,
    background: colors.highlightSoft,
    border: `1px solid ${colors.gold[200]}`,
    borderRadius: radius.md,
    fontSize: 14,
    color: colors.gold[800],
  },
  // Explanations pick up a left accent rail, mirroring the design
  // kit's .explanation pattern.
  rationale: {
    lineHeight: 1.65, fontSize: 14, color: colors.slate[700],
    borderLeft: `3px solid ${colors.accent}`,
    paddingLeft: space[4],
    marginTop: space[2],
  },
};
