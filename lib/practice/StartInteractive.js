// Practice-start client island. Filter form with live "questions
// available" count + session generator, styled after the design-
// kit QuestionBank / FilterBar page.
//
// Layout summary:
//   - One filter card with the "Start · N questions" CTA in the
//     header row (form submit lives on the same button — no
//     separate submit at the bottom).
//   - Two-column Math / R&W domain grid below. Each domain row
//     toggles on click and shows its total count on the right.
//   - Difficulty chips + score-band chips + a single "Unattempted"
//     status chip that maps to the old "only unanswered" toggle.
//   - Collapsible "+ Skills" expander; only meaningful when at
//     least one domain is selected.
//   - Small secondary row at the bottom for session size + order
//     — kept demoted because the typical student won't touch them.
//
// The count is computed server-side by the countAvailable Server
// Action, debounced by 400ms after the last filter change. The
// submit path runs through createSession exactly as before —
// fixed-list philosophy (see actions.js): every session is a
// pre-determined walk through a known list. The practice page
// itself never sees the filter state.

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
  basePath = '/practice',
}) {
  // ── Form state ─────────────────────────────────────────────
  const [selectedDomains,       setSelectedDomains]       = useState(() => new Set());
  const [selectedSkills,        setSelectedSkills]        = useState(() => new Set());
  const [selectedDifficulties,  setSelectedDifficulties]  = useState(() => new Set());
  const [selectedScoreBands,    setSelectedScoreBands]    = useState(() => new Set());
  const [unansweredOnly,        setUnansweredOnly]        = useState(false);
  const [order,                 setOrder]                 = useState('display_code');
  const [size,                  setSize]                  = useState(DEFAULT_SIZE);

  // Split the domain list into Math and R&W columns for the
  // design-kit two-column layout. section comes from domain_code
  // via domainSection(); see app/next/.../start/page.js.
  const mathDomains = useMemo(
    () => domains.filter((d) => d.section === 'math'),
    [domains],
  );
  const rwDomains = useMemo(
    () => domains.filter((d) => d.section === 'rw'),
    [domains],
  );

  // If the domain selection changes and causes some selected
  // skills to leave the valid set, drop them. Skills are only
  // valid when their owning domain is selected — so the valid
  // set is the union of skills across selectedDomains only.
  useEffect(() => {
    const valid = new Set();
    for (const d of domains) {
      if (!selectedDomains.has(d.name)) continue;
      for (const sk of d.skills) valid.add(sk);
    }
    setSelectedSkills((prev) => {
      const next = new Set();
      for (const sk of prev) if (valid.has(sk)) next.add(sk);
      return next.size === prev.size ? prev : next;
    });
  }, [domains, selectedDomains]);

  // ── Live count ─────────────────────────────────────────────
  const [count, setCount] = useState(null);
  const [countErr, setCountErr] = useState(null);
  const [isCounting, startCount] = useTransition();

  // Debounce: 400ms after the last filter change.
  const countTimer = useRef(null);
  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(() => {
      startCount(async () => {
        const fd = buildFormData({
          domains: selectedDomains,
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
  }, [
    selectedDomains, selectedSkills, selectedDifficulties, selectedScoreBands,
    unansweredOnly, countAvailableAction,
    // order and size don't affect count, but including them would
    // just cause extra no-op queries — intentionally excluded.
  ]);

  // ── Submit ─────────────────────────────────────────────────
  const [submitState, setSubmitState] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitState(null);
    const fd = buildFormData({
      domains: selectedDomains,
      skills: selectedSkills,
      difficulties: selectedDifficulties,
      scoreBands: selectedScoreBands,
      unansweredOnly,
      order,
      size,
    });
    try {
      const res = await createSessionAction(null, fd);
      // Server Action either redirects (no return value visible) or
      // returns an error shape.
      if (res && !res.ok) setSubmitState(res);
    } catch (err) {
      // next/navigation redirect() throws to interrupt — that's
      // success. Let it propagate so the browser follows the
      // redirect.
      if (isRedirectError(err)) throw err;
      setSubmitState({ ok: false, error: err.message ?? String(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  const actualSize = count == null ? size : Math.min(count, size);
  // CTA count is what the session will actually contain — capped
  // by the filter match count when the pool is smaller than size.
  const ctaCount = count == null
    ? (isCounting ? '…' : '')
    : actualSize.toLocaleString();
  const canSubmit = !isSubmitting && count !== 0;

  const toggleDomain = toggleSetter(setSelectedDomains);
  const toggleSkill = toggleSetter(setSelectedSkills);

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
        <section className={s.testsSection}>
          <div className={s.testsSectionHeader}>
            <div className={s.h2}>Practice tests</div>
            <div className={s.testsHint}>
              Full-length SAT tests, taken under timed conditions.
            </div>
          </div>
          <div className={s.testsList}>
            {tests.map((t) => (
              <a
                key={t.id}
                href={`${basePath}/test/${t.id}`}
                className={s.testCard}
              >
                <div className={s.testCardTop}>
                  <span className={s.testCode}>{t.code}</span>
                  {t.isAdaptive && (
                    <span className={s.testAdaptiveBadge}>Adaptive</span>
                  )}
                </div>
                <div className={s.testName}>{t.name}</div>
                <div className={s.testCardCta}>Start test →</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={onSubmit} className={s.card}>
        <div className={s.filterCardHeader}>
          <div className={s.h2}>Filter question bank</div>
        </div>

        <div className={s.filterDomainCols}>
          <DomainColumn
            title="Math"
            variant="math"
            domains={mathDomains}
            selectedDomains={selectedDomains}
            selectedSkills={selectedSkills}
            onToggleDomain={toggleDomain}
            onToggleSkill={toggleSkill}
          />
          <DomainColumn
            title="Reading & Writing"
            variant="rw"
            domains={rwDomains}
            selectedDomains={selectedDomains}
            selectedSkills={selectedSkills}
            onToggleDomain={toggleDomain}
            onToggleSkill={toggleSkill}
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
            {isSubmitting ? 'Starting…' : 'Start'}
            {ctaCount && <span className={s.startBtnCount}>· {ctaCount} questions</span>}
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

function DomainColumn({
  title,
  variant,
  domains,
  selectedDomains,
  selectedSkills,
  onToggleDomain,
  onToggleSkill,
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
          const on = selectedDomains.has(d.name);
          const cls = [s.domainRow, rowClass, on ? s.on : null].filter(Boolean).join(' ');
          return (
            <div key={d.name}>
              <button
                type="button"
                className={cls}
                aria-pressed={on}
                onClick={() => onToggleDomain(d.name)}
              >
                <span className={s.domainChip}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {}}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span>{d.name}</span>
                  <span className={s.filterCount}>{d.total.toLocaleString()}</span>
                </span>
              </button>
              {on && d.skills.length > 0 && (
                <div className={s.skillsPanel}>
                  {d.skills.map((sk) => {
                    const skOn = selectedSkills.has(sk);
                    const skCls = [s.skillChip, skOn ? s.on : null].filter(Boolean).join(' ');
                    return (
                      <button
                        key={sk}
                        type="button"
                        className={skCls}
                        aria-pressed={skOn}
                        onClick={() => onToggleSkill(sk)}
                      >
                        {sk}
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

function buildFormData({ domains, skills, difficulties, scoreBands, unansweredOnly, order, size }) {
  const fd = new FormData();
  for (const v of domains)      fd.append('domain',     v);
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

// Next.js redirect() signals via a thrown error with a specific
// digest; let it propagate so the browser follows the redirect
// instead of showing an "error" message.
function isRedirectError(err) {
  return err?.digest?.startsWith?.('NEXT_REDIRECT') === true;
}
