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
//
// Layout. The `layout` prop ('single' | 'two-column') decides the
// spatial shape; the `leftSlot` prop (optional) lets callers inject
// a custom left pane (e.g. a DesmosPanel for math). Narrow
// viewports collapse back to single-column via pure CSS @media
// queries — no JS resize observers needed now that we're on CSS
// Modules.

'use client';

import s from './QuestionRenderer.module.css';

/**
 * @param {object} props
 * @param {'practice'|'review'|'teacher'} [props.mode='practice']
 * @param {object} props.question
 * @param {string} props.question.questionId
 * @param {'mcq'|'spr'} props.question.questionType
 * @param {string} [props.question.stimulusHtml]
 * @param {string} props.question.stemHtml
 * @param {Array<{id: string, label?: string, content_html: string}>} [props.question.options]
 * @param {object} [props.question.taxonomy]
 * @param {string|null} [props.selectedOptionId]
 * @param {(id: string) => void} [props.onSelectOption]
 * @param {string} [props.responseText]
 * @param {(text: string) => void} [props.onResponseText]
 * @param {object|null} [props.result]
 * @param {'single'|'two-column'} [props.layout='single']
 * @param {React.ReactNode} [props.leftSlot]
 * @param {boolean} [props.leftSlotCollapsed]
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
  leftSlot = null,
  leftSlotCollapsed = false,
}) {
  const isSpr = question.questionType === 'spr';
  const isReviewed = result != null;
  const inputsDisabled = mode !== 'practice' || isReviewed;

  const taxonomyNode = mode === 'teacher' && question.taxonomy
    ? <TaxonomyStrip taxonomy={question.taxonomy} />
    : null;

  const stimulusNode = question.stimulusHtml ? (
    <section
      className={`${leftSlot || layout === 'two-column' ? s.stimulusColumn : s.stimulus} sw-prose`}
      dangerouslySetInnerHTML={{ __html: question.stimulusHtml }}
    />
  ) : null;

  const stemNode = (
    <section
      className={`${s.stem} sw-prose`}
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

  // Path 1: caller provides a leftSlot (e.g. Desmos). Use the
  // collapsible two-column layout, with the left pane hosting the
  // slot and the stimulus (if any) moved into the right pane top.
  if (leftSlot != null) {
    return (
      <>
        {taxonomyNode}
        <div className={`${s.twoCol} ${leftSlotCollapsed ? s.slotCollapsed : s.slotOpen}`}>
          <div className={leftSlotCollapsed ? s.slotPaneCollapsed : `${s.twoColLeft} ${s.slotPane}`}>
            {leftSlot}
          </div>
          <div className={s.twoColRight}>
            {stimulusNode}
            {stemNode}
            {responseNode}
            {resultNode}
          </div>
        </div>
      </>
    );
  }

  // Path 2: stimulus + two-column → reading-section layout.
  // Responsive collapse to single-column is handled by CSS
  // @media inside the module; no JS flip.
  if (layout === 'two-column' && stimulusNode) {
    return (
      <>
        {taxonomyNode}
        <div className={s.twoCol}>
          <div className={s.twoColLeft}>{stimulusNode}</div>
          <div className={s.twoColRight}>
            {stemNode}
            {responseNode}
            {resultNode}
          </div>
        </div>
      </>
    );
  }

  // Path 3: single-column stack.
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
// Sub-components.
// ──────────────────────────────────────────────────────────────

function TaxonomyStrip({ taxonomy }) {
  const parts = [
    taxonomy.domain_name,
    taxonomy.skill_name,
    taxonomy.difficulty ? `difficulty ${taxonomy.difficulty}` : null,
    taxonomy.source,
  ].filter(Boolean);
  return <div className={s.taxonomy}>{parts.join(' · ')}</div>;
}

function OptionsList({ questionId, options, selectedId, onSelect, disabled, correctOptionId, isReviewed }) {
  return (
    <fieldset className={s.optionsFieldset}>
      <legend className={s.srOnly}>Answer choices</legend>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        const isCorrect = correctOptionId != null && opt.id === correctOptionId;
        const isWrongSelection =
          isReviewed && selected && !isCorrect && correctOptionId != null;
        const optionClass = [
          s.option,
          selected && !isReviewed ? s.optionSelected : null,
          isCorrect ? s.optionCorrect : null,
          isWrongSelection ? s.optionWrong : null,
          disabled ? s.optionDisabled : null,
        ].filter(Boolean).join(' ');
        const badgeClass = [
          s.optionBadge,
          selected && !isReviewed ? s.optionBadgeSelected : null,
          isCorrect ? s.optionBadgeCorrect : null,
          isWrongSelection ? s.optionBadgeWrong : null,
        ].filter(Boolean).join(' ');
        return (
          <label key={opt.id} className={optionClass}>
            <input
              type="radio"
              name={`q-${questionId}`}
              value={opt.id}
              checked={selected}
              onChange={() => !disabled && onSelect?.(opt.id)}
              disabled={disabled}
              className={s.radio}
            />
            <span className={badgeClass} aria-hidden="true">{opt.label ?? ''}</span>
            <span
              className={`${s.optionContent} sw-option-content`}
              dangerouslySetInnerHTML={{ __html: opt.content_html }}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

function SprInput({ value, onChange, disabled, isReviewed, isCorrect }) {
  const inputClass = [
    s.sprInput,
    isReviewed && isCorrect === true  ? s.sprInputCorrect : null,
    isReviewed && isCorrect === false ? s.sprInputWrong   : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={s.sprWrap}>
      <label htmlFor="spr-input" className={s.sprLabel}>Your answer</label>
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
        className={inputClass}
      />
      <p className={s.sprHint}>
        Enter a number or fraction (e.g. <code>12.5</code> or{' '}
        <code>25/2</code>). Don&apos;t include units.
      </p>
    </div>
  );
}

function ResultBanner({ result, isSpr }) {
  const hasGraded = typeof result.isCorrect === 'boolean';
  const showSprCorrect =
    isSpr && result.correctAnswerDisplay && (!hasGraded || !result.isCorrect);
  const badgeClass = `${s.resultBadge} ${result.isCorrect ? s.resultBadgeCorrect : s.resultBadgeWrong}`;
  return (
    <section className={s.result}>
      {hasGraded && (
        <div className={badgeClass}>
          {result.isCorrect ? 'Correct' : 'Incorrect'}
        </div>
      )}
      {showSprCorrect && (
        <p className={s.correctAnswer}>
          The correct answer was: <strong>{result.correctAnswerDisplay}</strong>
        </p>
      )}
      {result.rationaleHtml && (
        <div
          className={`${s.rationale} sw-prose`}
          dangerouslySetInnerHTML={{ __html: result.rationaleHtml }}
        />
      )}
    </section>
  );
}
