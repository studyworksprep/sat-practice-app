// ACT-side practice-launcher client island. Sibling to
// StartInteractive (SAT). See docs/architecture-plan.md §3.4 —
// practice launcher uses a ?test=sat|act slice; the runner itself
// is unified (PR 5). This component focuses on the ACT-specific
// filter UI: 4 ACT sections (English / Math / Reading / Science),
// optional category drilldown within each, plus the shared
// difficulty / size / order controls.
//
// What's intentionally not here in v1:
//   - Question search (SAT has a typeahead over questions_v2). The
//     ACT search UX can land in a follow-up when content grows.
//   - Subcategory drilldown. Stays at section + category for now.
//   - Practice-test launcher (deferred to the ACT practice-tests PR).
//
// Reuses StartInteractive.module.css for visual parity with the SAT
// launcher. No new CSS surface in this PR.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { IconTile } from '@/lib/ui/IconTile';
import { QuestionBankIcon } from '@/lib/ui/icons';
import s from './StartInteractiveAct.module.css';

const MIN_SIZE = 1;
const MAX_SIZE = 50;
const DEFAULT_SIZE = 10;

// ACT difficulty is a 1–5 scale, not SAT's 1–3. The chips reuse
// the SAT difficulty palette (easy / medium / hard) but spread
// across all five levels: 1 = easiest, 5 = hardest.
const DIFFICULTY_OPTIONS = [
  { value: 1, label: '1 · Easiest', chipClass: 'chipDiffEasy' },
  { value: 2, label: '2',           chipClass: 'chipDiffEasy' },
  { value: 3, label: '3',           chipClass: 'chipDiffMed'  },
  { value: 4, label: '4',           chipClass: 'chipDiffHard' },
  { value: 5, label: '5 · Hardest', chipClass: 'chipDiffHard' },
];

const ORDER_OPTIONS = [
  { value: 'display_code', label: 'Test-form order' },
  { value: 'easy_first',   label: 'Easy → Hard' },
  { value: 'hard_first',   label: 'Hard → Easy' },
  { value: 'random',       label: 'Random' },
];

/**
 * @param {object} props
 * @param {Array<{ section: string, name: string, count: number,
 *   categories: Array<{ name: string, count: number,
 *     subcategories: Array<{ name: string, count: number }> }> }>}
 *   props.sections - one entry per ACT section that has data, sorted
 *   in the canonical English → Math → Reading → Science order.
 *   subcategories[] is empty when none are labeled (Reading, Science,
 *   and Math's "Integrating Essential Skills" category).
 * @param {{ sessionId: string, position: number, total: number,
 *   lastActivityAt: string }|null} [props.resumeInfo] - active ACT
 *   session for the Resume card.
 * @param {Function} props.createSessionAction
 * @param {Function} props.countAvailableAction
 * @param {string} [props.basePath='/practice']
 */
export function StartInteractiveAct({
  sections,
  resumeInfo,
  createSessionAction,
  countAvailableAction,
  basePath = '/practice',
}) {
  // ── Form state ─────────────────────────────────────────────
  // Section selection is independent of category selection — picking
  // a section without drilling into categories means "any category in
  // this section." Picking categories without picking the section is
  // implicitly section-scoped because the category names are unique
  // per section in current ACT data; we still send the section code
  // when present for an explicit filter.
  //
  // selectedSections holds ACT section *codes* ('english' | 'math'
  // | 'reading' | 'science'), not display names — those are the
  // strings act_questions.section stores and that the server-side
  // resolver compares against.
  // Sections render as static labels above their category lists
  // (mirrors the SAT launcher's Math / R&W group labels above
  // their domains). The student selects through categories +
  // subcategories rather than toggling sections directly.
  //
  // selectedCategories: free-text category names, sent verbatim
  //   to the server as `category=...`. Mutually exclusive with
  //   per-subcategory picks inside the same category — picking
  //   a category clears its subcategories, picking a subcategory
  //   clears the category bit.
  // selectedSubcategories: free-text subcategory names, sent as
  //   `subcategory=...`. Only populated when the student wants
  //   to narrow inside a category that has subcategories
  //   (Math PHM, the three English categories).
  const [selectedCategories,    setSelectedCategories]    = useState(() => new Set());
  const [selectedSubcategories, setSelectedSubcategories] = useState(() => new Set());
  const [selectedDifficulties,  setSelectedDifficulties]  = useState(() => new Set());
  const [unansweredOnly,        setUnansweredOnly]        = useState(false);
  const [order,                 setOrder]                 = useState('display_code');
  const [sizeText,              setSizeText]              = useState(String(DEFAULT_SIZE));
  const size = useMemo(() => resolveSize(sizeText), [sizeText]);

  // ── Live count ─────────────────────────────────────────────
  const [count, setCount] = useState(null);
  const [countErr, setCountErr] = useState(null);
  const [, startCount] = useTransition();
  const countTimer = useRef(null);

  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(() => {
      startCount(async () => {
        const fd = buildFormData({
          categories: selectedCategories,
          subcategories: selectedSubcategories,
          difficulties: selectedDifficulties,
          unansweredOnly,
          order,
          size,
        });
        const res = await countAvailableAction(null, fd);
        if (res && res.ok) {
          setCount(res.count);
          setCountErr(null);
        } else {
          setCountErr(res?.error ?? 'Count failed');
        }
      });
    }, 400);
    return () => clearTimeout(countTimer.current);
    // order/size don't affect candidate count — excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCategories, selectedSubcategories,
    selectedDifficulties, unansweredOnly, countAvailableAction,
  ]);

  // ── Submit ─────────────────────────────────────────────────
  const [submitState, setSubmitState] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitState(null);
    const fd = buildFormData({
      categories: selectedCategories,
      subcategories: selectedSubcategories,
      difficulties: selectedDifficulties,
      unansweredOnly,
      order,
      size,
    });
    try {
      const res = await createSessionAction(null, fd);
      if (res && !res.ok) setSubmitState(res);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      setSubmitState({ ok: false, error: err.message ?? String(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  const actualSize = count == null ? size : Math.min(count, size);
  const canSubmit = !isSubmitting && count !== 0;

  // Category + subcategory state.
  //
  // For categories WITHOUT subcategories (Math IES, Reading,
  // Science): the category is its own leaf, tracked in
  // selectedCategories. Sent to the server as `category=...`.
  //
  // For categories WITH subcategories (Math PHM, the three
  // English categories): clicking the category checkbox is
  // sugar for "select all of this category's subcategories",
  // so selectedSubcategories is the single source of truth.
  // The category checkbox visual state is derived: on when
  // every sub is selected, partial when some-but-not-all,
  // off when none. selectedCategories never holds parent
  // category names with subs — keeps the submitted form tidy
  // and makes the sub checkboxes inside the dropdown flip
  // on/off in sync with the parent click.
  function toggleCategory(category) {
    const subs = category.subcategories ?? [];
    if (subs.length === 0) {
      // Leaf category: toggle in selectedCategories.
      const isOn = selectedCategories.has(category.name);
      setSelectedCategories((prev) => {
        const next = new Set(prev);
        if (isOn) next.delete(category.name);
        else next.add(category.name);
        return next;
      });
      return;
    }
    // Parent category with subs: select-all / clear-all
    // semantics. Partial state acts as "complete the
    // selection" (standard tristate UX) — flip to all-on.
    const allOn = subs.every((sub) => selectedSubcategories.has(sub.name));
    setSelectedSubcategories((prev) => {
      const next = new Set(prev);
      if (allOn) {
        for (const sub of subs) next.delete(sub.name);
      } else {
        for (const sub of subs) next.add(sub.name);
      }
      return next;
    });
  }

  function toggleSubcategory(subName) {
    setSelectedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(subName)) next.delete(subName);
      else next.add(subName);
      return next;
    });
  }

  function toggleDifficulty(value) {
    setSelectedDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <main className={s.main}>
      {resumeInfo && (
        <section className={s.resumeBanner}>
          <div className={s.resumeText}>
            <strong>Resume your ACT session</strong>
            <span className={s.resumeMeta}>
              Question {resumeInfo.position + 1} of {resumeInfo.total}
            </span>
          </div>
          <a
            href={`${basePath}/s/${resumeInfo.sessionId}/${resumeInfo.position}`}
            className={s.resumeBtn}
          >
            Resume →
          </a>
        </section>
      )}

      {/* Filter card. Plain styled div rather than the Card
          primitive because Card defaults to tone='soft' which
          paints a slate-50 background — we want the launcher
          card to read as a clean white surface against the
          page background. */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardHeaderLeft}>
            <IconTile icon={QuestionBankIcon} palette="cyan" size="md" />
            <div>
              <div className={s.cardTitle}>ACT practice</div>
              <div className={s.cardSub}>
                Build a session from the four ACT sections. Pick a section
                or two and we'll pull questions from your selection.
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className={s.form}>
          {/* Sections render as group labels above their category
              lists — mirrors the SAT launcher's Math / R&W headers.
              Categories are visible by default with real checkboxes;
              when a category has subcategories (Math PHM, the three
              English categories) a small dropdown reveals
              per-subcategory checkboxes for narrowing. */}
          <div className={s.sectionsGrid}>
            {sections.map((sec) => (
              <SectionBlock
                key={sec.section}
                section={sec}
                selectedCategories={selectedCategories}
                selectedSubcategories={selectedSubcategories}
                onToggleCategory={toggleCategory}
                onToggleSubcategory={toggleSubcategory}
              />
            ))}
          </div>

          {/* Difficulty + unanswered-only chip row. */}
          <div className={s.chipRow}>
            {DIFFICULTY_OPTIONS.map((opt) => {
              const on = selectedDifficulties.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`${s.chip} ${s[opt.chipClass]} ${on ? s.chipOn : ''}`}
                  onClick={() => toggleDifficulty(opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`${s.chip} ${unansweredOnly ? s.chipOn : ''}`}
              onClick={() => setUnansweredOnly((v) => !v)}
            >
              Unattempted only
            </button>
          </div>

          {/* Size / order / submit row. */}
          <div className={s.controlsRow}>
            <label className={s.controlLabel}>
              <span>Size</span>
              <input
                type="number"
                min={MIN_SIZE}
                max={MAX_SIZE}
                step={1}
                value={sizeText}
                onChange={(e) => setSizeText(e.target.value)}
                onBlur={() => setSizeText(String(size))}
                className={s.sizeInput}
              />
            </label>
            <label className={s.controlLabel}>
              <span>Order</span>
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className={s.orderSelect}
              >
                {ORDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <div className={s.matchLine}>
              {countErr
                ? <span className={s.matchErr}>{countErr}</span>
                : count == null
                  ? <span>Counting…</span>
                  : <span><strong>{count}</strong> question{count === 1 ? '' : 's'} match</span>}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className={s.startBtn}
            >
              {isSubmitting ? 'Starting…' : `Start · ${actualSize}`}
            </button>
          </div>

          {submitState && !submitState.ok && (
            <div role="alert" className={s.formError}>
              {submitState.error}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

// One ACT section block: header label + category rows. Each
// category row carries a checkbox; categories with named
// subcategories also get a "Subcategories ▾" dropdown that
// opens a panel of per-subcategory checkboxes.
function SectionBlock({
  section,
  selectedCategories,
  selectedSubcategories,
  onToggleCategory,
  onToggleSubcategory,
}) {
  return (
    <div className={s.sectionBlock}>
      <div className={s.sectionHeader}>
        <span className={s.sectionHeaderName}>{section.name}</span>
        <span className={s.sectionHeaderCount}>{section.count}</span>
      </div>
      <ul className={s.categoryList}>
        {section.categories.map((cat) => {
          const hasSubs = (cat.subcategories ?? []).length > 0;
          const selectedSubs = hasSubs
            ? cat.subcategories.filter((sub) => selectedSubcategories.has(sub.name))
            : [];
          // For categories with subs, the checkbox state is
          // derived from the sub picks: on iff all subs are
          // selected, partial iff some-but-not-all. For leaf
          // categories (no subs) we still consult
          // selectedCategories directly.
          const categoryOn = hasSubs
            ? selectedSubs.length === cat.subcategories.length
            : selectedCategories.has(cat.name);
          const partial = hasSubs
            ? selectedSubs.length > 0 && selectedSubs.length < cat.subcategories.length
            : false;
          return (
            <li key={cat.name} className={s.categoryItem}>
              <label className={`${s.categoryRow} ${categoryOn ? s.categoryRowOn : ''} ${partial ? s.categoryRowPartial : ''}`}>
                <input
                  type="checkbox"
                  className={s.checkbox}
                  checked={categoryOn}
                  ref={(el) => {
                    if (el) el.indeterminate = partial;
                  }}
                  onChange={() => onToggleCategory(cat)}
                />
                <span className={s.categoryName}>{cat.name}</span>
                <span className={s.categoryCount}>{cat.count}</span>
              </label>
              {hasSubs && (
                <details className={s.subcategoryDropdown}>
                  <summary className={s.subcategorySummary}>
                    <span>Subcategories</span>
                    {selectedSubs.length > 0 && (
                      <span className={s.subcategoryBadge}>{selectedSubs.length}</span>
                    )}
                  </summary>
                  <ul className={s.subcategoryList}>
                    {cat.subcategories.map((sub) => {
                      const subOn = selectedSubcategories.has(sub.name);
                      return (
                        <li key={sub.name}>
                          <label className={`${s.subcategoryRow} ${subOn ? s.subcategoryRowOn : ''}`}>
                            <input
                              type="checkbox"
                              className={s.checkbox}
                              checked={subOn}
                              onChange={() => onToggleSubcategory(sub.name)}
                            />
                            <span className={s.subcategoryName}>{sub.name}</span>
                            <span className={s.subcategoryCount}>{sub.count}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function resolveSize(text) {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

function buildFormData({ categories, subcategories, difficulties, unansweredOnly, order, size }) {
  const fd = new FormData();
  for (const cat of categories) fd.append('category', cat);
  for (const sub of subcategories ?? []) fd.append('subcategory', sub);
  for (const d of difficulties) fd.append('difficulty', String(d));
  if (unansweredOnly) fd.set('unanswered_only', '1');
  fd.set('order', order);
  fd.set('size', String(size));
  return fd;
}

// next/navigation throws a redirect "error" by design when a Server
// Action calls redirect(). Detecting + re-throwing keeps the redirect
// behavior; catching it as a normal error would surface it as a form
// failure to the user.
function isRedirectError(err) {
  return (
    err
    && typeof err === 'object'
    && (err.digest === 'NEXT_REDIRECT' || (err.message?.includes?.('NEXT_REDIRECT')))
  );
}
