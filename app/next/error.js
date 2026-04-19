// Catch-all error boundary for the entire new app tree. Any error
// thrown in a Server Component, Server Action, or client component
// under app/next/** that isn't caught by a more specific segment
// error boundary lands here.
//
// Segment-specific error.js files under (student), (tutor), (admin)
// catch their own tree first; this one is the last resort.

'use client';

import { ErrorScreen } from '@/lib/ui/ErrorScreen';

export default function NextTreeError({ error, reset }) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="Something went wrong"
      homeHref="/"
      homeLabel="Go home"
    />
  );
}
