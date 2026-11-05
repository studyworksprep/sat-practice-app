// ACT practice builder — client island for /practice/start?test=act.
// Sibling to StartInteractive (SAT) and laid out the same way, on the
// same stylesheet, so switching the sidebar's SAT/ACT toggle changes
// the content but not the page:
//
//   - PageHeader: "Build a practice set", Help, History.
//   - A slim resume bar for an open ACT session.
//   - Two columns: the filter card on the left (the four ACT sections
//     as column groups, each category a row, difficulty 1–5, "only
//     questions I haven't tried") and the sticky "Your set" summary on
//     the right with the live match count, size stepper, order and
//     Start. They stack on narrow screens.
//
// Category rows mirror the SAT domain rows: clicking a row toggles the
// whole category; the Subcategories toggle (only on categories that
// have named subcategories — Math PHM and the three English categories)
// opens the list for narrowing. For a category with subcategories,
// selectedSubcategories is the single source of truth (the row is "on"
// when every subcategory is picked), so the payload sends either the
// category (leaf categories) or its subcategories, never both.
//
// The count comes from the countAvailableAct Server Action, debounced
// 400ms after the last filter change. No suggestions row and no
// question search yet — the ACT bank is small and the SAT suggestion
// engine reads SAT mastery.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { HelpButton } from '@/app/(student)/help/HelpButton';
import { PageHeader } from '@/lib/ui/PageHeader';
import s from './StartInteractive.module.css';

const MIN_SIZE = 1;
const MAX_SIZE = 50;
const DEFAULT_SIZE = 10;

// ACT difficulty is a 1–5 scale, not SAT's 1–3. The chips reuse the
// SAT easy / medium / hard palette spread across the five levels.
const DIFFICULTY_OPTIONS = [
  { value: 1, label: '1 · Easiest', short: '1', chipClass: 'chipDiffEasy' },
  { value: 2, label: '2',           short: '2', chipClass: 'chipDiffEasy' },
  { value: 3, label: '3',           short: '3', chipClass: 'chipDiffMed'  },
  { value: 4, label: '4',           short: '4', chipClass: 'chipDiffHard' },
  { value: 5, label: '5 · Hardest', short: '5', chipClass: 'chipDiffHard' },
] as const;

type ActOrder = 'display_code' | 'easy_first' | 'hard_first' | 'random';

const ORDER_OPTIONS: ReadonlyArray<{ value: ActOrder; label: string }> = [
  { value: 'display_code', label: 'Test-form order' },
  { value: 'easy_first',   label: 'Easy → Hard' },
  { value: 'hard_first',   label: 'Hard → Easy' },
  { value: 'random',       label: 'Random' },
];

interface Subcategory { name: string; count: number }
interface Category { name: string; count: number; subcategories?: Subcategory[] }
interface Section { section: string; name: string; count: number; categories: Category[] }

type ActionResult = { ok: boolean; error?: string; count?: number } | null | undefined;
type FormAction = (prev: unknown, fd: FormData) => Promise<ActionResult>;

export interface StartInteractiveActProps {
  /** One entry per ACT section with data, English → Math → Reading → Science. */
  sections: Section[];
  resumeInfo: { sessionId: string; position: number; total: number } | null;
  createSessionAction: FormAction;
  countAvailableAction: FormAction;
  basePath?: string;
  historyHref?: string;
  eyebrow?: ReactNode;
}

type RowState = 'on' | 'partial' | 'off';

export function StartInteractiveAct({
  sections,
  resumeInfo,
  createSessionAction,
  countAvailableAction,
  basePath = '/practice',
  historyHref = '/practice/history?test=act',
  eyebrow = 'Practice · ACT',
}: StartInteractiveActProps) {
  // ── Form state ─────────────────────────────────────────────
  const [selectedCategories,    setSelectedCategories]    = useState<Set<string>>(() => new Set());
  const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(() => new Set());
  const [expanded,              setExpanded]              = useState<Set<string>>(() => new Set());
  const [selectedDifficulties,  setSelectedDifficulties]  = useState<Set<number>>(() => new Set());
  const [unansweredOnly,        setUnansweredOnly]        = useState(false);
  const [order,                 setOrder]                 = useState<ActOrder>('display_code');
  const [sizeText,              setSizeText]              = useState(String(DEFAULT_SIZE));
  const size = useMemo(() => resolveSize(sizeText), [sizeText]);

  // ── Live count ─────────────────────────────────────────────
  const [count, setCount] = useState<number | null>(null);
  const [countErr, setCountErr] = useState<string | null>(null);
  const [isCounting, startCount] = useTransition();
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          setCount(res.count ?? 0);
          setCountErr(null);
        } else {
          setCountErr(res?.error ?? 'Count failed');
        }
      });
    }, 400);
    return () => {
      if (countTimer.current) clearTimeout(countTimer.current);
    };
    // order and size don't affect the candidate count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCategories, selectedSubcategories,
    selectedDifficulties, unansweredOnly, countAvailableAction,
  ]);

  // ── Submit ─────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
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
      if (res && !res.ok) setSubmitError(res.error ?? 'Could not start the session');
    } catch (err) {
      if (isRedirectError(err)) throw err;
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  const actualSize = count == null ? size : Math.min(count, size);
  const canSubmit = !isSubmitting && count !== 0;

  // ── Category helpers ───────────────────────────────────────
  function rowState(cat: Category): RowState {
    const subs = cat.subcategories ?? [];
    if (subs.length === 0) return selectedCategories.has(cat.name) ? 'on' : 'off';
    let hits = 0;
    for (const sub of subs) if (selectedSubcategories.has(sub.name)) hits += 1;
    if (hits === 0) return 'off';
    return hits === subs.length ? 'on' : 'partial';
  }

  function toggleCategory(cat: Category) {
    const subs = cat.subcategories ?? [];
    if (subs.length === 0) {
      setSelectedCategories((prev) => toggled(prev, cat.name));
      return;
    }
    // Partial completes the selection (standard tristate behavior).
    const allOn = rowState(cat) === 'on';
    setSelectedSubcategories((prev) => {
      const next = new Set(prev);
      for (const sub of subs) {
        if (allOn) next.delete(sub.name);
        else next.add(sub.name);
      }
      return next;
    });
  }

  const topicsSummary = summarizeTopics(sections, rowState, selectedSubcategories);

  return (
    <main className={s.container}>
      <PageHeader
        eyebrow={eyebrow}
        title="Build a practice set"
        description="Filter the ACT question bank by section and topic, then start. The summary updates as you choose."
        actions={
          <>
            <HelpButton slug="practice" />
            <a href={historyHref} className={s.headerBtn}>History</a>
          </>
        }
      />

      {resumeInfo && (
        <section className={s.resumeBar} aria-label="Open session">
          <span className={s.resumeDot} aria-hidden="true" />
          <p className={s.resumeText}>
            <strong>You have an open session</strong>
            {' · '}at question {Math.min(resumeInfo.position + 1, resumeInfo.total)} of {resumeInfo.total}
          </p>
          <a
            href={`${basePath}/s/${resumeInfo.sessionId}/${resumeInfo.position}`}
            className={s.resumeBtn}
          >
            Resume
          </a>
        </section>
      )}

      <form onSubmit={onSubmit} className={s.builder}>
        <section className={`${s.card} ${s.filters}`} aria-labelledby="practice-filters">
          <h2 id="practice-filters" className={s.sectionHeading}>Choose what to practice</h2>

          <div className={s.filterDomainCols}>
            {sections.map((sec) => (
              <SectionColumn
                key={sec.section}
                section={sec}
                rowState={rowState}
                selectedSubcategories={selectedSubcategories}
                expanded={expanded}
                onToggleCategory={toggleCategory}
                onToggleSubcategory={(name) => setSelectedSubcategories((prev) => toggled(prev, name))}
                onToggleExpanded={(name) => setExpanded((prev) => toggled(prev, name))}
              />
            ))}
            {sections.length === 0 && <p className={s.skillsEmpty}>No ACT questions yet.</p>}
          </div>

          <div className={s.chipGroups}>
            <fieldset className={s.chipGroup}>
              <legend className={s.filterSectionLabel}>Difficulty</legend>
              <div className={s.chipRow}>
                {DIFFICULTY_OPTIONS.map((o) => {
                  const on = selectedDifficulties.has(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={[s.chip, s[o.chipClass], on ? s.on : null].filter(Boolean).join(' ')}
                      aria-pressed={on}
                      onClick={() => setSelectedDifficulties((prev) => toggled(prev, o.value))}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <label className={s.checkRow}>
            <input
              type="checkbox"
              checked={unansweredOnly}
              onChange={(e) => setUnansweredOnly(e.target.checked)}
            />
            Only questions I haven&apos;t tried
          </label>
        </section>

        <aside className={`${s.card} ${s.summary}`} aria-labelledby="practice-summary">
          <h2 id="practice-summary" className={s.sectionHeading}>Your set</h2>

          <dl className={s.summaryList}>
            <div className={s.summaryRow}>
              <dt>Topics</dt>
              <dd>{topicsSummary}</dd>
            </div>
            <div className={s.summaryRow}>
              <dt>Difficulty</dt>
              <dd>{selectedDifficulties.size === 0
                ? 'Any'
                : DIFFICULTY_OPTIONS.filter((o) => selectedDifficulties.has(o.value)).map((o) => o.short).join(', ')}</dd>
            </div>
            <div className={s.summaryRow}>
              <dt>Status</dt>
              <dd>{unansweredOnly ? 'Not tried yet' : 'Any'}</dd>
            </div>
          </dl>

          <p className={s.matchBox} aria-live="polite">
            {countErr ? (
              <span className={s.error}>{countErr}</span>
            ) : count == null ? (
              <span>{isCounting ? 'Counting questions…' : ' '}</span>
            ) : (
              <>
                <strong>{count.toLocaleString()} question{count === 1 ? '' : 's'}</strong>{' '}
                match these filters
              </>
            )}
          </p>

          <div className={s.fieldRow}>
            <label htmlFor="act-practice-size" className={s.fieldLabel}>How many</label>
            <div className={s.stepper}>
              <button
                type="button"
                className={s.stepBtn}
                aria-label="Fewer questions"
                onClick={() => setSizeText(String(Math.max(MIN_SIZE, size - 1)))}
                disabled={size <= MIN_SIZE}
              >
                −
              </button>
              <input
                id="act-practice-size"
                type="number"
                inputMode="numeric"
                min={MIN_SIZE}
                max={MAX_SIZE}
                value={sizeText}
                className={s.stepInput}
                onChange={(e) => setSizeText(e.target.value)}
                onBlur={() => {
                  const next = String(size);
                  if (next !== sizeText) setSizeText(next);
                }}
              />
              <button
                type="button"
                className={s.stepBtn}
                aria-label="More questions"
                onClick={() => setSizeText(String(Math.min(MAX_SIZE, size + 1)))}
                disabled={size >= MAX_SIZE}
              >
                +
              </button>
            </div>
          </div>

          <div className={s.fieldRow}>
            <label htmlFor="act-practice-order" className={s.fieldLabel}>Order</label>
            <select
              id="act-practice-order"
              className={s.select}
              value={order}
              onChange={(e) => setOrder(e.target.value as ActOrder)}
            >
              {ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <button type="submit" className={s.startBtn} disabled={!canSubmit}>
            {isSubmitting
              ? 'Starting…'
              : `Start ${actualSize} question${actualSize === 1 ? '' : 's'}`}
          </button>

          {count != null && !countErr && count > 0 && count < size && (
            <p className={s.countShort}>
              Only {count.toLocaleString()} match, so the set will have {actualSize}.
            </p>
          )}
          {submitError && <p role="alert" className={s.error}>{submitError}</p>}
          <p className={s.summaryNote}>You can close the tab and pick up where you left off.</p>
        </aside>
      </form>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function SectionColumn({
  section,
  rowState,
  selectedSubcategories,
  expanded,
  onToggleCategory,
  onToggleSubcategory,
  onToggleExpanded,
}: {
  section: Section;
  rowState: (c: Category) => RowState;
  selectedSubcategories: Set<string>;
  expanded: Set<string>;
  onToggleCategory: (c: Category) => void;
  onToggleSubcategory: (name: string) => void;
  onToggleExpanded: (name: string) => void;
}) {
  // Math and Science take the SAT Math tint; English and Reading the R&W tint.
  const rowClass = section.section === 'math' || section.section === 'science'
    ? s.domainRowMath
    : s.domainRowRw;
  return (
    <div>
      <div className={s.filterSectionLabel}>{section.name}</div>
      <div className={s.domainGroup}>
        {section.categories.map((cat) => {
          const state = rowState(cat);
          const on = state === 'on';
          const partial = state === 'partial';
          const subs = cat.subcategories ?? [];
          const isOpen = expanded.has(cat.name);
          const cls = [s.domainRow, rowClass, on ? s.on : null, partial ? s.partial : null]
            .filter(Boolean).join(' ');
          return (
            <div key={cat.name}>
              <div className={cls}>
                <button
                  type="button"
                  className={s.domainMain}
                  aria-pressed={on}
                  onClick={() => onToggleCategory(cat)}
                >
                  <span className={s.domainChip}>
                    <span
                      className={[s.domainCheck, on ? s.domainCheckOn : null, partial ? s.domainCheckPartial : null]
                        .filter(Boolean).join(' ')}
                      aria-hidden="true"
                    >
                      {on ? '✓' : partial ? '–' : ''}
                    </span>
                    <span className={s.domainName}>{cat.name}</span>
                    <span className={s.filterCount}>{cat.count.toLocaleString()}</span>
                  </span>
                </button>
                {subs.length > 0 && (
                  <button
                    type="button"
                    className={[s.domainExpander, isOpen ? s.domainExpanderOpen : null].filter(Boolean).join(' ')}
                    aria-expanded={isOpen}
                    onClick={() => onToggleExpanded(cat.name)}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} subcategories in ${cat.name}`}
                  >
                    <span>Topics</span>
                    <span aria-hidden="true" className={s.domainExpanderArrow}>{isOpen ? '▾' : '▸'}</span>
                  </button>
                )}
              </div>
              {isOpen && subs.length > 0 && (
                <div className={s.skillsPanel}>
                  {subs.map((sub) => {
                    const subOn = selectedSubcategories.has(sub.name);
                    return (
                      <button
                        key={sub.name}
                        type="button"
                        className={subOn ? `${s.skillChip} ${s.on}` : s.skillChip}
                        aria-pressed={subOn}
                        onClick={() => onToggleSubcategory(sub.name)}
                      >
                        <span>{sub.name}</span>
                        <span className={s.skillChipCount}>{sub.count.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

/** "All topics", "Algebra", "Algebra, Geometry", or "Algebra + 3 more". */
function summarizeTopics(
  sections: Section[],
  rowState: (c: Category) => RowState,
  selectedSubcategories: Set<string>,
): string {
  const full: string[] = [];
  const loose: string[] = [];
  for (const sec of sections) {
    for (const cat of sec.categories) {
      const st = rowState(cat);
      if (st === 'on') full.push(cat.name);
      else if (st === 'partial') {
        for (const sub of cat.subcategories ?? []) if (selectedSubcategories.has(sub.name)) loose.push(sub.name);
      }
    }
  }
  const names = [...full, ...loose];
  if (names.length === 0) return 'All topics';
  if (names.length <= 2) return names.join(', ');
  const shown = full.length > 0 ? full.slice(0, 2) : loose.slice(0, 1);
  return `${shown.join(', ')} + ${names.length - shown.length} more`;
}

function toggled<T>(prev: Set<T>, value: T): Set<T> {
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function buildFormData({
  categories, subcategories, difficulties, unansweredOnly, order, size,
}: {
  categories: Set<string>;
  subcategories: Set<string>;
  difficulties: Set<number>;
  unansweredOnly: boolean;
  order: ActOrder;
  size: number;
}): FormData {
  const fd = new FormData();
  for (const v of categories)    fd.append('category',    v);
  for (const v of subcategories) fd.append('subcategory', v);
  for (const v of difficulties)  fd.append('difficulty',  String(v));
  if (unansweredOnly) fd.set('unanswered_only', '1');
  fd.set('order', order);
  fd.set('size', String(size));
  return fd;
}

function resolveSize(raw: string): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
}

function isRedirectError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}
