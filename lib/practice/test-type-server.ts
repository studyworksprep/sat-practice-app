// Server-side read of the student's SAT/ACT preference. Split from
// test-type-preference.ts so that module stays importable under
// `node --test` and from client components (no next/headers).

import { cookies } from 'next/headers';
import { pickTestType, TEST_TYPE_COOKIE } from './test-type-preference';
import type { TestType } from './test-type-preference';

/** Resolve the test a practice surface should show: `?test=` first,
 *  then the sidebar preference cookie, then SAT. */
export async function resolveTestType(param: unknown): Promise<TestType> {
  const store = await cookies();
  return pickTestType(param, store.get(TEST_TYPE_COOKIE)?.value);
}

/** The stored preference alone (the sidebar switch's initial state). */
export async function storedTestType(): Promise<TestType> {
  const store = await cookies();
  return pickTestType(null, store.get(TEST_TYPE_COOKIE)?.value);
}
