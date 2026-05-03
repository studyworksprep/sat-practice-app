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

import { memo, useEffect, useRef } from 'react';
import s from './QuestionRenderer.module.css';

// Memoized HTML block. Renders the underlying span/section once and
// then short-circuits every re-render whose `html` prop is the same
// string — React never gets a chance to revisit the
// dangerouslySetInnerHTML in this subtree, so any MathJax-injected
// DOM stays put when an unrelated state change higher up (e.g. the
// student selecting a different MCQ option) re-renders the parent.
//
// Without this guard, switching radios collapses every typeset
// option back to its raw \(...\) source: React reconciles the option
// labels, the inner span ends up flagged as "needs update", innerHTML
// gets re-set to the original TeX string, and MathJax's CHTML output
// is gone.
const HtmlBlock = memo(function HtmlBlock({ as = 'span', className, html }) {
  const Tag = as;
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: html ?? '' }}
    />
  );
});

// Math typeset fallback. Pre-rendered question content arrives
// with SVG math baked in (the architecture goal) and needs no
// client work. Older / un-backfilled rows still hit our
// dangerouslySetInnerHTML with raw TeX delimiters or MathML —
// MathJax (loaded in app/layout.js) typesets those after mount.
//
// Polls briefly for the global because the script is tagged
// strategy="beforeInteractive" but Next sometimes still finalizes
// the load slightly after first paint. 12-second cap mirrors the
// legacy HtmlBlock implementation.
function useMathTypeset(ref, dependencyKey) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const el = ref.current;
    if (!el) return undefined;
    // Skip when the content has no math at all — saves a
    // typesetClear pass on every navigation.
    const html = el.innerHTML;
    const hasMath = /\\\(|\\\[|\$\$/.test(html) || el.querySelector('math');
    if (!hasMath) return undefined;

    let cancelled = false;
    let tries = 0;
    const tryTypeset = () => {
      if (cancelled) return;
      const mj = window.MathJax;
      if (mj?.typesetPromise) {
        try {
          mj.typesetClear?.([el]);
          mj.typesetPromise([el]).catch(() => {});
        } catch {}
        return;
      }
      tries += 1;
      if (tries < 240) setTimeout(tryTypeset, 50);
    };
    tryTypeset();
    return () => { cancelled = true; };
  }, [ref, dependencyKey]);
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
 * @param {object} [props.question.taxonomy]
 * @param {string|null} [props.selectedOptionId]
 * @param {(id: string) => void} [props.onSelectOption]
 * @param {string} [props.responseText]
 * @param {(text: string) => void} [props.onResponseText]
 * @param {object|null} [props.feedback] — { isCorrect } shown after
 *   each submit. Shows the correct/incorrect badge but does NOT
 *   reveal the correct answer or rationale, so a student can
 *   resubmit and get fresh feedback. Inputs stay enabled.
 * @param {object|null} [props.result] — full reveal payload
 *   ({ isCorrect, correctOptionId, correctAnswerDisplay,
 *   rationaleHtml }). Populated only when the caller wants the
 *   answer revealed (post-Reveal-click in practice; always in
 *   review mode). Inputs become disabled, correct option is
 *   highlighted, rationale is shown.
 * @param {'single'|'two-column'} [props.layout='single']
 * @param {React.ReactNode} [props.leftSlot]
 * @param {boolean} [props.leftSlotCollapsed]
 * @param {boolean} [props.slotAnimate] — when true, animate the
 *   left-slot open/collapse grid transition. Default false so the
 *   initial mount (which may restore a saved state from
 *   localStorage) doesn't run the animation. Callers flip it to
 *   true after the first user interaction.
 * @param {React.ReactNode} [props.controlsNode] — optional submit /
 *   error / next-question cluster. Placed inside the right pane
 *   below the response so those controls sit with the answer
 *   choices instead of below the two-pane card.
 * @param {React.ReactNode} [props.headerNode] — optional Bluebook-
 *   style question header (question number + Mark for Review).
 *   Rendered at the very top of the right pane (two-column + slot
 *   layouts) or at the top of the stack (single-column), above the
 *   stimulus and stem.
 */
export function QuestionRenderer({
  mode = 'practice',
  question,
  selectedOptionId = null,
  onSelectOption,
  responseText = '',
  onResponseText,
  feedback = null,
  result = null,
  layout = 'single',
  leftSlot = null,
  leftSlotCollapsed = false,
  slotAnimate = false,
  controlsNode = null,
  headerNode = null,
  /** Optional cross-out machinery for MCQ. The runner / test
   *  runner own a per-question Set of crossed option ids in
   *  state and toggle entries via onToggleCross. Hidden during
   *  review / teacher mode automatically. */
  crossedOptionIds = null,
  onToggleCross,
}) {
  const isSpr = question.questionType === 'spr';
  // "Revealed" — caller explicitly asked for the correct answer
  // to be shown. Drives input disabling + option highlighting.
  const isRevealed = result != null;
  // Either feedback or full reveal counts as "graded" for the
  // result banner badge.
  const banner = result ?? (feedback ? { isCorrect: feedback.isCorrect } : null);
  const hasBanner = banner != null;
  const inputsDisabled = mode !== 'practice' || isRevealed;

  // Math typeset target — the wrapping div uses display:contents
  // so it doesn't disturb layout but provides a DOM node for the
  // typeset effect to scope MathJax to. Keyed by questionId +
  // isRevealed so a reveal that pulls in fresh rationale HTML
  // re-typesets the rationale block.
  const typesetRef = useRef(null);
  useMathTypeset(typesetRef, `${question.questionId}-${isRevealed ? 'r' : 'q'}`);

  const taxonomyNode = mode === 'teacher' && question.taxonomy
    ? <TaxonomyStrip taxonomy={question.taxonomy} />
    : null;

  const stimulusNode = question.stimulusHtml ? (
    <HtmlBlock
      as="section"
      className={`${leftSlot || layout === 'two-column' ? s.stimulusColumn : s.stimulus} sw-prose`}
      html={question.stimulusHtml}
    />
  ) : null;

  const stemNode = (
    <HtmlBlock
      as="section"
      className={`${s.stem} sw-prose`}
      html={question.stemHtml}
    />
  );

  const responseNode = isSpr ? (
    <SprInput
      value={responseText}
      onChange={onResponseText}
      disabled={inputsDisabled}
      isReviewed={isRevealed}
      isCorrect={banner?.isCorrect ?? null}
    />
  ) : (
    <OptionsList
      questionId={question.questionId}
      options={question.options ?? []}
      selectedId={selectedOptionId}
      onSelect={onSelectOption}
      disabled={inputsDisabled}
      correctOptionId={result?.correctOptionId ?? null}
      isReviewed={isRevealed}
      crossedOptionIds={crossedOptionIds}
      onToggleCross={onToggleCross}
    />
  );

  const resultNode = hasBanner ? (
    <ResultBanner result={banner} reveal={result} isSpr={isSpr} />
  ) : null;

  // Path 1: caller provides a leftSlot (e.g. Desmos). Use the
  // collapsible two-column layout, with the left pane hosting the
  // slot and the stimulus (if any) moved into the right pane top.
  if (leftSlot != null) {
    const slotClasses = [
      s.twoCol,
      leftSlotCollapsed ? s.slotCollapsed : s.slotOpen,
      slotAnimate ? s.slotAnimated : null,
    ].filter(Boolean).join(' ');
    return (
      <div ref={typesetRef} className={s.typesetRoot}>
        {taxonomyNode}
        <div className={slotClasses}>
          <div className={leftSlotCollapsed ? s.slotPaneCollapsed : `${s.twoColLeft} ${s.slotPane}`}>
            {leftSlot}
          </div>
          <div className={s.twoColRight}>
            {headerNode}
            {stimulusNode}
            {stemNode}
            {responseNode}
            {resultNode}
            {controlsNode}
          </div>
        </div>
      </div>
    );
  }

  // Path 2: stimulus + two-column → reading-section layout.
  // Responsive collapse to single-column is handled by CSS
  // @media inside the module; no JS flip.
  if (layout === 'two-column' && stimulusNode) {
    return (
      <div ref={typesetRef} className={s.typesetRoot}>
        {taxonomyNode}
        <div className={s.twoCol}>
          <div className={s.twoColLeft}>{stimulusNode}</div>
          <div className={s.twoColRight}>
            {headerNode}
            {stemNode}
            {responseNode}
            {resultNode}
            {controlsNode}
          </div>
        </div>
      </div>
    );
  }

  // Path 3: single-column stack.
  return (
    <div ref={typesetRef} className={s.typesetRoot}>
      {taxonomyNode}
      {headerNode}
      {stimulusNode}
      {stemNode}
      {responseNode}
      {resultNode}
      {controlsNode}
    </div>
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

function OptionsList({
  questionId,
  options,
  selectedId,
  onSelect,
  disabled,
  correctOptionId,
  isReviewed,
  crossedOptionIds,
  onToggleCross,
}) {
  // Cross-out is only meaningful while the student is actively
  // answering — hidden during review/teacher mode and when the
  // caller hasn't wired up an onToggleCross handler.
  const showCrossOut = !!onToggleCross && !disabled && !isReviewed;
  return (
    <fieldset className={s.optionsFieldset}>
      <legend className={s.srOnly}>Answer choices</legend>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        const isCorrect = correctOptionId != null && opt.id === correctOptionId;
        const isWrongSelection =
          isReviewed && selected && !isCorrect && correctOptionId != null;
        const isCrossed =
          showCrossOut
          && (crossedOptionIds?.has?.(opt.id) ?? crossedOptionIds?.[opt.id] ?? false);
        const optionClass = [
          s.option,
          selected && !isReviewed ? s.optionSelected : null,
          isCorrect ? s.optionCorrect : null,
          isWrongSelection ? s.optionWrong : null,
          disabled ? s.optionDisabled : null,
          isCrossed ? s.optionCrossed : null,
        ].filter(Boolean).join(' ');
        const badgeClass = [
          s.optionBadge,
          selected && !isReviewed ? s.optionBadgeSelected : null,
          isCorrect ? s.optionBadgeCorrect : null,
          isWrongSelection ? s.optionBadgeWrong : null,
        ].filter(Boolean).join(' ');
        const label = opt.label ?? '';
        return (
          // Outer flex-row so the cross-out toggle can sit OUTSIDE
          // the option's <label> — clicks on a button nested inside
          // a label still activate the labeled radio (browser
          // activation behavior, not stoppable via stopPropagation),
          // so the toggle has to be a sibling.
          <div key={opt.id} className={s.optionRow}>
            <label className={optionClass}>
              <input
                type="radio"
                name={`q-${questionId}`}
                value={opt.id}
                checked={selected}
                onChange={() => !disabled && onSelect?.(opt.id)}
                disabled={disabled}
                className={s.radio}
              />
              <span className={badgeClass} aria-hidden="true">{label}</span>
              <HtmlBlock
                className={`${s.optionContent} sw-option-content`}
                html={opt.content_html}
              />
            </label>
            {showCrossOut && (
              <button
                type="button"
                onClick={() => onToggleCross(opt.id)}
                className={
                  isCrossed
                    ? `${s.crossOutBtn} ${s.crossOutBtnActive}`
                    : s.crossOutBtn
                }
                aria-label={isCrossed
                  ? `Undo cross out for option ${label}`
                  : `Cross out option ${label}`}
                title={isCrossed
                  ? 'Restore this option'
                  : 'Cross out this option'}
              >
                {isCrossed ? 'Undo' : label}
              </button>
            )}
          </div>
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

function ResultBanner({ result, reveal, isSpr }) {
  // result here is the always-shown grading badge ({isCorrect}).
  // reveal is the full payload, only set after explicit Reveal —
  // gates the SPR correct-answer line and the rationale block.
  const hasGraded = typeof result.isCorrect === 'boolean';
  const showSprCorrect =
    reveal != null
    && isSpr
    && reveal.correctAnswerDisplay
    && (!hasGraded || !result.isCorrect);
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
          The correct answer was: <strong>{reveal.correctAnswerDisplay}</strong>
        </p>
      )}
      {reveal?.rationaleHtml && (
        <HtmlBlock
          as="div"
          className={`${s.rationale} sw-prose`}
          html={reveal.rationaleHtml}
        />
      )}
    </section>
  );
}
