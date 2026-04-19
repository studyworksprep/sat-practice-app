'use client';

import { ErrorScreen } from '@/lib/ui/ErrorScreen';

export default function StudentSegmentError({ error, reset }) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="Something went wrong"
      homeHref="/dashboard"
      homeLabel="Back to dashboard"
    />
  );
}
