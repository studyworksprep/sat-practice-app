// Student sidebar SAT/ACT switch — one control for every practice
// surface, replacing the per-page "Choose a test" cards.
//
// The stored preference arrives from the layout (cookie); an explicit
// `?test=` in the URL overrides it for display, exactly as the pages
// resolve it (lib/practice/test-type-server.ts). Each option is a submit
// button in a plain <form action> posting to a Server Action, so a click
// works even before hydration. When the URL's `?test=` would contradict
// the new choice, the form also sends the same path without it.

'use client';

import { useFormStatus } from 'react-dom';
import { usePathname, useSearchParams } from 'next/navigation';
import { switchTestType } from '@/lib/practice/test-type-actions';
import { pickTestType } from '@/lib/practice/test-type-preference';
import type { TestType } from '@/lib/practice/test-type-preference';
import s from './SidebarTestSwitch.module.css';

const TESTS: readonly TestType[] = ['sat', 'act'];

export function SidebarTestSwitch({ stored }: { stored: TestType }) {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const param = searchParams?.get('test') ?? null;
  const current = pickTestType(param, stored);

  let returnTo: string | null = null;
  if (param) {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('test');
    const qs = next.toString();
    returnTo = qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <form action={switchTestType}>
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <SwitchButtons shown={current} interactive />
    </form>
  );
}

/** Suspense fallback while the URL is resolving: the stored choice,
 *  not yet clickable. */
export function SidebarTestSwitchFallback({ stored }: { stored: TestType }) {
  return <SwitchButtons shown={stored} interactive={false} />;
}

function SwitchButtons({ shown, interactive }: { shown: TestType; interactive: boolean }) {
  const { pending, data } = useFormStatus();
  // While the post is in flight, show the choice being made.
  const pendingChoice = pending ? pickTestType(data?.get('test'), shown) : shown;
  return (
    <div className={s.switch} role="group" aria-label="Test you're studying for" aria-busy={pending}>
      {TESTS.map((test) => (
        <button
          key={test}
          type={interactive ? 'submit' : 'button'}
          name="test"
          value={test}
          className={test === pendingChoice ? `${s.option} ${s.active}` : s.option}
          aria-pressed={test === pendingChoice}
          disabled={!interactive}
        >
          {test.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
