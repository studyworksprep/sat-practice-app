// Practice-start client island. Filter form with live "questions
// available" count + session generator, styled after the design-kit
// QuestionBank / FilterBar page.
//
// Layout summary:
//   - Resume callouts for an active session or in-progress test.
//   - Compact Practice-test launcher (dropdown + accommodations +
//     Launch button) — replaces the grid of test cards. Completed
//     tests get a ✓ beside their name so the student can see at a
//     glance what's left.
//   - Filter card:
//       · Two-column Math / R&W domain grid. Clicking the main
//         domain row toggles every skill in that domain (it's the
//         fast path for "all of Algebra"). A small "Skills" arrow
//         on the right of each row expands / collapses the skill
//         list for fine-tuning without changing the selection.
//       · Difficulty + score-band + "Unattempted only" chip row.
//       · Session size / order / Start row, with a prominent
//         "N questions match" line so the student always knows how
//         many questions their filters actually cover — the CTA
//         count ("Start · 10") shows the session size, not the
//         filter match count.
//
// The count is computed server-side by the countAvailable Server
// Action, debounced by 400ms after the last filter change.
// selectedSkills is the single source of truth for the question
// filter — "domain selected" is derived from "all its skills are
// selected", so the submit payload is flat skills only.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Card } from '@/lib/ui/Card';
import s from './StartInteractive.module.css';

const MIN_SIZE = 1;
const MAX_SIZE = 50;
const DEFAULT_SIZE = 10;

const DIFFICULTY_OPTIONS = [
  { value: 1, label: 'Easy',   chipClass: 'chipDiffEasy' },
  { value: 2, label: 'Medium', chipClass: 'chipDiffMed' },
  { value: 3, label: 'Hard',   chipClass: 'chipDiffHard' },
];

const ORDER_OPTIONS = [
  { value: 'display_code', label: 'Database order' },
  { value: 'easy_first',   label: 'Easy → Hard' },
  { value: 'hard_first',   label: 'Hard → Easy' },
  { value: 'random',       label: 'Random' },
];

export function StartInteractive({
  domains,
  scoreBands,
  resumeInfo,
  resumeTest = null,
  tests = [],
  createSessionAction,
  countAvailableAction,
  startTestAttemptAction,
  basePath = '/practice',
}) {
  // ── Form state ─────────────────────────────────────────────
  const [selectedSkills,        setSelectedSkills]        = useState(() => new Set());
  const [expandedDomains,       setExpandedDomains]       = useState(() => new Set());
  const [selectedDifficulties,  setSelectedDifficulties]  = useState(() => new Set());
  const [selectedScoreBands,    setSelectedScoreBands]    = useState(() => new Set());
  const [unansweredOnly,        setUnansweredOnly]        = useState(false);
  const [order,                 setOrder]                 = useState('display_code');
  const [size,                  setSize]                  = useState(DEFAULT_SIZE);

  // Split the domain list into Math and R&W columns.
  const mathDomains = useMemo(
    () => domains.filter((d) => d.section === 'math'),
    [domains],
  );
  const rwDomains = useMemo(
    () => domains.filter((d) => d.section === 'rw'),
    [domains],
  );

  // ── Live count ─────────────────────────────────────────────
  const [count, setCount] = useState(null);
  const [countErr, setCountErr] = useState(null);
  const [isCounting, startCount] = useTransition();

  const countTimer = useRef(null);
  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(() => {
      startCount(async () => {
        const fd = buildFormData({
          skills: selectedSkills,
          difficulties: selectedDifficulties,
          scoreBands: selectedScoreBands,
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
    // order and size don't affect the candidate count — intentionally
    // excluded from the dep list so they don't trigger re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedSkills, selectedDifficulties, selectedScoreBands,
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
      skills: selectedSkills,
      difficulties: selectedDifficulties,
      scoreBands: selectedScoreBands,
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

  // Domain-row helpers. A domain is "on" if every one of its skills
  // is selected, "partial" if some are, "off" if none are.
  function domainState(domain) {
    if (domain.skills.length === 0) return 'off';
    let hits = 0;
    for (const sk of domain.skills) if (selectedSkills.has(sk.name)) hits += 1;
    if (hits === 0) return 'off';
    if (hits === domain.skills.length) return 'on';
    return 'partial';
  }

  function toggleAllInDomain(domain) {
    const state = domainState(domain);
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (state === 'on') {
        for (const sk of domain.skills) next.delete(sk.name);
      } else {
        for (const sk of domain.skills) next.add(sk.name);
      }
      return next;
    });
  }

  function toggleSkill(skillName) {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillName)) next.delete(skillName);
      else next.add(skillName);
      return next;
    });
  }

  function toggleDomainExpanded(domainName) {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domainName)) next.delete(domainName);
      else next.add(domainName);
      return next;
    });
  }

  return (
    <main className={s.container}>
      <div className={s.titleRow}>
        <div>
          <h1 className={s.h1}>Practice</h1>
          <p className={s.sub}>
            Pick filters, then start. Every session is a fixed walk
            through the questions it generates — close the tab and
            pick back up later.
          </p>
        </div>
        <a href="/practice/history" className={s.historyLink}>
          Practice history →
        </a>
      </div>

      {resumeInfo && (
        <Card tone="info" className={s.resumeCard} role="status">
          <div>
            <strong>You have an active session.</strong>{' '}
            Position {resumeInfo.position + 1} of {resumeInfo.total}.
          </div>
          <a
            href={`${basePath}/s/${resumeInfo.sessionId}/${resumeInfo.position}`}
            className={s.resumeLink}
          >
            Resume →
          </a>
        </Card>
      )}

      {resumeTest && (
        <Card tone="warn" className={s.resumeCard} role="status">
          <div>
            <strong>Test in progress:</strong> {resumeTest.testName}.
          </div>
          <a
            href={`${basePath}/test/attempt/${resumeTest.attemptId}`}
            className={s.resumeLink}
          >
            Continue test →
          </a>
        </Card>
      )}

      {tests.length > 0 && (
        <TestLauncher
          tests={tests}
          basePath={basePath}
          startTestAttemptAction={startTestAttemptAction}
        />
      )}

      <form onSubmit={onSubmit} className={s.card}>
        <div className={s.filterCardHeader}>
          <div className={s.h2}>Filter question bank</div>
          <MatchCount count={count} isCounting={isCounting} />
        </div>

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

        <div className={s.chipRow}>
          <span className={s.chipRowLabel}>Difficulty</span>
          {DIFFICULTY_OPTIONS.map((o) => {
            const on = selectedDifficulties.has(o.value);
            const cls = [s.chip, s[o.chipClass], on ? s.on : null].filter(Boolean).join(' ');
            return (
              <button
                key={o.value}
                type="button"
                className={cls}
                aria-pressed={on}
                onClick={() => toggleSetter(setSelectedDifficulties)(o.value)}
              >
                {o.label}
              </button>
            );
          })}

          {scoreBands.length > 0 && (
            <>
              <span className={s.chipRowSpacer} />
              <span className={s.chipRowLabel}>Score band</span>
              {scoreBands.map((b) => {
                const on = selectedScoreBands.has(b);
                const cls = [s.chip, on ? s.on : null].filter(Boolean).join(' ');
                return (
                  <button
                    key={b}
                    type="button"
                    className={cls}
                    aria-pressed={on}
                    onClick={() => toggleSetter(setSelectedScoreBands)(b)}
                  >
                    {b}
                  </button>
                );
              })}
            </>
          )}

          <span className={s.chipRowSpacer} />
          <span className={s.chipRowLabel}>Status</span>
          <button
            type="button"
            className={[s.chip, unansweredOnly ? s.on : null].filter(Boolean).join(' ')}
            aria-pressed={unansweredOnly}
            onClick={() => setUnansweredOnly((v) => !v)}
          >
            Unattempted only
          </button>
        </div>

        <div className={s.actionsRow}>
          <label className={s.secondaryField}>
            Session size
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={size}
              onChange={(e) => setSize(clampSize(e.target.value))}
            />
          </label>
          <label className={s.secondaryField}>
            Order
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              {ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={s.startBtn} disabled={!canSubmit}>
            {isSubmitting
              ? 'Starting…'
              : `Start · ${actualSize} question${actualSize === 1 ? '' : 's'}`}
          </button>
        </div>

        <div className={s.countLine} aria-live="polite">
          {countErr && <span className={s.error}>{countErr}</span>}
          {count != null && !countErr && count < size && (
            <span className={s.countShort}>
              Only {count.toLocaleString()} question{count === 1 ? '' : 's'} match — session will contain {actualSize}.
            </span>
          )}
        </div>

        {submitState && !submitState.ok && (
          <p role="alert" className={s.error}>{submitState.error}</p>
        )}
      </form>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function MatchCount({ count, isCounting }) {
  return (
    <span className={s.matchCount} aria-live="polite">
      {count == null && isCounting && '…'}
      {count == null && !isCounting && ''}
      {count != null && (
        <>
          <strong className={s.matchCountValue}>
            {count.toLocaleString()}
          </strong>{' '}
          question{count === 1 ? '' : 's'} match
        </>
      )}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────

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
}) {
  const rowClass = variant === 'math' ? s.domainRowMath : s.domainRowRw;
  return (
    <div>
      <div className={s.filterSectionLabel}>{title}</div>
      <div className={s.domainGroup}>
        {domains.length === 0 && (
          <p className={s.skillsEmpty}>No domains.</p>
        )}
        {domains.map((d) => {
          const state = domainState(d);
          const on = state === 'on';
          const partial = state === 'partial';
          const expanded = expandedDomains.has(d.name);
          const cls = [
            s.domainRow,
            rowClass,
            on ? s.on : null,
            partial ? s.partial : null,
          ].filter(Boolean).join(' ');
          return (
            <div key={d.name}>
              <div className={cls}>
                <button
                  type="button"
                  className={s.domainMain}
                  aria-pressed={on}
                  onClick={() => onToggleDomain(d)}
                  title={
                    on
                      ? 'Click to deselect all skills in this domain'
                      : 'Click to select all skills in this domain'
                  }
                >
                  <span className={s.domainChip}>
                    <span
                      className={[
                        s.domainCheck,
                        on ? s.domainCheckOn : null,
                        partial ? s.domainCheckPartial : null,
                      ].filter(Boolean).join(' ')}
                      aria-hidden="true"
                    >
                      {on ? '✓' : partial ? '–' : ''}
                    </span>
                    <span className={s.domainName}>{d.name}</span>
                    <span className={s.filterCount}>
                      {d.total.toLocaleString()}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={[s.domainExpander, expanded ? s.domainExpanderOpen : null]
                    .filter(Boolean).join(' ')}
                  aria-expanded={expanded}
                  onClick={() => onToggleExpanded(d.name)}
                  aria-label={`${expanded ? 'Hide' : 'Show'} skills in ${d.name}`}
                >
                  <span>Skills</span>
                  <span aria-hidden="true" className={s.domainExpanderArrow}>
                    {expanded ? '▾' : '▸'}
                  </span>
                </button>
              </div>
              {expanded && d.skills.length > 0 && (
                <div className={s.skillsPanel}>
                  {d.skills.map((sk) => {
                    const skOn = selectedSkills.has(sk.name);
                    const skCls = [s.skillChip, skOn ? s.on : null].filter(Boolean).join(' ');
                    return (
                      <button
                        key={sk.name}
                        type="button"
                        className={skCls}
                        aria-pressed={skOn}
                        onClick={() => onToggleSkill(sk.name)}
                      >
                        <span>{sk.name}</span>
                        {sk.count != null && (
                          <span className={s.skillChipCount}>
                            {sk.count.toLocaleString()}
                          </span>
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
// Compact practice-test launcher. Replaces the card grid: one
// dropdown, accommodations toggle, Launch button. A ✓ next to
// already-completed tests lets the student see at a glance what
// they haven't tried yet.
// ──────────────────────────────────────────────────────────────

function TestLauncher({ tests, basePath, startTestAttemptAction }) {
  const firstIncomplete = useMemo(
    () => tests.find((t) => !t.completed) ?? tests[0] ?? null,
    [tests],
  );
  const [selectedId, setSelectedId] = useState(firstIncomplete?.id ?? '');
  const [accommodationOn, setAccommodationOn] = useState(false);
  const [multiplier, setMultiplier] = useState(1.5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const selectedTest = tests.find((t) => t.id === selectedId) ?? null;

  async function onLaunch(e) {
    e.preventDefault();
    if (!selectedTest || !startTestAttemptAction) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set('testId', selectedTest.id);
    if (accommodationOn && multiplier > 1) {
      fd.set('timeMultiplier', String(multiplier));
    }
    try {
      const res = await startTestAttemptAction(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Could not start the test.');
      } else {
        window.location.href = `${basePath}/test/attempt/${res.attemptId}`;
      }
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={s.testLauncher} onSubmit={onLaunch}>
      <div className={s.testLauncherHeader}>
        <div>
          <div className={s.h2}>Practice tests</div>
          <div className={s.testsHint}>
            Full-length SAT tests, taken under timed conditions.
          </div>
        </div>
      </div>

      <div className={s.testLauncherRow}>
        <label className={s.testLauncherLabel}>
          Test
          <select
            className={s.testSelect}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.completed ? '✓ ' : ''}
                {t.name}
                {t.code ? ` · ${t.code}` : ''}
                {t.isAdaptive ? ' · Adaptive' : ''}
                {t.completed ? ' · completed' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className={s.testLauncherCheck}>
          <input
            type="checkbox"
            checked={accommodationOn}
            onChange={(e) => setAccommodationOn(e.target.checked)}
          />
          <span>Extra-time accommodation</span>
        </label>

        {accommodationOn && (
          <select
            className={s.testMultiplier}
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            aria-label="Time multiplier"
          >
            <option value={1.5}>1.5× time</option>
            <option value={2}>2× time</option>
          </select>
        )}

        <button
          type="submit"
          className={s.launchBtn}
          disabled={submitting || !selectedTest}
        >
          {submitting ? 'Launching…' : 'Launch test'}
        </button>
      </div>

      {selectedTest && (
        <div className={s.testLauncherNote}>
          <a
            href={`${basePath}/test/${selectedTest.id}`}
            className={s.testDetailsLink}
          >
            View test details →
          </a>
        </div>
      )}

      {error && <p role="alert" className={s.error}>{error}</p>}
    </form>
  );
}

// ──────────────────────────────────────────────────────────────

function toggleSetter(setter) {
  return (value) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };
}

function buildFormData({ skills, difficulties, scoreBands, unansweredOnly, order, size }) {
  const fd = new FormData();
  for (const v of skills)       fd.append('skill',      v);
  for (const v of difficulties) fd.append('difficulty', String(v));
  for (const v of scoreBands)   fd.append('score_band', String(v));
  if (unansweredOnly) fd.append('unanswered_only', '1');
  fd.append('order', order);
  fd.append('size', String(size));
  return fd;
}

function clampSize(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
}

function isRedirectError(err) {
  return err?.digest?.startsWith?.('NEXT_REDIRECT') === true;
}
