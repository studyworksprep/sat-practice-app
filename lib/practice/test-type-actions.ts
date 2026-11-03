'use server';

// Form action behind the sidebar's SAT/ACT switch. It is a plain
// <form action> (like the dashboard's task-actions), so the switch works
// before hydration too. Writing the cookie from a Server Action makes
// Next re-render the current route; when the URL carried a `?test=` that
// now contradicts the choice, the form sends the same path without it
// and we redirect there.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import {
  parseTestType,
  TEST_TYPE_COOKIE,
  TEST_TYPE_COOKIE_MAX_AGE,
} from './test-type-preference';

/** Only same-origin app paths — never `//host` or a full URL. */
function safeReturnPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

export async function switchTestType(formData: FormData): Promise<void> {
  try {
    await requireUser();
  } catch {
    redirect('/login');
  }
  const testType = parseTestType(formData.get('test'));
  if (!testType) return;

  const store = await cookies();
  store.set(TEST_TYPE_COOKIE, testType, {
    path: '/',
    maxAge: TEST_TYPE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });

  const returnTo = safeReturnPath(formData.get('return_to'));
  if (returnTo) redirect(returnTo);
}
