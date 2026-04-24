// Launch-screen client island for a practice test. Shows the
// test's name + per-module summary, warns about an in-progress
// attempt if any, and hands control to the startTestAttempt
// Server Action on submit — the action creates the attempt row
// and returns { attemptId } which we then route to.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import s from './Launch.module.css';

export function LaunchInteractive({
  test,
  summary,
  inProgress,
  startTestAttemptAction,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  // Extra-time accommodation. Defaults can come in via query params
  // from the compact launcher on /practice/start: ?ext=1&mult=1.5
  // means "open the launch page with 1.5× already selected". Times
  // shown in the module summary below are scaled by the current
  // multiplier so the student sees the clock they'll actually get.
  const initialExt = searchParams?.get('ext') === '1';
  const rawMult = Number(searchParams?.get('mult'));
  const initialMult = rawMult === 2 || rawMult === 1.5 ? rawMult : 1.5;
  const [accommodationOn, setAccommodationOn] = useState(initialExt);
  const [multiplier, setMultiplier] = useState(initialMult);

  const activeMultiplier = accommodationOn ? multiplier : 1;

  // If the student already has an in-progress test attempt, make
  // them confirm before starting — our Server Action will abandon
  // the old one, and we'd rather surface that explicitly.
  const needsConfirm = inProgress != null && !confirmed;

  const totalMinutes = Math.round(
    (summary.reduce((acc, m) => acc + m.timeSeconds, 0) * activeMultiplier) / 60,
  );
  const totalQuestions = summary.reduce((acc, m) => acc + (m.itemCount ?? 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (needsConfirm) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set('testId', test.id);
    if (accommodationOn && multiplier > 1) {
      fd.set('timeMultiplier', String(multiplier));
    }
    try {
      const res = await startTestAttemptAction(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Could not start the test.');
      } else {
        router.push(`/practice/test/attempt/${res.attemptId}`);
      }
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Practice test</div>
        <h1 className={s.h1}>{test.name}</h1>
        <div className={s.sub}>
          {test.code}
          {test.isAdaptive && <span className={s.adaptiveBadge}>Adaptive</span>}
        </div>
      </header>

      <section className={s.card}>
        <div className={s.sectionLabel}>Before you begin</div>
        <ul className={s.rules}>
          <li>
            Each module has its own timer. When the timer runs out,
            the module auto-submits and you move on.
          </li>
          <li>
            You can mark questions for review and revisit them from
            the review page at the end of each module.
          </li>
          <li>
            Leaving the page does not pause the timer, so plan to finish
            the module once you start.
          </li>
          {test.isAdaptive && (
            <li>
              This test is <strong>adaptive</strong>. Your performance
              on module 1 of each section determines which module 2
              you get next.
            </li>
          )}
        </ul>
      </section>

      <section className={s.card}>
        <div className={s.sectionLabel}>
          {totalQuestions} questions · about {totalMinutes} minutes total
        </div>
        <ol className={s.moduleList}>
          {summary.map((m) => (
            <li key={`${m.subject}-${m.moduleNumber}`} className={s.moduleItem}>
              <div className={s.moduleLeft}>
                <div className={s.moduleName}>
                  {subjectName(m.subject)} · Module {m.moduleNumber}
                </div>
                {m.itemCount != null && (
                  <div className={s.moduleMeta}>
                    {m.itemCount} question{m.itemCount === 1 ? '' : 's'}
                  </div>
                )}
              </div>
              <div className={s.moduleTime}>
                {Math.round((m.timeSeconds * activeMultiplier) / 60)} min
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.card}>
        <div className={s.sectionLabel}>Accommodations</div>
        <label className={s.accomRow}>
          <input
            type="checkbox"
            checked={accommodationOn}
            onChange={(e) => setAccommodationOn(e.target.checked)}
          />
          <span>I have an approved extra-time accommodation</span>
        </label>
        {accommodationOn && (
          <div className={s.accomOptions}>
            <label className={s.radioRow}>
              <input
                type="radio"
                name="multiplier"
                checked={multiplier === 1.5}
                onChange={() => setMultiplier(1.5)}
              />
              <span>
                <strong>1.5× time</strong> — Standard extended time
              </span>
            </label>
            <label className={s.radioRow}>
              <input
                type="radio"
                name="multiplier"
                checked={multiplier === 2}
                onChange={() => setMultiplier(2)}
              />
              <span>
                <strong>2× time</strong> — Double time
              </span>
            </label>
          </div>
        )}
      </section>

      {inProgress && (
        <section className={`${s.card} ${s.warnCard}`}>
          <div className={s.warnTitle}>
            {inProgress.sameTest
              ? 'You already have this test in progress.'
              : 'You have a different test in progress.'}
          </div>
          <div className={s.warnBody}>
            Starting now will abandon that attempt — its answers
            will stay on your record but you won&apos;t be able to
            resume it. Or{' '}
            <Link
              href={`/practice/test/attempt/${inProgress.attemptId}`}
              className={s.warnLink}
            >
              resume the existing attempt
            </Link>
            .
          </div>
          {!confirmed && (
            <label className={s.confirmRow}>
              <input
                type="checkbox"
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I understand — abandon the existing attempt
            </label>
          )}
        </section>
      )}

      <form onSubmit={handleSubmit} className={s.actions}>
        <Link href="/practice/start" className={s.backLink}>
          ← Cancel
        </Link>
        <button
          type="submit"
          className={s.beginBtn}
          disabled={submitting || needsConfirm}
        >
          {submitting ? 'Starting…' : 'Begin test'}
        </button>
        {error && <p className={s.error}>{error}</p>}
      </form>
    </main>
  );
}

function subjectName(code) {
  if (code === 'RW') return 'Reading & Writing';
  if (code === 'MATH') return 'Math';
  return code;
}
