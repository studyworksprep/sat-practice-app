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
import { Card } from '@/lib/ui/Card';
import { IconTile } from '@/lib/ui/IconTile';
import { QuestionBankIcon } from '@/lib/ui/icons';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
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
 *   categories: Array<{ name: string, count: number }> }>}
 *   props.sections - one entry per ACT section that has data, sorted
 *   in the canonical English → Math → Reading → Science order.
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
  // per section in current ACT data; we still send the section name
  // when present for an explicit filter.
  const [selectedSections,      setSelectedSections]      = useState(() => new Set());
  const [selectedCategories,    setSelectedCategories]    = useState(() => new Set());
  const [expandedSections,      setExpandedSections]      = useState(() => new Set());
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
          sections: selectedSections,
          categories: selectedCategories,
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
    selectedSections, selectedCategories, selectedDifficulties,
    unansweredOnly, countAvailableAction,
  ]);

  // ── Submit ─────────────────────────────────────────────────
  const [submitState, setSubmitState] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitState(null);
    const fd = buildFormData({
      sections: selectedSections,
      categories: selectedCategories,
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

  // Section row helpers. Same affordance as the SAT side: clicking the
  // section row toggles the whole section. Expanding the section row
  // reveals its categories for fine-tuning. When a section has any
  // category selected, the section row reads as "selected" even
  // without the bulk toggle on.
  function toggleSection(sectionName) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionName)) next.delete(sectionName);
      else next.add(sectionName);
      return next;
    });
    // Bulk-toggle: clear any per-category narrowing inside this
    // section when the section toggles off, so the form stays
    // self-consistent.
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const sec = sections.find((x) => x.name === sectionName);
      if (sec) for (const c of sec.categories) next.delete(c.name);
      return next;
    });
  }

  function toggleCategory(categoryName) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) next.delete(categoryName);
      else next.add(categoryName);
      return next;
    });
  }

  function toggleExpandSection(sectionName) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionName)) next.delete(sectionName);
      else next.add(sectionName);
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

      <Card>
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
          {/* Section grid — 4 sections rendered as rows. Hides sections
              with no data so the form doesn't show empty buckets for
              Reading / Science until those land. */}
          <div className={s.domainsGrid}>
            {sections.map((sec) => {
              const isSelected =
                selectedSections.has(sec.name)
                || sec.categories.some((c) => selectedCategories.has(c.name));
              const isExpanded = expandedSections.has(sec.name);
              return (
                <div key={sec.name} className={s.domainBlock}>
                  <button
                    type="button"
                    className={`${s.domainRow} ${isSelected ? s.domainRowOn : ''}`}
                    onClick={() => toggleSection(sec.name)}
                  >
                    <span className={s.domainName}>{sec.name}</span>
                    <span className={s.domainCount}>{sec.count}</span>
                  </button>
                  {sec.categories.length > 0 && (
                    <button
                      type="button"
                      className={s.skillsToggle}
                      onClick={() => toggleExpandSection(sec.name)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Hide categories ▴' : `Categories (${sec.categories.length}) ▾`}
                    </button>
                  )}
                  {isExpanded && sec.categories.length > 0 && (
                    <ul className={s.skillList}>
                      {sec.categories.map((cat) => {
                        const on = selectedCategories.has(cat.name);
                        return (
                          <li key={cat.name}>
                            <button
                              type="button"
                              className={`${s.skillRow} ${on ? s.skillRowOn : ''}`}
                              onClick={() => toggleCategory(cat.name)}
                            >
                              <span>{cat.name}</span>
                              <span className={s.skillCount}>{cat.count}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
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
      </Card>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function resolveSize(text) {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

function buildFormData({ sections, categories, difficulties, unansweredOnly, order, size }) {
  const fd = new FormData();
  for (const sec of sections) fd.append('section', sec);
  for (const cat of categories) fd.append('category', cat);
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
