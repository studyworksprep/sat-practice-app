'use client';

import { ErrorScreen } from '@/lib/ui/ErrorScreen';

export default function TutorSegmentError({ error, reset }) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="Something went wrong"
      homeHref="/tutor/dashboard"
      homeLabel="Back to dashboard"
    />
  );
}
