// "Practice this now" — the completion banner's primary CTA (plan 5.2).
// Sibling in spirit to the Review page's SkillDrillButton: a tiny
// client island whose action builds a practice session over the
// lesson's own pattern/skill and redirects into the runner.
//
// A form rather than a link because starting a drill writes a
// practice_sessions row; a GET href would let a prefetch or a crawler
// create sessions.

'use client';

import { useActionState } from 'react';

import s from '@/lib/ui/LessonSlideshow.module.css';

export function LessonPracticeButton({ action, label = 'Practice this now →' }) {
  const [state, submitAction, isPending] = useActionState(action, null);
  return (
    <>
      <form action={submitAction}>
        <button type="submit" className={s.completeCta} disabled={isPending}>
          {isPending ? 'Starting…' : label}
        </button>
      </form>
      {state && !state.ok && (
        <span role="alert" className={s.completePracticeError}>
          {state.error}
        </span>
      )}
    </>
  );
}
