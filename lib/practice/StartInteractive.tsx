// SAT practice builder — client island for /practice/start (and the
// tutor training launcher, which reuses it).
//
// Layout (2026-11 redesign):
//   - PageHeader: "Build a practice set", Help, History.
//   - Slim resume bars for an open session / in-progress test.
//   - "Suggested for you": up to three ready-made filter sets
//     (lib/practice/practice-suggestions.ts). A suggestion only
//     prefills the form — the student still sees the count and starts.
//   - Two columns: the filter form on the left (Math / R&W domain grid,
//     difficulty, score band, status, extra sets) and a sticky "Your set"
//     summary on the right with the live match count, size stepper,
//     order and the Start button. They stack on narrow screens.
//
// Domain rows: clicking the row toggles every skill in the domain (the
// fast path for "all of Algebra"); the Skills toggle expands the list
// for fine-tuning. selectedSkills is the single source of truth — a
// domain is "on" when all its skills are selected — so the submit
// payload is flat skills only.
//
// The count comes from the countAvailable Server Action, debounced
// 400ms after the last filter change.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { ComponentType, FormEvent, ReactNode } from 'react';
import { HelpButton } from '@/app/(student)/help/HelpButton';
import { PageHeader } from '@/lib/ui/PageHeader';
import { QuestionSearch as QuestionSearchJs } from './QuestionSearch';
import type { PracticeSuggestion, SuggestionOrder } from './practice-suggestions';
import s from './StartInteractive.module.css';

// QuestionSearch.jsx is untyped; its `listTagsAction = null` default
// infers as `null`. Normalize the props once, here at the seam.
const QuestionSearch = QuestionSearchJs as unknown as ComponentType<{
  searchQuestionsAction: unknown;
  createSessionAction: unknown;
  listTagsAction: unknown;
}>;

const MIN_SIZE = 1;
const MAX_SIZE = 50;
const DEFAULT_SIZE = 10;

const DIFFICULTY_OPTIONS = [
  { value: 1, label: 'Easy',   chipClass: 'chipDiffEasy' },
  { value: 2, label: 'Medium', chipClass: 'chipDiffMed' },
  { value: 3, label: 'Hard',   chipClass: 'chipDiffHard' },
] as const;

const ORDER_OPTIONS: ReadonlyArray<{ value: SuggestionOrder; label: string }> = [
  { value: 'display_code', label: 'Database order' },
  { value: 'easy_first',   label: 'Easy → Hard' },
  { value: 'hard_first',   label: 'Hard → Easy' },
  { value: 'random',       label: 'Random' },
];

interface Skill { name: string; count: number | null }
interface Domain {
  name: string;
  code: string | null;
  section: string;
  skills: Skill[];
  total: number;
}
interface ExtraBatch { id: string; label: string; count: number }

type ActionResult = { ok: boolean; error?: string; count?: number } | null | undefined;
type FormAction = (prev: unknown, fd: FormData) => Promise<ActionResult>;

export interface StartInteractiveProps {
  domains: Domain[];
  scoreBands: number[];
  extraBatches?: ExtraBatch[];
  suggestions?: PracticeSuggestion[];
  resumeInfo: { sessionId: string; position: number; total: number } | null;
  resumeTest?: { attemptId: string; testName: string } | null;
  createSessionAction: FormAction;
  countAvailableAction: FormAction;
  searchQuestionsAction?: unknown;
  listTagsAction?: unknown;
  basePath?: string;
  historyHref?: string;
  eyebrow?: ReactNode;
}

type DomainState = 'on' | 'partial' | 'off';

export function StartInteractive({
  domains,
  scoreBands,
  extraBatches = [],
  suggestions = [],
  resumeInfo,
  resumeTest = null,
  createSessionAction,
  countAvailableAction,
  searchQuestionsAction = null,
  listTagsAction = null,
  basePath = '/practice',
  historyHref = '/practice/history',
  eyebrow = 'Practice · SAT',
}: StartInteractiveProps) {
  // ── Form state ─────────────────────────────────────────────
  const [selectedSkills,       setSelectedSkills]       = useState<Set<string>>(() => new Set());
  const [expandedDomains,      setExpandedDomains]      = useState<Set<string>>(() => new Set());
  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<number>>(() => new Set());
  const [selectedScoreBands,   setSelectedScoreBands]   = useState<Set<number>>(() => new Set());
  // Opt-in import batches ("Extra practice sets"). Off by default —
  // their questions are outside the standard pool and only join the
  // candidate set while a chip here is selected.
  const [selectedBatches,      setSelectedBatches]      = useState<Set<string>>(() => new Set());
  const [unansweredOnly,       setUnansweredOnly]       = useState(false);
  const [order,                setOrder]                = useState<SuggestionOrder>('display_code');
  // Session size is held as raw input text so the student can edit it
  // freely; the numeric `size` is derived (parse + clamp) and the input
  // re-snaps to it on blur.
  const [sizeText,             setSizeText]             = useState(String(DEFAULT_SIZE));
  const size = useMemo(() => resolveSize(sizeText), [sizeText]);

  const mathDomains = useMemo(() => domains.filter((d) => d.section === 'math'), [domains]);
  const rwDomains   = useMemo(() => domains.filter((d) => d.section === 'rw'), [domains]);

  const summaryRef = useRef<HTMLElement>(null);

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
          skills: selectedSkills,
          difficulties: selectedDifficulties,
          scoreBands: selectedScoreBands,
          batches: selectedBatches,
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
    // order and size don't affect the candidate count — intentionally
    // excluded from the dep list so they don't trigger re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedSkills, selectedDifficulties, selectedScoreBands,
    selectedBatches, unansweredOnly, countAvailableAction,
  ]);

  // ── Submit ─────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    const fd = buildFormData({
      skills: selectedSkills,
      difficulties: selectedDifficulties,
      scoreBands: selectedScoreBands,
      batches: selectedBatches,
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

  // ── Domain helpers ─────────────────────────────────────────
  function domainState(domain: Domain): DomainState {
    if (domain.skills.length === 0) return 'off';
    let hits = 0;
    for (const sk of domain.skills) if (selectedSkills.has(sk.name)) hits += 1;
    if (hits === 0) return 'off';
    if (hits === domain.skills.length) return 'on';
    return 'partial';
  }

  function toggleAllInDomain(domain: Domain) {
    const state = domainState(domain);
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (state === 'on') for (const sk of domain.skills) next.delete(sk.name);
      else for (const sk of domain.skills) next.add(sk.name);
      return next;
    });
  }

  function toggleSkill(skillName: string) {
    setSelectedSkills((prev) => toggled(prev, skillName));
  }

  function toggleDomainExpanded(domainName: string) {
    setExpandedDomains((prev) => toggled(prev, domainName));
  }

  // ── Suggestions ────────────────────────────────────────────
  function applySuggestion(sug: PracticeSuggestion) {
    setSelectedSkills(new Set(sug.filters.skills));
    setSelectedDifficulties(new Set(sug.filters.difficulties));
    setSelectedScoreBands(new Set());
    setSelectedBatches(new Set());
    setUnansweredOnly(sug.filters.unansweredOnly);
    setOrder(sug.filters.order);
    summaryRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function isApplied(sug: PracticeSuggestion) {
    return sameSet(selectedSkills, sug.filters.skills)
      && sameSet(selectedDifficulties, sug.filters.difficulties)
      && selectedScoreBands.size === 0
      && selectedBatches.size === 0
      && unansweredOnly === sug.filters.unansweredOnly
      && order === sug.filters.order;
  }

  const topicsSummary = summarizeTopics(domains, selectedSkills, domainState);

  return (
    <main className={s.container}>
      <PageHeader
        eyebrow={eyebrow}
        title="Build a practice set"
        description={suggestions.length > 0
          ? 'Start from a suggestion, or filter the question bank yourself. The summary updates as you choose.'
          : 'Filter the question bank, then start. The summary updates as you choose.'}
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

      {resumeTest && (
        <section className={s.resumeBar} aria-label="Test in progress">
          <span className={`${s.resumeDot} ${s.resumeDotTest}`} aria-hidden="true" />
          <p className={s.resumeText}>
            <strong>Test in progress</strong>{' · '}{resumeTest.testName}
          </p>
          <a href={`${basePath}/test/attempt/${resumeTest.attemptId}`} className={s.resumeBtn}>
            Continue test
          </a>
        </section>
      )}

      {suggestions.length > 0 && (
        <section aria-labelledby="practice-suggestions" className={s.suggestions}>
          <h2 id="practice-suggestions" className={s.sectionHeading}>Suggested for you</h2>
          <div className={s.suggestionGrid}>
            {suggestions.map((sug) => {
              const applied = isApplied(sug);
              return (
                <button
                  key={sug.id}
                  type="button"
                  className={applied ? `${s.suggestion} ${s.suggestionOn}` : s.suggestion}
                  aria-pressed={applied}
                  onClick={() => applySuggestion(sug)}
                >
                  <span className={`${s.suggestionKicker} ${s[`kicker_${sug.id}`] ?? ''}`}>
                    {sug.kicker}
                  </span>
                  <span className={s.suggestionTitle}>{sug.title}</span>
                  <span className={s.suggestionDetail}>{sug.detail}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <form onSubmit={onSubmit} className={s.builder}>
        <section className={`${s.card} ${s.filters}`} aria-labelledby="practice-filters">
          <h2 id="practice-filters" className={s.sectionHeading}>
            {suggestions.length > 0 ? 'Or choose your own' : 'Choose what to practice'}
          </h2>

          <div className={s.filterDomainCols}>
            <DomainColumn
              title="Math"
              variant="math"
              domains={mathDomains}
              selectedSkills={selectedSkills}
              expandedDomains={expandedDomains}
              domainState={domainState}
              onToggleDomain={toggleAllInDomain}
              onToggleSkill={toggleSkill}
              onToggleExpanded={toggleDomainExpanded}
            />
            <DomainColumn
              title="Reading & Writing"
              variant="rw"
              domains={rwDomains}
              selectedSkills={selectedSkills}
              expandedDomains={expandedDomains}
              domainState={domainState}
              onToggleDomain={toggleAllInDomain}
              onToggleSkill={toggleSkill}
              onToggleExpanded={toggleDomainExpanded}
            />
          </div>

          <div className={s.chipGroups}>
            <ChipGroup label="Difficulty">
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
            </ChipGroup>

            {scoreBands.length > 0 && (
              <ChipGroup label="Score band">
                {scoreBands.map((b) => {
                  const on = selectedScoreBands.has(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      className={on ? `${s.chip} ${s.on}` : s.chip}
                      aria-pressed={on}
                      onClick={() => setSelectedScoreBands((prev) => toggled(prev, b))}
                    >
                      {b}
                    </button>
                  );
                })}
              </ChipGroup>
            )}
          </div>

          <label className={s.checkRow}>
            <input
              type="checkbox"
              checked={unansweredOnly}
              onChange={(e) => setUnansweredOnly(e.target.checked)}
            />
            Only questions I haven&apos;t tried
          </label>

          {extraBatches.length > 0 && (
            <ChipGroup
              label="Extra practice sets"
              hint="Bonus question sets modeled on recent SAT administrations. A set joins your session pool only while it's selected — your other filters still apply to it."
            >
              {extraBatches.map((b) => {
                const on = selectedBatches.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={on ? `${s.chip} ${s.on}` : s.chip}
                    aria-pressed={on}
                    onClick={() => setSelectedBatches((prev) => toggled(prev, b.id))}
                  >
                    <span>{b.label}</span>
                    <span className={s.skillChipCount}>{b.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </ChipGroup>
          )}
        </section>

        <aside ref={summaryRef} className={`${s.card} ${s.summary}`} aria-labelledby="practice-summary">
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
                : DIFFICULTY_OPTIONS.filter((o) => selectedDifficulties.has(o.value)).map((o) => o.label).join(', ')}</dd>
            </div>
            {scoreBands.length > 0 && (
              <div className={s.summaryRow}>
                <dt>Score band</dt>
                <dd>{selectedScoreBands.size === 0
                  ? 'Any'
                  : [...selectedScoreBands].sort((a, b) => a - b).join(', ')}</dd>
              </div>
            )}
            <div className={s.summaryRow}>
              <dt>Status</dt>
              <dd>{unansweredOnly ? 'Not tried yet' : 'Any'}</dd>
            </div>
            {selectedBatches.size > 0 && (
              <div className={s.summaryRow}>
                <dt>Extra sets</dt>
                <dd>{selectedBatches.size}</dd>
              </div>
            )}
          </dl>

          <p className={s.matchBox} aria-live="polite">
            {countErr ? (
              <span className={s.error}>{countErr}</span>
            ) : count == null ? (
              <span>{isCounting ? 'Counting questions…' : ' '}</span>
            ) : (
              <>
                <strong>{count.toLocaleString()} question{count === 1 ? '' : 's'}</strong>{' '}
                match these filters
              </>
            )}
          </p>

          <div className={s.fieldRow}>
            <label htmlFor="practice-size" className={s.fieldLabel}>How many</label>
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
                id="practice-size"
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
            <label htmlFor="practice-order" className={s.fieldLabel}>Order</label>
            <select
              id="practice-order"
              className={s.select}
              value={order}
              onChange={(e) => setOrder(e.target.value as SuggestionOrder)}
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

      {searchQuestionsAction ? (
        <QuestionSearch
          searchQuestionsAction={searchQuestionsAction}
          createSessionAction={createSessionAction}
          listTagsAction={listTagsAction}
        />
      ) : null}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function ChipGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className={s.chipGroup}>
      <legend className={s.filterSectionLabel}>{label}</legend>
      <div className={s.chipRow}>{children}</div>
      {hint && <p className={s.extraSetsHint}>{hint}</p>}
    </fieldset>
  );
}

function DomainColumn({
  title,
  variant,
  domains,
  selectedSkills,
  expandedDomains,
  domainState,
  onToggleDomain,
  onToggleSkill,
  onToggleExpanded,
}: {
  title: string;
  variant: 'math' | 'rw';
  domains: Domain[];
  selectedSkills: Set<string>;
  expandedDomains: Set<string>;
  domainState: (d: Domain) => DomainState;
  onToggleDomain: (d: Domain) => void;
  onToggleSkill: (name: string) => void;
  onToggleExpanded: (name: string) => void;
}) {
  const rowClass = variant === 'math' ? s.domainRowMath : s.domainRowRw;
  return (
    <div>
      <div className={s.filterSectionLabel}>{title}</div>
      <div className={s.domainGroup}>
        {domains.length === 0 && <p className={s.skillsEmpty}>No domains.</p>}
        {domains.map((d) => {
          const state = domainState(d);
          const on = state === 'on';
          const partial = state === 'partial';
          const expanded = expandedDomains.has(d.name);
          const cls = [s.domainRow, rowClass, on ? s.on : null, partial ? s.partial : null]
            .filter(Boolean).join(' ');
          return (
            <div key={d.name}>
              <div className={cls}>
                <button
                  type="button"
                  className={s.domainMain}
                  aria-pressed={on}
                  onClick={() => onToggleDomain(d)}
                  title={on
                    ? 'Click to deselect all skills in this domain'
                    : 'Click to select all skills in this domain'}
                >
                  <span className={s.domainChip}>
                    <span
                      className={[s.domainCheck, on ? s.domainCheckOn : null, partial ? s.domainCheckPartial : null]
                        .filter(Boolean).join(' ')}
                      aria-hidden="true"
                    >
                      {on ? '✓' : partial ? '–' : ''}
                    </span>
                    <span className={s.domainName}>{d.name}</span>
                    <span className={s.filterCount}>{d.total.toLocaleString()}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={[s.domainExpander, expanded ? s.domainExpanderOpen : null].filter(Boolean).join(' ')}
                  aria-expanded={expanded}
                  onClick={() => onToggleExpanded(d.name)}
                  aria-label={`${expanded ? 'Hide' : 'Show'} skills in ${d.name}`}
                >
                  <span>Skills</span>
                  <span aria-hidden="true" className={s.domainExpanderArrow}>{expanded ? '▾' : '▸'}</span>
                </button>
              </div>
              {expanded && d.skills.length > 0 && (
                <div className={s.skillsPanel}>
                  {d.skills.map((sk) => {
                    const skOn = selectedSkills.has(sk.name);
                    return (
                      <button
                        key={sk.name}
                        type="button"
                        className={skOn ? `${s.skillChip} ${s.on}` : s.skillChip}
                        aria-pressed={skOn}
                        onClick={() => onToggleSkill(sk.name)}
                      >
                        <span>{sk.name}</span>
                        {sk.count != null && (
                          <span className={s.skillChipCount}>{sk.count.toLocaleString()}</span>
                        )}
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

/** "All topics", "Algebra", "Algebra, Circles", or "Algebra + 3 skills". */
function summarizeTopics(
  domains: Domain[],
  selected: Set<string>,
  domainState: (d: Domain) => DomainState,
): string {
  if (selected.size === 0) return 'All topics';
  const full: string[] = [];
  const loose: string[] = [];
  for (const d of domains) {
    const st = domainState(d);
    if (st === 'on') full.push(d.name);
    else if (st === 'partial') for (const sk of d.skills) if (selected.has(sk.name)) loose.push(sk.name);
  }
  const names = [...full, ...loose];
  if (names.length <= 2) return names.join(', ');
  const shown = full.length > 0 ? full.slice(0, 2) : loose.slice(0, 1);
  const rest = names.length - shown.length;
  return `${shown.join(', ')} + ${rest} more`;
}

function toggled<T>(prev: Set<T>, value: T): Set<T> {
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function sameSet<T>(set: Set<T>, list: readonly T[]): boolean {
  return set.size === list.length && list.every((v) => set.has(v));
}

function buildFormData({
  skills, difficulties, scoreBands, batches, unansweredOnly, order, size,
}: {
  skills: Set<string>;
  difficulties: Set<number>;
  scoreBands: Set<number>;
  batches: Set<string>;
  unansweredOnly: boolean;
  order: SuggestionOrder;
  size: number;
}): FormData {
  const fd = new FormData();
  for (const v of skills)       fd.append('skill',       v);
  for (const v of difficulties) fd.append('difficulty',  String(v));
  for (const v of scoreBands)   fd.append('score_band',  String(v));
  for (const v of batches)      fd.append('extra_batch', v);
  if (unansweredOnly) fd.append('unanswered_only', '1');
  fd.append('order', order);
  fd.append('size', String(size));
  return fd;
}

// Parse + clamp the session-size input. Empty / non-numeric input
// collapses to DEFAULT_SIZE so the count, the Start label and the
// submission always have a valid integer while the student is mid-edit.
function resolveSize(raw: string): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
}

function isRedirectError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}
