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
  const [skillsOpen,            setSkillsOpen]            = useState(false);

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

  // Skill options depend on which domains are selected. When no
  // domains are selected, show skills across all domains.
  const skillOptions = useMemo(() => {
    const set = new Set();
    for (const d of domains) {
      const relevant = selectedDomains.size === 0 || selectedDomains.has(d.name);
      if (!relevant) continue;
      for (const sk of d.skills) set.add(sk);
    }
    return Array.from(set).sort();
  }, [domains, selectedDomains]);

  // If the domain selection changes and causes some selected
  // skills to leave skillOptions, drop them.
  useEffect(() => {
    const valid = new Set(skillOptions);
    setSelectedSkills((prev) => {
      const next = new Set();
      for (const sk of prev) if (valid.has(sk)) next.add(sk);
      return next.size === prev.size ? prev : next;
    });
  }, [skillOptions]);

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
  const ctaCount = count == null
    ? (isCounting ? '…' : '')
    : count.toLocaleString();
  const canSubmit = !isSubmitting && count !== 0;

  return (
    <main className={s.container}>
      <div>
        <h1 className={s.h1}>Practice</h1>
        <p className={s.sub}>
          Pick filters, then start. Every session is a fixed walk
          through the questions it generates — close the tab and pick
          back up later.
        </p>
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

      <form onSubmit={onSubmit} className={s.card}>
        <div className={s.filterCardHeader}>
          <div className={s.h2}>Filter question bank</div>
          <button type="submit" className={s.startBtn} disabled={!canSubmit}>
            {isSubmitting ? 'Starting…' : 'Start'}
            {ctaCount && <span className={s.startBtnCount}>· {ctaCount} questions</span>}
          </button>
        </div>

        <div className={s.filterDomainCols}>
          <DomainColumn
            title="Math"
            variant="math"
            domains={mathDomains}
            selected={selectedDomains}
            onToggle={toggleSetter(setSelectedDomains)}
          />
          <DomainColumn
            title="Reading & Writing"
            variant="rw"
            domains={rwDomains}
            selected={selectedDomains}
            onToggle={toggleSetter(setSelectedDomains)}
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

        <div className={s.skillsHeader}>
          <button
            type="button"
            className={s.skillsToggle}
            onClick={() => setSkillsOpen((v) => !v)}
            aria-expanded={skillsOpen}
          >
            {skillsOpen ? '−' : '+'} Skills
            {selectedSkills.size > 0 && ` (${selectedSkills.size})`}
          </button>
        </div>
        {skillsOpen && (
          <div className={s.skillsPanel}>
            {skillOptions.length === 0
              ? <p className={s.skillsEmpty}>No skills available for the current selection.</p>
              : skillOptions.map((sk) => {
                  const on = selectedSkills.has(sk);
                  const cls = [s.chip, on ? s.on : null].filter(Boolean).join(' ');
                  return (
                    <button
                      key={sk}
                      type="button"
                      className={cls}
                      aria-pressed={on}
                      onClick={() => toggleSetter(setSelectedSkills)(sk)}
                    >
                      {sk}
                    </button>
                  );
                })}
          </div>
        )}

        <div className={s.secondaryRow}>
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
        </div>

        <div className={s.countLine} aria-live="polite">
          {countErr && <span className={s.error}>{countErr}</span>}
          {count != null && !countErr && count < size && (
            <span className={s.countShort}>
              Session will contain {actualSize} (fewer than {size} match).
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

function DomainColumn({ title, variant, domains, selected, onToggle }) {
  const rowClass = variant === 'math' ? s.domainRowMath : s.domainRowRw;
  return (
    <div>
      <div className={s.filterSectionLabel}>{title}</div>
      <div className={s.domainGroup}>
        {domains.length === 0 && (
          <p className={s.skillsEmpty}>No domains.</p>
        )}
        {domains.map((d) => {
          const on = selected.has(d.name);
          const cls = [s.domainRow, rowClass, on ? s.on : null].filter(Boolean).join(' ');
          return (
            <button
              key={d.name}
              type="button"
              className={cls}
              aria-pressed={on}
              onClick={() => onToggle(d.name)}
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
