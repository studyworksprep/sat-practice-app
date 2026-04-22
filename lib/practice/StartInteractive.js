// Practice-start client island. Filter form with live "questions
// available" count + session generator. Filters are checkbox /
// radio groups keyed off the domain/skill/score_band lookup the
// Server Component provides; submission flows through the
// createSession Server Action into a new practice_sessions row.
//
// Live count is a separate Server Action (countAvailable) that
// runs the same filter query without inserting anything. Called
// on mount and whenever a filter changes, debounced by 400ms so
// rapid clicking doesn't thrash the endpoint.
//
// Fixed-list philosophy (see actions.js): every session is a
// pre-determined walk through a known list. The practice page
// itself never sees the filter state — it just loads
// question_ids[position].

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import s from './StartInteractive.module.css';

const MIN_SIZE = 1;
const MAX_SIZE = 50;
const DEFAULT_SIZE = 10;

const DIFFICULTY_OPTIONS = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Hard' },
];

const ORDER_OPTIONS = [
  { value: 'display_code', label: 'Database order (M-00001 → …)' },
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

  // Skill options depend on which domains are selected. When no
  // domains are selected, show skills across all domains.
  const skillOptions = useMemo(() => {
    const set = new Map();
    for (const d of domains) {
      const relevant = selectedDomains.size === 0 || selectedDomains.has(d.name);
      if (!relevant) continue;
      for (const sk of d.skills) set.set(sk, sk);
    }
    return Array.from(set.keys()).sort();
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

  return (
    <main className={s.main}>
      <h1 className={s.h1}>Practice</h1>
      <p className={s.sub}>
        Pick filters and a size, then start. Every session is a fixed
        walk through the questions it generates — you can close the
        tab and pick back up later.
      </p>

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

      <form onSubmit={onSubmit} className={s.form}>
        <CheckboxGroup
          legend="Domains"
          name="domain"
          options={domains.map((d) => ({ value: d.name, label: d.name }))}
          selected={selectedDomains}
          onToggle={toggleSetter(setSelectedDomains)}
          emptyNote="No domains available."
        />

        {skillOptions.length > 0 && (
          <CheckboxGroup
            legend={selectedDomains.size === 0 ? 'Skills (all domains)' : 'Skills'}
            name="skill"
            options={skillOptions.map((sk) => ({ value: sk, label: sk }))}
            selected={selectedSkills}
            onToggle={toggleSetter(setSelectedSkills)}
          />
        )}

        <CheckboxGroup
          legend="Difficulty"
          name="difficulty"
          options={DIFFICULTY_OPTIONS}
          selected={selectedDifficulties}
          onToggle={toggleSetter(setSelectedDifficulties)}
        />

        {scoreBands.length > 0 && (
          <CheckboxGroup
            legend="Score band"
            name="score_band"
            options={scoreBands.map((b) => ({ value: b, label: String(b) }))}
            selected={selectedScoreBands}
            onToggle={toggleSetter(setSelectedScoreBands)}
          />
        )}

        <fieldset className={s.fieldset}>
          <legend className={s.legend}>Options</legend>
          <label className={s.checkItem}>
            <input
              type="checkbox"
              checked={unansweredOnly}
              onChange={(e) => setUnansweredOnly(e.target.checked)}
            />
            <span>Only questions I haven&apos;t answered yet</span>
          </label>
          <label className={`${s.checkItem} ${s.checkItemSpaced}`}>
            <span>Order</span>
            <select value={order} onChange={(e) => setOrder(e.target.value)} className={s.select}>
              {ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className={s.fieldset}>
          <legend className={s.legend}>Session size</legend>
          <input
            type="number"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={size}
            onChange={(e) => setSize(clampSize(e.target.value))}
            className={s.sizeInput}
          />
          <div className={s.countLine} aria-live="polite">
            {isCounting && count == null && 'Loading count…'}
            {countErr && <span className={s.countError}>{countErr}</span>}
            {count != null && !countErr && (
              <>
                <strong>{count.toLocaleString()}</strong> question{count === 1 ? '' : 's'} match
                {isCounting ? ' (updating…)' : ''}.{' '}
                {count < size
                  ? <span className={s.countShort}>Session will contain {actualSize}.</span>
                  : <span className={s.countOk}>Session will contain {actualSize}.</span>}
              </>
            )}
          </div>
        </fieldset>

        <Button type="submit" disabled={isSubmitting || count === 0} className={s.submit}>
          {isSubmitting ? 'Starting…' : 'Start session'}
        </Button>

        {submitState && !submitState.ok && (
          <p role="alert" className={s.error}>{submitState.error}</p>
        )}
      </form>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function CheckboxGroup({ legend, name, options, selected, onToggle, emptyNote }) {
  return (
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>{legend}</legend>
      <div className={s.checkList}>
        {options.length === 0 && emptyNote && <p className={s.emptyNote}>{emptyNote}</p>}
        {options.map((o) => (
          <label key={String(o.value)} className={s.checkItem}>
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={selected.has(o.value)}
              onChange={() => onToggle(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
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
